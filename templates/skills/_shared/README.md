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
  entry semantics.
- `drift-recovery.md` — the mock-example drift loop (`DRIFT-FROM`, cap 2).
- `opus5-only.md` — the forcing Opus-5 dispatch mode and its role table.
- `stack-plan.md` — stacked PRs: the plan location + schema, the size rules, the
  `STACK-FROM` handoff, and the two entry modes.
- `gh-stack-commands.md` — the pinned `gh stack` command surface (a GitHub public
  preview, so a rename must be a one-file fix) + the preflight probes.
- `pr-templates.md` — where a PR description comes from (ORC template → project
  → CLAUDE.md → three recommended options), shared by the stacked and regular
  ship paths.

Human guides for the stacked-PR pair live in the skills themselves:
`../orc-pr-setup/README.md` (plan the layers) and `../orc-pr-driver/README.md`
(build, submit, merge them).

Rules: a file here changes in ONE place; `bin/verify-contracts.js` registers
these files wherever they carry a shared token. Never fork a copy back into a
lane spine — add a pointer instead.
