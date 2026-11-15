#[path = "support/fakes.rs"]
mod fakes;

use std::sync::Arc;

use async_trait::async_trait;
use fakes::tree;
use phonedriver::daemon::{Config, Daemon, DeviceSource, Listed};
use phonedriver_core::device::{Capabilities, Device};
use phonedriver_core::error::Error;
use phonedriver_core::geometry::Scale;
use phonedriver_core::raw::RawTree;
use phonedriver_core::testing::FakeDevice;
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

fn field(value: &str) -> RawTree {
    let json = format!(
        r#"{{"windows":[{{"id":1,"type":"application","package":"com.example","bounds":[0,0,360,800]}}],"nodes":[
        {{"p":-1,"w":1,"cls":"android.widget.FrameLayout","b":[0,0,360,800],"f":"vVe"}},
        {{"p":0,"w":1,"cls":"android.widget.EditText","text":"{value}","desc":"Field","b":[0,100,360,160],"f":"vVeEF","a":["tap","set_text"]}}]}}"#
    );
    RawTree::from_android_json(&json, Scale { density: 1.0 }).unwrap()
}

fn setup(trees: Vec<RawTree>) -> (Arc<Daemon>, Arc<FakeDevice>, tempfile::TempDir) {
    let fake = Arc::new(FakeDevice::new(trees).lacking(Capabilities::FRAMES));
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

fn tap_ref(r: &str) -> Value {
    json!({"action": {"kind": "tap", "target": {"ref": r}}})
}

#[tokio::test(start_paused = true)]
async fn the_journal_holds_each_action_that_worked_with_a_target_that_outlives_its_ref() {
    let (d, _fake, _home) = setup(vec![tree(&["One", "Two"])]);
    ok(&d, "snapshot", json!({})).await;
    ok(&d, "act", tap_ref("e1")).await;
    ok(
        &d,
        "act",
        json!({"action": {"kind": "tap", "target": {"text": "Two"}}}),
    )
    .await;
    d.call(
        "default",
        "act",
        json!({"action": {"kind": "tap", "target": {"text": "Nowhere"}}}),
    )
    .await
    .expect_err("no such element");
    ok(
        &d,
        "act",
        json!({"action": {"kind": "press", "key": "back"}}),
    )
    .await;

    let saved = ok(&d, "journal", json!({})).await;
    let steps = saved["steps"].as_array().unwrap();
    assert_eq!(steps.len(), 3, "{saved}");
    assert_eq!(
        steps[0],
        json!({
            "method": "act",
            "params": {"action": {"kind": "tap", "target": {"text": "One", "role": "button"}, "count": null, "long": null}},
            "summary": "tapped @e1 \"One\" at 180,130",
            "changed": false,
        })
    );
    assert_eq!(
        steps[1]["params"]["action"]["target"],
        json!({"text": "Two", "role": null})
    );
    assert_eq!(
        steps[2]["params"]["action"],
        json!({"kind": "press", "key": "back"})
    );
    assert_eq!(saved["over"], false);
    assert_eq!(ok(&d, "journal", json!({})).await["steps"], json!([]));
}

#[tokio::test(start_paused = true)]
async fn an_element_its_text_does_not_single_out_is_saved_by_position_and_marked() {
    let (d, _fake, _home) = setup(vec![tree(&["Same", "Same"])]);
    ok(&d, "snapshot", json!({})).await;
    ok(&d, "act", tap_ref("e2")).await;
    ok(
        &d,
        "act",
        json!({"action": {"kind": "tap", "target": {"point": {"x": 10.0, "y": 20.0}}}, "approval": "autonomous"}),
    )
    .await;
    let saved = ok(&d, "journal", json!({})).await;
    let steps = saved["steps"].as_array().unwrap();
    assert_eq!(
        steps[0]["params"]["action"]["target"],
        json!({"point": {"x": 180.0, "y": 230.0}})
    );
    assert_eq!(steps[0]["by_position"], true);
    assert_eq!(steps[1]["by_position"], true);
}

#[tokio::test(start_paused = true)]
async fn a_typed_secret_is_a_step_for_a_person_and_its_text_is_not_kept() {
    let (d, _fake, _home) = setup(vec![field(""), field(""), field("hunter2")]);
    ok(&d, "snapshot", json!({})).await;
    ok(
        &d,
        "act",
        json!({"action": {"kind": "type", "text": "hunter2", "into": {"ref": "e1"}, "secret": true}}),
    )
    .await;
    let saved = ok(&d, "journal", json!({})).await;
    assert!(!saved.to_string().contains("hunter2"), "{saved}");
    let step = &saved["steps"][0];
    assert!(step.get("method").is_none(), "{step}");
    assert!(
        step["manual"].as_str().unwrap().contains("secret"),
        "{step}"
    );
}

#[tokio::test(start_paused = true)]
async fn typed_text_a_wait_and_a_shell_command_are_steps_too() {
    let (d, _fake, _home) = setup(vec![field(""), field(""), field("hello")]);
    ok(&d, "snapshot", json!({})).await;
    ok(
        &d,
        "act",
        json!({"action": {"kind": "type", "text": "hello", "into": {"ref": "e1"}}}),
    )
    .await;
    ok(
        &d,
        "wait",
        json!({"condition": {"appears": {"text": "Field"}}}),
    )
    .await;
    ok(&d, "shell", json!({"command": "pm clear com.example"})).await;
    ok(
        &d,
        "shell",
        json!({"command": "login token", "secret": true}),
    )
    .await;
    let saved = ok(&d, "journal", json!({})).await;
    let steps = saved["steps"].as_array().unwrap();
    assert_eq!(steps.len(), 4, "{saved}");
    assert_eq!(steps[0]["params"]["action"]["text"], "hello");
    assert_eq!(
        steps[0]["params"]["action"]["into"],
        json!({"text": "Field", "role": "text_field"})
    );
    assert_eq!(
        steps[1],
        json!({"method": "wait", "params": {"condition": {"appears": {"text": "Field", "role": null}}}, "summary": steps[1]["summary"]})
    );
    assert_eq!(
        steps[2],
        json!({"method": "shell", "params": {"command": "pm clear com.example"}})
    );
    assert!(
        steps[3]["manual"].as_str().unwrap().contains("shell"),
        "{saved}"
    );
    assert!(!saved.to_string().contains("login token"), "{saved}");
}
