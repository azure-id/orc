# Reference — Phase-1 Preflight Report

One compact, user-visible block printed ONCE at Phase 1, after the planning
input is settled (wiki consulted, crosslink probed, waves computed at Phase 2 —
so print it at the point all inputs exist, typically end of Phase 1 / start of
Phase 3). This is **presentation only** — no new probes; every value is already
computed by the wiki consult (Change 3), the crosslink probe (Change 5), the
pattern resolve gate (Change 4), and wave grouping.

The point is that the four knowledge gates the run used to keep silent are now
always surfaced: the user always knows whether the run is grounded (wiki),
whose house style is in force (pattern), whether peer contracts are in play
(crosslink), where the trace is, and when the run will pause.

## Template

```
── run preflight ──
wiki:      FRESH — 12 docs consulted
pattern:   js cached · ts cached
crosslink: 2 boundaries (payments-api) — advisory
trace:     .claude/orc/logs/210726-1545-....txt
waves:     3 planned — will pause after wave 2 (batch_pause_every=2)
```

## Line rules

- **wiki:** the exact tier line from `wiki-consult.md` Step 1 (one of the four
  freshness tiers, `absent` included). Never omit — `absent` still prints.
- **pattern:** one token per resolved language (`<lang> cached` /
  `<lang> codifying` / `<lang> agnostic`), joined by ` · `. No FE/BE language
  in the run → `none (no FE/BE work)`.
- **crosslink:** the crosslink line from `wiki-consult.md` when a probe hit
  (`cached` or `configured-no-cache`); omit the whole line when crosslink is
  not in play (state `none`).
- **trace:** the run's `trace_path`.
- **waves:** `K planned — will pause after wave(s) [list] (batch_pause_every=N)`,
  or `K planned — no pause (run straight through)` when the user chose to run
  through / the schedule is empty.

The pattern and crosslink lines reuse Changes 4/5's already-emitted content — do
NOT recompute. If the pattern resolve gate has not run yet when the block is
printed, show the tagged languages as `pending resolve` rather than delaying the
block.
