# W2 + W3 — measurement on real repositories

Date: 15-09-2026. Machine: this Windows 11 dev box, Node 20.17, Python 3.13.
Tool: the real `orc graph` commands from the working tree (not a prototype).

## Build and update times

| | nestjs/nest | django/django |
|---|---|---|
| source files in the map | 1,920 | 3,040 |
| symbols | 5,896 | 44,159 |
| first build, heuristic only (`ORC_GRAPH_NO_BORROW=1`) | 2.4 s | **5.5 s** |
| first build, Python `ast` borrowed | — (no Python) | **10.7 s** |
| update after a 1-file edit | — | **0.9 s** (1 parsed) |
| no-change update | 0.17 s | 0.38 s |
| `index.json` | 4.3 MB | 21.3 MB |
| blob records (content-addressed) | 1,695 for 1,920 files | 2,400 for 3,040 files |

- Identical files share one record. The store is smaller than the file count on both repos.
- The Python parser doubles the first build on Django. It is exact, so it stays the default. The first-build estimate now uses 3.5 ms per file, so it does not under-promise.
- A 1-file update is dominated by change detection (`git status` on Windows) and the index rewrite, not by parsing.

## Read times

| Command | Repo | Time | Result |
|---|---|---|---|
| `ctx QuerySet.filter --budget 400` | django | **0.73 s** | 15 callers shown, 33 hidden and counted, 379/400 tokens |
| `ctx NestFactoryStatic.create --budget 500` | nest | < 1 s | 18 edges shown (LOCAL/IMPORT/UNIQUE + 1 AMBIGUOUS with both candidates), 479/500 tokens |

## Bugs the real repositories found (fixed, with a test each)

| Bug | Found on | Fix |
|---|---|---|
| TypeScript overload signatures became symbols → `ctx NestFactoryStatic.create` was "ambiguous" | nest | A JS/TS declaration with no body is not a symbol |
| C# `void` methods were dropped (`void` was in the keyword list) | test fixture | `void` removed from the keyword list |
| A depth-2 effect vanished from `--json` (the effect's own `type` overwrote the item marker) | test fixture | Item marker renamed to `item` |
| First-build estimate said 3 s for a 10.5 s build | django | 3.5 ms per file |

## Honest limits seen on real code

- **An instance alias does not match its class.** Nest's `NestFactory = new NestFactoryStatic()`, then
  `NestFactory.create(…)`: the receiver `NestFactory` is not the class name, so its 118 call
  sites are counted as `maybe` (AMBIGUOUS), not as confident callers. A later wave could record
  `const X = new Y()` bindings.
- Receiver matching is by class NAME (case-insensitive). `queryset.filter` → `QuerySet.filter`
  resolves UNIQUE on Django, and that is usually right. It is still a heuristic: the card shows
  the state word so the reader can judge.
