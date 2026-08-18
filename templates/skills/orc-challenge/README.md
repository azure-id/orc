# Build your own `/orc-challenge` cycle

This is the maintainer's guide to the lane. If you just want to use it, run
`/orc-challenge` and answer the seven intake questions.

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
C2 lint (free)  →  C3 the council  →  C4 judge  →  C5 record (the CLI decides)
                    (parallel, <=3)                       ├── PASS → C7 final report
                                                          └── FAIL → C6 advise → C8 STOP
```

One iteration is C2 → C8. The user then fixes in a **different session** and
comes back, and the whole thing runs again with the carried findings.

## The eight agents, and why each is pinned where it is

| Agent | Effort | Why that effort |
|---|---|---|
| `orc-challenge-judge-opus-5-high` | high | D2 is the only dimension no computer can reach, and it is the expensive one |
| `orc-challenge-advisor-opus-5-med` | medium | grouping twelve findings into three causes is pattern work, not deep reasoning |
| `orc-challenge-reader-opus-5-low` | **low, on purpose** | a harder-thinking reader reasons AROUND the gaps D4 exists to find. A stronger configuration is a WORSE instrument |
| `orc-challenge-contrarian-opus-5-high` | high | a shallow contrarian returns the three surface complaints the free lint already caught |
| `orc-challenge-outsider-opus-5-low` | **low, on purpose** | a harder-thinking outsider reasons its way AROUND an unexplained acronym and reports the document is fine |
| `orc-challenge-executor-opus-5-med` | medium | pattern work against a concrete artifact — the same class as the advisor |
| `orc-challenge-principles-opus-5-high` | high | rebuilding a problem statement from the ground up is the deepest reasoning in the lane |
| `orc-challenge-expansionist-opus-5-med` | medium | pattern work again, pointed at upside instead of at defect |

All eight are `claude-opus-5`, so **`opus5_only` is a no-op for this lane** —
zero new agent pairs, no `LEGACY_KEYS` entry, no rename churn. The lane is
unaffected, not exempt.

**Effort here is a MEASUREMENT choice, not a cost choice.** That is why there is
no model or effort config key: a key that lets `outsider: low` be tuned is a key
that lets the instrument be broken.

## The council (v0.49.1)

Five of those eight are new, and the design is in `references/council.md`. Three
sentences carry it:

- **A lens raises; only the judge resolves.**
- **ORC proposes the council; the user picks it.** `--council` has no default and
  `init` refuses by name — **a lane that picks its own council has broken this
  contract.**
- **Two lenses never touch the pass gate.** The expansionist returns
  `opportunity`, the first-principles thinker returns `premise`; neither has a
  severity, and forcing either to have one would make it lie.

The gate that makes five extra reviewers safe is `council_coverage_pct`, derived
by `orc challenge record` from `iteration-NN/council/*.json` on disk — **not from
the judge's account of them.** The judge cannot shrink the set by omission.

They are pinned and dispatched BY NAME for one reason beyond the trace hook: **a
verdict must be attributable.** `/orc-retro` can then mine downgrade behaviour on
judging runs like any other lane.

## Adding a lens

1. `references/council.md` — the roster row, what it is for, how it fails, and
   why its effort is what it is.
2. `bin/cli.js` — `CHALLENGE_LENSES` and `CHALLENGE_LENS_META`. Pick a prefix
   nothing else uses; prefixes are the raiser's signature and `record` gates on
   them.
3. The agent file, named in `bin/verify-package.js`, with a `MODEL-MAPPING.md`
   row that states the reason for the effort.
4. A golden test comparing 1 and 2. The roster is documented drift the token
   lint cannot see, because it is a list, not a token.

Decide its CLASS first. If it cannot honestly carry a `serves`, it is not a
finding lens and it must never enter `findings[]`.

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
- **a model or effort config key.** That is the pinned agents' job, and the
  efforts are measurements.
- **a `challenge_council` config key.** A global default roster would silently
  answer the one question the council exists to ask.
- **a `block` mode on any council output.** Opportunities and premises never
  gate; the finding lenses gate through the EXISTING severity bar and nothing
  else.
- **auto-severity from corroboration.** Two lenses agreeing is a signal, and
  churn is a signal, not a verdict.
- **a `block` mode on `challenge_gate`.** The `/orc-pact` precedent: the payoff
  is knowing, not gating.
- **a second definition of "a plan", "a state", or "fresh".** If a state exists,
  the CLI computes it and everything else renders it.

## Reading order for a new maintainer

`references/intake.md` (it defines what every later file grades against) →
`council.md` → `sealed-slice.md` → `rubric.md` → `conservation.md` →
`cycle-state.md` → `fix-brief.md`. Then `examples/tsd-two-iterations.md` for the
whole thing end to end, and `examples/council-full-roster.md` for a run where
the first-principles thinker lands a premise challenge and the goal moves.
