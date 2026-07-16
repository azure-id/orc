---
name: orc-analyze
description: >
  System Analyst for ORC. Use for "/orc-analyze", "analyze this doc for scope
  X", or "analyze this requirement against the code" — turning a requirement (a
  document, PDF by path or pasted, OR a plain-language request) into a precise,
  code-grounded requirement set BEFORE any planning. Bounds the deliverable to
  exactly the asked scope, pulls related adjacent scopes in only as anchored
  "do not build" context, maps each requirement to real files with
  quote-anchored file:line evidence, and challenges the user with recommended
  options. Opt-in DEEP mode adds a scout-driven code sweep, verify-every-claim,
  and alternatives + risks. Also auto-triggers inside /orc on a doc or
  ambiguous requirement. The orchestrator dispatches this to a subagent — it
  never analyzes itself.
---

# ORC-ANALYZE (System Analyst)

The orchestrator stays on top and **dispatches a System Analyst subagent
(Opus 4.8, high)** to do this work — it never analyzes itself, keeping its own
context lean. This skill defines what that subagent does, how the orchestrator
runs the standard/deep gate + scout dispatch, and how it relays challenges and
branches on the result.

**Worked example** (orient only — never execute from it): `examples/analyze-mock.md`.

Purpose: turn "this requirement" — a document OR a bare request — into a
confirmed, code-grounded requirement set that a planner cannot misread, so
implementation never bleeds into other scopes, never builds against claims the
code already contradicts, and never rests on an unstated assumption about what
the user meant.

## Hard rules

1. **Dispatched, not self-run.** The orchestrator coordinates; the Analyst
   subagent (Opus 4.8 high) reads the source, reads the code, and reconciles.
2. **Evidence-or-mark (never hallucinate) — quote-anchored.** Every
   requirement interpretation and code claim carries `file:line — "verbatim
   snippet"` evidence (≤1 line, quoted not paraphrased; no quote →
   auto-downgrades to `UNVERIFIED`) OR an explicit `ASSUMPTION`/`UNVERIFIED`
   tag — every tagged item becomes a clarifying question. **Absence claims**
   (`status: missing|buildable`) instead carry `searched:` — the concrete
   globs/greps run; no `searched:` note = `UNVERIFIED`. Never silently assume
   what the user meant or what the code does.
3. **Recognize-to-exclude-from-build; include-related-as-context.** Two
   perimeters, not one: the **scope perimeter** (what gets BUILT = X only — Y/Z
   never become requirements or tasks) and the wider **context perimeter** (what
   the Analyst READS to get X right).
3a. **Anchored context (the anti-creep guard — stated ONCE; Phases C/D/E
   apply it).** Every context item MUST name the in-scope requirement it
   serves + the dependency type (consumes-output / guards-invariant /
   shares-file / doc-references); no anchor → scope-bleed, dropped. It is
   touchpoint-bounded (the specific field/function/invariant, never all of
   Y), quote-anchored, and labeled non-actionable: NEVER turned into a task.
4. **Ground against real code — with a stated floor.** Standard mode MUST
   verify: (a) every row that emits a `files[]` entry, (b) every
   `status: exists|conflict` claim, (c) every claim the user's scope sentence
   directly names. Peripheral doc claims that produce no requirement MAY stay
   tagged instead of verified. Deep mode verifies EVERY claim. The mini analyst
   states the same floor (a)+(b) — trimmed depth never means a lower floor.
5. **Challenge with recommended options — triaged.** Each challenge: 2–3
   choices, ONE flagged **recommended** + a one-line reason. **Blocking**
   (scope changes, code-vs-doc conflicts, anything changing `files[]` or a
   status) → asked ONE at a time. **Advisory** (wording, naming,
   non-load-bearing assumptions) → ONE batched sign-off round with
   recommended defaults. Every challenge is RECORDED in the report. Scope +
   accuracy only (task breakdown is the planner's).
6. **Two artifacts, spec derived from report — and it must MATCH.** The human
   `report.md` is the source of truth you confirm; `requirement-spec.md` is
   DERIVED from it. The orchestrator lints the derivation on return (Phase F
   gate) — R# ids, statuses, and context anchors must match exactly.
7. Usage: report dispatch + remind the user to run `/usage`. Never invoke it.

## Behavior trace (PERMANENT — every ORC entry point traces; always on)

When run standalone (`/orc-analyze`, not inside an /orc run that already owns
a trace — never open a second one), follow
`../orc/references/trace-protocol.md`: write `log_dir/.current` =
`<slug>-<DDMMYY>.txt` BEFORE the first dispatch. **Cadence — written AS THE
RUN GOES:** each phase A→F appends its `PHASE` line BEFORE you announce that
phase; `DISPATCH`/`VERIFY` per analyst/scout spawn; `GATE` lines at the
evidence/derivation gates; then `FINISH` + delete `.current`. A phase with
zero new trace lines is a protocol violation — go append them now. (The hook
bootstraps `.current` on the first dispatch, so the skeleton is never lost.)

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
presets the default; the run still confirms): deep = wider sweep, verify every
claim, more questions, alternatives with trade-offs, noticeably more tokens;
standard = faster, verifies the stated floor (hard rule 4). Mention the
zero-token default switch `orc config set default_analysis_depth deep`. Deep
requires explicit consent — never auto-escalates — and is **two-pass with
scouts**: load `references/deep-mode.md`. Standard is single-pass.

