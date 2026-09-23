# Research — a small, always-fresh code graph for ORC lanes

Status: research only. Nothing is built. Written in Simplified Technical English.

---

## 1. What the idea asks for

1. A cache of how the repository is connected. Example: function X calls
   function Y. Y calls `OrderRepo.insert`. `insert` runs query Z.
2. The cache is optional. The user turns it on or off.
3. Build lanes update the cache a small part at a time: after each wave, or at
   the end for lanes without waves.
4. Every lane preflight reads the wiki first, then the cache, then source files.
5. If a teammate changes code and the local cache does not know it, ORC flags it.
6. Fast reads and writes. Cheap updates.

---

## 2. What other tools do

### 2.1 Graphify

Source: [github.com/Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)

- Extracts code with **tree-sitter AST parsing. No LLM.** An LLM is used only
  for docs, PDFs and images.
- Nodes: functions, classes, concepts. Edges: `calls`, `imports`, `inherits`,
  `uses`, `references`, `depends_on`. Each edge has a tag: `EXTRACTED` (written
  in the source) or `INFERRED` (found by resolution).
- Storage: `graphify-out/graph.json`, `graph.html`, `GRAPH_REPORT.md`.
- Incremental: a SHA256 cache per file. Only changed files are parsed again.
- Freshness: git hooks rebuild on commit and branch switch. **After `git pull`
  the user must run `graphify update .` manually.** The tool cannot see a
  teammate's change by itself.
- Agent access: MCP tools (`query_graph`, `get_neighbors`, `shortest_path`)
  and a PreToolUse hook that pushes the agent to the graph before a search.
