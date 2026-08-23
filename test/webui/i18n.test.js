"use strict";
// v0.43.0 — `orc ui` and the `--json` surface it stands on.
//
// Two failure modes drive every case here.
//
// (1) The --json contract is what makes the UI possible AT ALL: the server
//     parses stdout, so a command that prints one stray banner line beside its
//     object breaks a panel — and it does so silently, because the human path
//     still looks perfect. Every flagged command is therefore checked for
//     EXACTLY ONE object and an UNCHANGED exit code (several of those codes are
//     already contracts: pattern status, wiki impact, pr stack status).
//
// (2) The server can WRITE config, so it is a write surface on a machine that
//     may be shared. Auth, the loopback Host guard and the method guard are not
//     nice-to-haves; a regression in any of them is the whole vulnerability.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { cli, rmrf, tmpdir, freshInstall, REPO, WEBUI, appJs, appCss, appHtml, assetRefs, panelJs, panelCss, fixtureSrc, i18nNamespaces, i18nTable, webuiFiles } = require("../_helpers");

const CLI = path.join(REPO, "bin", "cli.js");
const LOCK_REL = path.join(".claude", "orc", "ui.lock");

// The shipped string tables. English is the FALLBACK table every other language
// falls back to, so it is loaded separately as well as in the pair.
const en = i18nTable("en");
const TABLES = { en, id: i18nTable("id") };

// PANEL PROSE ONLY. Never a config key, an agent name, a model id, a path, a
// command, a doctor message or a tier word — those are identifiers, and a
// translated config key is a key that does not exist.
//
// Split out of webui.test.js in v0.48.1, alongside bin/webui/ itself.

test("i18n: every key the panel asks for exists in English", () => {
  // Comments are stripped first. This file DOCUMENTS the fragment-built key
  // form it forbids ("t(\"settings.tier.\" + tier)"), and a scan that cannot
  // tell a call from a comment about that call fails on its own explanation.
  const js = appJs()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const keys = new Set();
  for (const m of js.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)) keys.add(m[1]);
  // tn() picks `key` or `key + "Plural"`, so BOTH must exist or a plural count
  // renders as a raw dotted key at exactly the moment there is more than one.
  for (const m of js.matchAll(/\btn\([^,]+,\s*"([a-zA-Z0-9_.]+)"/g)) {
    keys.add(m[1]);
    keys.add(m[1] + "Plural");
  }
  assert.ok(keys.size > 200, `expected the panel to use the table heavily, saw ${keys.size}`);
  const missing = [...keys].filter((k) => !(k in en));
  assert.deepStrictEqual(missing, [], "these keys are used but not defined in en.json");
});

test("i18n: every language defines exactly the same keys", () => {
  // A key present in en and absent in id is not a crash — t() falls back — but
  // it IS a half-translated screen nobody notices. Parity is the only way that
  // stays visible.
  const enKeys = Object.keys(en).filter((k) => k !== "_readme").sort();
  for (const [code, table] of Object.entries(TABLES)) {
    if (code === "en") continue;
    const keys = Object.keys(table).filter((k) => k !== "_readme").sort();
    assert.deepStrictEqual(keys, enKeys, `${code}.json must define exactly the keys en.json defines`);
  }
});

