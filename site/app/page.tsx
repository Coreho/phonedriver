import Link from "next/link";
import { Arrow, Html, JsonLd, Pane, Star } from "@/components/Bits";
import { DotsEngine, EndEngine, LanesEngine, JourneyEngine, PalmEngine, PointEngine, RaceEngine, TabsEngine, TypeEngine, ViewsEngine } from "@/components/Engines";
import { Hero } from "@/components/Hero";
import { Paste } from "@/components/Paste";
import { Route } from "@/components/Route";
import { HARNESSES, PHONE, TASKS, VERSIONS, board, minutes, ms, op, ratio, short, simulator, tokens, type Cell, type Harness } from "@/lib/bench";
import { mark, PAINT } from "@/lib/chauffeur";
import { DEMO_CAPTION, HOME_DESC, HOME_FAQ, JOBS, INIT, MCP_CONFIG, NPX } from "@/lib/data";
import { softwareLd } from "@/lib/ld";
import { inline, plain } from "@/lib/md";
import { meta } from "@/lib/meta";
import lanes from "@/lib/lanes.json";
import replay from "@/lib/replay.json";
import run from "@/lib/run.json";
import screen from "@/lib/screen.json";
import { BOOT, PUBLISHED, PUBLISHER, REPO, VERSION, raw, url } from "@/lib/site";
import "./charts.css";
import "./home.css";

const CONFIG = MCP_CONFIG;
const CURSOR = `https://cursor.com/en/install-mcp?name=phonedriver&config=${Buffer.from(JSON.stringify({ command: "npx", args: ["-y", "phonedriver", "mcp"] })).toString("base64")}`;
const SLOW = 25;
const UNIT = 10000;
const CLIENTS = [
  { id: "prompt", name: "Ask your agent", say: BOOT },
  { id: "init", name: "One command", cmd: INIT },
  { id: "claude", name: "Claude Code", cmd: `claude mcp add phonedriver -- ${NPX}` },
  { id: "codex", name: "Codex", cmd: `codex mcp add phonedriver -- ${NPX}` },
  { id: "cursor", name: "Cursor", file: "~/.cursor/mcp.json" },
  { id: "other", name: "Other", file: "your client's MCP config" },
];

const STOPS: [id: string, name: string, say: string, short?: string][] = [
  ["real-jobs", "Tokens", "Doesn't that eat my tokens?", "And my tokens?"],
  ["what-the-model-sees", "The read", "How is it that cheap?"],
  ["speed", "Speed", "And is it quick?"],
  ["asking-before-it-pays", "Approval", "Can it spend my money?"],
  ["lanes", "Lanes", "Do I have to put my phone down?", "And my own phone?"],
  ["saved-runs", "Replay", "Do I need the model every time?", "A model every time?"],
  ["how-it-works", "How it works", "What is it made of?"],
  ["limits", "Limits", "Anything I should know?"],
  ["install", "Set up", "Fine. Set it up."],
];

const ASKS = [
  "Open my app, sign up with a new account, and tell me every bug you find on the way. Give me steps to reproduce each one.",
  "Find the app that drains my battery and tell me how long it ran in the background today.",
  "Go through my app's onboarding in dark mode and in light mode, and show me every screen where the text is hard to read.",
];

const TAPDIFF = [
  "$ phonedriver tap @e24",
  'ok tapped @e24 "Dark theme"',
  '~ @e23 button "Dark theme" "Will turn on when Bedtime starts" → "Will never turn off automatically"',
  '~ @e24 switch "Dark theme" off → on',
];

const RACE: [string, string][] = [
  ["tree_list", "Read the screen"],
  ["screenshot", "Take a screenshot"],
  ["type100", "Type 100 characters"],
  ["tap_diff", "Tap and see what changed"],
];

const TOOLS = ["devices", "apps", "snapshot", "screenshot", "tap", "type", "swipe", "scroll", "press", "launch", "wait", "batch", "clipboard", "shell", "setting", "logs", "replay"];

const ACTION = [
  "on: [push, pull_request]",
  "jobs:",
  "  android:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - run: ./gradlew assembleDebug",
  `      - uses: hridaya423/phonedriver@v${VERSION}`,
  "        with:",
  "          app: app/build/outputs/apk/debug/app-debug.apk",
  "          runs: e2e/*.steps",
];

const ALSO: [string, string, string][] = [
  ["record start", "An MP4 of the screen, with a file of the actions done during it", "/docs/test-a-mobile-app/#keep-the-run-as-a-test"],
  ["page", "A whole web page as text in one call, with no scrolling", "/docs/read-a-web-page/"],
  ["snapshot --audit", "Controls a screen reader cannot name, and tap targets that are too small", "/docs/test-a-mobile-app/#accessibility"],
  ["compare a.png b.png", "What changed between two screenshots, said in text", "/changelog/"],
  ["logs", "The app's last lines and its last crash", "/docs/test-a-mobile-app/#permissions-crashes-and-the-screen"],
  ["apps grant", "Give or take away a permission without opening the app", "/docs/test-a-mobile-app/#permissions-crashes-and-the-screen"],
  ["setting find", "Change an Android 17 setting by its key, without its screen", "/changelog/"],
  ["boot <name>", "Start an emulator or a Simulator that is off", "/docs/android-emulator/#start-an-emulator"],
];

