# RESUME — `orc graph` v1.8.2 build

Paste this into a fresh session:

> Read `code-graph-notes/RESUME.md` and follow it. Invoke no skills.

---

## Where this is — W9 DONE, ready to commit (21-09-2026)

Executing `code-graph-notes/06-IMPROVEMENT-PLAN.md` on branch **`feat/orc-graph-2`**.
The live record is **`CHECKPOINT-1.8.2.md`** (waves, every decision in force, the
staging list, both pause gates). The 1.8.0 build's history is `CHECKPOINT.md`.

| Wave | Status | Evidence |
|---|---|---|
| W0 fixtures + spike | DONE | `findings/W0-fixtures.md` |
| W1 ROUTE edges | DONE | `findings/W1-W2-edges.md` |
| W2 aliases · inheritance · barrels · mask · ignore · S2 · S3 · migration | DONE | same file — **38/38 answer-key rows resolve** |
| — PAUSE 1 — | done | `npm test` 1039/1039 |
| W3 D1 `--source` · D2 `--for-slice` · D3 hook · D5 one-call update · legend · footer · template trim | DONE | `findings/W3-delivery.md` |
| W4 N1 doc notes · N2 `--with-source` · N3 batching | DONE | `findings/W4-W4b-notes-and-gain.md` — **DE-D not taken** |
| W4b K the gain meter | DONE | same file · NEW `bin/graph-gain.js`, `orc graph gain` |
| PAUSE 2 | done | `npm test` 1077/1077 |
|  |  | one stale golden was found and regenerated at that pause: `test/goldens/diy-compile-default.md`. Regenerate it with `orc init` → `orc diy init` → `orc diy compile` into a temp dir, normalising `> compiled:` and `orc payload:` the way `test/goldens.test.js` does. |
| W5 G6 five languages (rb · rs · kt · vue/svelte · c/cpp) | DONE | `findings/W5-languages.md` — **9 fixtures, 86 key rows, 0 FAIL** |
| W6 G7 borrowed TypeScript + Go | DONE, gate not met — **SETTLED: option A, ship ON** | `findings/W6-borrowed.md` |
| PAUSE 3 | done | `npm test` 1085/1088 |
| W7 D4 `orc graph map` | DONE, **M2 gate not met → DE-H (b), planner only** | `findings/W7-map.md` |
| W8 S1 sharded reads | DONE, **gate MET** — 577 cards compared, 0 different; 881 → 480 ms | `findings/W8-shards.md` |
| PAUSE 4 | done | `npm test` **1096/1099, 0 failed** · 206 contracts · check.js 0 FAIL · gate table in `CHECKPOINT-1.8.2.md` |
| W9 docs + release | DONE | CHANGELOG · README · README-id · `guides/configuration.md` · `knowledge-parts/05` §4z.30 + the `knowledge.md` router row · `claude-rules/04` · `CLAUDE.md` · `templates/hooks/README.md` · version 1.8.2. `npm run verify` + `npm test` green |
| the commit | DONE | `0b3f096` — 75 files, package/payload/doc/test only. `orc-ui-wiki.md` staged on the user's yes. NOT pushed. |

**The build is COMPLETE and committed** as `0b3f096` on `feat/orc-graph-2`.
Nothing is pushed; push only when the user asks. `mock-run/` needed no change (no mocked run mentions
`orc graph`), and M3 round 4 was not run — the token matrix is closed by
`findings/EW8-TOKEN-VERDICT.md`.

## The two gates that were missed, and what each one cost

**W6 — the borrowed TypeScript and Go rungs. SETTLED 21-09-2026: the user chose
option A, ship ON.** The ≥ 10-point confident-rate gate measured +1.0 (nest),
−0.3 (vuejs/core), −0.3 (hugo). The gate measured the wrong thing: the confident
RATE is pinned by calls into external packages, which no parser can resolve.
What moved is INVENTED edges — `UNIQUE` guesses fell 36–40% and `IMPORT` facts
rose. No `code_graph_borrow` key was added; `ORC_GRAPH_NO_BORROW` stays the
escape hatch. **W9 MUST say in the CHANGELOG that the gate was missed and that
the metric was wrong, with the numbers.**

**W7 — the M2 gate. NOT met, and the plan had already chosen the fallback.**
M2 measured **0.39** answerable planning calls per main window against a gate of
**≥ 3**. DE-H names its own branch on that number — "(a) planner + analyst +
quick if M2 shows ≥ 3; else **(b) planner only**" — so `orc graph map` ships
wired to PLANNING ONLY. The analyst and `/orc-quick` wiring was built and then
removed. **This needed no user decision; the plan had made it.** The honest
caveat, recorded and deliberately NOT acted on: the fixture transcripts come
from an eval sandbox driving lanes over a fourteen-file Express toy, where a
planner has nothing to sweep. Re-measure on a real repository in a later
version.

## The one thing W4 did NOT deliver

**DE-D — the Haiku noter.** `orc-graph-noter-haiku-4-5` and the
`code_graph_notes_model` key are NOT built. The plan gates them on a blind
30-symbol comparison that costs real model tokens and has not been run. Shipping
an unvalidated model behind a user-facing key is what that gate exists to
prevent. The protocol is in `findings/W4-W4b-notes-and-gain.md`; the default was
`sonnet` and still is. **Ask the user before spending tokens on it.**

## Two plan figures that measurement proved wrong (do not repeat them)

- **N1 doc share.** The plan expected > 60% of django symbols to carry a `doc`.
  Measured: **19.9%** overall, **30.6%** of non-test source; nest 7.1% / 9.0%.
  The extractor is correct (verified by hand). The CHANGELOG must quote the
  measurement, never the estimate.
