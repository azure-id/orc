# The token architecture — map, plan, extract, splice

This file is the point of the lane.

> **The orchestrator never reads the document body.**
> **a lane that reads its own document** has broken this contract.

## What the orchestrator may hold

| It DOES hold | It NEVER holds |
|---|---|
| `context.md` (small, written by itself) | the body of `document.md` |
| `outline.md` (headings only) | the body of any supporting document |
| `orc doc map --json` (heading + line range + hash + state per section) | the body of any `.work/` part |
| `orc doc lint --json` (findings with line numbers) | the raw template file |
| each agent's **structured return** (≤ ~40 lines) | anything an agent read to produce that return |

If the orchestrator ever needs a fact from inside the document, **it dispatches
for it.** Reading is delegated, always.

## The section map — derived, never stored

```
$ orc doc map prd-checkout-refund-130826 --json
{
  "file": "orc/orc-doc/prd-checkout-refund-130826/document.md",
  "lines": 487,
  "sections": [
    { "id": "01-document-info", "heading": "Document info", "level": 2,
      "start": 5, "end": 18, "lines": 14, "hash": "a91f…", "state": "written" },
    { "id": "02-summary", "heading": "Summary", "level": 2,
      "start": 19, "end": 31, "lines": 13, "hash": "4c02…", "state": "user-edited" }
  ]
}
```

- **`id`** = ordinal + slugified heading. Stable across every rewrite of the
  BODY, which is what a re-check needs.
- **`hash`** = SHA-256 of the section's exact text, and it does three jobs:
  **drift detection** (did the user edit it?), **conflict detection** (did it
  change between extract and splice?), and **skip detection** (a section whose
  hash has not moved does not need re-checking). *The hash is what turns a
  re-check from a full pass into a diff.*
- **`state`** ∈ `planned | written | checked | user-edited | open`. COMPUTED by
  comparing the live hash to the one `doc.json` recorded at the end of the last
  cycle — never stored as a claim.
- **Renames are repaired, not lost.** A heading whose text changed but whose
  position and neighbours match is the same section with a new `id`; `doc.json`
  is updated and the history follows it. A heading that appears with no such
  match is new.

Because the map is re-derived after every single write, **no line number in this
system is ever stale.** That is what makes range-based reading safe.

## Dispatch #0 — digesting the supporting documents

The one place a lot of foreign text has to be read, and it is read by a
dispatched writer:

- one dispatch per supporting document, ≤ `doc_max_parallel` in parallel;
- each returns a **digest, not the content**: the claims that bear on the D1
  context, each anchored `path:line`, plus an explicit `not_covered[]`;
- the orchestrator concatenates the digests into `context-sources.md` and holds
  only that;
- a document longer than `doc_max_lines_per_agent` is split the same way
  everything else is, digested in parts, and the parts concatenated.

## The write wave — the CLI computes the batching

```
$ orc doc plan prd-checkout-refund-130826 --role write --json
{ "waves": [ { "n": 1, "agents": [
      { "agent": "orc-doc-writer-opus-5-med", "part": ".work/02-summary.md",
        "sections": ["02-summary","03-problem"], "budget_lines": 120 } ] } ] }
```

Rules the planner obeys, and none of them is the model's to decide:

1. **Never split a section across two agents.** A writer given half a section
   writes half an idea.
2. **≤ `doc_max_parallel` agents per wave** — default 4, and the **hard cap is
   4**. A larger value is clamped and the clamp is announced.
3. **≤ `doc_max_lines_per_agent` planned lines per agent** (default 400).
4. Sections that reference each other (`Goals` ↔ `Non-goals`, `Alternatives` ↔
   `Detailed design`) share an `affinity` and land in the **same** agent
   wherever the budget allows — cross-agent consistency is expensive to check
   and free to prevent.
5. A single section whose budget exceeds the cap is a **planning smell**: it is
   returned in `oversized[]` and offered as a split at the outline gate, never
   dispatched as an over-budget slice.

**Each writer writes its own file in `.work/`.** No two agents ever have
`document.md` open. That is why parallel writing is safe here and is not safe in
the naive design.

### The writer's slice

```
role:        write
language:    en
type:        PRD
audience:    <D4 audience, verbatim>
expectation: <D4 expectation, verbatim>
sections:    [{ id, heading, level, purpose, required, budget_lines }]
context:     <context.md, in full — it is small>
evidence:    <only the context-sources.md entries relevant to these sections>
rules:       references/plain-language.md + references/portable-markdown.md
write to:    .work/02-summary.md
```

The return contract is in the agent file. The one thing to enforce on receipt:
`start` / `end` are **part-local**. Absolute line numbers are the CLI's job at
assemble — asking an agent for an absolute number in a file it cannot see is
exactly how that number gets invented.

## Assemble → lint → map → check

1. **`orc doc assemble <slug>`** — concatenates the parts in outline order,
   normalises the blank lines between them, strips the template's purpose
   comments, and writes each section's hash into `doc.json`. Deterministic: the
   same parts always produce the same file.
2. **`orc doc lint <slug> --target <t> --json`** — **free**. Every mechanical
   portability rule plus the readability signals. Exit 0 clean · 1 findings ·
   2 no document. **Free checks run before paid ones. Always.**
3. **`orc doc map <slug> --json`** — the fresh absolute line numbers.
4. **`orc doc plan <slug> --role check --json`** — the checker batches.

