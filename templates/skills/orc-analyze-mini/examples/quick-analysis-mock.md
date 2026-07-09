# Example — Annotated Fast-Lane Analysis (dry run)

A: = mini analyst (Sonnet 5, high) · U: = user. Nothing real. Same artifacts and
contract as /orc-analyze, ALWAYS single-pass — NO deep mode, NO scouts. The
orchestrator dispatches this — it never analyzes itself.

U: /orc-analyze-mini  add a "resend invite" action — no doc, just this request

## Mode + scope (doc-optional)
A: No document → REQUIREMENT mode (your request is the source of truth, reconciled
   against code). Scope X = resend-invite. Nothing else in play.

## Ground the CLEAR links + HIGH-SIGNAL divergences (evidence-or-mark)
A: Maps to invites/service.py (create path at :40) + invites/routes.py (:12).
   The obvious reuse: resend = re-issue the existing token, not mint a new invite.
   ⚠ ASSUMPTION: resend should NOT reset the 72h expiry → turning into a question
   (couldn't confirm from code alone). Shallower grounding: I confirm the obvious
   file map, not every downstream reference.

## Challenge (recommended options, one at a time)
A: On expiry: (a) keep original expiry — RECOMMENDED (least surprise; matches how
   create issues once). (b) refresh to a new 72h window on resend.
U: (a)

## Artifacts + branch (+ escalation door)
A: Writes orc/analyzer/resend-invite/report.md + requirement-spec.md
   (Evidence column + Assumptions & Open Questions). handoff_ready: true.
A: This stayed simple, so single-pass was enough. If it had needed a wider sweep or
   verify-every-claim, I'd have flagged that it may warrant /orc-analyze (deep).
   Take into build?
U: take into build   → hands the spec to orc-mini, which continues with the mini planner.
