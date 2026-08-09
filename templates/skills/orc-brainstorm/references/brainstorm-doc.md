# The brainstorm session doc — shape and rules

This is the file `/orc-brainstorm` writes when the user answers **yes** at the P0
gate, and again (as a snapshot only) when a run suspends into `/orc-grill`. It is
written for a HUMAN to read later, and for the next lane to consume instead of
re-deriving the whole conversation.

## Where it goes

```
<projectRoot>/orc/brainstorming-session/<slug>/brainstorm-session.md
```

- Project root, visible — **never inside `.claude/`**, never inside a run folder.
  Same reason as `orc-quick/`, `orc-grill/` and `learning-docs/`: a document a
  human reads and reuses belongs where the human can find it.
- `<slug>` comes from the **first** brainstorm on this topic. No date in the
  folder name, so the same slug **re-opens the same thread**.
- **One `.md` per folder, ever.** A re-opened thread extends the file.
- **Never staged for commit by ORC.** Do not edit `.gitignore`.

## Rules

1. **Written on an explicit yes only.** The P0 gate is the trigger. The single
   exception is the suspend snapshot, which is run state — write it, say in one
   line that it is a snapshot, and carry on.
2. **Re-opening extends, never replaces.** A reversed decision is struck through
   **with its reason**, not deleted — the reversal is the useful part.
3. **Only what was settled.** An unanswered question goes in *Still open*, never
   in *Decided* with a guessed value.
4. **Quote the user.** Their words for what the problem is and for any candidate
   they proposed; the paraphrase is how intent drifts.
5. **Every rejected thing keeps its reason.** This is the doc's whole point.

## The context block

The top of the file carries a delimited summary. A later session — or
`/orc-analyze` deciding whether this input is worth consuming — reads ONLY this
block. It is small, cheap, and always current.

```markdown
<!-- orc-brainstorm:context -->
**merchant-onboarding** · last session 09-08-2026 · 14 candidates · 4 directions
· chosen: "self-serve with a human safety net" · 2 open
Rejected: fully manual (does not scale past ~40/mo) · fully automated (KYC edge
cases need a human) · partner-led (no partners yet).
<!-- /orc-brainstorm:context -->
```

## Body shape

```markdown
## The problem              <- B1, in the user's own quoted words
## Who it is for
## What "better" looks like
## What is fixed            <- constraints, verbatim

## Candidates               <- EVERY B2 idea: #, lens, one line, → direction or graveyard
## Directions               <- the B3 table: bet · must be true · cost · kills
## Stress                   <- per direction: pre-mortem sentence, worst case, best case
## The pick — and why the others lost
## Decided                  <- #, decision, tag (intent|constraint), why, source
## Still open               <- question · why talking cannot settle it · instrument
## Facts looked up          <- fact · source · value (merged from any grill trip)
## Sessions                 <- date, phases run, what changed
```

### Candidates

Every B2 candidate, with the lens that produced it and where it ended up. A
candidate with no destination is a conservation failure:

```markdown
| # | lens | candidate | went to |
|---|---|---|---|
| 1 | SCAMPER (combine) | one form, KYC inline | direction A |
| 4 | inversion | let them onboard with nothing and gate at first payout | direction C |
| 7 | analogy (Stripe) | progressive limits by verification level | graveyard — needs a risk model we do not have |
```

### Directions

```markdown
| name | the bet | what must be true | what it costs | what it kills | folds in |
|---|---|---|---|---|---|
| self-serve + safety net | most merchants are simple | ops can absorb ~10%/wk manual | 3–4 wks, 1 ops hire | a fully automated future for 2 quarters | 1, 2, 5, 9 |
```

### The pick — and why the others lost

**One paragraph per loser.** This is the payload of the whole document: it is what
stops the next session — or the next person — re-proposing an idea this one
already rejected. A graveyard that is a bullet list with no reasons has failed.

### Decided

```markdown
| # | decision | tag | why | source |
|---|---|---|---|---|
| 1 | self-serve with a manual review queue | intent | volume forecast makes fully manual break at ~40/mo | this session |
| 2 | no new third-party KYC vendor | constraint | the user said it verbatim — procurement takes a quarter | this session |
| 3 | reuse the existing `merchants` table | constraint | settled in the grill trip | /orc-grill |
```

`tag` is `intent` (what to build) or `constraint` (a boundary the build must not
cross). Every `constraint` row becomes a `spec_invariants[]` entry downstream and
is appended VERBATIM to every executor slice — so word it as an instruction, not
as a note. A decision carried back from a suspend keeps its tag and names its
source lane.

### Still open

```markdown
| question | why talking cannot settle it | instrument |
|---|---|---|
| what the approval email says | taste — needs something to look at | `mock_example` phase → `mock-examples/<slug>/` |
| does the payout job already check status | a claim about the repo | `/orc-analyze` |
| will merchants tolerate a 1-day wait | a claim about people | a test with real merchants — not this lane |
```

An open question with the right instrument named is a finished answer. An open
question with no instrument is unfinished work. A parked assumption from a
declined suspend lands here too, with the candidates that rest on it.

## Writing style

Write for the person who comes back in three weeks having forgotten everything —
and for the lane that will read this instead of running the conversation again.

- Plain words, short sentences. No lens jargon without the plain-language gloss.
- Name real files and line numbers wherever a fact came from the repo; name the
  source and the date wherever it came from a web lookup.
- Always record **why** an option lost.
