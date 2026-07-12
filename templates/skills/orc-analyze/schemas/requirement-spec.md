# Schema — Requirement Spec (DERIVED from the confirmed report)

Machine-oriented projection of report.md. The planner consumes THIS; the human
report travels alongside as the audit trail. Generated as the last Analyst step,
so it cannot drift from what the user approved. Written to
orc/analyzer/{analysis-name}/requirement-spec.md.

```yaml
analysis_name: string
mode: audit | prose | requirement
depth: standard | deep
source_doc: string | null      # null in requirement mode (no doc)
scope: string                  # X only
grounding: repo-read | repo-read+scouts | from-system-analyst
derived_from: report.md
created_at: timestamp
git_head: string | null        # `git rev-parse HEAD` at analysis time (null if not a repo)
dirty: bool                    # uncommitted changes present at analysis time
# Staleness valve: at plan time, git_head ≠ current HEAD → the orchestrator
# re-runs the evidence spot-check (paths + quotes) before dispatching the
# planner; misses → offer re-analyze vs proceed-with-flagged. Same-session
# chains (HEAD matches) skip this — zero cost on the happy path.

requirements:                  # in-scope only; Y/Z absent by construction
  - id: R1
    statement: string          # the requirement / audit-row / request-part, resolved
    code_reality: string       # what the code currently shows
    evidence: [string]         # quote-anchored refs backing code_reality:
                               # 'file:line — "verbatim snippet"' (≤1 line, quoted
                               # not paraphrased). A ref with no quote auto-downgrades
                               # to UNVERIFIED. Empty only if the item was an
                               # ASSUMPTION resolved by the user.
                               # status missing|buildable (claims of ABSENCE)
                               # instead carry 'searched: <the concrete
                               # globs/greps run>' — an absence claim with no
                               # searched: note is UNVERIFIED.
    files: [string]            # specific files/modules — grounds declared_files
    status: exists | missing | conflict | verified | buildable | resolved
    resolution: string|null    # the user's decision if it was challenged

assumptions_resolved:          # every ASSUMPTION/UNVERIFIED tag the user decided
  - item: string
    decision: string

alternatives:                  # deep mode only; [] in standard
  - for: R#                    # which requirement this concerns
    recommended: string
    options: [string]
    risk: string

context:                       # anchored, NON-ACTIONABLE adjacent-scope context; [] if none
  - anchor: R#                 # the in-scope requirement this serves (REQUIRED — no anchor, no entry)
    from_scope: string         # the adjacent scope Y/Z it was pulled from
    dependency: string         # consumes-output | guards-invariant | shares-file | doc-references
    note: string               # the touchpoint (field/function/invariant) the build must respect
    evidence: [string]         # file:line — touchpoint-bounded, never all of the adjacent scope
# Read-for-understanding ONLY. The planner/executor honor these invariants but
# NEVER turn a context item into a task or a declared_files entry. Every item is
# anchored to an in-scope requirement or it was dropped (Phase E anchor-validation).

# Everything here is confirmed. The planner does NOT re-question scope/accuracy;
# it only turns these into tasks (breakdown/approach).
scope_closed: true
```

The `files` arrays are the planner's grounding when chained from SA — it trusts
these and does not re-read the repo. The `evidence` refs let the planner (and a
later reviewer) spot-check any claim without re-deriving it.

## Validity (the orchestrator refuses an invalid spec)

A spec is take-into-build valid only when: `scope_closed: true`, zero open
`UNVERIFIED` on any in-scope requirement, and every requirement carries status +
evidence-or-resolution. The orchestrator also lints DERIVATION on analyst
return: the R# id set, per-R# status, and context-anchor set must match
report.md exactly — a mismatch (or a context `anchor` that isn't an in-scope
R#) bounces the spec back to the analyst (one retry, then escalate).
