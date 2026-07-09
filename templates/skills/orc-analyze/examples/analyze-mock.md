# Example — Annotated System Analysis (dry run)

A: = analyst (Opus 4.8 high) · U: = user. Nothing real. Bounds the DELIVERABLE to
the asked scope; every claim is grounded with file:line evidence OR marked an
assumption and turned into a question. The orchestrator dispatches this — it never
analyzes itself.

U: /orc-analyze  security-audit.pdf — implement the AUTH findings only

## Mode + scope
A: [reads the PDF] Mode: AUDIT (structured findings sheet). Scope X = auth.
   Payments and logging findings exist in the doc — recognized only to EXCLUDE them
   (they never become tasks). Depth gate: standard or deep? (default standard)
U: standard

## Ground against real code (evidence-or-mark)
A: Finding A1 "login lacks rate-limit" → CONFIRMED, auth/login.py:33 has no limiter.
   Finding A2 "JWT uses HS256, should be RS256" → auth/token.py:12 uses HS256 ✓ real.
   Finding A3 "missing UUID check on /reset" → ⚠ STALE: reset.py:20 renamed that field
     to `token_id` and DOES validate it. Marking A3 UNVERIFIED → question.

## Challenge (recommended options, one at a time)
A: A3 looks stale against the code. Options:
   (a) Drop A3 — code already validates (RECOMMENDED: evidence at reset.py:20).
   (b) Keep A3 — you know of a gap the diff doesn't show.
U: (a) drop it

## Adjacent context (anchored, do-not-build)
A: A2's RS256 switch depends on the key-loading in config/keys.py — captured as
   "Additional context (do not build)", anchored to A2, so the build respects it
   without treating it as a task.

## Artifacts + branch
A: Writes orc/analyzer/auth-audit/report.md (Evidence column + Assumptions & Open
   Questions) + derived requirement-spec.md. handoff_ready: true.
   Keep as report, or take into build?
U: take into build   → hands both files to /orc, which plans from the spec (no
   re-questioning of scope — it's already settled).

## (Phase F) Another related doc?
A: You could analyze a related doc in this same scope; once 2+ related analyses
   exist I'll offer context-combiner to merge them into one spec. [not needed here]
