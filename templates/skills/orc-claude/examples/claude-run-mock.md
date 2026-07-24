# Worked example — orc-claude runs (mock; orient only, never execute from this)

## Run 1 — UPDATE (existing hand-written CLAUDE.md, 610 lines)

U: /orc-claude
C: CLAUDE.md exists, no orc-claude:meta header → UPDATE mode. Spawns
   orc-claude-writer-opus-4-8-high (the skill never writes the file itself).
W: Scans: pnpm monorepo (3 workspaces), turbo, eslint+prettier, vitest,
   Postgres migrations under `packages/db/migrations`.
W: Copies CLAUDE.md → CLAUDE.md.bak. Injects meta header (v0.0.1, 12-07-2026,
   line-budget: 400) + P0 placeholder at top, appends fenced sections:
   commands, layout (ownership map), conventions, boundaries, workflow,
   decisions, patterns, gotchas placeholder, testing, environment, glossary
   placeholder. Skips `adr` (nothing scannable). Existing 610 lines: untouched.

```
ORC-CLAUDE — update → CLAUDE.md v0.0.1 (12-07-2026)
Sections written: p0*, commands, layout, conventions, boundaries, workflow,
decisions, patterns, gotchas*, testing, environment, glossary*   (*=fill yourself)
Skipped (empty scan): adr, pointers
Preserved untouched: user content (610 lines), no wiki block found
Conflicts flagged (NOT auto-edited):
  - existing line 42 says "run yarn test" — repo uses pnpm (pnpm test)
Backup: CLAUDE.md.bak written (add it to .gitignore)
NOTE: file is 802 lines total (budget covers generated content only) — trim
unused user content yourself for better instruction-following.
```

## Run 2 — REFRESH, one stale section

U: /orc-claude   (weeks later; `test` script renamed to `test:unit` + `test:e2e`)
C: Header found → REFRESH → spawns the writer.
W: Recomputes fingerprints: only `commands` differs (e3f1a2 → 8c04b1). Writes
   .bak, replaces the commands fence interior, bumps 0.0.1 → 0.0.2,
   updated: 03-08-2026. User's edits outside fences + the wiki block:
   byte-identical. Returns actual_model=claude-opus-4-8, actual_effort=high.

## Run 3 — REFRESH, noop

U: /orc-claude
W: All fingerprints match →
   `CLAUDE.md up to date (v0.0.2, 03-08-2026)` — no write, no bump, no bak.

## Run 4 — behavior trace (permanent, always on)

Same dispatch as any run, plus the minimal one-dispatch trace. The skill writes
the run pointer (`run-claude-<slug>-<DDMMYY>-<HHMMSS>.txt` into `log_dir`)
FIRST, records these events as they happen, and — as a single-dispatch lane —
dispatches the trace writer ONCE at run end to append them (`SPAWN`/`RETURN`
come from the `orc-trace.js` hook as they occur):

```
[120726 09:14:02.110] writer   DISPATCH orc-claude-writer :: refresh expect=opus-4-8/high
[120726 09:14:02.230] hook     SPAWN orc-claude-writer-opus-4-8-high
[120726 09:15:47.900] hook     RETURN
[120726 09:15:48.010] writer   VERIFY writer actual=claude-opus-4-8/high ✅ MATCH
[120726 09:15:48.120] writer   FINISH :: refresh CLAUDE.md v0.0.3
```

Then the writer packet returns and the run pointer is deleted (in that order).
A noop refresh traces the same shape, ending
`FINISH :: noop`. No phase/score/gate/finding/verdict markers — orc-claude
runs none of those phases (they live inside the writer). The `orc-trace.js` hook
bootstraps the pointer on the writer dispatch, so the SPAWN/RETURN skeleton is
captured even if the skill's run-start step is skipped.
