# EW8 — the token question, answered without spending tokens

Date: 16-09-2026. Tool: `eval/graph-replay.js` (zero model tokens; it reads transcripts already
on disk). Datasets: **242 context windows** from the real ORC lane runs of W9 round 2
(`~/.claude/projects/C--dev-orc-eval`, 40.5 M tokens added to context) and **78 windows** from
real development sessions on this 143-file repository (`C--dev-orc`, 79.2 M tokens added).

> ## The verdict
>
> **The code graph does not reduce token usage by a two-digit percentage, and it cannot.**
> The tokens it targets are **under 4% of what a session spends**, and it can address a small
> part of even that. This is structural, not a tuning problem. **Do not pay for an A/B run to
> confirm it.**

---

## 1. Where the tokens actually go

Both datasets agree, and neither is close to the hypothesis the feature was built on.

| Share of tokens ADDED to context | ORC lane runs | Dev sessions |
|---|---|---|
| model OUTPUT | 18.4% | 29.3% |
| first-turn prompt (system + skills + agent definitions) | 7.1% | 7.3% |
| **ALL tool results** | **5.5%** | **5.7%** |
| — `Read` | 3.28% | 0.65% |
| — `Bash` | 1.62% | 4.67% |
| — **`Grep`** | **0.04%** | **0.06%** |
| — **`Glob`** | **0.02%** | — |
| the rest (context prefix re-written as the conversation grows) | ~69% | ~58% |

**`Grep` and `Glob` together are six hundredths of one percent of the spend.** The graph hook's
delivery events aim at exactly those. Deleting every search from every one of those 242 windows
would save 0.06%.

## 2. What a perfect locator could have saved

`graph-replay.js` replays every `Grep`, `Glob` and whole-file `Read` in those sessions, works out
which the graph could have answered, and prices the answer with a REAL `orc graph ctx` card at
the shipped budget.

| | ORC lane runs | Dev sessions |
|---|---|---|
| searches · whole-file reads | 139 · 1,077 | 111 · 417 |
| retrieval tokens (first entry) | 1,288,094 (3.2% of added) | 328,419 (0.4% of added) |
| **what the graph as built can answer** | 6 calls | 31 calls |
| saved, as built | 1,238 (0.1% of retrieval) | 11,440 (3.5% of retrieval) |
| **CEILING — every whole-file read of an indexed file becomes card + 80 lines** | 33,842 (2.6% of retrieval, **0.1% of added**) | 44,002 (13.4% of retrieval, **0.1% of added**) |

The ceiling is the honest upper bound: it assumes a perfect locator, perfect compliance, and that
every whole-file read becomes a range read. **It is 0.1% of a session.**

## 3. Why the earlier rounds could not have shown anything

W9 round 1 and round 2 were inconclusive, and the reason is now measured rather than guessed:

1. **The fixture is eight files.** `names.json` on `../orc-eval` holds 12 symbols, so almost no
   search pattern can match a known name — the graph answered **6 of 1,216** retrieval calls
   there. No number of repeats would separate that from noise.
2. **Agents read far more than they search** — 1,077 whole-file reads against 139 searches. The
   delivery events were aimed at the smaller half of a small share.
3. **The metric was total session tokens**, where retrieval is 3.2%. A real 20% improvement in
   retrieval would have moved the total by 0.6%, well inside the 34% run-to-run spread round 2
   measured on the OFF runs.

So round 2's "inconclusive" was not a weak result. It was the only result that dataset could
produce.

## 4. What this does NOT say

- **It does not say the graph is worthless.** It says the graph is not a token optimisation. It
  is a correctness and navigation tool: `AMBIGUOUS` with every candidate listed, `coverage
  partial 327-466`, `changes` with its risk reason, `cochange` from real history. Those are worth
  having on their own terms and they cost no model tokens to produce.
- **It does not condemn the engine work.** EW1–EW6 made the graph faster, honest about its gaps,
  and self-maintaining. `ctx <file>` went 727 ms → 458 ms and `impact` 631 ms → 397 ms. Those are
  real and they are measured.
- **It does not excuse the claim.** Every release doc that implied a pending token saving has
  been corrected to say the measurement was made and the saving is not there.

## 5. What would actually move the number

From the table in §1, in descending order of size. None of these is the code graph.

1. **The context prefix (~69% / ~58%).** Every turn re-writes a growing prefix. Compaction
   policy, shorter skill spines, and fewer agent definitions loaded per dispatch are worth more
   than every retrieval optimisation combined.
2. **Model output (18–29%).** Shorter returns, tighter report formats.
3. **`Bash` results (1.6% / 4.7%)** — bigger than `Read`, `Grep` and `Glob` together in the dev
   sessions. Build and test output is read whole, on purpose (the read-ladder exception). A
   summariser on build output would be worth more than the whole graph.
4. **`Read` (3.3% / 0.65%).** The read gate already targets this, and it is the only rung where
   the graph could plausibly help — by turning a whole-file read into a range read. Ceiling:
   0.1% of a session.

## 6. Recommendation

**Ship the code graph as opt-in, with no token-saving claim, and stop enhancing it for that
purpose.** The plan's own §11 names this as a valid outcome. The docs now say it plainly.

**Do not run the round 3 A/B as designed.** It would spend real money to measure an effect the
data puts at a tenth of a percent, on a fixture that cannot show it.

The one question still worth a live run is **whether Claude Code delivers `additionalContext` to
a subagent** (DE3). That is cheap, it is not a token question, and `eval/round3/` sets it up.

## 7. Reproducing this

```bash
node eval/graph-replay.js ~/.claude/projects/<project> <repo with a built graph>
node eval/graph-replay.js ~/.claude/projects/<project> <repo> --ceiling
```

It spends no model tokens. It is a COUNTERFACTUAL over real recorded runs: it measures the size
of the target, never whether an agent would have hit it. That is enough to answer this question,
because the target is too small to matter at any hit rate.
