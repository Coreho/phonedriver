import Link from "next/link";
import { Arrow, Html, JsonLd, Pane, Star } from "@/components/Bits";
import { DotsEngine, EndEngine, HoldEngine, LanesEngine, MarkEngine, ReplayEngine, TraceEngine, JourneyEngine, PalmEngine, PointEngine, RaceEngine, TabsEngine, TypeEngine, ViewsEngine } from "@/components/Engines";
import { Hero } from "@/components/Hero";
import { Paste } from "@/components/Paste";
import { Route } from "@/components/Route";
import { HARNESSES, PHONE, SIM_STEPS, TASKS, VERSIONS, board, minutes, ms, op, ratio, short, simulator, tokens, type Cell, type Harness, type SimKey } from "@/lib/bench";
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

const RUNS = [
  ["Agent run", "an agent, with a model"],
  ["Replay", "replay, no model"],
  ["After a change", "replay, after Wi-Fi was turned off"],
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
const SLOW = 25;
const LANED = new Date(`${lanes.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

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
  const SIM_ORDER: SimKey[] = ["read", "tap", "flow", "type", "flowBatch"];
  const RACES = [
    {
      id: "emulator",
      name: "Android emulator",
      cap: "Medians of 50 runs on an Android 17 emulator, against adb.",
      href: "/benchmarks/#speed",
      rows: race.map(({ label, o }) => ({ label, fig: ratio(o.adb / o.phonedriver), lanes: [["phonedriver", o.phonedriver], ["adb", o.adb]] as [string, number][] })),
      note: null as React.ReactNode,
    },
    {
      id: "phone",
      name: "Real phone",
      cap: `Medians on a ${PHONE.name} (${PHONE.os}), against adb.`,
      href: "/benchmarks/#speed",
      rows: (
        [
          ["Read the screen", PHONE.read],
          ["Take a screenshot", PHONE.shot],
        ] as [string, readonly number[]][]
      ).map(([label, [us, adb]]) => ({ label, fig: ratio(adb / us), lanes: [["phonedriver", us], ["adb", adb]] as [string, number][] })),
      note: null as React.ReactNode,
    },
    {
      id: "simulator",
      name: "iOS Simulator",
      cap: `Medians on an ${sim.device} Simulator, ${sim.date}, against three other tools.`,
      href: "/benchmarks/#simulator",
      rows: SIM_ORDER.map((k) => ({
        label: SIM_STEPS.find(([id]) => id === k)![1],
        fig: "",
        lanes: sim.tools.map((t) => [t.tool, t[k].medianMs] as [string, number]),
      })),
      note: (
        <>
          <b>Why simulator-use types faster.</b> It presses keys on the Simulator&apos;s hardware keyboard, so the on-screen keyboard never opens. An iPhone has no such shortcut. phonedriver types the
          way it does on an iPhone and waits for the keyboard.
        </>
      ),
    },
  ];
  const read = race[0].o;
  const LIMITS = [
    ["Which devices is it tested on?", `Android emulators (API 26 and 37), a ${PHONE.name} (${PHONE.os}), the iOS Simulator, an iPhone 13 Pro Max, an iPhone 14 Plus and an iPad Pro. Other Android phones use the same path.`],
    ["How long does a tap take?", `${Math.round(op("tap_paced").phonedriver)} to ${Math.round(op("tap").phonedriver)} ms on an Android emulator and 450 to 530 ms on a real iPhone.`],
    ["Should I let it run on my own phone unattended?", "The model can do anything on the phone you could do with your finger. For unattended runs, use an emulator or a spare phone."],
    ["What happens if the phone locks?", "The task stops. phonedriver never enters a passcode and can't pass Face ID or a fingerprint check."],
    ["Does it work in banking apps?", "Screens that block screenshots, as some banking apps do, come out black in a screenshot. Their text can still be read."],
  ];
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
      mainEntity: [...HOME_FAQ, ...LIMITS].map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: plain(a) } })),
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
                Nine jobs only a phone can do, run with Claude Sonnet 5.5 through three MCP servers and checked against the phone&apos;s own data.{" "}
                <Link href="/benchmarks/">How it was measured</Link>
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
              <p className="lede">Each screen arrives as a short numbered list, and the model taps by number.</p>
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
                After every tap, phonedriver waits for the screen to settle and replies with only the lines that changed.
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
              A helper stays on the phone with the connection open, where <Link href="/compare/adb/">adb</Link> starts a new process on every call.
            </p>
          </div>
          <figure className="race pane" data-slow={SLOW} data-land="" data-at=".72" data-life="" data-point="ol:not([hidden]) li:first-child .race-lane.us .race-ms" data-point-at="900">
            <figcaption className="pane-head">
              <div className="race-seg race-devs" role="group" aria-label="Device">
                {RACES.map((r, i) => (
                  <button type="button" className="race-btn" data-dev={r.id} aria-pressed={i === 0} key={r.id}>
                    {r.name}
                  </button>
                ))}
              </div>
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
            {RACES.map((r, i) => (
              <ol key={r.id} data-for={r.id} hidden={i > 0} className={r.rows[0].lanes.length > 2 ? "many" : undefined}>
                {r.rows.map((row) => (
                  <li key={row.label}>
                    <p className="race-name">
                      {row.label}
                      {row.fig && <b>{row.fig}</b>}
                    </p>
                    {row.lanes.map(([who, t]) => (
                      <p className={who === "phonedriver" ? "race-lane us" : "race-lane"} key={who}>
                        <span className="race-who">{who}</span>
                        <span className="race-track" aria-hidden="true">
                          <i data-ms={t} />
                        </span>
                        <span className="race-ms">{ms(t)} ms</span>
                      </p>
                    ))}
                  </li>
                ))}
                {r.note && <li className="race-note">{r.note}</li>}
              </ol>
            ))}
            {RACES.map((r, i) => (
              <p className="race-cap" data-for={r.id} hidden={i > 0} key={r.id}>
                Each ball is one call, out and back. {r.cap} <Link href={r.href}>How it was measured</Link>
              </p>
            ))}
            <canvas className="pf" aria-hidden="true" />
            <i className="pf-ring" aria-hidden="true" />
            <RaceEngine />
            <PointEngine host=".race" />
          </figure>
        </div>
      </section>

      <section className="stop" id="asking-before-it-pays">
        <Route n={4} say={STOPS[3][2]} short={STOPS[3][3]} />
        <div className="wrap">
          <div className="pay">
            <div className="pay-l">
              <h2>It asks you before it taps Pay.</h2>
              <p className="lede">The tap waits for your answer.</p>
              <i className="pay-route" aria-hidden="true" />
              <div className="ask" data-life="" role="img" aria-label="The approval question from the recorded run, answered Decline">
                <p style={at(0)}>{ASKED[1]}</p>
                <p className="ask-what" style={at(160)}>
                  {ASKED[2]}
                </p>
                <p className="ask-pick" style={at(700)}>
                  <span>Accept</span>
                  <b style={at(1300)}>
                    <i aria-hidden="true">❯</i>Decline
                  </b>
                </p>
                <p className="ask-rec" style={at(1500)}>
                  Recorded {run.date}, Claude Code
                </p>
              </div>
              <p className="hm-say" style={at(0)}>
                The human said no. <b>Nothing was charged.</b>
              </p>
              <p className="hm-end-links">
                <a href="/assets/demo.mp4">Watch the recording</a>
                <Link href="/docs/approval-guard/">
                  How the guard decides
                  <Arrow />
                </Link>
              </p>
              <p className="tv-cap">It reads button labels in eleven languages. It does not catch a button that is only an icon.</p>
            </div>
            <div className="pay-r ask-stage" data-land="" data-at=".1">
              <figure className="pay-crop">
                <img src="/assets/run-poster.jpg" width={540} height={1212} alt="The checkout in the recorded run: a total of £24.99 above a Buy with Google Pay button" decoding="async" loading="lazy" />
                <figcaption>held</figcaption>
              </figure>
              <canvas className="ask-fig" aria-hidden="true" />
              <PalmEngine />
            </div>
          </div>
        </div>
      </section>

      <section className="stop" id="lanes" data-weave="thin">
        <Route n={5} say={STOPS[4][2]} short={STOPS[4][3]} />
        <div className="wrap">
          <div className="hm-head" data-land="" data-at=".2">
            <h2>One phone. Five agents.</h2>
            <p className="lede">Each agent gets a hidden Android screen. Your screen stays yours.</p>
          </div>
          <figure className="ln" data-length={lanes.length} data-life="">
            <div className="ln-stage">
              <canvas className="ln-field" aria-hidden="true" />
              <svg className="ln-routes" aria-hidden="true" />
              <div className="ln-s yours">
                <p className="ln-id">Your screen</p>
                <div className="ln-shot">
                  <img src={lanes.main} width={360} height={808} alt="The phone's own screen during the run: its home screen, with no agent on it." decoding="async" loading="lazy" />
                </div>
              </div>
              {lanes.lanes.map((l, i) => (
                <div className="ln-s" data-lane={l.id} data-steps={JSON.stringify(l.steps)} style={{ "--n": i } as React.CSSProperties} key={l.id}>
                  <p className="ln-id">{l.app}</p>
                  <div className="ln-shot">
                    <video src={l.src} poster={l.poster} width={320} height={718} muted playsInline preload="metadata" aria-label={`A recording of agent ${l.id}'s hidden screen, in ${l.app}`} />
                    <i className="ln-tap" aria-hidden="true" />
                  </div>
                  <p className="ln-now">{l.steps[l.steps.length - 1].cmd}</p>
                </div>
              ))}
            </div>
            <div className="ln-bar">
              <span className="race-ctl" hidden>
                <button type="button" className="ln-play race-play">
                  Pause
                </button>
              </span>
              <input className="ln-scrub" type="range" min={0} max={lanes.length} step={10} defaultValue={lanes.length} aria-label="Time in the recording, in milliseconds" />
              <output className="ln-clock">{secs(lanes.wall)}</output>
            </div>
            <p className="tv-cap">
              One recording at real speed, {LANED}: five agents finish five jobs on one Android 17 emulator in {secs(lanes.wall)}.{" "}
              <Link href="/docs/android-phone/#a-hidden-screen-for-the-agent">Give each agent a lane</Link>
            </p>
            <LanesEngine />
          </figure>
        </div>
      </section>

      <section className="stop" id="saved-runs">
        <Route n={6} say={STOPS[5][2]} short={STOPS[5][3]} />
        <div className="wrap">
          <div className="hm-head" data-land="" data-at=".2">
            <h2>A run that worked becomes a test.</h2>
            <p className="lede">Replay a saved run without a model. It stops at the first screen that changed.</p>
          </div>
          <div className="rp" data-life="" data-halt="" data-pass="2" data-passes={JSON.stringify(replay.passes.map((p) => ({ length: p.length, steps: p.steps })))} data-stops={replay.stops}>
            <div className="rp-tabs" role="group" aria-label="Which run to watch">
              {RUNS.map(([name, mode], i) => (
                <button type="button" data-run={i} data-mode={mode} aria-pressed={i === 2} key={name}>
                  {name}
                </button>
              ))}
            </div>
            <div className="rp-stage">
              <p className="rp-mode">{RUNS[2][1]}</p>
              <div className="rp-way">
                <canvas className="rp-field" aria-hidden="true" />
                <svg aria-hidden="true">
                  <clipPath id="rp-done">
                    <rect x="-40" y="0" width="0" height="0" />
                  </clipPath>
                  <path className="rp-base" />
                  <path className="rp-done" clipPath="url(#rp-done)" />
                </svg>
                <ol>
                  {replay.steps.map((line, i) => (
                    <li key={i} data-s={i < replay.stops - 1 ? "ok" : i === replay.stops - 1 ? "stop" : "skip"}>
                      <button type="button" data-step={i}>
                        <b>{String(i + 1).padStart(2, "0")}</b>
                        <span>{line}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <i className="rp-car" aria-hidden="true" />
                <canvas className="rp-fig" aria-hidden="true" />
                <HoldEngine />
              </div>
              <figure className="rp-want">
                <img src={replay.saved} width={360} height={808} alt={`The screen saved with step ${replay.stops} when the run was recorded`} decoding="async" loading="lazy" />
                <figcaption>saved</figcaption>
                <i className="rp-box" aria-hidden="true" style={{ left: `${replay.box[0] * 100}%`, top: `${replay.box[1] * 100}%`, width: `${replay.box[2] * 100}%`, height: `${replay.box[3] * 100}%` }} />
              </figure>
              <div className="rp-phone">
                {replay.passes.map((p, i) => (
                  <video key={p.src} src={p.src} poster={p.poster} width={360} height={808} muted playsInline preload="metadata" data-run={i} data-on={i === 2 ? "" : undefined} aria-label={`A recording of the phone: ${RUNS[i][0]}`} />
                ))}
                <i className="ln-tap" aria-hidden="true" />
                <i className="rp-box" aria-hidden="true" style={{ left: `${replay.box[0] * 100}%`, top: `${replay.box[1] * 100}%`, width: `${replay.box[2] * 100}%`, height: `${replay.box[3] * 100}%` }} />
                <span className="rp-tag">now</span>
              </div>
            </div>
            <p className="rp-say" data-says={JSON.stringify([`saved ${replay.steps.length} steps to ${replay.file}`, replay.matched, `Stopped at step ${replay.stops} of ${replay.steps.length}: ${replay.change}`])}>
              Stopped at step {replay.stops} of {replay.steps.length}: {replay.change}
            </p>
            <details className="qa rp-out">
              <summary>
                <span>Show the output</span>
              </summary>
              <div className="rp-panes">
                <Pane title="replay" note="no model" lines={replay.first} label="Output of a phonedriver replay that matched" />
                <Pane title="replay, after Wi-Fi was turned off" note={`stops at step ${replay.stops}`} lines={replay.second} label="Output of the replay after the change" />
              </div>
            </details>
            <p className="tv-cap rp-cap">
              Recorded on an Android 17 emulator, {LANED}. Tap a stop to jump to it. The <Link href="/docs/replay-in-ci/">GitHub Action</Link> replays saved runs on every
              commit.
            </p>
            <ReplayEngine />
          </div>
        </div>
      </section>

      <section className="stop" id="how-it-works">
        <Route n={7} say={STOPS[6][2]} short={STOPS[6][3]} />
        <div className="wrap">
          <div className="hm-head">
            <h2>How it works.</h2>
            <p className="lede">Follow one tap from the agent to Android and back.</p>
          </div>
          <div>
            <figure className="tr" data-land="" data-at=".4" data-life="" data-step="5" data-t={replay.passes[0].steps[replay.trace.step].t} data-tap={JSON.stringify(replay.passes[0].steps[replay.trace.step].at)}>
              <div className="tr-n tr-agent">
                <h3>Your agent</h3>
                <p className="tr-line">
                  <code className="tr-chip">{replay.trace.cmd}</code>
                  <i className="tr-wire" data-via="MCP / CLI" aria-hidden="true" />
                </p>
                <p className="tr-d">Claude Code, Codex, Cursor or a script.</p>
              </div>
              <div className="tr-n tr-daemon">
                <h3>Local daemon</h3>
                <p className="tr-line">
                  <span className="tr-core">
                    <canvas className="tr-stack" aria-hidden="true" />
                    <span className="tr-ref">
                      <b>{replay.trace.reply[0].match(/@e\d+/)![0]}</b> is {replay.trace.cmd.replace(/^tap /, "")}
                    </span>
                  </span>
                  <i className="tr-wire" data-via="adb or Xcode" aria-hidden="true" />
                </p>
                <p className="tr-d">
                  It keeps the connection open and remembers which <code>@e</code> number is which element.
                </p>
              </div>
              <div className="tr-n tr-phone">
                <h3>Phone helper</h3>
                <div className="tr-shot">
                  <video src={replay.passes[0].src} poster={replay.passes[0].poster} width={360} height={808} muted playsInline preload="metadata" aria-label="A recording of the phone taking the tap" />
                  <i className="ln-tap" aria-hidden="true" />
                </div>
                <p className="tr-d">Nothing to install: it goes over adb on Android, and Xcode builds a small runner for iOS.</p>
              </div>
              <div className="tr-back">
                <div className="tr-up">
                  <h3>Screen update</h3>
                  <pre>{replay.trace.reply.join("\n")}</pre>
                </div>
                <canvas className="tr-stream" aria-hidden="true" />
              </div>
              <button type="button" className="ln-play tr-play" hidden>
                Trace a tap
              </button>
              <i className="tr-dot" aria-hidden="true" />
              <TraceEngine />
            </figure>
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
                  phonedriver sends no telemetry: after the first download it connects only to your device. <a href={raw("docs/architecture.md")}>Architecture</a> and{" "}
                  <a href={raw("docs/decisions.md")}>design decisions</a> are in the repository.
                </p>
              </div>
            </div>
            <div className="also">
              <h3 className="hm-kick">
                Also new in {VERSION} <Link href="/changelog/">Everything in it</Link>
              </h3>
              <ul className="tools">
                {ALSO.map(([cmd, what, href]) => (
                  <li key={cmd}>
                    <Link href={href} title={what}>
                      {cmd}
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
          <div className="faq-side">
            <h2>Questions and limits.</h2>
            <canvas className="faq-mark" data-mark="?" aria-hidden="true" />
            <MarkEngine />
          </div>
          <div>
            <div className="faq" id="faq">
              <div className="faq-list" data-land="">
                {[
                  ["Getting started", HOME_FAQ],
                  ["Limits", LIMITS],
                ].map(([group, items], g) => (
                  <div className="faq-group" key={group as string}>
                    <h3 className="hm-kick">{group as string}</h3>
                    {(items as string[][]).map(([q, a], i) => (
                      <details className="qa" name="faq" key={q} open={g === 0 && i === 0}>
                        <summary>
                          <h3>{q}</h3>
                        </summary>
                        <Html html={`<p>${inline(a)}</p>`} />
                      </details>
                    ))}
                  </div>
                ))}
                <p className="small">
                  More answers, on speed, tokens, iPhones and other tools, are in <Link href="/faq/">the FAQ</Link>.
                </p>
              </div>
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
              Paste one prompt or run one command, and phonedriver is added to the agents on your machine.
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
