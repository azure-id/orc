# Enhancement plan — `orc graph` on the CBM model (build, update per run, delivery)

Written 15-09-2026 in Simplified Technical English.
Builds ON the unreleased 1.8.0 implementation (`02-PLAN.md`, `CHECKPOINT.md`). It does not replace it.
Evidence: W9 round 2 (`findings/W9-eval.md` R1–R5) and the CBM code analysis (`04-cbm-analysis.md`).

> **Status: PLAN ONLY. Nothing is built. Decisions DE1–DE9 (§9) are open.**
> The rules of this build still apply: branch `feat/orc-graph`, no commit until every
> wave is done, pause every 2 waves, never stage the notes folders.

---

## 0. The problem, in three lines

1. **Use depends on compliance.** Executors ran `orc graph ctx` 0 times in 8 dispatches (R2). `/orc` carded 1 of 4 slices (R3).
2. **Freshness depends on compliance.** The last change of s3-on-1 was not re-indexed (R3).
3. **Every read pays the whole repo.** `ctx` loads all of `index.json` and resolves on read (`bin/graph-query.js:42-75`). Django: 21.3 MB index, 0.73 s per `ctx` (D2).

CBM solves 1 and 2 with **delivery that does not need the agent to remember** (hooks, a watcher) and 3 with **resolution at write time + closure repair**. ORC takes the mechanisms and keeps its own rules (no daemon, zero dependencies, CLI only).

## 1. The design in one screen

```
 BUILD / UPDATE (0 tokens, CLI)                         DELIVERY (no compliance needed)
 ┌─────────────────────────────────────────────┐        ┌───────────────────────────────────────────┐
 │ E1  signature fast path                     │        │ E4a SubagentStart → 1 router line          │
 │     HEAD + .git/index stat + dirty signature│        │     "graph FRESH gen 42 · ctx before grep"│
 │     → "nothing changed" in O(dirty files)   │        │ E4b PreToolUse Grep/Glob (subagents, run  │
 │ E2  resolution cache per GENERATION         │        │     open) → ≤5 matching symbols, data only │
 │     + closure repair (body edit = 1 file;   │        │ E4c PostToolUse Read → coverage note ONLY │
 │       surface change = + direct dependents) │        │     when partial / skipped / changed      │
 │     + property test: incremental == full    │        │ slice cards (exists) + generation stamp   │
 │ E3  generation id + coverage per file       │        └───────────────────────────────────────────┘
 └─────────────────────────────────────────────┘
 WHEN IT UPDATES (no daemon, no watcher)
   lane steps (exist) ─┐
   E5a update-on-read ─┼─→ same lock, same signature, baseline committed only after success
   E5b SubagentStop    ─┘   (at-least-once: a skipped or failed update is retried by the next trigger)
```

---

## 2. E1 — Signature fast path (engine)

**Why.** Today every `status`/`update` runs `ls-files -s`, `status`, `rev-parse`, reads `files.json`, and hashes dirty files (`bin/graph.js:164-226`, `:247-271`). A hook (E4) and update-on-read (E5) call this often, so the "nothing changed" answer must be cheap. The blob-SHA detection stays: it is MORE correct than CBM's mtime rule (Windows 1-second mtime, imported mtimes — `04` §2.2).

