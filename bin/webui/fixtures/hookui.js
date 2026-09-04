"use strict";
/**
 * fixtures/hookui.js — canned `orc statusline …` responses.
 *
 * ONE OF EVERY STATE, INCLUDING THE UGLY ONES. You cannot design a caution
 * strip on a layout that validates, a `5/5` chip on a line with two things on
 * it, or a refused palette row on a project where nothing is refused.
 *
 * So this set carries: the feature OFF with a saved layout, a line at 5/5, a
 * line 3 blocked by the dense-prefix rule, one hard error and two warnings, a
 * refused component, a component rendering an em dash, and a preview in all
 * three degraded forms.
 *
 * The ANSI here is REAL — the panel's job is to turn escape sequences into DOM,
 * and a fixture of plain text would exercise none of that.
 */

const E = String.fromCharCode(27);
const R = E + "[0m";
const dim = (s) => E + "[90m" + s + R;
const green = (s) => E + "[32m" + s + R;
const amber = (s) => E + "[33m" + s + R;
const red = (s) => E + "[31m" + s + R;

// The rendered bar, in its four forms. Line 3 is deliberately the shortest —
// the board's third line usually is.
const previewText =
  amber("🚀") + " " + dim("ORC ") + "1.3.0 · Opus 5/high · " + dim("context ") + green("38%") + " · " + amber("██████░░░░") + "\n" +
  "   ▰ " + dim("status ") + "quick · Q3 DO · " + dim("agents ") + " 7 · " + dim("Dur ") + " 48m · main\n" +
  "   " + dim("cache ") + "●" + " " + green("███████▊░░") + " · " + dim("MTok ") + "412K · " + red("—");

const previewNoColor =
  "🚀 ORC 1.3.0 · Opus 5/high · context 38% · ██████░░░░\n" +
  "   ▰ status quick · Q3 DO · agents  7 · Dur  48m · main\n" +
  "   cache ● ███████▊░░ · MTok 412K · —";

const previewAscii =
  "++ ORC 1.3.0 - Opus 5/high - context 38% - ######....\n" +
  "   = status quick - Q3 DO - agents  7 - Dur  48m - main\n" +
  "   cache o #######|.. - MTok 412K - -";

const preview = {
  ok: true,
  width: 120,
  state: "healthy",
  fixture: "a healthy session mid-run",
  fixtures: {
    healthy: "a healthy session mid-run",
    degraded: "the wrong tier, a full window, and nothing running",
    empty: "a payload with nothing in it — every component on its unknown form",
  },
  text: previewText,
  strippings: { no_color: previewNoColor, ascii: previewAscii, no_motion: previewNoColor },
  static_width: [58, 62, 44],
  errors: [],
};

// A rendered sample per renderer, which is what makes the shape gallery a
// gallery rather than a dropdown of words.
const P = (id) => ({
  bare: "38%",
  plain: dim(id + " ") + "38%",
  "label-value": dim(id.toUpperCase() + ": ") + "38%",
  bracket: "[" + dim(id.toUpperCase() + " ") + "38%]",
  paren: "(38%)",
  badge: "▏" + dim(id.toUpperCase() + " ") + "38%▕",
  pill: E + "[7m" + id.slice(0, 3).toUpperCase() + R + "38%",
  bar: "38% " + amber("███░░░░░░░"),
  blocks: amber("███░░░░░░░"),
  fine: amber("███▊      "),
  dots: "●●●○○",
  gauge: "◔",
  ring: "◔",
  shape: green("●"),
  word: green("ok"),
  icon: "✅",
  spark: "▁▂▃▅▆▇",
  trend: "▲",
});

