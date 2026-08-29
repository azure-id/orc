# Phase — Preflight   (id: `preflight`)

> **Library file.** New at v1.0.0 W11, distilled from the eleven lane preflight
> sections that had independently converged on the same four steps in the same
> order. Layers: `core` (every lane with a silent preflight) and `full`
> (`/orc` and `/orc-ultra`, whose preflight also PRINTS a report).
>
> **What is NOT here:** the probes themselves. Which artifacts a lane probes, and
> which config keys it reads, are the lane's own — they are in the lane's spine
> and in `orc lane config <lane> --json`. This file is the SHAPE: the order, and
> the four rules that make the shape worth having.

<!-- orc:layer core -->

## The order is the contract

Four steps, always in this order, and a lane adds its own probes to step 3 —
never a fifth step before step 2.

1. **Config.** Resolve every key this lane reads through **one** resolver:
   `orc lane config <lane> --json`. Never merge `.claude/orc.config.yaml`
   yourself. Print every line of `announce[]` VERBATIM — *a shadowed setting must
   never be silent*, and a lane that resolves silently cannot tell the user why
   the thing they configured did not happen. Precedence, gates, inertness and the
   CLI-absent floor are all in `../config-precedence.md`.

2. **Trace.** Write `log_dir/.current` = `run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`
   AND `touch the trace file` of that name in the SAME step. **Both, or neither.**
   A pointer naming a file that does not exist is indistinguishable from a
   dangling one — that split fifteen graded runs across two files each. The rest
   of the protocol is `trace.md`.

3. **Probes.** Use `../detecting-artifacts.md` — **never a raw `find`**, because
   `.claude/` is hidden and a filesystem search false-negatives a real artifact
   from the wrong CWD. Every probe is a documented exit-code contract, listed
   once in `orc lane calls <lane>`. Treat a positive probe as the source of truth
   and never second-guess it.

4. **One line each.** Print one line per probe, per resolved gate, per tier.
   **A probe whose answer is silent is a probe that gets skipped** — by the next
   maintainer, and eventually by the model. An empty result is an ANSWER and
   still gets its line.

## The four rules

- **Preflight is SILENT in the sense that it asks nothing** — it prints, it never
  interviews. A question in preflight is a question asked before the lane knows
  enough to ask it well.
- **Nothing here stops a run unless the lane's own spine says it does.** Most
  lanes treat missing knowledge as a helpful extra: it means more of the work is
  a question instead of a lookup. `/orc-fast` is the exception, and it says so.
- **ONCE per run** (`/orc-quick`: once per session). A preflight that re-runs is
  a preflight nobody reads.
- **An exit code is an answer, not a failure.** `orc pact status` exit 3 is "no
  ledger yet, this is a first run"; `orc gotcha status` exit 1 is an empty
  ledger. Say what it means, not that it failed.

<!-- /orc:layer -->

<!-- orc:layer full -->

## `/orc` and `/orc-ultra` — preflight also REPORTS

The full lane's preflight does everything in `core` and then prints the
**preflight report**: tasks · waves · estimated subagents · model mix · the wiki
tier · the resolved pattern · crosslink state · the pause schedule · the run
budget. That format, its `GATE budget stop|pass` line and the FLOOR rule (repairs
push the real count up, never down) live in the `orc` skill's own
`references/preflight-report.md` — read it relative to that skill. It has ONE
consumer, so it stays home rather than moving here.

A trimmed lane must **not** read that file. `orc-mini` and `orc-fast` print their
resolved lines and go; there is no forecast to report because there are no waves
to forecast.

<!-- /orc:layer -->
