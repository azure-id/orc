# Reference — the corpus, the join, and what may be claimed from it

Loaded at U2 when a number needs explaining. Nothing here is computed by the
skill — `orc budget calibrate` owns all of it. This file exists so a user can be
told WHY a number is what it is, and where it stops being trustworthy.

## The two halves

**Half one — the cost.** Claude Code writes a JSONL transcript per session at
`~/.claude/projects/<project-slug>/*.jsonl`, one line per message. Every assistant
line carries:

```json
"usage": { "input_tokens": 2, "cache_creation_input_tokens": 44439,
           "cache_read_input_tokens": 18432, "output_tokens": 582,
           "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 } }
```

and the LINE carries `model`, `timestamp`, `cwd`, `sessionId` and — the field that
makes this work — **`isSidechain`**, which is how a subagent dispatch is told apart
from the main thread.

**Half two — the meaning.** ORC's own trace: the `DISPATCH` line's task, the
`SCORE` line's band and facet vector, `expect=<model>/<effort>`, the `wiki:`
continuation, `RETURN`'s `actual_model`, `OUTCOME`'s retries and requeues.

## The join

1. Group contiguous `isSidechain` lines in one session on one model into **one
   dispatch**. A gap over 20 minutes starts a new group.
2. For each trace, take the run's own time window from its first and last
   timestamped lines.
3. Match each `DISPATCH` line to the nearest unclaimed group in that window whose
   model equals the dispatch's expected model.
4. Anything left over goes to **`unattributed`**.

**Timestamps come from two clocks and both are honoured as written:** a trace line
carries LOCAL wall clock, a transcript line carries ISO UTC. Both resolve to the
same instant on the same machine. A join that silently treated one as the other
would be off by the timezone offset and quietly attribute nothing.

## What `unattributed` really means

It is not an error and it is not waste. Common, legitimate causes:

- the main thread's own tokens (never a sidechain, never joined to a task)
- a dispatch from a lane that writes no trace (`/orc-retro`, `/orc-explain`)
- an ad-hoc read-only recon dispatch (`/orc-quick`, `/orc-brainstorm`,
  `/orc-boundary`) — deliberately unpinned, so the hook writes no `SPAWN`
- a session where `.current` was lost mid-run

**It is always printed anyway.** A total that quietly excludes tokens somebody paid
for is the one number in this lane that must never be silently wrong.

## What may be claimed, and what may not

| May be claimed | May NOT be claimed |
|---|---|
| "This band cost this much, over N samples" | "This run will cost exactly X" |
| "Cache reads were 74% of raw tokens" | "You will be charged $X" — unless `budget_plan: api` |
| "This task's peak prompt was 189k of 200k" | "This task will compact" — it is a forecast |
| "2 bands have fewer than 5 samples" | Filling a thin band from the band next door |
| "Weighted 564k / raw 1.23M" | One of the two on its own |

**Why report both weighted and raw:** raw is what fills a context window and a rate
limit; weighted (cache reads at 0.1×) is what fills an invoice. They move
differently, and a single number hides whichever one is about to bite.

## The price table

`bin/pricing.json`, or whatever `budget_price_table` points at. Four rates per
model — never one, for the same reason the vector has four components. Dated:
`as_of`, and older than 90 days puts a staleness warning next to every dollar
figure. **Never patch a rate to make a forecast look right.**

The `plans` block holds WEIGHTED-token capacities for the quota view. They
approximate a published allowance; they are not a metered balance. The renderer says
so, and that honesty is why the quota view is usable at all.

## Feeding `/orc-retro`

`orc budget actual <run-slug>` emits per-band forecast-vs-actual with a diff
percent. `/orc-retro` already calibrates the score→model table from process signals
(retries, requeues, downgrades); this adds the cost signal, so a band can be judged
on what it COST as well as on how smoothly it ran. A band that always lands inside
p90 is calibrated; one that lands at +151% twice has a facet problem, not a price
problem.