const components = {
  ok: true,
  schema: 1,
  catalog_hash: "b7c1d2e3f4a5968708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f",
  count: 6,
  groups: { A: "Session and tier", B: "Quota and spend", D: "Knowledge", H: "Project and VCS" },
  components: [
    {
      id: "verdict", group: "A", label: null,
      summary: "The ORC-ready verdict icon.",
      renderers: ["icon", "shape", "word", "badge"],
      defaults: { render: "icon" },
      states: ["ready", "boosted", "degrade"],
      shapes: { ready: "✅", boosted: "🚀", degrade: "⛔" },
      bounded: false, series: null, unknown: "dash", cost: "free",
      refused_reason: null, params: null, binding: "verdict.state",
      composite: null, time_based: false,
      previews: { icon: "🚀", shape: "🚀", word: green("boosted"), badge: "▏🚀▕" },
    },
    {
      id: "context", group: "A", label: "context",
      summary: "How full the context window is.",
      renderers: ["plain", "label-value", "bar", "blocks", "fine", "dots", "gauge", "ring", "bare"],
      defaults: { render: "plain", format: "percent", min_width: 3, align: "right", ramp: "heat" },
      states: ["ok", "warn", "full"],
      shapes: { ok: "●", warn: "◐", full: "○" },
      bounded: true, series: null, unknown: "dash", cost: "free",
      refused_reason: null, params: null, binding: "ctx.used_pct",
      composite: null, time_based: false,
      previews: P("context"),
    },
    {
      id: "quota-5h", group: "B", label: "5h",
      summary: "The 5-hour usage window.",
      renderers: ["plain", "bar", "blocks", "spark", "bare"],
      defaults: { render: "plain", format: "percent", min_width: 3, align: "right", ramp: "heat" },
      states: ["ok", "warn", "critical"],
      shapes: { ok: "●", warn: "◐", critical: "○" },
      bounded: true, series: "quota5h", unknown: "dash", cost: "free",
      refused_reason: null, params: null, binding: "quota.5h.pct",
      composite: null, time_based: false,
      previews: P("5h"),
    },
    // A COMPONENT RENDERING AN EM DASH. Its file does not exist in this
    // project, so it says so — and it is still placeable, because `—` and "this
    // build has no such segment" are different facts.
    {
      id: "wiki", group: "D", label: "wiki",
      summary: "How old the project wiki is, from the wiki's own oldest anchor.",
      renderers: ["word", "shape", "badge"],
      defaults: { render: "word" },
      states: ["fresh", "aging", "stale", "unregistered", "none"],
      shapes: { fresh: "●", aging: "◐", stale: "○", unregistered: "?", none: "·" },
      bounded: false, series: null, unknown: "dash", cost: "new-read",
      refused_reason: null, params: null, binding: "wiki.tier",
      composite: null, time_based: false,
      previews: { word: "—", shape: "—", badge: "▏—▕" },
    },
    {
      id: "branch", group: "H", label: null,
      summary: "The current git branch, read from .git/HEAD with NO subprocess.",
      renderers: ["bare", "plain", "badge"],
      defaults: { render: "bare", truncate: "middle", max_len: 24 },
      states: null, shapes: null, bounded: false, series: null,
      unknown: "hide", cost: "scan", refused_reason: null, params: null,
      binding: "git.branch", composite: null, time_based: false,
      previews: { bare: "main", plain: dim("branch ") + "main", badge: "▏main▕" },
    },
    // A REFUSED ROW. It keeps its slot, carries the measurement, and gets NO
    // BUTTON AT ALL — never a disabled one. "We decided against this" and "we
    // forgot" must not look the same.
    {
      id: "git-dirty", group: "H", label: "±",
      summary: "Uncommitted changes.",
      renderers: ["plain", "label-value", "bare"],
      defaults: { render: "plain" },
      states: null, shapes: null, bounded: false, series: null,
      unknown: "dash", cost: "refused",
      refused_reason:
        "it needs a `git status` subprocess, and W0 measured one at 53ms against roughly 15ms of headroom on a surface that re-renders on every keystroke.",
      params: null, binding: null, composite: null, time_based: false,
      previews: {},
    },
  ],
  renderers: {
    bare: { kind: "text", form: "value", needs: null, width: null, decoration: false },
    plain: { kind: "text", form: "label value", needs: null, width: null, decoration: false },
    "label-value": { kind: "text", form: "LABEL: value", needs: null, width: null, decoration: false },
    bracket: { kind: "text", form: "[LABEL: value]", needs: null, width: null, decoration: false },
    paren: { kind: "text", form: "(value)", needs: null, width: null, decoration: false },
    badge: { kind: "text", form: "▏LABEL value▕", needs: null, width: null, decoration: false },
    pill: { kind: "text", form: "⟪LABEL⟫value", needs: null, width: null, decoration: false },
    word: { kind: "text", form: "STATE", needs: "states", width: null, decoration: false },
    bar: { kind: "bar", form: null, needs: "bounded", width: [4, 16], decoration: false },
    blocks: { kind: "bar", form: null, needs: "bounded", width: [2, 16], decoration: false },
    fine: { kind: "bar", form: null, needs: "bounded", width: [2, 16], decoration: false },
    dots: { kind: "bar", form: null, needs: "ordinal", width: [2, 10], decoration: false },
    gauge: { kind: "bar", form: null, needs: "bounded", width: [1, 1], decoration: false },
    ring: { kind: "bar", form: null, needs: "bounded", width: [1, 1], decoration: false },
    shape: { kind: "state", form: null, needs: "states", width: null, decoration: false },
    icon: { kind: "state", form: null, needs: "states", width: null, decoration: false },
    spark: { kind: "series", form: null, needs: "series", width: [4, 16], decoration: false },
    trend: { kind: "series", form: null, needs: "series", width: null, decoration: false },
  },
  glyph_sets: ["blocks", "bars", "pipes", "braille", "shade", "minimal", "ascii"],
  ramps: {
    heat: { stops: [0, 60, 85], colors: ["green", "yellow", "red"], why: "high is bad" },
    cool: { stops: [0, 60, 85], colors: ["red", "yellow", "green"], why: "high is good" },
    mono: { stops: [0, 60, 85], colors: [null, null, null], why: "NO_COLOR-safe: emphasis, not hue" },
    state: { stops: null, colors: null, why: "the component's own state colours" },
  },
  themes: {
    terminal: { ok: "green", warn: "yellow", critical: "red", muted: "bright-black", accent: "cyan", label: "bright-black", value: "default" },
    dim: { ok: "green", warn: "yellow", critical: "red", muted: "bright-black", accent: "bright-black", label: "bright-black", value: "bright-black" },
    "high-contrast": { ok: "bright-green", warn: "bright-yellow", critical: "bright-red", muted: "white", accent: "bright-cyan", label: "bright-white", value: "bright-white" },
    mono: { ok: null, warn: null, critical: null, muted: null, accent: null, label: null, value: null },
  },
  hide_when: [
    { id: "never", says: "always render. A state keeps its slot." },
    { id: "empty", says: "hide when the value is absent" },
    { id: "zero", says: "hide when the value is exactly 0" },
    { id: "unknown", says: "hide when the value could not be computed" },
    { id: "ok", says: "hide while healthy — show me only problems" },
    { id: "idle", says: "hide when no run is active" },
    { id: "no-run", says: "hide when no ORC run was opened this session" },
    { id: "narrow", says: "hide below this component's min_cols" },
    { id: "wide", says: "hide above this component's max_cols" },
  ],
  formats: ["percent", "ratio", "fraction", "decimal", "plain"],
  compact: ["off", "si", "bytes"],
  cases: ["none", "upper", "lower", "title"],
  truncate: ["end", "middle", "none"],
  emphasis: ["normal", "bold", "dim", "italic", "underline", "reverse", "strike"],
  refused_emphasis: ["blink"],
  colors: ["red", "green", "yellow", "blue", "magenta", "cyan", "bright-black", "bright-cyan", "default"],
  max_per_line: 5,
  lines: 3,
  dense_prefix: "A line may hold a component only if every line above it holds at least one.",
};