- Token savings: "71.5×" is a community report, not a benchmark
  ([graphify.com blog](https://graphify.com/blog/how-to-give-claude-code-a-code-knowledge-graph)).

### 2.2 Codebase-Memory (research paper + MCP server)

Source: [arXiv 2603.27277](https://arxiv.org/html/2603.27277v1)

- Tree-sitter → graph in **one SQLite file (WAL)**. 14 MCP tools.
- Change detection: an XXH3 content hash per file. Incremental re-index is
  about 4× faster than a full index (about 1.2 s on Django).
- **Call resolution uses a confidence ladder:** import map 0.95 · same module
  0.90 · import suffix 0.85 · unique name 0.75 · suffix match 0.55 · fuzzy
  0.30–0.40. The first three tiers resolve about 80% of calls.
- Evaluation against an agent that reads files:
  - answer quality **0.83 vs 0.92** (90% of the file-reading agent),
  - tokens **~1,000 vs ~10,000**,
  - tool calls **2.3 vs 4.8**.
- Limits: no dynamic dispatch, no reflection, no macros. The file-reading agent
  is still better when it needs full source or an exhaustive search.

**Lesson:** a graph is a very cheap LOCATOR. It is not a full replacement for
reading code.

### 2.3 code-review-graph + Graphify in Claude Code

Source: [dev.to guide](https://dev.to/mir_mursalin_ankur/graphify-code-review-graph-build-a-self-updating-knowledge-graph-for-claude-code-and-other-ai-j1m)

- SQLite + FTS5 at `.code-review-graph/graph.db`. Incremental update in about
  0.4 s. Has a "blast radius" (impact) tool.
- Measured on a 1,336-node TypeScript monorepo: grep + reads ~110K tokens,
  code-review-graph ~20K, Graphify CLI ~11K.
- **Failures they report, and that we must design against:**
  - One overview tool returned ~33,000 tokens. Every read needs a token budget.
  - A graph BFS returned 87–378 nodes for any query. Output must be ranked
    and capped.
  - Hooks that start a rebuild on every turn or commit **piled up processes
    and froze the machine.** Updates must be synchronous and bounded, and must
    not run in a background hook.
  - An exact symbol name was sometimes missed, so grep stays the fallback.

### 2.4 Aider repo map

Source: [aider.chat repo map](https://aider.chat/2023/10/22/repomap.html),
[DeepWiki](https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system)

- Tree-sitter `tags.scm` queries give definitions and references.
- The tag cache is SQLite, keyed by file mtime.
- A file graph plus **personalized PageRank**, then files are added until a
  **token budget** is full.

**Lesson:** rank, then cut at a budget. Never dump the graph.

### 2.5 Blob-SHA incremental indexing

Source: [jcodemunch-mcp wiki](https://github.com/jgravelle/jcodemunch-mcp/wiki/Incremental-Blob-SHA-Indexing)

- Store the git blob SHA per file. Tier 1: tree SHA did not change → skip all.
  Tier 2: compare blob SHAs → process only changed files. Tier 3: first run →
  full.
- 156 files, 3 changed: 8–12 s went to about 1.4 s.

**Lesson for ORC:** git already hashed every tracked file. `git ls-files -s`
gives every blob SHA in one process call. This detects a teammate's change
with zero parsing and zero tokens.

### 2.6 SuperCoder — "Code Isn't Memory"

Source: [arXiv 2606.22417](https://arxiv.org/html/2606.22417v1)

- Vector + BM25 + call-graph index. Merkle-tree diff updates only the changed
  chunks. An overlay drops deleted paths and flags stale ones.
- Index ON vs OFF: resolve rate **50.4% vs 41.9%** (p=0.003). Turns **28.3 vs
  36.2**. Cost per solved task **$2.30 vs $2.84**.
- Localization accuracy@5: **44.3% → 84.5%**.
- **The gain is mostly in changes that touch 3+ files** (+46.4 points).

**Lesson:** the value is highest in multi-file work. That is `/orc` and
`/orc-ultra`, not a one-line `/orc-quick` fix.

### 2.7 RepoMirage — stale context risk

Source: [arXiv 2605.26177](https://arxiv.org/pdf/2605.26177)

- Agents **trust provided context** (docs, summaries, indexes) and often do not
  see that it no longer matches the code. Accuracy drops.
- Recommended: check context against source before you act on it, keep the
  index in sync, and show uncertainty.

**Lesson:** every fact in the cache must be tied to the exact content it came
from. A fact whose content changed must not be shown as a fact.

### 2.8 Graph research on SWE-bench

- RepoGraph: +32.8% relative improvement on SWE-bench (ICLR 2025).
- LocAgent: graph-guided localization, up to 92.7% file-level accuracy
  ([arXiv 2503.09089](https://arxiv.org/html/2503.09089v1)).

---

## 3. Storage — what is possible for ORC

ORC has **zero dependencies** and declares `engines.node >= 18`. The local
machine runs Node 20.17.

| Option | Status | Fit |
|---|---|---|
| `better-sqlite3` | native npm dependency | **No.** Breaks zero-dep. |
| `node:sqlite` built in | added 22.5 · no flag since 22.13 but prints an experimental warning on 22 · release candidate on 24+ / 25.7 ([Node docs](https://nodejs.org/api/sqlite.html), [stabilization issue](https://github.com/nodejs/node/issues/57445)) | **Not now.** Needs `engines >= 22.13`. That is a breaking change for Node 18/20 users. Possible later behind the same CLI. |
| JSON shards + one derived index file | pure `fs` | **Yes.** Content-addressed per-file records, atomic write (temp file + rename). |
| NDJSON append log | pure `fs` | **Yes, for notes.** Append is cheap; a compaction step removes old lines. |

The important point: **read speed for the model is not storage speed.** The
model never opens the store. It calls `orc graph …` and reads a small,
budgeted answer. Storage only needs to be fast for the CLI. A JSON parse of a
few MB is about 100 ms. W0 must measure this on a large repository.

---

## 4. Parsing — what is possible with zero dependencies

| Option | Accuracy | Cost |
|---|---|---|
| Tree-sitter native | high | native build. **No.** |
| `web-tree-sitter` WASM + grammar `.wasm` files ([npm](https://www.npmjs.com/package/web-tree-sitter)) | high | a dependency, or vendored binaries (~0.5–2 MB per grammar). Slower than native in Node. Adds binary files to the integrity guard. |
| **Borrow the project's own toolchain** | exact | Zero. If the project has `node_modules/typescript`, `require` it for TS/JS. If `python3` is on PATH, its stdlib `ast` module is exact for Python. |
| Heuristic extractor in `bin/` (comment/string strip + per-language patterns) | definitions good, calls medium | zero. Must tag every edge with its confidence. |

Recommended ladder: **borrowed toolchain → heuristic**, with the extractor
name on each file record. WASM stays an open decision (D3 in the plan).

---

## 5. How this fits ORC's existing rules

| ORC rule | What it means for the cache |
|---|---|
| S1 — a state is computed by the CLI | Graph extraction, freshness and query answers come from `orc graph …`. A model never writes the store. |
| "The free check runs before the paid one" | Structure costs 0 tokens (CLI). A model is paid only for optional one-line notes. |
| "Not knowing is an answer" | An unresolved call stays `AMBIGUOUS` with its candidates. It is never guessed. |
| Precedence `code > fresh wiki > stale wiki > priors` | The graph is a LOCATOR. It gives anchors. It does not replace a range read. |
| The read ladder (locate → outline → range → full) | The graph becomes "step 0": it answers locate + outline in one call. |
| `wiki_used` attribution | Add `graph_used` to returns. `none` is a real signal. |
| `orc wiki impact` (`docCovers`) | Reuse it to map a symbol to the wiki doc that covers its file. |
| Post-wave worktree audit (`git status` before/after) | The changed-path list for a wave already exists. It feeds `orc graph update --files`. |
| `/orc-quick` reads only `log_dir` | Conflicts with "quick also updates the cache". See D4 in the plan. |

---

## Sources

- [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)
- [Graphify blog — Claude Code knowledge graph](https://graphify.com/blog/how-to-give-claude-code-a-code-knowledge-graph)
- [Codebase-Memory paper (arXiv 2603.27277)](https://arxiv.org/html/2603.27277v1)
- [Graphify + code-review-graph guide (dev.to)](https://dev.to/mir_mursalin_ankur/graphify-code-review-graph-build-a-self-updating-knowledge-graph-for-claude-code-and-other-ai-j1m)
- [Aider repo map](https://aider.chat/2023/10/22/repomap.html)
- [Aider repo map (DeepWiki)](https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system)
- [Incremental Blob SHA Indexing (jcodemunch-mcp)](https://github.com/jgravelle/jcodemunch-mcp/wiki/Incremental-Blob-SHA-Indexing)
- [Code Isn't Memory — SuperCoder (arXiv 2606.22417)](https://arxiv.org/html/2606.22417v1)
- [RepoMirage (arXiv 2605.26177)](https://arxiv.org/pdf/2605.26177)
- [LocAgent (arXiv 2503.09089)](https://arxiv.org/html/2503.09089v1)
- [Node.js `node:sqlite` docs](https://nodejs.org/api/sqlite.html)
- [node:sqlite stabilization issue](https://github.com/nodejs/node/issues/57445)
- [web-tree-sitter on npm](https://www.npmjs.com/package/web-tree-sitter)
- [Claude Code hooks — PostToolUse/Stop patterns (dev.to)](https://dev.to/ohugonnot/claude-code-hooks-real-examples-posttooluse-stop-pretooluse-620)
- [Generated index + merge driver conflicts (soleur #8116)](https://github.com/jikig-ai/soleur/issues/8116)
