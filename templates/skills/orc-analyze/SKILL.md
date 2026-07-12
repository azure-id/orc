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
2. **Evidence-or-mark (never hallucinate) — quote-anchored.** Every requirement
   interpretation and every code claim carries `file:line — "verbatim snippet"`
   evidence (≤1 line, quoted not paraphrased — the same verbatim discipline as
   the model-id return field; a ref with no quote auto-downgrades to
   `UNVERIFIED`), OR an
   explicit `ASSUMPTION`/`UNVERIFIED` tag — and every tagged item becomes a
   clarifying question. **Absence claims** (`status: missing|buildable`, "no X
   exists") instead carry `searched:` — the concrete globs/greps run; an
   absence claim with no `searched:` note is `UNVERIFIED`. The Analyst never
   silently assumes what the user meant or what the code does.
3. **Recognize-to-exclude-from-build; include-related-as-context.** Two
   perimeters, not one: the **scope perimeter** (what gets BUILT = X only — Y/Z
   never become requirements or tasks) and the wider **context perimeter** (what
   the Analyst READS to get X right).
3a. **Anchored context (the anti-creep guard — stated here ONCE; Phases C/D/E
   just apply it).** Every context item MUST name the in-scope requirement it
   serves + the dependency type (consumes-output / guards-invariant /
   shares-file / doc-references). No anchor → it's scope-bleed, not context →
   dropped. Touchpoint-bounded (only the specific field/function/invariant,
   never all of Y), carries quote-anchored evidence, and is labeled
   non-actionable: read for understanding, NEVER turned into a task.
4. **Ground against real code — with a stated floor.** Standard mode MUST
   verify: (a) every row that emits a `files[]` entry, (b) every
   `status: exists|conflict` claim, (c) every claim the user's scope sentence
   directly names. Peripheral doc claims that produce no requirement MAY stay
   tagged instead of verified. Deep mode verifies EVERY claim. The mini analyst
   states the same floor (a)+(b) — trimmed depth never means a lower floor.
5. **Challenge with recommended options — triaged.** Each challenge is a small
   option-set (2–3 choices) with ONE flagged **recommended** option and a
   one-line reason. Two classes: **blocking** (scope changes, code-vs-doc
   conflicts, anything whose answer changes `files[]` or a status) → asked ONE
   at a time, wait for each answer. **Advisory** (wording, naming,
   non-load-bearing assumptions) → collected and asked as ONE batched sign-off
   round, each with its recommended default. Every challenge — both classes —
   is RECORDED in the report; nothing is silently dropped. Scope + accuracy
   only (task breakdown is the planner's).
6. **Two artifacts, spec derived from report — and it must MATCH.** The human
   `report.md` is the source of truth you confirm; `requirement-spec.md` is
   DERIVED from it. The orchestrator lints the derivation on return (Phase F
   gate) — R# ids, statuses, and context anchors must match exactly.
7. Usage: report dispatch + remind the user to run `/usage`. Never invoke it.

## Behavior trace (config `logging` — every ORC entry point traces)

When run standalone (`/orc-analyze`, not inside an /orc run that already owns a
trace), resolve `logging` + `log_dir` (`../orc/config.md` defaults +
`.claude/orc.config.yaml`) at start. When `logging: true`, follow
`../orc/references/trace-protocol.md`: write `log_dir/.current` =
`<slug>-<DDMMYY>.txt` BEFORE the first dispatch, emit `PHASE` lines per phase
(A→F), `DISPATCH`/`VERIFY` (claimed-vs-actual) per analyst/scout spawn, `GATE`
lines for the evidence/derivation gates, then `FINISH` + delete `.current` at
the end. Without the pointer the trace hook writes nothing. When
`logging: false`, do none of this. Inside a full /orc run, the orchestrator's
trace already covers this — never open a second one.

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
> noticeably more tokens and time. **Standard** is faster and verifies the
> stated floor (hard rule 4). Deep or standard?
> (Tip: to make deep the default and skip this prompt's default, run
> `orc config set default_analysis_depth deep` — a zero-token CLI change.)"

Deep requires explicit consent — it never auto-escalates. In deep mode the run
is **two-pass with scouts** — load `references/deep-mode.md` for the full
protocol. Standard mode is single-pass.

## Phase B — Bound scope

Take the user's scope instruction (X). Identify the source's full scope structure
internally (X, Y, Z…), isolate X, and set the rest aside from the **deliverable** —
Y/Z never become requirements or tasks. If the user didn't name a scope, ask
(recommended-option form). Adjacent scopes are NOT gone: they may re-enter in
Phase C as anchored context per rule 3a.

## Phase C — Reconcile against code (mode-specific)

Apply the hard rule 4 coverage floor (standard) or verify-every-claim (deep).

- **Prose mode:** for each in-scope requirement, find the files/modules it
  touches (quote-anchored evidence) and confirm exists / already implements /
  missing (`searched:`) / conflict.
- **Audit mode:** for each in-scope row, take its claim (result + notes) and
  verify against the code with evidence. Surface divergences:
  - result PASS but notes suggest a change → challenge.
  - result FAIL citing a reason the code contradicts (e.g. a UUID check the
    code has renamed/removed/replaced) → challenge; the audit premise is stale.
- **Requirement mode:** for each part of the request, find where in the code it
  lands (with evidence), and classify: buildable-as-stated / already-exists /
  conflicts-with-existing / underspecified. Anything you cannot ground →
  `ASSUMPTION`/`UNVERIFIED` → clarifying question.

**Anchored context sweep (all modes, both depths).** While reconciling, when an
in-scope item depends on an adjacent scope, capture the specific touchpoint as
context per rule 3a. Pulling a context item in is offered as a Phase D
challenge. **Deep mode:** the reconciliation is two-pass with
orchestrator-dispatched scouts — `references/deep-mode.md`.

Anything unground-able in ANY mode is tagged and becomes a question — never a
silent guess.

## Phase D — Challenge (interactive, triaged per hard rule 5)

For every scope-bleed, doc/requirement-vs-code divergence, and every
`ASSUMPTION`/`UNVERIFIED` tag: classify blocking vs advisory, then ask —
blocking one at a time, advisory as ONE batched sign-off round. Record every
answer. Scope + accuracy only — not task breakdown.

Adjacent context is also a challenge (usually advisory): when an in-scope
requirement depends on an adjacent scope, offer to pull that touchpoint in as
read-only context — e.g. "Checkout (R3) depends on pricing's rounding; pull it
in as non-actionable context? (recommended: yes — R3's correctness can't be
judged without it.)" It never proposes building the adjacent scope.

## Phase E — Write report, derive spec

0. **Anchor-validation pass.** Drop every context item that fails rule 3a
   (no anchor / no dependency type → scope-bleed, not context).
1. Write `report.md` in the mode template (schemas/report-audit.md,
   report-prose.md, or report-requirement.md) into
   `.claude/skills/orc/analyzer/{analysis-name}/` (internal). Include the
   Evidence column (quote-anchored + `searched:` per hard rule 2), the
   **Assumptions & Open Questions** section, and — when any context survived
   step 0 — the **Additional context (do not build)** section; in deep mode
   also the **Alternatives & risks** section.
2. **Confirm the report with the user**, then derive `requirement-spec.md` FROM
   the confirmed report (schemas/requirement-spec.md) in the same internal
   folder — never from an unconfirmed draft. Stamp `git_head` (`git rev-parse
   HEAD`) + `dirty` into the spec so staleness is detectable at plan time. The
   spec carries the same confirmed **Context & invariants (do not build)**
   block so it reaches the planner and executor as non-actionable guardrails,
   never as tasks.
3. **handoff_ready is a checklist, not a feeling** — true only when ALL of:
   (a) all blocking challenges resolved, (b) zero open `UNVERIFIED` on any
   in-scope item, (c) every requirement has status + evidence-or-resolution,
   (d) spec derived after the user confirmed the report, (e) `scope_closed:
   true` written.

## Phase F — Gates, then branch

**Evidence spot-check (orchestrator, deterministic — before any build option).**
On analyst return: Glob every `files[]` path in the spec, and Grep-verify the
quoted snippet for every `status: exists|conflict` entry (the claims a build
acts on). Any miss → bounce to the analyst with the miss list (one retry, then
escalate to the user). Emit a `GATE evidence` trace line (pass|bounce) when
logging.

**Derivation lint (orchestrator, deterministic).** R# id set, per-R# status,
and context-anchor set must match between report.md and requirement-spec.md;
a context `anchor` that isn't an in-scope R# → reject. Mismatch → bounce (one
retry). Emit `GATE derivation`. The orchestrator also refuses take-into-build
when the spec violates the handoff checklist (open `UNVERIFIED` /
`scope_closed` absent) — a one-Grep check.

**Branch.** Artifacts are written INTERNALLY to `orc/analyzer/{name}/`. After
each analysis the orchestrator offers a plain-language menu — stop here (copy
the report OUT), pass to build (Phase 1 planner; the analyst NEVER builds
directly), or analyze another RELATED doc (multi-analyze loop → combiner once
2+ related analyses exist). Full menu rules, relatedness gate, and combiner
handling: `references/branching.md`.

## Mini variant

For the fast lane, `orc-analyze-mini` (Sonnet 5 high) does a shallower version
of the same flow: doc-optional intake, the same evidence-or-mark + floor (a)+(b)
+ triage rules — but **no deep mode and no scouts** (always single-pass), and
concrete escalation thresholds to the full analyst. Used by orc-mini. Same
artifacts, same output contract; trimmed depth. See that skill.
