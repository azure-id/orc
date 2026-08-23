"use strict";
// `orc extra stats` / `orc extra rates` — W8, the flywheel.
//
// The question the whole subsystem is judged on is "is the cheap model actually
// cheaper once you count the repairs", and it is answerable only if these
// numbers are honest about what they do not know. So every assertion here is
// about a distinction that a rounder number would destroy:
//
//   · `tok=none` is UNKNOWN, and must never be summed as zero
//   · a total says HOW MANY dispatches it came from, or it is not that band's
//     cost
//   · `usd` is null wherever there is no rate — never zero, never an estimate,
//     and never a Claude family rate applied to somebody else's bill
//   · SUBSTITUTION, REROUTE and FALLBACK are three different facts and are
//     never merged into one failure count
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir, cli } = require("../_helpers.js");

function project() {
  const root = tmpdir();
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  return { root, home, env: { HOME: home, USERPROFILE: home } };
}
const run = (p, a, env) => cli([...a, "--dir", p.root], { ...p.env, ...(env || {}) });
const json = (r) => JSON.parse(r.stdout);

// A trace file with real EXTRA lines. `orc extra stats` scans whole files
// (unlike `orc stats`, which reads only the tail) because a foreign dispatch is
// per task and there is no one summary line for it.
function trace(p, name, lines) {
  const dir = path.join(p.root, ".claude", "orc", "logs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, name),
    lines.map((l) => `[220826 12:00:00.000] orc  ${l}`).join("\n") + "\n"
  );
}

// The profile only supplies profile→provider, which is what a price lookup keys
// on. It is not verified and nothing routes to it — stats is a READ.
function profile(p, name, provider) {
  const ledger = path.join(p.root, ".claude", "orc", "extra.json");
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  const d = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, "utf8")) : { version: 1, profiles: [], routes: [], history: [] };
  d.profiles.push({ name, provider, engine: "api", credential: { source: "env", key_name: "K" } });
  fs.writeFileSync(ledger, JSON.stringify(d, null, 2));
}

test("extra stats: an empty log dir is an ANSWER, and still returns its object", () => {
  const p = project();
  const r = run(p, ["extra", "stats", "--json"]);
  assert.equal(r.status, 1, "nothing traced is exit 1, the same code the human path uses");
  const j = json(r);
  assert.equal(j.dispatches, 0);
  assert.deepEqual(j.bands, []);
  assert.match(j.hint, /no foreign dispatch has been recorded/);
  // Three sources, and all three report zero rather than being absent: an empty
  // result is an ANSWER, and "nowhere to look" and "looked everywhere and found
  // nothing" have to be the same shape.
  assert.deepEqual(j.sources, {
    spend_log: 0,
    traces_only: 0,
    run_returns: 0,
    run_returns_undated_skipped: 0,
    unreadable_spend_lines: 0,
  });
});

test("extra stats: grouped per profile PER BAND, with the outcome mix", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  trace(p, "run-orc-a-220826-120000.txt", [
    "EXTRA ds/v4-flash engine=api task=T1 band=[0,30) tok=100/0/900/50 outcome=done dur=0m41s",
    "EXTRA ds/v4-flash engine=api task=T2 band=[0,30) tok=200/0/800/60 outcome=partial dur=1m02s",
    "EXTRA ds/v4-pro engine=api task=T3 band=[30,70) tok=300/0/700/70 outcome=failed dur=0m09s",
    "EXTRA fallback task=T3 :: rate_limit → orc-executor-sonnet-5-high",
  ]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(j.dispatches, 3);
  assert.equal(j.files_scanned, 1);
  // Per profile PER BAND — a per-provider total cannot say the low band was
  // fine and the mid band was a false economy.
  assert.equal(j.bands.length, 2);
  const low = j.bands.find((b) => b.band === "[0,30)");
  assert.equal(low.provider, "deepseek");
  assert.equal(low.dispatches, 2);
  assert.equal(low.outcomes.done, 1);
  assert.equal(low.outcomes.partial, 1);
  assert.deepEqual(low.usage, { input: 300, cache_write: 0, cache_read: 1700, output: 110 });
  assert.equal(low.usage_reported, 2);
  assert.equal(low.usage_missing, 0);

  // A fallback is its own fact: the dispatch failed and Claude finished the job.
  assert.equal(j.fallbacks.length, 1);
  assert.equal(j.fallbacks[0].agent, "orc-executor-sonnet-5-high");
  assert.equal(j.fallbacks[0].reason, "rate_limit");
});

