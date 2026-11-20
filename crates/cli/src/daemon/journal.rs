//! What a session has done, kept as steps that can be run again with no model (decision D60).

use serde_json::{Value, json};

use super::session::Session;
use crate::wire::{Action, ActionResult, PointJson, Target, WaitCondition};

/// A session keeps this many steps and says so when more were done: a run that long is not one to replay blind.
pub const MAX: usize = 500;

#[derive(Default)]
pub struct Journal {
    steps: Vec<Value>,
    over: bool,
}

impl Journal {
    pub fn push(&mut self, step: Value) {
        if self.steps.len() < MAX {
            self.steps.push(step);
        } else {
            self.over = true;
        }
    }

    /// The steps so far, and whether more were done than are kept. The journal starts again empty.
    pub fn take(&mut self) -> Value {
        json!({"steps": std::mem::take(&mut self.steps), "over": std::mem::take(&mut self.over)})
    }

    /// The same as `take`, leaving the steps in the journal.
    pub fn peek(&self) -> Value {
        json!({"steps": self.steps, "over": self.over})
    }

    /// Removes the first `n` steps, the ones a client has stored after a `peek`.
    pub fn drop_first(&mut self, n: usize) {
        self.steps.drain(..n.min(self.steps.len()));
        self.over = false;
    }
}

pub fn call(method: &str, params: Value) -> Value {
    json!({"method": method, "params": params})
}

/// A step only a person can do again, with what it was.
pub fn manual(what: &str) -> Value {
    json!({"manual": what})
}

/// An action about to run, in the form it is kept in: every `@ref` replaced by what finds the same element in a
/// later run (`lasting`): its id, its text and role, or its centre (`by_position`). A typed secret is not kept at all.
pub struct Kept {
    action: Option<Action>,
    by_position: bool,
}

impl Kept {
    pub fn of(action: &Action, s: &Session) -> Kept {
        if matches!(action, Action::Type { secret: true, .. }) {
            return Kept {
                action: None,
                by_position: false,
            };
        }
        let mut action = action.clone();
        let mut by_position = false;
        let mut keep = |t: &mut Target| *t = lasting(t, s, &mut by_position);
        match &mut action {
            Action::Tap { target, .. } | Action::Clear { target } => keep(target),
            Action::Type { into, .. } => into.iter_mut().for_each(keep),
            Action::Swipe { from, .. } => from.iter_mut().for_each(keep),
            Action::Pinch { at, .. } => at.iter_mut().for_each(keep),
            Action::Drag { from, to } => {
                keep(from);
                keep(to);
            }
            Action::Scroll { within, until, .. } => {
                within.iter_mut().for_each(&mut keep);
                until.iter_mut().for_each(keep);
            }
            Action::Gesture { .. } => by_position = true,
            Action::Launch { .. } | Action::Open { .. } | Action::Press { .. } => {}
        }
        Kept {
            action: Some(action),
            by_position,
        }
    }

    /// The step for this action once it has worked. `changed` lets a replay tell a step that did nothing this time.
    pub fn step(self, result: &ActionResult) -> Value {
        let Some(action) = self.action else {
            return manual("a secret was typed here; type it with `type --secret`");
        };
        let mut step = call("act", json!({"action": action}));
        step["summary"] = json!(result.summary);
        step["changed"] = json!(result.changed);
        if self.by_position {
            step["by_position"] = json!(true);
        }
        step
    }
}

/// The step for a wait about to run; its `@ref` is replaced as an action's is.
pub fn wait(condition: &WaitCondition, s: &Session) -> Value {
    let mut by_position = false;
    let condition = match condition {
        WaitCondition::Settled(v) => WaitCondition::Settled(*v),
        WaitCondition::Appears(t) => WaitCondition::Appears(lasting(t, s, &mut by_position)),
        WaitCondition::Gone(t) => WaitCondition::Gone(lasting(t, s, &mut by_position)),
        WaitCondition::Vpn(v) => WaitCondition::Vpn(*v),
        WaitCondition::Log(l) => WaitCondition::Log(l.clone()),
    };
    call("wait", json!({"condition": condition}))
}

/// What finds the element of `target` in a later run, best first: an id the app gave it (with its text beside it,
/// for a run where the id is gone), its label or a hint with its role, and last its centre. Each is used only when
/// it singles the element out on the screen the agent saw. `android:id/…` names a slot every app has (`button1`
/// is the confirming button of any dialog), not a thing, so it is never used.
fn lasting(target: &Target, s: &Session, by_position: &mut bool) -> Target {
    let r = match target {
        Target::Text { .. } | Target::Id { .. } => return target.clone(),
        Target::Point { .. } => {
            *by_position = true;
            return target.clone();
        }
        Target::Ref { r#ref } => *r#ref,
    };
    let Some((last, element)) = s
        .last
        .as_ref()
        .and_then(|last| Some((last, &last.elements[last.index_of(r)?])))
    else {
        return target.clone();
    };
    let finds_it = |named: &Target| {
        s.resolve(named, last)
            .is_ok_and(|found| found.element.is_some_and(|e| e.r#ref == r))
    };
    let named = element
        .label
        .as_deref()
        .into_iter()
        .chain(
            element
                .hint
                .as_deref()
                .into_iter()
                .flat_map(|h| h.split(" · ")),
        )
        .filter(|text| !text.trim().is_empty())
        .map(|text| (text.to_string(), Some(element.role)))
        .find(|(text, role)| {
            finds_it(&Target::Text {
                text: text.clone(),
                role: *role,
            })
        });
    let id = element
        .id
        .clone()
        .filter(|id| !id.starts_with("android:id/"))
        .filter(|id| {
            finds_it(&Target::Id {
                id: id.clone(),
                text: None,
                role: None,
            })
        });
    match (id, named) {
        (Some(id), named) => {
            let (text, role) = named.unzip();
            Target::Id {
                id,
                text,
                role: role.flatten(),
            }
        }
        (None, Some((text, role))) => Target::Text { text, role },
        (None, None) => {
            *by_position = true;
            Target::Point {
                point: PointJson {
                    x: element.bounds.x + element.bounds.w / 2.0,
                    y: element.bounds.y + element.bounds.h / 2.0,
                },
            }
        }
    }
}