## Phase B — Bound scope

Take the user's scope instruction (X). Identify the source's full scope structure
internally (X, Y, Z…), isolate X, and set the rest aside from the **deliverable** —
Y/Z never become requirements or tasks. If the user didn't name a scope, ask
(recommended-option form). Adjacent scopes are NOT gone: they may re-enter in
Phase C as anchored context per rule 3a.

## Phase C — Reconcile against code (mode-specific)

Apply the hard rule 4 coverage floor (standard) or verify-every-claim (deep).

- **Prose mode:** per in-scope requirement, find the files/modules it touches
  (quote-anchored) and confirm exists / already implements / missing
  (`searched:`) / conflict.
- **Audit mode:** per in-scope row, verify its claim (result + notes) against
  the code. Divergences → challenge: result PASS but notes suggest a change;
  or result FAIL citing a reason the code contradicts (stale audit premise).
- **Requirement mode:** per part of the request, find where it lands in the
  code and classify: buildable-as-stated / already-exists /
  conflicts-with-existing / underspecified. Ungroundable →
  `ASSUMPTION`/`UNVERIFIED` → clarifying question.

**Anchored context sweep (all modes, both depths):** when an in-scope item
depends on an adjacent scope, capture the specific touchpoint as context per
rule 3a; pulling it in is offered as a Phase D challenge. **Deep mode:**
two-pass with orchestrator-dispatched scouts — `references/deep-mode.md`.
Anything ungroundable in ANY mode is tagged and becomes a question.

## Phase D — Challenge (interactive, triaged per hard rule 5)

For every scope-bleed, requirement-vs-code divergence, and
`ASSUMPTION`/`UNVERIFIED` tag: classify blocking vs advisory per hard rule 5,
ask accordingly, record every answer. Adjacent context is also a challenge
(usually advisory): offer to pull the touchpoint in as read-only,
non-actionable context with a recommended default — never propose building
the adjacent scope.

## Phase E — Write report, derive spec

0. **Anchor-validation pass.** Drop every context item that fails rule 3a.
1. Write `report.md` in the mode template (schemas/report-audit.md /
   report-prose.md / report-requirement.md) into
   `.claude/skills/orc/analyzer/{analysis-name}/` (internal): Evidence column
   (quote-anchored + `searched:` per rule 2), **Assumptions & Open
   Questions**, the **Additional context (do not build)** section when any
   context survived step 0; deep mode adds **Alternatives & risks**.
2. **Confirm the report with the user**, then derive `requirement-spec.md`
   FROM the confirmed report (schemas/requirement-spec.md) — never from an
   unconfirmed draft. Stamp `git_head` + `dirty` so staleness is detectable
   at plan time. The spec carries the confirmed **Context & invariants (do
   not build)** block — non-actionable guardrails, never tasks.
3. **handoff_ready is a checklist, not a feeling** — true only when ALL of:
   (a) blocking challenges resolved, (b) zero open `UNVERIFIED` in scope,
   (c) every requirement has status + evidence-or-resolution, (d) spec
   derived after user confirmation, (e) `scope_closed: true` written.

## Phase F — Gates, then branch

**Orchestrator gates (deterministic — full detail in
`../orc/references/analyst-gates.md`).** Evidence spot-check (Glob every
`files[]` path; Grep-verify quotes on `status: exists|conflict`) + derivation
lint (R# ids, statuses, context-anchor set match between report.md and
requirement-spec.md; a context `anchor` that isn't an in-scope R# → reject).
Any miss → bounce (one retry, then escalate); emit `GATE evidence` /
`GATE derivation` lines. Refuse take-into-build on open `UNVERIFIED` /
`scope_closed` absent — a one-Grep check.

**Branch.** Artifacts are written INTERNALLY to `orc/analyzer/{name}/`. After
each analysis offer a plain-language menu — stop here (copy the report OUT),
pass to build (Phase 1 planner; the analyst NEVER builds directly), or analyze
another RELATED doc (multi-analyze loop → combiner once 2+ related analyses
exist). Menu rules, relatedness gate, combiner handling:
`references/branching.md`.

## Mini variant

For the fast lane, `orc-analyze-mini` (Sonnet 5 high) does a shallower version
of the same flow: doc-optional intake, the same evidence-or-mark + floor (a)+(b)
+ triage rules — but **no deep mode and no scouts** (always single-pass), and
concrete escalation thresholds to the full analyst. Used by orc-mini. Same
artifacts, same output contract; trimmed depth. See that skill.
