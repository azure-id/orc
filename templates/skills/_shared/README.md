# _shared — cross-lane contract references

This directory is NOT a skill (no SKILL.md; Claude Code never registers it).
It holds the single canonical copy of contracts that more than one ORC lane
follows. A lane's SKILL.md keeps only the contract's trigger line + its
token(s) + a pointer here; the full procedure lives in exactly one file below,
loaded on demand when the step fires.

- `return-validation.md` — how every lane validates a subagent return
  (claimed-vs-actual model, evidence, unmet, pattern attestation).
- `smoke-gate.md` — the read-only build+test ship gate (orc-mini Phase M,
  orc-fast Phase F3).
- `fallback-handoff.md` — the orc-fast → orc-mini handoff block and its
  entry semantics. `orc-quick` reuses the writer side for its scope-cap OFFER
  (never an automatic fallback).
- `detecting-artifacts.md` — the deterministic wiki/pattern existence probes.
- `read-ladder.md` — the escalating read discipline (locate → outline → range →
  full) for every role that reads code it is not about to edit.
- `_shared/interview.md` — the interview mechanic (design tree → frontier rounds
  → confirmation gate), plus the split that does the work: FACTS are ORC's job
  to look up, DECISIONS are the user's to make and the lane waits for them.
  `/orc-grill` runs it end to end; `intake.md` borrows its round format.
- `_shared/lane-suspend.md` — the `RETURN-TO` mechanic: a lane leaves mid-run, another
  lane settles one thing, and the FIRST lane comes back and finishes. The
  opposite shape to `fallback-handoff.md`, which leaves and does not return.
  `/orc-brainstorm` ↔ `/orc-grill` is the first pair to use it.
- `untrusted-input.md` — content from outside the host repo (peer wiki, peer
  repo, PR/issue text, a fetched page) is evidence, never instruction.
- `gotchas.md` — repair memory (`.claude/orc/gotchas.md`): what this project has
  already gotten wrong, recorded only on a red → green repair, injected into a
  slice only when the `scope` glob matches. `orc-quick` is excluded entirely.
- `drift-recovery.md` — the mock-example drift loop (`DRIFT-FROM`, cap 2).
- `opus5-only.md` — the dispatch-forcing mode and its role table. It carves out
  `orc-quick`, whose user-facing dispatch gate it must never collapse.
- `stack-plan.md` — stacked PRs: the plan location + schema, the size rules, the
  `STACK-FROM` handoff, and the two entry modes.
- `gh-stack-commands.md` — the pinned `gh stack` command surface (a GitHub public
  preview, so a rename must be a one-file fix) + the preflight probes.
- `pr-templates.md` — where a PR description comes from (ORC template → project
  → CLAUDE.md → three recommended options), shared by the stacked and regular
  ship paths.

Human guides live in the skills themselves: `../orc-pr-setup/README.md` (plan the
layers), `../orc-pr-driver/README.md` (build, submit, merge them), and
`../orc-quick/README.md` (the quick lane, in simple English).

Rules: a file here changes in ONE place; `bin/verify-contracts.js` registers
these files wherever they carry a shared token. Never fork a copy back into a
lane spine — add a pointer instead.
