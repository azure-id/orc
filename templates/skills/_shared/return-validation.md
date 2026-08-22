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

## 2b. A FOREIGN return — the SUBSTITUTION check (v0.50.0)

A foreign worker (`orc extra dispatch`, `_shared/extra-dispatch.md`) is not a
Claude subagent. It has no injected system-prompt model-id line, so **it cannot
carry `actual_model`** — and §2 must not be faked for it. A foreign return that
claimed an `actual_model` would be claiming evidence that does not exist.

It carries instead, and every one of these is quoted from the wire rather than
assumed:

- `engine` (`api` | `claude-shim` | `cli`), `provider`, `profile`
- `model_requested` — what the route row asked for
- **`model_reported`** — the `model` field the endpoint echoed back
- `usage` — the four token kinds, never blended, **or `null`**

**`model_reported != model_requested` is ⛔ SUBSTITUTION**, surfaced to the user
exactly as ⛔ DOWNGRADE is today and never silently accepted. It is the only
defence against an aggregator quietly serving something else. `unknown` is a
valid, honest value and is reported as `unknown` — **never as a match**.

**A clean model check is not a clean answer.** An aggregator's *provider-level*
fallback is on by default and it PRESERVES the model id, so the substitution
check reads clean while the code went to a different company. Engine `api`
records the response's `provider` echo and reports **⚠ REROUTE**; the other two
engines cannot see it at all, and their `served_by_note` says so. An absent
measurement is never a pass.

**`usage: null` is not four zeros.** A worker that reported no token counts
(engine `cli` frequently) returns `null` plus a note. `{0,0,0,0}` would tell
`/orc-budget` the run was free. Engine `api`'s `cache_write: 0` is the opposite
case — a real measurement — so the two must never be normalised together.

**The fence is per-engine, and the return says which one it had.** Engine `api`
ENFORCES `declared_files`; engines `claude-shim` and `cli` ASK. A return
carrying `fence: {declared_files: false}` means the list was an instruction, not
a rule — treat §6 below as the only real check, and say so to the user rather
than reporting a constraint that was never applied.

Everything else in this file applies to a foreign return unchanged: the
honest-status rules, the pattern attestation, the TDD attestation, the wiki
attestation, and above all **§6, the worktree delta** — which is engine-blind
because it reads the worktree rather than the return, and is therefore what
makes a foreign executor safe at all.

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

## 5b. Wiki attestation (when wiki content or page pointers were injected — v0.41.0)

A task whose slice carried wiki material must return **`wiki_used`** — the doc
paths it ACTUALLY read, or `none`. Quoted like `actual_model`: what the agent
did, never what the dispatcher assumed.

`none` is a valid and INFORMATIVE return, not a failure: it says the pages were
not useful or were ignored. Record it and surface it — a wiki whose pages are
shipped into every slice and read by nobody is the failure mode this field
exists to make visible, and it is invisible if `none` is quietly dropped. Absent
on a slice that carried wiki material is malformed. Not required otherwise.

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
