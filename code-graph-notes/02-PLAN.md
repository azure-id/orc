# Plan — `orc graph`: a small code graph that stays fresh

Target version: **v1.8.0** (new feature, backward compatible → `npm version minor`).
Default: **off**. Written in Simplified Technical English.

> **Status: NOTHING BUILT.** D1–D8 are open. **W0 can stop the release.** If the
> measurement shows no saving, we do not ship. That is a correct result.

Research and sources: `01-research.md`.

---

## 0. The design in one screen

```
                 ┌──────────────── LAYER 1 — STRUCTURE (CLI, 0 tokens) ───────────────┐
  git ls-files -s│ blob SHA per file → diff vs files.json → parse ONLY changed blobs    │
  (1 process)    │ symbols · imports · calls · effects (SQL / HTTP / env / fs)         │
                 │ every edge tagged EXACT · IMPORT · UNIQUE · AMBIGUOUS(candidates)   │
                 └──────────────────────────────────────────────────────────────────────┘
                 ┌──────────────── LAYER 2 — NOTES (optional, paid) ───────────────────┐
  after a wave → │ `orc graph notes pending` = symbols whose BODY hash has no note     │
                 │ ONE Sonnet 4.6 medium dispatch per wave, capped, range reads only  │
                 │ agent RETURNS notes → `orc graph notes apply` writes them           │
                 └──────────────────────────────────────────────────────────────────────┘
  read path:     preflight → wiki (what/why) → `orc graph ctx` (where/how connected)
                 → range read of the anchor → full read only for files you will edit
```

Three ideas carry the whole design:

1. **Structure is computed, not written by a model.** A parser is free and
   exact for its input. A Sonnet agent that "updates the cache" costs tokens
   and can be wrong. This follows ORC rule S1 and "the free check runs before
   the paid one". (This changes part of your idea. See D1.)
2. **Every fact is tied to a content hash.** A file record is keyed by its git
   blob SHA. A note is keyed by the hash of the symbol body. When the content
   changes, the old fact is not shown as a fact. This is the answer to
   RepoMirage (agents trust stale context).
3. **The graph is a LOCATOR, not the truth.** It replaces read-ladder steps 1–2
   (locate, outline). It never replaces step 3 (range) before the agent acts on
   behaviour. Codebase-Memory measured 90% of a file-reader's quality at 10% of
   the tokens. The 10% gap is why the range read stays.

---

## 1. What ships

| # | Thing | Why |
|---|---|---|
| A | **W0 measurement** in `../orc-eval` — tokens, tool calls, `Read` count, graph ON vs OFF | Research says the gain is in 3+ file changes. Prove it here first. |
| B | `orc graph` CLI family in `bin/cli.js` (`status · update · ctx · impact · path · notes · gc`), every read with `--json` | S1, S7 |
| C | Extractors: borrowed toolchain (TypeScript, Python `ast`) → heuristic per language | Zero dependencies (D3) |
| D | Config keys `code_graph` and `code_graph_notes` | Opt-in toggle |
| E | Shared contract `templates/skills/_shared/code-graph.md` | One canonical copy of consult + update rules |
| F | Lane wiring: preflight consult, wave-close update, end-of-run update | The core of the request |
| G | Agent `orc-graph-noter-sonnet-4-6-med` (+ `opus5_only` variant decision) | Layer 2 |
| H | Return field `graph_used`; trace verbs `GRAPH-CONSULT` · `GRAPH-UPDATE` · `GRAPH-NOTES` | Attribution, like `wiki_used` |
| I | `orc doctor` finding `graph-drifted`, status line segment `graph: fresh` | "Flag when a teammate changed code" |
| J | `orc ui` panel card (read-only) + `orc-ui-wiki.md` | P0 rule for UI changes |
| K | Tests, contract-lint rows, integrity guard agent name, docs (README, CHANGELOG, knowledge part IV, `claude-rules/04`) | P0 rules |

**Deliberately NOT in this release:**

