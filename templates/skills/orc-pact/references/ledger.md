# Reference — the pact ledger

Loaded at P3/P4. The file is `.claude/orc/pact/ledger.json`; `PACT.md` at the
project root is DERIVED from it by `orc pact sync` and is never hand-written.

## Entry shape

```yaml
id: PACT-014                 # monotonic, never reused — an archived id stays traceable
statement: "A payment is never written to the ledger twice for one idempotency key."
origin:
  lane: orc-grill            # orc-grill | orc-brainstorm | orc | orc-poly | user | import
  run: run-grill-checkout-100826-141130
  kind: constraint           # constraint | intent
anchors:                     # the files this promise lives in. file or file:line
  - src/payments/ledger.ts:88
  - src/payments/idempotency.ts
check:
  kind: test | command | grep | manual    # the CHEAPEST thing that proves it
  ref: "npm test -- idempotency"
verified_commit: 8a62b4f     # the commit the check last PASSED at
confidence: high | medium | low
last_check:                  # written by `orc pact check`, never by hand
  status: pass | fail
  commit: 8a62b4f
  at: DD-MM-YYYY HH:MM:SS
history: [ {at, status, commit} ]   # newest first, capped at 10
retired: false
retired_reason: null         # REQUIRED when retired is true
```

## Field rules

**`statement`** — one sentence, present tense, absolute. "A payment is never
written twice" not "we should avoid double writes". A hedged invariant cannot be
checked and cannot be violated, so it is not an invariant.

**`origin`** — never absent. The four legal origins are in SKILL.md's P0. `kind`
mirrors the interview's tag: a `constraint` becomes `spec_invariants[]`
downstream, an `intent` does not.

**`anchors`** — the files that would have to change for the promise to break.
This is the set DRIFTED is computed against, so an over-broad anchor
(`src/**`) makes the entry permanently drifted and an absent anchor makes it
permanently HOLDING. Both are worse than a rough-but-real list.

**`check.kind`** — pick the CHEAPEST thing that actually proves it:

| kind | Use when | `ref` is |
|---|---|---|
| `test` | a test asserts it | the narrowest command that runs that test |
| `command` | a linter, a schema validator, a build flag proves it | the command |
| `grep` | the promise is "this string/pattern is (not) present" | the pattern searched for in the anchors |
| `manual` | nothing cheap proves it | `null` — and the entry reads UNCHECKABLE |

**`manual` is not a failure to try harder.** "The admin export never contains a
raw email address" may genuinely need a human to look. Recording that honestly is
the entire reason this lane beats a comment in a spec.

**`confidence`** — `low` + `check.kind: manual` is how an ASSUMPTION is modelled.
There is no second ledger for assumptions.

**`verified_commit`** — moved ONLY by a passing check. Never bumped to quiet a
DRIFTED state: that is the one edit that turns the ledger into decoration.

## Ids

`PACT-<3-digit>`, monotonic, **never reused**. The next id is one past the highest
id in the file *including retired entries*.

## Retirement

Moves nothing and deletes nothing: sets `retired: true` and records
`retired_reason`. `PACT.md` renders retired entries struck through under their own
heading. A promise that silently disappeared is indistinguishable from one that
was never made — and six months later somebody re-derives it from scratch.

## What never goes in

- A promise with no origin.
- A task ("add rate limiting"). That is a plan, not an invariant.
- A preference with no failure mode ("prefer arrow functions"). That is a code
  pattern — `/orc-pattern` owns it.
- Anything the wiki already documents as *behaviour*. The wiki says what the code
  DOES; the pact says what must STAY TRUE. When both would apply, the pact entry
  is the sentence that would make a reviewer block a PR.
