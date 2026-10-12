"use strict";
// rules-core — the data half of `orc rules`: the packs, the user ledger, the
// slice assembler and the zero-token lint. Moved from bin/cli.js in ORC 2.3.0 so
// Light ORC can copy it; behaviour unchanged. bin/cli.js keeps the printing,
// the arguments and RULE_LANE_PACKS, and gives the rest through configure().

const fs = require("fs");
const path = require("path");

// deps come from the caller. Each one is a function, read at call time only.
let deps = {};
function configure(d) {
  deps = d;
}
function readOverride(claudeDir) {
  return deps.readOverride(claudeDir);
}
function repoRootOf(claudeDir) {
  return deps.repoRootOf(claudeDir);
}
// A private copy of the cli.js helper (1 line, pure).
const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + "s"}`;

// ── orc rules (v1.7.0) — the anti-slop rule surface ─────────────────────────
//
// A SECOND rule surface, beside the code house rules, and the two never mix.
// It has two halves, written by different people, living in different places:
//
//   ORC RULES   templates/skills/_shared/rules/*.md  →  .claude/skills/_shared/rules/
//               SHIPPED and READ-ONLY. Changes with `orc update`, never with a
//               command. `orc rules set --pack …` is refused BY NAME, because a
//               command that silently does nothing is worse than one that says
//               what replaced it.
//
//   USER RULES  .claude/orc/rules.md
//               The project's own. Plain text, three priority headings, as much
//               text under each as the user wants — the `orc doc rules` design,
//               reused without change, because that argument was already had: a
//               standing instruction is prose, not a form, and nobody's real P0
//               fits on one line.
//
// PRECEDENCE, printed everywhere rather than documented once:
//
//   1. project CODE house rules  (_shared/phases/house-rules.md + CLAUDE.md P0)
//      scope: CODE and agent BEHAVIOUR only. It says nothing about prose, so it
//      never overrules a writing rule — it does not speak about prose at all.
//   2. USER rules — they beat the ORC rules OUTRIGHT on any conflict.
//   3. ORC rules.
//
// An override is NEVER silent. The CLI counts the ones a user NAMED by id, and
// says that is what it counted; a conflict nobody named is found by the agent at
// dispatch time and comes back as `rules_conflicts[]`. That split is deliberate:
// THE CLI CANNOT PARSE INTENT, SO IT DOES NOT PRETEND TO — the same decision
// `orc doc rules` made about its structural boundary, for the same reason. A
// validator that sometimes works is worse than none.
//
// `/orc-doc` reads NONE of this. That lane has its own ledger and its own
// frozen-per-document mechanic, and the two surfaces stay apart on purpose.

const RULES_DIR_NAME = "rules";
const USER_RULES_FILE = "rules.md";
const RULE_PRIORITIES = ["P0", "P1", "P2"];
const RULE_TIERS = ["HARD", "PURPOSE", "LOCK"];
// id → pack, so a finding, an override and a slice line all name the same thing
// forever. The prefix IS the contract; renaming one would orphan every recorded
// finding that referenced it.
const RULE_PACKS = [
  { id: "writing", file: "writing.md", prefix: "OSW", layer: "writing", title: "Writing" },
  { id: "code", file: "code.md", prefix: "OSC", layer: "code", title: "Code" },
  { id: "delivery", file: "delivery.md", prefix: "OSD", layer: "core", title: "Delivery" },
  { id: "ui", file: "ui.md", prefix: "OSU", layer: "ui", title: "UI" },
];
const RULE_PACK_IDS = RULE_PACKS.map((p) => p.id);

const RULES_BOUNDARY =
  "Rules govern WHAT is written and HOW it reads, and WHAT SHAPE of code is " +
  "acceptable. They can never change how a lane RUNS: the scoring, the wave " +
  "order, the gates, the dispatch contract, the ship rules, or any lane's " +
  "structural and safety rules. A rule that asks for one of those comes back as " +
  "unsupported_request — never a guessed compromise.";

const RULES_PRECEDENCE = [
  { rank: 1, layer: "house rules", scope: "CODE and agent BEHAVIOUR only", where: "_shared/phases/house-rules.md + the project's CLAUDE.md P0", beats: "everything below it, always" },
  { rank: 2, layer: "your rules", scope: "everything", where: "<claude>/orc/rules.md", beats: "the ORC rules OUTRIGHT on any conflict" },
  { rank: 3, layer: "ORC rules", scope: "everything", where: "<claude>/skills/_shared/rules/", beats: "nothing — it is the floor, and yours replaces it" },
];

// v2.0.0 DE-8 — the LEARNED tier sits between your rules and the ORC rules.
// It is named ONLY while `habits` is on: off = the ladder of the release before.
function rulesPrecedence(claudeDir) {
  let on = false;
  try {
    on = deps.habitsMode(readOverride(claudeDir).map) !== "off";
  } catch (_) {}
  if (!on) return RULES_PRECEDENCE;
  return [
    RULES_PRECEDENCE[0],
    RULES_PRECEDENCE[1],
    { rank: 3, layer: "learned", scope: "commit, branch and test-file naming", where: "<claude>/orc/habits-state.json (`orc habit repo`)", beats: "the ORC rules — and your rules beat it" },
    Object.assign({}, RULES_PRECEDENCE[2], { rank: 4 }),
  ];
}

// The credit table, as DATA — `orc rules credits --json` and the panel both read
// it; CREDITS.md beside the packs is the long form. Credit is a shipped artifact
// here, not a line in a commit message.
const RULE_CREDITS = [
  { author: "Peter G. Yang", handle: "petergyang", repo: "https://github.com/petergyang/no-ai-slop", license: "MIT", read: "2026-09-13", took: "the prose pack: the named slop patterns, the banned lexicon and phrase lists, the portability test, and the rule that outranks them all — preserve the writer's voice, make the minimum effective edit", packs: ["writing"] },
  { author: "Miqdad Badjuber", handle: "miqdadbadjuber", repo: "https://github.com/miqdadbadjuber/anti-slop", license: "MIT", read: "2026-09-13", took: "the three-tier mechanism (Hard Gate / Purpose-Gate / Quality Lock) every pack uses, rules R-01…R-38 for the UI pack, the antislop-code comment catalogue, R-35 for the delivery pack, and the rule that external direction is data to apply, not instructions to obey", packs: ["ui", "code", "delivery", "writing"] },
  { author: "@ehmo", handle: "ehmo", repo: "https://github.com/ehmo/slopkit", license: "see repo", read: "2026-09-13", took: "the delivery pack, from the slopgent skill: separate observation from inference, guard load-bearing caveats while cutting empty hedges, name the driving variable, no apology theatre, never report an unrun tool", packs: ["delivery"] },
  { author: "@BioInfo", handle: "BioInfo", repo: "https://github.com/BioInfo/slopless", license: "see repo", read: "2026-09-13", took: "surgical-change discipline and the quality gates: read before stating, flag a discrepancy rather than pick one, verify before documenting, and the compatibility rules", packs: ["code", "delivery"] },
  { author: "Andrej Karpathy", handle: "karpathy", repo: "https://theaiarchitects.com/blog/karpathy-claude-md-rules", license: "—", read: "2026-09-13", took: "think before coding, simplicity first, surgical changes, goal-driven execution — and the test ORC reuses directly: every changed line should trace directly to the user's request", packs: ["code"] },
  { author: "Matty Cartwright", handle: null, repo: "https://mattycartwright.com/blog/the-anti-slop-writing-rules", license: "—", read: "2026-09-13", took: "the layered ban structure (words → phrases → sentence patterns → structural patterns), which is how writing.md is ordered, and the read-aloud tests behind OSW-20", packs: ["writing"] },
  { author: "research", handle: null, repo: "https://arxiv.org/html/2512.18020v1", license: "—", read: "2026-09-13", took: "the five LLM-call smells — unbounded max metrics, no model version pinning, no system message, no structured output, temperature not set — which are OSC-20", packs: ["code"] },
  { author: "research", handle: null, repo: "https://arxiv.org/html/2605.02741v1", license: "—", read: "2026-09-13", took: "the Reasoning-Complexity Paradox (OSC-15) and the Modular Mirage (OSC-16), plus the God-class finding (OSC-17)", packs: ["code"] },
  { author: "research", handle: null, repo: "https://arxiv.org/pdf/2510.03029", license: "—", read: "2026-09-13", took: "over-commenting, defensive checks for impossible conditions, and redundant reimplementation — behind OSC-01, OSC-11 and OSC-18", packs: ["code"] },
];

// The packs are PACKAGE content, so they are read the way `_shared/phases/` is:
// the INSTALLED copy first, because that is the one the agent will actually
// open, and the package's own tree as the floor so a global install with no
// project still answers.
function rulesRoot(claudeDir) {
  const installed = path.join(claudeDir, "skills", "_shared", RULES_DIR_NAME);
  if (fs.existsSync(path.join(installed, "INDEX.md"))) return { dir: installed, source: "installed" };
  return { dir: path.join(deps.srcSkills(), "_shared", RULES_DIR_NAME), source: "package" };
}

// `### OSW-01 · HARD · Lead with the point`, then everything until the next
// heading. The middle dot is the separator because no rule title contains one.
const RULE_HEAD_RE = /^###[ \t]+(OS[WCDU]-\d{2})[ \t]*[·|][ \t]*(HARD|PURPOSE|LOCK)[ \t]*[·|][ \t]*(.+?)[ \t]*$/;

