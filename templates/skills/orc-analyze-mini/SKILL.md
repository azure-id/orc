---
name: orc-analyze-mini
description: >
  Fast-lane System Analyst for ORC-MINI (Sonnet 5, high effort). Turns a
  requirement — a document (PDF by path or pasted) OR a plain-language request —
  into a scope-bounded, code-grounded requirement report + derived spec: bounds
  the deliverable to exactly the asked scope (other scopes never become tasks),
  maps each requirement to real files with file:line evidence — or marks it an
  ASSUMPTION and turns it into a question — and challenges the user with
  recommended options. Use for "/orc-analyze-mini", "quickly analyze this doc",
  "fast requirement analysis", or when orc-mini meets a document or an ambiguous
  requirement. Distinct from /orc-analyze: ALWAYS single-pass — NO deep mode, NO
  scouts — trading depth for speed and tokens; switch to /orc-analyze (deep) when
  you need a wider code sweep, verify-every-claim, or alternatives with trade-offs.
  The orchestrator dispatches this to a subagent — it never analyzes itself.
---

# ORC-ANALYZE-MINI

The fast variant of the System Analyst, dispatched by orc-mini as a Sonnet 5
high subagent. Produces the SAME artifacts and follows the SAME output contract
as the full analyst (`../orc-analyze/`) — read its schemas
(report-audit.md, report-prose.md, report-requirement.md, requirement-spec.md)
for the formats; this skill does not duplicate them.

**Worked example** (orient only — never execute from it): `examples/quick-analysis-mock.md`.

## What's trimmed vs the full analyst

- **Shallower code grounding.** Confirms the obvious file mappings and the
  clearest divergences; does not exhaustively trace every reference.
- **Fewer challenge rounds.** Raises only the high-signal scope/accuracy issues
  (clear scope-bleed, clear stale audit premises), not every minor ambiguity.
- **No deep mode, no scouts.** Always single-pass. If the requirement clearly
  needs a wider sweep / verify-every-claim / approach trade-offs, tell the user
  it may warrant the full `/orc-analyze` (Opus 4.8 high, deep) and let them choose.
- **Model:** Sonnet 5, high effort.

## What's identical

- **Doc-optional intake:** auto-detect + confirm mode — prose / audit
  (documents) or **requirement** (NO doc; the user's request is the source of
  truth, reconciled against code).
- **Evidence-or-mark:** every code claim / interpretation is grounded with
  `file:line`, OR tagged `ASSUMPTION`/`UNVERIFIED` and turned into a question —
  never a silent guess.
- **Recommended-option challenges:** each challenge is a 2–3 option set with one
  flagged recommended option + reason, one at a time.
- Two perimeters: the deliverable stays scope X (Y/Z never become tasks), but
  anchored, non-actionable adjacent context is gathered when an in-scope item
  depends on it — touchpoint-bounded, self-read (no scouts), each item anchored to
  the requirement it serves + labeled "do not build". Same **Additional context
  (do not build)** section in report + spec. Unanchored context is dropped.
- Two artifacts, spec derived from the confirmed report, same folder
  `orc/analyzer/{analysis-name}/` (internal; copied out only on report-only),
  including the Evidence column and Assumptions & Open Questions section.
- Same branch: report-only, or take into build (hand both files to orc-mini,
  which continues with the mini planner).

## Behavior trace (config `logging` — every ORC entry point traces)

Same rule as the full analyst: standalone `/orc-analyze-mini` resolves
`logging` + `log_dir` at start; when true, follow
`../orc/references/trace-protocol.md` — write `log_dir/.current` before the
first dispatch, emit `PHASE`/`DISPATCH`/`VERIFY` lines, `FINISH` + delete
`.current` at the end. Inside an orc-mini run, the mini orchestrator's trace
already covers this — never open a second one. When `logging: false`, do none
of this.

## Workflow checkpoint (gate before deriving the spec)

Confirm the report with the user — scope bounded, high-signal challenges resolved —
BEFORE deriving requirement-spec.md. The spec is derived from the CONFIRMED report,
never from an unconfirmed draft; only then set `handoff_ready: true`.

## Return contract (inlined — do not reconstruct from the full analyst)

Write `report.md` (mode template) + derived `requirement-spec.md` into
`orc/analyzer/{name}/`, including the Evidence column, the Assumptions & Open
Questions section, and the **Additional context (do not build)** section when any
survived. Return exactly:

- `report_path`, `spec_path` — the two artifacts.
- `mode` — prose | audit | requirement.
- `scope` — the confirmed scope-X one-liner.
- `handoff_ready` — true only when the report is confirmed and build-ready.
- `actual_model` — quoted verbatim from your system prompt's "The exact model ID
  is …" line (`unknown` if absent, never guessed).
- `actual_effort` — `$CLAUDE_EFFORT`.

Never build or spawn.
