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

The speed lane: precomputed knowledge instead of pipeline phases — the wiki
supplies grounding, the pattern cache supplies house style, so fast pays for
neither an analyst nor a planner. That trade only holds when both exist and
the wiki is fresh, so the two prerequisite gates below are hard: fail either →
**fall back to orc-mini** carrying whatever intake was done. Fallback is the
router — orc-fast is always safe to try.

Runs fine with the orchestrator at **Sonnet 4.6 / Sonnet 5, medium effort** —
no scoring, no planning judgment (the effort guard only gates the full `orc`
skill). **You never implement — you spawn.**

## What fast deliberately does NOT have

No analyst, planner, scoring, waves, reviewer, verifier, test-author, or
summary. One executor, one smoke gate, one repair round. More than that → the
fit gate hands it to orc-mini.

## Phase F0 — Preflight (the two prerequisite gates; no spawn)

Emit a `GATE` trace line per check when logging.

**a. Wiki gate.** Decide existence with `orc wiki status` — the deterministic
probe in `../_shared/detecting-artifacts.md`, never an ad-hoc `find` (`.claude`
is hidden). `none` = gate FAILED → fallback; else wiki present → compute the
tier from `.claude/orc/wiki-meta.json` per `../orc-wiki/references/staleness.md`:
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
deps, same signals as the full lane's tagging) and confirm the cache with
`orc pattern status <lang>` (exit 0 = cached — the deterministic probe in
`../_shared/detecting-artifacts.md`, never an ad-hoc `find`). Absent for the
language in play → gate FAILED → fallback. (A request touching no FE/BE language — pure docs/
config — passes this gate as N/A.) The cross-cutting `postgres` pattern is
NEVER a gate prerequisite — it is bonus-only (injected at F2 on a cache HIT),
so a missing `postgres-pattern.md` never fails the gate or forces a fallback.

**Any gate FAILED** → announce which prerequisite failed in one line, then
hand off to orc-mini via the fallback contract below. Never stop the chat.

## Phase F1 — Fit gate + micro-intake (one pass, ONE user round-trip)

Draft a 3–5 line intent spec + 2–3 acceptance bullets. Judge fit: more than
one real task, ~5+ files, or core/security-sensitive surface → fallback to
orc-mini WITH the intent spec attached (no rework); emit a `GATE` line for the
verdict. Then the lane's ONLY pre-spawn ask — one combined confirmation:
preflight result + intent spec + acceptance bullets + "proceed?" (soft
sign-off; never split into multiple questions). Create the run folder
(`.claude/skills/orc/run/{run-slug}/` — shared format, so fallback needs no
migration) and write the intent-spec + a minimal checkpoint.

## Phase F2 — Slice build + dispatch (ONE executor)

Build one slice for `orc-executor-sonnet-4-6-high` (dispatch BY NAME; model
pinned in the agent file):

- the task (intent spec) + acceptance bullets as definition-of-done
- **wiki pointers, not content** (fast's lane-delta in
  `../orc/references/wiki-consult.md`): the PATHS of 1–3 relevant pages
  selected from `wiki/INDEX.md` by keyword match — prefer the cross-cutting
  maps (`orc-reference-api-surface` etc.) when the domain matches. Instruct
  the executor to READ them first, and include the precedence line verbatim:
  `code > fresh wiki > stale wiki (hints) > model priors`. Never paste wiki
  bodies into the slice (a Sonnet-medium orchestrator curating wiki prose
  defeats the lane). **Emit `WIKI-CONSULT <tier> :: docs=<the selected pointer
  paths>`** (tier from the F0 gate; `docs=none` if no pages fit) — the F0
  `GATE` line captured the gate *decision*; this captures which pages grounded
  the run.
- the cached pattern injected LITERALLY (same `pattern` slice contract as
  full; the pattern file is small by design)
- **crosslink (cross-repo, advisory):** a task touching a boundary in
  `.claude/orc/crosslink/needs.json` gets the cached linked contract injected
  as `crosslink` ("hints, not verified") — advisory, never blocks, never
  outranks local code.
- **`db:postgres` bonus:** a data-access task with
  `.claude/orc/patterns/postgres-pattern.md` CACHED merges it into the same
  `pattern` slice (query invariants). Cache MISS → skip silently — fast never
  codifies and never falls back on this.
- the standing `house_rules` card (`../orc/references/house-rules.md`,
  injected literally, same as full/mini)
- constraints from the intent spec
- **terse-return rule:** standard contract fields, NO narrative prose — files
  changed, one-line diff summary, smoke-relevant notes only.

Validate the return per `../_shared/return-validation.md` — `unmet[]`
honesty, `pattern_version` + `invariants_checked` attestation, `actual_model`
/ `actual_effort` downgrade check (emit the `VERIFY` trace line). Malformed
return = failure (one re-dispatch, then fallback offer).

## Phase F3 — Smoke gate (build + test; blocks ship on red)

Run the gate per `../_shared/smoke-gate.md`, sourcing commands **from
`wiki-meta.json`'s `commands` block** (recorded at wiki scan — don't
rediscover tooling; manifest lacks them → detect once and say so). **GREEN**
→ ship. **RED** → one repair round; second red → STOP and offer: escalate to
orc-mini (reason `smoke-red-escalation`) / switch to full `/orc` / stop.
Docs-only → gate N/A, say so.

## Phase F4 — Ship

Offer commit (push if asked). Append the final markers to the checkpoint, emit
`OUTCOME task=… band=fast model=… retries=… unmet=…` + `FINISH`, show the
dispatch line (model/effort actually used) + the `/usage` reminder. Fast never
triggers the post-ship wiki refresh ask (preflight polices freshness on the
way in) — the passive stale-flag note still applies to touched covered files.

## Fallback contract (orc-fast → orc-mini)

Follow the writer side of `../_shared/fallback-handoff.md`: announce the
failed gate in one line, write the `FALLBACK-FROM` block into the run folder
(REASON: wiki-absent | wiki-stale-user-choice | pattern-absent | fit-gate |
smoke-red-escalation), and invoke orc-mini pointing at it. The run folder is
already in the shared format — no migration.

## Behavior trace (PERMANENT — same rule as every lane; always on)

Follow `../orc/references/trace-protocol.md` for fast's phase set: run start
write `log_dir/.current` + store `trace_path` in the checkpoint; append AS THE
RUN GOES — each F0–F4 `PHASE` line BEFORE announcing it, `GATE` at the
preflight/fit/smoke verdicts, `DISPATCH`/`VERIFY` around the executor,
`OUTCOME` + `FINISH` at close, then delete `log_dir/.current`. A phase ending
with zero new trace lines is a protocol violation — go append them now. (The
hook bootstraps `.current` on the first dispatch.)

## Config

Resolve at run start (`../orc/config.md` ← `.claude/orc.config.yaml`):
`wiki_fresh_max` / `wiki_aging_max` (tier edges) + `log_dir`. Fast has no
config key of its own — command-entry only; wave/scoring/review keys never
apply.

## Checkpoint (minimal, append-only)

One `fast-checkpoint.md` in the run folder: GATE results (+ any
`wiki_stale_override`), the dispatch, smoke verdicts, OUTCOME — enough for
/orc-retro mining and fresh-session resume, nothing more.

## What fast still enforces (from the main hard rules)

Never implement yourself (smoke gate = read-only build+test) · all artifacts
in the run subfolder, never project root · validate the subagent return
(malformed = failure) · never offer commit on a red build · report the
dispatch + remind the user to run `/usage` (never invoke it programmatically).
