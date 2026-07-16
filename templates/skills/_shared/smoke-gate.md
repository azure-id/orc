# Smoke gate (read-only build + test ship gate)

Canonical procedure for the smoke gate run by orc-mini (Phase M) and orc-fast
(Phase F3). The gate is the orchestrator's INDEPENDENT check — the executor's
`evidence` is a claim; your run is the verification (when they disagree, say
so). Running build+test is read-only and is NOT implementation: you still
never write code.

## Procedure

1. Discover the commands: prefer the wiki manifest's `commands` block when it
   exists (recorded at scan time — don't rediscover tooling); otherwise detect
   the stack's build + test runner once and say which you chose.
2. Run build, then the fast test suite, once each.
3. Verdict (emit the `VERDICT pass|fail` trace line):
   - **GREEN** → proceed to the lane's next step (test-ask / ship).
   - **RED** → **never offer commit/ship.** Surface the failure verbatim, then
     ONE repair round: re-dispatch the SAME executor with the failing output
     as `failure_reason`, and re-run this gate. A second RED → STOP and
     surface; the lane names its escalation options (mini: stop; fast:
     escalate to orc-mini / switch to full `/orc` / stop).
   - **No runnable build/test** (docs-only repo) → say so explicitly; the
     gate is N/A — never silently skip it.

## What it is not

Smoke, not verification: no findings classification, no criteria matrix, no
severity ladder. A run that needs that depth belongs in the full lane.
