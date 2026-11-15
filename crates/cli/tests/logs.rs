use std::sync::Arc;

use async_trait::async_trait;
use phonedriver::daemon::rpc::RpcError;
use phonedriver::daemon::{Config, Daemon, DeviceSource, Listed};
use phonedriver_core::device::{AppId, Capabilities, Device, LogReply};
use phonedriver_core::error::Error;
use phonedriver_core::geometry::Scale;
use phonedriver_core::raw::RawTree;
use phonedriver_core::testing::{Call, FakeDevice};
use serde_json::{Value, json};

struct One(Arc<FakeDevice>);

#[async_trait]
impl DeviceSource for One {
    async fn list(&self) -> Result<Vec<Listed>, Error> {
        Ok(vec![Listed {
            id: "fake:1".into(),
            model: "Fake".into(),
            os: None,
            tier: "fake".into(),
            capabilities: self.0.info().capabilities,
        }])
    }
    async fn connect(&self, _id: &str) -> Result<Arc<dyn Device>, Error> {
        Ok(self.0.clone())
    }
}

fn screen(package: &str, label: &str) -> RawTree {
    let json = format!(
        r#"{{"windows":[{{"id":1,"type":"application","package":"{package}","bounds":[0,0,360,800]}}],"nodes":[
        {{"p":-1,"w":1,"cls":"android.widget.FrameLayout","b":[0,0,360,800],"f":"vVe"}},
        {{"p":0,"w":1,"cls":"android.widget.Button","text":"{label}","b":[0,100,360,160],"f":"vVe","a":["tap"]}}]}}"#
    );
    RawTree::from_android_json(&json, Scale { density: 1.0 }).unwrap()
}

const CRASH: &str = "java.lang.IllegalStateException: boom at com.example.Main.onClick(Main.kt:12)";

fn setup(
    mut trees: Vec<RawTree>,
    logs: Option<LogReply>,
) -> (Arc<Daemon>, Arc<FakeDevice>, tempfile::TempDir) {
    let after_tap = (trees.len() > 1).then(|| trees.split_off(1));
    let fake = Arc::new(FakeDevice::new(trees).lacking(Capabilities::FRAMES));
    if let Some(next) = after_tap {
        fake.on_gesture(move |_| Some(next.clone()));
    }
    if let Some(reply) = logs {
        fake.answer_logs(reply);
    }
    let home = tempfile::tempdir().unwrap();
    let d = Daemon::new(
        Arc::new(One(fake.clone())),
        Config {
            home: home.path().to_path_buf(),
        },
    );
    (d, fake, home)
}

async fn ok(d: &Daemon, method: &str, params: Value) -> Value {
    d.call("default", method, params)
        .await
        .unwrap_or_else(|e| panic!("{method} failed: {e:?}"))
}

async fn err(d: &Daemon, method: &str, params: Value) -> RpcError {
    d.call("default", method, params)
        .await
        .expect_err("expected an error")
}

fn tap(text: &str) -> Value {
    json!({"action": {"kind": "tap", "target": {"text": text}}})
}

fn log_reads(fake: &FakeDevice) -> Vec<Call> {
    fake.calls()
        .into_iter()
        .filter(|c| matches!(c, Call::Logs(..)))
        .collect()
}

fn crashed() -> LogReply {
    LogReply {
        text: String::new(),
        crash: Some(CRASH.into()),
    }
}

#[tokio::test(start_paused = true)]
async fn a_tap_that_crashes_the_app_says_so_in_its_reply() {
    let (d, fake, _home) = setup(
        vec![
            screen("com.example", "Crash"),
            screen("com.launcher", "Apps"),
        ],
        Some(crashed()),
    );
    ok(&d, "snapshot", json!({})).await;
    let r = ok(&d, "act", tap("Crash")).await;
    assert_eq!(r["crashed"], json!({"app": "com.example", "what": CRASH}));
    assert_eq!(
        log_reads(&fake),
        [Call::Logs(AppId("com.example".into()), true)]
    );
}

