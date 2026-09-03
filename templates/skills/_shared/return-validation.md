# Return validation (every lane, every subagent return)

Canonical procedure for validating a spawned agent's return. Every ORC lane
(full, mini, fast, wiki, diy) runs this on EVERY return; a malformed return is
a failure (requeue/re-dispatch with reason — lane sets the retry cap).

## 0. Is the previous attempt still ALIVE? (v1.2.0) — BEFORE anything else

> **`a lane that re-dispatches over a live attempt` has broken this contract.**

**A Task error does not kill the agent behind it.** Claude Code's tool call can
fail, time out, or be cut off mid-turn while the subagent it started keeps
running — and keeps writing files. Every rule below this line ends in
"re-dispatch", and every one of them silently assumed a failed call meant a dead
agent. It does not.

What that costs, measured: one graded `/orc-quick` entry put THREE
`orc-executor-opus-5-low` agents on the SAME task — 50m19s, 115m22s and
100m53s, **266 minutes of Opus 5 for one authorised dispatch**, all editing the
same files, inside a 2h04m window. The second was dispatched 4m19s after the
first, while the first was still working. The hook had recorded all three; no
lane had ever read that record.

### The rule

Before ANY re-dispatch, requeue or repair round — and before the first dispatch
of a resumed run — run:

```
orc run inflight --json      # 0 clear · 1 in-flight · 2 unknown
```

| exit | meaning | what the lane does |
|---|---|---|
| 0 | provably nothing in flight | dispatch |
| 1 | ≥1 dispatch has not returned | **REFUSE. Name the agent, the task and its age.** Ask the user. |
| 2 | cannot prove either way | **REFUSE by default.** Say why, and let the USER decide. |

**Exit 2 refuses, and that is deliberate.** Everywhere else in ORC an absent
reading is treated as absent and never blocks — `orc usage check` exit 2 never
stops a run, an UNCHECKABLE pact never raises the exit code. This is the one
place the default inverts, because the two outcomes are not symmetrical: a
wrongly-refused dispatch costs one question, and a wrongly-issued one costs a
second Opus agent for an hour. Refusing on `unknown` is the cheap error.

### An interrupted turn is UNKNOWN, never FAILED

A usage limit, an API error, a dropped connection or a `Ctrl+C` between a
dispatch and its return says **nothing** about the agent. Treat it as §0 exit 2
and ask. A lane that classifies an interruption as a failure re-dispatches into
a live agent, gets interrupted again sooner because it is now paying twice, and
the loop tightens on itself — which is exactly how the 266-minute entry
happened.

### What refusing looks like

```
⛔ 1 dispatch is still in flight — not re-dispatching.

   orc-executor-opus-5-low   started 4m ago
   "Fix approval flow defects"

   A Task error does not kill the agent behind it. It may still be writing.
   1. wait for it     2. dispatch anyway (2 agents on one task)     3. stop
```

Option 2 must always be offered and never be the default: the user is allowed
to overrule this, and an unreadable sidecar must never trap a run.

### The evidence, and its one honest limit

`orc run inflight` reads the pending sidecar that `orc-trace.js` writes on every
`SPAWN`, cross-checked against the trace's own SPAWN/RETURN balance. It reports
`unknown` — never `clear` — when the sidecar is missing, unreadable, or holds
only records older than six hours, and when the sidecar and the trace disagree.
**Unknown is not zero.**

It cannot see an **ad-hoc** dispatch (`/orc-quick` recon, model+effort rather
than a pinned `orc-*` agent): the hook writes no `SPAWN` for one, so no record
exists. Those are read-only and short, so the exposure is small — but the limit
is stated rather than papered over, and a lane must not report `clear` as proof
that an ad-hoc read is finished.

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

**A RESUMED foreign dispatch owes three more fields** (v0.54.0). The dispatch
return sets `resume_expected: true`, so the obligation is never inferred:

- **`resume_state`** — `continued` · `restarted` · `no-op`. Absent on a slice
  with no `resumed_from` is correct; **absent on a resume slice is MALFORMED.**
  A return claiming `restarted` while `preexisting[]` was non-empty is a
  FINDING, not a failure — it is how `/orc-retro` learns which providers ignore
  a resume preamble, so surface it rather than treating it as a bad return.
- **`preexisting_read[]`** — which pre-existing files the worker actually
  opened. Quoted like `wiki_used`: **what it did, never what the dispatcher
  assumed.** An EMPTY list on a resume whose `preexisting[]` was not empty is an
  honest and informative return — it says the worker ignored the preamble — and
  it must be surfaced, never dropped.
- **`journal_fidelity`** — relayed from the dispatch return (`per-turn` |
  `streamed-opaque`), so a validator never reports `streamed-opaque` evidence as
  if it had per-turn tool attribution.

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

**On a RESUMED task the "before" side of the delta is the JOURNAL BASELINE**
(`orc extra reconcile`, `_shared/extra-dispatch.md`), not the state at the top of
this wave. A file the previous attempt created is already in the tree and is
**not** an unexplained delta — it is explained, by the journal, by name. Without
that the first resumed wave trips its own gate on the work it just recovered.

## 7. Gotcha capture (repair loops only — v0.40.0)

A return that closes a repair loop (`tdd_state` went red → green, a drift
round resolved, a reviewer P0/P1 was fixed in-run) carries
`gotcha_recorded` — either the entry body (`trigger`, `symptom`, `cause`,
`fix`, `scope`) or `none` with a one-line reason. Absent on a repair-closing
return is malformed. It is NOT required on a return that never repaired
anything, and a loop that hit its cap and STOPPED must return `none` — an
unsolved failure is not a gotcha. The agent RETURNS the body; the
orchestrator writes the file. See `gotchas.md`.