| Not shipping | Why |
|---|---|
| A git hook or a background watcher | code-review-graph users saw process pile-up and a frozen machine. ORC updates at lane edges only, synchronously. |
| A PreToolUse hook that pushes to the graph (Graphify style) | The read gate exists. Slice injection reaches the agent without a new hook. Add later only if W0 shows agents ignore the card. |
| An MCP server | ORC is a CLI + skills. The CLI answer is the same data without ~6K tokens of tool schema per session. |
| Embeddings / vector search | Needs a model or a dependency. Grep already does lexical search for free. |
| Committing the graph to git | Merge conflicts on generated index files are a known problem. Rebuild is free. (Notes: see D6.) |
| `node:sqlite` backend | Needs `engines >= 22.13` — a breaking change (D2). |

---

## 2. Storage layout

All under `.claude/orc/graph/`. Not in the install manifest, so `orc update
--prune` never deletes it (same rule as `patterns/` and `gotchas.md`).

```
.claude/orc/graph/
  meta.json            schema, head_commit, updated_at, extractor versions, counts
  files.json           { "src/orders/service.ts": { blob, lang, extractor, bytes } }
  blobs/a1/a1b2….json  ONE extraction record per blob SHA (content-addressed)
  index.json           DERIVED: symbols, resolved edges, name→symbol map, reverse edges
  notes.jsonl          append-only { sym, body_hash, note, model, at }
  .lock                writer lock (readers never wait — see §2.2)
```

### 2.1 A blob record

```json
{
  "blob": "a1b2c3…", "lang": "ts", "extractor": "typescript@5.6",
  "imports": [{ "from": "../repo/orderRepo", "names": ["OrderRepo"], "line": 3 }],
  "symbols": [{
    "id": "src/orders/service.ts#OrderService.create",
    "kind": "method", "lines": [41, 88], "exported": true,
    "body_hash": "9f3e…",
    "calls": [{ "name": "OrderRepo.insert", "line": 60 }, { "name": "validateCart", "line": 44 }],
    "effects": [{ "type": "sql", "text": "INSERT INTO orders …", "line": 61 }]
  }]
}
```

- **Content-addressed** means a branch switch back to an old commit reuses old
  records. Nothing is parsed twice.
- `body_hash` = hash of the normalized symbol text. An edit elsewhere in the
  file does not make this symbol's note stale. This is the "bit per bit" part.
- `effects` is what answers "Y runs query Z": SQL string literals, ORM call
  shapes, `fetch`/`axios`/HTTP clients, `process.env` reads, `fs` writes. Each
  one has a line anchor.

### 2.2 Writes and reads

- A writer takes `.lock`, writes the blob records, writes `index.json.tmp`,
  then renames it over `index.json`. A rename is atomic, so a reader sees the
  old index or the new one, never half of one.
- Parallel executors in one wave can call `orc graph ctx` at the same time. No
  reader takes the lock.
- `orc graph gc` deletes blob records no path points at and compacts
  `notes.jsonl`. It runs when the store is larger than a limit, never inside a
  wave.

---

## 3. The incremental update (the cheap part)

`orc graph update [--files <list>] [--full] [--json]`

1. **Detect.** `git ls-files -s -z` gives the blob SHA of every tracked file in
   one call. For dirty and untracked files: `git ls-files -m -o
   --exclude-standard -z`, then `git hash-object --stdin-paths` (one call).
   `.gitignore` is respected for free. `code_graph_ignore` globs and a max file
   size skip vendored and generated files.
2. **Diff** against `files.json` → added · changed · deleted. Same blob = skip.
3. **Extract** only the changed blobs whose record is not already on disk.
4. **Patch the index.** Remove the old symbols and edges of the changed files.
   Add the new ones.
5. **Re-resolve only what is affected.** Build the set of "dirty names":
   symbols added, removed or renamed in the changed files. Use the reverse
   name map to find edges in OTHER files that point at a dirty name, and
   resolve only those again. Cost = changed files + their direct callers,
   never the whole repo.
6. **Write** atomically. Print one line:
   `graph: updated 7 files (3 parsed, 4 reused) · 212 edges re-resolved · 180 ms`.

