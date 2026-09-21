# Example — Annotated Mini Run (dry run)

O: = orchestrator (Opus 4.8 high, always) · U: = user. Nothing real. The
orchestrator NEVER implements — it spawns ONE Sonnet-5-high executor, then runs a
read-only build+test smoke gate itself.

U: /orc-mini add a `--json` flag to the `report` CLI command

## Phase 0 — Intake (lighter: Q1–Q4, soft sign-off)
O: Creates run folder run/report-json-flag/ FIRST.
   [reads repo: Python/poetry/pytest — asks nothing about stack]
   graph: FRESH — 6 files · 8 symbols
   GRAPH-MAP :: focus="report json flag" budget=800 → cli/report.py, tests/test_report.py
   Batched round (medium tier): 1) What should exist? 2) Out of scope?
   3) How do we know it's done? 4) Patterns/files to avoid?
   [Q4's ➡️ already names cli/report.py and tests/test_report.py — the map
    answered it, so O does not ask the user to recite their own repo.]
U: report --json prints machine-readable output; no other commands touched;
   `pytest tests/test_report.py` green; follow the existing click option style.
O: [drafts intent-spec.md] Sign-off defaults to SOFT — proceeding unless you object.

## Phase 1 — Planning + complexity read
O: [dispatches orc-planner-mini WITH graph_facts: map + impact + cochange, gen 7]
   → 1 task, declared_files: cli/report.py, tests/test_report.py — both grounded
   `exists`, evidence "graph gen 7" + acceptance sliced from the intent-spec.
   O confirms both paths with ONE `orc graph ctx` call (exit 0) ✓.
O: GATE complexity :: complexity: mini-ok — 2 files · confident callers 1 in 1 file ·
   tests reach 1 · risk none · cochange none
   (4+ caller files, 8+ callers, a cited risk class, or a cochange partner with
    3+ co-commits would have made this "recommend /orc" — an offer, never a switch.)

## Phase 3 — Execute (ONE subagent)
O: graph: --for-slice card (2 files) · wiki: 1 path (pointer, body never read here)
O: → claude-sonnet-5 / high :: DISPATCH orc-executor-sonnet-5-high :: add --json flag
   [executor edits cli/report.py + updates tests, returns actual_files + actual_model
   + evidence {`pytest tests/test_report.py`, exit 0, tail quoted} + empty unmet[]]
O: VERIFY actual=claude-sonnet-5/high ✅ MATCH · evidence present ✓

## Phase M — Smoke gate (build + test; blocks ship on red)
O: GRAPH-CHANGES → tests reached 1 file (call 1)
   [runs `pytest tests/test_report.py` FIRST]  ⛔ RED — 1 failure: JSON missing trailing key.
   Not offering commit. Auto-fix ONCE → re-dispatch executor with the failure output.
   [re-run] ✅ GREEN — tests reached 1 file → 4 passed · suite 12 passed · build ok.
   blast radius   1 symbol touched · callers 1 in 1 file · tests reach 1 · risk none
   VERDICT pass
O: GRAPH-UPDATE :: gen 8 · 2 files · 1 note pending → noter batch dispatched
   graph gain: paid 0.8K tokens · avoided an estimated 2–5K · measured: not yet (N=1)

## Phase T — Test-authoring ask (opt-in; writes, never runs)
O: Write test cases for these changes? (I author them — files + TEST-PLAN.md — but
   never run them; you test manually.)  [default from config.generate_tests]
U: yes
O: [dispatches orc-test-author-opus-5-med] → automated tests in
   tests/test_report.py; manual deliverable at test-generator/report-json-flag/TEST-PLAN.md
   (non-API project → curl_bundle_path null). Validate: path under
   test-generator/report-json-flag/ ✓.
O: Self-QA plan: test-generator/report-json-flag/TEST-PLAN.md (committed on ship).

## Phase 8 — Ship
O: Current branch: feat/report-json. Commit? Push? PR?
U: commit
O: knowledge: wiki 1 page offered · used tests/test_report.py note · graph used 1 target
O: [commits] Done. Usage: dispatch log below + run /usage for your limits.
   (Switch to full flow any time — the run folder + checkpoint are shared.)
