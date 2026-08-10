---
description: What this plan will cost, in the unit you are actually billed in — tokens, dollars, percent of your window, or context risk
---

Use the **orc-budget** skill. Read-only, deterministic, never blocks a run.

Account-level burn tracking is already solved. What nothing else can answer is the
only question that changes a decision: **given THIS plan — 14 tasks, 4 waves, top
score 78 — what will it burn, and what does each lane burn instead?**

**Tokens are the unit of truth, and there are four of them.** They are never blended,
because they price completely differently:

| | share | price | |
|---|---|---|---|
| fresh input | small | 1× | the uncached prompt |
| cache write | medium | ~1.25× | a real cost |
| **cache read** | **usually the largest** | ~0.1× | nearly free, and it dominates the raw count |
| output | small | ~5× | the most expensive tokens in the run |

"407k tokens" hides that 80% of it is cache reads at a tenth of list. "$7.02" hides
that on Pro or Max **you do not pay per token at all** — you burn a 5-hour window
and a weekly ceiling. So the same vector is rendered four ways: **tokens · dollars
(from a dated price table) · percent of your window · context risk**, and `auto`
picks the one that matches your plan.

**Context risk is the output nobody else has.** A run can hit compaction, which
silently degrades quality and is invisible in every spend tool. Because ORC composes
the slice and the corpus records the peak prompt of every past dispatch, a task
forecast above 90% of its window is reported **before the wave**, with options:
split it, drop a doc nobody reads from the slice, or raise the band.

Where the numbers come from: Claude Code's own session transcripts give the cost
(four token counts, model, `isSidechain`, timestamp); ORC's traces give the meaning
(task, score, band, expected model, requeues). **Neither is enough alone** — the join
is why a per-plan forecast is possible here and nowhere else.

Five honesty rules it never bends:

- A forecast is a **range with a sample count**. Never one number.
- **No dollar figure without a dated price table** (older than 90 days gets a
  staleness warning), and **no quota figure without a known plan** — it asks once and
  stores it rather than guessing.
- Tokens it could not attribute to a task are **always printed**, never dropped.
- Cache reads get their own p50/p90.
- With no history: it says so and refuses to invent numbers.

**It needs a PLAN, not a sentence.** Forecasting from a request in words is guessing,
and a guess that looks computed is worse than no answer.

Also: `orc budget actual <run-slug>` for what a finished run really cost, and
`orc budget rates` for what your corpus says per band.

The plan file (or `actual <run-slug>`, or nothing for the rates): $ARGUMENTS
