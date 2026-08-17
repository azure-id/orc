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

1. `orc doc status <slug> --json` (0 nothing to do · 1 something to do · 2
   unknown slug) and **`orc doc parts <slug> --json`** — which works BEFORE a
   single compile has ever run, because the section files ARE the progress.
2. **Read `context.md` and `outline.md`. NOT the document.**
3. **Detect the user's own edits.** Sections whose live hash ≠ the hash
   `doc.json` recorded are `user-edited`. Say so, **by section name**. A part
   with no recorded hash at all is `unconfirmed` — a wave killed mid-flight —
   and it is re-written, never shipped.
4. **HARD STOP and ask what should change.**

```
Picking up: PRD — checkout refunds (started 13-08-2026, cycle 2).
I have read the context you gave me — you do not need to repeat it.

  Sections:  17 planned · 14 written · wave 5 of 7
  You edited since last time: §02 Summary, §08 Requirements   ← I will not touch these unless you say so
  Not written yet: §12 Risks · §13 Rollout
  document.md is 2 sections behind sections/ — rebuilding it is free.

What should change?  (a section to rewrite, something to add, a finding to fix,
or "finish the rest")
```

**No change request → no work.** The lane stops there. Regenerating a document
nobody asked to change is the most expensive possible way to do nothing.

## `RESUME.md` — the P0 hand-back

Written by **the lane itself, never by a dispatched agent** — a dispatch inside
a stop sequence lets a stop fail because a subagent did. Rewritten at the end of
**every wave**, not just every cycle: a usage-limit kill between waves has to
leave something on disk that says where it stopped.

**It lives at `{run_dir}/{slug}/RESUME.md`** — the registered v0.42.0 home, and
the ONLY place `listRuns()` looks. It is not in the document folder, and there is
no second copy there: two copies is two ideas, and they drift. Anyone browsing
the folder gets the same line from `orc doc status`.

```markdown
# Resume this document

Paste this line into a new Claude Code session, in this project:

    /orc-doc resume prd-checkout-refund-130826

Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written · phase D6 · wave 5 of 7

- Sections:   orc/orc-doc/prd-checkout-refund-130826/sections/   ← the source of truth
- Document:   document.md is a BUILD ARTIFACT — `orc doc compile` rebuilds it, free
- Context:    context.md  (the new session reads this first — you do not repeat yourself)
- Not written yet: §12 Risks · §13 Rollout

## What the new session will do
1. Read context.md and doc.json. It will NOT re-ask what you already answered.
2. Start at wave 6, and re-read NOTHING it already wrote.
3. Ask you what should change. **It will not touch the document until you say.**
```

**The `Where it stands:` line is at COLUMN 0.** Never `## Where it stands:` —
`parseStands` is line-anchored, so a heading prefix means it never matches, and
that single line is what `orc doc list`, `orc resume` and `orc run list` all
parse. There is a test that feeds this exact template to the real parser.

**One generator, not two.** `orc doc status --json` already emits `where`. Copy
it **verbatim**; never assemble your own. The CLI computes, the skill renders,
and the two can then never disagree.

## The wave hand-back (P0, every wave)

```
Wave 2 of 7 done — 6 of 17 sections written.

  orc/orc-doc/acme-prd-170826/sections/04-detailed-design/01-data-model.md    142 L
  orc/orc-doc/acme-prd-170826/sections/04-detailed-design/02-api-surface.md   118 L
  orc/orc-doc/acme-prd-170826/sections/05-rollout.md                           96 L

Read them now if you want to redirect — nothing later is bought yet.
See it as one file (free):   orc doc compile acme-prd-170826 --partial

To carry on — new session, or after your usage limit resets:

    /orc-doc resume acme-prd-170826

Everything needed is on disk. The next session starts at wave 3 and re-reads
nothing it already wrote.
```

## The hand-back mention (P0, every cycle)

After **every** cycle that touched the document — the first run and every
resume — this is the last thing on screen, always in this shape:

```
Saved to  orc/orc-doc/prd-checkout-refund-130826/sections/   (the source of truth)
          orc/orc-doc/prd-checkout-refund-130826/document.md (rebuilt, free)

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
- Changed: sections/04-goals-and-metrics.md (rewritten, 22 → 18 lines), sections/12-risks.md (one row added).
- Untouched: §02 and §08 — you edited those yourself.
- Not written yet: §13 Rollout.
```

An Open question or an Assumption does NOT go here and does not go into the
document. It goes into the journal as a gap —
`orc doc log <slug> --kind gap --sections <id> --text "…"` — and the CLI derives
`gaps.md` from that. The deliverable carries content only.

---

## The journal — what you asked for, in order (v0.48.1)

`changelog.md` above is **lane-written prose**. The journal is the **derived**
companion, and the two are not the same thing: one is a narrative someone wrote,
the other is a merge of four sources with the provenance of every row attached.

```
orc doc log     <slug> --kind request|decision|gate|note|gap --text "…" [--sections a,b] [--source user|/orc-grill|/orc-brainstorm]
orc doc journal <slug> [--json]
```

| `origin` | source | what it is |
|---|---|---|
| `recorded` | `journal[]` | the user's own words, **verbatim** |
| `derived` | `cycles[]` | a write / check / edit / compile cycle — a machine fact |
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

The resumed session's moves are unchanged — `orc doc status`, `orc doc parts`,
read `context.md` and `outline.md` (**not the document**), name what the user
edited, then HARD STOP and ask. After that, **`orc doc next <slug> --json` says
what happens next** and this lane does exactly that, until it exits 1.

Nothing about the pipeline is remembered across the gap any more. That is the
point: a session resumed months later in a fresh context has the same
information as the one that started it.