function rulesParsePack(text, pack) {
  const rows = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    cur.body = cur.body.join("\n").replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
    rows.push(cur);
    cur = null;
  };
  for (const raw of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const m = RULE_HEAD_RE.exec(raw);
    if (m) {
      flush();
      cur = { id: m[1], tier: m[2], title: m[3], pack: pack.id, prefix: pack.prefix, body: [] };
      continue;
    }
    // A `## ` heading or a horizontal rule ends the rule list — that is the
    // pack's trailing "Not a ban" section, which is prose ABOUT the rules, not
    // a rule. Without the `---` case the separator bled into the last rule's
    // body and rode into every slice.
    if (/^##[ \t]/.test(raw) || /^-{3,}[ \t]*$/.test(raw)) flush();
    else if (cur) cur.body.push(raw);
  }
  flush();
  return rows;
}

function rulesReadPacks(claudeDir) {
  const root = rulesRoot(claudeDir);
  const packs = [];
  let all = [];
  for (const p of RULE_PACKS) {
    const file = path.join(root.dir, p.file);
    let text = null;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (_) {}
    const rules = text === null ? [] : rulesParsePack(text, p);
    packs.push({
      ...p,
      file,
      readable: text !== null,
      count: rules.length,
      tiers: RULE_TIERS.reduce((a, t) => ((a[t] = rules.filter((r) => r.tier === t).length), a), {}),
      rules,
    });
    all = all.concat(rules);
  }
  return {
    dir: root.dir,
    source: root.source,
    readable: packs.every((p) => p.readable),
    packs,
    rules: all,
    count: all.length,
    credits_file: path.join(root.dir, "CREDITS.md"),
  };
}