test("extra stats: `tok=none` is UNKNOWN and is never summed as zero", () => {
  const p = project();
  profile(p, "oc", "custom");
  trace(p, "run-orc-b-220826-120000.txt", [
    "EXTRA oc/x engine=cli task=T1 band=[0,30) tok=none outcome=done dur=0m30s",
    "EXTRA oc/x engine=cli task=T2 band=[0,30) tok=100/0/0/10 outcome=done dur=0m30s",
  ]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  const b = j.bands[0];
  // The denominator IS the honesty. A total built from one of two dispatches is
  // not this band's cost, and only this pair of numbers says so.
  assert.equal(b.dispatches, 2);
  assert.equal(b.usage_reported, 1);
  assert.equal(b.usage_missing, 1);
  assert.deepEqual(b.usage, { input: 100, cache_write: 0, cache_read: 0, output: 10 });
});

test("extra stats: SUBSTITUTION and REROUTE are separate facts, never a failure count", () => {
  const p = project();
  profile(p, "or", "openrouter");
  trace(p, "run-orc-c-220826-120000.txt", [
    "EXTRA or/glm-4.7 engine=api task=T1 band=[0,30) tok=1/0/2/3 outcome=done dur=0m10s",
    "EXTRA substitution task=T1 :: requested=glm-4.7 reported=glm-4.6",
    "EXTRA or/glm-4.7 engine=api task=T2 band=[0,30) tok=1/0/2/3 outcome=done dur=0m10s",
    "EXTRA reroute task=T2 :: Zhipu,Novita",
  ]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  // BOTH dispatches succeeded. Neither of these is a failure — one says you got
  // a model you did not ask for, the other says you got the model and a
  // different company served it.
  assert.equal(j.bands[0].outcomes.done, 2);
  assert.equal(j.bands[0].outcomes.failed, 0);
  assert.equal(j.substitutions.length, 1);
  assert.equal(j.substitutions[0].reported, "glm-4.6");
  assert.equal(j.reroutes.length, 1);
  assert.deepEqual(j.reroutes[0].providers, ["Zhipu", "Novita"]);
});

test("extra stats: usd is NULL with no rate, and priced once a rate exists", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  trace(p, "run-orc-d-220826-120000.txt", [
    "EXTRA ds/v4-flash engine=api task=T1 band=[0,30) tok=1000000/0/0/1000000 outcome=done dur=0m10s",
  ]);
  // The shipped table's models maps are EMPTY on purpose, so this is the
  // NORMAL state, not an error state.
  const before = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(before.bands[0].usd, null, "a figure ORC did not price is never printed");
  assert.equal(before.unpriced_dispatches, 1);
  assert.deepEqual(before.missing_rates, [{ pair: "deepseek/v4-flash", dispatches: 1 }]);

  // …and a Claude family rate must NEVER be borrowed for it. `v4-flash` shares
  // no substring with a Claude family, but the guard is that foreignRate looks
  // only in `providers`, never in `models`/`families`.
  const table = path.join(p.root, "prices.json");
  fs.writeFileSync(
    table,
    JSON.stringify({
      as_of: new Date().toISOString().slice(0, 10),
      providers: { deepseek: { models: { "v4-flash": { input: 1, cache_write: 1, cache_read: 1, output: 3 } } } },
    })
  );
  fs.writeFileSync(path.join(p.root, ".claude", "orc.config.yaml"), "budget_price_table: prices.json\n");
  const after = json(run(p, ["extra", "stats", "--json"]));
  // 1M input at $1 + 1M output at $3 = $4.00 exactly.
  assert.equal(Math.round(after.bands[0].usd * 100) / 100, 4);
  assert.equal(after.priced_dispatches, 1);
});

test("extra rates: lists the pairs the traces used and prints the JSON to paste", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  profile(p, "oll", "ollama");
  trace(p, "run-orc-e-220826-120000.txt", [
    "EXTRA ds/v4-flash engine=api task=T1 band=[0,30) tok=1/0/2/3 outcome=done dur=0m10s",
    "EXTRA oll/local-q engine=api task=T2 band=[0,30) tok=1/0/2/3 outcome=done dur=0m10s",
  ]);
  const r = run(p, ["extra", "rates", "--json"]);
  assert.equal(r.status, 1, "exit 1 means there are gaps — the same convention as pattern/diy status");
  const j = json(r);
  assert.deepEqual(j.missing.sort(), ["deepseek/v4-flash", "ollama/local-q"]);
  // The paste block is a SKELETON with zeros the user replaces — it is not a
  // price ORC is asserting.
  assert.deepEqual(j.paste.providers.deepseek.models["v4-flash"], { input: 0, cache_write: 0, cache_read: 0, output: 0 });
  // The caveats are the reason the shipped maps are empty, carried per provider.
  const ollama = j.caveats.find((c) => c.provider === "ollama");
  assert.match(ollama.caveat, /electricity/, "local inference is not free just because the API bill is zero");
  assert.match(j.where, /never overwrites your rates/);
});

