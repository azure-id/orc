# The grill context doc — shape and rules

This is the file `/orc-grill` writes when the user picks exit 1 or exit 2. It is
written for a HUMAN to read later, and for `/orc-analyze` to consume as an input
instead of re-asking scope.

## Where it goes

```
<projectRoot>/orc-grill/<slug>/grill-context.md
```

- `<slug>` comes from the **first** grill on this idea. No date in the folder
  name, so re-running with the same slug re-opens the same thread.
- **One file per folder. Never a second `.md`.**
- Project root, next to `orc-quick/`, `test-generator/` and `learning-docs/` —
  never inside `.claude/`, never inside a run folder.
- **Never staged for commit by ORC.** Do not edit `.gitignore`.

## Rules

1. **Write it before the exit completes.** Exit 2 writes the doc FIRST, then
   hands off — the analyst reads a file, not a memory of a conversation.
2. **Re-opening extends, never replaces.** A second grill on the same slug adds
   a new dated round section and updates the context block. Earlier decisions
   stay, with the date they were made. A decision that was later reversed is
   struck through with its reason, not deleted — the reversal is the useful part.
3. **Only what was settled.** A question the user never answered belongs in
   "still open", never in "decided" with a guessed value.
4. **Quote the user.** Their own words for what the thing is; your paraphrase is
   how intent drifts.

## The context block

The top of the file carries a delimited summary:

```markdown
<!-- orc-grill:context -->
**merchant-notifications** · last grilled 08-08-2026 · 11 decisions · 2 open
Merchants get told when a payout fails. Email only, no in-app, no SMS.
Batched hourly, not per-event. Existing `notifications` table is reused.
Open: what the email actually says (needs a mock) · whether the retry
worker already has a hook (needs code).
<!-- /orc-grill:context -->
```

**Why the markers matter.** A later session — or `/orc-analyze` deciding whether
this input is worth consuming — reads ONLY this block. It is small and cheap. The
body below is for a human.

## Body shape

```markdown
## What this is
<the user's own words, quoted, then one paragraph of plain-language summary>

## Decided
| # | decision | tag | why it was settled this way |
|---|---|---|---|
| 1 | email only, no in-app | intent | in-app needs a socket layer that does not exist yet |
| 2 | no new dependencies | constraint | the user said "no new deps" — verbatim |
| 3 | batch hourly | intent | per-event was rejected: payout retries fire in bursts |

`tag` is `intent` (what to build) or `constraint` (a boundary the build must not
cross). Every `constraint` row becomes a `spec_invariants[]` entry downstream and
is appended VERBATIM to every executor slice — so word it as an instruction, not
as a note.

## Ruled out of scope
- SMS — "later, not now"
- backfilling old failed payouts — the user said the data is not worth it

Say why, in the user's terms. A scope boundary with no reason gets re-litigated.

## Facts looked up (not asked)
| fact | source | value |
|---|---|---|
| is there a notifications table | wiki FRESH · wiki/orc-feature-notifications.md | yes, `notifications(id, kind, payload)` |
| does this project retry payouts | recon dispatch (sonnet-4-6/medium) | yes, `src/jobs/payout-retry.js:88` |

This table is what stops the next lane re-deriving the same things.

## Still open — each with the instrument that settles it
| question | why talking cannot settle it | instrument |
|---|---|---|
| what the email says | taste — needs something to look at | `mock_example` phase → `mock-examples/<slug>/` |
| does the retry worker expose a hook | a claim about the repo | `/orc-analyze` |

An open question with the right instrument named is a finished answer. An open
question with no instrument is unfinished work.

## Rounds
A short log: round number, what was asked, what came back. One line per question.
This is what makes a re-opened thread cheap to resume.
```

## Writing style

Write for the person who comes back in three weeks having forgotten everything —
and for the analyst who will read this instead of interviewing them again.

- Plain words, short sentences.
- Name real files and line numbers wherever a fact came from the repo.
- Always record **why** an option lost. A rejected idea with its reason is what
  stops the next session proposing it again.
