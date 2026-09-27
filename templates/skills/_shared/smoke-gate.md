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
   - **RED** → **never offer commit/ship.** Run the flaky check first
     (§Flaky). Still red → surface the failure verbatim, then
     ONE repair round: re-dispatch the SAME executor with the failing output
     as `failure_reason`, and re-run this gate. A second RED → STOP and
     surface; the lane names its escalation options (mini: stop; fast:
     escalate to orc-mini / switch to full `/orc` / stop).
   - **No runnable build/test** (docs-only repo) → say so explicitly; the
     gate is N/A — never silently skip it.

## Flaky — before any repair round

**Everywhere a test runs** (this gate, `/orc-quick` §3.2, `/orc` verify's TDD
gate, every repair loop): a RED test run gets ONE identical re-run of ONLY the
failing tests, before any repair. Save both outputs, then ask the CLI — never
judge it yourself:

`orc ci flaky --first <log> --rerun <log> [--rerun-exit <n>] --json`

- `--first` alone names the failing tests to re-run (`tests_failed[]`).
- Exit 0 = **FLAKY**: every failing test passed on the re-run. Emit its
  `gate_line` (`GATE flaky :: <tests>`), report the tests, and do NOT start a
  repair round. A flaky run is not red and does not use a round.
- Exit 1 = red (a test failed again, did not run, or the re-run exited ≠ 0) →
  the repair round as usual. Exit 3 = no test name in the log → red.
- One re-run only. Never re-run until green.

## What it is not

Smoke, not verification: no findings classification, no criteria matrix, no
severity ladder. A run that needs that depth belongs in the full lane.
