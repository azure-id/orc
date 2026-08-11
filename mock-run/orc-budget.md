# Mock run — `/orc-budget`

> What will this run burn, **before** you start it — in the unit you are
> actually billed in.

---

## 1. What it does

There are many tools that tell you how much you spent **last month**. That
problem is solved.

Nobody can tell you what **this one plan** will burn, before you run it.

To answer that you need a record of your own past runs: what score each task
had, which model ran it, how many tokens of each kind it used, and whether it
worked. **ORC already has this.** Behavior traces are always on. Claude Code
writes a usage transcript for every session. Nobody has ever joined the two.

### Two things the first design got wrong

**Wrong 1: one number.** "407k tokens" hides that about 80% of it is *cache
reads*, which cost about a tenth of a normal input token. Four kinds of token
exist and they behave completely differently:

| Kind | Usual share | Relative price | Why it must be separate |
|---|---|---|---|
| `input` | small | 1× | fresh, uncached prompt |
| `cache write` | medium | ~1.25× | writing the cache — a real cost |
| `cache read` | **usually the biggest** | ~0.1× | almost free, and it dominates the raw count |
| `output` | small | ~5× | the most expensive tokens in the run |

**Wrong 2: dollars as the headline.** On Pro or Max you do **not** pay per
token. You burn against a 5-hour session window and a weekly limit. "$7.02"
means nothing to that user. **"18% of your 5-hour window" means everything.**

So the rule is: **tokens are the unit of truth, and everything else is derived
from them.**

| View | Unit | Who it is for |
|---|---|---|
| **tokens** | in / cache-write / cache-read / out | everyone, always shown |
| **quota** | % of the 5-hour window, % of the weekly limit | Pro / Max — most users |
| **usd** | $ from a dated price table | API billing, enterprise |
| **context** | peak tokens per agent vs its window | everyone, shown only at risk |

---

## 2. The run — forecast

Rina has the same 12-task plan from lane 02. She is on Max 20x.

```
> /orc-budget plan.md
```

```
ORC · budget · forecast

Reading plan.md — 12 tasks, 4 waves.
Reading your history:
  ORC traces        31 runs, 189 task dispatches
  usage transcripts ~/.claude/projects/C--dev-shopcart/ — 47 sessions
  joined            184 of 189 dispatches (5 unattributed, 2.6%)

No model is used for this. It is arithmetic on your own logs.
Your plan: Max 20x  (change with: orc config set budget_plan <plan>)
```

```
ORC · budget · TOKENS  (p50 → p90)

  band          model / count        input    cache-w    cache-r     output
  ────────────────────────────────────────────────────────────────────────────
  [0,30)   ×2   haiku-4-5             1.2k       6.4k      11.8k       0.9k
  [30,40)  ×1   sonnet-4-6-med        2.1k      14.0k      28.4k       2.2k
  [40,55)  ×3   sonnet-4-6-high       7.8k      52.1k     104.0k       8.4k
  [55,65)  ×2   sonnet-5-high         6.9k      48.3k      96.7k       9.1k
  [65,70)  ×1   opus-4-7-med          4.4k      31.0k      62.5k       6.8k
  [70,80)  ×1   opus-4-7-high         5.7k      40.2k      81.0k       9.3k
  [80,90)  ×1   opus-4-8-high         7.1k      49.8k     101.4k      12.0k
  [90,100] ×1   opus-5-high           8.0k      56.0k     114.0k      14.2k
  fixed roles   analyst · planner · reviewer · verifier · trace writer
                                     18.2k     121.0k     248.0k      26.4k
  ────────────────────────────────────────────────────────────────────────────
  TOTAL p50                          61.4k     418.8k     847.8k      89.3k
  TOTAL p90                          93.0k     632.0k   1,318.0k     140.0k

  raw total        p50  1.42M tokens        p90  2.18M
  weighted total   p50  652k-equivalent     p90  1.01M
                        (cache-read counted at 0.1×)

  server tools     3 web searches · 1 web fetch

ORC · budget · the other views

  QUOTA     21% → 32% of a 5-hour window on Max 20x
             4.7% →  7.3% of the weekly limit
  USD       $6.76 → $10.50      price table 2026-08-01, 9 days old ✓
  TIME      18 → 31 min

ORC · budget · CONTEXT RISK — 1 of 12 tasks

  T12  backfill 1.4M rows   opus-5-high   est. peak 189k / 200k   95%   ⚠
       what is in the slice:
         3 wiki docs                58k    ← orc-reference-config.md used 2/20
         code pattern (typescript)  11k
         6 declared files           74k
         plan + contracts           31k
         pact + boundary cards       4k
         headroom for the work      11k
       This task will probably compact. Compaction is silent and it lowers
       quality. Three options:
         · split T12 into two tasks
         · drop orc-reference-config.md from the slice (used 2 of 20 runs)
         · raise the band so a larger-window model takes it

  Other 11 tasks: highest is T09 at 142k / 200k (71%). Fine.
```

