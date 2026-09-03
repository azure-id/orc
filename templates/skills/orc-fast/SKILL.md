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

## Phases

`orc lane phases orc-fast --json` is this lane's pipeline: the ordered list, where
each phase lives, and how much of it to read. **The CLI owns the order** — never
derive it from the headings below, and never renumber or rename one without the
manifest, because a `read: section` pointer names a HEADING and a renamed heading
is a pointer into nothing.

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

**c. Gotchas — NOT a gate.** Two prerequisites stay two: a missing `.claude/orc/gotchas.md` never forces a fallback. Fast READS repair memory (`orc gotcha status`, then inject the SCOPE-MATCHING entries into the F2 slice, cap 3) and never WRITES it — `../_shared/gotchas.md` §10.

**d. Extra — a PROBE, not a gate (P0).** Run `orc extra resolve --slot fast-executor --json` (0 = extra, 1 = Claude) — **a gate that is never probed is a gate that is always off**, and without this step the lane silently runs on Claude however `extra_enabled` and `orc extra role` were set. `extra` → print the `extra:` line HERE and carry the answer into F2; `claude` → print nothing, never fall back, never stop.

The SHAPE of these steps — the order, and the four rules that make it worth
having — is `../_shared/phases/preflight.md` (`core`). The probes
themselves are this lane's own and stay here.

## Phase F1 — Fit gate + micro-intake (one pass, ONE user round-trip)

Draft a 3–5 line intent spec + 2–3 acceptance bullets. Judge fit: more than
one real task, ~5+ files, or core/security-sensitive surface → fallback to
orc-mini WITH the intent spec attached (no rework); emit a `GATE` line for the
verdict. Then the lane's ONLY pre-spawn ask — one combined confirmation:
preflight result + intent spec + acceptance bullets + "proceed?" (soft
sign-off; never split into multiple questions). Create the run folder
(`.claude/orc/run/{run-slug}/` — shared format, so fallback needs no
migration) and write the intent-spec + a minimal checkpoint.

## Phase F2 — Slice build + dispatch (ONE executor)

Build one slice for `orc-executor-sonnet-4-6-high` (dispatch BY NAME; model
pinned in the agent file). **Under `opus5_only` it is `orc-executor-opus-5-low`** — forced, and while that mode is on this lane needs an Opus 5 main session, so the "runs fine at Sonnet medium" premise applies only with it off (`../_shared/opus5-only.md`).

**Extra (`extra_enabled`, `../_shared/extra-dispatch.md`):** the same slice may run off Claude. **This lane has no score at all, so it holds a POSITION, not a band:** resolve `orc extra resolve --slot fast-executor --json` (set with `orc extra role set fast-executor <profile>/<model>`). No row on that slot = Claude, and that is an answer, not a gap. The `extra:` line joins the F0 preflight (P0, printed whenever the gate is on) and NAMES the agent it displaces — `orc-executor-sonnet-4-6-high`; dispatch through `orc extra dispatch --task <file> --json` with `slot: "fast-executor"` and **no `score`** (both is refused by name); validate with `return-validation.md` **§2b, not §2**; a failure runs `orc extra reconcile <task_id>` FIRST — a worktree that moved is RESUMED, never re-done — then falls back to that same pinned agent BY NAME, announced. Extra is orthogonal to the knowledge gate — a fresh wiki and a cached pattern are still required, and a foreign worker gets the same pointers-not-content slice.

- the task (intent spec) + acceptance bullets as definition-of-done
- **wiki pointers, not content** (fast's lane-delta in
  `../_shared/phases/wiki-consult.md`): the PATHS of 1–3 relevant pages
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
- **the read ladder** (`../_shared/read-ladder.md`): read only as far up as the
  question needs — a file the task will EDIT is read in full first. Precomputed
  knowledge REPLACING exploration is this lane; a directory sweep is not.
- the standing `house_rules` card (`../_shared/phases/house-rules.md`,
  injected literally, same as full/mini)
- constraints from the intent spec
- **terse-return rule:** standard contract fields, NO narrative prose — files
  changed, one-line diff summary, smoke-relevant notes only.