`--files` is a hint, not trust: the CLI still checks each listed path's blob
SHA, so a wrong list costs time, never correctness.

### 3.1 Call resolution — states, not guesses

Adapted from the Codebase-Memory confidence ladder, written as ORC state words:

| State | Rule | Shown to agents as |
|---|---|---|
| `EXACT` | the borrowed toolchain resolved it (TS type checker, Python `ast` + import) | a fact about structure |
| `IMPORT` | the name matches an import in this file, and the import path resolves | a fact about structure |
| `LOCAL` | defined in the same file or module | a fact about structure |
| `UNIQUE` | exactly one symbol with that name in the repo | a strong hint |
| `AMBIGUOUS` | 2+ candidates — **all candidates are listed** | a hint, with the list |
| `UNRESOLVED` | no candidate (dynamic dispatch, reflection, external package) | kept, with the raw name |

A fuzzy match is never stored. "Not knowing is an answer."

---

## 4. The read path (the fast part)

### 4.1 Commands

| Command | Answers | Exit codes |
|---|---|---|
| `orc graph status [--json]` | Does a graph exist, and is it fresh against the working tree? | 0 FRESH · 1 NONE · 2 DRIFTED (update fixes it, free) · 3 OFF |
| `orc graph ctx <symbol\|file[:line]> [--depth 2] [--budget 1200]` | The context card (below) | 0 found · 1 no graph · 4 not found (+ nearest names) |
| `orc graph impact <files…> [--depth 3]` | Blast radius: transitive callers, with the wiki doc and the tests that cover each | 0 · 1 |
| `orc graph path <from> <to>` | The shortest call chain between two symbols | 0 found · 4 none |
| `orc graph notes pending [--files …] [--cap 40] [--json]` | Symbols whose current `body_hash` has no note | 0 some · 5 none |
| `orc graph notes apply <file.json>` | Validates and appends notes. The only writer of `notes.jsonl` | 0 · 6 invalid (names each bad row) |
| `orc graph gc` | Housekeeping | 0 |

### 4.2 The context card

A ranked, budgeted text card. The model reads this, never the JSON store.

```
OrderService.create  src/orders/service.ts:41-88  [blob a1b2c3 · current]
  ← called by  POST /orders          src/routes/orders.ts:22        IMPORT
  → calls      validateCart          src/cart/validate.ts:10        IMPORT
  → calls      OrderRepo.insert      src/orders/repo.ts:30          UNIQUE
      └ effect sql  "INSERT INTO orders (user_id, total) …"   repo.ts:34
  → calls      emit                  AMBIGUOUS (2): src/events/bus.ts:8, src/ws/hub.ts:40
  note  Creates the order in one transaction and emits order.created.  (sonnet-4-6 · body 9f3e · current)
  wiki  orc-feature-orders.md (FRESH)
  tests test/orders/service.test.ts
  budget 310/1200 tokens · 2 callers hidden (use --depth 3)
```

Rules for the card:

- **Ranked, then cut at the budget.** Order: direct edges → then by fan-in.
  (Personalized PageRank like Aider is a later option, only if W0 shows the
  simple rank misses.) The card always says what it hid.
- **A note shows only when its `body_hash` equals the current one.** A note
  for old content is not shown. The card prints `note: stale (body changed)`
  instead, so the reason is visible.
- **The wiki line reuses `docCovers`** from `orc wiki impact`. The graph and
  the wiki point at each other and are never merged.
- Hard cap on every read command. Research case: one tool returned ~33K
  tokens. That must be impossible here.

### 4.3 Where it sits in the read order

The new precedence line, everywhere the wiki line is today:

```
code > graph structure (current blob) > fresh wiki > stale wiki (hints) > graph notes > model priors
```

- Graph STRUCTURE is extracted from the exact current bytes, so it ranks above
  the wiki. It is still below code, because a heuristic edge can be wrong.
- Graph NOTES are model-written summaries. They rank below the wiki, which is
  evidence-anchored and scanned by a stronger model.

The read ladder gains **step 0 — ask the graph** (when `code_graph` is on and
status is FRESH): one `orc graph ctx` call replaces locate + outline. Steps 3
and 4 do not change. Both exceptions (files you edit, gate output) do not
change.

