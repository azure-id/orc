---
name: orc-budget
description: >
  What a run will cost, in the unit YOU are billed in. Use for "/orc-budget",
  "what will this plan cost", "which lane is cheaper here", "how much did that run
  burn", "will this hit my limit". Given a PLAN — not a sentence — it forecasts a
  token vector (fresh input, cache write, cache read, output kept separate) per
  scoring band, then renders it four ways: tokens, dollars from a dated price
  table, percent of your 5-hour session window, and context-window risk per task.
  Every number is a range with a sample count, joined from Claude Code's own usage
  transcripts and ORC's traces. It never blocks a run and never invents a figure.
---

# ORC-BUDGET

The lane that **measures** — forwards.

Account-level burn tracking is solved: `/usage`, cc-budget, eight commercial
dashboards. What none of them can answer is the only question that changes a
decision: **given THIS plan — 14 tasks, 4 waves, top score 78 — what will it burn,
and what does each lane burn instead?**

**The one-sentence contract: a forecast is a RANGE WITH A SAMPLE COUNT, never one
number, and never a figure ORC did not measure.**

## Tokens are the unit of truth. Everything else is derived.

The core object is a **token vector**, never a scalar. Four kinds, because they
price and behave completely differently:

| Kind | Typical share | Relative price | Why it must stay separate |
|---|---|---|---|
| `input` | small | 1× | fresh, uncached prompt |
| `cache_write` | medium | ~1.25× | writing the cache — a real cost |
| `cache_read` | **usually the largest** | ~0.1× | nearly free, and it dominates the raw count |
| `output` | small | ~5× | the most expensive tokens in the run |

A forecast of "407k tokens" hides that ~80% of it is cache reads costing a tenth
of list. A forecast of "$7.02" hides that a Max user does not pay it. **So the CLI
computes the vector once and renders it four ways.** Never a blended token count as
the headline; `cache_read` is always separable.

Plus one non-token line, because it bills separately and is in the data:
`server_tool_use` → web search and web fetch requests.

## Four views of the same vector (`budget_units`, default `auto`)

| View | Unit | Who it is for |
|---|---|---|
| **tokens** | in / cache-write / cache-read / out, per band | everyone — always shown |
| **usd** | dollars from a dated table | API-billed, enterprise |
| **quota** | % of the 5-hour window, % of the weekly limit | **Pro / Max — most users** |
| **context** | peak prompt per dispatch vs its window | shown when a task is at risk |

**A dollar figure is the wrong headline for most Claude Code users.** On Pro or Max
you do not pay per token — you burn a 5-hour session window and a weekly ceiling.
"$7.02" means nothing to that user; "18% of your 5-hour window" means everything.
`budget_units: auto` picks from `budget_plan`; `--as tokens|usd|quota|context|all`
overrides.

## Context pressure — a forecast output nobody else has

A run does not only cost money. It can hit **compaction**, which silently degrades
quality and is invisible in every spend tool. ORC can forecast it because ORC
composes the slice, and the corpus records the **peak prompt** of every past
dispatch. A task forecast above 90% of its model's window is reported before the
wave, not after the damage — with three options: split the task, drop a doc nobody
uses from the slice (`orc wiki usage`), or raise the band so a larger-window model
takes it.

## Where the numbers come from — and the join is the moat

```
  transcript  →  isSidechain block, model, effort, 4 token counts, peak, timestamp
  ORC trace   →  DISPATCH line: task, score, band, expect=<model>/<effort>,
                 the wiki: continuation, RETURN with actual_model
  join key    →  the run's time window + sidechain grouping + model match
```

Claude Code writes a JSONL transcript per session under
`~/.claude/projects/<slug>/`. That gives the **cost**. ORC's own traces give the
**meaning** — which task, which band, which model was expected, whether it was
requeued. **Neither is enough alone, and nobody else has the right-hand column.**
Details and honesty rules: `references/corpus.md`.

## Honesty rules — all six, always

1. **No transcripts?** Forecast in **tokens only** from ORC trace metadata and
   print *"dollars and quota unavailable: no local usage data"*. Never invent a
   price.
2. **`unattributed` is ALWAYS printed**, including when zero. A sidechain block that
   could not be joined to a task counts into it and is never silently dropped.
3. **Cache reads get their own p50/p90**, not a share of a blended number. They are
   the most variable component.
4. **No dollar figure without a dated price table** (`budget_price_table`; default
   the shipped one). Older than 90 days → a staleness warning beside every figure.
   **No quota figure without a known plan** — `budget_plan` is asked ONCE and
   stored, because a wrong guess rendered as a percentage is worse than no
   percentage.
5. **A band below `budget_min_samples` (default 5) is printed as low-confidence.**
   The top of the range is soft and the output says so.