- **The hook's 150 ms p95 gate.** Measured 384 ms wall on django — of which
  **303 ms is a bare `node -e 0` on this machine**. The hook's own work is
  ~70 ms. No Node hook can meet 150 ms wall here; it is the same wall the W0
  DE-I spike hit.

## How to check where the engine stands

```bash
node eval/fixture-graph/check.js          # 0 FAIL is the W1/W2 gate (baseline was 37 FAIL of 38 rows)
node --test test/cli/graph*.test.js test/hooks/graph-hook.test.js   # the graph suite
npm run verify && npm test                # green at every pause (npm test ≈ 9 min)
node eval/fixture-graph/engine-compare.js <repo> %TEMP%/orc-181     # 1.8.1 vs working tree on one repo
node eval/fixture-graph/check.js --ts %TEMP%/tsdl   # the same 86 rows against the BORROWED TypeScript rung
node eval/fixture-graph/lang-coverage.js <repo>     # W5: per-language partial rate (delete .claude/orc/graph first)
node eval/fixture-graph/borrow-compare.js <repo>    # W6: borrowed vs ORC_GRAPH_NO_BORROW on one repo
node eval/fixture-graph/shard-diff.js <repo> 400   # W8: the byte-identical gate (exit = cards that differ)
node eval/graph-replay.js ~/.claude/projects/C--dev-orc-eval <repo> --calls   # M2
ORC_TEST_TS_DIR=%TEMP%/tsdl node --test test/cli/graph-borrow.test.js   # the 2 TS tests that otherwise SKIP
```

The W5/W6 measurement clones live in `%TEMP%/orc-w5/` (rubocop · jekyll · tokio ·
ripgrep · ktor · primevue · core-vue · svelte-svelte · redis · abseil-cpp ·
hugo) and a bare TypeScript install in `%TEMP%/tsdl/`. All scratch; re-clone at
`--depth 1` if lost, and `npm i typescript@5` in an empty folder for `tsdl`.

The saved 1.8.1 engine files are in `%TEMP%/orc-181/`; the django clone is
`%TEMP%/orc-round3/django`, the nest clone `%TEMP%/orc-nest`. They are scratch;
regenerate the 1.8.1 files from `git show main:bin/graph*.js` if lost. Both
clones now hold a 1.8.2 index built with `doc` notes and `wide.json`.

## To continue with W9

1. Read `CHECKPOINT-1.8.2.md` (decisions in force — they are binding) and plan
   §8.
2. **W9 is docs + release.** Nothing is built after this. The staging list and
   every piece of doc debt are in `CHECKPOINT-1.8.2.md` under "Files touched so
   far" — README, README-id, CHANGELOG, `guides/configuration.md`,
   `knowledge.md` + `knowledge-parts/05`, `claude-rules/04`, the `CLAUDE.md`
   layout lines (which must gain `bin/graph-map.js` and `bin/graph-shard.js`),
   `templates/hooks/README.md`, the `mock-run/` graph lines, and the
   `package.json` bump (`npm version patch` → 1.8.2, DE-A).
3. **Two things the CHANGELOG must not get wrong.** The W6 borrow MISSED its
   gate and ships anyway on the user's call — say so. The W7 map is wired to
   PLANNING ONLY because M2 measured 0.39 against a gate of 3 — say so. The W8
   numbers are MEASURED and may be quoted flat: 881 → 480 ms whole call,
   361 → 50 ms in process, 577 cards compared with 0 different, 30 MB of shards
   on django.
4. Then ONE commit, package/payload/doc/test files only. **Ask before staging
   `orc-ui-wiki.md`.** Never push unless the user asks.

## Rules in force

- Branch `feat/orc-graph-2`. Never commit on `main`. **Never push unless the user asks.**
- No commit until W9; then ONE commit with only package/payload/doc/test files.
  Never stage `code-graph-notes/`, `eval/`, `result.md`, `test.md`, the other
  `*-notes/` folders, `promo-animation/`, or the user's pre-existing edits to
  `.gitignore` and `test/docs.test.js`. `orc-ui-wiki.md` IS ours now (W4b edited
  it) — check with the user before staging it, it was untracked before this build.
- `npm run verify` + `npm test` green at every pause. Docs (README, CHANGELOG,
  knowledge, guides) are W9's; a pause does not need them.
- ASD-STE100 Simplified Technical English in every doc.
- Do not edit files a running `npm test` loads.
- `test/goldens/graph-1.8.1/` is frozen; never regenerate it.
- **A heredoc in this environment eats backslashes.** Write a `.py` file with the
  Write tool and run it, rather than piping python through `bash <<'PY'`, for any
  edit containing `\n`, `\d` or a regex. Three edits were corrupted this way.

---

## History — the 1.8.0/1.8.1 build (old resume text)

Every wave W0–W9, EW0–EW8 of the 1.8.0 build is complete and released (1.8.0,
then 1.8.1 for the Windows-only guard). Round 3 (`findings/R3-results.md`)
found the one defect this 1.8.2 plan exists for: a card is silent about a
caller that reaches a symbol through a URL. The release claim stands — the graph
is a correctness and navigation tool, never a token saving
(`findings/EW8-TOKEN-VERDICT.md`). Do not re-run the S1/S2/S3 token matrix.

---

## A tooling lesson from this session, worth not repeating

**Never pipe `npm test` through `tail`.** It cuts off the runner's
failure-only report — the only place the failing test is named — and it
replaces the runner's exit code with `tail`'s, so a red run reads as exit 0.
`bin/test-run.js` returns 1 correctly. Run it bare and read the tail of the
captured file instead.
