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
O: [6 tasks with declared_files incl. tests + per-file grounding attestations + sliced acceptance[], depends_on, spec_ref] ⚠ T1/T2 share models/notification.ts → scheduling separates them.
   Grounding spot-check (Phase 1 exit): globs all `exists` paths — 13/14 present, models/notifcation.ts MISSING (typo) → plan bounced to planner with the miss list → corrected to models/notification.ts ✓.

## Phase 2 — Effort, dispatch style, scoring
O: Refined: medium, partially dependent. Recommend PARALLEL waves. Confirm? U: yes. Batch pause? U: every 2 waves.
O: Facet scoring (planner facets → formula → band; facet gate: breadth + fan recomputed, risk cites checked):
   T1 3·new-surface·stateful·new-tests·fan0/3·low = 6+18+16+8+9 = 57 → sonnet-5-high (keystone — every later task imports its enum)
   T2 3·imitate·branching·new-tests·fan1/0·low = 6+8+8+8+5 = 35 → sonnet-4-6-med
   T3 3·imitate·branching·update-existing·fan1/0·low = 6+8+8+4+5 = 31 → sonnet-4-6-med
   T4 2·imitate·branching·update-existing·fan1/0·low = 6+8+8+4+5 = 31 → sonnet-4-6-med
   T5 1·mechanical·none·update-existing·fan0/0·low = 2+0+0+4 = 6 → haiku-4-5
   T6 1·mechanical·none·none·fan0/0·low = 2+0+0+0 = 2 → haiku-4-5
   Plan: 6 tasks, 3 waves W1{T1} W2{T2,T3,T4} W3{T5,T6}, all spawned. Anticipated escalations? U: none, go.

## Phase 3 — Execution (ALL spawned; orchestrator coordinates only)
O: [checkpoint + state-of-play written into run/merchant-notifications/ BEFORE dispatch]
▶ W1: spawn Agent-A(T1, sonnet-5-high) — milestones 40%→100% — return validated ✓ (evidence: `yarn jest models/` exit 0, tail quoted; unmet[] empty) — log: DECISION type enum.
▶ W2: spawn 3 agents (sonnet-4-6-med each).
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
▶ W3: spawn T5+T6 (haiku-4-5) → done. All 6 complete.

## Phase 5 — Review (spawned worker, Opus 5 medium)
O: Code pattern? U: none. Findings (P0–P3 ladder, each P0–P2 anchored file:line + verbatim quote):
   P1 T2 no pagination — services/notification_list.ts:88 — O spot-checks: Reads line 88, quote matches ✓ → asks user, U: fix it
   · P3 email_digest naming ×2 · 12 tests added. (An unanchored finding would be auto-P3 — never fixed unasked.)

## Phase 6 — Verify (spawned worker, Opus 5 medium; criteria = definition-of-done)
   criteria[] with per-line evidence: bell ✓ (test name) · both schedules ✗ (weekly cron missing = P0, unmet criterion, evidence: no cron entry in scheduler.ts) · prefs ✓ → FAILED → quote spot-check ✓ → P0 auto-fix (single attempt, no ask) → re-verify → PASSED. 14/14.

## Phase 7 — Summary
O: 6 tasks/3 waves/6 spawns/1 pause/1 fresh-session resume · 1 needs_context · 1 escalation · verify fixed_then_passed · branch green. P2 fix-batch: none · Apply the 2 P3 cosmetics? U: no.

## Phase 8 — Ship (orc-pr, reads pr.md)
O: Branch: feat/notifications. Commit? Push? PR? U: yes all.
O: Ticket/title/target? U: DRP-482 / Add merchant notification system / develop
O: ✓ committed → pushed → run/merchant-notifications/DRP-482-add-merchant-notification-system.md from pr.md (base develop).
   Log deleted · checkpoint + dispatch log KEPT · completion dispatch report shown → "Run /usage to see your remaining limits."

## What this exercises
always-spawn (even cheap tasks get a subagent) · facet-scored arithmetic · 8-band ladder ·
per-run folder run/merchant-notifications/ · usage reminder (no programmatic /usage) ·
planner grounding spot-check catching a hallucinated path · executor evidence (verbatim
build/test proof) · reviewer quote spot-check before any P0/P1 action ·
definition-of-done catching the weekly-cron gap · needs_context resolved internally · fresh-session resume.