// THE FEATURE IS OFF WITH A LAYOUT SAVED — the state a user is in for most of
// the time they are composing, and the one the gate card exists for. Line 1 is
// at 5/5; line 3 is empty, so the board can show a full line and an ordinary
// one at once.
const show = {
  ok: false,
  enabled: false,
  saved: true,
  preset: null,
  theme: "terminal",
  glyphs: "blocks",
  ansi: "auto",
  align_columns: false,
  lines: [
    {
      line: 1, separator: " · ", theme: null, max_width: 0, count: 5, counted: 5, full: true,
      items: [
        { pos: 1, id: "i1", type: "verdict", render: "icon", label: null, label_color: "bright-black", value_color: "default", ramp: null, emphasis: [], hide_when: [], unknown: "dash", known: true },
        { pos: 2, id: "i2", type: "context", render: "bar", label: "CTX", label_color: "bright-black", value_color: null, ramp: "heat", emphasis: ["bold"], hide_when: [], unknown: "dash", known: true },
        { pos: 3, id: "i3", type: "quota-5h", render: "plain", label: "5h", label_color: "bright-black", value_color: "default", ramp: "heat", emphasis: [], hide_when: [], unknown: "dash", known: true },
        { pos: 4, id: "i4", type: "branch", render: "bare", label: null, label_color: "bright-black", value_color: "default", ramp: null, emphasis: [], hide_when: [], unknown: "hide", known: true },
        { pos: 5, id: "i5", type: "wiki", render: "word", label: "wiki", label_color: "bright-black", value_color: "default", ramp: null, emphasis: [], hide_when: [], unknown: "dash", known: true },
      ],
    },
    {
      line: 2, separator: " · ", theme: null, max_width: 0, count: 2, counted: 2, full: false,
      items: [
        { pos: 1, id: "i6", type: "context", render: "fine", label: null, label_color: "bright-black", value_color: "default", ramp: null, emphasis: [], hide_when: ["ok"], unknown: "dash", known: true },
        // AN UNKNOWN COMPONENT ID — what an upgrade that retired a component
        // leaves behind. Reported, never auto-repaired.
        { pos: 2, id: "i7", type: "retired-thing", render: "bare", label: null, label_color: null, value_color: null, ramp: null, emphasis: [], hide_when: [], unknown: null, known: false },
      ],
    },
    { line: 3, separator: " · ", theme: null, max_width: 0, count: 0, counted: 0, full: false, items: [] },
  ],
  // ONE HARD ERROR and TWO WARNINGS, so the caution strip can show that an error
  // is a refusal and a warning is a fact the user then owns.
  errors: ['unknown component "retired-thing" on line 2 position 2 — did you mean "resume"?'],
  warnings: [
    "line 1 shows the same value twice (context, context)",
    '"verdict" carries meaning in its colour (ready/boosted/degrade) and you set a flat colour — a green ⛔ is a status line that lies',
  ],
  preview: previewText,
  dense_prefix: components.dense_prefix,
};

