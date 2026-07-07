# Schema — Combined Requirement Spec (DERIVED from combined-report.md)

Machine projection of combined-report.md. A STRICT SUPERSET of the base
requirement-spec schema — every base field is present (so the planner consumes it
UNCHANGED, exactly like a single requirement-spec.md) — plus combine-only
additions: `combined_from`, `cross_scope`, `kind`, and `requirements[].from`.
Written to orc/analyzer/combined-{name}/combined-requirement-spec.md.

```yaml
analysis_name: string           # combined-{name}
kind: combined                  # ADDED: marks this as a merge (vs a single analysis)
combined_from: [string]         # ADDED: source analysis names, e.g. [analysis-A, analysis-B]
mode: audit | prose | requirement | mixed   # base enum + 'mixed' when sources differ
depth: standard | deep | mixed              # base enum + 'mixed' when sources differ
source_doc: string | null       # base field: null for combined (sources are in combined_from)
scope: string                   # base field: the shared scope X
grounding: repo-read | repo-read+scouts | from-system-analyst | from-source-specs
                                # base enum + 'from-source-specs'; combined always uses the latter
derived_from: combined-report.md
created_at: timestamp

requirements:                   # base field, merged/deduped/ordered — base item shape + 'from'
  - id: R1
    statement: string
    from: [string]              # ADDED: which source req(s) this came from, e.g. [A.R1]
    code_reality: string
    evidence: [string]          # file:line inherited from source spec
    files: [string]
    status: exists | missing | conflict | verified | buildable | resolved
    resolution: string|null

assumptions_resolved:           # base field: merged from all sources (may be [])
  - item: string
    decision: string

alternatives:                   # base field: merged from deep-mode sources ([] if none)
  - for: R#
    recommended: string
    options: [string]
    risk: string

cross_scope:                    # ADDED: combine-only audit block
  conflicts_resolved:
    - between: [A.R4, B.R2]
      decision: string
  overlaps_merged:
    - merged: [A.R2, B.R3]
      into: R2
  ordering:
    - string                    # e.g. "A-export before B-schedule"

# Everything here is confirmed. The planner does NOT re-question scope/accuracy;
# it turns these into tasks. Because this is a strict superset of the base spec,
# the planner reads it exactly like a single requirement-spec.md — the added keys
# (kind, combined_from, requirements[].from, cross_scope) are additive and ignorable.
scope_closed: true
```