```
ORC · budget · the same plan, on other lanes

  lane          raw tok   weighted   quota (Max 20x)   usd p50   time      note
  ──────────────────────────────────────────────────────────────────────────────
  /orc-ultra     2.78M      1.24M     41% of window     $14.20    34–58m   4 judge gates
  /orc           1.42M       652k     21% of window      $6.76    18–31m   ← recommended
  /orc-mini      0.47M       216k      7% of window      $2.10     9–15m   no review, no verify
  /orc-fast      not possible                                              1 REFUSE, 3 ESCALATE
  /orc-quick     0.29M       133k      4% per request    $1.30    per req  you drive it

  From /orc-boundary: T12 is REFUSE. With boundary_gate: block it is never
  dispatched, and /orc drops to 1.23M raw / 564k weighted / 18% / $5.31.
  That also removes the only context-risk task.

  My reading, not a decision:
    3 tasks over score 70 and it touches money. /orc-mini would skip review
    on the Stripe call. I would not recommend that here.
```

```
ORC · budget · how sure am I

  band          past dispatches   confidence
  ─────────────────────────────────────────────
  [0,30)              41          good
  [30,40)             27          good
  [40,55)             38          good
  [55,65)             31          good
  [65,70)             14          fair
  [70,80)              9          fair
  [80,90)              4          LOW — insufficient history
  [90,100]             2          LOW — insufficient history

  Two bands have very little history. Their p90 is shaped by the band next
  to them, not measured. Treat the top of the range as soft.

  Cache-read has its own range and it is the widest part of the forecast —
  it depends on how much of your repo is already warm. Do not budget on the
  raw total; budget on the weighted one.

  5 dispatches (2.6%) could not be joined to a task. They are counted in an
  `unattributed` bucket, never dropped.

  This gets better on its own. Every run sharpens the next forecast.

Wrote: orc-budget/partial-refunds/forecast.md
Trace: run-budget-partial-refunds-100826-163310.txt
```

---

## 3. Where the numbers come from

This part is real, not hand-waved. It was checked on a live machine.

Claude Code writes one JSONL transcript per session at
`~/.claude/projects/<project-slug>/*.jsonl`. Every assistant message carries:

```json
"usage": {
  "input_tokens": 2,
  "cache_creation_input_tokens": 44439,
  "cache_read_input_tokens": 18432,
  "output_tokens": 582,
  "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 }
}
```

and the line also carries `model`, `effort`, `timestamp`, `requestId`, `cwd`,
`sessionId`, and **`isSidechain`** — which is how a subagent dispatch is told
apart from the main conversation.

**The join is the part nobody else has:**

```
  transcript   →  isSidechain block · model · effort · 4 token counts · timestamp
  ORC trace    →  DISPATCH: task id, score, band, expect=<model>/<effort>,
                  wiki: continuation · RETURN: actual_model, actual_effort
  join key     →  cwd + run time window + sidechain grouping + model/effort
```