const presets = {
  ok: true,
  presets: [
    { name: "orc-default", summary: "Today's two lines, exactly. The byte-identical baseline.", active: false, preview: previewNoColor.split("\n").slice(0, 2).join("\n") },
    { name: "minimal", summary: "One line, four slots, the dim theme. The support answer for a busy terminal.", active: false, preview: dim("🚀 ORC 1.3.0 · Opus 5/high · ") + amber("███▊      ") + dim(" · main") },
    { name: "cost-watch", summary: "What this session is spending, in every unit the payload gives for free.", active: true, preview: previewText.split("\n").slice(0, 2).join("\n") },
    { name: "mono", summary: "No colour anywhere — shapes and emphasis only. The right preset for a README screenshot.", active: false, preview: previewNoColor },
  ],
};

const explain = {
  ok: true,
  id: "i2",
  type: "context",
  line: 1,
  pos: 2,
  resolved: [
    { field: "render", value: "bar", source: "item" },
    { field: "label", value: "CTX", source: "item" },
    { field: "label_color", value: "bright-black", source: "theme:terminal" },
    { field: "glyphs", value: "blocks", source: "file" },
    { field: "min_width", value: 3, source: "catalogue" },
    { field: "ramp", value: "heat", source: "catalogue" },
  ],
  order: ["catalogue", "theme", "file", "line", "item"],
};


