# Example — Annotated Mini Run (dry run)

O: = orchestrator (Opus 4.8 high, always) · U: = user. Nothing real. The
orchestrator NEVER implements — it spawns ONE Sonnet-5-high executor, then runs a
read-only build+test smoke gate itself.

U: /orc-mini add a `--json` flag to the `report` CLI command

## Phase 0 — Intake (lighter: Q1–Q4, soft sign-off)
O: Creates run folder run/report-json-flag/ FIRST.
   [reads repo: Python/poetry/pytest — asks nothing about stack]
   Batched round (medium tier): 1) What should exist? 2) Out of scope?
   3) How do we know it's done? 4) Patterns/files to avoid?
U: report --json prints machine-readable output; no other commands touched;
   `pytest tests/test_report.py` green; follow the existing click option style.
O: [drafts intent-spec.md] Sign-off defaults to SOFT — proceeding unless you object.

## Phase 1 — Planning + complexity read
O: [dispatches orc-planner-mini] → 1 task, declared_files: cli/report.py,
   tests/test_report.py.
O: Complexity read (one line, no scoring table): single coherent area, low blast
   radius → mini-appropriate. (If it read complex/high-risk → I'd recommend /orc.)

## Phase 3 — Execute (ONE subagent)
O: → claude-sonnet-5 / high :: DISPATCH orc-executor-sonnet-5-high :: add --json flag
   [executor edits cli/report.py + updates tests, returns actual_files + actual_model]
O: VERIFY actual=claude-sonnet-5/high ✅ MATCH

## Phase M — Smoke gate (build + test; blocks ship on red)
O: [runs `pytest tests/test_report.py`]  ⛔ RED — 1 failure: JSON missing trailing key.
   Not offering commit. Auto-fix ONCE → re-dispatch executor with the failure output.
   [re-run] ✅ GREEN — build + tests pass.  VERDICT pass

## Phase T — Test-authoring ask (opt-in; writes, never runs)
O: Write test cases for these changes? (I author them — files + TEST-PLAN.md — but
   never run them; you test manually.)  [default from config.generate_tests]
U: no
O: Skipping test authoring.

## Phase 8 — Ship
O: Current branch: feat/report-json. Commit? Push? PR?
U: commit
O: [commits] Done. Usage: dispatch log below + run /usage for your limits.
   (Switch to full flow any time — the run folder + checkpoint are shared.)
