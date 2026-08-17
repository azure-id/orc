<!-- orc-doc:template tsd — the shipped base template.

     the durable design-doc structure whose whole point is that the document exists to write down the trade-offs

     Every `<!-- purpose: … -->` line is an instruction for the WRITER and is
     STRIPPED at compile — it never reaches document.md. A required section with
     no material is NOT written: it comes back as a gap, lands in gaps.md, and is
     raised with you. The deliverable carries content only — never a silent
     omission, never invented filler, and never ORC's own bookkeeping.

     A template is a floor, not a cage. Your own template REPLACES this one
     entirely (`orc doc init … --template <path>`); the two are never merged.
-->

# <document title>

## Document info

<!-- purpose: title, author, status, reviewers, date -->

| Field | Value |
|---|---|
| Title |  |
| Owner |  |
| Status | draft \| in review \| approved |
| Version | 0.1 |
| Date |  |
| Reviewers |  |

## Context and scope

<!-- purpose: the landscape this is being built into -->

## Goals and non-goals

<!-- purpose: both halves; the non-goals are what stop the scope moving -->

## Overview of the design

<!-- purpose: the whole thing in one page, before any detail -->

## Detailed design

<!-- purpose: H3 subsections: architecture, data model, interfaces, key flows, failure handling -->

### Architecture

### Data model

### Interfaces

| Method | Path | Request | Response | Errors | Auth |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

### Key flows

### Failure handling and edge cases

## Alternatives considered

<!-- purpose: one subsection each: the option, the trade-off, why not. MANDATORY — this is why the document exists -->

### Option A — <name>

What it is. What it costs. Why we did not choose it.

### Option B — <name>

What it is. What it costs. Why we did not choose it.

## Cross-cutting concerns

<!-- purpose: security, privacy, observability, cost, compliance -->

| Concern | What we do about it |
|---|---|
| Security |  |
| Privacy |  |
| Observability |  |
| Cost |  |
| Compliance |  |

## Migration, rollout and backout

<!-- purpose: including how to undo it -->

## Testing strategy

<!-- purpose: what proves this works, at which level -->

## Operational readiness

<!-- purpose: SLOs, alerts, and the runbook this points at -->

| SLO | Target | Alert | Runbook |
|---|---|---|---|
|  |  |  |  |

## Open questions

<!-- purpose: each with an owner and a date it must be answered by -->

| Question | Owner | Answer needed by |
|---|---|---|
|  |  |  |

## Timeline and milestones

<!-- purpose: a table (optional — drop it at the outline gate if nobody asked for it) -->

| Milestone | Due | Status |
|---|---|---|
|  |  |  |

## Revision history

<!-- purpose: a table: version, date, author, what changed -->

| Version | Date | Author | What changed |
|---|---|---|---|
| 0.1 |  |  | First draft |