The transcript gives the **cost**. The ORC trace gives the **meaning** — which
task, which band, whether it was requeued, whether the slice carried wiki
material. Neither is enough alone. Community spend tools have the left column
only, which is why they can total your month but cannot price your plan.

**Honesty rules for the data path:**

- **No transcripts found** → forecast in **tokens only, from ORC trace
  metadata**, and print *"dollars and quota unavailable: no local usage data"*.
  Never invent a price.
- **A sidechain block that cannot be joined** goes to `unattributed`, always
  printed, never silently dropped.
- **Cache reads get their own p50/p90**, never a share of a blended number.
- **The price table is dated.** Older than 90 days → a staleness warning next to
  every dollar figure.

---

## 4. The run — actual, after the build

```
$ orc budget actual run-orc-partial-refunds-100826-171450
```

```
BUDGET · actual vs forecast · run-orc-partial-refunds-100826-171450

  band        forecast p50 (weighted)   actual     diff      note
  ────────────────────────────────────────────────────────────────────────
  [0,30)              9k                  9k       on target
  [30,40)            21k                 20k       -5%
  [40,55)            92k                 79k       -14%
  [55,65)            86k                121k       +41%      T08 2 repair rounds
  [65,70)            57k                 54k       -6%
  [70,80)            74k                186k      +151%      T04 requeued twice
  [80,90)            96k                101k       +5%
  [90,100]            —                   —        not run   T12 blocked
  fixed roles       178k                187k       +5%
  ────────────────────────────────────────────────────────────────────────
  forecast   564k weighted · 1.23M raw · 18% window · $5.31
  actual     757k weighted · 1.58M raw · 24% window · $6.66
  over by    +34% weighted, +28% raw — inside the p90 of 1.01M. Held.

  cache-read share   74% forecast → 71% actual   (cache behaved as expected)
  output tokens      +52% over forecast          (repairs are output-heavy)
  unattributed       2.1% — 12 sidechain blocks
  wall time          16 min forecast → 21 min actual

  What went wrong, for the record:
    T04 (refund payout target) was requeued 2 times. It is the task
    /orc-boundary marked ESCALATE because PACT-006 has no test. The
    executor had nothing to check itself against, so it guessed, got
    reviewed, and tried again. Every retry is almost pure output tokens,
    which is why the money moved more than the raw count did.

    Same finding from three angles. Cheap fix: write the test for PACT-006.

  Fed to /orc-retro. Band [70,80) now has 10 samples.
```

**Why both weighted and raw are reported:** raw is what fills a context window
and a rate limit. Weighted is what fills an invoice. They move differently — in
this run raw went +28% while weighted went +34%, because the extra work was
output-heavy. One number would have hidden whichever one was about to bite.

---

## 5. The file it made

### `orc-budget/partial-refunds/forecast.md`

````markdown
# Budget forecast — partial-refunds

Made 10-08-2026 16:33 at commit `c273793`.
Corpus: 31 ORC runs / 189 dispatches, joined to 47 usage transcripts.
Plan: Max 20x. Price table 2026-08-01.

## Headline

| Lane | raw tok | weighted | quota | usd p50 | time |
|---|---|---|---|---|---|
| `/orc-ultra` | 2.78M | 1.24M | 41% | $14.20 | 34–58 min |
| **`/orc`** | **1.42M** | **652k** | **21%** | **$6.76** | **18–31 min** |
| `/orc-mini` | 0.47M | 216k | 7% | $2.10 | 9–15 min |
| `/orc-fast` | not possible | | | | |

## Token split, p50, on /orc

| kind | tokens | share of raw | share of cost |
|---|---|---|---|
| input | 61k | 4% | 9% |
| cache write | 419k | 30% | 79% |
| cache read | 848k | 60% | 12% |
| output | 89k | 6% | — see note |

