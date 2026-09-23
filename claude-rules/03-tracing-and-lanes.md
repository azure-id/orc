# Behavior traces, lane registry and run hand-back

**Read: on demand** — read when touching traces, the trace hook, a lane's phase packets, `RESUME.md`, `orc stats`, or adding a lane.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **Behavior-trace logging is PERMANENT (always on) — no config key.** Every ORC
  run writes a `.txt` trace under `log_dir`; the `orc-trace.js` hook is the
  deterministic guarantee (it bootstraps `log_dir` + `.current` on the first
  dispatch — never rely on model memory for trace creation). Only `log_dir` is
  configurable. Every agent return carries `actual_model` (quoted, never
  guessed) + `actual_effort` so a silent tier downgrade is flagged — canonical
  procedure: `templates/skills/_shared/return-validation.md`. See
  `knowledge.md` §4b. **NARRATION IS DISPATCHED, NOT REMEMBERED (v0.32.0).** Two
  fixes that bet on the orchestrator appending rich lines both failed under load;
  the pen now belongs to the pinned `orc-trace-writer-haiku-4-5`. Every phase
  close builds a PHASE PACKET (`phase`, `events[] {ts, verb, tail}` with the
  events' REAL timestamps, and `decisions` — the WHY) and dispatches the writer,
  PAIRED with the next phase's first dispatch; the first packet is solo (it
  renames a hook-bootstrapped file) and the `FINISH` packet returns before
  `.current` is deleted. Build lanes send per-phase packets, orc-wiki one per
  scan-batch boundary, and EVERY single-dispatch lane exactly one end-of-run
  packet — that obligation lives ONCE in `references/trace-protocol.md`, so those
  micro-lanes are deliberately absent from the writer contract's token set.
  `/orc-retro` is the only non-narrating lane, and the hook now enforces it (no
  bootstrap, no SPAWN/RETURN for `orc-retro-*`). Traces are named
  `run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt`, and the hook segments every run with
  `PHASE-EDGE` lines so a fully amnesiac run still yields a phase-segmented,
  correctly-attributed skeleton. **Run start writes `.current` AND `touch`es the
  trace file in the SAME step (v0.34.2, lint token `touch the trace file`)** — a
  pointer naming a file that does not exist is indistinguishable from a dangling
  one, and that split 15 graded runs across two files each; the hook now also
  honors a pointer whose own mtime is fresh, so neither half depends on the
  other. Rename repair triggers on a DISK comparison (`.current` vs the packet's
  `run_meta.trace_path`) and is a MOVE, never a fresh create. `orc diy compile`
  stitches the trace block into EVERY compiled flow — tracing is not composable.
  A phase that ends with `zero new trace lines is
  a protocol violation`. The `` `CROSSLINK `` trace verb (peer-knowledge state) is
  pinned to `orc/SKILL.md` + `references/trace-protocol.md` +
  `references/wiki-consult.md`.

- **A lane the protocol declares must be a lane something OPENS (v0.42.0).** The
  QoL release makes traces load-bearing (`orc stats` counts from the filename +
  one `STATS lane=…` line), so a declared-but-unopenable lane is a permanent
  zero in every report. Three were found and fixed: `combine` is a PHASE inside
  the analyze run (context-combiner has no command and never bootstraps a run —
  its hard rule 10), `plan-handoff.md` was missing the `touch the trace file`
  half (now registered in that token), and `/orc-ultra` now writes
  `run-ultra-<slug>` instead of being counted as plain `/orc`. A payload-walking
  test in `test/hooks.test.js` fails on any lane in the enum that no skill writes
  a `run-<lane>-<slug>` pointer for — keep it passing. See `knowledge.md` §4z.4.0.

- **`_shared/interview.md` is the ONE interview mechanic (v0.42.0).** Design tree
  → frontier rounds → confirmation gate, and the split that matters: FACTS are
  ORC's to look up (wiki → pattern → gotchas → an ad-hoc read-only dispatch
  LAST), DECISIONS are the user's and the lane waits —
  `a lane that answers its own interview question` has broken the contract
  (registered token). `/orc-grill` runs it end to end; `intake.md` borrows its
  round format. Never fork a second copy into a spine. Every settled decision is
  tagged `intent` or `constraint`; constraints become `spec_invariants[]`, which
  is what makes the interview load-bearing. `/orc-grill` and `/orc-route` trace
  (one end-of-run packet each); **`/orc-explain` deliberately does NOT** — a
  stated blind spot in `orc stats --help`, not an oversight. Three new skills,
  **zero new agents** (the v0.38.0 precedent). See `knowledge.md` §4z.4.

- **`/orc-route` is PLAN-ONLY and reuses `plan-handoff.md`'s definition.**
  Routing from a plan is arithmetic; routing from a sentence is guessing, and a
  guess that looks computed is worse than no answer — so non-plan input is
  refused, never downgraded into a suggestion box. It must never define its own
  idea of "a plan": a second definition is drift the lint cannot see. The
  newcomer's "which command?" is `orc onboarding first-run`, not this.

- **`RESUME.md` existing IS the "run unfinished" flag (v0.42.0).** Written by ORC
  ITSELF (never a dispatched agent — a dispatch inside the stop sequence lets a
  stop fail because a subagent did) into `{run_dir}/{slug}/`, never the project
  root; always overwritten; **deleted at `FINISH` in the same step as
  `.current`**. Keep the `Where it stands:  /orc · phase X · wave K of N` shape —
  it is the one line `orc resume` / `orc run list` parse, which is how a listing
  never opens `checkpoint.json`. `orc run list` may only claim what the disk
  proves: `state-of-play.md` is written at a STOP, so its absence never means
  "incomplete".

