//! The apps phonedriver installed on each physical device, in `installed.json` under the daemon's home (decision D19).

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// One app phonedriver installed. `installed_at` is the device's token for that install; without one (a record from
/// before installs were identified) the id alone counts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(from = "Stored")]
pub struct Entry {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Stored {
    Package(String),
    Install {
        id: String,
        #[serde(default)]
        installed_at: Option<String>,
    },
}

impl From<Stored> for Entry {
    fn from(stored: Stored) -> Entry {
        match stored {
            Stored::Package(id) => Entry {
                id,
                installed_at: None,
            },
            Stored::Install { id, installed_at } => Entry { id, installed_at },
        }
    }
}

/// Every device's entries in one file, read and rewritten under one lock because the daemon's device actors share it.
pub struct Ledger {
    path: PathBuf,
    held: Mutex<()>,
    under_test: Vec<String>,
}

impl Ledger {
    pub fn new(home: &std::path::Path) -> Ledger {
        Ledger {
            path: home.join("installed.json"),
            held: Mutex::new(()),
            under_test: Vec::new(),
        }
    }

    pub fn with_apps_under_test(mut self, packages: Vec<String>) -> Ledger {
        self.under_test = packages;
        self
    }

    /// Whether the person listed this package as an app under test, which makes it theirs to clear, remove and
    /// change the permissions of without phonedriver having installed it.
    pub fn is_under_test(&self, package: &str) -> bool {
        self.under_test.iter().any(|p| p == package)
    }

    pub fn entries(&self, device: &str) -> Result<Vec<Entry>, String> {
        let _held = self.held.lock().unwrap_or_else(|e| e.into_inner());
        Ok(self.read()?.remove(device).unwrap_or_default())
    }

    /// Lets `change` edit the device's entries and writes the file back when it changed them.
    pub fn update(&self, device: &str, change: impl FnOnce(&mut Vec<Entry>)) -> Result<(), String> {
        let _held = self.held.lock().unwrap_or_else(|e| e.into_inner());
        let mut all = self.read()?;
        let mine = all.entry(device.to_string()).or_default();
        let before = mine.clone();
        change(mine);
        if *mine == before {
            return Ok(());
        }
        let text = serde_json::to_string(&all).map_err(|e| self.failed("write", e))?;
        if let Some(folder) = self.path.parent() {
            std::fs::create_dir_all(folder).map_err(|e| self.failed("write", e))?;
        }
        let beside = self.path.with_extension("json.tmp");
        std::fs::write(&beside, text)
            .and_then(|()| std::fs::rename(&beside, &self.path))
            .map_err(|e| self.failed("write", e))
    }

    fn read(&self) -> Result<BTreeMap<String, Vec<Entry>>, String> {
        match std::fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| {
                format!(
                    "{} is not a record phonedriver can read ({e}); fix or delete it",
                    self.path.display()
                )
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(self.failed("read", e)),
        }
    }

    fn failed(&self, verb: &str, why: impl std::fmt::Display) -> String {
        format!("cannot {verb} {}: {why}", self.path.display())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{Entry, Ledger};

    fn entry(id: &str) -> Entry {
        Entry {
            id: id.into(),
            installed_at: None,
        }
    }

    #[test]
    fn devices_writing_at_the_same_time_do_not_lose_each_others_entries() {
        let home = tempfile::tempdir().unwrap();
        let ledger = Arc::new(Ledger::new(home.path()));
        let writers: Vec<_> = (0..8)
            .map(|device| {
                let ledger = ledger.clone();
                std::thread::spawn(move || {
                    for app in 0..25 {
                        ledger
                            .update(&format!("android:{device}"), |l| {
                                l.push(entry(&format!("com.example.a{app}")))
                            })
                            .unwrap();
                    }
                })
            })
            .collect();
        for w in writers {
            w.join().unwrap();
        }
        for device in 0..8 {
            assert_eq!(
                ledger.entries(&format!("android:{device}")).unwrap().len(),
                25
            );
        }
    }

    #[test]
    fn a_package_name_from_the_old_record_reads_as_an_entry_without_a_token() {
        let home = tempfile::tempdir().unwrap();
        std::fs::write(
            home.path().join("installed.json"),
            r#"{"android:R5":["com.a",{"id":"com.b","installed_at":"t"}]}"#,
        )
        .unwrap();
        let entries = Ledger::new(home.path()).entries("android:R5").unwrap();
        assert_eq!(
            entries,
            [
                entry("com.a"),
                Entry {
                    id: "com.b".into(),
                    installed_at: Some("t".into())
                }
            ]
        );
    }
}
