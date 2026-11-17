//! Text a caller marked secret is masked in every reply, error and trace line from then on (decision D70).

use std::sync::Mutex;

use serde_json::Value;

use super::rpc::RpcError;

pub const MASK: &str = "•••";

/// A shorter secret is masked only in the reply to the call that carried it. Remembered, `12` would blank every
/// label and count that holds those digits.
const REMEMBERED_FROM: usize = 4;

/// The secret texts a call carries: a `type` with `secret`, alone or as a batch step, and a `shell` command with
/// `secret`.
pub fn carried(method: &str, params: &Value) -> Vec<String> {
    let typed = |action: &Value| {
        (action["kind"] == "type" && action["secret"] == true)
            .then(|| action["text"].as_str().map(str::to_string))
            .flatten()
    };
    let found: Vec<String> = match method {
        "act" => typed(&params["action"]).into_iter().collect(),
        "batch" => params["steps"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(typed)
            .collect(),
        "shell" if params["secret"] == true => params["command"]
            .as_str()
            .map(str::to_string)
            .into_iter()
            .collect(),
        _ => Vec::new(),
    };
    found.into_iter().filter(|s| !s.is_empty()).collect()
}

/// Every secret the daemon was given since it started. They stay in memory and are never written anywhere.
#[derive(Default)]
pub struct Secrets(Mutex<Vec<String>>);

impl Secrets {
    /// Remembers what a call carried and returns every text to mask in its reply, longest first, so a secret that
    /// holds another is masked whole.
    pub fn with(&self, carried: Vec<String>) -> Vec<String> {
        let mut known = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let mut all = known.clone();
        for secret in carried {
            if !all.contains(&secret) {
                if secret.chars().count() >= REMEMBERED_FROM {
                    known.push(secret.clone());
                }
                all.push(secret);
            }
        }
        all.sort_by_key(|s| std::cmp::Reverse(s.len()));
        all
    }

    /// `text` with every remembered secret masked: for what the daemon writes to disk itself.
    pub fn masked(&self, text: &str) -> String {
        let mut text = text.to_string();
        hide_text(&mut text, &self.with(Vec::new()));
        text
    }
}

fn hide_text(text: &mut String, secrets: &[String]) {
    for secret in secrets {
        if text.contains(secret.as_str()) {
            *text = text.replace(secret.as_str(), MASK);
        }
    }
}

fn hide_value(value: &mut Value, secrets: &[String]) {
    match value {
        Value::String(s) => hide_text(s, secrets),
        Value::Array(items) => items.iter_mut().for_each(|v| hide_value(v, secrets)),
        Value::Object(fields) => {
            for (key, v) in fields {
                if key != "data_b64" {
                    hide_value(v, secrets);
                }
            }
        }
        _ => {}
    }
}

/// Masks `secrets` in every string of a reply or an error. A screenshot's pixels (`data_b64`) are left as they are.
pub fn hide(result: &mut Result<Value, RpcError>, secrets: &[String]) {
    if secrets.is_empty() {
        return;
    }
    match result {
        Ok(v) => hide_value(v, secrets),
        Err(e) => {
            hide_text(&mut e.message, secrets);
            hide_value(&mut e.data, secrets);
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_secret_is_masked_in_later_replies_and_errors_but_not_in_a_screenshots_pixels() {
        let secrets = Secrets::default();
        let carried = carried(
            "act",
            &json!({"action": {"kind": "type", "text": "hunter2!", "secret": true}}),
        );
        assert_eq!(carried, ["hunter2!"]);
        secrets.with(carried);
        let later = secrets.with(Vec::new());
        let mut reply = Ok(
            json!({"text": "@e1 textbox \"Note\" \"hunter2!\"", "elements": [{"value": "say hunter2! twice"}], "data_b64": "hunter2!"}),
        );
        hide(&mut reply, &later);
        assert_eq!(
            reply.unwrap(),
            json!({"text": "@e1 textbox \"Note\" \"•••\"", "elements": [{"value": "say ••• twice"}], "data_b64": "hunter2!"})
        );
        let mut error = Err(RpcError::new(
            1,
            "no field named hunter2!",
            json!({"hint": "hunter2!"}),
        ));
        hide(&mut error, &later);
        let error = error.unwrap_err();
        assert_eq!(error.message, "no field named •••");
        assert_eq!(error.data, json!({"hint": "•••"}));
    }

    #[test]
    fn a_secret_inside_a_longer_one_does_not_uncover_the_rest_of_it() {
        let secrets = Secrets::default();
        secrets.with(vec!["4821".into()]);
        let all = secrets.with(vec!["pin-4821-end".into()]);
        let mut reply = Ok(json!("typed pin-4821-end, then 4821"));
        hide(&mut reply, &all);
        assert_eq!(reply.unwrap(), json!("typed •••, then •••"));
    }

    #[test]
    fn a_short_secret_is_masked_in_its_own_reply_and_forgotten_after() {
        let secrets = Secrets::default();
        let own = secrets.with(carried("shell", &json!({"command": "id", "secret": true})));
        assert_eq!(own, ["id"]);
        assert!(secrets.with(Vec::new()).is_empty());
        assert!(
            carried(
                "act",
                &json!({"action": {"kind": "type", "text": "", "secret": true}})
            )
            .is_empty()
        );
        assert_eq!(
            carried(
                "batch",
                &json!({"steps": [{"kind": "type", "text": "one-secret", "secret": true}, {"kind": "type", "text": "plain"}]})
            ),
            ["one-secret"]
        );
    }
}
