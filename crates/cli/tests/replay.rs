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

fn fields(nodes: &[&str]) -> RawTree {
    let mut all = vec![
        r#"{"p":-1,"w":1,"cls":"android.widget.FrameLayout","b":[0,0,360,800],"f":"vVe"}"#
            .to_string(),
    ];
    for (i, more) in nodes.iter().enumerate() {
        let top = 100 + 100 * i as i32;
        all.push(format!(
            r#"{{"p":0,"w":1,"cls":"android.widget.EditText",{more},"b":[0,{top},360,{}],"f":"vVeEF","a":["tap","set_text"]}}"#,
            top + 60
        ));
    }
    let json = format!(
        r#"{{"windows":[{{"id":1,"type":"application","package":"com.example","bounds":[0,0,360,800]}}],"nodes":[{}]}}"#,
        all.join(",")
    );
    RawTree::from_android_json(&json, Scale { density: 1.0 }).unwrap()
}

fn type_into(target: Value) -> Value {
    json!({"action": {"kind": "type", "text": "x", "into": target}})
}

/// The Files app's "New folder" field and the testbed's web form have fields with no label; a run of the bench's
/// jobs saved both by position (2026-11-15), and the dialog sat 156 points higher in the replay.
#[tokio::test(start_paused = true)]
async fn an_element_is_saved_by_an_id_of_its_own_with_its_text_beside_it() {
    let screen = || {
        fields(&[
            r#""id":"name""#,
            r#""id":"email","hint":"Email address""#,
            r#""id":"same""#,
            r#""id":"same""#,
            r#""id":"android:id/text1""#,
            r#""hint":"Search""#,
        ])
    };
    let (d, _fake, _home) = setup(vec![screen(); 20]);
    ok(&d, "snapshot", json!({})).await;
    for r in ["e1", "e2", "e3", "e5", "e6"] {
        ok(&d, "act", type_into(json!({"ref": r}))).await;
    }
    let saved = ok(&d, "journal", json!({})).await;
    let steps = saved["steps"].as_array().unwrap();
    assert_eq!(
        steps[0]["params"]["action"]["into"],
        json!({"id": "name"}),
        "{saved}"
    );
    assert!(steps[0].get("by_position").is_none(), "{saved}");
    assert_eq!(
        steps[1]["params"]["action"]["into"],
        json!({"id": "email", "text": "Email address", "role": "text_field"}),
        "{saved}"
    );
    assert_eq!(
        steps[2]["params"]["action"]["into"],
        json!({"point": {"x": 180.0, "y": 330.0}}),
        "an id two elements share finds neither: {saved}"
    );
    assert_eq!(steps[2]["by_position"], true);
    assert_eq!(
        steps[3]["params"]["action"]["into"],
        json!({"point": {"x": 180.0, "y": 530.0}}),
        "an id of the platform's names a slot, not this field: {saved}"
    );
    assert_eq!(
        steps[4]["params"]["action"]["into"],
        json!({"text": "Search", "role": "text_field"}),
        "{saved}"
    );

    let again = ok(&d, "act", type_into(json!({"id": "name"}))).await;
    assert!(
        again["summary"].as_str().unwrap().contains("@e1"),
        "{again}"
    );
    let renamed = ok(
        &d,
        "act",
        type_into(json!({"id": "mail", "text": "Email address", "role": "text_field"})),
    )
    .await;
    assert!(
        renamed["summary"].as_str().unwrap().contains("@e2"),
        "the text finds it when the id is gone: {renamed}"
    );
    let two = d
        .call("default", "act", type_into(json!({"id": "same"})))
        .await
        .expect_err("two elements have this id");
    assert!(two.message.contains("same"), "{two:?}");
    let none = d
        .call("default", "act", type_into(json!({"id": "gone"})))
        .await
        .expect_err("no element has this id");
    assert!(none.message.contains("gone"), "{none:?}");
}
