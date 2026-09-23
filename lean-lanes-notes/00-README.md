# Lean lanes — `/orc-quick` and `/orc-mini` for v1.9.0

Written 19-09-2026 in Simplified Technical English. This folder is a working
note. It is never staged and never committed (the same rule as
`code-graph-notes/`, `read-gate-notes/` and `usage-gate-notes/`).

> **Status: W0, W1, W2, W3 and W4 are BUILT (21-09-2026), on branch
> `feat/lean-lanes-1.9`, uncommitted — the release is ONE commit at W5.**
> Decisions DE-1 … DE-14 (`02-PLAN.md` §10) were taken as RECOMMENDED. Next up:
> **W5** (docs, UI, release, eval). Version target: **1.9.0**
> (`npm version minor`).
>
> Findings: `findings/W0-baseline.md` · `findings/W1-trim.md` ·
> `findings/W2-plumbing.md` · `findings/W3-quick.md` · `findings/W4-mini.md`.
>
> At the pause: `npm run verify` green — **40 skills · 51 agent files · 208
> contracts**. `npm test` — **1110 passed · 0 failed · 1113 tests · 74 files**
> (W2 baseline 1105 / 1108). Spines **quick 325 / 325** and **mini 280 / 280**,
> both AT their pin. The mini pin was raised 270 → 280 with its comment, which
> DE-9 allows.
>
> **Three things W3/W4 changed in the plan.** (1) `references/look.md` may not
> name `orc graph impact` — the lint derives a lane's call set from its WHOLE
> skill folder, and quick's catalogue deliberately has no `graph-impact` row.
> (2) `orc graph gain` had to be catalogued here, because two lanes now name it.
> (3) Both lean lanes LEFT the `graph-notes-pending` row: each runs
> `update --notes-pending` instead, which answers both in one call. Details in
> `findings/W3-quick.md` §3 and `findings/W4-mini.md` §3.
>
> **W2 §3 still stands**: the catalogue's `lanes[]` is DERIVED from the payload
> by the lint, so a row can never be widened before the payload asks the
> question.

## What this plan assumes

`code-graph-notes/06-IMPROVEMENT-PLAN.md` is **already executed** as v1.8.2. So
these exist when this plan starts:

| From 1.8.2 | Used here by |
|---|---|
| `ROUTE` edges (a URL literal → the route symbol), mounts, decorator routes | Q1 blast radius · Q4/M5 affected tests · the recon agent |
| instance aliases, inherited members, barrel re-exports | every `ctx` and `impact` answer these lanes read |
| `orc graph ctx … --source [N]` | the recon agent (a caller's range in one call) |
| `orc graph ctx … --for-slice <files>` | the executor slice in both lanes (the outside view) |
| `orc graph map [--focus …]` | Q1 when the request names no file · M2 the planner slice |
| `orc graph update --notes-pending` | Q3 and M5 (one call at the close, not two) |
| `orc graph gain` + one ship line per code lane (DE-M b) | Q3 entry close · M5 smoke-gate close |
| doc notes, `notes pending --with-source` | the noter batch both lanes dispatch |
| `code_graph_ignore` | nothing here reads it — the CLI does |

Every place this plan uses one of them names it. `02-PLAN.md` §7 says what to
do if one of them did not ship.

## The files

| File | What it holds |
|---|---|
| `00-README.md` | this index, the rules in force, the baseline, how to resume |
| `01-research.md` | the evidence: measured numbers, the graded runs, defects found by reading, outside references |
| `02-PLAN.md` | the plan: the design in one screen, waves and gates, decisions, files, tests, docs, risks, compatibility, the eval round |
| `03-orc-quick-spec.md` | the new `/orc-quick` behaviour phase by phase, exact line formats, the recon agent contract, the `repro` field |
| `04-orc-mini-spec.md` | the new `/orc-mini` behaviour phase by phase, the complexity line, the planner slice, the smoke-gate delta |
| `05-trim.md` | the description and spine trim: before/after text with counts, the pinned tokens per file, the budget arithmetic |

## Rules in force while this plan runs

- Work on a branch (`feat/lean-lanes-1.9`). Never commit on `main`. Never push
  unless asked.
- Never stage this folder, `result.md`, `test.md`, `caveman-notes/`,
  `code-graph-notes/`, `read-gate-notes/`, `usage-gate-notes/`,
  `promo-animation/`, `eval/`, or the user's pre-existing edits to `.gitignore`
  and `test/docs.test.js`.
- Read `claude-rules/00-guards-and-release.md` before any edit under `bin/` or
  `templates/`. Read `claude-rules/05-build-lanes.md` for mini and
  `claude-rules/06-standalone-lanes.md` for quick. Read `claude-rules/07-orc-ui.md`
  and `orc-ui-wiki.md` before W5 touches the UI fixture.
- Pause after every two waves. `npm run verify` and `npm test` are green at
  every pause.
- Every file under `templates/skills/orc-quick/` stays in simple English for
  non-native readers. Every doc uses ASD-STE100.
- The generated executor files are never hand-edited. Edit
  `agents-src/executor.template.md`, then run `npm run build:agents`.
- A contract token moves only with its row in `bin/verify-contracts.js`, in
  the same commit. `05-trim.md` §4 lists the 25 tokens pinned to the quick
  spine and the 42 pinned to the mini spine (derived from the lint table on
  19-09-2026; the lint was green at 192 contracts).
- The four `## Q0` … `## Q3` headings in `orc-quick/SKILL.md` are named
  byte-for-byte in `LANE_OWN_PHASES` (`bin/cli.js`). A heading changes only
  with that table, in the same commit.
- One commit at the end, with only package, payload and doc files.

## Baseline (measured 19-09-2026 on the 1.8.1 tree; W0 re-measures on 1.8.2)

| Measure | Value |
|---|---|
| `npm test` | 1022 passed · 0 failed · 65 files (code-graph-notes/06 §8) |
| `orc-quick/SKILL.md` | 379 lines · **no spine budget pin** |
| `orc-mini/SKILL.md` | 268 lines · budget **270** (2 lines of headroom) |
| `orc-quick` description | 619 chars (~155 tokens) |
| `orc-mini` description | 493 chars (~123 tokens) |
| all 33 skill descriptions | 22,496 chars (~5,600 tokens), loaded into every session |
| the rules card in a quick slice | 13,874 chars (~3,470 tokens), on every dispatch, re-sent every executor turn |
| a file card (`ctx`, this repo) | ~170 tokens |
| `templates/commands/orc-quick.md` | 1,667 bytes (mini: 587) |
| a graded `/orc-quick` run, graph on (W9 s1-on-1) | 1.59M tokens · 43 tool calls · 16 main turns · 2 dispatches |
| a graded `/orc-mini` run, graph on (W9 s2-on-2) | 4.55M tokens · 93 tool calls · 5 dispatches for ONE task |

## How to resume in a fresh session

1. Read this file, then `02-PLAN.md` §8 (waves) and §10 (decisions).
2. `git log --oneline -8` and `git status --short` say which wave is done.
3. Run `npm run verify` and `npm test`. Both must be green before the next wave.
4. The spec files (`03`, `04`, `05`) hold the exact text to write. Do not
   re-derive it from the spines.
5. **`bin/cli.js` is CRLF; everything else is LF, and there is no
   `.gitattributes`.** Read and write it as BYTES, or a text-mode rewrite turns
   a two-line edit into a 90,000-line diff (`findings/W3-quick.md` §4).