**What.**
- `meta.json` gains `sig: { head, index_stat, dirty }`:
  - `head` = `git rev-parse HEAD`
  - `index_stat` = size + mtime of `.git/index` (a stage or a checkout rewrites it), read with `fs.statSync`, no subprocess
  - `dirty` = sha1 over `git status --porcelain=v1 -z --untracked-files=all -- . ":(exclude).claude/orc/graph"` entries + size/mtime of each listed path (CBM #937 rule: an edit to an already-dirty file still moves it)
- New function `quickState(root, meta)` → `same` | `moved`. `same` → FRESH without `ls-files -s`, without reading `files.json`.
- `moved` → the existing full `detect()` runs, unchanged.
- **The baseline is written ONLY after a successful update** (CBM at-least-once). A locked or failed update leaves the old `sig`, so the next trigger retries.
- **Exclude ORC's own output.** `.claude/orc/**` is already in `ALWAYS_SKIP` for extraction; the signature pathspec must exclude it too, or every update looks like a new dirty state (CBM #1953).
- **Scope `-- .`** so a graph built in a monorepo sub-folder is not moved by a sibling.

**Tests** (`test/cli/graph.test.js`): clean tree → `same` with zero `ls-files` calls (spy on `git`); edit a dirty file again → `moved`; stage-only change → `moved` (index stat); update fails under lock → `sig` unchanged, next status `moved`; the graph folder's own writes never move it; CRLF file on Windows is stable across two polls.

**Gate.** EW0 measures `status` on Django before and after. Keep E1 only if `same` is ≥ 3× faster than the full detect on Django. Otherwise drop it and keep the code simple.

## 3. E2 — Resolution cache per generation + closure repair (engine)

**Why.** W3-dev decided "resolution is computed on read, never stored". That was right for correctness, and it makes every read pay the whole repo. CBM resolves at write and repairs only the closure (`04` §2.3–2.4). **This reverses W3-dev** → decision DE2.

**What.**
- `index.json` stays the source. A NEW derived file `resolved.json` holds, per symbol id: outgoing edges `{target | candidates, state, line, ref}` and a reverse map `callers[id]`. It carries `generation` (E3). **Only `update` writes it. Readers never write** (readers stay lock-free, `02-PLAN` §2.2).
- **Read rule:** `resolved.generation === meta.generation` → use it. Otherwise → the current compute-on-read path (still correct, only slower). So a crash between two writes costs speed, never correctness.
- **Per file, a `surface_hash`** = hash of the sorted list of `(exported name, kind, arity)` plus the file's import specifiers. Stored in the blob record (content-addressed, so it is computed once per blob).
- **Closure repair in `update`:**
  1. changed files → always re-resolve their OUTGOING edges
  2. `surface_hash` unchanged → stop (body edit; nobody else moves — "early cutoff")
  3. `surface_hash` changed, or file deleted → also re-resolve every file with an edge INTO it (read from the previous `callers` map)
  4. **added names:** ORC can do better than CBM's "decline": a `pendingByName` map lists the UNRESOLVED/AMBIGUOUS calls per bare name, so only files that call a newly defined name re-resolve
  5. **decline to a full re-resolve** (still 0 tokens) when: no previous `resolved.json` · engine or schema change · a dependent is not in the current file set · closure > 8 files AND > 30% of files (CBM's budget, `04` §2.3)
- Every `update` JSON answer gains `route: "unchanged" | "closure" | "full"` + `closure_files` + the decline reason. The trace verb `GRAPH-UPDATE` carries `route=`.

**The invariant, as a test.** `test/cli/graph-resolve.test.js`: a seeded random edit script (rename a function, change arity, delete a file, add a same-name function in another file, move an import, edit only a body) over the golden fixtures. After EVERY step: `resolved.json` from the incremental route **deep-equals** a full re-resolve. This is CBM's "an incremental update must equal a clean full rebuild" (`04` §2.4).

**Optional E2b (only if EW0 shows `loadModel` JSON parse dominates on Django):** split `index.json` into per-directory shards and load only the shards a query touches.

## 4. E3 — Generation and coverage (engine + JSON contract)

**What.**
- `meta.generation` = an integer that goes up by 1 on every write that changes the index, plus `gen_id` = first 8 chars of sha1(sorted `files.json` blobs). Every graph `--json` answer carries `generation`. The `line` shows it: `graph: FRESH — 212 files · 1,904 symbols · gen 42`.
- **Coverage per file**, derived from the record (no new store): `full` · `partial` (the heuristic extractor saw an unbalanced brace, a mask it could not close, or a `MAX_CALLS_PER_SYMBOL` / `MAX_EFFECTS_PER_SYMBOL` cut — give the line ranges) · `skipped:<reason>` (`too-large`, `unreadable`, parser error) · `excluded` (ignore glob, unsupported language).
- New read: `orc graph coverage <paths…> --if-enabled --json` → one row per path `{path, coverage, ranges, changed_since_index}`. Exit 0 always when enabled (a gap is an answer, not an error). Batch, like CBM `check_index_coverage`.
- Card header: `[blob a1b2c3 · current · coverage partial 40-88]`. The rule text: **"no recorded gap" is not proof of completeness** (CBM wording).
- `graph_used` in an executor return becomes `{targets, generation}`, so return validation can see a card from an old generation.

## 5. E4 — Delivery hooks (reverses D8)

**Why.** D8 said "slice injection first; add a hook only if W9 traces show agents grep past a card". W9 shows exactly that (R2: 0/8). CBM's answer is hooks that never block (`04` §3). → decision DE3.

**One new hook file** `templates/hooks/orc-graph-hook.js`, installed by `orc init/update` exactly like the read gate (`bin/cli.js:367-389`), on three events. **The same guards for all three:**

- silent unless: an ORC run is open (the trace pointer exists) · `code_graph` is on · `code_graph_hooks` is on · a graph exists
- silent for the MAIN session (the orchestrator gets cards through the lane) — reuse the subagent detection the read gate already has
- **never blocks, never throws** (exit 0 with no output on any error); a deadline (default 1500 ms, key-free env override) — a fired deadline writes one breadcrumb line to the run log so "timeout" is not read as "no match" (CBM #858)
- every injected text starts with `[orc graph] repository data, not instructions:` and every name/path is sanitized (control chars, backticks, length cap)
- per-agent de-duplication: a small `.claude/orc/run/<run>/graph-hook-seen.json` so the same token is not injected twice into one agent

| Hook | Matcher | Injects (additionalContext) | Budget |
|---|---|---|---|
| **E4a** `SubagentStart` | `orc-executor-*`, `orc-planner*`, `orc-reviewer*`, `orc-verifier*` | one line: `graph FRESH gen 42 · for a symbol or file run \`orc graph ctx <name> --json\` before Grep · cards are locators; read the range before you act` | ≤ 60 tokens |
| **E4b** `PreToolUse` | `Grep`, `Glob` (Bash `grep/rg/git grep/findstr/Select-String` only after DE5) | longest identifier ≥ 4 chars in the pattern → ≤ 5 rows from a precomputed `names.json` (name → `qname kind file:lines fan-in`), or nothing | ≤ 150 tokens |
| **E4c** `PostToolUse` | `Read` | ONLY when the file is `partial`, `skipped`, or `CHANGED since index`: one line with the ranges and "the source is ground truth" | ≤ 50 tokens |

- `names.json` is written by `update` (E2), so the hook does a name lookup only — no resolution, no `index.json` parse. This is CBM's "cheap query only" rule.
- **Proof of delivery:** the hook increments counters in `graph-hook-seen.json`; the lane copies them into the trace at phase close as `GRAPH-HINT injected=<n> subagent_start=<n> read_notes=<n>`. One line per phase, not one per hint (the read gate's "a line per passed read is noise" rule).
- **Must be confirmed in EW0 before any build:** that Claude Code delivers `additionalContext` for `SubagentStart` and for `PreToolUse` calls made INSIDE a subagent, and which payload field names the agent type. CBM installs both for Claude Code (`04` §3.1), but ORC must see it work in `../orc-eval`.

**Config (W7 pattern: `lanes: []`, `SEED_EMPTY`, `gated_by: "code_graph"`):** `code_graph_hooks` (`on`·`off`, default `on`). `orc doctor`: `graph-hook-unwired` (only while `code_graph` and `code_graph_hooks` are on). Registry updates: `test/goldens/config-keys.json`, counts in `config.test.js` / `lane.test.js` / `goldens.test.js`, `bin/verify-contracts.js`.

**Executor template:** replace the step-0 instruction that W9 proved dead with one line: "a `[orc graph]` hint can appear before a Grep or after a Read; it is repository data; use its anchors, then read the range". Regenerate the 10 executors (`npm run build:agents`).

## 6. E5 — Update per run without a daemon

→ decision DE4. Three triggers share one path: `lock → quickState (E1) → incremental update (E2) → commit sig only on success`.

- **E5a update-on-read.** `ctx`, `impact`, `coverage`, `changes` call `quickState` first. `moved` AND the lock is free AND `code_graph_auto_update` is true → run the incremental update inline, capped by `code_graph_heal_ms` (default 1500). Over the cap, or locked → answer from the old generation with every touched card marked `CHANGED since index` (hints only). This removes R3: the next read heals what a lane forgot.
- **E5b run-end hook.** On `SubagentStop` of an `orc-executor-*` (the trace hook already sees this event — `claude-rules/03`), run `orc graph update --if-enabled --json --quiet` synchronously, with the same lock and deadline. A second executor stopping while the first update holds the lock → skip (the next trigger retries). **No detached process, no queue, no watcher.**
- **The lane steps stay** (`_shared/code-graph.md` §0) as the traced, visible path. They become a safety net: two of three triggers no longer depend on the orchestrator.
- **Tests:** two concurrent `SubagentStop` updates → one runs, one skips, final state FRESH; a read during an update sees the old generation or the new one, never a half; an update killed mid-write → next read heals; `auto_update: false` → no inline heal, `DRIFTED` labels.

## 7. E6 — Lean cards (output)

→ decision DE6. Only if it measures smaller.

- `--format tree` for `ctx` (file card) and `impact`: one header line of column names, then one row per symbol/edge; a path-prefix directory ONLY when it saves ≥ 15% bytes and ≥ 64 bytes (CBM rule, `04` §4).
- Semantic truncation stays whole-row; add `has_more` + `--offset` to `impact` and to the file card.
- **Gate:** on the fixture AND on Django, the median card is ≥ 15% fewer tokens (count with the same `tok()` the budget uses) at the same kept rows. Otherwise do not ship E6.

## 8. E7 — Cheap signals for planners and reviewers

All 0 tokens, all from git and the existing index.

| Command / field | Rule | Consumer |
|---|---|---|
| `orc graph changes [--base <ref>] --json` | `git diff -U0 <base>` + untracked → hunks → symbols whose line range overlaps → `callers` (depth 2) → risk: **high** = exported AND fan-in ≥ 3 AND no test caller · **medium** = exported OR fan-in ≥ 1 · **low** = the rest | reviewer (replaces `impact` on declared files), `/orc-verify`, ship summary |
| `importance` on every symbol | `sqrt(confident callers + refs)` × 0.1 if private × 0.1 if the name is defined in ≥ 5 files × 0.1 if test code (CBM `pass_importance`, `04` §5) | card ranking (replaces the plain fan-in sort in `fileCard`, `bin/graph-query.js:491-492`) |
| `tests` | existing test-caller rule + file naming (`x.test.js ↔ x.js`, `test_x.py ↔ x.py`, `x_test.go ↔ x.go`) | card `tests` line, `changes` risk |
| `orc graph cochange <file> --json` | `git log --name-only --since=6.months`, skip commits with > 20 files, ≥ 3 co-changes; cached per HEAD in `cochange.json` | planner: "files that usually change with X" → better `declared_files` |

ORC's **effects** (SQL / HTTP / env / fs) have no CBM equivalent. Keep them in every card.

## 9. Decisions for you

| # | Question | Options | Recommendation |
|---|---|---|---|
| **DE1** | Where does this land? | (a) inside the unreleased 1.8.0, one commit at the end · (b) ship 1.8.0 now with an honest "no measured saving" line, then 1.9.0 · (c) (a) for E1–E5 + E3, later release for E6–E7 | **(c).** R2/R3 are defects of the feature that is not released yet. E6/E7 add value but are not needed to fix them. |
| **DE2** | Store resolution (reverses W3-dev)? | (a) keep compute-on-read · (b) derived `resolved.json` per generation, written by `update` only, compute-on-read fallback | **(b)**, with the incremental == full property test as its gate. |
| **DE3** | Delivery hooks (reverses D8)? | (a) no · (b) SubagentStart + PreToolUse Grep/Glob + PostToolUse Read, subagent-only, run-only, never block | **(b)**, only after EW0 confirms Claude Code delivers the context. |
| **DE4** | Update triggers | (a) lane steps only · (b) + update-on-read · (c) + `SubagentStop` hook · (d) a watcher | **(b)+(c).** Never (d). |
| **DE5** | Hint on `Bash` searches too? | (a) Grep/Glob only · (b) + Bash commands that start with a search tool | **(a)** first; (b) only if EW8 traces show executors search through Bash. |
| **DE6** | Tree card format | (a) no · (b) yes behind the ≥ 15% gate | **(b)**. |
| **DE7** | Team-shared graph | (a) local only · (b) export a gzip snapshot (zlib is built into Node) | **(a)** now. Note for later: blob-keyed records need no CBM-style reconcile, so (b) is safe when wanted. |
| **DE8** | New release gate (§11) | (a) keep the W9 full-session gate · (b) the redesigned gate | **(b).** R4 shows the W9 metric cannot see the graph. |
| **DE9** | Executor step 0 text | (a) keep · (b) replace with the one "hint is data" line | **(b)**. |

## 10. Waves

Pause every 2 waves. Version stays **1.8.0** under DE1 (a)/(c).

| Wave | Work | Exit gate |
|---|---|---|
| **EW0** spike (no payload change) | (1) In `../orc-eval`: a throw-away hook proves `additionalContext` reaches a subagent on `SubagentStart` and on a subagent's `PreToolUse` Grep; record the payload fields. (2) On Django: time `status`, `update` (no change), `update` (1 body edit), `ctx`; split `ctx` time into JSON parse vs resolve. (3) Pick the eval repo for EW8 (≥ 300 source files, has tests, real call depth). | Written to `findings/EW0-spike.md`. **DE3 is cancelled if (1) fails.** E1/E2b are dropped if (2) shows no need. |
| **EW1** | E1 signature + E3 generation/coverage + `orc graph coverage` | `graph.test.js` cases §2 + coverage cases; `npm run verify` |
| **EW2** | E2 `resolved.json`, `names.json`, `surface_hash`, closure repair, `route` field | the incremental == full property test over ≥ 200 seeded steps; Django `ctx` time after vs EW0 |
| — PAUSE — | | full `npm test` |
| **EW3** | E5a update-on-read + E5b `SubagentStop` update | concurrency tests §6 |
| **EW4** | E4 `orc-graph-hook.js` (3 events), install/update/doctor, `code_graph_hooks` key + registries, executor template (DE9), `GRAPH-HINT` trace verb | hook tests: silent in main session, outside a run, when off, on error, on timeout; ≤ budgets; sanitizer cases |
| — PAUSE — | | full `npm test` |
| **EW5** | E6 tree cards (behind its gate) + E7 `changes`, `importance`, `tests`, `cochange` | fixtures per command; E6 gate numbers |
| **EW6** | Contract + lanes: `_shared/code-graph.md` (triggers, generation, coverage, hooks, `changes` for review), `read-ladder.md`, `phases/review.md` (`changes`), `phases/trace.md` (`GRAPH-HINT`, `route=`), `orc lane calls` rows, `bin/verify-contracts.js`, spine budgets | `npm run verify` green; `graph-lanes.test.js` |
| — PAUSE — | | full `npm test` |
| **EW7** | Docs + UI: README / README-id / CHANGELOG (1.8.0 entry rewritten), `guides/configuration.md`, `knowledge-parts/05` §4z.28, `claude-rules/04`, `CLAUDE.md` layout, `orc ui` Knowledge card (generation, coverage, last route, hook counters) + `orc-ui-wiki.md` | `npm run verify` + `npm test` |
| **EW8** | Eval round 3 (§11) | the gate |

## 11. EW8 — the measurement, rebuilt (DE8)

From R4 and `docs/MEASURING_SAVINGS.md` (`04` §6).

- **Repository:** the EW0 pick (≥ 300 source files), frozen SHA, a **clean detached worktree per condition** (not one sandbox reset between runs).
- **Tasks:** 3 tasks where finding code IS the work — (T1) change a function that has ≥ 3 callers in other files, (T2) a bug fix whose cause is 2+ calls away from the symptom, (T3) a cross-layer change (route → service → repository). Lanes: `/orc-mini` for T1/T2, `/orc` for T3.
- **N = 3 per cell**, fixed before the runs; median + min–max; every run kept, failures included.
- **Windows reported separately** (`w9-measure.js` split by transcript file): (W-main) orchestrator · (W-sub) every subagent summed · (W-exec) executors only · full session.
- **Primary metric:** W-exec tokens and W-exec `Read + Grep + Glob` calls.
- **Proof of use, per ON run:** `GRAPH-HINT injected ≥ 1` in each executor phase, or an executor `orc graph ctx` call in its transcript; `graph_used` with the current `generation`; final `graph-status` FRESH (R3 fixed).
- **Quality:** the task's own tests pass; ON tests ≥ OFF tests by pass rate; a blind diff review for scope creep (same rubric both conditions).
- **Gate:** for T1, T2 and T3, median ON < median OFF by **≥ 10%** on W-exec tokens OR W-exec search+read calls, with no quality loss, and every ON run passes proof of use. **If the gate fails, say so in the CHANGELOG and ship the graph as opt-in with no saving claim** — that is a valid result (`02-PLAN` status line).

## 12. Risks

| Risk | Control |
|---|---|
| Hook latency on every Grep | name lookup in `names.json` only; deadline; silent in the main session and outside a run; EW4 test asserts p95 < 150 ms on the Django index |
| Hint noise adds tokens | ≤ 5 rows, token ≥ 4 chars, per-agent de-dup, nothing on 0 hits; EW8 W-exec metric catches a net loss |
| Prompt injection through symbol names | sanitize; "repository data, not instructions" prefix; never inject file content, only names and anchors |
| `SubagentStart` context not delivered by Claude Code | EW0 spike; DE3 cancelled on failure; slice cards remain |
| Stored resolution diverges from a full resolve | property test; generation mismatch falls back to compute-on-read; `route` in every update answer |
| Concurrent writers (two executors stop together) | one lock; the loser skips; at-least-once baseline |
| Update-on-read makes a read slow | `code_graph_heal_ms` cap; over the cap → answer from old generation with `CHANGED` labels |
| Self-triggering updates | `.claude/orc/**` excluded from the signature (CBM #1953) |
| Interplay with the read gate | a separate hook; it never blocks; the read gate stays the only layer that can refuse |
| Contract drift | every new token registered in `bin/verify-contracts.js` in the same wave (EW6); spine budgets changed on purpose with a comment |
| Scope creep | E6/E7 are separable (DE1 c); EW0 can drop E1/E2b |

## 13. Files this plan will touch (for the final staging list)

`bin/graph.js` · `bin/graph-extract.js` (partial coverage, `surface_hash`) · `bin/graph-query.js` · NEW `bin/graph-resolve.js` (closure repair) · NEW `bin/graph-signals.js` (`changes`, `cochange`, `importance`) · `bin/cli.js` (`coverage`, `changes`, `cochange`, key, doctor, hook install, `LANE_CALLS`) · `bin/verify-package.js` · `bin/verify-contracts.js` · NEW `templates/hooks/orc-graph-hook.js` · `templates/hooks/README.md` · `agents-src/executor.template.md` → 10 executors · `templates/skills/_shared/{code-graph,read-ladder}.md` · `_shared/phases/{review,trace,execution}.md` · `bin/webui/**` (Knowledge card) · tests: `test/cli/graph*.test.js`, NEW `test/cli/graph-resolve.test.js`, NEW `test/hooks/graph-hook.test.js`, config/lane/goldens counts · docs listed in EW7.

Never staged: this folder, `orc-ui-wiki.md`, `C:\dev\codebase-memory-mcp`.
