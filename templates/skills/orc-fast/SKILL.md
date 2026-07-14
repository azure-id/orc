---
name: orc-fast
description: >
  Fastest ORC lane — knowledge-gated single-executor implementation. Use for
  "use orc-fast to implement X" or "/orc-fast". Requires TWO prerequisites:
  a fresh project wiki (orc-wiki) AND a cached code-pattern for the request's
  language — the precomputed knowledge replaces the analyst/planner entirely.
  Either missing → falls back to orc-mini (never stops the chat). One
  Sonnet 4.6 high executor, a build+test smoke gate, one repair round, ship.
  Orchestrator runs fine at Sonnet medium. The orchestrator never implements —
  it spawns.
---

# ORC-FAST

The speed lane: precomputed knowledge instead of pipeline phases. Where mini
pays for an analyst-lite and planner-lite because it has no project knowledge,
fast pays for NEITHER — the wiki supplies grounding, the pattern cache supplies
house style. That trade only holds when both exist and the wiki is fresh, so
the two prerequisite gates below are hard: fail either → **fall back to
orc-mini** carrying whatever intake was already done. Fallback is the router —
orc-fast is always safe to try.

Runs fine with the orchestrator at **Sonnet 4.6 / Sonnet 5, medium effort** —
there is no scoring, no planning judgment. (The effort guard only gates the
full `orc` skill; it does not apply here.) **You never implement — you spawn.**
The smoke gate is a read-only build+test run, not implementation.

## What fast deliberately does NOT have

No analyst, no planner, no scoring, no waves, no reviewer, no verifier, no
test-author phase, no summary phase. One executor, one smoke gate, one repair
round. If a request needs more than that, the fit gate hands it to orc-mini.

## Phase F0 — Preflight (the two prerequisite gates; no spawn)

Emit a `GATE` trace line per check when logging.

**a. Wiki gate.** `wiki/` must exist with > 0 docs, and be acceptably fresh.
Compute the tier from `.claude/orc/wiki-meta.json` per
`../orc-wiki/references/staleness.md` (the canonical freshness reference):
`git rev-list --count <scan_commit>..HEAD` → FRESH / AGING / STALE (manifest
absent but docs present = STALE; wiki absent/empty = gate FAILED → fallback).
- **FRESH** → proceed silently. **AGING** → one-line notice, proceed.
- **STALE** → the user judges. Ask with exactly these options:
  1. **Refresh wiki, then continue fast** *(recommended)* — run orc-wiki's
     incremental refresh (diff since `scan_commit`, re-scan only affected
     docs), then re-enter this preflight.
  2. **Drop to orc-mini** *(preferable if in a hurry — mini grounds itself)*.
  3. **Continue fast anyway** *(not recommended — the executor may follow
     stale claims)* — proceed and stamp `wiki_stale_override: true` in the
     checkpoint so /orc-retro can correlate outcomes with overrides.

**b. Pattern gate.** Detect the request's language (file extensions / repo
deps, same signals as the full lane's tagging) and require
`.claude/orc/patterns/<lang>-pattern.md`. Missing for the language in play →
gate FAILED → fallback. (A request touching no FE/BE language — pure docs/
config — passes this gate as N/A.) The cross-cutting `postgres` pattern is
NEVER a gate prerequisite — it is bonus-only (injected at F2 on a cache HIT),
so a missing `postgres-pattern.md` never fails the gate or forces a fallback.

**Any gate FAILED** → announce which prerequisite failed in one line, then
hand off to orc-mini via the fallback contract below. Never stop the chat.

## Phase F1 — Fit gate + micro-intake (one pass, ONE user round-trip)

Draft a 3–5 line intent spec + 2–3 acceptance bullets from the request.
Then judge fit: does this decompose into MORE than one real task, or plausibly
touch more than ~5 files, or hit core/security-sensitive surface? If yes →
fallback to orc-mini WITH the intent spec attached (no rework). Emit a `GATE`
line for the fit verdict when logging.

Then make the lane's ONLY pre-spawn ask — a single combined confirmation:
preflight result (one line) + intent spec + acceptance bullets + "proceed?".
Soft sign-off: proceed unless the user objects. Never split this into multiple
questions.

Create the run folder (`.claude/skills/orc/run/{run-slug}/` — shared format,
so a fallback or escalation needs no migration) and write the intent-spec +
a minimal checkpoint.

## Phase F2 — Slice build + dispatch (ONE executor)

Build one slice for `orc-executor-sonnet-4-6-high` (dispatch BY NAME; model
pinned in the agent file):

- the task (intent spec) + acceptance bullets as definition-of-done
- **wiki pointers, not content:** the PATHS of 1–3 relevant wiki pages,
  selected from `wiki/INDEX.md` by title/description/keyword match (v2 INDEX
  lines carry doc type, status, and keywords — keywords are the strongest
  signal). When the request's domain matches, prefer the cross-cutting maps as
  one of the pointers: `orc-reference-api-surface` for API work, data-model
  for schema work, glossary for jargon-heavy requests, config-env for
  config/env work. Instruct the executor to READ them first — TL;DR for
  orientation, `Contracts & shapes` for the file-anchored specifics — and
  include the precedence line verbatim: `code > fresh wiki > stale wiki
  (hints) > model priors` (on any wiki-vs-code conflict, the code wins). You
  never paste wiki bodies into the slice (a Sonnet-medium orchestrator
  curating wiki prose defeats the lane). **Emit `WIKI-CONSULT <tier> :: docs=<the
  selected pointer paths>`** (tier from the F0 gate; `docs=none` if no pages fit)
  — the same grounding record as the full/mini lanes. The F0 `GATE` line captured
  the freshness gate *decision*; this captures which pages actually grounded the run.