Note: output is 6% of the raw count and the single most expensive line per
token. A run that retries a lot moves the bill far more than it moves the
token count.

## Context risk

`T12` at 189k / 200k (95%) — likely to compact.
Largest slice item: 3 wiki docs at 58k, one of which (`orc-reference-config.md`)
was used in 2 of the last 20 runs.

## Confidence

Bands `[80,90)` and `[90,100]` have fewer than 5 samples. Their p90 is derived,
not measured. `unattributed` = 2.6%.

## Assumptions

- No repair rounds assumed. Each repair round adds roughly 40% of that task's
  weighted cost, and far more of its output tokens.
- Wall time assumes waves run in parallel at `max_parallel: 3`.
- Cache-read assumes a warm repo. A cold first run of the day runs higher.
````

---

## 6. The CLI part

```
$ orc budget forecast plan.md --as quota
```

```
BUDGET · /orc · Max 20x

  21% → 32% of a 5-hour window
   4.7% →  7.3% of the weekly limit

  You have used 38% of this window already. This run would take you to
  about 59%, or 70% at p90.
```

```
$ orc budget forecast plan.md --json
```

```json
{
  "plan": "plan.md",
  "tasks": 12, "waves": 4,
  "corpus": { "runs": 31, "dispatches": 189, "joined": 184, "unattributed_pct": 2.6 },
  "budget_plan": "max20",
  "price_table_version": "2026-08-01",
  "price_table_age_days": 9,
  "lanes": [
    {
      "lane": "orc",
      "possible": true,
      "tokens": {
        "p50": { "input": 61400, "cache_write": 418800, "cache_read": 847800, "output": 89300 },
        "p90": { "input": 93000, "cache_write": 632000, "cache_read": 1318000, "output": 140000 }
      },
      "raw_total":      { "p50": 1417300, "p90": 2183000 },
      "weighted_total": { "p50": 652000,  "p90": 1010000 },
      "server_tool_use": { "web_search_requests": 3, "web_fetch_requests": 1 },
      "usd":   { "p50": 6.76, "p90": 10.50 },
      "quota": { "session_pct": { "p50": 21, "p90": 32 }, "weekly_pct": { "p50": 4.7, "p90": 7.3 } },
      "wall_minutes": { "p50": 18, "p90": 31 }
    },
    { "lane": "orc-fast", "possible": false, "blocked_by": "boundary: 1 refuse, 3 escalate" }
  ],
  "context_risk": [
    {
      "task": "T12", "model": "claude-opus-5",
      "est_peak_tokens": 189000, "window": 200000, "pct": 95,
      "slice": { "wiki_docs": 58000, "pattern": 11000, "declared_files": 74000,
                 "plan_contracts": 31000, "pact_boundary": 4000 },
      "options": ["split the task", "drop orc-reference-config.md (used 2/20)", "raise the band"]
    }
  ],
  "bands": [
    { "band": "[80,90)", "samples": 4, "confidence": "low", "reason": "insufficient history" },
    { "band": "[90,100]", "samples": 2, "confidence": "low", "reason": "insufficient history" }
  ],
  "exit": 2
}
```

Exit `0` normal · `1` at least one band is low-confidence · `2` a task is at
context risk · `3` no history, no forecast possible.

**When there is no history:**

```
BUDGET · no forecast

  0 past runs in .claude/orc/logs/ and no usable transcripts in
  ~/.claude/projects/.

  I will not invent numbers.
  Run /orc or /orc-mini once. After that I can forecast.

  A floor from the public price table only, ignoring how your repo
  actually behaves:   orc budget forecast --naive
```

**When there are traces but no transcripts:**

```
BUDGET · tokens only

  ORC traces found (31 runs). Usage transcripts not found.
  I can forecast TOKENS from trace metadata. I cannot price them.

  dollars : unavailable — no local usage data
  quota   : unavailable — no local usage data

  raw total p50  1.42M tokens
  ⚠ this estimate is coarser than usual: without transcripts I cannot
    separate cache reads, so the raw total is a band-average, not measured.
```

