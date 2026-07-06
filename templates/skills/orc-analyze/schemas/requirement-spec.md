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

requirements:                  # in-scope only; Y/Z absent by construction
  - id: R1
    statement: string          # the requirement / audit-row / request-part, resolved
    code_reality: string       # what the code currently shows
    evidence: [string]         # file:line refs backing code_reality (empty only if
                               # the item was an ASSUMPTION resolved by the user)
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

# Everything here is confirmed. The planner does NOT re-question scope/accuracy;
# it only turns these into tasks (breakdown/approach).
scope_closed: true
```

The `files` arrays are the planner's grounding when chained from SA — it trusts
these and does not re-read the repo. The `evidence` refs let the planner (and a
later reviewer) spot-check any claim without re-deriving it.