#[tokio::test(start_paused = true)]
async fn a_new_screen_with_no_crash_in_the_log_says_nothing() {
    let (d, fake, _home) = setup(
        vec![
            screen("com.example", "Next"),
            screen("com.example", "Page two"),
        ],
        Some(LogReply::default()),
    );
    ok(&d, "snapshot", json!({})).await;
    let r = ok(&d, "act", tap("Next")).await;
    assert!(r.get("crashed").is_none(), "{r}");
    assert_eq!(log_reads(&fake).len(), 1);
}

#[tokio::test(start_paused = true)]
async fn an_action_that_keeps_the_screen_and_a_launch_do_not_read_the_crash_log() {
    let (d, fake, _home) = setup(vec![screen("com.example", "Same")], Some(crashed()));
    ok(&d, "snapshot", json!({})).await;
    let r = ok(&d, "act", tap("Same")).await;
    assert!(r.get("crashed").is_none(), "{r}");
    assert!(log_reads(&fake).is_empty(), "{:?}", fake.calls());

    let fake = Arc::new(
        FakeDevice::new(vec![
            screen("com.example", "One"),
            screen("com.launcher", "Apps"),
        ])
        .lacking(Capabilities::FRAMES),
    );
    fake.answer_logs(crashed());
    fake.install(&[("com.launcher", "Launcher")]);
    let home = tempfile::tempdir().unwrap();
    let d = Daemon::new(
        Arc::new(One(fake.clone())),
        Config {
            home: home.path().to_path_buf(),
        },
    );
    ok(&d, "snapshot", json!({})).await;
    let r = ok(
        &d,
        "act",
        json!({"action": {"kind": "launch", "app": "Launcher"}}),
    )
    .await;
    assert!(r.get("crashed").is_none(), "{r}");
    assert!(log_reads(&fake).is_empty(), "{:?}", fake.calls());
}

#[tokio::test(start_paused = true)]
async fn a_device_without_logs_still_answers_the_tap() {
    let (d, _fake, _home) = setup(
        vec![
            screen("com.example", "Crash"),
            screen("com.launcher", "Apps"),
        ],
        None,
    );
    ok(&d, "snapshot", json!({})).await;
    let r = ok(&d, "act", tap("Crash")).await;
    assert_eq!(r["ok"], true);
    assert!(r.get("crashed").is_none(), "{r}");
    let e = err(&d, "logs", json!({})).await;
    assert_eq!(e.code, -32011);
}

#[tokio::test(start_paused = true)]
async fn logs_returns_the_last_lines_of_the_app_in_front_and_its_crash() {
    let text: String = (1..=50)
        .map(|n| format!("I/Example( 222): line {n}\n"))
        .collect();
    let (d, fake, _home) = setup(
        vec![screen("com.example", "One")],
        Some(LogReply {
            text,
            crash: Some(CRASH.into()),
        }),
    );
    let r = ok(&d, "logs", json!({})).await;
    assert_eq!(r["app"], "com.example");
    assert_eq!(r["crash"], CRASH);
    assert_eq!(r["omitted"], 10);
    let output = r["output"].as_str().unwrap();
    assert!(output.starts_with("I/Example( 222): line 11\n"), "{output}");
    assert!(output.ends_with("I/Example( 222): line 50"), "{output}");
    assert_eq!(
        log_reads(&fake),
        [Call::Logs(AppId("com.example".into()), false)]
    );
    let r = ok(&d, "logs", json!({"grep": "line 7|line 49", "head": 0})).await;
    assert_eq!(
        r["output"],
        "I/Example( 222): line 7\nI/Example( 222): line 49"
    );
}

#[tokio::test(start_paused = true)]
async fn logs_of_a_named_app_reads_that_app() {
    let (d, fake, _home) = setup(
        vec![screen("com.example", "One")],
        Some(LogReply::default()),
    );
    fake.install(&[("com.other", "Other")]);
    let r = ok(&d, "logs", json!({"app": "Other"})).await;
    assert_eq!(r["app"], "com.other");
    assert_eq!(r["output"], "");
    assert_eq!(
        log_reads(&fake),
        [Call::Logs(AppId("com.other".into()), false)]
    );
}