---

## 5. Freshness and the "a teammate changed code" flag

The graph is local and git-ignored. Freshness is **computed on read, never
stored** — the same rule as the wiki tier.

| Situation | What happens | User sees |
|---|---|---|
| Nothing changed | status 0 | `graph: FRESH — 2,140 files · 18,902 symbols` |
| Teammate commits arrived (`git pull`), or a branch switch | preflight runs `orc graph update` itself (structure is free) | `graph: 14 files changed outside ORC → updated (0.6 s) · 9 notes now stale` |
| Update failed, or `code_graph_auto_update: false` | status 2 | `graph: DRIFTED — 14 files behind; hints only, code wins (run: orc graph update)` |
| No graph yet, key on | first build, with a size estimate before a large repo | `graph: building first index (~4,000 files, est. 20 s)` |
| Key off | nothing is read or written | one line: `graph: off` |
| **No wiki in the repo** | the graph runs the same way. It never depends on the wiki. The card has no `wiki` line. | `wiki: absent — …` then `graph: FRESH — …` |

So a teammate's change is not only flagged — the free layer heals itself. The
flag that remains is for **notes**, because notes cost tokens: the count of
stale notes shows at preflight, and the next wave's noter picks them up only
for symbols the run touches (never a repo-wide re-note).

`orc doctor` gets `graph-drifted` (only while the key is on). The status line
gets a `graph:` segment next to `wiki:`.

---

## 6. Lane wiring

### 6.1 Which lane does what

**The rule: only lanes that CHANGE CODE take part.** Each of them prints a
`graph:` line at preflight, reads the graph, and builds and updates it (structure
AND notes). Every other lane does nothing with the graph and prints nothing.

| Lane | Preflight (line + consult + build/heal) | Structure update | Notes dispatch |
|---|---|---|---|
| `/orc`, `/orc-ultra` | yes (planning + scoring) | preflight · **every wave close** · after review/verify fixes · ship | **one per wave**, paired with the trace writer dispatch |
| `/orc-diy` | yes (compile-owned flow key) | compile-owned (same points as `/orc`) | compile-owned |
| `/orc-mini` | yes | preflight · after smoke gate green (its one "wave") | once, at the end |
| `/orc-fast` | yes — **not a third gate** (like gotchas) | preflight · after smoke gate green | once, at the end |
| `/orc-quick` | yes — Q0 preflight + cards in Q1 "look" | preflight · **after every request that wrote code** | **once per request that wrote code** (see §6.3) |
| No code change: `/orc-analyze`, `/orc-verify`, `/orc-wiki`, `/orc-learn`, `/orc-plan`, `/orc-poly`, `/orc-retro`, `/orc-claude`, `/orc-pattern`, … | no | no | no |
| Doc lanes: `orc-doc`, `orc-challenge`, `orc-brainstorm`, `orc-grill`, `orc-pact`, `orc-boundary`, `orc-handoff`, `orc-budget`, `orc-aftermath`, `orc-export`, `orc-explain` | no | no | no |

Inside a code lane, its sub-roles (analyst, scouts, planner, reviewer,
verifier) get cards through their slices. They never call the update
themselves: the lane owns it.

**The preflight line is never silent** in a code lane. It prints exactly one of
the §5 lines: `FRESH`, `updated`, `DRIFTED`, `building first index`, or `off`.

**The graph never needs a wiki.** Every lane in the table above consults and
updates the graph whether the wiki is FRESH, STALE or absent. With no wiki, the
read order is: graph → range read → full read. A repo that never ran
`/orc-wiki` gets the most from the graph, because the graph is free.

### 6.2 Wave close in `/orc` (the exact new steps)

The post-wave worktree audit (`execution.md` step 4) already diffs `git
status` before and after the wave. That list is the input.