// ── the user ledger — the `orc doc rules` file format, reused verbatim ──────

const userRulesPath = (claudeDir) => path.join(claudeDir, "orc", USER_RULES_FILE);
const userRulesEmpty = () => ({ P0: "", P1: "", P2: "" });

// With or without `#`s, with or without a colon: a config a human types by hand
// must not fail on a plausible spelling of the only structure it has.
const USER_RULES_HEAD_RE = /^[ \t]*#{0,6}[ \t]*(P[012])[ \t]*[:.)-]?[ \t]*$/;

const USER_RULES_PREAMBLE = [
  "# ORC · project rules",
  "#",
  "# This project's own standing instructions — about the words ORC writes and",
  "# the shape of the code it writes. They are read BEFORE ORC's own anti-slop",
  "# rules, and THEY WIN wherever the two disagree.",
  "#",
  "# Put each one under the heading you want it read at — P0 first, then P1,",
  "# then P2 — in as many lines as you like. There is no one-line rule and no",
  "# rule count: the whole block is handed to every agent VERBATIM.",
  "#",
  "# To switch an ORC rule off, name its id in your own rule:",
  "#   OSW-13: em dashes are our house voice. Use them freely.",
  "#",
  "# Anything above the first `## P0` heading is a note to yourself and is never",
  "# dispatched. Edit this file directly, or in `orc ui` ▸ Rules.",
].join("\n");

function userRulesParse(text) {
  const acc = { P0: [], P1: [], P2: [] };
  const pre = [];
  let cur = null;
  for (const raw of String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n")) {
    const m = USER_RULES_HEAD_RE.exec(raw);
    if (m) {
      cur = m[1];
      continue;
    }
    if (cur) acc[cur].push(raw);
    else pre.push(raw);
  }
  // VERBATIM inside a block: only the blank lines the headings themselves
  // introduce are trimmed. A user's indentation, bullets and blank lines are
  // theirs — the `context.md` rule, applied to a config file.
  const body = (rows) => rows.join("\n").replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
  return {
    preamble: pre.join("\n").replace(/\s+$/, ""),
    blocks: { P0: body(acc.P0), P1: body(acc.P1), P2: body(acc.P2) },
  };
}

function userRulesRender(preamble, blocks) {
  const L = [String(preamble || "").replace(/\s+$/, "") || USER_RULES_PREAMBLE, ""];
  for (const pr of RULE_PRIORITIES) {
    L.push("## " + pr, "");
    const body = String((blocks || {})[pr] || "").replace(/\s+$/, "");
    if (body) L.push(body, "");
  }
  return L.join("\n");
}