- the cached pattern injected LITERALLY (same `pattern` slice contract as the
  full lane; the pattern file is small by design)
- **crosslink (cross-repo, advisory):** if `.claude/orc/crosslink/needs.json`
  exists and the task touches a matching boundary call site, inject the cached
  linked contract as `crosslink` (labeled with its effective cross-repo tier +
  "hints, not verified") — advisory, never blocks, never outranks local code. No
  needs file or no boundary → nothing extra.
- **`db:postgres` bonus:** if the task touches the data-access layer
  (repositories/dao/queries, `*.sql`, ORM entities) AND
  `.claude/orc/patterns/postgres-pattern.md` is CACHED, merge it into the same
  `pattern` slice (bound-params-only + pooled-connection + transactional-multi-write
  query invariants). Cache MISS → skip silently — fast never codifies and never
  falls back on this; the framework pattern's parameterized-query invariant still holds.
- the standing `house_rules` card (`../orc/references/house-rules.md`, card
  lines injected literally, same as full/mini)
- constraints from the intent spec
- **terse-return rule:** return the standard contract fields but NO narrative
  prose — files changed, one-line diff summary, smoke-relevant notes only.

Validate the return like every lane: `status`, `actual_files`, `unmet[]`
(`done` with non-empty `unmet[]` is malformed — treat as partial),
`pattern_version` + `invariants_checked` attestation, and `actual_model` +
`actual_effort` — compare claimed-vs-actual and surface any downgrade
(emit the `VERIFY … MATCH/DOWNGRADE` trace line when logging). Malformed
return = failure (one re-dispatch, then fallback offer).

## Phase F3 — Smoke gate (build + test; blocks ship on red)

Run the project's build and fast-test commands **from `wiki-meta.json`'s
`commands` block** (recorded once at wiki scan — do not rediscover tooling; if
the manifest lacks them, detect once and say so). Read-only ship gate, same
rule as mini: never commit on red.

- **GREEN** → ship.
- **RED** → do NOT offer commit. ONE repair round: re-dispatch the SAME
  executor with the failing output as `failure_reason`, re-run the gate.
  Second red → STOP and offer: escalate to orc-mini (fallback contract, reason
  `smoke-red-escalation`) / switch to full `/orc` / stop here.
- No runnable build/test (docs-only change) → say so explicitly, gate is N/A —
  never silently skip.

## Phase F4 — Ship

Offer commit (and push if asked). Then: append the final markers to the
checkpoint, emit `OUTCOME task=… band=fast model=… retries=… unmet=…` and
`FINISH` when logging, show the dispatch line (model/effort actually used) +
the `/usage` reminder. Fast never triggers the post-ship wiki refresh ask
(single task; its preflight polices freshness on the way in) — but the guarded
stale-flag note still applies if the change touched covered files.

## Fallback contract (orc-fast → orc-mini)

Write this block into the run folder and invoke orc-mini pointing at it:

```
FALLBACK-FROM: orc-fast
REASON: wiki-absent | wiki-stale-user-choice | pattern-absent | fit-gate | smoke-red-escalation
INTENT-SPEC: <path to the intent-spec if Phase F1 completed, else "none — raw request follows">
REQUEST: <the raw user request, verbatim>
```

orc-mini accepts the handoff (see its "Fallback intake" section): it skips
re-deriving whatever is carried and runs its normal lane otherwise. The run
folder is already in the shared format — no migration.

## Behavior trace (PERMANENT — same rule as every lane; always on)

Follow `../orc/references/trace-protocol.md` for
fast's phase set: run start → write `log_dir/.current` + store `trace_path` in
the checkpoint; `PHASE` lines at F0–F4 transitions; `GATE` lines for the
preflight/fit/smoke verdicts; `DISPATCH`/`VERIFY` around the executor;
`OUTCOME` + `FINISH` at close, then delete `log_dir/.current`. The
`orc-trace.js` hook bootstraps `log_dir` + `.current` on the first dispatch, so
a trace exists even if the run-start step is skipped.

## Config

Resolve at run start (`../orc/config.md` defaults ← `.claude/orc.config.yaml`):
`wiki_fresh_max` / `wiki_aging_max` (tier edges) + `log_dir` (logging is
permanent — always on). Fast
has no config key of its own — it is command-entry only. Wave/scoring/review
keys never apply; never render or ask them.

## Checkpoint (minimal, append-only)

One `fast-checkpoint.md` in the run folder: GATE results (+ any
`wiki_stale_override`), the dispatch, smoke verdicts, OUTCOME. Enough for
/orc-retro mining and fresh-session resume — nothing more.

## What fast still enforces (from the main hard rules)

- Never implement yourself; always spawn (smoke gate = read-only build+test).
- All artifacts in the run subfolder; never project root.
- Validate the subagent return; malformed = failure.
- Never offer commit on a red build.
- Usage: report the dispatch + remind the user to run `/usage`. Never invoke
  `/usage` programmatically.
