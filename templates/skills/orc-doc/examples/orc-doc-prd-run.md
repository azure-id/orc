# `/orc-doc` — an annotated PRD run

> The dense one. Every phase, every command, every return, with the reason each
> shape is what it is. The reader-facing walkthrough is `mock-run/orc-doc.md`.

---

## D0 — preflight (silent, once)

```
config    log_dir · doc_dir · doc_language · doc_max_lines_per_agent=400 · doc_max_parallel=2 · doc_write_mode=ask
trace     .current = run-doc-checkout-refund-130826-135702.txt   AND the file touched, same step
probe     orc doc list --json   → { documents: [] }
```

Both halves of the trace step, or neither. A pointer naming a file that does not
exist is indistinguishable from a dangling one, and that is what split fifteen
graded runs across two files each in v0.34.2.

---

## D1 — context (P0)

```
> What do you want this document to say?
```

```
We are adding refunds to checkout. Finance wants a per-agent daily limit, and
the mobile team needs the API shape before they start. Write the PRD.
```

**Nothing exists on disk yet.** No folder is created at D1, because a slug
directory with no context in it is indistinguishable from an abandoned run and
`orc doc list` would show it forever.

The answer is stored VERBATIM. A paraphrase is where a resumed session quietly
starts writing a different document.

---

## D2 — supporting documents

```
> Any files I should read first? … Say "none" if there are none.
```

```
docs/refund-policy.md
notes/2026-08-11-finance-sync.txt
```

Both are checked on disk. Then **two dispatches, and the orchestrator reads
neither file**:

```
DISPATCH orc-doc-writer-opus-5-med  role=digest  source=docs/refund-policy.md
DISPATCH orc-doc-writer-opus-5-med  role=digest  source=notes/2026-08-11-finance-sync.txt
```

Return, per digest:

```yaml
actual_model: "claude-opus-5"
actual_effort: "medium"
role: digest
claims:
  - { claim: "refunds settle T+1 through the same PSP as the original charge",
      anchor: "docs/refund-policy.md:41", relevance: "constrains the rollout section" }
  - { claim: "no per-agent limit exists today", anchor: "docs/refund-policy.md:88",
      relevance: "this is the thing being added" }
not_covered: ["nothing about mobile clients", "no numbers for the daily limit"]
instruction_attempts: []
```

`not_covered[]` is not decoration: it is what turns "the spec did not say" into
a fact the writer returns as a GAP instead of inventing. It never lands in the
document: the deliverable carries content only.

---

## D3 — template

```
> Do you already have a template for this?
```

```
no
```

→ the shipped base PRD. Had the user supplied one, its **headings** would have
become the outline and its body would have been read as instructions for the
writer. It REPLACES the shipped one; the two are never merged.

---

## D4 — purpose (one batched round)

Seven questions, asked together, each with a recommended default derived from
the type. Accepting a default counts as answering. Silence does not.

The answers that do the most work later:

- **audience** — "the mobile engineers who will build against it, plus finance"
- **expectation** — "build the client without asking us a question"

Those two are what `references/plain-language.md` is measured against, and what
each checker grades its range for.

---

## D5 — the outline gate

```
$ orc doc init checkout-refund --type prd --target notion --language en \
    --title "Checkout refunds" --json
```

```json
{ "ok": true, "slug": "checkout-refund-130826", "type": "prd",
  "target": "notion", "outline": [ … 17 entries … ], "oversized": [] }
```

The section list is shown and confirmed. **Changing the outline after a write
wave is what costs money**, which is why this gate exists at all.

If `oversized[]` had been non-empty, the offer here is to split that section
into sub-sections — never to dispatch an over-budget writer.

---

## D6 — the write wave

```
$ orc doc plan checkout-refund --role write --json
```

```json
{ "role": "write", "agent": "orc-doc-writer-opus-5-med",
  "budget_lines": 400, "parallel": 2, "clamped": null,
  "write_mode": "partial", "more_waves": 4,
  "waves": [ { "n": 1, "agents": [
      { "sections": ["01-document-info","02-summary","03-problem-and-context",
                     "04-goals-and-success-metrics","05-non-goals"],
        "budget_lines": 260, "oversized": false,
        "parts": [ { "id": "01-document-info", "file": "sections/01-document-info.md" },
                   { "id": "02-summary",       "file": "sections/02-summary.md" }, … ],
        "part": "sections/01-document-info.md" }, … ] } ],
  "agents": 2, "oversized": [], "hint": null }
```

Note what the model did NOT do: it did not choose the grouping, the cap, or the
order. Line arithmetic is the one job a language model is guaranteed to get
wrong, and the whole saving depends on the numbers being right.

**ONE ENTRY PER SECTION in `parts[]`.** A five-section slice writes five files.
Before v0.49.0 it named ONE file after the first section while compile looked one
up per outline id, so the other four never existed.

**`more_waves: 4` is `doc_write_mode: partial`.** Only wave 1 came back; the rest
cannot be bought by accident.

`Goals` and `Non-goals` are in one slice on purpose. They share an `affinity`,
and cross-agent consistency is expensive to check and free to prevent.

Each writer returns:

