# Template — `learning.md` (pedagogy; read top-to-bottom once)

The teaching half of a feature's onboarding pair. Written for ONE reader —
the dev who has to extend this feature next iteration — and since
`learning-docs/` is local and git-ignored, it addresses that reader directly
as "you". Every section below is required unless marked optional; a section
whose scan came back empty is OMITTED, never stubbed.

Style: narrative prose over bullet walls. Every code reference is a real
`file:line` anchor the writer verified this run — never a guessed path.

```markdown
# Learning — <Feature Name>

> <One sentence: what this feature does and why it exists.>

## Mental model

<The big picture in plain language. One analogy if it genuinely helps. A
small text/mermaid diagram of the moving parts. 10–20 lines.>

## Guided walkthrough — one real request, entry to exit

<Follow ONE concrete invocation through the code, step by step. Each step:
what happens, in which function (file:line), and why that step exists.
This is the heart of the doc — it must trace the SAME flow the knowledge.md
"Functions & flow" section anchors.>

## Key concepts & vocabulary

<The feature's own terms, each defined in 1–2 lines, anchored where the
concept lives in code.>

## How to make common changes

<2–4 recipes for the changes the next iteration will plausibly need:
"add a new X", "change how Y is computed", "extend Z". Each recipe: which
files/functions to touch (anchored), in what order, and what to re-run to
verify. This is the section that pays for the whole doc.>

## Gotchas / footguns

<Non-obvious traps found during the scan: ordering constraints, implicit
couplings, things that LOOK safe to change but aren't. Anchored.>

## FAQ

<REQUIRED, minimum 5 questions. Seed from real scan findings — never generic
filler. Good sources: "why is it done this way and not the obvious way",
cross-feature couplings, and "how do I add/change/remove …". Each answer
2–4 lines, linking into knowledge.md sections or real files for depth.>

## Where to look next

<Pointers: the paired knowledge.md, the 3–5 most load-bearing source files,
and any wiki doc that covers the surrounding area.>
```

## Rules

- FAQ is a hard requirement: ≥5 questions or the doc is incomplete — the
  writer's return reports `faq_count` and the skill relays it.
- Anchors are verified this run; a claim that cannot be anchored to a real
  file is omitted, never guessed (same evidence bar as the wiki).
- No fingerprint header here — freshness lives in the paired knowledge.md;
  this file carries only a `Generated: <DD-MM-YYYY> · source: <short-commit>`
  line under the title.
