# EW0 — the enhancement spike

Date: 15-09-2026. Machine: this Windows 11 dev box, Node 20.17, Claude Code 2.1.272.
Plan: `05-ENHANCEMENT-PLAN.md` §10 row EW0. Nothing in the payload changed in this wave.

## 1. Do Claude Code hooks deliver context to a subagent?

**PARTIAL — the events exist; live delivery is NOT yet proven.**

| Check | Result | Evidence |
|---|---|---|
| `SubagentStart` is a hook event | **yes** | `claude-code-settings.schema.json:464` in the installed Claude Code 2.1.272 lists `SubagentStart` and `SubagentStop` in the hook-event enum, beside `PreToolUse` and `PostToolUse`. |
| A second product ships these three events for Claude Code | **yes** | CBM `README.md:493,547` — `SessionStart`, `SubagentStart`, non-blocking `PreToolUse` on `Grep`/`Glob`/`Bash`, and post-`Read` coverage, injected as `additionalContext`. |
| `additionalContext` reaches a SUBAGENT on `SubagentStart` | **not tested** | needs a real Claude Code session with the hook installed. |
| A subagent's OWN `PreToolUse` Grep fires the hook | **not tested** | same. |
| Which payload field names the agent type | **not known** | same. |

**What this means.** The event surface is real, so DE3 is not cancelled. It is also not
confirmed. **The live test stays a prerequisite of EW4** (the wave that writes the hook) and
must run in `../orc-eval` with a throw-away hook that writes its whole stdin payload to a file.
EW1–EW3 do not depend on it.

## 2. Timing on a large repo (django/django @ `abb9c04`)

Shallow clone in the session scratchpad, 7,091 tracked files → 3,040 source files,
44,159 symbols, `index.json` 22.2 MB. Every number is the median of 5 runs.

### End to end, one CLI process

| Call | Median |
|---|---|
| first build (`update`) | 11,805 ms |
| `status` | 551 ms |
| `update`, nothing changed | 773 ms |
| `update`, one body edit | 1,367 ms |
| `ctx <symbol>` | 596 ms |
| **node process start alone** | **339 ms** |

### Inside the process

| Step | Median |
|---|---|
| `detect()` — the whole change scan | 206 ms |
| — `git ls-files -s -z` | 36 ms |
| — `git status --porcelain=v1` | 128 ms |
| — `git rev-parse HEAD` | 28 ms |
| `stat .git/index` | 0 ms |
| read + parse `files.json` (444 KB) | 3 ms |
| read + parse `index.json` (22.2 MB) | 201 ms |
| `loadModel()` (parse + build the maps) | 235 ms |
| `ctx` resolve only — one symbol (`QuerySet`) | 114 ms |
| `ctx` resolve only — a file card (`django/db/models/query.py`) | 437 ms |
| `impact` resolve only — one file | 384–520 ms |

## 3. Verdicts the gates force

### E1 signature fast path — **DROPPED**

Gate (§2): keep E1 only if the `same` answer is **≥ 3×** faster than the full detect.

A prototype of the proposed signature (`rev-parse HEAD` + `stat .git/index` +
`git status --porcelain`) measures **119 ms against `detect()`'s 206 ms — 1.7×**. It fails.

The reason is structural, not a tuning problem. The signature must see a working-tree edit,
and the only cheap way to see one is `git status`, which is **128 of the 206 ms** the full
detect already pays. Dropping `git status` would make the signature 28 ms and **wrong**: an
executor's edit would read FRESH. There is no third option, so E1 is not worth its complexity.

The real cost is elsewhere: **339 ms of the 551 ms `status` call is node starting up.** No
change inside the engine can reach that, and no plan wave proposed to.

### E2b index sharding — **DROPPED**

Gate (§3): only if `loadModel` JSON parse dominates on Django. It does not — parse is 235 ms
against 437–520 ms of resolve on the cards that cost the most. Resolve is the bigger half.

### E2 resolution cache — **CONFIRMED as the right target**

It removes the 437–520 ms half of a file card and an `impact`, which is the half that grows
with how connected the repo is. Build it as planned.

### E5a update-on-read — unaffected

It was written against `quickState`. With E1 dropped it calls the existing `detect()` (206 ms).
That is the cost `status` already pays, and the `code_graph_heal_ms` cap still bounds it.

## 4. The EW8 evaluation repository

Criteria from §11: ≥ 300 source files, real tests, real call depth, and a route → service →
repository layer split for T3. Django meets the size and the depth but needs a Python
environment per condition and has a slow suite, so it is a poor **task** repo even though it
is the right **timing** repo.

**Not decided in this wave.** The pick spends the user's tokens in EW8, so it is put to them
at the pause with the criteria above. Django stays the timing fixture either way.

## 5. What carried into EW1

- E1 is not built. EW1 is **E3 (generation + coverage) + `orc graph coverage`** only.
- E2b is not built.
- The Django clone is a scratchpad fixture, never committed, and is re-clonable from the
  commit named at the top of this section.
