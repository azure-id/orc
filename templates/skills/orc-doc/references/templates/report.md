<!-- orc-doc:template report — the shipped base template.

     executive summary plus RAG, because the reader is skimming for one thing: is this on track, and what do you need from me

     Every `<!-- purpose: … -->` line is an instruction for the WRITER and is
     STRIPPED at assemble — it never reaches document.md. A required section
     with no material becomes a visible `> **Open:** …` line: never a silent
     omission, and never invented filler.

     A template is a floor, not a cage. Your own template REPLACES this one
     entirely (`orc doc init … --template <path>`); the two are never merged.
-->

# <document title>

## Document info

<!-- purpose: period covered, author, audience, distribution -->

| Field | Value |
|---|---|
| Title |  |
| Owner |  |
| Status | draft \| in review \| approved |
| Version | 0.1 |
| Date |  |
| Reviewers |  |

## Executive summary

<!-- purpose: one to three sentences, ending in the ask -->

## Overall status

<!-- purpose: green / amber / red, plus a per-workstream RAG table -->

Overall: green / amber / red — pick one and say why in a sentence.

| Workstream | Status | Why |
|---|---|---|
|  |  |  |

## Results against target

<!-- purpose: a table: metric, target, actual, delta -->

| Metric | Target | Actual | Delta |
|---|---|---|---|
|  |  |  |  |

## What shipped this period

<!-- purpose: facts, with links -->

## What is planned next period

<!-- purpose: commitments, with owners -->

## Risks and issues

<!-- purpose: a table: description, impact, owner, mitigation, due -->

| Description | Impact | Owner | Mitigation | Due |
|---|---|---|---|---|
|  |  |  |  |  |

## Decisions needed from you

<!-- purpose: the section that justifies the document existing -->

| Decision | Options | Recommendation | Needed by |
|---|---|---|---|
|  |  |  |  |

## Effort and budget

<!-- purpose: optional — include it only if somebody asked (optional — drop it at the outline gate if nobody asked for it) -->

## Milestones

<!-- purpose: a table: milestone, due, status -->

| Milestone | Due | Status |
|---|---|---|
|  |  |  |

## Evidence and links

<!-- purpose: where every number above came from -->

| Claim above | Where the number came from |
|---|---|
|  |  |

## Revision history

<!-- purpose: a table: version, date, author, what changed -->

| Version | Date | Author | What changed |
|---|---|---|---|
| 0.1 |  |  | First draft |
