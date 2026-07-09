# Example — Annotated Standalone Verify (dry run)

V: = verifier (Opus 4.8 high) · U: = user. Nothing real. Runs INDEPENDENTLY — no
orchestrator, no planning, no run folder. Read-only: it reports, never fixes or commits.

U: /orc-verify

## Scope — git-modified changes only
V: [git status/diff] 3 modified files: api/routes/orders.py, api/schemas.py,
   tests/test_orders.py. Nothing staged beyond the working tree — verifying exactly
   these changes (no repo-wide sweep).

## Build + tests
V: [detects Python/poetry/pytest]
   $ poetry run pytest tests/test_orders.py  → 11 passed
   $ poetry run mypy api/                     → clean
   Build/type/test: GREEN.

## Diff sanity + findings (blocking vs nit)
V: Walks each hunk against intent inferred from the diff:
   ⛔ BLOCKING  api/routes/orders.py:42 — new `/orders/{id}` route has no auth
      decorator; every sibling route uses `@require_auth`. Likely unintended.
   • nit  api/schemas.py:18 — field `createdAt` breaks the snake_case convention
      used elsewhere (`created_at`).
   • nit  tests/test_orders.py — no negative-path test for a missing id.

## Summary (read-only — no edits, no commit)
V: 1 blocking, 2 nits. Tests green but the missing auth decorator should be fixed
   before commit. I don't edit or commit — hand this to /orc or fix manually, then
   re-run /orc-verify.
