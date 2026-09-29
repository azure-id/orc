"use strict";
// v2.0.4 — the status-line design expansion, panel side: the POST guard lets a
// clear through, the set and line routes forward the new flags, the staged
// preview runs in a temp copy and never touches the project, and the editor
// reads every option list from the catalogue.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { panelJs, i18nTable, freshInstall, cli, rmrf } = require("../_helpers.js");
const api = require("../../bin/webui/api.js");

// A panel's code without its comments, so a grep reads the code and not the
// prose about it.
const code = () => panelJs("hookui").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// One request through the REAL handler: a JSON body on a readable stream and a
// response that records its status and body.
function call(route, body, ctx) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
    req.method = "POST";
    req.headers = {};
    let status = 0;
    const res = {
      req,
      writeHead(s) {
        status = s;
      },
      end(buf) {
        try {
          resolve({ status, body: JSON.parse(String(buf || "{}")) });
        } catch (e) {
          reject(e);
        }
      },
    };
    const url = new URL("http://127.0.0.1" + route);
    Promise.resolve(api.handleApi(req, res, url, { projectRoot: ctx.root, fixtures: false })).catch(reject);
  });
}

const layoutOf = (root) => path.join(root, ".claude", "orc", "statusline-layout.json");
const stageDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("orc-stage-")).sort();

test("hookui design: the POST guard allows \"\" right after a --flag, and refuses it as a positional", async () => {
  assert.strictEqual(api.argvComplete(["statusline", "set", "1", "1", "--label", ""]), true);
  assert.strictEqual(api.argvComplete(["statusline", "set", "", "1"]), false);
  assert.strictEqual(api.argvComplete(["statusline", "set", "1", "1", "undefined"]), false);
  const { root } = freshInstall();
  try {
    const ok = await call("/api/statusline/set", { line: 1, pos: 1, label: "" }, { root });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.notStrictEqual(ok.body.error, "missing argument");
    const bad = await call("/api/statusline/set", { line: "", pos: 1 }, { root });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.error, "missing argument");
  } finally {
    rmrf(root);
  }
});

test("hookui design: `params` becomes one --param k=v per key, and a null value deletes", () => {
  const argv = api.WRITES["/api/statusline/set"]({ line: 1, pos: 2, params: { text: "hi", width: 3, key: null } });
  const at = argv.reduce((acc, a, i) => (a === "--param" ? acc.concat(argv[i + 1]) : acc), []);
  assert.deepStrictEqual(at, ["text=hi", "width=3", "key="], argv.join(" "));
  const more = api.WRITES["/api/statusline/set"]({ line: 1, pos: 1, caption: "", pad_left: 2, color_by_state: "ok=green", glyph_by_state: "ok=x" });
  const val = (f) => more[more.indexOf(f) + 1];
  assert.strictEqual(val("--caption"), "");
  assert.strictEqual(val("--pad-left"), "2");
  assert.strictEqual(val("--state-color"), "ok=green");
  assert.strictEqual(val("--state-glyph"), "ok=x");
});

test("hookui design: the line route forwards align, sep_color, prefix and separator (\"\" too)", () => {
  const argv = api.WRITES["/api/statusline/line"]({ line: 2, align: "center", sep_color: "", prefix: "> ", separator: "" });
  const val = (f) => (argv.indexOf(f) < 0 ? undefined : argv[argv.indexOf(f) + 1]);
  assert.strictEqual(val("--align"), "center");
  assert.strictEqual(val("--sep-color"), "");
  assert.strictEqual(val("--prefix"), "> ");
  assert.strictEqual(val("--separator"), "");
  assert.strictEqual(api.WRITES["/api/statusline/line"]({ line: 1 }).indexOf("--align"), -1, "an absent key sends nothing");
});

