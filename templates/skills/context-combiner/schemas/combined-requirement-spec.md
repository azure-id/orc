# Schema — Combined Requirement Spec (DERIVED from combined-report.md)

Machine projection of combined-report.md. A STRICT SUPERSET of the base
requirement-spec schema — every base field is present (so the planner consumes it
UNCHANGED, exactly like a single requirement-spec.md) — plus combine-only
additions: `combined_from`, `combined_against`, `cross_scope`, `coverage`,
`kind`, and `requirements[].from` / `requirements[].depth_from`.
Written to orc/analyzer/combined-{name}/combined-requirement-spec.md.

```yaml
analysis_name: string           # combined-{name}
kind: combined                  # ADDED: marks this as a merge (vs a single analysis)
combined_from: [string]         # ADDED: source analysis names, e.g. [analysis-A, analysis-B]
combined_against: string        # ADDED: git HEAD short sha the evidence spot-check ran against
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
    depth_from: standard | deep # ADDED: depth of the dominant source (only when depth: mixed)
    code_reality: string
    evidence: [string]          # file:line inherited from source spec; STALE anchors are
                                # suffixed " (STALE)" and carry a recorded user decision
    files: [string]
    status: exists | missing | conflict | verified | buildable | resolved
    resolution: string|null

assumptions_resolved:           # base field: merged from all sources (may be []).
  - item: string                # Contradictory resolutions across sources were raised as
    decision: string            # CONFLICT challenges and carry the reconciled decision.

alternatives:                   # base field: merged from deep-mode sources ([] if none),
  - for: R#                     # re-pointed at MERGED requirement ids
    recommended: string
    options: [string]
    risk: string

context:                        # base field: merged anchored, NON-ACTIONABLE context ([] if none)
  - anchor: R#                  # remapped to the MERGED requirement id (still REQUIRED — no anchor, no entry)
    from_scope: string
    dependency: string          # consumes-output | guards-invariant | shares-file | doc-references
    note: string
    evidence: [string]
# Same rule as the base spec: read-for-understanding, never a task. On merge,
# dedupe ONLY same-file:line anchors carrying the same constraint; otherwise keep both.

coverage:                       # ADDED: conservation proof (mirrors the report's coverage matrix)
  source_requirements_total: int
  merged_total: int
  coverage_pct: 100             # MUST be 100 — the combiner refuses handoff below that
  dropped:                      # source IDs excluded ONLY by recorded user decision
    - id: string                # e.g. B.R4
      decision: string
  stale_evidence: [string]      # merged R ids whose inherited anchors failed the spot-check

cross_scope:                    # ADDED: combine-only audit block
  conflicts_resolved:
    - between: [A.R4, B.R2]
      decision: string
  overlaps_merged:
    - merged: [A.R2, B.R3]
      into: R2
      kind: exact | semantic    # semantic merges quote both statements in the report
  overlaps_split:               # PARTIAL overlaps are split, never collapsed
    - between: [A.R5, B.R1]
      shared: R4
      residue: [R5]
  ordering:                     # structured — consumable as planner dependencies
    - before: R1
      after: R6

# Everything here is confirmed. The planner does NOT re-question scope/accuracy;
# it turns these into tasks (cross_scope.ordering rows are real sequencing
# dependencies — respect them when waving). Because this is a strict superset of
# the base spec, the planner reads it exactly like a single requirement-spec.md —
# the added keys (kind, combined_from, combined_against, requirements[].from,
# requirements[].depth_from, coverage, cross_scope) are additive and ignorable.
scope_closed: true
```
