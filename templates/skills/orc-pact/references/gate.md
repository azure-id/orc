# Reference — the pact gate inside `/orc` (`pact_gate`)

Loaded by the spine at Phase 1. This is the CONSUMER half: `/orc` reads the
ledger, it never writes one. Writing is `/orc-pact`'s alone.

`pact_gate: off | warn` — default `warn`. **There is no `block`.** A promise is
advice with a receipt; a run it stops is a run that learns to switch it off.

## Phase 1 — preflight, one line

Run `orc pact status --json` with the other preflight probes. Print the `line`
field VERBATIM:

```
pact  : 11 holding · 2 drifted · 3 uncheckable
```

Never re-word it and never compute the counts yourself — one wording, one engine.
Exit 3 (no ledger) prints:

```
pact  : none — /orc-pact harvests one from this run's spec_invariants[]
```

## Phase 2 — planning injection (the payoff)

After the plan exists and before the exit gate:

1. Take every entry whose state is `DRIFTED` or `BROKEN`.
2. Intersect its `anchors` (file part only) with the union of every task's
   `declared_files`.
3. For each hit, append the entry's `statement` VERBATIM to that task's
   `constraints[]` — the same channel `spec_invariants[]` uses, so no new
   plumbing and no new slice field.
4. Print what was injected, per task. An injected constraint the user never saw is
   a constraint the run cannot be held to.

```
pact → plan: 1 promise constrains this plan
  T04 (src/payments/ledger.ts)  PACT-014 DRIFTED
      "A payment is never written to the ledger twice for one idempotency key."
```

**HOLDING entries are NOT injected.** Injecting all of them would put the whole
ledger in every slice, which is how a slice stops being read. The signal is
"this promise is already in doubt AND you are about to touch it".

## Phase 6 — verify recheck (`pact_recheck_on_verify`, default `true`)

After the verifier returns GREEN, run `orc pact check` **scoped to the promises
the change touched** — the same intersection as Phase 2, computed against the
run's actual changed files rather than the plan's declared ones.

- A promise that flips to BROKEN here is a **P1 finding**, not a ship blocker by
  itself: it is reported with its check output and the user decides. The run broke
  something it had promised not to; that is worth stopping to look at, and it is
  not worth an automatic abort on a check the ledger may simply have outgrown.
- A promise that re-anchors (pass at the new HEAD) prints one line and nothing
  else. That is the ordinary outcome.

## Ship

If any promise went BROKEN during the run, name it in the summary and offer
`/orc-pact` to reconcile. Never edit the ledger from the spine.

## The trace verb

`PACT <state> :: <ids>` at the preflight point, and `PACT recheck <pass|fail> ::
<ids>` at Phase 6. Carried in the phase packet like every other verb — the
orchestrator hands it to `orc-trace-writer-haiku-4-5`, never writes it directly.
