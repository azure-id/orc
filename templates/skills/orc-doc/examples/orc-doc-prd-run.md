# `/orc-doc` — an annotated PRD run

> The dense one. Every phase, every command, every return, with the reason each
> shape is what it is. The reader-facing walkthrough is `mock-run/orc-doc.md`.

---

## D0 — preflight (silent, once)

```
config    log_dir · doc_dir · doc_language · doc_max_lines_per_agent=400 · doc_max_parallel=4
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
a fact the writer can put in a `> **Open:**` line instead of inventing.

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
  "budget_lines": 400, "parallel": 4, "clamped": null,
  "waves": [ { "n": 1, "agents": [
      { "sections": ["01-document-info","02-summary","03-problem-and-context",
                     "04-goals-and-success-metrics","05-non-goals"],
        "budget_lines": 260, "oversized": false,
        "part": ".work/01-document-info.md" }, … ] } ],
  "agents": 5, "oversized": [], "hint": null }
```

Note what the model did NOT do: it did not choose the grouping, the cap, or the
order. Line arithmetic is the one job a language model is guaranteed to get
wrong, and the whole saving depends on the numbers being right.

`Goals` and `Non-goals` are in one slice on purpose. They share an `affinity`,
and cross-agent consistency is expensive to check and free to prevent.

Each writer returns:

```yaml
actual_model: "claude-opus-5"
actual_effort: "medium"
part_file: .work/01-document-info.md
sections_written:
  - { id: "01-document-info", lines: 18, start: 1,  end: 18 }
  - { id: "02-summary",       lines: 11, start: 19, end: 29 }
open_questions: ["the daily limit is not stated anywhere I was given"]
unsupported_claims: []
```

`start`/`end` are **part-local**. Asking an agent for an absolute line number in
a file it cannot see is exactly how that number gets invented.

---

## D7 — assemble → lint → map → check

```
$ orc doc assemble checkout-refund
✓ assembled 17 sections → …/document.md  (487 lines)

$ orc doc lint checkout-refund --json          # FREE. Always before anything paid.
  → 2 errors · 6 warnings

$ orc doc map checkout-refund --json           # fresh absolute line numbers
$ orc doc plan checkout-refund --role check --json
```

```json
{ "agent": "orc-doc-checker-opus-5-low",
  "waves": [ { "n": 1, "agents": [
    { "sections": ["04-goals-and-success-metrics","05-non-goals"],
      "range": [119, 204], "read_limit": 86 } ] } ] }
```

The checker's slice carries the lint's findings for its own range. It never
re-reports one: paying a model to repeat a free check is the mistake this
ordering exists to prevent.

```yaml
actual_model: "claude-opus-5"
actual_effort: "low"
range_read: [119, 204]
verdict: FINDINGS
findings:
  - { id: "F-3", line: 141, section: "04-goals-and-success-metrics", severity: "P1",
      kind: "unmeasurable-goal",
      what: "\"improve refund turnaround\" has no number and no baseline",
      fix_hint: "state the metric, today's value and the target" }
coverage: "119..204, 2 sections, no gaps"
```

---

## D8 — the edit wave (cap 2 rounds)

```
$ orc doc extract checkout-refund --section 04-goals-and-success-metrics
✓ extracted to .work/04-goals-and-success-metrics.md  (lines 119..176, 58 L)   [hash recorded]
```

The writer's slice is the part file, the finding, and the instruction. It edits
that file and nothing else.

```
$ orc doc splice checkout-refund
✓ 1 section spliced back, bottom-up.
    04-goals-and-success-metrics   58 → 71 L  (+13)
```

Bottom-up, highest `start` first, so a length change never shifts a range that
has not been spliced yet.

And the branch that matters more:

```
❌ these sections changed on disk after they were extracted: Goals and success
   metrics. Nothing was written.
```

The user edited it while we were working. **Nothing is overwritten** and the
conflict is reported by section NAME — a human's wording is not recoverable
from this lane's side once it is gone.

---

## D9 — handoff, then STOP

ORC itself writes `changelog.md` and `RESUME.md` — never a dispatched agent, for
the reason ORC's own stop sequence has that rule: a dispatch inside a stop lets
the stop fail because a subagent did.

One trace packet for the cycle:

```
DOC cycle=2 sections=14/17
```

Then the hand-back block, then the turn ends. It offers `/orc-challenge` and
runs nothing.

---

## What a resumed session does, in order

1. `orc doc status <slug> --json` (0 complete · 1 in progress · 2 unknown) and
   `orc doc map --json`.
2. Read `context.md` and `outline.md`. **Not the document.**
3. Name the sections whose live hash no longer matches — those are the user's.
4. **STOP and ask what should change.**

No change request → no work.

---

## The arithmetic, on a real document

| | |
|---|---|
| 10,000 lines, 40 sections | 25 agent slices, 7 waves |
| Orchestrator context spent | 25 returns × ~30 lines ≈ **750 lines** |
| Reading it twice instead | **20,000+ lines** |
| A re-check after one edit | 1–2 slices, because the hash did not move on the rest |
