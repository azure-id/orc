---
name: orc-analyze
description: >
  System Analyst for ORC. Use for "/orc-analyze",
  "analyze this doc for scope X", "analyze this requirement against the code", or
  when a requirement — a document (PDF by path or pasted) OR a plain-language
  request — must be turned into a precise, code-grounded requirement set BEFORE
  any planning. Bounds scope to exactly what the user asked (recognizes other
  scopes only to exclude them), maps each requirement to real files with file:line
  evidence, verifies every claim against actual code, and challenges the user
  interactively with recommended options. Offers an opt-in DEEP mode (wider code
  sweep via scouts, verify-every-claim, more questions, alternatives + risks) that
  costs more tokens/time. Prevents scope-bleed, stale-doc drift, and requirement
  hallucination. Also auto-triggers inside /orc when a doc or ambiguous
  requirement is present. The orchestrator dispatches this work to a subagent —
  it never analyzes itself.
---

# ORC-ANALYZE (System Analyst)

The orchestrator stays on top and **dispatches a System Analyst subagent
(Opus 4.8, high)** to do this work — it never analyzes itself, keeping its own
context lean. This skill defines what that subagent does, how the orchestrator
runs the standard/deep gate + scout dispatch, and how it relays challenges and
branches on the result.

Purpose: turn "this requirement" — a document OR a bare request — into a
confirmed, code-grounded requirement set that a planner cannot misread, so
implementation never bleeds into other scopes, never builds against claims the
code already contradicts, and never rests on an unstated assumption about what
the user meant.

## Hard rules

1. **Dispatched, not self-run.** The orchestrator coordinates; the Analyst
   subagent (Opus 4.8 high) reads the source, reads the code, and reconciles.
2. **Evidence-or-mark (never hallucinate).** Every requirement interpretation and
   every code claim carries `file:line` evidence, OR an explicit `ASSUMPTION` /
   `UNVERIFIED` tag — and every tagged item becomes a clarifying question. The
   Analyst never silently assumes what the user meant or what the code does.
3. **Recognize-to-exclude.** Other scopes (Y, Z) are recognized only to police
   the boundary. The written report contains ONLY the requested scope X.
4. **Ground against real code.** Every in-scope requirement (or audit row) maps
   to specific files/modules, verified to exist and match, with evidence.
