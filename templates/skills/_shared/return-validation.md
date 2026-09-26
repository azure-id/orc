# Return validation (every lane, every subagent return)

Canonical procedure for validating a spawned agent's return. Every ORC lane
(full, mini, fast, wiki, diy) runs this on EVERY return; a malformed return is
a failure (requeue/re-dispatch with reason — lane sets the retry cap).

**Read the SECTION, not the file.** Every return: §1–§3. Then ONLY the § of
each field the slice carried — §4 `pattern`, §5 `tdd_spec`, §5b wiki, §5b.1
graph cards, §5c the rules card, §5d `repro`. §2b only for a foreign return. §0
only before a re-dispatch. §6 only after a wave. §7 only on a repair loop. The §
numbers are anchors: never renumber or rename a § heading.

## 0. Is the previous attempt still ALIVE? (v1.2.0) — BEFORE anything else

> **`a lane that re-dispatches over a live attempt` has broken this contract.**

**A Task error does not kill the agent behind it.** Claude Code's tool call can
fail, time out, or be cut off mid-turn while the subagent it started keeps
running — and keeps writing files. Every rule below ends in "re-dispatch";
none of them may assume that a failed call means a dead agent.

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
the loop tightens on itself.

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

Read this § only when `extra_enabled` and the return came from `orc extra
dispatch`. A foreign worker has no system-prompt model-id line, so **it cannot
carry `actual_model`** — never fake §2 for it. **`model_reported !=
model_requested` is ⛔ SUBSTITUTION**, surfaced exactly as ⛔ DOWNGRADE. A
RESUMED foreign dispatch also owes `resume_state`, `preexisting_read[]` and
`journal_fidelity`. The full check — the wire fields, ⚠ REROUTE, `usage: null`,
the per-engine fence and the resume fields — is `extra-dispatch.md`
§The return contract delta. Every other § of this file applies unchanged.

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

## 5b.1 Graph attestation (when code-graph cards were injected — v1.8.0)

A task whose slice carried `orc graph ctx` cards must return **`graph_used`** —
`{targets, generation}`: the card targets it ACTUALLY used (or `none`), and the `generation`
the cards carried. The same honesty rule as `wiki_used`: `none` is informative (the cards did
not help), absent is malformed, and a lane never drops it. A `generation` lower than the one
`orc graph status` reports now means the agent acted on an OLD index — record it, do not
re-run the task for it alone. Canonical: `code-graph.md`.

## 5c. Rules attestation (when the anti-slop card was injected — v1.7.0)

A slice assembled by `orc rules slice` (`phases/rules.md`) must return three
fields. All three may be empty; **absent is malformed**, because an empty array
and a missing one are the difference between "nothing applied" and "nobody
looked".

| Field | What it holds | Empty means |
|---|---|---|
| `rules_applied[]` | the rule ids the agent acted on | it changed nothing for this task |
| `rules_conflicts[]` | two rules that disagree, each named by id or quote | none collided |
| `rules_overridden[]` | an ORC id a project rule replaced | the project replaced none |

**A `rules_conflicts[]` entry is a GAP, never a resolution.** Relay it through
the lane's own gap channel and let the user decide. An agent that quietly picks
a winner has made a standing decision for the project in a slice nobody will
read again.

`rules_overridden[]` is cross-checked against the `overrides` the CLI already
computed. The agent may return MORE than the CLI counted — the CLI only counts
ids a user NAMED, and the agent is the only reader that can spot an unnamed
contradiction — but an id the CLI listed and the return omits means the card was
not read.

A rule the slice could not honour because this lane structurally cannot do it
comes back as `unsupported_request`, relayed as a gap. **Never a guessed
compromise.**

## 5d. Reproduce-first attestation (when a `repro` was requested — v1.9.0)

A slice that carried `repro: {required: true, kind, hint}` must come back with a
`repro` field. Either both runs, quoted verbatim, or an honest `none`:

```
repro: { command, before: {exit_code, tail}, after: {exit_code, tail} }
repro: none  — <one line of reason>
```

Two malformed shapes, and they are the whole point of the field. **`status=done`
with `before.exit_code` 0** means the "reproduction" never failed, so it proved
nothing; **`status=done` with a non-zero `after.exit_code`** means the bug is
still there. Either one is a failure of the return, not a finding about the
code. A `repro: none` is a valid answer — a defect with no reachable entry point
and no runner cannot be shown red — and the lane says **not reproduced** out
loud rather than letting a green suite imply a fixed bug.

`repro` is required ONLY when the slice carried `repro.required: true`. A slice
that asked for none gets none back, exactly like `tdd_spec`, `wiki_used` and
`graph_used`.

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
