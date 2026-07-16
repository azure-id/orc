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