5. **Challenge with recommended options, one issue at a time.** Each challenge is
   a small option-set (2–3 choices) with ONE flagged **recommended** option and a
   one-line reason — not an open-ended question, not a batch. Each answer is
   recorded in the report. Scope + accuracy only (task breakdown is the planner's).
6. **Two artifacts, spec derived from report.** The human `report.md` is the
   source of truth you confirm; `requirement-spec.md` is DERIVED from it (a
   projection, so they can't drift).
7. Usage: report dispatch + remind the user to run `/usage`. Never invoke it.

## Phase A — Ingest & detect source mode

Read the source. **Auto-detect** which of three modes applies:
- **prose/spec** — a document of narrative requirements, or
- **audit/structured** — a document with columns like expectation / notes / result, or
- **requirement** — NO document; the user's plain-language request is the source
  of truth. Reconcile the request itself against the code (is it consistent with,
  buildable on, or in conflict with what already exists?).

**Confirm the detected mode with the user** (e.g. "No doc here — I'll treat your
request as the requirement and reconcile it against the code, in requirement
mode. Good?"). For documents, confirm prose vs audit as before.

## Phase A′ — Standard vs Deep gate (default STANDARD)

Before reconciliation, offer the depth choice (config `default_analysis_depth`
presets the default; the run still confirms):

> "I can run a **deep analysis** — wider code sweep, verify every claim, more
> clarifying questions, and implementation options with trade-offs. It costs
> noticeably more tokens and time. **Standard** is faster and covers the
> load-bearing cases. Deep or standard?
> (Tip: to make deep the default and skip this prompt's default, run
> `orc config set default_analysis_depth deep` — a zero-token CLI change.)"

Deep requires explicit consent — it never auto-escalates. In deep mode the run is
**two-pass with scouts** (Phase C-deep). Standard mode is single-pass. Presetting
`default_analysis_depth` via `orc config` only changes which option is the
default — the run still confirms.

## Phase B — Bound scope

Take the user's scope instruction (X). Identify the source's full scope structure
internally (X, Y, Z…), isolate X, and set the rest aside — they will NOT appear
in the output. If the user didn't name a scope, ask (recommended-option form).

## Phase C — Reconcile against code (mode-specific)

- **Prose mode:** for each in-scope requirement, find the files/modules it
  touches (with `file:line` evidence) and confirm exists / already implements /
  missing / conflict.
- **Audit mode:** for each in-scope row, take its claim (result + notes) and
  verify against the code with evidence. Surface divergences:
  - result PASS but notes suggest a change → challenge.
  - result FAIL citing a reason the code contradicts (e.g. a UUID check the
    code has renamed/removed/replaced) → challenge; the audit premise is stale.
- **Requirement mode:** for each part of the request, find where in the code it
  lands (with evidence), and classify: buildable-as-stated / already-exists /
  conflicts-with-existing / underspecified. Anything you cannot ground →
  `ASSUMPTION`/`UNVERIFIED` → clarifying question.

Anything unground-able in ANY mode is tagged and becomes a question — never a
silent guess.

### Phase C-deep — two-pass reconciliation with scouts (DEEP mode only)

1. **Pass 1 (scope + scout-plan).** After Phase B, instead of sweeping the repo
   yourself, emit a **scout plan**: a short list of coverage areas, each with
   concrete search queries (e.g. "all call sites of `authToken`", "tests touching
   checkout", "config for rate limits"). Return the plan to the orchestrator. Do
   NOT do the full reconciliation yet.
2. **Scouts (orchestrator-dispatched).** The orchestrator dispatches ≤`max_scouts`
   (config, default 3) parallel read-only `orc-scout-sonnet-4-6-high` agents, one
   coverage area each. They return **code-evidence bundles** (file:line hits,
   dependents, tests, config).
3. **Pass 2 (reconcile).** You are re-dispatched WITH the bundles. Do the full
   reconciliation using them: **verify every claim** (not just load-bearing),
   evidence-or-mark discipline, and produce the deep-only **Alternatives & risks**
   section (implementation-approach options, trade-offs, blast radius, edge
   cases). The scout plan/areas decided coverage — the orchestrator only
   dispatched; you own what got scouted and how the evidence is used.

## Phase D — Challenge (interactive, recommended options, one at a time)

For every scope-bleed, doc/requirement-vs-code divergence, and every
`ASSUMPTION`/`UNVERIFIED` tag, ask the user a single focused question shaped as a
2–3 option set with ONE **recommended** option + a one-line reason. Wait, record
the answer, continue. Never batch. Scope + accuracy only — not task breakdown.

## Phase E — Write report, derive spec

1. Write `report.md` in the mode template (schemas/report-audit.md,
   report-prose.md, or report-requirement.md) into
   `.claude/skills/orc/analyzer/{analysis-name}/` (internal). Include the
   Evidence column and the **Assumptions & Open Questions** section; in deep mode
   also the **Alternatives & risks** section.
2. Derive `requirement-spec.md` FROM the confirmed report
   (schemas/requirement-spec.md) in the same internal folder.

## Phase F — Branch (plain-language choice, multi-analyze loop)

Artifacts are written INTERNALLY to `orc/analyzer/{name}/`. After EACH analysis
completes, the orchestrator offers a plain-language menu. The options shown
depend on how many analyses exist this run.

### After the 1st analysis (one analysis exists)
1. **Stop here** → COPY `report.md` OUT to `{report_out_dir}/{name}/` and stop.
2. **Pass to build** → hand both internal files to the ORCHESTRATOR (Phase 1
   planner → full pipeline). The analyst NEVER builds directly.
3. **Analyze another RELATED doc** → the next analysis must be context-related to
   this one so the two can be combined later. Go to the relatedness gate.

### Relatedness gate (before the next analysis starts)
Ask: "Is this related context (same scope, so it can be combined)?"
- **Yes** → run the next analysis (a normal orc-analyze pass), then show the
  "2+ analyses" menu below.
- **No** → combining doesn't apply. Offer a small choice: (a) take the
  already-completed analysis (or analyses, if 2+ exist) into orc build as-is —
  each spec builds as its OWN pipeline (the planner consumes one spec at a time;
  uncombined specs are NEVER handed to a single planner run), (b) analyze the new
  doc as a STANDALONE analysis that goes to build on its own, or (c) stop.

### After the 2nd+ analysis (2+ analyses exist)
1. **Stop here** → COPY every report OUT and stop.
2. **Pass to context-combiner** → the orchestrator dispatches
   `orc-context-combiner-opus-4-8-high` with the list of confirmed spec paths for
   all RELATED analyses this run. It verifies relatedness, resolves conflicts with
   the user, and writes `combined-report.md` + `combined-requirement-spec.md`.
3. **Analyze another related doc** → back to the relatedness gate (loop).

### After the combiner returns
The orchestrator offers (gating on the combiner's `handoff_ready`):
1. **Stop here** → the combined report is copied OUT for the user.
2. **Pass to orc build** → the combined spec goes to Phase 1 planning and the
   full pipeline.

If the combiner returned `handoff_ready: false` (an unresolved conflict remains),
offer ONLY **Stop here** — the build option is withheld until the conflict is
resolved. If the combiner returned `combined: false` (user chose keep-separate at
the relatedness challenge), the analyses stay separate — fall back to the
per-analysis stop/build choice above, where each spec builds as its OWN pipeline
(uncombined specs are never handed to a single planner run).

## Mini variant

For the fast lane, `orc-analyze-mini` (Sonnet 5 high) does a shallower version of
the same flow: doc-optional intake, evidence-or-mark, and recommended-option
questions — but **no deep mode and no scouts** (always single-pass). Used by
orc-mini. Same artifacts, same output contract; trimmed depth. See that skill.