test("extra stats: --since filters on the FILENAME date, before a file is opened", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  trace(p, "run-orc-old-010126-120000.txt", [
    "EXTRA ds/v4-flash engine=api task=T1 band=[0,30) tok=1/0/2/3 outcome=done dur=0m10s",
  ]);
  trace(p, "run-orc-new-220826-120000.txt", [
    "EXTRA ds/v4-flash engine=api task=T2 band=[0,30) tok=1/0/2/3 outcome=done dur=0m10s",
  ]);
  assert.equal(json(run(p, ["extra", "stats", "--json"])).dispatches, 2);
  const j = json(run(p, ["extra", "stats", "--since", "2026-06-01", "--json"]));
  assert.equal(j.dispatches, 1);
  assert.equal(j.since, "2026-06-01");
});

test("extra stats: a trace with no EXTRA line is skipped without being parsed", () => {
  const p = project();
  trace(p, "run-orc-f-220826-120000.txt", ["DISPATCH orc-executor-opus-5-med :: T1 expect=claude-opus-5/medium", "FINISH :: shipped"]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(j.files_scanned, 0, "the pre-filter is what keeps a whole-file scan affordable");
  assert.equal(j.dispatches, 0);
});

// ── the spend log (v0.53.2) ────────────────────────────────────────────────
//
// The failure this whole section exists for: `extraTraceLine` is composed by
// the CLI and RELAYED by the lane into a trace packet. A relay through a model
// is remembered-not-dispatched protocol, and it broke in both directions on two
// real graded runs — one reshaped the line, one dropped it entirely — while the
// dispatches themselves succeeded and cost real money. `orc extra stats` read
// zero, and a zero gets believed.

// One JSONL record, as `orc extra dispatch` writes it.
function spend(p, recs) {
  const f = path.join(p.root, ".claude", "orc", "extra-spend.jsonl");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, recs.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
const rec = (over) =>
  Object.assign(
    {
      v: 1,
      ts: "2026-08-22T12:00:00.000Z",
      date: "2026-08-22",
      run: "a",
      profile: "ds",
      provider: "deepseek",
      model: "v4-flash",
      engine: "api",
      task: "T1",
      band: "[0,30)",
      usage: { input: 100, cache_write: 0, cache_read: 900, output: 50 },
      outcome: "done",
      duration_ms: 41000,
      dur: "0m41s",
    },
    over || {}
  );

test("extra stats: the spend log is counted even when NO trace mentions the dispatch", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  spend(p, [rec({ task: "T1" }), rec({ task: "T2", outcome: "failed", usage: null, dur: "0m05s" })]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(j.dispatches, 2, "both dispatches are counted with zero traces on disk");
  assert.equal(j.sources.spend_log, 2);
  assert.equal(j.sources.traces_only, 0);
  assert.equal(j.files_scanned, 0);
  const band = j.bands.find((b) => b.band === "[0,30)");
  assert.equal(band.provider, "deepseek");
  // The honest split survives the new source: one vector reported, one not.
  assert.equal(band.usage_reported, 1);
  assert.equal(band.usage_missing, 1);
});

test("extra stats: a relayed trace line and its spend record are ONE dispatch", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  spend(p, [rec({ task: "T1" })]);
  // The same dispatch, relayed into the trace exactly as the CLI composed it.
  trace(p, "run-orc-a-220826-120000.txt", [
    "EXTRA ds/v4-flash engine=api task=T1 band=[0,30) tok=100/0/900/50 outcome=done dur=0m41s",
  ]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(j.dispatches, 1, "a lane that relayed correctly must not be double-charged");
  assert.equal(j.sources.spend_log, 1);
  assert.equal(j.sources.traces_only, 0);
});

test("extra stats: a trace line with the ` :: ` separator still parses", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  // Every other verb in a trace is `VERB … :: tail`, so a trace writer reaches
  // for that separator by reflex. A real graded run wrote exactly this and the
  // entire run reported as zero foreign dispatches.
  trace(p, "run-orc-a-220826-120000.txt", [
    "EXTRA ds/v4-flash :: engine=api task=T1 band=[0,30) tok=100/0/900/50 outcome=done dur=0m41s",
  ]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(j.dispatches, 1);
  assert.equal(j.sources.traces_only, 1);
  assert.equal(j.bands[0].models["v4-flash"], 1, "the model is parsed, not swallowed by the separator");
});

test("extra stats: a saved dispatch return backfills a run the log never saw", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  // What `orc extra dispatch --json` produced, saved into the run folder by the
  // lane. It is the CLI's own payload, not a narrative about it — which is why
  // reading it back is a recovery and not an invention.
  const rd = path.join(p.root, ".claude", "orc", "run", "some-slug");
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(
    path.join(rd, "return.json"),
    JSON.stringify({
      dispatched: true,
      profile: "ds",
      provider: "deepseek",
      engine: "api",
      task_id: "T9",
      band: "[0,30)",
      model_requested: "v4-flash",
      usage: { input: 7, cache_write: 0, cache_read: 8, output: 9 },
      outcome: "done",
      duration_ms: 1000,
      trace_line: "EXTRA ds/v4-flash engine=api task=T9 band=[0,30) tok=7/0/8/9 outcome=done dur=0m01s",
    })
  );
  // Some other JSON in the same folder must never become a cost figure.
  fs.writeFileSync(path.join(rd, "checkpoint.json"), JSON.stringify({ phase: 4, waves: 2 }));
  const j = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(j.dispatches, 1);
  assert.equal(j.sources.run_returns, 1);
  assert.equal(j.bands[0].usage.output, 9);
});

test("extra stats: a saved return carries no date, so --since EXCLUDES it and says so", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  const rd = path.join(p.root, ".claude", "orc", "run", "s");
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(
    path.join(rd, "return.json"),
    JSON.stringify({
      dispatched: true,
      profile: "ds",
      engine: "api",
      task_id: "T9",
      band: "[0,30)",
      model_requested: "v4-flash",
      usage: null,
      outcome: "done",
      duration_ms: 1000,
      trace_line: "EXTRA ds/v4-flash engine=api task=T9 band=[0,30) tok=none outcome=done dur=0m01s",
    })
  );
  const j = json(run(p, ["extra", "stats", "--json", "--since", "2026-01-01"]));
  // NOT silently included and NOT silently dropped. No date is invented from an
  // mtime — a file's timestamp is when it was touched, not when a model billed.
  assert.equal(j.dispatches, 0);
  assert.equal(j.sources.run_returns, 0);
  assert.equal(j.sources.run_returns_undated_skipped, 1);
});

test("extra stats: a torn spend line is skipped, COUNTED, and never fatal", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  spend(p, [rec({ task: "T1" })]);
  const f = path.join(p.root, ".claude", "orc", "extra-spend.jsonl");
  fs.appendFileSync(f, '{"v":1,"profile":"ds","outc\n');
  spend(p, [rec({ task: "T2" })]);
  const j = json(run(p, ["extra", "stats", "--json"]));
  assert.equal(j.dispatches, 2, "one torn line must not cost the report every row after it");
  assert.equal(j.sources.unreadable_spend_lines, 1);
});

test("extra rates: a pair known only to the spend log is still priced-or-flagged", () => {
  const p = project();
  profile(p, "ds", "deepseek");
  spend(p, [rec({ model: "v4-pro" })]);
  const r = run(p, ["extra", "rates", "--json"]);
  const j = JSON.parse(r.stdout);
  const pair = j.pairs.find((x) => x.model === "v4-pro");
  assert.ok(pair, "rates reads the same scan as stats, so the log feeds it too");
  assert.equal(pair.provider, "deepseek");
  assert.equal(pair.rate, null);
});