### The checker's slice

```
role:      check
read ONLY: document.md lines 119..204     ← Read(file_path, offset=119, limit=86)
sections:  ["04-goals","05-non-goals"]
purpose:   <what these sections are supposed to do, from outline.md>
audience:  <D4 audience>
expectation: <D4 expectation>
language:  en
already reported by lint: [{line: 131, rule: "long-sentence", …}]
```

A checker **never opens a second file** and is never given the whole document.
Findings the lint already reported are never re-reported — paying a model to
repeat a free check is the mistake this ordering exists to prevent.

`severity` reuses the house ladder: **P0/P1 block the handoff, P2/P3 are
advisory** and are shown to the user as optional.

## The edit wave — extract, edit, splice

```
orc doc extract <slug> --section 04-goals   →  .work/04-goals-and-metrics.md  (+ records the hash)
        │        writer slice: the part file + the finding + the instruction
        ▼        the writer edits ONLY .work/04-goals-and-metrics.md
orc doc splice <slug>                       →  document.md
```

`splice` rules:

- Replaces each extracted range **bottom-up** (highest `start` first), so an
  edit that changes a section's length never shifts a range that has not been
  spliced yet. **This is why the model never does line arithmetic.**
- **Refuses** any part whose recorded hash no longer matches the file on disk —
  the user edited that section while we were working. It reports the conflict by
  section NAME and asks. It never overwrites. A human's wording is not
  recoverable from this lane's side once it is gone.
- Re-runs the map and the lint after splicing and rewrites `doc.json`.

Edits are therefore **parallel-safe** (≤ 4 disjoint sections at a time) while
still touching only the lines that needed touching.

**Repair is capped at 2 rounds.** After that the lane reports what is still
open, honestly, and stops — the same cap-and-report shape as
`../../_shared/drift-recovery.md`.

## The user's edits are sacred

A `user-edited` section is **never** rewritten without an explicit instruction
naming it. If a finding lands inside one, the finding is *reported* and the fix
is *offered*, never applied.

## Worked example — a 10,000-line document

| | |
|---|---|
| Document | 10,000 lines, 40 sections, ~250 lines each |
| `doc_max_lines_per_agent` | 400 |
| `doc_max_parallel` | 4 |
| Batches | 40 sections → 25 agent slices (1–2 sections each) |
| Waves | ⌈25 / 4⌉ = **7 waves**, parallel within each |
| Orchestrator context spent | 25 returns × ~30 lines ≈ **750 lines**, plus the map |
| Naive alternative | 10,000 lines read at least twice ≈ **20,000+ lines** |

On a re-check after an edit, only the sections whose hash changed are
re-dispatched — typically 1 or 2 slices, not 25.

At 40 sections the lane also raises the split offer at the outline gate: a
document this size is usually several documents.

## Edge cases

| Situation | What happens |
|---|---|
| The supplied template is enormous or unparseable | Parse headings only. None found → say so, show the shipped outline, ask which to use. Never guess a structure out of prose |
| The user reshapes `document.md` by hand | Rename repair handles a changed heading. A section in `doc.json` with no match on disk is reported as *removed by you* and dropped from the outline after confirmation — never silently re-added |
| `document.md` deleted, `context.md` intact | `orc doc status` reports `not-started`. Offer a full regenerate FROM THE FROZEN CONTEXT, and say clearly that anything typed into the old file is gone |
| A wave partially fails | Each part file is independent. Re-dispatch the failed slices only; `assemble` refuses while a required part is missing and NAMES the missing sections |
| Two sessions on one slug | The **hash is the guard**, not a lock file: every extract records the section's hash and `splice` refuses when it no longer matches, naming the section. A second session cannot silently overwrite the first one's work, and a pid lock would add a second, weaker idea of the same protection |

---

## The pipeline is CLI-computed, not remembered (v0.48.1)

Everything above describes what each phase DOES. What decides **which phase is
next** is `orc doc next <slug> --json`, and this lane renders it rather than
reasoning about it.

```json
{ "ok": true, "slug": "…", "phase": "D7",
  "action": "lint",
  "command": "orc doc lint acme-prd --json",
  "why": "3 sections were written since the last assemble; the free check runs before the paid one",
  "paid": false,
  "blocked_by": null,
  "alternatives": ["orc doc map acme-prd --json"] }
```

Exit **0** = an action is available · **1** = waiting on a human decision, named
in `blocked_by` · **2** = unknown slug. The same convention as
`orc pattern status` and `orc diy status`.

`paid` is what lets a caller obey the W2 rule — **a free action gets a button, a
paid action gets a copy-able command** — without holding a second idea of which
steps cost money.

Never run a command `next` did not name, and never invent the next step. A
session that improvises the order is exactly the drift this command exists to
prevent, and it is the drift that is invisible until months later, in a fresh
context, on a resumed run.

## Reading a section, and who is allowed to

`orc doc read <slug> [--section <id>|--toc]` prints the table of contents, or ONE
section with absolute line numbers, straight from the derived map.

**The orchestrator never runs `orc doc read`.** It is a command for the HUMAN,
the same way `orc challenge report` is. Hard rule 0 is not softened by a command
that happens to print prose: reading the document is still delegated, always, to
a checker that receives one line RANGE and nothing else.
