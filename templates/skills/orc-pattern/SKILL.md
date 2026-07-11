---
name: orc-pattern
description: >
  Learn and cache a project's real code conventions per language so ORC executors
  write code that MATCHES the existing codebase instead of a generic template.
  Use for "/orc-pattern", "learn my code pattern", "codify conventions", or when
  ORC detects frontend/backend work with no cached pattern. Reconciles a generic
  best-practice playbook against the project's actual most-recently-modified files:
  the project's CONVENTIONS win, security/correctness INVARIANTS are always kept,
  conflicts are flagged. Writes .claude/orc/patterns/<lang>-pattern.md, reused by
  every future run. EXPENSIVE scan → consent-gated inside /orc (config
  pattern_findings), always allowed on explicit /orc-pattern. The orchestrator
  dispatches the codifier subagent — it never codifies itself.
---

# ORC-PATTERN (code-pattern codifier)

Turns a generic per-language playbook + the project's real files into a
**reconciled project pattern** that executors follow. This prevents the generic
playbook from fighting an established (often better) house style and producing
inconsistent, un-mergeable code.

This is a THIN SPINE. Load a playbook (`references/<domain>-<lang>.md`) and the
codifier ONLY for the languages actually in play — never preload all of them.

## The two rule classes (the whole point)

Every playbook splits into two kinds of rules, reconciled differently:

| Class | Examples | On conflict with the project |
|-------|----------|------------------------------|
| **Conventions** (style/shape) | folder layout, naming, DI style, RSC-by-default, delivery order | **PROJECT WINS** — match the codebase, even if the playbook disagrees |
| **Invariants** (correctness/security) | no plain-text passwords, no SQL string-interpolation, no secrets/stack-traces in responses, effect cleanup, no index-as-key | **ALWAYS APPLIED** — a project violating these is buggy, not stylistically different |

Reconciliation is therefore cheap: you only ever override the *soft* half.

## Hard rules

1. **You never codify yourself — you spawn.** Dispatch
   `orc-pattern-codifier-sonnet-5-high` (Opus for large/messy repos). The codifier
   reads and returns the reconciled pattern; YOU write it to the cache.
2. **Cache lives at `.claude/orc/patterns/<lang>-pattern.md`** (project `.claude/`,
   OUTSIDE `templates/` — `orc update` never clobbers it). One file per language.
3. **Canonical pattern on inconsistency = most-recently-modified files win.** They
   show where the codebase is heading (correct for future refactor use). Flag any
   real ambiguity to the user ONCE, don't guess silently.
4. **Greenfield (no existing code for that language) → no reconcile.** Emit the
   pure generic playbook as the pattern, marked `source: generic`.
5. **Invariants are never dropped**, even when a conflicting convention is kept.

## Three entry points, one cache

1. **Lazy** — the `/orc` dispatch step, on a cache miss (governed by config
   `pattern_findings: ask | on | off`, default `ask`; see `../orc/config.md`).
2. **Eager** — invoked by `orc-wiki` when `orc_wiki_pattern_findings: on`: codify
   ALL detected languages as a byproduct of the wiki's full scan (rides under the
   wiki's existing scan-consent — no separate ask).
3. **Manual** — `/orc-pattern` (all detected langs, or a named one),
   `/orc-pattern --refresh` to force-regenerate.

## Behavior trace (config `logging` — every ORC entry point traces)

When run standalone (`/orc-pattern`, not inside an /orc or orc-wiki run that
already owns a trace), resolve `logging` + `log_dir` (`../orc/config.md`
defaults + `.claude/orc.config.yaml`) at start. When `logging: true`, follow
`../orc/references/trace-protocol.md`: write `log_dir/.current` =
`<slug>-<DDMMYY>.txt` BEFORE dispatching the codifier, emit
`PHASE`/`DISPATCH`/`VERIFY` (claimed-vs-actual) lines, then `FINISH` + delete
`.current`. Inside another ORC run, that run's trace covers this — never open a
second one. When `logging: false`, do none of this.

## Phase 0 — Entry & auto-branch (on /orc-pattern)

Detect the project's frontend/backend languages from deps + file extensions
(`references/INDEX.md` has the detection map). Then branch **per language**:
- **Cache miss** (no `patterns/<lang>-pattern.md`) → codify (Phase 1).
- **Cache hit, no drift** → report "already learned (pattern_version …)"; skip
  unless `--refresh`.
- **Cache hit, DRIFT** (current files diverge from the doc's recorded fingerprint)
  → auto-refresh: re-codify. Drift detection is a cheap structural fingerprint of
  a few representative files, NOT a full re-scan.

## Phase 1 — Codify (spawned subagent, per language)

For each language needing codification, dispatch the codifier with the slice:
- `lang`, `domain` (FE|BE), the generic playbook path
  (`references/<domain>-<lang>.md`), and the sample set = the most-recently-modified
  real files for that language (use `git log`/mtime; cap ~8 files).

The codifier returns the reconciled pattern per `schemas/pattern-doc.md`
(Conventions [project-won] + Invariants [always] + Conflicts flagged + an
optional `validation_gate[]` [when the playbook defines one] + a
`fingerprint` + a `pattern_version` = `<date>-<letter>`). Validate the return, then
YOU write `.claude/orc/patterns/<lang>-pattern.md` — include the Validation-gate
section when the return carries one. The gate flows downstream as part of the
injected `pattern` (executors satisfy it; the verifier folds its enforceable
lines into the acceptance criteria). Enforceable-vs-advisory is decided at
reconciliation per the schema's measurability rule — never downstream.

## Phase 2 — Report

Per language: written / skipped / refreshed, `pattern_version`, and any flagged
conflicts or ambiguity the user should resolve. Never run tests; never change
project code — this skill only writes the pattern cache.

## Agnostic fallback (when NO pattern is generated)

If the user declines codification (config `pattern_findings: off`, or "no" at the
`/orc` ask), executors use the **language-agnostic** path: no codifier, no scan —
the executor applies the playbook **invariants** (still blocking) and imitates the
1–2 neighboring files it already reads for its slice. Cheap by construction,
persists nothing. See `../orc/config.md`.
