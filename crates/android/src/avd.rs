//! Android Virtual Devices on this machine: which exist, and where the `emulator` program that starts them is.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Avd {
    pub name: String,
    /// The API level of its system image, as its `.ini` gives it: `37.0`, `26`.
    pub api: Option<String>,
}

fn user_home(env: &dyn Fn(&str) -> Option<OsString>) -> Option<PathBuf> {
    env("HOME")
        .or_else(|| env("USERPROFILE"))
        .map(PathBuf::from)
}

/// The folder the AVDs are in: `ANDROID_AVD_HOME`, else `avd` under `ANDROID_USER_HOME`, else `.android/avd`
/// under the user's home.
pub fn home(env: &dyn Fn(&str) -> Option<OsString>) -> Option<PathBuf> {
    if let Some(dir) = env("ANDROID_AVD_HOME") {
        return Some(dir.into());
    }
    if let Some(dir) = env("ANDROID_USER_HOME") {
        return Some(PathBuf::from(dir).join("avd"));
    }
    Some(user_home(env)?.join(".android").join("avd"))
}

/// The AVDs in `home`, newest system first, from each `<name>.ini` and its `target=android-37.0` line.
pub fn list(home: &Path) -> Vec<Avd> {
    let level = |a: &Avd| -> Vec<u32> {
        a.api
            .iter()
            .flat_map(|api| api.split('.'))
            .filter_map(|n| n.parse().ok())
            .collect()
    };
    let mut avds: Vec<Avd> = std::fs::read_dir(home)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|e| e == "ini"))
        .filter_map(|path| {
            let name = path.file_stem()?.to_str()?.to_string();
            let ini = std::fs::read_to_string(&path).ok()?;
            let api = ini
                .lines()
                .find_map(|l| l.trim().strip_prefix("target=android-"))
                .map(str::to_string);
            Some(Avd { name, api })
        })
        .collect();
    avds.sort_by(|a, b| level(b).cmp(&level(a)).then_with(|| a.name.cmp(&b.name)));
    avds
}

/// The `emulator` program: in the SDK the environment names (`ANDROID_HOME`, then `ANDROID_SDK_ROOT`), else in the
/// SDK where Android Studio installs it, else on the `PATH`.
pub fn emulator(env: &dyn Fn(&str) -> Option<OsString>) -> Option<PathBuf> {
    let program = if cfg!(windows) {
        "emulator.exe"
    } else {
        "emulator"
    };
    let studio = if cfg!(target_os = "macos") {
        user_home(env).map(|h| h.join("Library/Android/sdk"))
    } else if cfg!(windows) {
        env("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Android").join("Sdk"))
    } else {
        user_home(env).map(|h| h.join("Android/Sdk"))
    };
    let sdks = ["ANDROID_HOME", "ANDROID_SDK_ROOT"]
        .into_iter()
        .filter_map(env)
        .map(PathBuf::from)
        .chain(studio)
        .map(|sdk| sdk.join("emulator"));
    let path = env("PATH");
    let on_path = path.iter().flat_map(std::env::split_paths);
    sdks.chain(on_path)
        .map(|dir| dir.join(program))
        .find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env<'a>(vars: &'a [(&'a str, &'a Path)]) -> impl Fn(&str) -> Option<OsString> + 'a {
        move |name| {
            vars.iter()
                .find(|(n, _)| *n == name)
                .map(|(_, v)| v.as_os_str().to_os_string())
        }
    }

    #[test]
    fn the_avd_folder_is_the_one_the_environment_names_then_the_one_under_the_users_home() {
        let (avd, user, me) = (Path::new("/avds"), Path::new("/droid"), Path::new("/me"));
        assert_eq!(
            home(&env(&[
                ("ANDROID_AVD_HOME", avd),
                ("ANDROID_USER_HOME", user),
                ("HOME", me)
            ])),
            Some(avd.to_path_buf())
        );
        assert_eq!(
            home(&env(&[("ANDROID_USER_HOME", user), ("HOME", me)])),
            Some(user.join("avd"))
        );
        assert_eq!(
            home(&env(&[("USERPROFILE", me)])),
            Some(me.join(".android").join("avd"))
        );
        assert_eq!(home(&env(&[])), None);
    }

    #[test]
    fn avds_are_read_from_their_ini_files_newest_system_first() {
        let dir = tempfile::tempdir().unwrap();
        let ini = |name: &str, target: &str| {
            let text = format!(
                "avd.ini.encoding=UTF-8\r\npath=C:\\Users\\me\\.android\\avd\\{name}.avd\r\n{target}\r\n"
            );
            std::fs::write(dir.path().join(format!("{name}.ini")), text).unwrap();
        };
        ini("Pixel_API_26", "target=android-26");
        ini("Pixel_Tablet_API_37", "target=android-37.0");
        ini("Pixel_API_37", "target=android-37.0");
        ini("Odd", "");
        std::fs::create_dir(dir.path().join("Pixel_API_37.avd")).unwrap();
        let found: Vec<(String, Option<String>)> = list(dir.path())
            .into_iter()
            .map(|a| (a.name, a.api))
            .collect();
        assert_eq!(
            found,
            [
                ("Pixel_API_37".to_string(), Some("37.0".to_string())),
                ("Pixel_Tablet_API_37".to_string(), Some("37.0".to_string())),
                ("Pixel_API_26".to_string(), Some("26".to_string())),
                ("Odd".to_string(), None),
            ]
        );
        assert_eq!(list(&dir.path().join("missing")), vec![]);
    }

    #[test]
    fn the_emulator_is_the_one_in_the_sdk_the_environment_names_else_one_on_the_path() {
        let program = if cfg!(windows) {
            "emulator.exe"
        } else {
            "emulator"
        };
        let dir = tempfile::tempdir().unwrap();
        let sdk = dir.path().join("sdk");
        let bin = dir.path().join("bin");
        for d in [sdk.join("emulator"), bin.clone()] {
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join(program), "").unwrap();
        }
        let empty = dir.path().join("empty");
        assert_eq!(
            emulator(&env(&[
                ("ANDROID_HOME", &empty),
                ("ANDROID_SDK_ROOT", &sdk),
                ("PATH", &bin)
            ])),
            Some(sdk.join("emulator").join(program))
        );
        assert_eq!(
            emulator(&env(&[("HOME", &empty), ("PATH", &bin)])),
            Some(bin.join(program))
        );
        assert_eq!(emulator(&env(&[("HOME", &empty)])), None);
    }
}