```
4.  post-wave worktree audit (exists)
4a. orc graph update --files <audited changed paths> --json     → emit GRAPH-UPDATE
4b. if code_graph_notes = wave:
      orc graph notes pending --files <same paths> --cap 40 --min 5 --json
      exit 5 → nothing to do (fewer than code_graph_notes_min → they wait for a later batch)
      exit 0 → dispatch orc-graph-noter-sonnet-4-6-med in the SAME tool block
               as the next wave's first dispatch (no added wait)
               the slice carries ONLY the path list; the noter runs `pending` itself
               → its return → write to run dir → orc graph notes apply → emit GRAPH-NOTES
```

A noter return that arrives after wave W+1 started is still valid: notes are
keyed by `body_hash`, so a note for a body that changed again is simply not
shown. Nothing can go wrong from the race.

### 6.3 `/orc-quick` — it builds the cache too

Decided (D4 = c). Quick is a full participant, not a reader only.

```
Q0 preflight   orc graph status --if-enabled   → print the graph: line
               exit 3 (off) → skip everything below
               exit 1 (none) → first build: print the estimate, then build
               exit 2 (drifted) → orc graph update (free heal)
Q1 look        orc graph ctx on the files/symbols found → the card rides the slice
Q3 do          (the user-picked agent does the work, unchanged)
after Q3       if the request WROTE code:
                 orc graph update --files <paths the agent changed>
                 orc graph notes pending --files <same> --cap 40 --min 5
                 exit 5 → no dispatch; the symbols wait for a later batch
                 exit 0 → dispatch orc-graph-noter-sonnet-4-6-med
                          in the SAME tool block as writing the quick-context entry
                 → the noter pipes its notes to `orc graph notes apply -` itself
               a read-only request (a question, a context dig) → no update, no notes
```

Two contract changes to quick, stated so nobody calls them drift:

1. **Quick still reads only `log_dir`.** Every graph call has `--if-enabled`:
   the CLI reads `code_graph` and `code_graph_notes`, not the lane. Off = exit
   3 and nothing happens.
2. **The noter dispatch is NOT a user-picked agent.** Quick's "it always asks
   which agent" rule covers the agent that does the request. The noter is ORC
   bookkeeping, like the trace writer: fixed, never asked, and it goes in the
   same tool block as the entry write, so it adds no user turn and no step.

### 6.4 Slice injection (how executors get it)

- Planner: `orc graph impact` on the candidate `declared_files` → better
  `declared_files` and better `fan` and risk facets for scoring.
- Executor slice: one context card per declared file's changed symbols, cap 3
  cards, budget from config. Injected LITERALLY, like `pattern` and gotchas.
  Zero cards = no block.
- **No card when it cannot help:** the user named the exact file AND the
  change stays inside that file (no signature change, no new export). A card
  there is pure cost: it is sent again on every turn and saves no search.
- Reviewer: `orc graph impact` on the diff → callers that were not changed but
  depend on a changed signature.
- Every return adds `graph_used` (`card ids` or `none`). The `DISPATCH` trace
  line gets a `graph:` continuation, like `wiki:`.

---

## 7. The notes agent (Layer 2)

`orc-graph-noter-sonnet-4-6-med` — tools: Read + Bash (Bash only for `orc graph
notes pending` and `orc graph notes apply -`). Name follows S2.

- **Input slice:** up to 40 `{ sym, file, lines, body_hash }` rows + the read
  ladder. It reads each RANGE, never a full file.
- **Output:** `{ notes: [{ sym, body_hash, note }] }`. One sentence each, max
  ~25 words. Say what it does and what side effect it has. Never repeat the
  signature.
- **It pipes its notes straight to the CLI:** `orc graph notes apply -` (JSON on
  stdin). The CLI is still the only writer (S1): it validates each row (the
  symbol exists, `body_hash` is current, the length is in range) and appends.
  The agent never opens `notes.jsonl`.
- **Its return to the lane is ONE line** (~60 tokens):
  `notes: 14 applied · 0 rejected`. **Why:** the first design sent ~2K of notes
  back to the orchestrator every wave. The orchestrator context lives the whole
  run, so those 2K were sent again on every later turn — about 100K extra
  tokens in a 6-task run (see `03-simulasi-token.md`).