function userRulesRead(claudeDir) {
  let text = null;
  try {
    text = fs.readFileSync(userRulesPath(claudeDir), "utf8");
  } catch (_) {}
  const parsed = userRulesParse(text === null ? USER_RULES_PREAMBLE : text);
  const preamble = parsed.preamble || USER_RULES_PREAMBLE;
  return {
    path: userRulesPath(claudeDir),
    exists: text !== null,
    preamble,
    blocks: parsed.blocks,
    text: userRulesRender(preamble, parsed.blocks),
    empty: RULE_PRIORITIES.every((k) => !parsed.blocks[k]),
  };
}

// ONE WRITER, and it is this function, reached only from `orc rules`.
function userRulesWrite(claudeDir, preamble, blocks) {
  const p = userRulesPath(claudeDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const text = userRulesRender(preamble, blocks);
  fs.writeFileSync(p, text);
  return { path: p, text };
}

const userRulesCount = (block) => String(block || "").split("\n").filter((l) => l.trim()).length;
const userRulesCounts = (blocks) =>
  RULE_PRIORITIES.reduce((a, k) => ((a[k] = userRulesCount((blocks || {})[k])), a), {});

// OVERRIDES, counted the only honest way: an ORC rule id the user NAMED. The
// CLI cannot read intent, so it never guesses that a sentence contradicts a
// rule — it reports what was named, says so in the same breath, and leaves the
// rest to the agent, which returns `rules_conflicts[]` at dispatch time.
const RULE_ID_RE = /\bOS[WCDU]-\d{2}\b/g;

function rulesOverrides(blocks, packs) {
  const byId = new Map(packs.rules.map((r) => [r.id, r]));
  const out = [];
  const seen = new Set();
  for (const pr of RULE_PRIORITIES)
    for (const line of String((blocks || {})[pr] || "").split("\n"))
      for (const id of line.match(RULE_ID_RE) || []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const r = byId.get(id);
        out.push({ id, priority: pr, line: line.trim(), known: !!r, tier: r ? r.tier : null, title: r ? r.title : null });
      }
  return out;
}

// The ONE line the preflight prints. A rule set is NEVER silent, and an empty
// user ledger still gets its half of the line.
function rulesLine(packs, blocks, overrides) {
  const c = userRulesCounts(blocks);
  const total = RULE_PRIORITIES.reduce((a, k) => a + c[k], 0);
  const packBit = `ORC ${packs.count} (` + packs.packs.map((p) => `${p.prefix[2]} ${p.count}`).join(" · ") + ")";
  const mine = total
    ? `yours ${plural(total, "line")} (${RULE_PRIORITIES.filter((k) => c[k]).map((k) => `${k} ${c[k]}`).join(" · ")})`
    : "yours none";
  const ov = overrides && overrides.length ? ` · ${plural(overrides.length, "override")}` : "";
  return `${packBit} · ${mine}${ov}`;
}

// ── the slice — the ONLY assembler ─────────────────────────────────────────
//
// No skill builds this text. One assembler means no two lanes can drift, and it
// means the token cost is measurable in exactly one place.
//
// THE TOKEN RULE: 65 rules would ride on EVERY spawn, so HARD rules carry their
// body and PURPOSE/LOCK rules carry one line each plus the file to open when one
// applies. That is the read-ladder discipline this repo already runs on, applied
// to a standing card.
// v1.9.0 - the COMPACT form, and the CLI decides it, never the lane.
// `_shared/phases/rules.md` names `rulesSlice()` as the only lever on the
// card's cost, so a lane that wanted a smaller card had no honest way to ask
// for one. /orc-quick is the lane with the SMALLEST tasks under the LARGEST
// fixed card: the full card measured 13,874 chars, re-sent on every executor
// turn, for a task that often edits one file. Compact keeps every HARD rule's
// ID and its first line - the instruction - and drops the worked examples,
// which are what a rule's body is mostly made of. Nothing is hidden: the pack
// file is named beside the rules, exactly as the light tiers already are.
const RULES_COMPACT_LANES = new Set(["orc-quick"]);
// v2.0.0 DE-17 — the SAME compact card for orc-mini / orc-fast, behind
// `rules_card_compact` (default off). It flips only when eval E4 passes
// (eval/results/2.0.0/E4.md). Off = the full card, byte for byte.
const RULES_COMPACT_OPT_IN = new Set(["orc-mini", "orc-fast"]);

// One line out of a rule body: the first paragraph, whitespace collapsed, cut
// at a word boundary. A rule whose instruction does not survive that is a rule
// whose body is an example, and the pack file is one Read away.
function rulesOneLine(body, max) {
  const first = String(body || "").split(/\n[ \t]*\n/)[0] || "";
  const flat = first.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[ ,;:.]+$/, "") + " …";
}