test("hookui design: stage-preview replays into a temp dir and leaves the project layout byte-identical", async () => {
  const { root } = freshInstall();
  try {
    const seed = cli(["statusline", "set", "1", "1", "--label", "SAVED", "--dir", root]);
    assert.strictEqual(seed.status, 0, seed.stdout + seed.stderr);
    const before = fs.readFileSync(layoutOf(root));
    const dirsBefore = stageDirs();
    const r = await call("/api/statusline/stage-preview", {
      board: "status",
      width: 120,
      state: "healthy",
      actions: [{ route: "/api/statusline/set", body: { line: 1, pos: 1, label: "STAGED" } }],
    }, { root });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true, JSON.stringify(r.body).slice(0, 400));
    assert.ok(r.body.preview && r.body.preview.ok, "the staged copy was previewed");
    assert.strictEqual(r.body.show.lines[0].items[0].label, "STAGED", "the staged write reached the copy");
    assert.ok(fs.readFileSync(layoutOf(root)).equals(before), "the project layout must not change");
    assert.deepStrictEqual(stageDirs(), dirsBefore, "the temp dir is always deleted");

    // The first refusal stops the replay and says which action it was.
    const bad = await call("/api/statusline/stage-preview", {
      board: "status",
      actions: [
        { route: "/api/statusline/set", body: { line: 1, pos: 1, render: "no-such-shape" } },
        { route: "/api/statusline/set", body: { line: 1, pos: 1, label: "NEVER" } },
      ],
    }, { root });
    assert.strictEqual(bad.body.ok, false);
    assert.strictEqual(bad.body.failed.index, 0);
    assert.ok(bad.body.failed.output.length > 0, "the CLI's own text travels back");
    // A route outside the status line is never replayed.
    const off = await call("/api/statusline/stage-preview", { actions: [{ route: "/api/config/set", body: { key: "statusline_custom", value: "on" } }] }, { root });
    assert.strictEqual(off.body.ok, false);
    assert.ok(fs.readFileSync(layoutOf(root)).equals(before), "still byte-identical");
    assert.deepStrictEqual(stageDirs(), dirsBefore);
  } finally {
    rmrf(root);
  }
});

test("hookui design: the editor reads every new option list from `cat` and hard-codes none", () => {
  const js = code();
  for (const k of ["label_positions", "value_positions", "caption_positions", "caption_aligns", "line_aligns", "aligns", "signs", "unknowns", "case_samples", "caption_tokens"])
    assert.ok(js.includes("cat." + k), "the panel does not read cat." + k);
  assert.match(js, /\(cat\.limits \|\| \{\}\)\[k\]/, "every range comes from cat.limits");
  for (const lit of ["above", "below", "before", "after", "center", "left", "right", "auto", "always", "dash", "hide", "{value}", "{label}"])
    assert.ok(!js.includes('"' + lit + '"'), "the panel names a CLI value: " + lit);
  // Every control is gated by the renderer's `uses`.
  for (const f of ["label_pos", "value_pos", "caption", "caption_pos", "caption_align", "caption_color", "fill_color", "empty_color", "fill_char", "empty_char", "ramp_colors", "ramp_stops", "threshold", "brackets", "padding", "align", "sign", "max_len", "glyph_by_state"])
    assert.ok(new RegExp('"' + f + '"[^\\n]*(, true[,)]|gated)|gated\\("' + f + '"').test(js), "not gated: " + f);
  // A setting is its own op, sent as `params`.
  assert.match(js, /op\.field\.startsWith\("param\."\)/);
  assert.match(js, /\{ params: \{ \[op\.field\.slice\(6\)\]: op\.value \} \}/);
  // Line fields are one `line` op each.
  assert.match(js, /op: "line", line: line\.line, field, value, label/);
});

test("hookui design: the staged preview is debounced and sequence-guarded", () => {
  const js = code();
  assert.match(js, /const HK_STAGE_WAIT_MS = \d{3};/);
  assert.match(js, /clearTimeout\(HK_STAGE_TIMER\);\s*\n\s*if \(!HK_OPS\.length/, "a new change cancels the pending send");
  assert.match(js, /HK_STAGE_TIMER = setTimeout\(hkStageSend, HK_STAGE_WAIT_MS\)/);
  assert.match(js, /const seq = \+\+HK_STAGE_SEQ;/);
  assert.match(js, /if \(seq !== HK_STAGE_SEQ \|\| !HK_OPS\.length\) return;/, "a stale answer is dropped");
  assert.match(js, /post\("\/api\/statusline\/stage-preview"/);
  // Cleared on Apply, Cancel, a board change, a preset and the reset.
  assert.ok((js.match(/hkStageClear\(\);/g) || []).length >= 6, "HK_STAGED is cleared on every reset path");
  // hkOp schedules after it repaints.
  assert.match(js, /HK_OPS\.push\(op\);[\s\S]{0,400}?hkPaint\(\);\s*\n\s*hkStageSchedule\(\);/);
});

test("hookui design: every hookui key exists in both en and id", () => {
  const en = i18nTable("en");
  const id = i18nTable("id");
  const enK = Object.keys(en).filter((k) => k.startsWith("hookui.")).sort();
  const idK = Object.keys(id).filter((k) => k.startsWith("hookui.")).sort();
  assert.deepStrictEqual(enK, idK);
  // The keys the panel passes by name to its builders exist too.
  const js = panelJs("hookui");
  for (const m of js.matchAll(/"(hookui\.[a-zA-Z0-9]+)"/g)) assert.ok(m[1] in en, "missing in en: " + m[1]);
});
