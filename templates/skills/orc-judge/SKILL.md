---
name: orc-judge
description: >
  Judgment gates for the ORC ultra lane. One judge skill, one agent
  (orc-judge-opus-5-xhigh), three dispatch contexts: gate=analysis (after the
  analyst), gate=plan (after the planner), gate=implementation (after verify —
  the anti-miss-implementation fidelity + strict-quality gate). Returns a
  structured verdict (APPROVE | REVISE | ESCALATE) with anchored,
  consequence-cited findings; REVISE loops the author with a hard 2-loop cap
  and a convergence rule. Dispatched only from /orc-ultra — no slash command
  of its own, never in orc or orc-mini. The orchestrator dispatches the judge
  subagent — it never judges itself.
---

# ORC-JUDGE (ultra-lane judgment gates)

A model-based quality gate on top of ORC's deterministic gates. The judge
handles what determinism cannot: scope-interpretation correctness, plan
soundness, implementation fidelity, and — at the final gate — ultra-strict
code quality. Deterministic gates ALWAYS run first; the judge never re-checks
what a string-compare catches.

Ultra lane ONLY. No `/orc-judge` command; the orchestrator dispatches
`orc-judge-opus-5-xhigh` at the three ultra gates.

## Hard rules

1. **The orchestrator never judges — it spawns.** One agent, three contexts
   (`gate=analysis|plan|implementation`).
2. **Deterministic first.** A judge dispatch is only legal AFTER the gate's
   deterministic checks passed (evidence spot-check + derivation lint /
   coverage + graph checks / verify + traceability matrix + static analysis).
3. **The judge is read-only** and blind to the author's internal reasoning or
   self-assessment (anti-anchoring): it sees the artifact, its evidence, the
   advisor brief + rubric, and the original request.
4. **Judge gates ADD to user sign-offs, never replace them.** Gate approvals
   never skip the analyst challenge round or the plan sign-off.
5. **Gate scope is one-directional.** gate=plan takes the approved spec as
   fixed ground truth; gate=implementation takes the approved plan as fixed —
   no gate re-litigates an earlier approved gate.
6. **The judge never fixes.** Authors fix: analyst (gate=analysis), planner
   (gate=plan), a scored executor fix wave (gate=implementation).

## Verdict handling (orchestrator side)

Validate the return against the agent's verdict contract, then:

- **Downgrade enforcement:** any blocking finding missing its verbatim
  anchor or its class-appropriate justification (failure_consequence for
  correctness/security; named category + concrete alternative for
  smell/simplification/placement) → downgrade to advisory and tell the user.
  EXCEPTION: a security finding with a concrete consequence is always
  blocking — never downgraded.
- **APPROVE** → record the verdict artifact, continue the pipeline.
- **REVISE** → re-dispatch the author with the original slice + the blocking
  findings verbatim. The author's return must echo `finding_id → resolution`
  per finding; a missing echo is a malformed return (requeue). Then RE-JUDGE
  under the convergence rule: block only on unresolved prior findings by id
  or on lines the revision changed; new findings on untouched material are
  advisory-only. **Hard cap: 2 revision loops per gate**, counted in the
  checkpoint.
- **ESCALATE** (or a third failure) → present the ESCALATE menu:
  accept-and-proceed (unresolved findings recorded in the Phase 7 summary) /
  user fixes manually then re-judge (does not consume a loop) / grant one
  extra loop / stop-and-checkpoint.
- Advisory findings NEVER loop — they ride forward attached to the next
  phase's slices as notes.
- Persist every verdict as `run/{run-slug}/ultra/verdict-<gate>-<round>.md`
  (mined by /orc-retro; survives resume). When logging, emit
  `JUDGE <gate> <verdict>` and the judgment GATE line (pass|bounce|escalate).

## The three gates

| Gate | After | Judges | REVISE target |
|------|-------|--------|---------------|
| analysis | analyst-return deterministic gates | scope interpretation, requirement coherence, rubric misses, stale-doc risk | analyst |
| plan | Phase 1 exit gate + blast-radius map | decomposition, declared-file plausibility, deps, right-sizing, blast-radius coverage | planner |
| implementation | Phase 6/6.5 + traceability matrix + static analysis | fidelity to the user's ask + ultra-strict quality (security, smells, simplification, placement, pattern invariants) | scored executor fix wave → re-verify → re-judge |

Return fields include `actual_model` + `actual_effort` (standard
claimed-vs-actual check) and `rubric_items_checked[]` +
`unconfirmed_assumptions_touched[]` — validate them like any worker return.
