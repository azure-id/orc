# The council

> **A lens raises; only the judge resolves. ORC proposes the council; the user
> picks it.**

**a lane that picks its own council has broken this contract.**

That is the fourth member of a family, and the split is the same every time —
the facts are ORC's to look up, the decision is the user's to take:

| Lane | Broken by |
|---|---|
| `../../_shared/interview.md` | `a lane that answers its own interview question` |
| `/orc-brainstorm` | `a lane that picks its own favourite` |
| `/orc-challenge` | `a lane that fixes what it judged` |
| `/orc-doc` | `a lane that reads its own document` |
| **`/orc-challenge` council** | **`a lane that picks its own council`** |

A council chosen by ORC is ORC deciding **which kinds of criticism the user is
allowed to hear** — a bigger decision than any single finding in the run.

---

## The roster — seven lenses

One always runs. Six are selectable. **The user selects them.**

| Lens | Display | Agent | Effort | Class | Ids | Blocks? |
|---|---|---|---|---|---|---|
| `judge` | The Judge | `orc-challenge-judge-opus-5-high` | high | finding | `F-` | yes |
| `reader` | The Cold Reader | `orc-challenge-reader-opus-5-low` | low | finding | `R-` | yes |
| `contrarian` | The Contrarian | `orc-challenge-contrarian-opus-5-high` | high | finding | `C-` | yes |
| `outsider` | The Outsider | `orc-challenge-outsider-opus-5-low` | low | finding | `O-` | yes |
| `executor` | The Executor | `orc-challenge-executor-opus-5-med` | medium | finding | `E-` | yes |
| `principles` | The First Principles Thinker | `orc-challenge-principles-opus-5-high` | high | **premise** | `Q-` | **never** |
| `expansionist` | The Expansionist | `orc-challenge-expansionist-opus-5-med` | medium | **opportunity** | `X-` | **never** |

`orc-challenge-advisor-opus-5-med` is **not a lens.** It never inspects the
artifact for defects; it turns a FAIL into a fix strategy, and rule 5 still
holds: **no advisor on PASS.**

**Never hand-list these anywhere else.** `orc challenge roles --json` is the
catalogue; the P0 ask in `intake.md` renders it, and `orc ui` draws the roster
card from it. One list, three renderers — the Flow-stepper rule.

### What each one is for, and how each one fails

| Role | It asks | It fails when |
|---|---|---|
| The Contrarian | "where is the fatal flaw?" | it assumes the artifact is fine and stops looking |
| The First Principles Thinker | "are we even solving the right problem?" | it accepts the framing it was handed |
| The Expansionist | "what is being undervalued here?" | it only counts what is wrong |
| The Outsider | "what does this assume I already know?" | it is an expert and cannot un-know things |
| The Executor | "what do you actually do on Monday morning?" | it grades the theory and never the first step |

### Why each effort — and the rule that protects it

**Effort here is a measurement choice, not a cost choice.** The same sentence
governs the cold reader and the `/orc-doc` checker, and it now governs two more:

- **`outsider` is `low` for the same reason `reader` is.** A harder-thinking
  outsider reasons its way *around* an unexplained acronym and reports that the
  document is fine. The whole instrument is "do not reconstruct — report what is
  actually on the page." **Nothing may ever upgrade it.**
- **`contrarian` is `high` because a shallow contrarian finds only the obvious.**
  At low effort it returns the same three surface complaints the free lint
  already caught.
- **`principles` is `high`** — rebuilding a problem statement from the ground up
  is the deepest reasoning any role in this lane does.
- **`expansionist` and `executor` are `medium`** — pattern work against a
  concrete artifact, the same class as the advisor.

All seven are `claude-opus-5`, so **`opus5_only` is a no-op for this lane: it is
unaffected, not exempt.** The agent count rises by exactly five, with no paired
variants (the v0.47.0 precedent).

---

## The reader / outsider seam — read this before touching either

These two are the closest pair in ORC, and the one place this design can produce
a duplicate instrument. The distinction is **structural, not stylistic**:

| | `reader` | `outsider` |
|---|---|---|
| Told the audience | **yes** | **no** |
| Told the goal / kind / template | no | no |
| What it generates | 8–15 questions **the artifact promised to answer**, from its own headings | nothing — it reacts to what is in front of it |
| What it returns | a **scored** questionnaire (`8/12`) + `R-###` | an **unscored** ranked list of assumed knowledge + `O-###` |
| The measurement | *can this be answered from the page?* | *what does this page assume you already know?* |
| Feeds | D4 | D5, and D4 where an assumption is load-bearing |