function rulesSlice(claudeDir, lane, extraPacks) {
  const packs = rulesReadPacks(claudeDir);
  const led = userRulesRead(claudeDir);
  const overrides = rulesOverrides(led.blocks, packs);
  const overridden = new Set(overrides.filter((o) => o.known).map((o) => o.id));
  const want = new Set([...(deps.lanePacks()[lane] || []), ...(extraPacks || [])]);
  const chosen = packs.packs.filter((p) => want.has(p.id));
  let cfgMap = {};
  try {
    cfgMap = readOverride(claudeDir).map || {};
  } catch (_) {}
  const compact =
    RULES_COMPACT_LANES.has(lane) || (RULES_COMPACT_OPT_IN.has(lane) && /^(on|true)$/.test(String(cfgMap.rules_card_compact === undefined || cfgMap.rules_card_compact === null ? "on" : cfgMap.rules_card_compact)));
  // DE-8 — the LEARNED tier. `null` under `habits: off`: then the slice is
  // byte-identical to the release before, and the field is not even present.
  const learned = deps.learnedRules(claudeDir, repoRootOf(claudeDir), cfgMap);
  const inForce = learned ? learned.filter((r) => r.state === "applied") : [];

  const L = [];
  if (!led.empty) {
    L.push("YOUR PROJECT'S RULES — read these FIRST. They WIN over the ORC rules below.", "");
    for (const pr of RULE_PRIORITIES) {
      const body = String(led.blocks[pr] || "").replace(/\s+$/, "");
      if (body) L.push(pr, body, "");
    }
  }
  if (inForce.length) {
    L.push(
      "LEARNED PREFERENCES — computed from this repo's own history, and accepted by you. Your rules above win over these. These win over the ORC rules below.",
      ...inForce.map((r) => `${r.id} · ${r.rule}`),
      ""
    );
  }
  if (chosen.length) {
    L.push(
      `ORC RULES — the anti-slop baseline. Shipped with ORC, read-only. ${packs.count} rules, ${plural(chosen.length, "pack")} in this slice.`,
      // The credits line is a CREDIT, not an instruction, and `orc rules
      // credits` prints it in full. It is the one line a compact card can drop
      // without dropping a rule.
      ...(compact ? [] : ["Source: petergyang/no-ai-slop · miqdadbadjuber/anti-slop · ehmo/slopkit · BioInfo/slopless · Karpathy · Matty Cartwright. Full credits: `orc rules credits`."]),
      "HARD = absolute · PURPOSE = allowed with a written one-line reason · LOCK = consistency, reported never blocking.",
      ...(compact ? ["Each line below is a rule ID and its instruction. Credits: `orc rules credits`."] : []),
      ""
    );
    for (const p of chosen) {
      L.push(`[${p.title}]`);
      for (const r of p.rules) {
        if (overridden.has(r.id)) continue; // the user replaced it
        if (r.tier === "HARD" && compact) L.push(`${r.id} HARD · ${r.title} — ${rulesOneLine(r.body, 62)}`);
        else if (r.tier === "HARD") L.push(`${r.id} HARD · ${r.title}`, r.body, "");
        else L.push(`${r.id} ${r.tier} · ${r.title}`);
      }
      const light = p.rules.filter((r) => r.tier !== "HARD" && !overridden.has(r.id)).length;
      if (compact)
        L.push("", `Every rule above is one line — open ${p.file} for the body and the worked examples of any that applies.`, "");
      else if (light) L.push("", `${plural(light, "rule")} above are one-liners — open ${p.file} when one of them applies.`, "");
    }
  }
  if (overrides.length) {
    L.push(
      "OVERRIDDEN — your rules replaced these, so they are NOT in force here:",
      ...overrides.map((o) => `  ${o.id}${o.known ? " · " + o.title : " (not a known ORC rule id)"} — ${o.line}`),
      ""
    );
  }
  L.push(
    RULES_BOUNDARY,
    "",
    "Return `rules_applied[]` (the ids you acted on), `rules_conflicts[]` (two rules that disagree — a gap, never a silent choice) and `rules_overridden[]` (an ORC id a project rule replaced)."
  );
  return {
    lane,
    packs: chosen.map((p) => p.id),
    // `compact` is REPORTED, never asked for. A reader that cannot tell a short
    // card from a stripped one cannot trust either.
    compact,
    // Present ONLY when habits is on (DE-16: off = zero bytes). Stale rows are
    // listed with their reason and are NOT in `text`.
    ...(learned ? { learned } : {}),
    text: L.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, ""),
    overrides,
    line: rulesLine(packs, led.blocks, overrides),
  };
}

