# W0 — timing measurement (CLI side)

Date: 14-09-2026. Machine: this Windows 11 dev box, Node 20.17.
Script: a throwaway prototype (`bench.js`, session scratchpad, not shipped).
Each repo ran twice; the numbers below are the second run (the first was within 10%).

## What was measured

1. change detection: `git ls-files -s -z` (blob SHA per tracked file) and
   `git ls-files -m -o --exclude-standard -z` (dirty + untracked)
2. a CRUDE regex extraction (JS/TS/Python defs + call names) over every source file
3. resolution by unique name only
4. one JSON index: stringify + write + atomic rename, then read + parse
5. an incremental patch: 5 changed files re-extracted

## Results

| | ORC repo | nestjs/nest | django/django |
|---|---|---|---|
| tracked files | 574 | 2,314 | 7,091 |
| source files parsed | 127 | 1,844 | 3,043 |
| source size | 2.9 MB | 4.1 MB | 20.7 MB |
| `ls-files -s` | 24 ms | 27 ms | 42 ms |
| dirty + untracked scan | 48 ms | 168 ms | **647 ms** |
| full extraction | 105 ms | 387 ms | **1,644 ms** |
| resolve (unique name) | 13 ms | 25 ms | 175 ms |
| index size (JSON) | 1.4 MB | 5.3 MB | **23.7 MB** |
| write + rename | 11 ms | 38 ms | 152 ms |
| read + `JSON.parse` | 13 ms | 23 ms | **135 ms** |
| incremental, 5 files | 2 ms | 2 ms | 2 ms |

## Verdict per question

| Question | Answer |
|---|---|
| Is a first build fast enough to run in a preflight? | **Yes.** 1.7 s for Django. Print the estimate above ~2,000 source files. |
| Is JSON storage fast enough (D2)? | **Yes, D2 = (a).** A `ctx` call pays ~135 ms parse on a 7K-file repo. Shard by top directory only above ~25 MB (measure again then). |
| Is the incremental patch cheap? | **Yes.** Parsing is negligible; the cost is the detection scan. |
| Weak spot 1 | The dirty/untracked scan is the slowest detection step on Windows (647 ms). W1 uses `git status --porcelain=v1 -z` once and compares timings. |
| Weak spot 2 | **Unique-name resolution alone is not enough:** Django 83K unique vs 95K ambiguous, Nest 15K vs 20K. Import-aware resolution (W3) is required, not optional. |
| Weak spot 3 | The crude regex found only 4,990 symbols in Nest (TS class methods missed). W2 needs a real TS method pattern or the borrowed TypeScript compiler. |

## NOT measured here — the token gate

The plan's W0 also has a token A/B (graph OFF vs ON in `../orc-eval`). That
needs real Claude Code sessions driving lanes, which spends real usage. It was
**not run in this session**. The release gate moves to W9: if 3+ file
scenarios show no token or tool-call saving there, v1.8.0 does not ship.
