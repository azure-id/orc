# Return validation (every lane, every subagent return)

Canonical procedure for validating a spawned agent's return. Every ORC lane
(full, mini, fast, wiki, diy) runs this on EVERY return; a malformed return is
a failure (requeue/re-dispatch with reason — lane sets the retry cap).

## 1. Contract shape

The return must carry every field its agent contract names. Missing or extra
shape = malformed. Never repair a return yourself; re-dispatch.

## 2. Claimed-vs-actual model (tier-downgrade check)

Every return carries:

- `actual_model` — quoted VERBATIM from the agent's system-prompt model-id
  line, never inferred (`unknown` when no such line exists)
- `actual_effort` — the agent's `$CLAUDE_EFFORT` value

Compare both against what the dispatch expected (the agent NAME encodes it).
Append the `VERIFY` trace line with the comparison; any mismatch is surfaced
to the user as a ⛔ DOWNGRADE — never silently accepted. (A subagent can't
exceed the MAIN session's tier, so a downgrade usually means the main session
is on the wrong model.)

## 3. Honest-status rules (executor returns)

- `status=done` on a stack with a runnable build/test REQUIRES `evidence`
  {command, exit_code, tail} quoted VERBATIM; a missing block or a false
  `no_runner_detected` is malformed.
- `done` with a non-empty `unmet[]` is `partial` — treat it as such.

## 4. Pattern attestation (when a `pattern` was injected)

A task that received a `pattern` slice must return `invariants_checked: true`
plus the matching `pattern_version`; false/absent on a pattern task is
malformed.

## 5. TDD attestation (when a `tdd_spec` was injected — v0.33.0)

A task whose slice carried a `tdd_spec` must return `tdd_state: green|red` —
`green` only with the passing run quoted in `evidence`; `status=done` with
`tdd_state: red` (or an absent field) is malformed. `red` is an HONEST return:
the lane runs its repair loop up to `tdd_loop_max`, then STOPS with the red
report — never re-dispatch past the cap.

## 6. Worktree delta (post-wave, every lane that dispatches executors)

Compare `git status --short` before and after each dispatch. A path that
appears, disappears, or **reverts** and is absent from that task's
`declared_files` is a slice violation regardless of what the return said —
including a file that became LESS modified, which is how a destructive `git`
command inside a slice disguises itself as a clean tree. `actual_files` is a
CLAIM; the worktree is the EVIDENCE. An unexplained delta gates the wave: name
it, attribute it, and get a decision before closing.

## 7. Gotcha capture (repair loops only — v0.40.0)

A return that closes a repair loop (`tdd_state` went red → green, a drift
round resolved, a reviewer P0/P1 was fixed in-run) carries
`gotcha_recorded` — either the entry body (`trigger`, `symptom`, `cause`,
`fix`, `scope`) or `none` with a one-line reason. Absent on a repair-closing
return is malformed. It is NOT required on a return that never repaired
anything, and a loop that hit its cap and STOPPED must return `none` — an
unsolved failure is not a gotcha. The agent RETURNS the body; the
orchestrator writes the file. See `gotchas.md`.
