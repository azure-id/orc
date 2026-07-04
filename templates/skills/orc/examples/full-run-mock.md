# Example — Annotated Full Run (v2.2, dry run)

O: = orchestrator (Opus 4.8 high, always) · U: = user. Nothing real. The
orchestrator NEVER implements — it always spawns scored subagents.

U: Orchestrate: merchant notification system — in-app, email digest, prefs page.

## Phase 0 — Intake
O: Creates run folder run/merchant-notifications/ FIRST.
   [reads repo: TS/yarn/jest — asks nothing about stack] Rough size: medium+ → 4-question tier (one batched round):
   1) What should exist when done? 2) Out of scope? 3) How do we know it's done? 4) Patterns/files to avoid?
U: [answers] no push, no admin; bell count + both digest schedules + prefs persist; follow services/ pattern, don't touch auth_service.
O: [drafts run/merchant-notifications/intent-spec.md] Sign-off: gate or soft? (default gate)
U: gate → approved

## Phase 1 — Planning
O: Planner? U: OpenSpec
O: [6 tasks with declared_files incl. tests, depends_on, spec_ref] ⚠ T1/T2 share models/notification.ts → scheduling separates them.

## Phase 2 — Effort, dispatch style, scoring
O: Refined: medium, partially dependent. Recommend PARALLEL waves. Confirm? U: yes. Batch pause? U: every 2 waves.
O: Scoring (base + adjusters → final → ladder):
   T1 base32 +25 core = 57 → Opus 4.8 med
   T2 base30 +18 core/dep = 48 → Sonnet 5 med
   T3 base34 +12 = 46 → Sonnet 5 med
   T4 base28 +10 = 38 → Sonnet 5 med
   T5 base22 −8 isolated = 14 → Sonnet 5 med
   T6 base26 −10 leaf = 16 → Sonnet 5 med
   Plan: 6 tasks, 3 waves W1{T1} W2{T2,T3,T4} W3{T5,T6}, all spawned. Anticipated escalations? U: none, go.

## Phase 3 — Execution (ALL spawned; orchestrator coordinates only)
O: [checkpoint + state-of-play written into run/merchant-notifications/ BEFORE dispatch]
▶ W1: spawn Agent-A(T1, Opus 4.8 med) — milestones 40%→100% — return validated ✓ — log: DECISION type enum.
▶ W2: spawn 3 agents (Sonnet 5 med each).
   Agent-C needs_context (1/2): "needs T1's enum interface" → O adjudicates in-scope → re-slices → resumes. (User never bothered.)
   Agent-C user escalation: "digest send time?" → U: 07:00 fixed → ANSWER broadcast to log.
   Returns validated ✓ · collision audit clean.
⏸ BATCH PAUSE (stop sequence):
   checkpoint ✓ → state-of-play ✓ → dispatch report shown (models/scores) → "Run /usage to see your remaining limits."
   → resume block:
   | Continue ORC run `merchant-notifications`.
   | Read run/merchant-notifications/state-of-play.md, then run/merchant-notifications/checkpoint.json.
   | Resume from checkpoint phase/wave. Intent-spec approved — do not re-plan. Do not redo done tasks.
   "Reply continue here, or paste in a fresh session (recommended if long)."

U: [next day, FRESH session, pastes block]
O: [state-of-play → checkpoint → re-anchored] "Resuming: merchant notifications (in-app+digest+prefs). Still correct?" U: yes.
▶ W3: spawn T5+T6 (Sonnet 5 med) → done. All 6 complete.

## Phase 5 — Review (spawned worker, Opus 4.8 high)
O: Code pattern? U: none. Findings: BLOCKING T2 no pagination · NIT email_digest naming ×2 · 12 tests added.

## Phase 6 — Verify (spawned worker, Opus 4.8 high; criteria = definition-of-done)
   bell ✓ · both schedules ✗ (weekly cron missing) · prefs ✓ + pagination blocker → FAILED → auto-fix (single attempt) → re-verify → PASSED. 14/14.

## Phase 7 — Summary
O: 6 tasks/3 waves/6 spawns/1 pause/1 fresh-session resume · 1 needs_context · 1 escalation · verify fixed_then_passed · branch green. Fix 2 nits? U: no.

## Phase 8 — Ship (orc-pr, reads pr.md)
O: Branch: feat/notifications. Commit? Push? PR? U: yes all.
O: Ticket/title/target? U: DRP-482 / Add merchant notification system / develop
O: ✓ committed → pushed → run/merchant-notifications/DRP-482-add-merchant-notification-system.md from pr.md (base develop).
   Log deleted · checkpoint + dispatch log KEPT · completion dispatch report shown → "Run /usage to see your remaining limits."

## What this exercises
always-spawn (even cheap tasks get a subagent) · base+adjuster scoring · 3-band ladder ·
per-run folder run/merchant-notifications/ · usage reminder (no programmatic /usage) ·
definition-of-done catching the weekly-cron gap · needs_context resolved internally · fresh-session resume.