Validate the return per `../_shared/return-validation.md` — `unmet[]`
honesty, `pattern_version` + `invariants_checked` attestation, `actual_model`
/ `actual_effort` downgrade check (emit the `VERIFY` trace line), and §6's worktree delta (`git status --short` before/after; a path changed outside `declared_files` is a violation whatever the return said). Malformed
return = failure (one re-dispatch, then fallback offer).

**Before any re-dispatch, run `orc run inflight`** (0 clear · 1 in-flight · 2 unknown). A Task error does not kill the agent behind it, and exit 2 REFUSES by default — `a lane that re-dispatches over a live attempt` has broken the contract. Canonical: `../_shared/return-validation.md`.

## Phase F3 — Smoke gate (build + test; blocks ship on red)

Run the gate per `../_shared/smoke-gate.md`, sourcing commands **from
`wiki-meta.json`'s `commands` block** (recorded at wiki scan — don't
rediscover tooling; manifest lacks them → detect once and say so). **GREEN**
→ ship. **RED** → one repair round; second red → STOP and offer: escalate to
orc-mini (reason `smoke-red-escalation`) / switch to full `/orc` / stop.
Docs-only → gate N/A, say so.

## Phase F3.5 — Mock example (config `mock_example`, default ask)

Canonical: `../_shared/drift-recovery.md` — load on fire. Only after a GREEN
F3, before ship: `ask` → MANDATORY offer · `on` → build · `off` → skip.
Deliverable `mock-examples/<change-slug>/` at project root — **never
committed/staged**. Drift answer → `DRIFT-FROM` recovery (cap 2 loops, honest
report on cap). Trace: `PHASE mock-example`, `DRIFT loop=<n>`.

## Phase F4 — Ship

Offer commit (push if asked; never stage `mock-examples/`). Append the final markers to the checkpoint, emit
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

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases` names
the file and the layers). Lane token `fast`, tier **Build lanes** —
per phase, batched to **2 packets** (preflight+dispatch · gate+ship), each
paired with the next phase's first dispatch.
At run start write `log_dir/.current` = `run-fast-<slug>-<DDMMYY>-<HHMMSS>.txt` AND
`touch the trace file` of that name in the SAME step.
Nothing else about the protocol is restated here; a phase that ends with
`zero new trace lines is a protocol violation`.

## Config

**ONE resolver, and it is not you:** `orc lane config orc-fast --json`. Obey
`effective`, print every line in `announce[]` VERBATIM at preflight, and honour
`stops[]` before wave 1. Never re-derive a value, a precedence or an inertness
from `.claude/orc.config.yaml` — a key this lane does not read is not in the
answer, and a key another key shadows comes back already marked. Exit ≠ 0 → say
the CLI is unavailable and fall back to `../_shared/config-precedence.md`'s
documented defaults, out loud. Priorities and families:
`../_shared/config-precedence.md`.

Fast has no config key of its own — command-entry only; wave/scoring/review
keys never apply, and the tier edges the F0 gate reads arrive resolved.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls orc-fast --json` names every
CLI call this lane makes, each with its exit-code contract, its cost, when to run
it, and what an EMPTY answer means. Never invent a spelling, never re-word an
exit code, and never re-derive a state word — the CLI's state words are the only
state words, and **an exit code is an ANSWER wherever that contract says so, not
a failure**. A call the answer does not name is a call this lane does not make.
Exit ≠ 0 from the catalogue itself → say the CLI is unavailable and name the
command you are about to run, out loud, before running it.

## Checkpoint (minimal, append-only)

One `fast-checkpoint.md` in the run folder: GATE results (+ any
`wiki_stale_override`), the dispatch, smoke verdicts, OUTCOME — enough for
/orc-retro mining and fresh-session resume, nothing more.

## What fast still enforces (from the main hard rules)

Never implement yourself (smoke gate = read-only build+test) · all artifacts
in the run subfolder, never project root · validate the subagent return
(malformed = failure) · never offer commit on a red build · report the
dispatch + remind the user to run `/usage` (never invoke it programmatically).

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **full** · safe point **after the executor returns**. `soft` FORCES that checkpoint and does NOT stop if the write fails; `hard` skips it and can lose an in-flight return. Never begin a wait between a dispatch and its validated return, or before the smoke gate has reported.