Exit still `0`. **This is the honesty rule in action** — a smaller answer, not a
fake one.

Two more commands:

```
$ orc budget rates
```

```
BAND RATES · from 189 dispatches

  band          n    input   cache-w   cache-r   output   weighted p50
  ──────────────────────────────────────────────────────────────────────
  [0,30)       41    0.6k     3.2k       5.9k     0.5k      4.4k
  [40,55)      38    2.6k    17.4k      34.7k     2.8k     30.6k
  [70,80)       9    5.7k    40.2k      81.0k     9.3k     74.0k   fair
  [90,100]      2    8.0k    56.0k     114.0k    14.2k    103.0k   LOW
```

```
$ orc budget calibrate
```

Rebuilds the per-band model from transcripts + traces. Run it after a batch of
runs, or when the join rate drops.

---

## 7. Inside a normal `/orc` run

**At Phase 2 intake**, next to the batch pause confirmation:

```
Intake · confirm before we start

  12 tasks · 4 waves · pause after every 2 waves

  Forecast   1.42M raw / 652k weighted tokens
             21% → 32% of your 5-hour window
             $6.76 → $10.50 · 18 → 31 minutes
             (from your own 31 runs; 2 bands have low confidence)

  ⚠ T12 is forecast at 95% of its context window and will probably compact.

  Pause points are also budget points. At each pause I will tell you what
  you have burned and what is left.

  1  Start
  2  Switch to /orc-mini      (216k weighted · 7% of window · $2.10, no review)
  3  Fix the context risk first
  4  Change the plan
```

**At each batch pause:**

```
Pause after wave 2 of 4

  Burned so far : 281k weighted · 9% of window   (forecast to here 244k–390k)
  Left to go    : 240k → 420k weighted · 8–13% of window
  Inside the forecast.

  1  Continue     2  Stop here
```

**In `/orc-route`**, a unit-aware cost column:

```
Recommended lane: /orc

  lane         score  weighted   quota   why
  ────────────────────────────────────────────────────────────────────────
  /orc          88     652k      21%     3 tasks over 70, money code, needs review
  /orc-mini     61     216k       7%     cheaper, but skips review on the Stripe call
  /orc-ultra    54    1.24M      41%     more rigor than this plan needs
  /orc-fast      0       —        —      not possible: 1 REFUSE task
```

Before this, routing was a feeling. Now it has a price **in the unit you are
billed in**.

---

## 8. Why this is good for ORC

**It is the one thing only ORC can do.** Every competitor can count tokens after
the fact. Only ORC has per-task scores, per-band models, per-dispatch traces,
and a slice it composed itself — so only ORC can join a cost to a *meaning*.
This forecast is impossible without that.

**It speaks the user's actual currency.** Most Claude Code users are on Pro or
Max and do not pay per token. A quota view is the difference between a number
they ignore and a number they act on. No spend tool does per-plan quota
forecasting.

**Context risk is a new kind of answer.** Compaction is silent, it lowers
quality, and today nothing warns you before it happens. ORC can, because ORC
builds the slice. And the fix it suggests — *drop the wiki doc nobody uses* —
comes straight out of the wiki usage work.

**It makes `/orc-route` real.** "This lane costs 3× more and here is what you
get" is a far better sentence than "this lane is more thorough".

**It gets better by itself.** Every run adds samples. The lane starts weak and
says so, then sharpens. That is a good shape for a product: it rewards staying.

**It closes a loop with `/orc-retro`.** Forecast vs actual per band is exactly
the signal retro needs to tune the score→model table. Today retro sees that a
band retried a lot. Now it also sees that the band cost 151% more — and that
the overage was mostly *output* tokens, which points straight at retries rather
than at big context.

**It costs almost nothing to run.** Pure arithmetic in `bin/cli.js`. No model,
no tokens. And because it speaks `--json`, `orc ui` gets a Cost panel free.
