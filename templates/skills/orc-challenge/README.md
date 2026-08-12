# Build your own `/orc-challenge` cycle

This is the maintainer's guide to the lane. If you just want to use it, run
`/orc-challenge` and answer the six intake questions.

## The one design decision everything else follows from

**The judge and the fixer must never share a context.**

Everything unusual about this lane is downstream of that one sentence:

- there is no in-session repair loop, because a session that wrote the fix would
  grade its own homework
- the judge's dispatch slice is paths and ids only, because a summary of what
  changed is written by the party with an interest in passing
- PASS is computed by the CLI, because a judge that CAN pass something can be
  talked into passing something
- the stop is the deliverable, not an interruption

If you are tempted to add a `challenge_same_session` escape hatch: that config
key is how the premise dies. It is deliberately not there.

## The shape of one iteration

```
C2 lint (free)  →  C3 cold read  →  C4 judge  →  C5 record (the CLI decides)
                                                      ├── PASS → C7 final report
                                                      └── FAIL → C6 advise → C8 STOP
```

One iteration is C2 → C8. The user then fixes in a **different session** and
comes back, and the whole thing runs again with the carried findings.

## The three agents, and why each is pinned where it is

| Agent | Effort | Why that effort |
|---|---|---|
| `orc-challenge-judge-opus-5-high` | high | D2 is the only dimension no computer can reach, and it is the expensive one |
| `orc-challenge-advisor-opus-5-med` | medium | grouping twelve findings into three causes is pattern work, not deep reasoning |
| `orc-challenge-reader-opus-5-low` | **low, on purpose** | a harder-thinking reader reasons AROUND the gaps D4 exists to find. A stronger configuration is a WORSE instrument |

All three are `claude-opus-5`, so **`opus5_only` is a no-op for this lane** —
zero new agent pairs, no `LEGACY_KEYS` entry, no rename churn. The lane is
unaffected, not exempt.

They are pinned and dispatched BY NAME for one reason beyond the trace hook: **a
verdict must be attributable.** `/orc-retro` can then mine downgrade behaviour on
judging runs like any other lane.

## Adding a dimension

1. `references/dimensions.md` — the definition, the evidence a finding must
   carry, and which agent produces it.
2. `bin/cli.js` — `CHALLENGE_DIMS` and the `--dimensions` validator.
3. `references/kinds.md` — whether any kind selects it by default.
4. A golden test comparing 1 and 2. The enum is documented drift the token lint
   cannot see, because it is a list, not a token.

## Adding a lint check

1. `bin/cli.js` — the check itself, in `challengeLint`. Emit `L-###` with a
   dimension and a line number.
2. `references/plain-english.md` — the row in the table, and the word list if it
   has one.
3. A fixture in `test/`.

Keep both honesty rules intact: it is a signal, not a verdict, and it is
heuristic. A lint that starts blocking is a lint that starts being argued with.

## Adding an artifact kind

`references/kinds.md` and `CHALLENGE_KINDS` in `bin/cli.js`. A kind is a
PROPOSAL of a dimension set and a template hint — never a silent application of
one.

## What this lane must never grow

- **an in-session fix.** See above.
- **a hard loop cap.** Each turn is a separate human sitting down to work.
  `stalled` measures instead, and offers three real options.
- **a model or effort config key.** That is the pinned agents' job.
- **a `block` mode on `challenge_gate`.** The `/orc-pact` precedent: the payoff
  is knowing, not gating.
- **a second definition of "a plan", "a state", or "fresh".** If a state exists,
  the CLI computes it and everything else renders it.

## Reading order for a new maintainer

`references/intake.md` (it defines what every later file grades against) →
`sealed-slice.md` → `rubric.md` → `conservation.md` → `cycle-state.md` →
`fix-brief.md`. Then `examples/tsd-two-iterations.md` for the whole thing end to
end.
