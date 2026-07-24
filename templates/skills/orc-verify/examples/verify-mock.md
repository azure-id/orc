# Example — Annotated Standalone Verify (dry run)

V: = verifier (Opus 5 medium) · U: = user. Nothing real. Runs INDEPENDENTLY — no
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

## Diff sanity + findings (P0–P3 ladder)
V: Walks each hunk against intent inferred from the diff (every P0–P2 finding
   anchored: file:line + the offending line quoted VERBATIM, else auto-P3):
   ⛔ P1  api/routes/orders.py:42 — quote: `async def get_order(order_id: str):`
      — new `/orders/{id}` route has no auth decorator; every sibling route
      uses `@require_auth`. Security risk — likely unintended.
      (Not P0: build/tests are green.)
   • P3  api/schemas.py:18 — field `createdAt` breaks the snake_case convention
      used elsewhere (`created_at`).
   • P2  tests/test_orders.py — no negative-path test for a missing id.

## Summary (read-only — no edits, no commit)
V: 1 P1, 1 P2, 1 P3. Tests green but the missing auth decorator gates the
   commit (P0/P1 = fix before commit; P2/P3 advisory). I don't edit or commit —
   hand this to /orc or fix manually, then re-run /orc-verify.
