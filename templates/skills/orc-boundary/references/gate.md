# Reference — the boundary gate inside `/orc` (`boundary_gate`)

Loaded by the spine at Phase 1. This is the CONSUMER half: `/orc` reads cards, it
never writes one.

`boundary_gate: off | warn | block` — default **`warn`**.

| Mode | What changes |
|---|---|
| `off` | nothing. Cards are ignored entirely. |
| `warn` | the preflight line, plus a per-task verdict printed before each wave. No dispatch changes. |
| `block` | additionally: a REFUSE task is LIFTED OUT of its wave and never dispatched. |

`block` changes dispatch behaviour on upgrade, which is why it is not the default.
Print the active mode whenever a verdict is shown — a gate whose mode is invisible
gets blamed for things it did not do.

## Phase 1 — preflight, one line

`orc boundary status --json` with the other probes. Print the `line` field
VERBATIM:

```
bound : 9 execute · 2 escalate · 1 refuse (2 stale)
```

Never re-word it, never compute the counts. No cards at all:

```
bound : none — /orc-boundary writes them; no card means an area is UNKNOWN, not safe
```

## Phase 3 — per wave

Before dispatching wave W, resolve each task's area by matching its
`declared_files` against every card's `anchored_files` (longest match wins), then:

**EXECUTE** — dispatch normally. Nothing printed beyond the wave table.

**ESCALATE** — dispatch normally, and record the named human on the task. **Ship
is gated on that sign-off**, using the EXISTING pause machinery — the stop sequence
at the wave boundary, with the escalation named in the stop reason. No new stop
mechanic, no new config key.

**REFUSE** —

- `warn`: print the verdict and its checklist, then dispatch anyway. The user was
  told; the run is theirs.
- `block`: **lift that ONE task out of the wave. The wave proceeds with the
  rest.** Blocking the whole wave punishes the tasks that were fine, and a gate
  that costs a wave gets switched off. Print:

```
boundary → wave 2: T04 lifted out (REFUSE · src/payments)
  the wave runs with T03, T05.
  T04 comes back when:
    □ add a test runner to this package
    □ cover the idempotency path            → /orc-pattern
  Not blocked for you — say "do T04 anyway" and it dispatches.
```

That last line is required. The gate constrains ORC, not the user.

A lifted task's dependents are **requeued, not cancelled**: the existing
`REPLAN wave=<n>` path already handles a task that did not land, and this is that
case with a different cause.

**A task in an area with NO card** is dispatched normally and reported as
`boundary: unknown` on its dispatch line. Unknown is not REFUSE — refusing
everything uncarded would make the first run after install useless.

### Extra — a REFUSE area never goes foreign, in either mode

A task whose area is **REFUSE never routes to a non-Claude worker** whatever the
route table says (`extra_enabled`, `../../_shared/extra-dispatch.md`), and this
holds in `warn` mode too — where the task still dispatches, but to Claude. It is
the second hard hold-back beside the cited-risk one, and it is deliberately
*wider* than the `block` mode it sits next to.

The reason is that the two verdicts are answering different questions. `block`
decides whether ORC should attempt the task at all, and `warn` says the user
accepted that risk. Neither of them asked whether the work should leave the
machine — and a REFUSE is, by construction, an area where ORC **cannot verify
its own output** (that is one of the four questions the verdict is derived from).
Handing exactly that work to the executor with the weakest fence and no
`actual_model` line compounds the one condition the card was written about.

Print it with the verdict, and name it in the `extra:` preflight's held-back
count. **A card that caused a hold-back must say so on its own card**, so the
next reader learns it from the boundary lane rather than from a routing table
they were not looking at. `unknown` is not REFUSE here either — an uncarded area
routes by the ordinary rules.

## `/orc-route`

A plan with any REFUSE task **cannot route to `/orc-fast`**: fast has one executor
and no wave to lift anything out of, so the gate has nowhere to act. Report it in
the not-possible column with the verdict named, exactly like the other blocking
conditions.

## `/orc-ultra`

The implementation judge may score against the area's card: an implementation that
did the REFUSE-listed thing anyway is a blocking finding with an anchor
(`.claude/orc/boundary/<area>.md`) and a consequence already written down.

## The trace verb

`BOUNDARY <verdict> task=<id> :: <area>` per gated task, and
`BOUNDARY lift task=<id> :: <area>` when `block` removes one. Carried in the phase
packet like every other verb — handed to `orc-trace-writer-haiku-4-5`, never
written directly. `/orc-retro` reads them to answer the question this whole lane
exists for: how much work did we stop attempting, and was that right?