They are dispatched **with no knowledge of each other**, and their reports are
never merged before the judge reads them. **Where they agree, that is the
strongest comprehension evidence this lane can produce** — recorded as
`corroborated_by: [reader, outsider]`, and **never an automatic severity bump**
(the `/orc-aftermath` rule: churn is a signal, not a verdict).

---

## Three output classes — the honest split

```
class: finding      → judge, reader, contrarian, outsider, executor
class: opportunity  → expansionist
class: premise      → principles
```

Two of the six cannot produce a finding **without lying**, and forcing them to
would be the single worst decision available here.

### Why the expansionist cannot produce a finding

A finding must carry `serves` — the goal element it advances — and `record`
DROPS a finding without one (rule 0, structural). The expansionist's brief is
*"what upside is everyone missing?"*, which by construction is **not** in the
stated goal. Given a `serves` field it would either invent a goal element or be
silently dropped by the CLI.

```yaml
opportunity:
  id: X-002
  what: "the retry table generalises to every idempotent write in the service"
  upside: "…"
  first_step: "…"             # concrete; an upside with no first step is a daydream
  anchor: "docs/tsd-payments.md:212"
  confidence: medium
  route: brainstorm           # brainstorm | pact | grill | none
```

**An opportunity never blocks, never has a severity, and never enters
`findings[]`.** It is conserved — `orc challenge opportunity <slug> <id>
--take|--drop --reason "…"`, both requiring a reason — and it is ROUTED: an
adopted one belongs in `/orc-brainstorm`, and one the user wants to commit to
belongs in `/orc-pact`. **This lane never builds it.**

### Why the first-principles thinker cannot produce a finding

Its most valuable output is *"you are asking the wrong question entirely"* — and
in this lane the question is the **frozen goal**. A finding is measured against
the goal; a premise challenge disputes the **yardstick**. Those cannot be the
same object.

```yaml
premise:
  id: Q-001
  disputes: goal              # goal | audience | done_means | out_of_scope
  quote: "<the exact line from goals.md it disputes>"
  reframe: "…"                # the problem restated from the ground up
  what_changes: "…"           # what this review would attack instead
  cheapest_test: "…"          # how to settle it without a rewrite
```

**A premise challenge is resolved by a HUMAN and by nobody else.** Exactly two
resolutions exist:

1. **Adopt** → `orc challenge goals <slug> --set <path> --reason "…"` — a
   `regoal` event; `goals.version` increments, prior iterations keep their stamp,
   and the iteration rail draws the version break. That mechanism has existed
   since v0.47.0; the council is the first thing that can legitimately move it.
2. **Dismiss** → `orc challenge premise <slug> <id> --dismiss --reason "…"`. The
   reason is mandatory and stays visible in the report forever.

**The judge NEVER sees the premise report.** Handing a judge a document arguing
that the frozen goal is wrong biases every finding it produces afterwards.

> **The three finding lenses feed the judge. The two non-finding lenses feed the
> user.** That sentence is the whole architecture.

---

## C3 — dispatch discipline

The **judge slice is SEALED** as it always was — one row per FINDING lens, and
`principles.md` / `expansionist.md` are named as forbidden in `sealed-slice.md`.

- Every lens is dispatched **BY NAME**. An unnamed dispatch cannot enforce the
  pin and is invisible to the trace hook (the v0.34.5 wiki-scanner lesson) — and
  a by-name dispatch gets `SPAWN`/`RETURN` for free, which is how `/orc-retro`
  can finally answer *"is the contrarian earning its dispatch?"*
- **Hard cap: 3 in flight**, announced when it bites, **no config key**. Six
  simultaneous returns is six `../../_shared/return-validation.md` blocks in one
  orchestrator context, and this lane's orchestrator has a document to hold too.
- Every return is validated per `../../_shared/return-validation.md`:
  `actual_model` and `actual_effort`, **quoted, never guessed**.
- **A selected lens that did not run is NOT-RUN with a reason** — rule 6
  (`NOT-CHECKED` is never silent) extended to roles. The orchestrator writes
  `{ "lens": "contrarian", "ran": false, "reason": "…" }` into the verdict's
  `council[]`, and `record` accepts it. **Silence is rejected by name.**

### What each lens writes

```
orc/orc-challenge/<slug>/iteration-NN/council/
    reader.md      reader.json
    contrarian.md  contrarian.json
    outsider.md    outsider.json
    executor.md    executor.json
    principles.md  principles.json      ← recorded by `note`, never by `record`
    expansionist.md expansionist.json   ← recorded by `note`, never by `record`
```

The `.md` is for the human and for the judge's slice. The `.json` is the machine
half, and it is what makes the next section possible.

---

## Council conservation — the gate that makes this safe

The obvious failure of adding five reviewers is that **the judge quietly ignores
four of them** and the run looks identical while costing five times more.

