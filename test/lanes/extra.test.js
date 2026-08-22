"use strict";
// `orc extra` — THE PAYLOAD SIDE (v0.50.0).
//
// The CLI half is covered by test/cli/extra-*.test.js and the panel half by
// test/webui/panels.test.js. What lives here is the SKILL PAYLOAD: the rules a
// lane has to state, and — more importantly — the ONE place each of them is
// allowed to be stated in.
//
// The failure this file exists to prevent is a lane that sends work off Claude
// without saying so, and its mirror: the same rule written twice in two
// wordings, which is drift no lint can see.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..", "..");
const SKILLS = path.join(REPO, "templates", "skills");
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), "utf8").replace(/\r\n/g, "\n");

const CANON = "_shared/extra-dispatch.md";
const canon = () => read("_shared", "extra-dispatch.md");

test("extra: the canonical contract is ONE file, and the lanes point at it", () => {
  const c = canon();
  // The five things that have exactly one home. A lane may name the TRIGGER;
  // the mechanics live here and nowhere else.
  for (const token of [
    "orc extra dispatch",
    "orc extra resolve",
    "concurrency-cap",
    "SUBSTITUTION",
    "REROUTE",
  ])
    assert.ok(c.includes(token), `the canonical contract must carry ${token}`);

  // Every lane that dispatches names the canonical file rather than restating
  // it. A spine that explains the transport is a second copy of the transport.
  for (const lane of ["orc", "orc-mini", "orc-fast"])
    assert.match(
      read(lane, "SKILL.md"),
      /extra-dispatch\.md/,
      `${lane} must POINT at ${CANON} rather than restate it`
    );
});

// The rule that has no score to work from, and therefore the one most likely to
// be re-invented as "use the midpoint". A midpoint would let a row covering
// [55,58) capture an ENTIRE mini run on the strength of three scores out of ten
// — a number ORC invented to satisfy an interface is not a routing decision the
// user made.
test("extra: a fixed-executor lane resolves the BAND at BOTH EDGES, and they must agree", () => {
  const c = canon();
  assert.match(c, /BOTH EDGES/, "the canonical file states the rule");
  assert.ok(
    !/midpoint|mid-point/i.test(c) || /never|not|rejected/i.test(c),
    "a midpoint may only appear as the rejected alternative"
  );
  for (const lane of ["orc-mini", "orc-fast"]) {
    const s = read(lane, "SKILL.md");
    assert.match(s, /BAND/, `${lane} names the band rule`);
    assert.match(s, /both edges/i, `${lane} states that BOTH edges are resolved`);
    assert.match(s, /agree/i, `${lane} states that the two edges must AGREE`);
  }
});

// Two hard hold-backs sit beside the resolver, and NEITHER is a second
// resolver: the resolver answers *where does this score route*, these answer
// *whether to ask it at all*.
test("extra: a REFUSE area never goes foreign, and it holds in `warn` too", () => {
  const gate = read("orc-boundary", "references", "gate.md");
  const c = canon();
  assert.match(gate, /never routes to a non-Claude worker/, "the boundary gate states it");
  assert.match(c, /REFUSE/, "the canonical contract states it too — this is a shared rule");
  // WIDER than the `block` mode it sits next to. `block` decides whether ORC
  // should attempt the task at all; `warn` records that the user accepted that
  // risk — neither asked whether the work should leave the machine.
  assert.match(
    gate,
    /whatever the|either mode|in `?warn`?/i,
    "the hold-back must say it applies in warn as well as block"
  );
});

test("extra: the cited-risk hold-back is the other one, and it is config-named", () => {
  const c = canon();
  assert.match(c, /extra_risk_tasks/, "the risk gate names its key");
  assert.match(read("orc", "SKILL.md"), /extra_risk_tasks|cited risk/i, "the spine carries the trigger");
});

// A lane that is INERT has to SAY it is inert. A config that silently answered
// "a DeepSeek worker" would have answered the one question /orc-quick's dispatch
// gate exists to ask.
test("extra: the lanes that do NOT dispatch foreign each say so in exactly one place", () => {
  const quick = read("orc-quick", "references", "dispatch-gate.md");
  assert.match(quick, /extra_enabled/, "/orc-quick names the key it is inert to");
  assert.match(quick, /INERT|inert/, "/orc-quick says INERT out loud");

  const ch = read("orc-challenge", "SKILL.md");
  assert.match(ch, /extra/i, "/orc-challenge states its stance");
  // The strongest statement in the family: swapping a lens for a different
  // model does not make the lane cheaper, it changes what is being MEASURED.
  assert.match(ch, /measur/i, "/orc-challenge's refusal is about measurement, not cost");
});

// The preflight line is how a run that will cross the boundary announces it
// BEFORE wave 1. Both halves are required: the printed key and the rule that
// says what it means. `test/payload.test.js` asserts set equality between them
// generically; this names `extra` so a removal is reported by name.
test("extra: the preflight line exists in BOTH halves, and its rule bullet is bare", () => {
  const pre = read("orc", "references", "preflight-report.md");
  assert.match(pre, /^extra: /m, "the template block prints an `extra:` line");
  assert.match(
    pre,
    /^- \*\*extra:\*\*/m,
    "the rule bullet must be a BARE `- **extra:**` — a version note inside the bold makes the rule invisible to payload.test.js"
  );
  // It is not allowed a quiet branch: printed on every run where the gate is on.
  assert.match(pre, /every/i, "the line is printed on EVERY armed run");
});

// A foreign return comes back in ORC's own shape from a dispatch ORC itself
// made, and it is still a third party's model on a third party's servers. It is
// the only FOREIGN class that EDITS the worktree.
test("extra: a foreign return is FOREIGN, and it is the class that writes", () => {
  const u = read("_shared", "untrusted-input.md");
  assert.match(u, /foreign/i);
  assert.match(u, /worktree|writes|edits/i, "it must say this class WRITES");
  // §2b, not §2: a foreign worker has no injected model-id line, so it cannot
  // carry `actual_model` and that field must never be faked for it.
  const rv = read("_shared", "return-validation.md");
  assert.match(rv, /§2b|2b\b/, "return-validation carries the foreign section");
  assert.match(canon(), /§2b/, "the canonical contract POINTS at §2b rather than restating it");
});
