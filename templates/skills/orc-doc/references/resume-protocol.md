# Resuming — the contract that makes a document survive a session

> **The context is gathered once and frozen.** A resumed session reads
> `context.md` from disk; it never re-interviews the user for what session 1
> already settled. **a lane that re-asks a frozen question** has broken this
> contract.

## Entry

```
/orc-doc resume                      → lists every document with its status line
/orc-doc resume prd-checkout-refund  → prefix match; an ambiguous prefix lists candidates
```

`orc doc list --json` supplies the list. It may only claim what the disk proves:
`document.md` missing means **"not started"**, never "failed".

## The resumed session's first four moves

1. `orc doc status <slug> --json` (0 complete · 1 in progress · 2 unknown slug)
   and `orc doc map <slug> --json`.
2. **Read `context.md` and `outline.md`. NOT the document.**
3. **Detect the user's own edits.** Sections whose live hash ≠ the hash
   `doc.json` recorded are `user-edited`. Say so, **by section name**.
4. **HARD STOP and ask what should change.**

```
Picking up: PRD — checkout refunds (started 13-08-2026, cycle 2).
I have read the context you gave me — you do not need to repeat it.

  Document:  487 lines · 17 sections · 14 written · lint GREEN
  You edited since last time: §02 Summary, §08 Requirements   ← I will not touch these unless you say so
  Still open: §12 Risks (waiting on the fraud limit) · §13 Rollout (not started)

What should change?  (a section to rewrite, something to add, a finding to fix,
or "finish the open sections")
```

**No change request → no work.** The lane stops there. Regenerating a document
nobody asked to change is the most expensive possible way to do nothing.

## `RESUME.md` — the P0 hand-back

Written by **the lane itself, never by a dispatched agent** — a dispatch inside
a stop sequence lets a stop fail because a subagent did. Rewritten at the end of
**every** cycle.

```markdown
# Resume this document

Paste this line into a new Claude Code session, in this project:

    /orc-doc resume prd-checkout-refund-130826

## Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written

- Document:   orc/orc-doc/prd-checkout-refund-130826/document.md   (487 lines)
- Context:    context.md  (the new session reads this first — you do not repeat yourself)
- Still open: §12 Risks (needs your input on the fraud limit) · §13 Rollout (not started)

## What the new session will do
1. Read context.md and doc.json. It will NOT re-ask what you already answered.
2. Ask you what should change. **It will not touch the document until you say.**
```

Keep the `Where it stands:` line in that exact shape — it is what
`orc doc list`, `orc resume` and `orc run list` parse, which is how a listing
never has to open `doc.json`.

## The hand-back mention (P0, every cycle)

After **every** cycle that touched the document — the first run and every
resume — this is the last thing on screen, always in this shape:

```
Saved to  orc/orc-doc/prd-checkout-refund-130826/document.md

Editing it yourself is expected — go ahead. When you want to carry on, even in a
brand-new chat, paste this line:

    /orc-doc resume prd-checkout-refund-130826

The full picture is in that folder's RESUME.md — it remembers the context, the
audience and what is still open, so you never have to explain it twice.
```

Then the two things this lane offers but never does:

```
Not staged, not committed. If your team should see it:
    git add orc/orc-doc/prd-checkout-refund-130826/

Want it graded before you send it? In a NEW session:
    /orc-challenge orc/orc-doc/prd-checkout-refund-130826/document.md
```

`/orc-challenge` is offered and never run from here. It is the same separation
its own contract already enforces from the other side: a session that wrote the
thing cannot honestly grade it.

## The user's edits are sacred

A `user-edited` section is **never** rewritten without an explicit instruction
naming it. If a finding lands inside one, the finding is *reported* and the fix
is *offered*, never applied. Overwriting a human's paragraph is unrecoverable
from this lane's side — the part file is gone, and their wording with it.

## `changelog.md`

One entry per cycle, appended, newest last. It is the answer to "what did the
last session actually do", and it is written by the lane, not derived:

```markdown
## Cycle 2 — 14-08-2026
- You asked: tighten §04 Goals and add the fraud limit to §12.
- Changed: §04 Goals (rewritten, 22 → 18 lines), §12 Risks (one row added).
- Untouched: §02 and §08 — you edited those yourself.
- Still open: §13 Rollout.
```

---

## The journal — what you asked for, in order (v0.48.1)

`changelog.md` above is **lane-written prose**. The journal is the **derived**
companion, and the two are not the same thing: one is a narrative someone wrote,
the other is a merge of four sources with the provenance of every row attached.

```
orc doc log     <slug> --kind request|decision|gate|note --text "…" [--sections a,b] [--source user|/orc-grill|/orc-brainstorm]
orc doc journal <slug> [--json]
```

| `origin` | source | what it is |
|---|---|---|
| `recorded` | `journal[]` | the user's own words, **verbatim** |
| `derived` | `cycles[]` | a write / check / edit wave — a machine fact |
| `derived` | the ship / unship records | a machine fact |
| `observed` | a section that turned `user-edited` | a machine fact, no text |

**It never invents an entry.** A cycle that ran with nothing logged renders as
an explicit gap — *"cycle 2 ran · no request was recorded for it"* — and **never**
a plausible reconstruction from file mtimes. **a lane that invents a journal entry**
has broken this contract. Same honesty rule as `/orc-pact`'s
**UNCHECKABLE**: not knowing is an answer, and faking it teaches people to
distrust the rows that are real.

**Call `orc doc log` at D1 with the user's words verbatim.** A resumed session
reads the journal to answer *"what have I been asking for?"*, and a paraphrase
there is the same failure as a paraphrase in `context.md` — it is where a
resumed session quietly starts writing a different document.

## Resuming is a loop now, not a memory

The resumed session's moves are unchanged — `orc doc status`, `orc doc map`,
read `context.md` and `outline.md` (**not the document**), name what the user
edited, then HARD STOP and ask. After that, **`orc doc next <slug> --json` says
what happens next** and this lane does exactly that, until it exits 1.

Nothing about the pipeline is remembered across the gap any more. That is the
point: a session resumed months later in a fresh context has the same
information as the one that started it.