- **A minimum batch** (`code_graph_notes_min`, default 5). Each dispatch pays a
  fixed start-up cost of about 5.7K tokens, so 1 symbol costs ~18K. Below the
  minimum, no dispatch. Nothing is lost: `pending` is computed from body hashes,
  so the symbols appear again in the next batch.
- **Cost, estimated (W0 measures):** 40 symbols × ~40 lines ≈ 20–30K input
  tokens and ~2K output tokens per wave. `orc budget` turns tokens into money
  from `bin/pricing.json`. Structure costs nothing, so a user who wants zero
  spend sets `code_graph_notes: off` and keeps most of the value.

---

## 8. Config

| Key | Default | Values | Lanes |
|---|---|---|---|
| `code_graph` | `off` | `off` · `on` | orc, orc-mini, orc-fast, orc-diy, orc-quick |
| `code_graph_notes` | `off` | `off` · `wave` · `end` | orc, orc-mini, orc-fast, orc-diy, orc-quick (quick: any value except `off` = once per code-writing request) |
| `code_graph_auto_update` | `true` | bool | same as `code_graph` |
| `code_graph_card_budget` | `1200` | 300–4000 | same as `code_graph` |
| `code_graph_notes_cap` | `40` | 1–200 | same as `code_graph_notes` |
| `code_graph_notes_min` | `5` | 1–200 | same as `code_graph_notes` — fewer pending symbols than this → no dispatch, they wait |
| `code_graph_ignore` | `[]` | globs | same as `code_graph` |

S3: `code_graph: off` shadows every other key. `orc config set` must name them.

---

## 9. Waves

| Wave | Work | Exit gate |
|---|---|---|
| **W0** | Prototype `update` + `ctx` as a scratch script. In `../orc-eval` run 3 scenarios (1-file fix, 3-file feature, cross-layer route→service→repo change) graph OFF vs ON. Measure tokens, tool calls, `Read` calls, pass/fail. Also time a full index + an incremental update on one large public repo. | **Stop the release** if 3+ file scenarios do not save tokens or tool calls. Choose D2 from the index-size numbers. |
| W1 | Store + change detection + `status` / `update` / `gc`. Atomic write, lock. | Tests: add, change, delete, rename, branch switch reuse, dirty file, untracked file, Windows paths. |
| W2 | Extractors: heuristic JS/TS, Python, Go, Java, C#, PHP; borrowed TypeScript + Python `ast`. Effects detector. | Golden fixtures per language under `test/fixtures/graph/`. |
| W3 | Resolution states + incremental re-resolution + `ctx` / `impact` / `path` with budget and ranking. | Card never exceeds budget. `AMBIGUOUS` lists every candidate. |
| W4 | Notes: `pending` / `apply`, agent file, body-hash visibility rule. | A note for a changed body is never shown as current. |
| W5 | Shared contract `_shared/code-graph.md`; read ladder step 0; precedence line in `wiki-consult.md` and `staleness.md`; `graph_used` in `return-validation.md`. | Contract lint rows registered. |
| W6 | Lane wiring: orc / ultra / diy / mini / fast / quick only (D4.1). Quick contract text for §6.3. `orc lane calls` entries. Trace verbs. | Payload-walking test: every code lane runs the calls; no doc or non-code lane declares them. |
| W7 | Config keys, `orc doctor` finding, status line segment, `orc ui` card + `orc-ui-wiki.md`. | `--json` = one object (S7). |
| W8 | Docs: README (latest version + changelog), `CHANGELOG.md`, `knowledge-parts/05`, `knowledge.md` index row, `claude-rules/04`, `CLAUDE.md` layout. Version bump. | `npm run verify` + `npm test` green. |
| W9 | Eval again with the shipped payload (same 3 scenarios as W0). | Numbers written to `eval/results/1.8.0/`. |

---

## 10. Decisions for you

| # | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | Who builds the structure? | (a) CLI parser, 0 tokens · (b) Sonnet 4.6 agent per wave, as in the first idea | **(a).** Every tool in the research does structure without a model. A model is used only for notes (Layer 2). Your Sonnet 4.6 dispatch stays, for notes. |
| **D2** | Storage | (a) JSON shards now · (b) `node:sqlite`, raise `engines` to ≥22.13 (breaking → v2.0.0) · (c) both behind one CLI | **(a)** now. Decide (c) from W0 index-size numbers. The CLI contract hides the backend, so a later switch changes nothing in the skills. |
| **D3** | Parser | (a) borrowed toolchain → heuristic · (b) vendor tree-sitter WASM grammars in the package · (c) download WASM on `orc graph install-parsers` (checksum pinned) | **(a)** for v1.8.0. (b) adds MB of binaries. (c) adds a network fetch. Both break the spirit of zero dependencies. |
| **D4** | `/orc-quick` | (a) not at all · (b) read + structure only · (c) read + structure + notes | **DECIDED: (c).** Quick builds the cache like every code lane. See §6.3. |
| **D4.1** | Which lanes take part | (a) every lane that reads code · (b) only lanes that change code | **DECIDED: (b).** orc, ultra, diy, mini, fast, quick. Doc and non-code lanes do nothing with the graph. |
| **D5** | Notes model | (a) `orc-graph-noter-sonnet-4-6-med` (your idea) · (b) Haiku 4.5 | **(a)** to ship. Run W0 with both; a one-sentence summary may be Haiku work. Under `opus5_only`, decide: skip notes, or add an Opus 5 variant (costly for a summary). I suggest skip + print it. |
| **D6** | Share notes with the team? | (a) local only · (b) commit `notes.jsonl` (append-only, keyed by body hash, `merge=union`) | **(a)** for v1.8.0. (b) later: notes are keyed by content, so they are safe to share, but a shared file is a new surface. |
| **D7** | One key or two? | (a) `code_graph` + `code_graph_notes` · (b) one key `off` · `structure` · `full` | **(a).** It is clearer what costs money. |
| **D8** | PreToolUse nudge hook (Graphify style) | (a) no · (b) yes, on `Grep`/`Glob` while a run is open | **(a).** Slice injection first. Add (b) only if W0 traces show agents grep past a card they were given. |

---

## 11. Risks

| Risk | Control |
|---|---|
| Agents trust a wrong heuristic edge (RepoMirage) | State words on every edge; graph is a locator; range read before acting; `code >` precedence. |
| Output blow-up | Hard budget on every read command; the card says what it hid. |
| Huge monorepo: index too big to parse per call | W0 measures. Limits: max files, max file size, ignore globs. Fallback: shard `index.json` by top directory, or D2 (c). |
| A first index is slow on a big repo | Estimate + print before the build. Never inside a wave. |
| Process pile-up | No background process, no hook-triggered rebuild, one writer lock. |
| Notes cost grows | Cap per wave; notes only for symbols the run touched; `off` keeps structure. |
| A lane forgets to update | The update is idempotent and blob-checked. The next preflight heals it for free. A missed update only costs time, never correctness. |
| A tiny 1-file edit costs MORE with the graph on | No card when the user named the file and the change stays inside it; `code_graph_notes_min` stops a 1-symbol notes dispatch. |

---

## 12. Token cost — summary

Full simulation, in Indonesian: `03-simulasi-token.md`. All numbers are
estimates; W0 measures them.

| Case | Graph OFF | Graph ON |
|---|---|---|
| `/orc`, 6 tasks, 3 waves — exploration-related input | ≈ 520K | ≈ 295K (notes `wave`) · ≈ 270K (`end`) · ≈ 220K (`off`) |
| `/orc-quick`, 4-file change | ≈ 121K | ≈ 64K (≈ 40K notes `off`) |
| `/orc-quick`, 1-file edit, file named by the user | ≈ 7K | ≈ 40K before the two fixes · ≈ 10–12K after |

- Structure (build + heal): **0 model tokens.**
- Whole `/orc` run: an estimated **10–15% fewer tokens**. SuperCoder measured
  ~9% fewer tokens and ~22% fewer turns. The bigger gain there was quality.
- Notes cost more than they save **inside one run**. They pay back in later runs.
