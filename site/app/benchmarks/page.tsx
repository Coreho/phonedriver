import Link from "next/link";
import { JsonLd } from "@/components/Bits";
import { PageTop } from "@/components/PageTop";
import {
  HARNESSES,
  PHONE,
  SIM_STEPS,
  TASKS,
  VERSIONS,
  board,
  fmt,
  minutes,
  ms,
  op,
  ratio,
  short,
  simulator,
  speed,
  tokens,
  type Cell,
  type Harness,
  type Op,
  type SimKey,
  type SimTool,
} from "@/lib/bench";
import { JOBS } from "@/lib/data";
import { meta } from "@/lib/meta";
import { AUTHOR, PUBLISHER, REPO, TODAY, raw, url } from "@/lib/site";
import "../charts.css";

const THREE: Harness[] = ["phonedriver", "phone-harness", "mobile-mcp"];

export function generateMetadata() {
  const b = board();
  const fewer = ratio(b.total("mobile-mcp").tokens / b.total("phonedriver").tokens);
  const read = op("tree_list");
  return meta({
    path: "/benchmarks/",
    title: `phonedriver benchmarks: ${fewer} fewer tokens, ${ratio(read.adb / read.phonedriver)} faster than adb`,
    description: `Nine real phone jobs with Claude Sonnet 5.5: phonedriver used ${fewer} fewer tokens than mobile-mcp. Speed against adb, and the iOS Simulator against simulator-use, agent-device and Argent. Raw data.`,
    og: "/og/benchmarks.png",
    md: true,
  });
}

function Speed({ o }: { o: Op }) {
  const rows: [string, number | null, number | null | undefined][] = [
    ["phonedriver", o.phonedriver, o.phonedriver_p95],
    ["adb", o.adb, o.adb_p95],
    ["phone-harness", o.phone_harness, o.phone_harness_p95],
  ];
  const max = Math.max(...rows.map(([, , p95]) => p95 ?? 0));
  return (
    <div className="mblock">
      <h3>{o.label}</h3>
      {rows.map(([name, p50, p95]) => (
        <div className={name === "phonedriver" ? "mrow us" : "mrow"} key={name}>
          <span>{name}</span>
          {p50 == null ? (
            <span className="na">no equivalent</span>
          ) : (
            <>
              <span className="mbar" aria-hidden="true">
                <i style={{ "--f": p50 / max } as React.CSSProperties} />
                <b style={{ "--f": (p95 ?? 0) / max } as React.CSSProperties} />
              </span>
              <span className="mval">
                {fmt(p50)} ms<small>p95 {fmt(p95)}</small>
              </span>
            </>
          )}
        </div>
      ))}
      <p>
        {ratio(o.adb / o.phonedriver)} faster than adb
        {o.phone_harness && o.phone_harness_ratio_ci ? `, ${ratio(o.phone_harness / o.phonedriver)} faster than phone-harness` : ""}.
      </p>
    </div>
  );
}