// ── orc rules lint (v1.7.0 W4) — the free half ─────────────────────────────
//
// Deterministic, zero tokens, and DELIBERATELY SMALL. It checks only what a
// string match can PROVE, and it says — in every mode, including `--json` —
// how many rules it did not check. That line is not politeness; it is the
// difference between a lint and a claim. A lint that implied it had graded all
// 65 rules would let a clean exit stand in for a review that never happened,
// which is the `orc doc lint` lesson and the reason that command prints its own
// coverage the same way.
//
// The judgement rules — "is this abstraction speculative", "does this comment
// explain why", "is this sentence portable" — need a reader, not a matcher, and
// nothing here pretends otherwise.
//
// A user rule that NAMES a checkable id suppresses that check, and the
// suppression is printed. Precedence is not a doc: it runs.

// Which rules this matcher can actually prove. The id is the contract, so a
// pack edit that renames one breaks the build here rather than silently
// dropping a check.
const RULE_LINT_IDS = [
  "OSW-10", "OSW-11", "OSW-13", "OSW-18",
  "OSC-02", "OSC-03", "OSC-04", "OSC-05", "OSC-06", "OSC-07", "OSC-21",
  "OSU-03", "OSU-06",
];

const LINT_LEXICON = [
  "delve", "delves", "delving", "leverage", "leverages", "leveraging", "utilize", "utilizes",
  "utilise", "utilises", "facilitate", "facilitates", "empower", "empowers", "streamline",
  "streamlines", "robust", "cutting-edge", "paradigm shift", "game changer", "game-changer",
  "tapestry", "realm", "beacon", "multifaceted", "meticulous", "meticulously", "intricate",
  "paramount", "transformative", "elevate", "elevates", "embark", "supercharge", "supercharged",
  "harness", "harnesses", "ever-evolving", "seamless", "seamlessly", "unleash", "unleashes",
  "pivotal",
];

const LINT_PHRASES = [
  "it's worth noting", "it is worth noting", "it's important to note", "it is important to note",
  "at the end of the day", "when it comes to", "at its core", "in today's world", "in the age of",
  "in the world of", "the reality is", "the truth is", "in terms of", "with regard to",
  "going forward", "let's dive in", "in this article",
];

const LINT_BUZZWORDS = [
  "ai powered", "ai-powered", "next generation", "next-generation", "revolutionary",
  "seamless", "cutting edge", "cutting-edge", "intelligent", "ultimate", "powerful",
  "effortless", "supercharged",
];

// The whole comment IS the label. Matched against the comment's text with the
// marker and trailing punctuation stripped, so `// Main logic` is a finding and
// `// Main logic runs only on the retry path` is not.
const LINT_EMPTY_LABELS = [
  "main logic", "core logic", "business logic", "helper function", "helper functions",
  "helpers", "utils", "utilities", "entry point", "error handling", "imports", "constants",
  "variables", "initialization", "initialisation", "setup", "cleanup", "configuration",
  "note this is important", "important please read", "the main function", "main function",
];

// A TODO that names a feeling instead of a task.
const LINT_VAGUE_TODO = [
  "", "improve this", "improve", "improve later", "optimize", "optimise", "optimize this",
  "future improvements", "future improvement", "additional optimization can be added here",
  "add more validation", "add more", "more validation", "more tests", "clean this up",
  "cleanup", "clean up", "refactor", "refactor this", "fix this", "better", "do better",
  "handle this", "revisit", "revisit this", "later", "tbd",
];

const EMOJI_RE = /\p{Extended_Pictographic}/u;

const LINT_PROSE_EXT = new Set([".md", ".markdown", ".txt", ".mdx", ".rst"]);
const LINT_UI_EXT = new Set([".css", ".scss", ".sass", ".less", ".html", ".htm", ".vue", ".svelte", ".jsx", ".tsx"]);
const LINT_CODE_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".swift", ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".php", ".sh", ".bash", ".zsh", ".sql",
  ".css", ".scss", ".less", ".vue", ".svelte", ".yml", ".yaml",
]);
const LINT_SKIP_DIR = new Set([".git", "node_modules", "dist", "build", "vendor", ".next", "coverage", ".claude"]);