const DEVICES: [string, React.ReactNode][] = [
  ["Android emulator", "adb"],
  ["Android phone or tablet", "adb and USB debugging"],
  ["iOS Simulator", "a Mac with Xcode"],
  [
    "iPhone or iPad",
    <>
      a Mac with Xcode and an Apple Development certificate. <code>phonedriver ios setup</code> sets up the phone (<Link href="/docs/iphone/">guide</Link>)
    </>,
  ],
];


type Row = { k: string; text?: string; lines?: string[] };
const ROWS = run.rows as Row[];
const ASKED = ROWS.find((r) => r.k === "ask")!.lines!;
const PICK = 1100 + ASKED.length * 140 + 300;
const at = (ms: number) => ({ "--k": `${ms}ms` }) as React.CSSProperties;
const DECLINED = ROWS.find((r) => r.k === "declined")!.lines![0];

const REFS = screen.lines.filter((l) => l.ref);
const REST = REFS.findIndex((l) => l.text.includes("Display & touch")) + 1;
const SHOT = [720, 1616];
const strip = (top: number, height: number) => {
  const tall = Math.min(height, 0.11);
  return { "--ar": `${SHOT[0]} / ${SHOT[1] * tall}`, "--at": `${(top / (1 - tall)) * 100}%` } as React.CSSProperties;
};

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
const LANED = new Date(`${lanes.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const LANES = [{ id: "", who: "your screen", alt: lanes.main.alt, frames: lanes.main.frames, steps: [] as (typeof lanes.lanes)[number]["steps"] }, ...lanes.lanes];

export const metadata = meta({ path: "/", title: "phonedriver: MCP server for AI agents on Android and iOS phones", description: HOME_DESC, og: "/assets/og-home.png" });

function Tokens({ c }: { c: Cell | null }) {
  if (!c) return <span className="jb-na">not run</span>;
  return (
    <>
      <span className="jb-n">{short(c.tokens)}</span>
      <span className={c.passed < c.runs ? "jb-p miss" : "jb-p"}>
        {c.passed}/{c.runs}
      </span>
    </>
  );
}

export default function Home() {
  const b = board();
  const totals = (["phonedriver", "phone-harness", "mobile-mcp"] as Harness[]).map((h) => ({ h, t: b.total(h) }));
  const most = Math.max(...totals.map((x) => x.t.tokens));
  const runs = totals.reduce((n, x) => n + x.t.runs, 0);
  const fewer = ratio(b.total("mobile-mcp").tokens / b.total("phonedriver").tokens);
  const race = RACE.map(([id, label]) => ({ label, o: op(id) }));
  const sim = simulator();
  const read = race[0].o;
  const ld = [
    ...softwareLd(),
    { "@context": "https://schema.org", "@type": "WebSite", name: "phonedriver", alternateName: "phonedriver.dev", description: HOME_DESC, url: url("/"), inLanguage: "en", publisher: PUBLISHER },
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: "Claude Code orders a pizza on an Android phone with phonedriver and asks before it pays",
      description: DEMO_CAPTION,
      thumbnailUrl: url("/assets/demo-poster.jpg"),
      uploadDate: `${PUBLISHED}T00:00:00Z`,
      contentUrl: url("/assets/demo.mp4"),
      duration: "PT43S",
      width: 1280,
      height: 720,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: plain(a) } })),
    },
  ];
  return (
    <>
      <JsonLd data={ld} />
      <Hero />
      <canvas className="weave" aria-hidden="true" />
      <nav className="dock" inert aria-label="On this page">
        <a className="dock-top" href="#main" aria-label="Back to the top" dangerouslySetInnerHTML={{ __html: mark("text", PAINT.icon, 30) }} />
        <button type="button" className="dock-now" popoverTarget="stops">
          <i aria-hidden="true" />
          <span className="vh">On this page: </span>
          <span className="dock-name">{STOPS[0][1]}</span>
          <span className="dock-n" aria-hidden="true">1/{STOPS.length}</span>
        </button>
        <i className="dock-bar" aria-hidden="true" />
        <ol className="dock-map">
          {STOPS.map(([id, name]) => (
            <li key={id}>
              <a href={`#${id}`}>
                <i aria-hidden="true" />
                <span>{name}</span>
              </a>
            </li>
          ))}
        </ol>
        <button type="button" className="btn dock-cp" data-copy={BOOT} data-next="">
          <span data-label>Copy</span>
          <span data-rest>
            {" "}
            <span>the setup </span>prompt
          </span>
        </button>
      </nav>
      <div className="menu stops" id="stops" popover="auto">
        <p className="menu-top">
          <span>On this page</span>
          <button type="button" popoverTarget="stops" popoverTargetAction="hide">
            Close
          </button>
        </p>
        <nav aria-label="Stops on this page">
          <ol>
            {STOPS.map(([id, name, say]) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <i aria-hidden="true" />
                  <b>{name}</b>
                  <span>{say}</span>
                </a>
              </li>
            ))}
          </ol>
          <a className="stops-top" href="#main">
            Back to the top
          </a>
        </nav>
      </div>

      <section className="stop" id="real-jobs">
        <Route n={1} say={STOPS[0][2]} short={STOPS[0][3]} />
        <div className="wrap">
          <div className="hm-stat">
            <div>
              <h2>{fewer} fewer tokens than mobile&#8209;mcp on nine real phone jobs.</h2>
              <p className="lede">
                Nine jobs only a phone can do, run with Claude Sonnet 5.5 through three MCP servers on one Android emulator on {b.date}. A script checked the
                phone&apos;s own data afterwards, not the model&apos;s report.
              </p>
            </div>
            <p className="hm-big" aria-hidden="true" data-land="" data-at=".07">
              {fewer}
            </p>
          </div>
          <div className="df" data-life="" data-unit={UNIT} data-point=".df-row.us .df-field" data-point-x=".df-row.us .df-field i:last-child" data-point-at="760" data-point-edge="page">
            {totals.map(({ h, t }) => {
              const n = Math.round(t.tokens / UNIT);
              return (
                <div className={h === "phonedriver" ? "df-row us" : "df-row"} key={h}>
                  <p className="df-head">
                    <span className="df-who">
                      {h === "phonedriver" ? h : <Link href={`/compare/${h}/`}>{h}</Link>} <span>{VERSIONS[h]}</span>
                    </span>
                    <span className="df-num">
                      <b title={`${tokens(t.tokens)} tokens`} data-tokens={t.tokens}>
                        {short(t.tokens)}
                      </b>
                      <span>tokens</span>
                      <span className={t.passed < t.runs ? "miss" : undefined}>
                        {t.passed} of {t.runs} passed
                      </span>
                      <span>{minutes(t.wall)}</span>
                    </span>
                  </p>
                  <div className="df-field" aria-hidden="true" style={{ "--c6": Math.ceil(most / UNIT / 6), "--c12": Math.ceil(most / UNIT / 12) } as React.CSSProperties}>
                    {Array.from({ length: n }, (_, i) => (
                      <i key={i} />
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="df-key">One dot is {tokens(UNIT)} tokens. Totals are sums of per-job medians over the nine jobs.</p>
            <canvas className="pf" aria-hidden="true" />
            <i className="pf-ring" aria-hidden="true" />
            <DotsEngine />
            <PointEngine host=".df" />
          </div>
          <details className="jl">
            <summary>
              <span>The nine jobs, one by one</span>
              <span>
                {TASKS.length} jobs, {runs} runs
              </span>
            </summary>
            <div className="jd">
              <p className="jd-head" aria-hidden="true">
                <span />
                <span>What Claude was asked to do</span>
                {totals.map(({ h }) => (
                  <span key={h}>{h}</span>
                ))}
                <span />
              </p>
              {TASKS.map((task, n) => {
                const info = JOBS.find(([id]) => id.split(" ")[0] === task)!;
                const all = HARNESSES.map((h) => [h, b.cell(h, task)] as const).filter((x): x is readonly [Harness, Cell] => !!x[1]);
                const top = Math.max(...all.map(([, c]) => c.tokens));
                const cells = totals.map(({ h }) => b.cell(h, task));
                const best = Math.min(...cells.filter((c): c is Cell => !!c && c.passed === c.runs).map((c) => c.tokens));
                return (
                  <details key={task} name="job" open={n === 0}>
                    <summary>
                      <span className="jd-n">{String(n + 1).padStart(2, "0")}</span>
                      <span className="jd-t">{info[1]}</span>
                      <span className="jd-cs">
                        {cells.map((c, i) => (
                          <span key={i} className={c?.tokens === best ? "jd-c best" : "jd-c"} data-label={totals[i].h}>
                            <span className="vh">{totals[i].h}: </span>
                            <Tokens c={c} />
                          </span>
                        ))}
                      </span>
                    </summary>
                    <div className="jd-card">
                      <div className="jd-bars">
                        {all.map(([h, c]) => (
                          <p key={h} className={h === "phonedriver" ? "jd-bar us" : "jd-bar"}>
                            <span>{h}</span>
                            <span className="jd-tr">
                              <i style={{ "--f": c.tokens / top } as React.CSSProperties} />
                            </span>
                            <b>{short(c.tokens)}</b>
                            <span className={c.passed < c.runs ? "miss" : undefined}>
                              {c.passed}/{c.runs}
                            </span>
                            <span>{c.calls} calls</span>
                            <span>{c.wall} s</span>
                          </p>
                        ))}
                      </div>
                      <p className="jd-why">
                        <b>Why it needs the phone.</b> {info[2]}.
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
            <p className="hm-foot">
              Median tokens, then runs passed. The orange square marks the fewest tokens among tools that passed every run: phone-harness wins two jobs. This is my
              own test set, and every run, version and check is <Link href="/benchmarks/#jobs">published</Link>. If you maintain one of these tools and think I set it
              up wrong, <a href={`${REPO}/issues`}>open an issue</a> and I will rerun it.
            </p>
          </details>
        </div>
      </section>

      <section className="stop" id="what-the-model-sees">
        <Route n={2} say={STOPS[1][2]} short={STOPS[1][3]} />
        <div className="wrap">
          <div className="hm-stat">
            <div>
              <h2>It reads the screen as text.</h2>
              <p className="lede">Each screen arrives as a short numbered list, and the model taps by number. It takes a screenshot only when it needs to see a picture.</p>
            </div>
            <p className="hm-pair" aria-hidden="true">
              <span>
                {screen.nodes}
                <small>nodes on the screen</small>
              </span>
              <i>→</i>
              <b>
                {screen.lines.length}
                <small>lines for the model</small>
              </b>
            </p>
          </div>
          <div className="tv" data-on={REST} data-life="">
            <figure className="tv-shot">
              <div className="tv-screen">
                <img
                  src="/assets/screen-settings.jpg"
                  width={SHOT[0]}
                  height={SHOT[1]}
                  alt="The Settings app on a Pixel 9 emulator: a search field, then rows for Google, Network & internet, Connected devices, Apps, Notifications, Sound & vibration, Modes, Display & touch, Wallpaper & style and Storage."
                  decoding="async"
                  loading="lazy"
                />
                {REFS.map((l, i) => (
                  <i
                    key={l.ref}
                    className="tv-box"
                    data-i={i + 1}
                    data-on={i + 1 === REST ? "" : undefined}
                    style={{ left: `${l.box![0] * 100}%`, top: `${l.box![1] * 100}%`, width: `${l.box![2] * 100}%`, height: `${l.box![3] * 100}%` }}
                  >
                    <b>{l.ref}</b>
                  </i>
                ))}
              </div>
              <div className="tv-read pane" aria-hidden="true">
                <p className="pane-head">
                  <span>what the model sees</span>
                  <span className="if-fine">point at a row</span>
                  <span className="if-touch">tap a row</span>
                </p>
                <p className="tv-readout">
                  <b>{REFS[REST - 1].ref}</b>
                  {REFS[REST - 1].text.trimStart().slice(REFS[REST - 1].ref!.length)}
                </p>
              </div>
              <figcaption>
                What you see <span>{screen.nodes} nodes in Android&apos;s accessibility tree</span>
              </figcaption>
            </figure>
            <div className="tv-text">
              <div data-land="" data-at=".5">
                <Pane title="phonedriver snapshot" note={`${screen.lines.length} lines`} label="phonedriver snapshot output">
                  <ol className="tv-lines" tabIndex={0} aria-label="The same screen as phonedriver's text. Up and down arrows move between elements.">
                    {screen.lines.map((l, i) => {
                      const n = l.text.length - l.text.trimStart().length;
                      const at = l.ref ? REFS.indexOf(l) + 1 : 0;
                      return l.ref ? (
                        <li key={i} data-i={at} data-on={at === REST ? "" : undefined} style={{ "--i": n } as React.CSSProperties}>
                          <b>{l.ref}</b>
                          {l.text.trimStart().slice(l.ref.length)}
                          <span className="tv-peek" aria-hidden="true">
                            <span>
                              <i style={strip(l.box![1], l.box![3])} />
                            </span>
                          </span>
                        </li>
                      ) : (
                        <li key={i} className="tv-meta">
                          {l.text}
                        </li>
                      );
                    })}
                  </ol>
                  <button type="button" className="tv-more">
                    <span>Show all {screen.lines.length} lines</span>
                    <i aria-hidden="true">+</i>
                  </button>
                </Pane>
              </div>
              <p className="tv-cap">
                <span className="if-fine">Point at a line to see what it is on the screen.</span>
                <span className="if-touch">Tap a line to unfold the strip of screen it stands for.</span>
              </p>
              <Pane title="then, one screen later" note="only what changed" lines={TAPDIFF} label="phonedriver tap output" />
              <p className="tv-cap">
                After every tap, phonedriver waits for the screen to settle and replies with only the lines that changed. The model never polls or guesses how long a
                screen takes to load.
              </p>
            </div>
            <svg className="tv-link" aria-hidden="true">
              <path />
            </svg>
            <canvas className="tv-fx" aria-hidden="true" />
            <ViewsEngine />
          </div>
        </div>
      </section>

      <section className="stop" id="speed">
        <Route n={3} say={STOPS[2][2]} short={STOPS[2][3]} />
        <div className="wrap">
          <div className="hm-head">
            <h2>{ratio(read.adb / read.phonedriver)} faster than adb at reading the screen.</h2>
            <p className="lede">
              A helper on the phone keeps the accessibility connection open. <Link href="/compare/adb/">adb</Link> starts a new process and writes XML on every call.
            </p>
          </div>
          <figure className="race pane" data-slow={SLOW} data-land="" data-at=".72" data-life="" data-point="li:first-child .race-lane.us .race-ms" data-point-at="900">
            <figcaption className="pane-head">
              <span>four calls</span>
              <div className="race-ctl" hidden>
                <div className="race-seg" role="group" aria-label="Speed">
                  <button type="button" className="race-btn" data-speed="slow" aria-pressed="true">
                    {SLOW}x slower
                  </button>
                  <button type="button" className="race-btn" data-speed="real" aria-pressed="false">
                    Real speed
                  </button>
                </div>
                <button type="button" className="race-btn race-play">
                  Play
                </button>
              </div>
            </figcaption>
            <ol>
              {race.map(({ label, o }) => (
                <li key={o.id}>
                  <p className="race-name">
                    {label}
                    <b>{ratio(o.adb / o.phonedriver)}</b>
                  </p>
                  {(
                    [
                      ["phonedriver", o.phonedriver],
                      ["adb", o.adb],
                    ] as const
                  ).map(([who, t]) => (
                    <p className={who === "adb" ? "race-lane" : "race-lane us"} key={who}>
                      <span className="race-who">{who}</span>
                      <span className="race-track" aria-hidden="true">
                        <i data-ms={t} />
                      </span>
                      <span className="race-ms">{ms(t)} ms</span>
                    </p>
                  ))}
                </li>
              ))}
            </ol>
            <p className="race-cap">
              Each ball is one call, out to the phone and back. Medians of 50 runs on an Android 17 emulator, against <code>uiautomator dump</code>,{" "}
              <code>screencap</code> and <code>input</code>. <Link href="/benchmarks/#speed">Method and raw data</Link>
            </p>
            <canvas className="pf" aria-hidden="true" />
            <i className="pf-ring" aria-hidden="true" />
            <RaceEngine />
            <PointEngine host=".race" />
          </figure>
          <dl className="hm-phone">
            <dt>
              On a real phone{" "}
              <span>
                {PHONE.name}, {PHONE.os}
              </span>
            </dt>
            <dd>
              <b>{ratio(PHONE.read[1] / PHONE.read[0])}</b> Reading the screen took {PHONE.read[0]} ms against {ms(PHONE.read[1])} ms.
            </dd>
            <dd>
              <b>{ratio(PHONE.shot[1] / PHONE.shot[0])}</b> A screenshot took {Math.round(PHONE.shot[0])} ms against {ms(PHONE.shot[1])} ms.
            </dd>
          </dl>
          <dl className="hm-phone">
            <dt>
              On the iOS Simulator{" "}
              <span>
                {sim.device}, {sim.runtime}
              </span>
            </dt>
            <dd>
              <b>{Math.round(sim.tools[0].read.medianMs)} ms</b> Reading the screen. simulator-use took {Math.round(sim.tools[1].read.medianMs)} ms on the same screen.
            </dd>
            <dd>
              <b>{Math.round(sim.tools[0].tap.medianMs)} ms</b> A tap with its reply, against {Math.round(sim.tools[1].tap.medianMs)} ms.{" "}
              <Link href="/benchmarks/#simulator">The sign-in benchmark</Link>
            </dd>
          </dl>
        </div>
      </section>

      <section className="stop" id="asking-before-it-pays">
        <Route n={4} say={STOPS[3][2]} short={STOPS[3][3]} />
        <div className="wrap">
          <div className="hm-split rev">
            <div>
              <h2>It asks you before it taps Pay.</h2>
              <p className="lede">
                When a tap lands on Pay, Buy now, Place order or Delete account, phonedriver holds it and asks you in Claude Code&apos;s own prompt. The model never sees
                that question and can&apos;t answer it.
              </p>
            </div>
            <div className="hm-sticky">
              <div className="ask-stage" data-land="">
                <Pane title="Claude Code · Opus 5.5" note={`recorded ${run.date}`} label="The approval question from the recorded run">
                  <div className="ask" data-life="">
                    <p className="ask-you" style={at(0)}>
                      <i aria-hidden="true">❯</i>
                      <span>
                        {ROWS[0].text!.split(". ")[0]}. <em>…</em>
                      </span>
                    </p>
                    <p className="ask-gap" style={at(500)}>
                      {run.calls} calls and {run.worked.replace("Worked for ", "")} later
                    </p>
                    <div className="ask-q" style={at(1100)}>
                      {ASKED.map((l, i) => (
                        <p key={i} style={at(1100 + i * 140)}>
                          {l}
                        </p>
                      ))}
                      <p className="ask-pick" style={at(PICK)}>
                        <i aria-hidden="true"> </i>✔ Your answer: Allow
                      </p>
                      <p className="ask-pick" style={at(PICK + 200)}>
                        <i className="ask-ca" aria-hidden="true" style={at(PICK + 500)}>
                          ❯
                        </i>
                        Accept
                        <i className="ask-cd" aria-hidden="true" style={at(PICK + 1100)}>
                          ❯
                        </i>
                        <b style={at(PICK + 1100)}>Decline</b>
                      </p>
                    </div>
                    <p className="ask-no" style={at(PICK + 1500)}>
                      {DECLINED}
                    </p>
                  </div>
                </Pane>
                <canvas className="ask-fig" aria-hidden="true" />
                <PalmEngine />
              </div>
              <p className="tv-cap">
                From the run at the top of this page. <a href="/assets/demo.mp4">Watch all 43 seconds (MP4)</a>
              </p>
            </div>
            <div className="hm-side">
              <dl className="hm-facts">
                <div>
                  <dt>You answer</dt>
                  <dd>Allow, Allow for this session, or Decline. In a client that can&apos;t show the prompt, the tap waits and the model has to ask you in chat.</dd>
                </div>
                <div>
                  <dt>Eleven languages</dt>
                  <dd>It reads button labels in eleven languages. It does not catch a button that is only an icon, or one labeled in another language.</dd>
                </div>
                <div>
                  <dt>Passwords</dt>
                  <dd>
                    The model can&apos;t type plain text into a password or one-time code field. It has to use <code>secret</code>, which keeps the text out of logs
                    and traces.
                  </dd>
                </div>
              </dl>
              <p className="hm-end-links">
                <Link href="/docs/approval-guard/">
                  How the guard decides
                  <Arrow />
                </Link>
              </p>
            </div>
          </div>
          <p className="hm-say">
            The human said no. <b>Nothing was charged.</b>
          </p>
        </div>
      </section>

      <section className="stop" id="lanes" data-weave="thin">
        <Route n={5} say={STOPS[4][2]} short={STOPS[4][3]} />
        <div className="wrap">
          <div className="hm-stat">
            <div>
              <h2>One phone. A screen for each agent.</h2>
              <p className="lede">
                On Android 13 and later, each agent works on a hidden screen of its own on the same phone. They run at the same time, and the screen in your hand
                stays yours.
              </p>
            </div>
            <p className="hm-pair" aria-hidden="true" data-land="" data-at=".07">
              <span>
                1<small>phone</small>
              </span>
              <i>→</i>
              <b>
                {LANES.length}
                <small>screens in use at once</small>
              </b>
            </p>
          </div>
          <figure className="ln pane" data-wall={lanes.wall} data-rate={lanes.rate} data-life="">
            <figcaption className="pane-head">
              <span>{lanes.device}</span>
              <div className="race-ctl" hidden>
                <button type="button" className="race-btn race-play">
                  Pause
                </button>
              </div>
            </figcaption>
            <div className="ln-body">
            <ol className="ln-screens">
              {LANES.map((l) => (
                <li className={l.id ? "ln-s" : "ln-s yours"} data-lane={l.id || "main"} key={l.id}>
                  <p className="ln-id">
                    <b>{l.id ? `+${l.id}` : "main"}</b>
                    <span>{l.who}</span>
                  </p>
                  <div className="ln-shot">
                    {l.frames.map((f, i) => (
                      <img key={f.src} src={f.src} data-t={f.t} data-on={i === l.frames.length - 1 ? "" : undefined} width={SHOT[0] / 2} height={SHOT[1] / 2} alt={i === l.frames.length - 1 ? l.alt : `${l.who}, ${(f.t / 1000).toFixed(1)} s into the run`} aria-hidden={i === l.frames.length - 1 ? undefined : true} decoding="async" loading="lazy" />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            <div className="ln-score">
              {LANES.map((l) => (
                <div className={l.id ? "ln-row" : "ln-row yours"} data-lane={l.id || "main"} key={l.id}>
                  <span className="ln-who">{l.id ? `+${l.id}` : "main"}</span>
                  <span className="ln-track" aria-hidden="true">
                    {l.steps.map((st) => (
                      <b
                        key={st.t0}
                        data-t0={st.t0}
                        data-t1={st.t1}
                        data-cmd={st.cmd}
                        data-reply={st.reply}
                        style={{ left: `${(st.t0 / lanes.wall) * 100}%`, width: `${((st.t1 - st.t0) / lanes.wall) * 100}%` }}
                      />
                    ))}
                    <i />
                  </span>
                  {l.id ? (
                    <span className="ln-now" data-s="done">
                      {l.steps[l.steps.length - 1].reply}
                    </span>
                  ) : (
                    <span className="ln-now" data-s="wait">
                      no calls, it is yours
                    </span>
                  )}
                </div>
              ))}
              <span className="ln-head" aria-hidden="true" />
              <input className="ln-scrub" type="range" min={0} max={lanes.wall} step={10} defaultValue={lanes.wall} aria-label="Time in the recording, in milliseconds" />
              <p className="ln-ruler" aria-hidden="true">
                <span>0 s</span>
                <output className="ln-clock">{secs(lanes.wall)}</output>
                <span>{secs(lanes.wall)}</span>
              </p>
            </div>
            </div>
            <p className="race-cap">
              One recording on an Android 17 emulator, {LANED}. Each bar is one call, from the moment it was sent to its reply, and each screen is what that
              display showed then. The two jobs took {secs(lanes.wall)} side by side and {secs(lanes.serial)} one after the other. It plays here at twice its speed; drag the line to move through it. <Link href="/docs/android-phone/#a-hidden-screen-for-the-agent">How to give each agent a lane</Link>
            </p>
            <LanesEngine />
          </figure>
          <div className="ln-after">
            <div className="tw">
              <table>
                <caption>
                  <code>phonedriver devices</code>, during the run
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Id</th>
                    <th scope="col">Lease</th>
                    <th scope="col">Display</th>
                  </tr>
                </thead>
                <tbody>
                  {lanes.devices.map(([id, lease, display]) => (
                    <tr key={id}>
                      <th scope="row">{id}</th>
                      <td>{lease}</td>
                      <td>{display}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hm-note">
              A device id that ends in <code>+a</code> or <code>+b</code> is a lane. One agent that only needs to stay off your screen sets{" "}
              <code>PHONEDRIVER_DISPLAY=hidden</code>. Two lanes cannot show the same app, and typing into a web page shows the system&apos;s clipboard note. Tested
              on an emulator and on a {PHONE.name} ({PHONE.os}).
            </p>
          </div>
        </div>
      </section>

      <section className="stop" id="saved-runs">
        <Route n={6} say={STOPS[5][2]} short={STOPS[5][3]} />
        <div className="wrap">
          <div className="hm-stat">
            <div>
              <h2>A run that worked becomes a test.</h2>
              <p className="lede">
                Save what the agent did as a steps file. Replay it with no model, on your machine or on every commit. It stops at the first step that fails, or at
                the first screen whose text changed.
              </p>
            </div>
            <p className="hm-pair" aria-hidden="true" data-land="" data-at=".07">
              <b>
                0<small>tokens to replay a saved run</small>
              </b>
            </p>
          </div>
          <div className="rp" data-life="">
            <figure className="pane rp-file">
              <figcaption className="pane-head">
                <span>{replay.file}</span>
                <span>{replay.saved.replace(` to ${replay.file}`, "")}</span>
              </figcaption>
              <ol className="rp-steps">
                {replay.steps.map((line, i) => (
                  <li key={i} style={{ "--n": i } as React.CSSProperties} data-stop={i === replay.stops - 1 ? "" : undefined}>
                    {line}
                  </li>
                ))}
              </ol>
            </figure>
            <div className="rp-runs">
            <div className="rp-run rp-first">
              <Pane title="the first replay" note="no model" lines={replay.first} label="Output of the first phonedriver replay" />
            </div>
            <div className="rp-run rp-second">
              <Pane title={replay.changed} note={`stops at step ${replay.stops}`} lines={replay.second} label="Output of the replay after the change" />
            </div>
            </div>
            <figure className="rp-shots">
              <div>
                <img src={replay.kept.src} width={360} height={808} alt={replay.kept.alt} decoding="async" loading="lazy" />
                <p>the screen it kept</p>
              </div>
              <div className="now">
                <span className="rp-shot">
                  <img src={replay.now.src} width={360} height={808} alt={replay.now.alt} decoding="async" loading="lazy" />
                  <i aria-hidden="true" style={{ left: `${replay.box[0] * 100}%`, top: `${replay.box[1] * 100}%`, width: `${replay.box[2] * 100}%`, height: `${replay.box[3] * 100}%` }} />
                </span>
                <p>the screen it found</p>
              </div>
            </figure>
            <p className="tv-cap rp-cap">
              One run on an Android 17 emulator, {LANED}. Wi-Fi was turned off between the two replays, so the Internet row changed. Each reply is cut where its
              list of the screen&apos;s elements starts.
            </p>
          </div>
          <div className="rp-ci">
            <div>
              <h3>On every commit</h3>
              <p>
                The repository is also a GitHub Action. It starts an Android emulator or an iOS Simulator, installs your build and replays each file. A run that
                stops fails the job, and its screen, reply and video are kept.
              </p>
              <p className="hm-end-links">
                <Link href="/docs/replay-in-ci/">
                  Replay in CI
                  <Arrow />
                </Link>
              </p>
            </div>
            <Pane title=".github/workflows/replay.yml" lines={ACTION} label="A GitHub Actions workflow that replays saved runs" />
          </div>
        </div>
      </section>

      <section className="stop" id="how-it-works">
        <Route n={7} say={STOPS[6][2]} short={STOPS[6][3]} />
        <div className="wrap">
          <div className="hm-head">
            <h2>How it works.</h2>
            <p className="lede">
              On Android there is no app to install. phonedriver pushes its helper over adb when it connects. On iOS it builds a small XCTest runner on your Mac, and on the Simulator a tap goes to the Simulator&apos;s own touch input.
            </p>
          </div>
          <div>
            <ol className="flow" data-land="" data-at=".705">
              <li>
                <h3>Your agent</h3>
                <p>Claude Code, Codex, Cursor or a script. It calls the tools over MCP, or runs the same commands in a shell.</p>
                <span className="flow-via">MCP or CLI</span>
                <span className="flow-tr" aria-hidden="true">
                  <i />
                </span>
              </li>
              <li>
                <h3>A daemon on your computer</h3>
                <p>
                  It keeps the connection open and remembers which <code>@e</code> number is which element, so a tap still lands after a list has moved.
                </p>
                <span className="flow-via">adb or Xcode</span>
                <span className="flow-tr" aria-hidden="true">
                  <i />
                </span>
              </li>
              <li>
                <h3>A helper on the phone</h3>
                <p>
                  It reads the accessibility tree and streams the screen as video, which is how phonedriver knows the screen has stopped changing.
                </p>
              </li>
            </ol>
            <div className="works" id="works-with">
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Works with</th>
                      <th scope="col">You need</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEVICES.map(([d, need]) => (
                      <tr key={d}>
                        <th scope="row">{d}</th>
                        <td>{need}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="hm-count">
                  <b>{TOOLS.length}</b> tools, as an MCP server and a CLI
                </h3>
                <ul className="tools">
                  {TOOLS.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p className="hm-note">
                  phonedriver sends no telemetry. After the first download it connects only to your device, and a test runs the whole tool in a sandbox that blocks
                  every other connection. <a href={raw("docs/architecture.md")}>Architecture</a> and <a href={raw("docs/decisions.md")}>design decisions</a> are in the
                  repository.
                </p>
              </div>
            </div>
            <div className="also">
              <h3 className="hm-kick">Also new in {VERSION}</h3>
              <ul>
                {ALSO.map(([cmd, what, href]) => (
                  <li key={cmd}>
                    <Link href={href}>
                      <code>{cmd}</code>
                      <span>{what}</span>
                      <Arrow />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="stop" id="limits" data-weave="thin">
        <Route n={8} say={STOPS[7][2]} short={STOPS[7][3]} />
        <div className="wrap hm-rail">
          <h2>Limits and questions.</h2>
          <div>
            <ul className="limits" data-land="">
              <li>
                Tested on Android emulators (API 26 and 37), a {PHONE.name} ({PHONE.os}), the iOS Simulator, an iPhone 13 Pro Max, an iPhone 14 Plus and an iPad Pro. Other
                Android phones use the same path.
              </li>
              <li>
                A tap takes {Math.round(op("tap_paced").phonedriver)} to {Math.round(op("tap").phonedriver)} ms on an Android emulator and 450 to 530 ms on a real iPhone.
              </li>
              <li>The model can do anything on the phone you could do with your finger. For unattended runs, use an emulator or a spare phone.</li>
              <li>phonedriver never enters a passcode and can&apos;t pass Face ID or a fingerprint check, so a phone that locks mid-task stops the task.</li>
              <li>Screens that block screenshots, as some banking apps do, come out black in a screenshot. Their text can still be read.</li>
            </ul>
            <div className="faq" id="faq">
              {HOME_FAQ.map(([q, a], i) => (
                <details className="qa" name="faq" key={q} open={i === 0}>
                  <summary>
                    <h3>{q}</h3>
                  </summary>
                  <Html html={`<p>${inline(a)}</p>`} />
                </details>
              ))}
              <p className="small">
                More answers, on speed, tokens, iPhones and other tools, are in <Link href="/faq/">the FAQ</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="stop hm-end" id="install">
        <Route n={9} say={STOPS[8][2]} short={STOPS[8][3]} />
        <div className="wrap end">
          <div className="end-copy">
            <h2>Give your agent a phone.</h2>
            <p className="lede">
              Paste one prompt, or run one command. Either way phonedriver is added to the agents on your machine, your setup is checked, and you are told what to plug in.
            </p>
            <p className="hm-end-links">
              <Link href="/docs/">
                Read the docs
                <Arrow />
              </Link>
              <a href={REPO}>
                <Star />
                Star it on GitHub
              </a>
              <span>Free and open source, AGPL-3.0</span>
            </p>
          </div>
          <div className="end-pane">
            <canvas className="end-fig" aria-hidden="true" />
            <EndEngine />
            <div className="ins" role="group" aria-label="Your client" data-land="">
              <TabsEngine />
              <div className="ins-tabs">
                {CLIENTS.map((c, i) => (
                  <label key={c.id}>
                    <input type="radio" name="client" value={c.id} defaultChecked={i === 0} />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
              {CLIENTS.map((c) =>
                c.cmd ? (
                  <div className="ins-panel" data-for={c.id} key={c.id}>
                    <code>
                      <i aria-hidden="true">$ </i>
                      {c.cmd}
                    </code>
                    <button type="button" className="btn" data-copy={c.cmd}>
                      Copy
                    </button>
                  </div>
                ) : c.say ? (
                  <div className="ins-panel json" data-for={c.id} key={c.id}>
                    <blockquote className="ins-say" data-life="">
                      {c.say}
                      <TypeEngine />
                    </blockquote>
                    <p>
                      <span>Paste it into Claude Code, Codex, Cursor or any agent that can run commands.</span>
                      <button type="button" className="btn ghost ins-share" data-share={`${c.say}\n\n${url("/")}`}>
                        Send it to yourself
                      </button>
                      <button type="button" className="btn" data-copy={c.say} data-next="">
                        Copy the prompt
                      </button>
                    </p>
                  </div>
                ) : (
                  <div className="ins-panel json" data-for={c.id} key={c.id}>
                    <pre tabIndex={0} aria-label={`MCP server entry for ${c.file}`}>
                      <code>{CONFIG}</code>
                    </pre>
                    <p>
                      <span>Goes in {c.file}</span>
                      {c.id === "cursor" && (
                        <a className="btn ghost" href={CURSOR}>
                          Add to Cursor
                          <Arrow />
                        </a>
                      )}
                      <button type="button" className="btn" data-copy={CONFIG}>
                        Copy
                      </button>
                    </p>
                  </div>
                ),
              )}
            </div>
            <p className="hm-note">
              The first run downloads one binary for macOS, Linux or Windows. Homebrew, the shell installer and real iPhones are in the{" "}
              <Link href="/docs/install/">install guide</Link>.
            </p>
          </div>
          <div className="end-asks">
            <h3 className="hm-kick">Then give it a job only a phone can do</h3>
            <ul className="asks">
              {ASKS.map((a) => (
                <li key={a}>
                  <p>{a}</p>
                  <button type="button" className="ask-cp" data-copy={a} aria-label="Copy this prompt">
                    <span data-label>Copy</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <Paste />
      <JourneyEngine />
    </>
  );
}
