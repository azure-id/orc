# Conservation — nothing evaporates

Borrowed from `context-combiner`, applied to findings instead of requirements.

> Every finding from iteration N−1 appears in iteration N with exactly ONE
> outcome and a reason.

**A silently dropped finding is indistinguishable from a fixed one.** That is the
classic way a review cycle appears to "converge": nobody removed anything, the
list just got shorter.

## The outcome set — closed

| Outcome | Meaning | Set by |
|---|---|---|
| `resolved` | the judge re-read the anchor and the problem is gone | judge |
| `still-open` | unchanged, or changed and still wrong | judge |
| `superseded` | the artifact moved; this finding is replaced by a new one (**the replacing id is required**) | judge |
| `withdrawn` | the judge now agrees it was not a finding (**reason required**) — the only outcome a rebuttal can force | judge |
| `accepted` | the user accepted it as a known gap | **the CLI, never the judge** |

## The gate

```
coverage_pct = (findings carried in that got an outcome) / (findings carried in) × 100
```

**Below 100, the verdict is malformed.** `orc challenge record` rejects it with
exit 2 and NAMES THE MISSING IDS:

```
❌ malformed verdict — coverage is 20% — every finding carried in must get
   exactly ONE outcome. Missing: F-002, F-003, F-004, F-005
```

Fix the return and re-record. Never argue with the gate, and never re-record a
trimmed finding list to make the number go up.

## The open set

Everything downstream — PASS, the convergence chart, the fix brief, the panel —
reads one definition, so there is exactly one idea of "still open":

> the last iteration's findings whose outcome is `null` (newly raised) or
> `still-open`, minus everything the user has accepted.

## What conservation is NOT

- It is not a requirement that the judge keep agreeing with itself. `withdrawn`
  exists, and a judge that withdraws a finding with a clear reason is doing its
  job.
- It is not a requirement that findings only ever decrease. A revision can
  legitimately introduce new problems, and the convergence chart showing 9 → 4 →
  6 is information, not a failure of the process.
- It is not a licence to renumber. **An id is permanent.** `F-003` means the same
  thing in iteration 7 as it did in iteration 1, or the history is worthless.

## Conservation of INPUT — the council (v0.49.1)

Everything above conserves findings ACROSS iterations. The council needs the same
rule pointed the other way, at the input to one iteration:

> **Every id the council raised must appear in the judge's return with exactly
> ONE disposition and a reason. `council_coverage_pct` must be 100.**

The obvious failure of adding five reviewers is that the judge quietly ignores
four of them and the run looks identical while costing five times more. So
`orc challenge record` **reads `iteration-NN/council/*.json` itself** and derives
the id set. The judge cannot shrink it by omission, because the set was never the
judge's to report.

### The disposition set — closed

| Disposition | Meaning | Requires |
|---|---|---|
| `adopted` | the judge agrees; the finding enters `findings[]` under its own id | `severity`, `dimension`, `serves` |
| `merged` | the same defect as another finding | `merged_into` (a resolvable id) |
| `rejected` | the judge read the anchor and disagrees | `reason` |
| `out-of-goal` | real, but traceable to no goal element | `reason` — **reported**, never silently dropped |

**An id is permanent, across prefixes.** `C-004` adopted by the judge stays
`C-004` in the verdict, in the report, and in iteration 9. That is what lets a
user find out whether a lens is earning its dispatch — and it is why a lens may
only RAISE. **A lens raises; only the judge resolves.**

### Across a changed roster

Rule 11 already says a carried finding is re-judged from the artifact on disk,
never from an account of what changed — so the judge never needed the original
raiser. **The judge resolves every carried finding, whatever prefix it carries**,
which makes the roster freely variable between iterations at zero cost to
conservation.

### The classes that are conserved but never gated

An `opportunity` and a `premise` never enter `findings[]` and never touch the
pass gate — but neither may evaporate. An opportunity lands `taken` or `dropped`
with a reason (`orc challenge opportunity`); a premise lands `adopted` (a
`regoal`) or `dismissed` with a reason (`orc challenge premise`). **Neither is
ever automatic**, and a dismissed premise stays visible in the report forever.

## Rebuttals interact with conservation

An open rebuttal is a second obligation on top of the outcome: the next verdict
must ALSO return `{ id, result: withdrawn|upheld, reason }`. An ignored rebuttal
makes the iteration malformed even when coverage is 100%, because a user who
cannot be answered has no move except giving up.