test("i18n: placeholders survive translation", () => {
  // `{n}`, `{version}`, `{command}` are substituted by t(). A translation that
  // drops one silently loses the number or the command it was carrying.
  for (const [code, table] of Object.entries(TABLES)) {
    if (code === "en") continue;
    for (const [key, value] of Object.entries(en)) {
      if (key === "_readme" || typeof value !== "string") continue;
      const want = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const got = [...String(table[key]).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepStrictEqual(got, want, `${code}.json "${key}" must carry the same placeholders`);
    }
  }
});

test("i18n: config keys and CLI vocabulary are never translated", () => {
  const cliSrc = fs.readFileSync(CLI, "utf8");
  const js = appJs();

  // The real registry key names, straight from the CLI. If any of them ever
  // became a translatable STRING VALUE rather than an id quoted inside a
  // sentence, the panel would be writing a key that does not exist.
  const registryKeys = [...cliSrc.matchAll(/\{\s*key:\s*"(\w+)",[^}]*tier:\s*"/g)].map((m) => m[1]);
  assert.ok(registryKeys.length > 20, `expected to find the config registry, saw ${registryKeys.length}`);
  for (const [code, table] of Object.entries(TABLES)) {
    for (const [key, value] of Object.entries(table)) {
      if (key === "_readme" || typeof value !== "string") continue;
      assert.ok(!registryKeys.includes(value.trim()), `${code}.json "${key}" is a bare config key — those are ids, not prose`);
    }
  }

  // The values the panel reads out of a payload go through as-is. These are the
  // spots where a t() call would translate DATA, so they are named explicitly.
  for (const expr of ["k.desc", "k.shadow_reason", "f.message", "a.label", "l.what", "p.desc", "d.reason"]) {
    assert.ok(
      !new RegExp("t\\(\\s*" + expr.replace(".", "\\.") + "\\s*\\)").test(js),
      `${expr} comes from the CLI — it must never be passed through t()`
    );
  }
});

test("i18n: the language switch is a browser preference, never project config", () => {
  const js = appJs();
  const api = fs.readFileSync(path.join(REPO, "bin", "webui", "api.js"), "utf8");
  const html = appHtml();

  // Remembered in localStorage, exactly like the theme — never written to
  // orc.config.yaml, which is a file the whole team shares.
  assert.match(js, /const LANG_KEY = "orc-ui-lang"/, "the language must be a named localStorage key");
  assert.match(js, /localStorage\.setItem\(LANG_KEY/, "the choice must be remembered in the browser");
  assert.ok(!/lang/i.test((api.match(/const WRITES = \{[\s\S]*?\n\};/) || [""])[0]), "no write route may carry a language");

  // The button lives in the rail, under the theme toggle, and ships an English
  // fallback in the markup so a failed fetch still renders a readable rail.
  assert.match(html, /id="lang-toggle"/, "the rail needs a language button");
  assert.match(html, /data-i18n="nav\.overview">Overview</, "nav labels need an in-markup English fallback");
});

// v0.48.1 — the tables are one file per namespace. Three rules keep the split
// from becoming a place strings go missing.
test("i18n: every key belongs to its namespace file, in both languages", () => {
  const namespaces = i18nNamespaces();
  assert.ok(namespaces.length >= 15, "NAMESPACES must list every namespace file");

  // THE INVARIANT: a key prefix has exactly ONE home. A file may own more than
  // one prefix — `stats` owns `stats.*` and `cost.*` because the Cost tab is
  // part of Stats, `banner` owns the update banner and the changelog modal it
  // opens — but no prefix may appear in two files, because then "where does
  // this string live" has two answers and an edit lands in the wrong one.
  const home = new Map();
  for (const ns of namespaces) {
    const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", "en", ns + ".json"), "utf8")));
    assert.ok(keys.length, `${ns}.json must not be empty`);
    for (const k of keys) {
      const prefix = k.split(".")[0];
      if (home.has(prefix))
        assert.strictEqual(home.get(prefix), ns, `"${prefix}.*" is split across ${home.get(prefix)}.json and ${ns}.json`);
      home.set(prefix, ns);
    }
    // And a file named after a panel must actually own that panel's prefix,
    // so the obvious lookup ("docs wording → docs.json") is always right.
    if (ns !== "common") assert.strictEqual(home.get(ns), ns, `${ns}.json does not own ${ns}.*`);
  }

  // en/id parity, file for file. A namespace present in one language and not
  // the other renders a whole panel as raw dotted keys in that language.
  for (const ns of namespaces) {
    const a = Object.keys(JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", "en", ns + ".json"), "utf8"))).sort();
    const b = Object.keys(JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", "id", ns + ".json"), "utf8"))).sort();
    assert.deepStrictEqual(b, a, `i18n/id/${ns}.json does not carry the same keys as English`);
  }

  // Nothing on disk that NAMESPACES does not name: an unlisted file is never
  // fetched, so its strings render as keys with no error anywhere.
  for (const code of ["en", "id"]) {
    const onDisk = webuiFiles("i18n/" + code).map((f) => f.replace(/\.json$/, ""));
    assert.deepStrictEqual(onDisk.sort(), [...namespaces].sort(), `i18n/${code}/ and NAMESPACES disagree`);
  }
});

test("i18n: keys are written out in full, never assembled from a fragment", () => {
  // The v0.43.6 rule, unchanged by the split: a key built as `"cost.unit." + u`
  // is invisible to the coverage check, which is the only thing standing
  // between a renamed key and a raw dotted string on somebody's screen.
  //
  // Comments are stripped first — several of them QUOTE the anti-pattern while
  // explaining why the literal map next to them exists.
  const js = appJs()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/\bt\(\s*["'][\w.]*["']\s*\+/.test(js),
    "t() must never be called with a concatenated key — write the key out in full"
  );
});

test("i18n: the string tables are served, and server code never is", () => {
  const serve = fs.readFileSync(path.join(REPO, "bin", "webui", "serve.js"), "utf8");
  const { buildStatic } = require("../../bin/webui/serve.js");
  const map = buildStatic(path.join(REPO, "bin", "webui"));

  for (const code of Object.keys(TABLES))
    for (const ns of i18nNamespaces())
      assert.ok(map[`/i18n/${code}/${ns}.json`], `i18n/${code}/${ns}.json must be served — English is the fallback table`);

  // Server-side code is required by node, never fetched. Shipping it would hand
  // a reader the whole API surface map.
  for (const never of ["/serve.js", "/api.js", "/fixtures.js"])
    assert.ok(!map[never], `${never} must never be reachable over http`);
  assert.ok(
    !Object.keys(map).some((k) => k.startsWith("/fixtures/")),
    "the fixture data is read in-process by api.js and is never served"
  );

  // The map is built ONCE at boot and a request path is a KEY LOOKUP in it —
  // never a path join against something the request chose. That is what makes
  // directory traversal structurally impossible rather than merely filtered.
  const walk = serve.slice(serve.indexOf("function buildStatic"), serve.indexOf("const STATIC = buildStatic"));
  assert.ok(!/req\.|\burl\b|pathname/.test(walk), "the static map must not read anything from a request");
  assert.match(serve, /const STATIC = buildStatic\(__dirname\);/, "the walk must run once, at module load");

  // Every entry app.html points at must exist in the map, or it 401s/404s in a
  // browser while every test that fetches with a token passes.
  for (const rel of assetRefs("css").concat(assetRefs("js")))
    assert.ok(map["/" + rel], `app.html references ${rel}, which the static map does not serve`);
});

// v0.43.6 — a caution must point at the panel that can actually clear it.
//
// `orc doctor` reports every problem in one list, and the Overview sent all of
// them to Maintenance. That is right for the install-footprint findings and
// WRONG for `diy-stale`: the flow is recompiled with `orc diy compile`, which
// is a button on FLOW. The panel was telling people to go to a page with no
// control for the thing it was complaining about.

/* --------------------------------------------------------------------------
   v0.52.0 (D10) — the Extra panel's INSTRUCTION text is Simplified Technical
   English, and the rule that makes it safe.

   THE DEFAULT IS STE. A new key is instruction text unless `TERMS.md` names it
   in the ```prose-keys fence, which is the opt-out and is a deliberate line in a
   diff somebody reads — the contract-lint table's shape.

   The prose keys are the sentences this subsystem is built out of ("it stops
   someone at your keyboard, not someone who copied the file"). STE has no
   vocabulary for the distinction they draw; flattened, they become true and
   useless.

   There is NO full STE checker here and there is not going to be one: a real one
   needs the licensed dictionary. This asserts the cheap half, which is worth
   having, and `TERMS.md` plus review is the rest. A checker that half-works
   would be worse than none, because people would trust it. */
function proseKeys() {
  const md = fs.readFileSync(path.join(WEBUI, "i18n", "TERMS.md"), "utf8");
  const m = /```prose-keys\r?\n([\s\S]*?)```/.exec(md);
  assert.ok(m, "TERMS.md no longer carries the prose-keys fence");
  return new Set(m[1].split("\n").map((l) => l.trim()).filter(Boolean));
}

test("wording: every instruction the user acts on is one short sentence", () => {
  const prose = proseKeys();
  const table = JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", "en", "extra.json"), "utf8"));
  const words = (v) => (v.match(/[A-Za-z0-9'`{}\/.-]+/g) || []).length;
  // Split on sentence ends AND on the em dash, which this panel uses as one.
  const sentences = (v) => v.split(/(?<=[.!?:])\s+|\s+\u2014\s+/).filter((x) => x.trim());

  const overLong = [];
  for (const [k, v] of Object.entries(table)) {
    if (prose.has(k)) continue;
    for (const one of sentences(v)) if (words(one) > 20) overLong.push(`${k} (${words(one)} words)`);
  }
  assert.deepStrictEqual(overLong, [], "an instruction is one sentence of 20 words or fewer — or it is listed in TERMS.md");

  // ONE WORD, ONE MEANING. The right-hand column of the term list, as a regex.
  const BANNED = [
    /\bset up\b/i, /\bhook up\b/i, /\bturn (on|off)\b/i, /\bswitch on\b/i,
    /\bkick off\b/i, /\bbring up\b/i, /\bpull up\b/i,
    /\babort\b/i, /\bhalt\b/i, /\bkill\b/i,
    /\bpassword\b/i, /\bexpiry\b/i, /\btimeout\b/i, /\bre-fetch\b/i, /\bgrab\b/i,
  ];
  const banned = [];
  for (const [k, v] of Object.entries(table))
    for (const re of BANNED) if (re.test(v)) banned.push(`${k}: ${(v.match(re) || [])[0]}`);
  assert.deepStrictEqual(banned, [], "one word, one meaning — see bin/webui/i18n/TERMS.md");

  // Every prose key must EXIST. A stale opt-out silently exempts nothing and
  // hides that the sentence it was written for is gone.
  const missing = [...prose].filter((k) => !(k in table));
  assert.deepStrictEqual(missing, [], "TERMS.md exempts a key that no longer exists");
});

test("wording: a CLI-COMPUTED VALUE is never simplified and never translated", () => {
  // The rule that makes the whole pass safe, and the one that is not
  // negotiable: a state word, an exit reason, a config key, a model id, a path,
  // a band or a command is NOT prose. A simplified state word is a state that
  // does not exist — the same failure as a translated config key.
  const md = fs.readFileSync(path.join(WEBUI, "i18n", "TERMS.md"), "utf8");
  assert.match(md, /NEVER simplify a CLI-computed value/);

  // The states `orc extra tools --json` publishes must not appear as VALUES in
  // either table: the panel renders the CLI's word, it does not name its own.
  for (const code of ["en", "id"]) {
    const table = JSON.parse(fs.readFileSync(path.join(WEBUI, "i18n", code, "extra.json"), "utf8"));
    for (const [k, v] of Object.entries(table)) {
      assert.ok(
        !/^(absent|outdated|unauthenticated|ready|ACTIVE|EXPIRING|EXPIRED|ABSENT)$/.test(v.trim()),
        `${code}/${k} is a CLI state word, which the panel must render rather than store`
      );
    }
  }
});
