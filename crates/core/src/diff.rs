use std::collections::HashMap;

use crate::element::{Element, ElementState, Ref, Role};
use crate::render::{Plan, Rendered, quote, shown_hint, shown_value, state_words};

/// Above this share of changed refs the agent is on a new screen and gets a full snapshot.
const NEW_SCREEN_SHARE: f32 = 0.6;

/// A screen that came back is told as a diff against the one it replaced when at most this share of its lines differ.
const BACK_SHARE: f32 = 0.25;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    Label,
    Value,
    Hint,
    State,
    Covered,
    /// The element's place among its siblings: `to` is `before @e6`, `last`, or `reordered` for a parent whose
    /// children moved in more places than are worth listing.
    Order,
}

/// One difference between two observations. `from` and `to` are already rendered and masked.
#[derive(Debug, Clone, PartialEq)]
pub enum Change {
    Added(Ref),
    Removed(Ref),
    /// The screen the agent was shown before the one it was last shown is on screen again.
    Uncovered,
    /// The keyboard came up (`true`) or went away. Its own element is never listed: the header says it is shown.
    Keyboard(bool),
    Changed {
        r#ref: Ref,
        field: Field,
        from: String,
        to: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum DiffOrFull {
    Diff(Vec<Change>),
    Full,
}

fn is_secure(e: &Element) -> bool {
    e.role == Role::SecureField || e.state.contains(ElementState::PASSWORD)
}

fn words(e: &Element) -> String {
    let w = state_words(e);
    if w.is_empty() {
        "(none)".into()
    } else {
        w.join(" ")
    }
}

fn covered(word: Option<&str>) -> String {
    word.unwrap_or("(none)").into()
}

/// Leaves out what a verified `type` into `target` already says (decision D87): the field taking focus, a secure
/// field's text changing, and, after a replace (`replaced`), its new text, which is the text the reply names. A new
/// label stays: on iOS a field's name can change when it takes text.
pub fn drop_echo(changes: &mut Vec<Change>, next: &Rendered, target: Ref, replaced: bool) {
    let secure = next
        .index_of(target)
        .is_some_and(|i| is_secure(&next.elements[i]));
    let words = |s: &str| -> Vec<String> {
        s.split(' ')
            .filter(|w| *w != "(none)" && *w != "focused")
            .map(str::to_string)
            .collect()
    };
    changes.retain(|c| match c {
        Change::Changed {
            r#ref,
            field: Field::State,
            from,
            to,
        } if *r#ref == target => {
            !(to.split(' ').any(|w| w == "focused") && words(from) == words(to))
        }
        Change::Changed {
            r#ref,
            field: Field::Value,
            ..
        } if *r#ref == target => !secure && !replaced,
        _ => true,
    });
}

fn opt(s: Option<String>) -> String {
    s.map_or_else(|| "(none)".into(), |s| quote(&s))
}

/// `diff`, except that when `next` is a new screen but is almost `below`, the screen `prev` had replaced (a dialog or a
/// menu closed), the answer is a diff against `below` that says so.
pub fn diff_below(prev: &Rendered, next: &Rendered, below: Option<&Rendered>) -> DiffOrFull {
    let plain = diff(prev, next);
    let (DiffOrFull::Full, Some(below)) = (&plain, below) else {
        return plain;
    };
    match diff(below, next) {
        DiffOrFull::Diff(changes)
            if changes.len() as f32 <= next.elements.len() as f32 * BACK_SHARE =>
        {
            let mut all = vec![Change::Uncovered];
            all.extend(changes);
            DiffOrFull::Diff(all)
        }
        _ => plain,
    }
}

pub fn diff(prev: &Rendered, next: &Rendered) -> DiffOrFull {
    let was = |e: &&Element| prev.listed(e);
    let listed = |e: &&Element| next.listed(e);
    let before: HashMap<Ref, &Element> = prev
        .elements
        .iter()
        .filter(was)
        .map(|e| (e.r#ref, e))
        .collect();
    let after: HashMap<Ref, &Element> = next
        .elements
        .iter()
        .filter(listed)
        .map(|e| (e.r#ref, e))
        .collect();
    let removed: Vec<Ref> = prev
        .elements
        .iter()
        .filter(was)
        .map(|e| e.r#ref)
        .filter(|r| !after.contains_key(r))
        .collect();
    let added = next
        .elements
        .iter()
        .filter(listed)
        .filter(|e| !before.contains_key(&e.r#ref))
        .count();
    let union = before.len() + added;
    if union > 0 && (removed.len() + added) as f32 / union as f32 > NEW_SCREEN_SHARE {
        return DiffOrFull::Full;
    }

    let focused = |e: &Element| e.state.contains(ElementState::FOCUSED) && e.role.is_text_entry();
    let focus_moved = next
        .elements
        .iter()
        .any(|e| focused(e) && !before.get(&e.r#ref).is_some_and(|old| focused(old)));
    let mut changes: Vec<Change> = removed.into_iter().map(Change::Removed).collect();
    for e in next.elements.iter().filter(listed) {
        let r = e.r#ref;
        let Some(old) = before.get(&r) else {
            changes.push(Change::Added(r));
            continue;
        };
        let was = if focus_moved && focused(old) && !focused(e) {
            let mut unfocused = (*old).clone();
            unfocused.state.remove(ElementState::FOCUSED);
            words(&unfocused)
        } else {
            words(old)
        };
        let value = if is_secure(e) {
            let changed = old.value != e.value;
            let mask = |on: bool| if on { "•••" } else { "" }.to_string();
            (mask(false), mask(changed))
        } else {
            (opt(shown_value(old)), opt(shown_value(e)))
        };
        let fields = [
            (Field::Label, opt(old.label.clone()), opt(e.label.clone())),
            (Field::Value, value.0, value.1),
            (Field::Hint, opt(shown_hint(old)), opt(shown_hint(e))),
            (Field::State, was, words(e)),
            (
                Field::Covered,
                covered(prev.cover_word(old)),
                covered(next.cover_word(e)),
            ),
        ];
        for (field, from, to) in fields {
            if from != to {
                changes.push(Change::Changed {
                    r#ref: r,
                    field,
                    from,
                    to,
                });
            }
        }
    }
    let moved = moves(prev, next, &changes);
    changes.extend(moved);
    let shown = next.header.keyboard.is_some();
    if prev.header.keyboard.is_some() != shown {
        changes.push(Change::Keyboard(shown));
    }
    DiffOrFull::Diff(changes)
}

const MOVES_LISTED: usize = 3;

/// Children that kept their parent and changed their order. Messages pinned a conversation by moving its row to the
/// top: no label or state changed, the reply listed nothing about the row, and the agent took a snapshot to look.
/// When either of two rows could be called the one that moved, it is the one that also changed (the pinned row was
/// the selected one).
fn moves(prev: &Rendered, next: &Rendered, changes: &[Change]) -> Vec<Change> {
    let changed = |r: &Ref| {
        changes
            .iter()
            .any(|c| matches!(c, Change::Changed { r#ref, .. } if r#ref == r))
    };
    let mut out = Vec::new();
    for parent in &next.elements {
        let Some(old) = prev.index_of(parent.r#ref).map(|i| &prev.elements[i]) else {
            continue;
        };
        let now: Vec<Ref> = parent
            .children
            .iter()
            .map(|&i| next.elements[i].r#ref)
            .collect();
        let was: Vec<Ref> = old
            .children
            .iter()
            .map(|&i| prev.elements[i].r#ref)
            .filter(|r| now.contains(r))
            .collect();
        let kept: Vec<usize> = now
            .iter()
            .filter_map(|r| was.iter().position(|w| w == r))
            .collect();
        if kept.is_sorted() {
            continue;
        }
        let weight: Vec<usize> = kept
            .iter()
            .map(|&k| if changed(&was[k]) { 1000 } else { 1001 })
            .collect();
        let mut run = weight.clone();
        let mut from = vec![usize::MAX; kept.len()];
        for i in 0..kept.len() {
            for j in 0..i {
                if kept[j] < kept[i] && run[j] + weight[i] > run[i] {
                    run[i] = run[j] + weight[i];
                    from[i] = j;
                }
            }
        }
        let mut stayed = vec![false; kept.len()];
        let mut at = (0..kept.len()).max_by_key(|&i| (run[i], i)).unwrap_or(0);
        while at != usize::MAX {
            stayed[at] = true;
            at = from[at];
        }
        let moved: Vec<Ref> = kept
            .iter()
            .zip(&stayed)
            .filter(|(_, s)| !**s)
            .map(|(&k, _)| was[k])
            .collect();
        if moved.len() > MOVES_LISTED {
            out.push(Change::Changed {
                r#ref: parent.r#ref,
                field: Field::Order,
                from: String::new(),
                to: "reordered".into(),
            });
            continue;
        }
        for r in moved {
            let place = now.iter().position(|n| *n == r).unwrap_or(0);
            out.push(Change::Changed {
                r#ref: r,
                field: Field::Order,
                from: String::new(),
                to: now
                    .get(place + 1)
                    .map_or_else(|| "last".into(), |n| format!("before @{n}")),
            });
        }
    }
    out
}

impl DiffOrFull {
    /// `+`, `-`, `~` lines; consecutive removals share one line. Empty for `Full` and for no change.
    pub fn text(&self, next: &Rendered) -> String {
        let DiffOrFull::Diff(changes) = self else {
            return String::new();
        };
        let mut lines: Vec<String> = Vec::new();
        let mut removing = false;
        let mut covering: Vec<(&str, &str, Vec<Ref>)> = Vec::new();
        let mut fields: HashMap<Ref, usize> = HashMap::new();
        for c in changes {
            if let Change::Changed { r#ref, field, .. } = c
                && !matches!(field, Field::Covered | Field::Order)
            {
                *fields.entry(*r#ref).or_default() += 1;
            }
        }
        let mut told: Vec<Ref> = Vec::new();
        let mut added = vec![false; next.elements.len()];
        for c in changes {
            if let Change::Added(r) = c
                && let Some(i) = next.index_of(*r)
            {
                added[i] = true;
            }
        }
        let plan = next.inline_plan(&added);
        for c in changes {
            match c {
                Change::Removed(r) => {
                    match lines.last_mut() {
                        Some(last) if removing => last.push_str(&format!(" @{r}")),
                        _ => lines.push(format!("- @{r}")),
                    }
                    removing = true;
                    continue;
                }
                Change::Keyboard(_) => {}
                Change::Uncovered => lines.push(
                    if changes.len() == 1 {
                        "the screen before the last one is back, unchanged"
                    } else {
                        "the screen before the last one is back, except:"
                    }
                    .into(),
                ),
                Change::Added(r) => {
                    if let Some(i) = next.index_of(*r) {
                        match &plan[i] {
                            Plan::Own => lines.push(format!("+ {}", next.line(&next.elements[i]))),
                            Plan::Line(l) => lines.push(format!("+ {l}")),
                            Plan::Skip => {}
                        }
                    }
                }
                Change::Changed {
                    r#ref,
                    field,
                    from,
                    to,
                } => {
                    let Some(e) = next.index_of(*r#ref).map(|i| &next.elements[i]) else {
                        continue;
                    };
                    if *field == Field::Covered {
                        match covering.iter_mut().find(|(f, t, _)| f == from && t == to) {
                            Some((_, _, refs)) => refs.push(*r#ref),
                            None => covering.push((from, to, vec![*r#ref])),
                        }
                        continue;
                    }
                    if *field == Field::Order {
                        let name = e.label.as_deref().map(quote).unwrap_or_default();
                        let verb = if to == "reordered" { "" } else { "moved " };
                        let head = format!("~ @{} {} {name}", r#ref, e.role.name());
                        lines.push(format!("{} {verb}{to}", head.trim_end()));
                        removing = false;
                        continue;
                    }
                    if fields.get(r#ref).is_some_and(|n| *n > 1) && !is_secure(e) {
                        if !told.contains(r#ref) {
                            told.push(*r#ref);
                            lines.push(format!("~ {}", next.line(e).trim_start()));
                        }
                        removing = false;
                        continue;
                    }
                    let head = format!("~ @{} {}", r#ref, e.role.name());
                    lines.push(match field {
                        Field::Value if is_secure(e) => {
                            format!("~ @{} secure field changed", r#ref)
                        }
                        Field::Label => format!("{head} {from} → {to}"),
                        _ => match &e.label {
                            Some(l) if *field == Field::Value && *from == quote(l) => {
                                format!("{head} {from} → {to}")
                            }
                            Some(l) => format!("{head} {} {from} → {to}", quote(l)),
                            None => format!("{head} {from} → {to}"),
                        },
                    });
                }
            }
            removing = false;
        }
        let keyboard = changes.iter().find_map(|c| match c {
            Change::Keyboard(shown) => Some(*shown),
            _ => None,
        });
        let at = |refs: &[Ref]| {
            refs.iter()
                .map(|r| format!("@{r}"))
                .collect::<Vec<_>>()
                .join(" ")
        };
        match keyboard {
            Some(false) => lines.push("keyboard hidden".into()),
            Some(true) => {
                let over = covering
                    .iter()
                    .find(|(f, t, _)| *f == "(none)" && *t == "under-keyboard")
                    .map(|(_, _, refs)| refs.as_slice())
                    .unwrap_or_default();
                lines.push(if over.is_empty() {
                    "keyboard shown".into()
                } else {
                    format!("keyboard shown over {}", at(over))
                });
            }
            None => {}
        }
        for (from, to, refs) in covering {
            if keyboard == Some(false)
                || (keyboard == Some(true) && from == "(none)" && to == "under-keyboard")
            {
                continue;
            }
            lines.push(format!("~ {} {from} → {to}", at(&refs)));
        }
        lines.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::element::Ref;
    use crate::geometry::{Rect, Scale};
    use crate::prune::prune;
    use crate::raw::RawTree;
    use crate::refs::RefTable;
    use crate::render::{Filters, Header, Rendered};

    fn screen(table: &mut RefTable, nodes: &[String]) -> Rendered {
        let json = format!(
            r#"{{"windows":[{{"id":1,"type":"application","bounds":[0,0,400,2000]}}],"nodes":[{}]}}"#,
            nodes.join(",")
        );
        let tree = RawTree::from_android_json(&json, Scale { density: 1.0 }).unwrap();
        let pruned = prune(&tree);
        let refs = table.assign(&tree, &pruned);
        Rendered::build(pruned, &refs, Header::default())
    }

    fn node(slot: usize, id: &str, cls: &str, extra: &str) -> String {
        let y = slot * 60;
        format!(
            r#"{{"p":-1,"w":1,"cls":"{cls}","b":[0,{y},400,{}],"n":"{id}",{extra}}}"#,
            y + 50
        )
    }

    fn switch(checked: bool) -> String {
        let f = if checked { "vVecC" } else { "vVec" };
        node(
            1,
            "switch",
            "android.widget.Switch",
            &format!(r#""desc":"Dark theme","f":"{f}","a":["tap"]"#),
        )
    }

    fn buttons(labels: &[&str]) -> Vec<String> {
        labels
            .iter()
            .enumerate()
            .map(|(i, l)| {
                node(
                    10 + i,
                    l,
                    "android.widget.Button",
                    &format!(r#""text":"{l}","f":"vVe","a":["tap"]"#),
                )
            })
            .collect()
    }

    #[test]
    fn an_element_that_changes_in_several_ways_is_one_line_with_what_it_shows_now() {
        let mut t = RefTable::default();
        let cell = |text: &str, hint: &str| {
            node(
                1,
                "cell",
                "android.widget.Button",
                &format!(r#""text":"{text}","hint":"{hint}","f":"vVe","a":["tap"]"#),
            )
        };
        let long = "Manage your overall setup and preferences";
        let a = screen(&mut t, &[cell("General", long)]);
        let b = screen(&mut t, &[cell(long, "")]);
        assert_eq!(diff(&a, &b).text(&b), format!("~ @e1 button \"{long}\""));
    }

    #[test]
    fn web_text_that_appears_is_one_line_with_its_links_inline() {
        let mut t = RefTable::default();
        let page = |extra: &[String]| {
            let mut nodes = vec![
                r#"{"p":-1,"w":1,"cls":"android.webkit.WebView","b":[0,0,400,2000],"n":"web","f":"vVe"}"#.to_string(),
                r#"{"p":0,"w":1,"cls":"android.view.View","text":"History","b":[0,0,400,40],"n":"h","f":"vVe","a":["tap"]}"#.to_string(),
            ];
            nodes.extend_from_slice(extra);
            nodes
        };
        let text = |t: &str, n: &str, y: usize| {
            format!(
                r#"{{"p":0,"w":1,"cls":"android.widget.TextView","text":"{t}","b":[0,{y},400,{}],"n":"{n}","f":"vVe"}}"#,
                y + 20
            )
        };
        let link = |t: &str, n: &str, y: usize| {
            format!(
                r#"{{"p":0,"w":1,"cls":"android.view.View","text":"{t}","b":[0,{y},400,{}],"n":"{n}","f":"vVe","a":["tap"]}}"#,
                y + 20
            )
        };
        let a = screen(&mut t, &page(&[]));
        let b = screen(
            &mut t,
            &page(&[
                text("Qualcomm announced it was developing the ", "t1", 100),
                link("Scorpion", "l1", 120),
                text(" CPU in November 2007.", "t2", 140),
            ]),
        );
        assert_eq!(
            diff(&a, &b).text(&b),
            "+ @e3 text \"Qualcomm announced it was developing the [Scorpion @e4] CPU in November 2007.\""
        );
    }

    #[test]
    fn toggle_is_one_line() {
        let mut t = RefTable::default();
        let mut before = buttons(&["A", "B", "C"]);
        before.push(switch(false));
        let mut after = buttons(&["A", "B", "C"]);
        after.push(switch(true));
        let (a, b) = (screen(&mut t, &before), screen(&mut t, &after));
        let d = diff(&a, &b);
        assert_eq!(
            d,
            DiffOrFull::Diff(vec![Change::Changed {
                r#ref: Ref(4),
                field: Field::State,
                from: "off".into(),
                to: "on".into()
            }])
        );
        assert_eq!(d.text(&b), "~ @e4 switch \"Dark theme\" off → on");
    }

    #[test]
    fn navigation_returns_full() {
        let mut t = RefTable::default();
        let a = screen(
            &mut t,
            &buttons(&["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]),
        );
        let b = screen(
            &mut t,
            &buttons(&["A", "B", "C", "P", "Q", "R", "S", "T", "U", "V"]),
        );
        assert_eq!(diff(&a, &b), DiffOrFull::Full);
    }

    #[test]
    fn small_change_stays_a_diff() {
        let mut t = RefTable::default();
        let a = screen(
            &mut t,
            &buttons(&["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]),
        );
        let b = screen(
            &mut t,
            &buttons(&["A", "B", "C", "D", "E", "F", "G", "H", "I", "K"]),
        );
        let d = diff(&a, &b);
        assert_eq!(d.text(&b), "- @e10\n+ @e11 button \"K\"");
    }

    #[test]
    fn consecutive_removals_collapse() {
        let mut t = RefTable::default();
        let all: Vec<&str> = (0..20)
            .map(|i| {
                [
                    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
                    "Q", "R", "S", "T",
                ][i]
            })
            .collect();
        let a = screen(&mut t, &buttons(&all));
        let kept: Vec<String> = buttons(&all).into_iter().skip(5).collect();
        let b = screen(&mut t, &kept);
        assert_eq!(diff(&a, &b).text(&b), "- @e1 @e2 @e3 @e4 @e5");
    }

    #[test]
    fn a_value_that_was_the_fields_own_name_is_not_printed_twice() {
        let mut t = RefTable::default();
        let field = |text: &str| {
            node(
                1,
                "field",
                "android.widget.EditText",
                &format!(
                    r#""desc":"Search Wikipedia","text":"{text}","f":"vVeE","a":["set_text"]"#
                ),
            )
        };
        let a = screen(&mut t, &[field("Search Wikipedia")]);
        let b = screen(&mut t, &[field("Ada Lovelace")]);
        assert_eq!(
            diff(&a, &b).text(&b),
            "~ @e1 textbox \"Search Wikipedia\" → \"Ada Lovelace\""
        );
    }

    #[test]
    fn value_edit_shows_old_and_new() {
        let mut t = RefTable::default();
        let field = |text: &str| {
            node(
                1,
                "field",
                "android.widget.EditText",
                &format!(r#""desc":"Name","text":"{text}","f":"vVeE","a":["set_text"]"#),
            )
        };
        let a = screen(&mut t, &[field("Bo")]);
        let b = screen(&mut t, &[field("Bob")]);
        assert_eq!(
            diff(&a, &b).text(&b),
            "~ @e1 textbox \"Name\" \"Bo\" → \"Bob\""
        );
    }

    #[test]
    fn secure_edit_hides_values() {
        let mut t = RefTable::default();
        let field = |text: &str| {
            node(
                1,
                "field",
                "android.widget.EditText",
                &format!(r#""desc":"Password","text":"{text}","f":"vVeEP","a":["set_text"]"#),
            )
        };
        let a = screen(&mut t, &[field("hunter")]);
        let b = screen(&mut t, &[field("hunter2")]);
        let d = diff(&a, &b);
        assert_eq!(d.text(&b), "~ @e1 secure field changed");
        assert!(!format!("{d:?}").contains("hunter"));
    }

    #[test]
    fn focus_moving_on_a_non_input_group_is_not_a_change_but_on_a_textbox_it_is() {
        let mut t = RefTable::default();
        let group = |focused: bool| {
            node(
                1,
                "g",
                "android.view.ViewGroup",
                &format!(
                    r#""desc":"Section","f":"{}","a":["tap"]"#,
                    if focused { "vVeF" } else { "vVe" }
                ),
            )
        };
        let a = screen(&mut t, &[group(true)]);
        let b = screen(&mut t, &[group(false)]);
        assert_eq!(diff(&a, &b), DiffOrFull::Diff(vec![]));
        let field = |focused: bool| {
            node(
                1,
                "f",
                "android.widget.EditText",
                &format!(
                    r#""desc":"Name","f":"{}","a":["set_text"]"#,
                    if focused { "vVeEF" } else { "vVeE" }
                ),
            )
        };
        let c = screen(&mut t, &[field(true)]);
        let e = screen(&mut t, &[field(false)]);
        assert_eq!(
            diff(&c, &e).text(&e),
            "~ @e2 textbox \"Name\" focused → (none)"
        );
    }

    #[test]
    fn focus_that_moved_to_another_field_is_told_once_on_the_field_that_has_it() {
        let mut t = RefTable::default();
        let field = |slot: usize, name: &str, focused: bool| {
            node(
                slot,
                name,
                "android.widget.EditText",
                &format!(
                    r#""desc":"{name}","f":"{}","a":["set_text"]"#,
                    if focused { "vVeEF" } else { "vVeE" }
                ),
            )
        };
        let a = screen(&mut t, &[field(1, "Email", true), field(2, "City", false)]);
        let b = screen(&mut t, &[field(1, "Email", false), field(2, "City", true)]);
        assert_eq!(
            diff(&a, &b).text(&b),
            "~ @e2 textbox \"City\" (none) → focused"
        );
    }

    #[test]
    fn a_row_that_moved_in_its_list_is_told_with_its_new_place() {
        let mut t = RefTable::default();
        let list = |rows: &[&str]| {
            let mut nodes = vec![
                r#"{"p":-1,"w":1,"cls":"androidx.recyclerview.widget.RecyclerView","desc":"Chats","b":[0,0,400,900],"n":"list","f":"vVe"}"#.to_string(),
            ];
            for (i, row) in rows.iter().enumerate() {
                let y = 100 + i * 60;
                let (name, flags) = match row.strip_suffix('*') {
                    Some(name) => (name, "vVes"),
                    None => (*row, "vVe"),
                };
                nodes.push(format!(
                    r#"{{"p":0,"w":1,"cls":"android.widget.Button","text":"{name}","b":[0,{y},400,{}],"n":"{name}","f":"{flags}","a":["tap"]}}"#,
                    y + 50
                ));
            }
            nodes
        };
        let a = screen(&mut t, &list(&["Carol", "Bob*", "Alice", "Dan"]));
        let b = screen(&mut t, &list(&["Bob", "Carol", "Alice", "Dan"]));
        assert_eq!(
            diff(&a, &b).text(&b),
            "~ @e3 button \"Bob\" selected → (none)\n~ @e3 button \"Bob\" moved before @e2"
        );
        let a = screen(&mut t, &list(&["Bob", "Carol*", "Alice", "Dan"]));
        let b = screen(&mut t, &list(&["Carol", "Bob", "Alice", "Dan"]));
        assert_eq!(
            diff(&a, &b).text(&b),
            "~ @e2 button \"Carol\" selected → (none)\n~ @e2 button \"Carol\" moved before @e3"
        );
        let e = screen(
            &mut t,
            &list(&["Carol", "Bob", "Alice", "Dan", "Eve", "Fay"]),
        );
        let f = screen(
            &mut t,
            &list(&["Fay", "Eve", "Dan", "Alice", "Bob", "Carol"]),
        );
        assert_eq!(diff(&e, &f).text(&f), "~ @e1 list \"Chats\" reordered");
        let d = screen(&mut t, &list(&["Carol", "Alice", "Dan"]));
        assert_eq!(diff(&b, &d).text(&d), "- @e3");
    }

    #[test]
    fn a_hint_that_only_repeats_the_label_is_not_a_change_when_it_goes() {
        let mut t = RefTable::default();
        let button = |hint: &str| {
            node(
                1,
                "b",
                "android.widget.Button",
                &format!(r#""text":"Go forward","hint":"{hint}","f":"vVe","a":["tap"]"#),
            )
        };
        let a = screen(&mut t, &[button("Go forward")]);
        let b = screen(&mut t, &[button("")]);
        assert_eq!(diff(&a, &b), DiffOrFull::Diff(vec![]));
        let c = screen(&mut t, &[button("Opens the next page")]);
        assert_eq!(
            diff(&b, &c).text(&c),
            "~ @e1 button \"Go forward\" (none) → \"Opens the next page\""
        );
    }

    fn with_keyboard(mut r: Rendered, shown: bool) -> Rendered {
        r.header.keyboard = shown.then_some(Rect {
            x: 0.0,
            y: 500.0,
            w: 400.0,
            h: 1500.0,
        });
        r
    }

    #[test]
    fn a_keyboard_that_goes_away_is_one_short_line_and_the_elements_it_starts_to_cover_are_one_ref_line()
     {
        let mut t = RefTable::default();
        let labels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
        let nodes = buttons(&labels);
        let covered = with_keyboard(screen(&mut t, &nodes), true);
        let clear = with_keyboard(screen(&mut t, &nodes), false);
        let gone = diff(&covered, &clear);
        assert_eq!(gone.text(&clear), "keyboard hidden");
        assert_eq!(
            diff(&clear, &covered).text(&covered),
            "keyboard shown over @e1 @e2 @e3 @e4 @e5 @e6 @e7 @e8 @e9 @e10 @e11 @e12"
        );
    }

    #[test]
    fn the_keyboard_s_own_element_is_not_listed_and_its_coming_and_going_is_one_line() {
        let mut t = RefTable::default();
        let with_ime = |t: &mut RefTable, nodes: &[String]| {
            let json = format!(
                r#"{{"windows":[{{"id":1,"type":"application","bounds":[0,0,400,2000]}},{{"id":2,"type":"input_method","bounds":[0,500,400,2000]}}],"nodes":[{}]}}"#,
                nodes.join(",")
            );
            let tree = RawTree::from_android_json(&json, Scale { density: 1.0 }).unwrap();
            let pruned = prune(&tree);
            let refs = t.assign(&tree, &pruned);
            with_keyboard(Rendered::build(pruned, &refs, Header::default()), true)
        };
        let mut nodes = buttons(&["A", "B"]);
        let clear = with_keyboard(screen(&mut t, &nodes), false);
        nodes.push(
            r#"{"p":-1,"w":2,"cls":"android.inputmethodservice.KeyboardView","b":[0,500,400,2000],"n":"kb","f":"vVe"}"#
                .into(),
        );
        let up = with_ime(&mut t, &nodes);
        assert!(up.elements.iter().any(|e| e.role == Role::Keyboard));
        let text = up.text(&Filters::default()).unwrap();
        assert_eq!(
            text,
            "keyboard shown\n@e1 button \"A\" under-keyboard\n@e2 button \"B\" under-keyboard"
        );
        assert_eq!(diff(&clear, &up).text(&up), "keyboard shown over @e1 @e2");
        assert_eq!(diff(&up, &clear).text(&clear), "keyboard hidden");
    }

    #[test]
    fn the_children_of_a_covered_group_take_its_under_keyboard_and_only_an_exception_is_said() {
        let mut t = RefTable::default();
        let child = |id: &str, top: u32, bottom: u32| {
            format!(
                r#"{{"p":0,"w":1,"cls":"android.widget.Button","b":[0,{top},400,{bottom}],"n":"{id}","text":"{id}","f":"vVe","a":["tap"]}}"#
            )
        };
        let nodes = [
            r#"{"p":-1,"w":1,"cls":"android.view.ViewGroup","b":[0,490,400,700],"n":"bar","desc":"Tab Bar","f":"vVe"}"#
                .to_string(),
            child("Edge", 490, 500),
            child("Items", 520, 620),
        ];
        let clear = with_keyboard(screen(&mut t, &nodes), false);
        let covered = with_keyboard(screen(&mut t, &nodes), true);
        let text = covered.text(&Filters::default()).unwrap();
        assert!(
            text.contains(
                "@e1 group \"Tab Bar\" under-keyboard\n  @e2 button \"Edge\" above-keyboard\n  @e3 button \"Items\""
            ),
            "{text}"
        );
        assert_eq!(
            diff(&clear, &covered).text(&covered),
            "keyboard shown over @e1\n~ @e2 (none) → above-keyboard"
        );
        assert_eq!(diff(&covered, &clear).text(&clear), "keyboard hidden");
    }

    #[test]
    fn a_verified_type_does_not_repeat_its_field_taking_focus_or_a_secure_field_changing() {
        let mut t = RefTable::default();
        let field = |id: &str, slot: usize, text: &str, f: &str| {
            node(
                slot,
                id,
                "android.widget.EditText",
                &format!(r#""text":"{text}","f":"{f}","a":["tap","set_text"]"#),
            )
        };
        let before = screen(
            &mut t,
            &[field("email", 1, "", "vVeE"), field("pw", 2, "", "vVeEP")],
        );
        let typed = screen(
            &mut t,
            &[
                field("email", 1, "gary@example.com", "vVeEF"),
                field("pw", 2, "", "vVeEP"),
            ],
        );
        let DiffOrFull::Diff(mut changes) = diff(&before, &typed) else {
            panic!("a new screen")
        };
        let appended = changes.clone();
        drop_echo(&mut changes, &typed, Ref(1), true);
        assert_eq!(DiffOrFull::Diff(changes).text(&typed), "");
        let mut changes = appended;
        drop_echo(&mut changes, &typed, Ref(1), false);
        assert_eq!(
            DiffOrFull::Diff(changes).text(&typed),
            "~ @e1 textbox (none) → \"gary@example.com\""
        );
        let secret = screen(
            &mut t,
            &[
                field("email", 1, "gary@example.com", "vVeE"),
                field("pw", 2, "secret1", "vVeEPF"),
            ],
        );
        let DiffOrFull::Diff(mut changes) = diff(&typed, &secret) else {
            panic!("a new screen")
        };
        drop_echo(&mut changes, &secret, Ref(2), false);
        assert_eq!(DiffOrFull::Diff(changes).text(&secret), "");
    }

    #[test]
    fn a_container_whose_line_would_only_name_its_role_is_not_listed_and_its_rows_are_not_indented()
    {
        let mut t = RefTable::default();
        let list = |actions: &str| {
            format!(
                r#"{{"p":-1,"w":1,"cls":"android.widget.ListView","b":[0,0,400,600],"n":"form","f":"vVeS"{actions}}}"#
            )
        };
        let mut nodes = vec![list("")];
        for (i, l) in ["A", "B"].iter().enumerate() {
            nodes.push(format!(
                r#"{{"p":0,"w":1,"cls":"android.widget.Button","b":[0,{},400,{}],"n":"{l}","text":"{l}","f":"vVe","a":["tap"]}}"#,
                i * 60,
                i * 60 + 50
            ));
        }
        let quiet = screen(&mut t, &nodes);
        assert_eq!(
            quiet.text(&Filters::default()).unwrap(),
            "@e2 button \"A\"\n@e3 button \"B\""
        );
        nodes[0] = list(r#","a":["scroll_fwd"]"#);
        let loud = screen(&mut t, &nodes);
        assert_eq!(
            loud.text(&Filters::default()).unwrap(),
            "@e1 list scrollable↓\n  @e2 button \"A\"\n  @e3 button \"B\""
        );
        assert_eq!(diff(&quiet, &loud).text(&loud), "+ @e1 list scrollable↓");
        assert_eq!(diff(&loud, &quiet).text(&quiet), "- @e1");
    }

    const TEN: [&str; 10] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

    #[test]
    fn closing_a_dialog_that_replaced_the_screen_says_the_screen_is_back_instead_of_printing_it_again()
     {
        let mut t = RefTable::default();
        let a = screen(&mut t, &buttons(&TEN));
        let dialog = screen(&mut t, &buttons(&["OK", "Cancel"]));
        let back = screen(&mut t, &buttons(&TEN));
        assert_eq!(diff(&dialog, &back), DiffOrFull::Full);
        let d = diff_below(&dialog, &back, Some(&a));
        assert_eq!(
            d.text(&back),
            "the screen before the last one is back, unchanged"
        );
    }

    #[test]
    fn a_screen_that_came_back_with_a_few_changes_lists_them() {
        let mut t = RefTable::default();
        let a = screen(&mut t, &buttons(&TEN));
        let dialog = screen(&mut t, &buttons(&["OK", "Cancel"]));
        let mut later = TEN;
        later[9] = "K";
        let back = screen(&mut t, &buttons(&later));
        assert_eq!(
            diff_below(&dialog, &back, Some(&a)).text(&back),
            "the screen before the last one is back, except:\n- @e10\n+ @e13 button \"K\""
        );
    }

    #[test]
    fn a_different_screen_after_a_dialog_is_new_and_so_is_any_screen_with_nothing_below() {
        let mut t = RefTable::default();
        let a = screen(&mut t, &buttons(&TEN));
        let dialog = screen(&mut t, &buttons(&["OK", "Cancel"]));
        let other = screen(
            &mut t,
            &buttons(&["P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y"]),
        );
        assert_eq!(diff_below(&dialog, &other, Some(&a)), DiffOrFull::Full);
        let back = screen(&mut t, &buttons(&TEN));
        assert_eq!(diff_below(&dialog, &back, None), DiffOrFull::Full);
    }

    #[test]
    fn no_change_is_empty() {
        let mut t = RefTable::default();
        let a = screen(&mut t, &buttons(&["A"]));
        let b = screen(&mut t, &buttons(&["A"]));
        assert_eq!(diff(&a, &b), DiffOrFull::Diff(vec![]));
        assert_eq!(diff(&a, &b).text(&b), "");
    }
}