// ── the SECOND board (v1.4.0) ──────────────────────────────────────────────
// A designer cannot lay out a per-agent row against the status line's
// components, so the fixture set carries both boards. Same rule as everywhere
// else here: one of every state, including the ugly ones — a failed agent, an
// agent whose window size is unknown, and one whose token count has not been
// seen yet.
const subComponents = {
  ok: true,
  schema: 1,
  catalog_hash: components.catalog_hash,
  count: 4,
  board: "subagent",
  boards: ["status", "subagent"],
  config_key: "subagent_line_custom",
  setting: "subagentStatusLine",
  groups: { T: "One subagent (the agent-panel row)" },
  components: [
    {
      id: "task-name", group: "T", board: "subagent", label: null,
      summary: "The agent's name.",
      renderers: ["bare", "plain", "badge", "pill"],
      defaults: { render: "bare", truncate: "middle", max_len: 28 },
      states: null, shapes: null, bounded: false, series: null,
      unknown: "dash", cost: "free", refused_reason: null, params: null,
      binding: "task.name", composite: null, time_based: false,
      previews: { bare: "orc-executor-opus-5-low", plain: dim("task-name ") + "orc-executor-opus-5-low", badge: "▏orc-executor-opus-5-low▕", pill: E + "[7mTASK" + R + "orc-executor-opus-5-low" },
    },
    {
      id: "task-tier", group: "T", board: "subagent", label: null,
      summary: "The model and effort this agent is ACTUALLY running at — observed, not derived from its name and not self-reported.",
      renderers: ["bare", "plain", "label-value", "badge"],
      defaults: { render: "bare" },
      states: null, shapes: null, bounded: false, series: null,
      unknown: "dash", cost: "free", refused_reason: null, params: null,
      binding: "task.tier", composite: null, time_based: false,
      previews: { bare: "O5/low", plain: dim("tier ") + "O5/low", "label-value": dim("TIER: ") + "O5/low", badge: "▏O5/low▕" },
    },
    {
      id: "task-tokens", group: "T", board: "subagent", label: null,
      summary: "How many tokens this agent has used. THE NUMBER v1.2.0 SAID COULD NOT BE MEASURED.",
      renderers: ["plain", "label-value", "bare"],
      defaults: { render: "plain", compact: "si" },
      states: null, shapes: null, bounded: false, series: null,
      unknown: "dash", cost: "free", refused_reason: null, params: null,
      binding: "task.tokens", composite: null, time_based: false,
      previews: { plain: "84K", "label-value": dim("TOKENS: ") + "84K", bare: "84K" },
    },
    {
      id: "task-status", group: "T", board: "subagent", label: null,
      summary: "What this agent is doing.",
      renderers: ["word", "shape", "badge", "bare"],
      defaults: { render: "word" },
      states: ["pending", "running", "completed", "failed"],
      shapes: { pending: "○", running: "●", completed: "✓", failed: "▲" },
      bounded: false, series: null, unknown: "dash", cost: "free",
      refused_reason: null, params: null, binding: "task.status",
      composite: null, time_based: false,
      previews: { word: amber("running"), shape: amber("●"), badge: "▏" + amber("running") + "▕", bare: "running" },
    },
  ],
  renderers: components.renderers,
  glyph_sets: components.glyph_sets,
  ramps: components.ramps,
  themes: components.themes,
  hide_when: components.hide_when,
  formats: components.formats,
  compact: components.compact,
  cases: components.cases,
  truncate: components.truncate,
  emphasis: components.emphasis,
  refused_emphasis: components.refused_emphasis,
  colors: components.colors,
  max_per_line: 5,
  // ONE LINE by construction: Claude Code renders one row per task.
  lines: 1,
  dense_prefix: components.dense_prefix,
};

const subShow = {
  ok: true,
  enabled: true,
  saved: true,
  preset: "agent-default",
  theme: "terminal",
  glyphs: "blocks",
  ansi: "auto",
  align_columns: false,
  lines: [
    {
      line: 1, separator: " · ", theme: null, max_width: 0, count: 4, counted: 4, full: false,
      items: [
        { pos: 1, id: "s1", type: "task-status", render: "shape", label: null, label_color: "bright-black", value_color: "default", ramp: null, emphasis: [], hide_when: [], unknown: "dash", known: true },
        { pos: 2, id: "s2", type: "task-name", render: "bare", label: null, label_color: "bright-black", value_color: "default", ramp: null, emphasis: [], hide_when: [], unknown: "dash", known: true },
        { pos: 3, id: "s3", type: "task-tier", render: "bare", label: null, label_color: "bright-black", value_color: "default", ramp: null, emphasis: ["dim"], hide_when: [], unknown: "dash", known: true },
        { pos: 4, id: "s4", type: "task-tokens", render: "plain", label: null, label_color: "bright-black", value_color: "default", ramp: null, emphasis: [], hide_when: [], unknown: "dash", known: true },
      ],
    },
  ],
  errors: [],
  // A layout can be perfectly valid and still worth a caution.
  warnings: ["task-tokens is a FLOOR: an agent that finishes between two redraws is never counted"],
  preview: amber("●") + " orc-executor-opus-5-low · " + dim("O5/low") + " · 84K",
  dense_prefix: components.dense_prefix,
};

const subPresets = {
  ok: true,
  presets: [
    { name: "agent-default", board: "subagent", summary: "What the agent is, what it is running at, and what it has cost so far.", active: true, preview: "orc-executor-opus-5-low · " + dim("O5/low") + " · 84K · " + dim("for ") + " 17m" },
    { name: "agent-watch", board: "subagent", summary: "For a run you are watching: status, its own context window, and the clock.", active: false, preview: amber("●") + " orc-executor-opus-5-low · " + green("███▎░░░░") + " · " + dim("for ") + " 17m" },
    { name: "agent-tier", board: "subagent", summary: "The downgrade check, made visible: the model and effort ORC actually got, per agent.", active: false, preview: "orc-executor-opus-5-low · claude-opus-5 · low · " + amber("running") },
  ],
};

module.exports = { show, components, presets, preview, explain, subShow, subComponents, subPresets };
