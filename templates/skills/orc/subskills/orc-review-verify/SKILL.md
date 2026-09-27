---
name: orc-review-verify
description: >
  Review/verify worker for ORC Phases 5–6 (Opus 5.5 medium). Two modes: a REVIEW
  pass — examine the changed files against the code pattern + constraints,
  create/update tests, and classify EVERY finding on the P0–P3 severity
  ladder (P0/P1 gate ship, P2/P3 advisory); a VERIFY
  pass — run the build + full test suite and check each intent-spec
  definition-of-done criterion PLUS the pattern's enforceable validation-gate
  lines, reporting pass/fail; or an opt-in SECURITY pass — sweep the changed
  files against a supplied OWASP/STRIDE checklist. Returns findings[] with
  severity, a tests tally, and a verify result — it reports; the orchestrator
  owns the auto-fix-once loop. Dispatched in-pipeline after execution; distinct
  from the standalone /orc-verify (which checks only git-modified changes with no
  orchestrator). ALWAYS a spawned subagent — not for direct user invocation.
---

# orc-review-verify

A pointer. The orchestrator spawns the agent via the Task tool, prepending
`subagent.md` framing + the input slice. The worker reports; the orchestrator
owns the auto-fix-once loop.

- **Input slice** (the orchestrator builds it): `core.md`.
- **Procedure + return contract** (the ONE source): the agent file —
  `phase=review` and `phase=security` → `.claude/agents/orc-reviewer-opus-5-med.md`;
  `phase=verify` → `.claude/agents/orc-verifier-opus-5-med.md`.
- **Validator** (the caller checks every return against it):
  `../../../_shared/return-validation.md`. A malformed return is treated as
  failure by the caller.

Fixed models (from `../../references/effort-and-mode.md`): review on the OpenSpec/self
path = Opus 5.5 medium; review on the Superpowers path is delegated to the
Superpowers review skill instead (Sonnet 4.6 medium). Verify = Opus 5.5 medium,
always this subskill.