// Strip a line's comment marker and return the comment's own text, or null when
// the line is not a whole-line comment. Only whole-line comments are linted: a
// trailing comment after real code is where the genuinely useful one-liners
// live, and flagging those would make the lint noise.
function lintCommentText(line) {
  const t = line.trim();
  let m = /^(?:\/\/+|#+|--|;;?|\*|\/\*+|<!--)\s?(.*?)(?:\*\/|-->)?\s*$/.exec(t);
  if (!m) return null;
  if (!/^(?:\/\/|#|--|;|\*|\/\*|<!--)/.test(t)) return null;
  return m[1];
}

const lintNormalise = (s) => String(s || "").toLowerCase().replace(/[.:!?,;*_`]+$/g, "").replace(/\s+/g, " ").trim();

function lintScanFile(abs, rel, opts) {
  const ext = path.extname(rel).toLowerCase();
  const base = path.basename(rel);
  const out = [];
  const on = (id) => opts.active.has(id);
  const add = (id, line, evidence, fix) => {
    const r = opts.byId.get(id);
    out.push({
      file: rel,
      line,
      rule: id,
      tier: r ? r.tier : null,
      pack: r ? r.pack : null,
      title: r ? r.title : null,
      evidence,
      fix,
    });
  };

  // OSC-21 is about the file's NAME, so it fires before a byte is read.
  if (on("OSC-21")) {
    if (/^(summary|implementation[_-]?notes|changes|notes|readme[_-]new)\.(md|txt)$/i.test(base) ||
        /[._-](final|v2|new|copy|old|bak|orig)\.[a-z0-9]+$/i.test(base) ||
        /\.(bak|old|orig)$/i.test(base))
      add("OSC-21", 1, base, "nobody asked for this file. Report it in the return instead of leaving it behind.");
  }

  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (_) {
    return out;
  }
  if (text.includes("\u0000")) return out; // binary
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  // THE CARVE-OUT, and it is not a convenience. A rule that bans a word has to
  // PRINT that word to define it, so the packs themselves fail their own lint on
  // every line — and a lint whose loudest findings are its own documentation is
  // a lint people learn to ignore. anti-slop's R-02 needed the same carve-out
  // for the same reason.
  //
  // Two markers, both explicit, both counted in the summary so an exemption is
  // never silent:
  //   <!-- orc-rules:… -->   in the head → this IS a rules pack. Skipped whole.
  //   orc-rules-ignore-file  in the head → the user's own opt-out. Skipped whole.
  //   orc-rules-ignore       on a line   → that line only.
  const head = text.slice(0, 600);
  if (/<!--\s*orc-rules:/.test(head)) {
    opts.exempt.packs.push(rel);
    return out;
  }
  if (/orc-rules-ignore-file/.test(head)) {
    opts.exempt.files.push(rel);
    return out;
  }

  const isProse = LINT_PROSE_EXT.has(ext);
  const isCode = LINT_CODE_EXT.has(ext);
  const isUi = LINT_UI_EXT.has(ext);

  // Prose rules run on prose files AND on the comments inside code, because a
  // banned word is a banned word wherever ORC wrote it.
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.includes("orc-rules-ignore")) continue;
    const n = i + 1;
    const comment = isCode ? lintCommentText(raw) : null;
    const prose = isProse ? raw : comment;

    if (prose !== null && prose !== undefined) {
      const low = prose.toLowerCase();
      if (on("OSW-10"))
        for (const w of LINT_LEXICON)
          if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low)) {
            add("OSW-10", n, w, "use the plain word");
            break; // one finding per line — a list of six is a list nobody reads
          }
      if (on("OSW-11"))
        for (const p of LINT_PHRASES)
          if (low.includes(p)) {
            add("OSW-11", n, p, "delete the clause and keep the point");
            break;
          }
    }

    if (isProse && on("OSW-18") && /^#{1,6}\s/.test(raw) && EMOJI_RE.test(raw))
      add("OSW-18", n, raw.trim().slice(0, 60), "format follows the content; it does not decorate it");

    if (isUi && on("OSU-06")) {
      const low = raw.toLowerCase();
      for (const b of LINT_BUZZWORDS)
        if (low.includes(b)) {
          add("OSU-06", n, b, "say what it does; show evidence, not adjectives");
          break;
        }
    }

    if (isUi && on("OSU-03") && /outline\s*:\s*(none|0)\b/i.test(raw)) {
      // HEURISTIC, and the finding says so: a replacement indicator within five
      // lines either way counts as one. The lint cannot prove a focus ring is
      // visible; it can prove nobody wrote one nearby.
      const near = lines.slice(Math.max(0, i - 5), i + 6).join("\n");
      if (!/:focus-visible|box-shadow|outline-offset|outline\s*:\s*(?!none|0)\S/i.test(near))
        add("OSU-03", n, raw.trim().slice(0, 60), "replace it with a visible focus indicator, or drop the reset (heuristic: none found within five lines)");
    }

    if (comment !== null && comment !== undefined) {
      const c = comment.trim();
      const norm = lintNormalise(c);

      if (on("OSC-02")) {
        if (/([=\-*_~#])\1{5,}/.test(c))
          add("OSC-02", n, c.slice(0, 40), "one plain line, or nothing");
        else if (c.length > 2 && c.length <= 40 && /^[A-Z0-9 ()\-]+$/.test(c) && /[A-Z]{2,}/.test(c))
          add("OSC-02", n, c, "sentence case, and only if the label carries a fact");
      }
      if (on("OSC-03") && /^(step\s*\d+\b|first|next|then|finally|lastly)\s*[:.\-…]*\s*$/i.test(c.replace(/\.\.\.$/, "")))
        add("OSC-03", n, c, "the control flow is already visible — delete it");
      if (on("OSC-03") && /^step\s*\d+\s*[:.\-]/i.test(c))
        add("OSC-03", n, c.slice(0, 40), "the control flow is already visible — delete it");
      if (on("OSC-04") && LINT_EMPTY_LABELS.includes(norm))
        add("OSC-04", n, c, "the label names a category, not a fact — delete it");
      if (on("OSC-05")) {
        const t = /^(TODO|FIXME|XXX)\b\s*:?\s*(.*)$/i.exec(c);
        if (t && LINT_VAGUE_TODO.includes(lintNormalise(t[2])))
          add("OSC-05", n, c, "name the task and enough context to act on it, or delete it");
      }
      if (on("OSC-06") && EMOJI_RE.test(c))
        add("OSC-06", n, c.slice(0, 40), "plain English, or nothing");
      if (on("OSC-07") && /^end(\s+(of\s+)?[\w$.]+)?\s*[.]?$/i.test(c))
        add("OSC-07", n, c, "the closing brace already ends the block");
    }
    if (isCode && on("OSC-07") && /[})\]]\s*(?:\/\/|#|--)\s*end\b/i.test(raw))
      add("OSC-07", n, raw.trim().slice(0, 40), "the closing brace already ends the block");
  }

  // OSW-13 is a DOSE rule, so it is measured per file, never per occurrence.
  if (isProse && on("OSW-13")) {
    const dashes = (text.match(/—/g) || []).length;
    const words = (text.match(/\S+/g) || []).length;
    if (dashes) {
      const short = words < 150;
      const per1000 = words ? (dashes / words) * 1000 : dashes;
      if (short)
        add("OSW-13", 1, `${plural(dashes, "em dash", "em dashes")} in ${plural(words, "word")}`, "short output carries none");
      else if (per1000 > 2)
        add("OSW-13", 1, `${dashes} em dashes, ${per1000.toFixed(1)} per 1000 words (cap 2)`, "keep the ones that beat a comma, a period or parentheses; cut the rest");
    }
  }
  return out;
}

function lintWalk(abs, rel, acc, depth) {
  let st;
  try {
    st = fs.statSync(abs);
  } catch (_) {
    return;
  }
  if (st.isFile()) {
    acc.push({ abs, rel });
    return;
  }
  if (!st.isDirectory() || depth > 12) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory() && LINT_SKIP_DIR.has(e.name)) continue;
    if (e.name.startsWith(".") && e.isDirectory()) continue;
    lintWalk(path.join(abs, e.name), rel ? rel + "/" + e.name : e.name, acc, depth + 1);
  }
}

module.exports = {
  configure,
  RULES_DIR_NAME, USER_RULES_FILE, RULE_PRIORITIES, RULE_TIERS, RULE_PACKS, RULE_PACK_IDS, RULES_BOUNDARY,
  RULES_PRECEDENCE, rulesPrecedence, RULE_CREDITS, rulesRoot, RULE_HEAD_RE, rulesParsePack, rulesReadPacks, userRulesPath,
  userRulesEmpty, USER_RULES_HEAD_RE, USER_RULES_PREAMBLE, userRulesParse, userRulesRender, userRulesRead, userRulesWrite,
  userRulesCount, userRulesCounts, RULE_ID_RE, rulesOverrides, rulesLine, RULES_COMPACT_LANES, RULES_COMPACT_OPT_IN,
  rulesOneLine, rulesSlice, RULE_LINT_IDS, LINT_LEXICON, LINT_PHRASES, LINT_BUZZWORDS, LINT_EMPTY_LABELS, LINT_VAGUE_TODO,
  EMOJI_RE, LINT_PROSE_EXT, LINT_UI_EXT, LINT_CODE_EXT, LINT_SKIP_DIR, lintCommentText, lintNormalise, lintScanFile, lintWalk,
};
