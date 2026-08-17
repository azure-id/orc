<!-- orc-doc:template prd — the shipped base template.

     cover → problem → goals → requirements → risks → rollout, the shape every current template converges on

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

<!-- purpose: title, owner, status, version, date, reviewers — as a table -->

| Field | Value |
|---|---|
| Title |  |
| Owner |  |
| Status | draft \| in review \| approved |
| Version | 0.1 |
| Date |  |
| Reviewers |  |

## Summary

<!-- purpose: what we are building, in three sentences -->

## Problem and context

<!-- purpose: who hurts, and what the evidence is -->

## Goals and success metrics

<!-- purpose: each metric with a baseline and a target -->

| Goal | Metric | Baseline today | Target | By when |
|---|---|---|---|---|
|  |  |  |  |  |

## Non-goals

<!-- purpose: what this deliberately does not do -->

## Users and jobs to be done

<!-- purpose: who they are and what they are trying to get done -->

| Who they are | What they are trying to get done | What stops them today |
|---|---|---|
|  |  |  |

## Scenarios and user stories

<!-- purpose: the concrete paths through the product -->

## Functional requirements

<!-- purpose: numbered FR-1…, each with a priority -->

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-1 |  | must \| should \| could |  |

## Non-functional requirements

<!-- purpose: performance, security, privacy, accessibility, i18n, compliance -->

| Area | Requirement | How it is measured |
|---|---|---|
| Performance |  |  |
| Security |  |  |
| Privacy |  |  |
| Accessibility |  |  |
| Internationalisation |  |  |
| Compliance |  |  |

## Experience and flows

<!-- purpose: links to designs, described in words for readers who cannot open them (optional — drop it at the outline gate if nobody asked for it) -->

## Dependencies and assumptions

<!-- purpose: what has to be true, and who else is involved -->

| What has to be true | Who owns it | What we do if it is not |
|---|---|---|
|  |  |  |

## Risks and open questions

<!-- purpose: each with an owner -->

| Risk or question | Impact | Owner | What we will do |
|---|---|---|---|
|  |  |  |  |

## Rollout and measurement plan

<!-- purpose: how it reaches users and how we know it worked -->

## Milestones

<!-- purpose: a table: milestone, due, status -->

| Milestone | Due | Status |
|---|---|---|
|  |  |  |

## Out of scope for this release

<!-- purpose: explicitly deferred, so nobody re-litigates it -->

## Glossary

<!-- purpose: every term the audience would not already know (optional — drop it at the outline gate if nobody asked for it) -->

| Term | What it means here |
|---|---|
|  |  |

## Revision history

<!-- purpose: a table: version, date, author, what changed -->

| Version | Date | Author | What changed |
|---|---|---|---|
| 0.1 |  |  | First draft |
