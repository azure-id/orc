---
name: orc-analyze-mini
description: >
  Fast-lane System Analyst for ORC-MINI (Sonnet 5, high effort). Use for
  "/orc-analyze-mini", "quickly analyze this doc", "fast doc analysis", "quick
  requirement check", "fast requirement analysis", or when orc-mini meets a
  document or an ambiguous requirement. Writes a scope-bounded requirement
  report with file:line evidence. ALWAYS single-pass — NO deep mode, NO scouts;
  use /orc-analyze for depth.
---

# ORC-ANALYZE-MINI

The fast variant of the System Analyst, dispatched by orc-mini as a Sonnet 5
high subagent. Produces the SAME artifacts and follows the SAME output contract
as the full analyst (`../orc-analyze/`) — read its schemas
(report-audit.md, report-prose.md, report-requirement.md, requirement-spec.md)
for the formats; this skill does not duplicate them.

**Worked example** (orient only — never execute from it): `examples/quick-analysis-mock.md`.

## What's trimmed vs the full analyst

- **Shallower code grounding — but the FLOOR is the same.** The mini analyst
  MUST still verify (a) every row that emits a `files[]` entry and (b) every
  `status: exists|conflict` claim; it may skip exhaustively tracing peripheral
  references. Trimmed depth never means a lower floor.
- **Fewer challenge rounds via triage, not omission.** Blocking issues (scope
  changes, code-vs-doc conflicts, anything changing `files[]` or a status) are
  asked one at a time; everything else is DEMOTED to the single batched
  advisory round — recorded in the report with its recommended default, never
  silently dropped.
- **No deep mode, no scouts.** Always single-pass.
- **Concrete escalation thresholds** (recommend the full `/orc-analyze`, Opus
  5.5 high, and let the user choose — the boundary is not self-assessed vibes):
  source doc > ~10 pages, OR > 12 in-scope requirements, OR > 3 conflict rows,
  OR audit mode with > 5 stale-premise rows.
- **Model:** Sonnet 5, high effort.

## What's identical

The full analyst's **hard rules 2, 3, 3a, 4a, 5 and 6** apply unchanged
(`../orc-analyze/SKILL.md` §Hard rules): quote-anchored evidence-or-mark with
`searched:` on absence claims, the read ladder (`../_shared/read-ladder.md`),
recommended-option challenges, two perimeters with the **Additional context (do
not build)** section, and a spec derived from the confirmed report (with the Evidence column and the
Assumptions & Open Questions section). Anchored context is self-read (no
scouts). Also the same:

- **Doc-optional intake:** auto-detect + confirm mode — prose / audit
  (documents) or **requirement** (NO doc; the request is the source of truth).
- Same folder `orc/analyzer/{analysis-name}/` (internal; copied out only on
  report-only). The spec is stamped with `git_head` + `dirty` for plan-time
  staleness detection.
- Same branch: report-only, or take into build (hand both files to orc-mini,
  which continues with the mini planner and runs the same evidence spot-check +
  derivation lint gates).

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases orc-analyze-mini --json` →
`trace_grammar` gives the verbs). Lane token `analyze`, tier
**Single-dispatch**. At run start write `log_dir/.current` =
`run-analyze-<slug>-<DDMMYY>-<HHMMSS>.txt` AND `touch the trace file` of that name
in the SAME step. A phase that ends with `zero new trace lines is a protocol violation`.

## Workflow checkpoint (gate before deriving the spec)

Confirm the report with the user — scope bounded, blocking challenges resolved —
BEFORE deriving requirement-spec.md. The spec is derived from the CONFIRMED report,
never from an unconfirmed draft.

## Return contract (inlined — do not reconstruct from the full analyst)

Write `report.md` (mode template) + derived `requirement-spec.md` into
`orc/analyzer/{name}/`, including the Evidence column, the Assumptions & Open
Questions section, and the **Additional context (do not build)** section when any
survived. Return exactly:

- `report_path`, `spec_path` — the two artifacts.
- `mode` — prose | audit | requirement.
- `scope` — the confirmed scope-X one-liner.
- `handoff_ready` — a CHECKLIST, not a feeling: true only when all blocking
  challenges are resolved, zero open `UNVERIFIED` on in-scope items, every
  requirement has status + evidence-or-resolution, the spec was derived after
  the user confirmed the report, and `scope_closed: true` is written.
- `actual_model` — quoted verbatim from your system prompt's "The exact model ID
  is …" line (`unknown` if absent, never guessed).
- `actual_effort` — `$CLAUDE_EFFORT`.

Never build or spawn.

## Lane contract (`../_shared/lane-contract.md` — read it ONLY when a call exits ≠ 0)

- **Calls:** `orc lane calls orc-analyze-mini --json` names shared calls and exit codes.
  **An exit code is an ANSWER where it says so, not a failure.** Own calls are here; make no other.
- **Config:** `orc lane config orc-analyze-mini --json`. Obey `effective`. Never merge
  `.claude/orc.config.yaml` yourself (`../_shared/config-precedence.md`). Nothing
  here is contested, gated or a stop: no preflight line, no gate to honour.
- **Rules:** `orc rules slice --lane orc-analyze-mini --json` is the ONLY assembler
  (`../_shared/phases/rules.md`). Its `line` prints VERBATIM at preflight.