> **Every id the council raised must appear in the judge's return with exactly
> ONE disposition and a reason. `council_coverage_pct` must be 100.**

That is `conservation.md` applied to **input** instead of to carry-forward, and
`orc challenge record` enforces it without reading a word of prose: **it reads
`iteration-NN/council/*.json` ITSELF and derives the id set.** The judge cannot
shrink it by omission, because the set was never the judge's to report.

### The disposition set — closed

| Disposition | Meaning | Requires |
|---|---|---|
| `adopted` | the judge agrees; the finding enters `findings[]` under its own id | `severity`, `dimension`, `serves` |
| `merged` | the same defect as another finding | `merged_into` (a resolvable id) |
| `rejected` | the judge read the anchor and disagrees | `reason` |
| `out-of-goal` | real, but traceable to no goal element | `reason` — and it is **reported**, never silently dropped |

**`adopted` keeps the raiser's id.** `C-004` stays `C-004` in the verdict, in the
report, in iteration 9. An id is permanent (`conservation.md`), and this is what
lets the panel say *"the contrarian raised four of the six blockers this
iteration"* — which is how a user finds out whether a lens is worth its money.

### Carrying forward across a changed roster

Iteration 2 runs the contrarian, iteration 3 does not, and `C-004` is still open.
Who resolves it?

> **The judge resolves every carried finding, whatever prefix it carries.**

Rule 11 already says a carried finding is re-judged **from the artifact on disk**,
never from an account of what changed — so the judge never needed the original
raiser. That makes the roster freely variable between iterations at zero cost to
conservation, and it is why lenses may only *raise*.

`record` therefore keeps its existing `coverage_pct` gate exactly as it was and
adds `council_coverage_pct` beside it.

### The gates, each rejecting BY NAME (all exit 2)

| Gate | Rejects |
|---|---|
| `council-unset` | the cycle's roster is `null` (a migrated v1 cycle) |
| `unknown-lens` | a `lens` outside the catalogue |
| `bad-prefix` | a finding whose id prefix disagrees with its lens |
| `duplicate-id` | the same id from two lenses |
| `lens-silent` | a roster lens with neither a report on disk nor `ran: false` + a reason |
| `council-coverage` | any raised id missing a disposition — **the missing ids are named** |
| `bad-disposition` | outside the set, `merged` without a resolvable `merged_into`, or `rejected`/`out-of-goal` with no reason |
| `class-mismatch` | an opportunity or a premise inside `findings[]` |
| `unknown-corroborator` | `corroborated_by` naming a lens that did not run this iteration |

**PASS is computed exactly as before.** An adopted council finding is an ordinary
finding from that moment on; `challengeBlocking()`, `challengeOpen()`,
`challengeCounts()` and `challengeStateOf()` are untouched. **The pass gate
learns nothing about the council**, which is what keeps rule 2 true.

---

## The frozen roster

The roster is **not a config key.** A global default would silently answer the
one question this whole design exists to ask. It is a per-cycle FROZEN decision
in the ledger, changed only by a recorded `recouncil` event:

```bash
orc challenge council <slug> --set contrarian,executor --reason "…"
```

`council_version` increments exactly like `goals.version` and
`template.version`, and the iteration rail draws a **third** version break for
it — because comparing an iteration judged by three lenses to one judged by six
is not a comparison.

A cycle opened before v0.49.1 reads back with `council: null`, and `record`
refuses the next iteration by name until the roster is answered. **A silent
default would be ORC picking the council.**

---

## The trace

`record` returns the line and the skill copies it **VERBATIM**:

```
CHALLENGE iter=2 findings=P0:1/P1:3/P2:6 coverage=100% council=4/5 raised=C:6,O:3,E:2 adopted=9 verdict=FAIL
```

`council=4/5` is *lenses that ran / lenses on the roster*, so a NOT-RUN lens is
visible in the trace, in `orc stats`, and to `/orc-retro` — not only in the
panel.

---

## How the council fails — and what prevents each

| Failure | Prevention |
|---|---|
| Five reviewers run and the judge ignores four | `council_coverage_pct`, computed from disk, never from the judge's account |
| The expansionist's ideas get dropped for having no `serves` | the `opportunity` class — it never enters `findings[]` |
| ORC decides which criticism the user is allowed to hear | rule 12, and `--council` has no default |
| Six lenses, six wordings of one defect | `merged` + `corroborated_by`, and the per-lens raise counts make a useless lens visible within two iterations |
| Reader and outsider collapse into one instrument | two different slices and two different return contracts — and when they agree, that is recorded as corroboration, not duplication |
| A premise challenge destabilises every review | it never blocks, it resolves only by a human decision with a recorded reason, and a user who does not want their premise questioned simply does not select it |
