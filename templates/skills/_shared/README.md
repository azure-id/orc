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

Rules: a file here changes in ONE place; `bin/verify-contracts.js` registers
these files wherever they carry a shared token. Never fork a copy back into a
lane spine — add a pointer instead.