const secs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${ms(v)} ms`);

function SimStep({ k, label, how, tools }: { k: SimKey; label: string; how: string; tools: SimTool[] }) {
  const max = Math.max(...tools.map((t) => t[k].p90Ms));
  const [first, second] = [...tools].sort((a, b) => a[k].medianMs - b[k].medianMs);
  return (
    <div className="mblock">
      <h3>{label}</h3>
      <p>{how}.</p>
      {tools.map((t) => (
        <div className={t.tool === "phonedriver" ? "mrow us" : "mrow"} key={t.tool}>
          <span>{t.name}</span>
          <span className="mbar" aria-hidden="true">
            <i style={{ "--f": t[k].medianMs / max } as React.CSSProperties} />
            <b style={{ "--f": t[k].p90Ms / max } as React.CSSProperties} />
          </span>
          <span className="mval">
            {secs(t[k].medianMs)}
            <small>p90 {secs(t[k].p90Ms)}</small>
            <small>{tokens(t[k].medianTokens)} tokens</small>
          </span>
        </div>
      ))}
      <p>
        {first.name} is fastest,{" "}
        {second[k].medianMs / first[k].medianMs < 1.1
          ? `${secs(second[k].medianMs - first[k].medianMs)} ahead of ${second.name}`
          : `${ratio(second[k].medianMs / first[k].medianMs)} faster than ${second.name}`}
        .
      </p>
    </div>
  );
}

const TOKENS: [string, string, string][] = [
  ['alarm-gym: 7:30 AM weekday alarm "Gym" in Clock', "110,419 (19.5 calls)", "220,723 (19 calls)"],
  ["wiki-birthdate: Chrome, Wikipedia, Grace Hopper's birth date", "57,753 (7 calls)", "53,403 (7 calls)"],
  ["testbed-web-form: fill and submit a web form", "50,185 (7 calls)", "56,249 (6 calls)"],
  ["Sum of the three medians", "218,357", "330,375"],
];

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export default function Benchmarks() {
  const ops = speed();
  const b = board();
  const us = b.total("phonedriver");
  const mm = b.total("mobile-mcp");
  const adb = b.total("adb");
  const most = Math.max(...THREE.map((h) => b.total(h).tokens));
  const read = op("tree_list");
  const jobs = TASKS.map((task) => ({ task, info: JOBS.find(([id]) => id.split(" ")[0] === task)!, cells: HARNESSES.map((h) => [h, b.cell(h, task)] as [Harness, Cell | null]).filter(([, c]) => c) as [Harness, Cell][] }));
  const slower = jobs.flatMap(({ task, cells }) => cells.filter(([h, c]) => h !== "phonedriver" && c.wall < cells[0][1].wall).map(([h, c]) => `${h} on ${task} (${c.wall} s against ${cells[0][1].wall} s)`));
  const fastest = jobs.filter(({ cells }) => cells.every(([, c]) => c.wall >= cells[0][1].wall)).length;
  const mixed = jobs.filter(({ cells }) => cells.some(([h]) => h === "adb")).reduce((n, j) => n + j.cells[0][1].tokens, 0);
  const sim = simulator();
  const pd = sim.tools[0];
  const simWins = SIM_STEPS.filter(([k]) => sim.tools.every((t) => t[k].medianMs >= pd[k].medianMs)).length;
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "phonedriver benchmarks: real phone jobs (2026-11-10), Android speed (2026-11-11) and the iOS Simulator (2026-11-17)",
      description: `Tokens, tool calls, wall time and pass counts for phonedriver, mobile-mcp 1.0.16, phone-harness 0.3.3 and adb on nine phone jobs run by Claude Sonnet 5.5; p50 and p95 latency of phonedriver, adb and phone-harness on an Android 17 emulator; and time and tokens of ${sim.tools.map((t) => `${t.name} ${t.version.replace(/^phonedriver /, "")}`).join(", ")} on simulator-use's iOS Simulator benchmark.`,
      url: url("/benchmarks/"),
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      creator: AUTHOR,
      dateModified: TODAY,
      distribution: [
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: url("/benchmarks/data/jobs.json") },
        { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: url("/benchmarks/data/speed-samples.csv") },
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: url("/benchmarks/data/speed.json") },
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: url("/benchmarks/data/simulator-summary.json") },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: "phonedriver benchmarks: real phone jobs, speed and raw data",
      url: url("/benchmarks/"),
      dateModified: TODAY,
      author: AUTHOR,
      publisher: PUBLISHER,
      inLanguage: "en",
      about: { "@id": url("/#software") },
    },
  ];
  return (
    <>
      <JsonLd data={ld} />
      <PageTop
        say="Prove it."
        crumbs={[["Benchmarks", "/benchmarks/"]]}
        md
        mark={<p className="pt-big or">{ratio(mm.tokens / us.tokens)}</p>}
        cap={`fewer tokens than mobile-mcp on nine real phone jobs, ${b.date}`}
      >
        <h1>Benchmarks</h1>
        <p className="lede">
          On nine real phone jobs, mobile-mcp used {ratio(mm.tokens / us.tokens)} the tokens of phonedriver, and reading a screen takes {fmt(read.phonedriver)} ms
          where adb takes {fmt(read.adb)} ms. On the iOS Simulator, in simulator-use&apos;s own benchmark, phonedriver was the fastest of four tools{" "}
          {simWins === SIM_STEPS.length ? "at every step" : `at ${simWins} of ${SIM_STEPS.length} steps`}; simulator-use typed faster by hiding the on-screen
          keyboard, which phonedriver keeps up as a phone does. Every number, what was thrown away and the raw data are below.
        </p>
        <ul className="jump">
          <li>
            <a href="#jobs">Real phone jobs</a>
          </li>
          <li>
            <a href="#speed">Speed</a>
          </li>
          <li>
            <a href="#simulator">iOS Simulator</a>
          </li>
          <li>
            <a href="#tokens">An earlier token run</a>
          </li>
          <li>
            <a href="#data">Raw data</a>
          </li>
        </ul>
      </PageTop>
      <div className="wrap">
        <article className="prose">
          <div className="body">
            <h2 id="jobs">Nine jobs only a phone can do</h2>
            <p>
              The result of each job cannot be produced by adb, <code>am</code>, <code>cmd</code>, <code>settings</code>, <code>content</code> or a web search. A
              script checks each one from the phone&apos;s own data, never from the agent&apos;s report.
            </p>
            <p>
              All tools ran on the same emulator on {b.date} with Claude Sonnet 5.5 through <code>claude -p</code>, one agent at a time: phonedriver three passes, the
              others two. The phonedriver build is <code>cfa37b2</code>; release 0.1.0 is that build plus Windows build and test fixes. Totals are sums of per-job
              medians.
            </p>
            <div className="tk-wrap wide">
              <table className="tk full">
                <caption className="vh">Totals over nine jobs: tokens, tool calls, runs passed and time, per tool</caption>
                <thead>
                  <tr>
                    <th scope="col">Tool</th>
                    <th scope="col">Tokens, nine jobs</th>
                    <th scope="col">Tool calls</th>
                    <th scope="col">Runs passed</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {THREE.map((h) => {
                    const t = b.total(h);
                    return (
                      <tr key={h} className={h === "phonedriver" ? "us" : undefined}>
                        <th scope="row">
                          {h} <span>{VERSIONS[h]}</span>
                        </th>
                        <td className="tk-bar">
                          <i style={{ "--f": t.tokens / most } as React.CSSProperties} />
                          <span>{tokens(t.tokens)}</span>
                        </td>
                        <td data-u="calls">{t.calls}</td>
                        <td className={t.passed < t.runs ? "miss" : undefined} data-u="passed">
                          {t.passed} of {t.runs}
                        </td>
                        <td>{minutes(t.wall)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p>
              adb ran only the two jobs where any route is allowed: {adb.passed} of {adb.runs} runs with {tokens(adb.tokens)} tokens. phonedriver&apos;s sum for the
              same two jobs is {tokens(mixed)}.
            </p>

            <h3>Each job</h3>
            <p>Bars are median tokens, drawn to scale within each job. After the bar: median tokens, runs passed, median tool calls and median wall time.</p>
            <div className="mgrid two wide">
              {jobs.map(({ task, info, cells }) => {
                const max = Math.max(...cells.map(([, c]) => c.tokens));
                return (
                  <div className="mblock" key={task}>
                    <h3>{info[0]}</h3>
                    <p>{info[1]}.</p>
                    {cells.map(([h, c]) => (
                      <div className={h === "phonedriver" ? "mrow us" : "mrow"} key={h}>
                        <span>{h}</span>
                        <span className="mbar" aria-hidden="true">
                          <i style={{ "--f": c.tokens / max } as React.CSSProperties} />
                        </span>
                        <span className="mval">
                          {short(c.tokens)}
                          <small className={c.passed < c.runs ? "miss" : undefined}>
                            {c.passed}/{c.runs}
                          </small>
                          <small>{c.calls} calls</small>
                          <small>{c.wall} s</small>
                        </span>
                      </div>
                    ))}
                    <p>{info[2]}.</p>
                  </div>
                );
              })}
            </div>

            <h3>Where phonedriver does not win</h3>
            <ul>
              <li>
                {slower.length
                  ? `phonedriver had the lowest median wall time on ${fastest} of the nine jobs. Not on these: ${list(slower)}.`
                  : "phonedriver had the lowest median wall time on every job."}{" "}
                Wall time includes the model&apos;s own thinking, so it moves with the day.
              </li>
              <li>
                These are two or three runs per cell on one emulator. They describe what happened and are not rates. Against its own 7 November runs phonedriver used{" "}
                {tokens(us.tokens)} tokens where it had used {tokens(b.before.phonedriver.sum_median_tokens)}, but the emulator was not the same one, so part of that
                is the device.
              </li>
            </ul>
            <p>
              What each tool failed at, the versions, and every run that was thrown away and why are in <a href={raw("docs/bench/jobs.md")}>docs/bench/jobs.md</a>. The
              method is in <Link href="/blog/benchmarking-ai-agents-on-jobs-only-a-phone-can-do/">Benchmarking AI agents on jobs only a phone can do</Link>, and the
              comparison write-up in{" "}
              <Link href="/blog/phonedriver-vs-mobile-mcp-vs-phone-harness-vs-adb-real-phone-jobs/">
                phonedriver vs mobile-mcp vs phone-harness vs adb on real phone jobs
              </Link>
              . If you maintain one of these tools and think I set it up wrong, <a href={`${REPO}/issues`}>open an issue</a> and I will rerun it.
            </p>

            <h2 id="speed">Speed against adb and phone-harness</h2>
            <p>
              p50 of 50 runs after 20 warm-ups, on an Android 17 emulator (API 37, headless, software rendering), with phonedriver 0.1.1 on 11 November 2026. The three
              tools ran interleaved on the emulator&apos;s own host, where CPU load was 31% to 80% from other work. Bars are drawn to scale within each operation;
              the tick is p95.
            </p>
            <div className="mgrid two wide">
              {ops.map((o) => (
                <Speed o={o} key={o.id} />
              ))}
            </div>
            <h3>Every operation, fastest gain first</h3>
            <p>
              How many times faster phonedriver is, with the 95% confidence interval under it, then each tool&apos;s median time with its slowest 1 in 20 (p95) under
              it.
            </p>
            <div className="tw">
              <table className="figs">
                <thead>
                  <tr>
                    <th scope="col">Operation</th>
                    <th scope="col">Faster than adb</th>
                    <th scope="col">phonedriver</th>
                    <th scope="col">adb</th>
                    <th scope="col">phone-harness</th>
                    <th scope="col">Faster than phone-harness</th>
                  </tr>
                </thead>
                <tbody>
                  {[...ops]
                    .sort((x, y) => y.adb / y.phonedriver - x.adb / x.phonedriver)
                    .map((o) => (
                      <tr key={o.id}>
                        <th scope="row">{o.label}</th>
                        <td className="x">
                          <b>{ratio(o.adb / o.phonedriver)}</b>
                          <small>
                            {fmt(o.adb_ratio_ci[0])} to {fmt(o.adb_ratio_ci[1])}
                          </small>
                        </td>
                        <td className="us">
                          <b>{fmt(o.phonedriver)} ms</b>
                          <small>p95 {fmt(o.phonedriver_p95)}</small>
                        </td>
                        <td>
                          <b>{fmt(o.adb)} ms</b>
                          <small>p95 {fmt(o.adb_p95)}</small>
                        </td>
                        <td>
                          {o.phone_harness == null ? (
                            <small>not supported</small>
                          ) : (
                            <>
                              <b>{fmt(o.phone_harness)} ms</b>
                              <small>p95 {fmt(o.phone_harness_p95)}</small>
                            </>
                          )}
                        </td>
                        <td className="x">
                          {o.phone_harness == null || !o.phone_harness_ratio_ci ? (
                            <small>n/a</small>
                          ) : (
                            <>
                              <b>{ratio(o.phone_harness / o.phonedriver)}</b>
                              <small>
                                {fmt(o.phone_harness_ratio_ci[0])} to {fmt(o.phone_harness_ratio_ci[1])}
                              </small>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <h3 id="phone">On a real phone</h3>
            <p>
              A smaller pass on a {PHONE.name} ({PHONE.os}) over USB, on 9 November 2026. 30 samples per phonedriver row and 20 per adb row; the two tools never ran at
              once.
            </p>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Operation</th>
                    <th scope="col">phonedriver p50</th>
                    <th scope="col">adb p50</th>
                    <th scope="col">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Read the screen</th>
                    <td>{PHONE.read[0]} ms</td>
                    <td>{fmt(PHONE.read[1])} ms</td>
                    <td>{ratio(PHONE.read[1] / PHONE.read[0])}</td>
                  </tr>
                  <tr>
                    <th scope="row">Screenshot</th>
                    <td>{PHONE.shot[0]} ms</td>
                    <td>{fmt(PHONE.shot[1])} ms</td>
                    <td>{ratio(PHONE.shot[1] / PHONE.shot[0])}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              The screen read was 461 bytes against 25,334 bytes of XML. On the phone&apos;s main Settings page, <code>uiautomator dump</code> failed with
              &quot;could not get idle state&quot; after 11.5 s, because the page never goes idle, while phonedriver read it in 110 ms. Typing and taps were not
              measured on the phone.
            </p>
            <h3>How to read it</h3>
            <ul>
              <li>
                The bare tap is the closest row. Host to reply, phonedriver takes {fmt(op("tap").phonedriver)} ms when taps come back to back (
                {(op("tap").adb / op("tap").phonedriver).toFixed(1)} times faster than adb) and {fmt(op("tap_paced").phonedriver)} ms when they are 1.5 s apart (
                {(op("tap_paced").adb / op("tap_paced").phonedriver).toFixed(1)} times). The tap misses its own 15 ms budget (decision D14), and typing 100 characters
                misses its 150 ms budget ({fmt(op("type100").phonedriver)} ms).
              </li>
              <li>
                adb returns raw XML and a tap that returns before the app reacts. phonedriver returns a pruned, numbered tree and waits for the app. Different outputs for
                the same job. For &quot;tap, then what changed&quot;, the adb row is a tap, one <code>uiautomator dump</code> and a diff in the caller.
              </li>
              <li>
                <code>adb shell input text</code> raises on non-ASCII text, and phone-harness cannot type Unicode. phonedriver typed 100 mixed-script characters (ASCII,
                accents, CJK, Arabic, emoji) in 160.6 ms.
              </li>
              <li>
                Fresh daemon to first screen read: phonedriver 1,620.5 ms, phone-harness 2,999.4 ms (new Python process), adb 2,488.0 ms (one dump; adb has no cold
                start, so this is for scale only).
              </li>
              <li>phone-harness&apos;s helpers ran in process, which spares it a Python start per call and favours it.</li>
              <li>
                No iOS device is in this run; the iOS Simulator has <a href="#simulator">its own comparison</a> below. On an iPhone 14 Plus and an iPad Pro (M5) a tap
                takes 534 and 454 ms, because XCTest takes about 240 ms to confirm the event (D15).
              </li>
            </ul>
            <p>
              The earlier 153x figure came from a quieter, single-tool run and is not current.{" "}
              <a href={raw("docs/bench/speed.md")}>The full method, machine state and the history of the number</a> are in the repo.
            </p>

            <h2 id="simulator">iOS Simulator against simulator-use, agent-device and Argent</h2>
            <p>
              This is <a href="https://github.com/NoMac-app/simulator-use/tree/main/bench">simulator-use&apos;s own benchmark</a>: its harness (MIT), its demo app,
              its five steps on the app&apos;s sign-in screen and its scoring script, with phonedriver added as one more tool. Each tool ran through its own MCP
              server, one at a time, each after a reboot of the Simulator, on {sim.date}: an {sim.device} Simulator ({sim.runtime}) on a
              Mac mini ({sim.env.hardware.cpu}, {sim.env.hardware.memoryGB} GB, macOS {sim.env.macos}, {sim.env.xcode.split(",")[0]}). The app&apos;s own log or
              the tool&apos;s next read checks every step, and every step of every tool passed. Tokens are the replies&apos; characters divided by 4, the
              harness&apos;s count without an API key. Bars are medians, drawn to scale within each step; the tick is p90.
            </p>
            <div className="mgrid two wide">
              {SIM_STEPS.map(([k, label, how]) => (
                <SimStep k={k} label={label} how={how} tools={sim.tools} key={k} />
              ))}
            </div>
            <h3>Every step, time and tokens</h3>
            <p>
              Median time, with the median tokens of the replies under it. The last column is what the tool list and the server&apos;s instructions put in the
              agent&apos;s context before its first call.
            </p>
            <div className="tw">
              <table className="figs">
                <thead>
                  <tr>
                    <th scope="col">Tool</th>
                    {SIM_STEPS.map(([k, label]) => (
                      <th scope="col" key={k}>
                        {label}
                      </th>
                    ))}
                    <th scope="col">Tool list</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.tools.map((t) => (
                    <tr key={t.tool}>
                      <th scope="row">
                        {t.name} <span>{t.version.replace(/^phonedriver /, "")}</span>
                      </th>
                      {SIM_STEPS.map(([k]) => (
                        <td key={k} className={t.tool === "phonedriver" ? "us" : undefined}>
                          <b>{secs(t[k].medianMs)}</b>
                          <small>{tokens(t[k].medianTokens)} tokens</small>
                        </td>
                      ))}
                      <td className={t.tool === "phonedriver" ? "us" : undefined}>
                        <b>{t.toolList.count} tools</b>
                        <small>{tokens(t.toolList.totalTokens)} tokens</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              These numbers are phonedriver 0.1.5; 0.1.4 taps and settles through XCTest. Before{" "}
              <a href={raw("docs/decisions.md#d93-on-the-ios-simulator-one-fingers-touches-and-the-settles-frames-go-through-simio")}>that change</a>, in this
              harness earlier the same day, a tap took 842 ms and the sign-in step by step 3.63 s. This is one run on one Mac, 10 or 20 samples a step, so the
              medians describe this run and are not rates.
            </p>
            <h3>Where simulator-use is faster</h3>
            <p>
              Typing, and the batch, which types twice. simulator-use presses keys on the Simulator&apos;s hardware keyboard port, and iOS answers a hardware key
              by hiding the on-screen keyboard: none of simulator-use&apos;s replies reports a keyboard, and its last read lists the tab bar as on screen.
              phonedriver types through XCTest&apos;s text input, as it does on an iPhone, so the on-screen keyboard comes up and covers the bottom of the
              screen, as it will for the app&apos;s users. phonedriver&apos;s reply waits for the keyboard to finish rising, about half of the step after a fresh
              launch, and says what it covers (<code>keyboard shown over @e8</code>); the next read marks the tab bar <code>under-keyboard</code>. Hardware keys
              with the on-screen keyboard kept up were no answer: in apps started after the keyboard was set that way, shift was lost and{" "}
              <code>Ga@m</code> came out <code>ga2m</code>.
            </p>
            <p>
              Not in the five steps: the first call, a launch of the app. phonedriver&apos;s took {secs(pd.cold.setupMs)} and simulator-use&apos;s{" "}
              {secs(sim.tools[1].cold.setupMs)}, because phonedriver first starts its XCTest runner on the Simulator, the runner it drives an iPhone with; later
              calls reuse it. simulator-use&apos;s tap reply is 3 tokens shorter ({tokens(sim.tools[1].tap.medianTokens)} against {tokens(pd.tap.medianTokens)}):
              phonedriver says what a changed element showed before as well.
            </p>
            <p>
              Real devices and Android are on simulator-use&apos;s own list of{" "}
              <a href="https://github.com/NoMac-app/simulator-use#what-it-cant-do-yet">what it can&apos;t do yet</a>. phonedriver runs the same commands on an
              iPhone, an iPad and an Android phone, so on the Simulator it types the way a phone does.
            </p>
            <blockquote className="mic">
              <p>
                It&apos;s called <b>simulator</b>-use.
                <br />
                This is <b>phone</b>driver.
              </p>
            </blockquote>
            <h3>What I changed in the harness</h3>
            <ul>
              <li>
                Added <code>tools/phonedriver.mjs</code>, which drives phonedriver the way its MCP instructions say: read with <code>snapshot</code>, tap and type
                by the text the screen shows, and type the password with <code>secret: true</code>.
              </li>
              <li>
                Before each tool the harness stops leftover processes by name. This Mac runs other work, so the stop is limited to processes of the benchmark&apos;s
                own tool folder and Simulator.
              </li>
              <li>Device Hub is left alone instead of quit. It was closed for every run, and each results file records that.</li>
              <li>
                agent-device&apos;s adapter passes its selector at the top level, the form agent-device 0.21.38 and later take. With the adapter as published, every
                agent-device tap and type failed with &quot;target was removed; pass the UI target at the top level&quot;.
              </li>
            </ul>
            <p>
              The whole diff is <a href="/benchmarks/data/simulator-harness.patch">simulator-harness.patch</a>, and the write-up with every version is{" "}
              <a href={raw("docs/bench/simulator.md")}>docs/bench/simulator.md</a>. If you maintain one of these tools and think I set it up wrong,{" "}
              <a href={`${REPO}/issues`}>open an issue</a> and I will rerun it.
            </p>

            <h2 id="tokens">An earlier token run: three small tasks</h2>
            <p>
              Before the nine jobs, a smaller run on a 2560x1600 tablet emulator: Claude Sonnet 5.5 through <code>claude -p</code>, each tool the only tool, three tasks
              checked from device state (the alarm database, the testbed event log, the answer text). Tokens are input, output, cache creation and cache read.
            </p>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Task (checked from device state)</th>
                    <th scope="col">phonedriver, 2 to 3 runs, median tokens</th>
                    <th scope="col">phone-harness, 3 runs, median tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {TOKENS.map(([t, a, c]) => (
                    <tr key={t}>
                      <th scope="row">{t}</th>
                      <td>{a}</td>
                      <td>{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              On the sum of medians phonedriver used 34% fewer tokens than phone-harness (218,357 against 330,375). It is ahead on the longest task, level on the form and
              8% behind on the Wikipedia task, where individual runs ranged from 26,147 to 64,522 tokens. Raw adb finished <code>alarm-gym</code> in 2 calls with a{" "}
              <code>SET_ALARM</code> intent (18,607 tokens), a shortcut the task allows, and failed the web form, a WebView with no accessibility nodes. mobile-mcp
              failed every run of this earlier setup for an environment reason (its helper could not reach a remote adb server), so it is not compared here; the nine
              jobs above gave it its own adb server.
            </p>
            <p>
              The fixed cost per turn is also measured: the first turn of a one-word <code>claude -p</code> costs 5,606 tokens with phonedriver&apos;s 14 MCP tools and
              5,214 with phone-harness. <a href={raw("docs/bench/tokens.md")}>All three rounds, the fixes between them and the caveats</a>.
            </p>

            <h2 id="data">Raw data and reproduction</h2>
            <ul>
              <li>
                <a href="/benchmarks/data/jobs.json">jobs.json</a>: every agent run of the nine jobs, with its pass, tokens, tool calls and wall time.
              </li>
              <li>
                <a href="/benchmarks/data/speed-samples.csv">speed-samples.csv</a> and <a href="/benchmarks/data/speed-samples-second-pass.csv">second-pass samples</a>:
                every timed sample.
              </li>
              <li>
                <a href="/benchmarks/data/speed.json">speed.json</a>: p50, p95 and bootstrap intervals per operation.{" "}
                <a href="/benchmarks/data/speed-meta.json">speed-meta.json</a>: machine and versions.
              </li>
              <li>
                <a href="/benchmarks/data/tokens.json">tokens.json</a>: every run of the earlier three-task benchmark.
              </li>
              <li>
                <a href="/benchmarks/data/simulator-summary.json">simulator-summary.json</a>: the iOS Simulator run as the harness&apos;s <code>summarize.mjs</code>{" "}
                scores it, and every call with its reply for{" "}
                {sim.tools.map((t, i) => (
                  <span key={t.tool}>
                    {i ? (i === sim.tools.length - 1 ? " and " : ", ") : ""}
                    <a href={`/benchmarks/data/simulator-${t.tool}.json`}>{t.name}</a>
                  </span>
                ))}
                .
              </li>
              <li>
                Repeat the iOS Simulator run: apply <a href="/benchmarks/data/simulator-harness.patch">simulator-harness.patch</a> to simulator-use&apos;s{" "}
                <code>bench</code> folder, then <code>bash bench/setup.sh</code> and{" "}
                <code>bash bench/run-all.sh &lt;folder&gt; phonedriver simulator-use agent-device argent</code>.
              </li>
              <li>
                Repeat the speed run: <code>PH_PYTHON=&lt;python with phone-harness 0.3.3&gt; bash bench/speed/reproduce.sh</code> in the <a href={REPO}>repository</a>.
              </li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
