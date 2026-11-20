//! The personalized Developer Disk Image on a computer without Xcode (architecture 7.1): the three files of Xcode's
//! iOS DDI, from a folder the person names or downloaded once from a pinned commit of doronz88/DeveloperDiskImage
//! (the copy pymobiledevice3 uses) when the person asks for it, checked against their SHA-256 and kept under the
//! phonedriver home.

use std::path::{Path, PathBuf};

use phonedriver_core::error::Error;
use sha2::{Digest, Sha256};

pub const REPOSITORY: &str = "doronz88/DeveloperDiskImage";
/// "maintenance: Update DDIs to `27B52`", the image of Xcode 27.2, 2026-11-11.
pub const COMMIT: &str = "dcec53989fa57695c2b3d3e11c2585f4735b2fef";
const FOLDER: &str = "PersonalizedImages/Xcode_iOS_DDI_Personalized";

pub const IMAGE: &str = "Image.dmg";
pub const TRUST_CACHE: &str = "Image.dmg.trustcache";
pub const MANIFEST: &str = "BuildManifest.plist";

/// SHA-256 of each file at `COMMIT`, taken when the commit was pinned (2026-11-20).
const PINNED: [(&str, &str); 3] = [
    (
        MANIFEST,
        "3c4eee2be4a0a853044dc32dbbd62699302b1dfd317aaf4f1cf36368b7639bb0",
    ),
    (
        IMAGE,
        "0de55b0ccde9d5790c9c9f4e1a413225443fce7ea75acb503aca11e7d8156646",
    ),
    (
        TRUST_CACHE,
        "f0fb56da2829f69b8aae113584349635738e68d77c82a726ed72040890f16bf4",
    ),
];

/// A folder that holds the three files.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Files(pub PathBuf);

impl Files {
    pub fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    pub fn read(&self, name: &str) -> Result<Vec<u8>, Error> {
        let path = self.path(name);
        std::fs::read(&path).map_err(|e| Error::Transport {
            detail: format!("cannot read {}: {e}", path.display()),
        })
    }
}

/// Where the source is, as the person is told before anything is downloaded.
pub fn source() -> String {
    format!("github.com/{REPOSITORY} at commit {}", &COMMIT[..7])
}

pub fn url(name: &str) -> String {
    format!("https://raw.githubusercontent.com/{REPOSITORY}/{COMMIT}/{FOLDER}/{name}")
}

/// `dir` as the person gave it, after checking it holds the three files. Their hashes are not checked: a newer Xcode
/// has a newer image.
pub fn in_dir(dir: &Path) -> Result<Files, Error> {
    for (name, _) in PINNED {
        if !dir.join(name).is_file() {
            return Err(Error::Transport {
                detail: format!(
                    "{} has no {name}; give the folder that holds {MANIFEST}, {IMAGE} and {TRUST_CACHE}",
                    dir.display()
                ),
            });
        }
    }
    Ok(Files(dir.to_path_buf()))
}

fn cache_dir(home: &Path) -> PathBuf {
    home.join("ddi").join(&COMMIT[..12])
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn holds(dir: &Path, files: &[(&str, &str)]) -> bool {
    files.iter().all(|(name, hash)| {
        std::fs::read(dir.join(name)).is_ok_and(|bytes| sha256_hex(&bytes) == *hash)
    })
}

/// The files an earlier download left under `home`, if every one is still the pinned one.
pub fn cached(home: &Path) -> Option<Files> {
    let dir = cache_dir(home);
    holds(&dir, &PINNED).then_some(Files(dir))
}

/// Downloads the pinned files into `home` with `curl` (Windows 10 and later, macOS and Linux all ship it) and checks
/// each against its hash. Only `phonedriver ios setup --download-ddi` calls this.
pub async fn download(home: &Path) -> Result<Files, Error> {
    let dir = cache_dir(home);
    let failed = |detail: String| Error::Transport { detail };
    std::fs::create_dir_all(&dir)
        .map_err(|e| failed(format!("cannot create {}: {e}", dir.display())))?;
    for (name, hash) in PINNED {
        let file = dir.join(name);
        if holds(&dir, &[(name, hash)]) {
            continue;
        }
        let part = dir.join(format!("{name}.part"));
        let out = tokio::process::Command::new("curl")
            .args(["--fail", "--silent", "--show-error", "--location"])
            .args(["--proto", "=https", "--output"])
            .arg(&part)
            .arg(url(name))
            .output()
            .await
            .map_err(|e| failed(format!("cannot run curl: {e}")))?;
        if !out.status.success() {
            let _ = std::fs::remove_file(&part);
            return Err(failed(format!(
                "downloading {name} from {} failed: {}",
                source(),
                String::from_utf8_lossy(&out.stderr).trim()
            )));
        }
        let got = std::fs::read(&part)
            .map(|bytes| sha256_hex(&bytes))
            .unwrap_or_default();
        if got != hash {
            let _ = std::fs::remove_file(&part);
            return Err(failed(format!(
                "{name} from {} is not the pinned file (SHA-256 {got}, expected {hash}); nothing was mounted",
                source()
            )));
        }
        std::fs::rename(&part, &file)
            .map_err(|e| failed(format!("cannot write {}: {e}", file.display())))?;
    }
    Ok(Files(dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_file_comes_from_the_pinned_commit_over_https() {
        assert_eq!(
            url(IMAGE),
            "https://raw.githubusercontent.com/doronz88/DeveloperDiskImage/dcec53989fa57695c2b3d3e11c2585f4735b2fef/PersonalizedImages/Xcode_iOS_DDI_Personalized/Image.dmg"
        );
        assert_eq!(
            source(),
            "github.com/doronz88/DeveloperDiskImage at commit dcec539"
        );
    }

    #[test]
    fn a_cache_counts_only_when_every_file_has_its_pinned_hash() {
        let dir = tempfile::tempdir().unwrap();
        let hello = sha256_hex(b"hello");
        let files = [("a", hello.as_str()), ("b", hello.as_str())];
        assert!(!holds(dir.path(), &files));
        std::fs::write(dir.path().join("a"), "hello").unwrap();
        std::fs::write(dir.path().join("b"), "hellO").unwrap();
        assert!(!holds(dir.path(), &files));
        std::fs::write(dir.path().join("b"), "hello").unwrap();
        assert!(holds(dir.path(), &files));
    }

    #[test]
    fn nothing_is_cached_in_a_fresh_home() {
        let home = tempfile::tempdir().unwrap();
        assert_eq!(cached(home.path()), None);
    }

    #[test]
    fn a_folder_the_person_names_must_hold_all_three_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(MANIFEST), "x").unwrap();
        std::fs::write(dir.path().join(IMAGE), "x").unwrap();
        let e = in_dir(dir.path()).unwrap_err();
        assert!(
            matches!(&e, Error::Transport { detail } if detail.contains("has no Image.dmg.trustcache")),
            "{e:?}"
        );
        std::fs::write(dir.path().join(TRUST_CACHE), "x").unwrap();
        assert_eq!(in_dir(dir.path()).unwrap(), Files(dir.path().to_path_buf()));
    }
}
