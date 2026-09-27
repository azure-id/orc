# Habits, gotchas v2 and the reviewer v2 (v2.0.0)

**Read: on demand** — read before touching `bin/habit.js`, `bin/gotcha.js`,
`bin/gotcha-import.js`, `bin/run-undo.js`, `templates/hooks/orc-session-hook.js`,
`_shared/habits.md`, `_shared/gotchas.md`, `_shared/review-slice.md`, the
reviewer agent, any `(H <qid>)` mark, or a spine near its byte cap.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.
> Detail: `knowledge.md` §4z.34 → `knowledge-parts/*` §4z.34.1 – §4z.34.8.

## Habits — off by default, never applied without a yes

- **`habits: off` is the default and costs ZERO bytes.** Under off,
  `orc lane config --json --no-probes` is byte-identical to 1.9.2: no `habits{}` key, no
  `learned` rank state, the four `HABIT_KEYS` absent from `not_read`. No lane
  writes an `ASK` line. A test pins every 1.9.2 field (`FIELDS_192`). Never add
  a habits field, line or read that exists while off.
- **There is no automatic level.** Modes are `off` · `observe` · `propose`.
  `auto` is refused by name, and there is ONE threshold (propose). Never add an
  "act" threshold or a mode that applies a habit without the user's yes (DE-4).
- **A habit moves only toward the careful side.** An `apply` point learns a key
  only to its `careful` value (`review_before_push: on`, `mini_tdd: on`,
  `quick_update_tests: on`). A `suggest` point only orders the offer.
  `fast.f0.stale-wiki` never suggests `continue` (`never_option`). A dispatch
  gate is asked EVERY time; a habit fills only its `→ suggested` line.
- **The rule is CLI data, not config.** `HABIT_RULE` and `ASK_POINTS` live in
  `bin/habit.js`. `/orc-retro` may move a number from evidence; nobody tunes one
  by feel.
- **The registry is two-way.** Every `(H <qid>)` mark in `templates/**` has an
  `ASK_POINTS` row with the right `file`, and every row has a mark
  (`test/cli/habit-registry.test.js`). Add or move a question → update both.
- **Never store the user's words.** An answer in the user's own words is
  `chose=other`. Nothing is guessed from old `NOTE` prose (no backfill).
- **User data survives everything.** `habits-state.json`, `habits-cache.json`,
  `observations.jsonl`, `gotchas-sync.json` are never in the install manifest
  and survive `update`, `update --prune` and `doctor --fix`.

## Gotchas v2 — always on for review

- **Review learning is always on.** `orc gotcha card` never exits 4.
  `gotcha_card_budget` is a SIZE (min 200, lower refused by name), never an off
  switch. An entry that does not fit is COUNTED, never dropped in silence.
  `match` still exits 4 under an old `gotchas: off` (DE-27).
- **ONE writer** of `observations.jsonl`: `recordObservations` in
  `bin/gotcha.js`. Every importer and every lane goes through it.
- **`orc gotcha filter` never removes a P0 or a P1.**
- **The importers never write to GitHub.** `SONAR_TOKEN` comes from the
  environment only — never a config key, never printed. Bot and ORC-reviewer
  findings are measured, never mined into an entry.
- **A v1 file stays valid, and 1.9.2 reads a v2 file.** Add a field only as an
  OPTIONAL field after the nine that exist, and keep the downgrade test green.

## Reviewer v2

- **The slice field set has one canonical line** in `_shared/review-slice.md`.
  Only the carriers (review-slice.md, `orc-review-verify/core.md`, the reviewer
  agent) spell it; every other surface points. A payload test checks that the
  carriers are identical. Change the set → change every carrier in one commit.
- **`category`, `scenario` (P0/P1) and `pre_existing` are REQUIRED** in the
  return. A return without them is malformed. The disprove pass is `/orc` and
  `/orc-ultra` only.
- **Every review close records its outcomes** and writes ONE
  `FINDING-OUTCOME` line. `/orc-quick` takes part (DE-22), on purpose.

## `orc undo`, flaky, the session hook

- **`orc undo` PRINTS by default** (S6). Only `--apply` changes a file. It
  reverts ONLY the files the run changed, back to `orc run snapshot`, and it
  skips a file edited after the run's last write. Never make it apply by
  default.
- **A flaky re-run does not use a repair round** (`_shared/smoke-gate.md`
  §Flaky). It writes `GATE flaky`.
- **`orc update` always wires the session hook**: ONE `Stop` entry and ONE
  `SessionStart` entry (matcher `compact`). The `Stop` hook reads `notify`
  first and is silent unless `notify: bell` (DE-18, the read-gate rule). It
  rings only in the main session and only when the run moved.

## Byte caps — the no-growth rule

- **A coding spine is at most 16,384 bytes (LF)** (`BUDGETS`, 15 spines).
  `orc-mini` and `orc-quick` are close to the cap. Do not raise a cap: move the
  text to an on-demand file.
- **No lane's always-loaded total may go above its W1 value** (the table in
  `CHANGELOG.md` v2.0.0). New text goes on demand: `_shared/habits.md`,
  `_shared/review-slice.md`, `_shared/lane-contract.md`,
  `_shared/phases/trace-verbs.md`. `when: "always"` is only for preflight and
  trace (and test).
- **The trace verb set is closed** (`TRACE_VERBS`). A new verb is a row in the
  registry, in `trace-verbs.md` and in the lane's `trace_verbs`; the lint
  checks all three.

- **THE HABITS POINTER LIVES IN THE STEP THAT READS `habits{}` (v2.0.1).** A lane
  treats a lane-contract block as reference, not as a step: a live `/orc-quick` run
  with `habits: propose` got `habits{}` and wrote no `ASK`. The rule sits in quick
  Q0 step 1, mini Phase 0 and `_shared/phases/preflight.md` step 1. Never move it
  back into a reference block. **`orc trace write` shapes each event from its OWN
  grammar** (`bin/trace-write.js` `shapeEvent()`): tail aliases, the ` :: ` split,
  the tail-only join, and a refusal by name when a head argument is missing — so a
  lane can never write `GATE :: …` again.