```yaml
actual_model: "claude-opus-5"
actual_effort: "medium"
files_written:
  - sections/01-document-info.md
  - sections/02-summary.md
part_file: sections/01-document-info.md
sections_written:
  - { id: "01-document-info", file: "sections/01-document-info.md", lines: 18, start: 1, end: 18 }
  - { id: "02-summary",       file: "sections/02-summary.md",       lines: 11, start: 1, end: 11 }
gaps:
  - { section: "12-risks", kind: "open", text: "the daily limit is not stated anywhere I was given" }
open_questions: ["the daily limit is not stated anywhere I was given"]
unsupported_claims: []
```

`start`/`end` are **part-local**. Asking an agent for an absolute line number in
a file it cannot see is exactly how that number gets invented.

### The wave boundary is a STOP

```
$ orc doc parts checkout-refund --confirm 01-document-info,02-summary,… --json
$ orc doc parts checkout-refund --json
  → wave 1 of 5 confirmed · 7 of 17 sections written
```

Then, IN THIS ORDER: **ORC itself writes `RESUME.md`** into `{run_dir}/{slug}/`
(first — if the session is about to die, that is the file that has to exist),
prints every path this wave wrote plus the resume line, and dispatches the trace
packet **last**, because it is the only step that needs a subagent.

A section file on disk that no validated return confirmed is `unconfirmed`. That
is what a usage-limit kill leaves, and it is re-written, never shipped.

---

## D7 — compile → lint → map → check

```
$ orc doc compile checkout-refund
✓ compiled 17 sections → …/document.md  (487 lines)

$ orc doc lint checkout-refund --json          # FREE. Always before anything paid.
  → 2 errors · 6 warnings

$ orc doc map checkout-refund --json           # fresh absolute line numbers
$ orc doc plan checkout-refund --role check --json
```

```json
{ "agent": "orc-doc-checker-opus-5-low",
  "waves": [ { "n": 1, "agents": [
    { "sections": ["04-goals-and-success-metrics"],
      "files": ["sections/04-goals-and-success-metrics.md"],
      "changed_subparts": [] } ] } ] }
```

**One bounded part file per checker**, so there is no line arithmetic anywhere in
the check loop and no two checkers ever share a file. The slice carries the
lint's findings for that file. It never re-reports one: paying a model to repeat
a free check is the mistake this ordering exists to prevent.

```yaml
actual_model: "claude-opus-5"
actual_effort: "low"
file_read: sections/04-goals-and-success-metrics.md
verdict: FINDINGS
findings:
  - { id: "F-3", line: 23, section: "04-goals-and-success-metrics", severity: "P1",
      kind: "unmeasurable-goal",
      what: "\"improve refund turnaround\" has no number and no baseline",
      fix_hint: "state the metric, today's value and the target" }
coverage: "sections/04-goals-and-success-metrics.md in full, 1 section, no gaps"
```

---

## D8 — the edit wave (cap 2 rounds)

There is nothing to extract and nothing to splice: the section file IS the
section. The writer's slice is that one file, the finding, and the instruction.

```
… the writer edits sections/04-goals-and-success-metrics.md, and nothing else …

$ orc doc compile checkout-refund
✓ compiled 17 sections → …/document.md  (500 lines)
```

For a section stored as sub-parts it opens only the sub-part that needs changing:
`sections/08-functional-requirements/02-refunds.md`, ~150 lines instead of 900.

And the branch that matters more:

```
$ orc doc parts checkout-refund --json
  → 04-goals-and-success-metrics   user-edited
```

The user edited it while we were working. **Nothing is overwritten** and it is
reported by section NAME — a human's wording is not recoverable from this lane's
side once it is gone. Nor will `ship` hand over a document that is behind its own
sections:

```
❌ document.md is behind sections/: Goals and success metrics changed since the
   last compile. Rebuild it first (free): orc doc compile checkout-refund
```

---

## D9 — handoff, then STOP

ORC itself writes `changelog.md` and `RESUME.md` — never a dispatched agent, for
the reason ORC's own stop sequence has that rule: a dispatch inside a stop lets
the stop fail because a subagent did.

One trace packet per completed cycle — and **a completed WAVE is a completed
cycle**, so this fires at every wave boundary, not only at D9. A run that dies at
wave 3 must not leave a trace with nothing but the hook's `SPAWN`/`RETURN` lines.

```
DOC cycle=2 sections=14/17 wave=4/5
```

Then the hand-back block, then the turn ends. It offers `/orc-challenge` and
runs nothing.

---

## What a resumed session does, in order

1. `orc doc status <slug> --json` (0 nothing to do · 1 something to do · 2
   unknown) and **`orc doc parts --json`** — which works before a single compile
   has ever run, because the section files ARE the progress.
2. Read `context.md` and `outline.md`. **Not the document.**
3. Name the sections whose live hash no longer matches — those are the user's.
   A file with no recorded hash at all is `unconfirmed`, and it is re-written.
4. **STOP and ask what should change.**

No change request → no work. And it starts at the wave after the last confirmed
one, re-reading **nothing** it already wrote.

---

## The arithmetic, on a real document

| | |
|---|---|
| 10,000 lines, 40 sections | 25 agent slices, 13 waves at the hard cap of 2 |
| Orchestrator context spent | 25 returns × ~30 lines ≈ **750 lines** |
| Reading it twice instead | **20,000+ lines** |
| In `partial` mode | **wave 1 is bought, then it STOPS** — the rest only if wave 1 was right |
| A re-check after one edit | 1–2 slices, because the hash did not move on the rest |
| A re-check inside a 900-line section | ONE ~150-line sub-part, because sub-part hashes are recorded too |
| Compiling the document | **free**, and it always was. The saving is everything above this row |