6. **A foreign dispatch is priced from its OWN dated table, or not at all**
   (v0.50.0). A task can execute on a non-Claude worker
   (`_shared/extra-dispatch.md`); its four token kinds arrive the same way and
   are never blended, but an Anthropic rate applied to somebody else's bill is
   fiction — so `bin/pricing.json`'s `providers` block is the only source, and
   **every `models` map in it ships EMPTY on purpose**. Several of these vendors
   price by peak window or by tier, one sells a subscription rather than tokens,
   and one is a passthrough with a surcharge; a shipped figure wrong by 2x is
   worse than none, because a wrong figure gets believed. `orc extra rates`
   lists the pairs your traces actually used and prints the JSON to paste.
   Until then: **`usd` reads as an em dash, never zero and never an estimate.**

   Two further foreign-only distinctions, and collapsing either is a wrong
   number rather than a rounder one:

   - **`usage: null` is not `{0,0,0,0}`.** Engine `cli` frequently reports no
     token counts. Null means *unknown*; four zeros would mean *free*. Carry the
     denominator (how many dispatches the vector came from) into every total.
   - **`cache_write: 0` on engine `api` IS a measurement.** An
     OpenAI-compatible endpoint caches implicitly and has no write charge to
     report. That zero is true and must not be smoothed into an average.

   `orc extra stats --json` computes all of this per profile per band. Render
   it; do not recompute it.

## It refuses a sentence

`orc budget forecast` takes a **plan file**. Forecasting from a request in words is
guessing, and a guess that looks computed is worse than no answer — the same reason
`/orc-route` is plan-only. No `- id:` task blocks → exit 3 with the reason and a
pointer to `/orc-plan`.

**With no history at all:**

```
BUDGET · no forecast
  0 joinable dispatches in .claude/orc/logs/ and no usable transcripts.
  I will not invent numbers. Run /orc or /orc-mini once, then ask again.
  A floor from the public price table only:  orc budget forecast --naive
```

---

## Phases

```
U0  preflight (silent)   orc budget rates --json   (lazily calibrates on a miss)
U1  input                a plan file · a run slug · "just the rates"
U2  forecast / actual     the CLI computes; this lane RENDERS and explains
U3  decide               ONE question: which lane · split a task · proceed
U4  record               one end-of-run trace packet
```

**U2 does no arithmetic.** `orc budget forecast|actual|rates` are the only engine —
this skill never re-derives a band, a price, a percentile or a total. Same rule as
the wiki tier and the DIY stepper: a second idea of the number is drift no lint
could see.

**U0 opens the run properly.** Write `log_dir/.current` =
`run-budget-<slug>-<DDMMYY>-<HHMMSS>.txt` AND `touch the trace file` of that name
in the SAME step. Both, or neither. A lane the protocol declares must be a lane
something OPENS, or every counting tool reports it as a permanent zero.

**U1 asks `budget_plan` ONCE** if it is `auto`, as a single line, and stores it:

```
Which plan are you on? It changes the primary unit, and I will not guess.
  1 Max 20x    2 Max 5x    3 Pro    4 API (billed per token)    5 Skip — tokens only
```

**U3 is a real question, not a summary.** The forecast exists to change a decision:

```
1  Proceed on /orc            1.23M raw · 564k weighted · 18% of a window
2  Run /orc-mini instead      0.41M raw · 188k weighted ·  6%   (no review/verify phase)
3  Split T12                  it forecasts 189k of a 200k window — likely to compact
4  Your own — re-plan smaller, or just show me the numbers again
```

## Where this shows up in `/orc`

- **Phase 2 intake** — the forecast at the batch-pause confirmation, so the pause
  schedule doubles as a budget checkpoint.
- **Every pause** — spend so far vs forecast to here, in the primary unit.
- **`/orc-route`** — a cost column per lane, so routing stops being qualitative.
- **Ship** — actual vs forecast, fed to `/orc-retro`.
- **Context risk** — a task above 90% of its window is reported to the planner
  BEFORE the wave.

**It never blocks a run.** Advisory always. The one hard stop in this area is the
existing `run_budget_dispatches` gate, which counts dispatches, not tokens, and is
not part of this lane.

## Behavior trace (always on)

Follow `../orc/references/trace-protocol.md`. Lane name `budget`.
**Single-dispatch lane: exactly ONE end-of-run packet** to
`orc-trace-writer-haiku-4-5` after U4 and BEFORE `.current` is deleted. It carries
`run_meta`, the events (probe, forecast, the units rendered) and the U3 answer as
`decisions`. A run that ends with
`zero new trace lines is a protocol violation`.

Zero new agents. There is nothing to dispatch: the whole forecast is deterministic.

## How this lane fails — and the rule that prevents each

| Failure | Prevention |
|---|---|
| One confident number | A range with a sample count, always |
| A blended token total as the headline | Four kinds, always separable |
| A dollar figure for a Max user | `budget_units: auto` off `budget_plan` |
| A price from an undated table | Dated table, 90-day staleness warning |
| A quota percent from a guessed plan | Asked once, stored, never inferred |
| Tokens silently dropped from the total | `unattributed` always printed |
| A forecast from a sentence | Plan-only, exit 3 with the reason |
| It blocks a run | Advisory always |
| The skill recomputes a band | The CLI is the only engine |

## Rules this lane always keeps

Never one number · never a blended headline · never an invented price · never a
guessed plan · never drop `unattributed` · never forecast from prose · never block ·
never compute what the CLI computes.
