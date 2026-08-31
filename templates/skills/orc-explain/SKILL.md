---
name: orc-explain
description: >
  Say it again, so it lands. Use for "/orc-explain", "wait, what?", "I did not
  follow that", "explain that again". The user has just read something from ORC
  they did not understand — a preflight block, a scoring line, a gate result, a
  question. Re-pitch that message: add the background it assumed, use ordinary
  words, and define every ORC-only term it used. It reports a failure of
  UNDERSTANDING, not a request for fewer words. Explains only what was just said
  — it never re-does the work, never dispatches, never writes a file.
---

# ORC-EXPLAIN

The user just read something from ORC and it did not land. That is the whole
trigger, and it is a specific one.

**"Wait, what?" is not "be shorter".** It reports *my understanding failed* —
which is answered by supplying what was missing, not by compressing what was
already there. A summary of a message someone did not understand is the same
message, shorter.

## What to do

Take the message the user is pointing at (the last ORC output, unless they name
an earlier one) and give it again:

1. **Say the point first**, in one sentence, in ordinary words.
2. **Add the background the message assumed.** This is almost always the real
   gap — the message was accurate and complete for someone who already knew what
   a wave is.
3. **Define every ORC-only term it used**, in this project's own terms: band,
   facet, disposition, P0–P3, freshness tier, wave, slice, gate, packet, lane.
   Use `wiki/orc-orientation.md` when a wiki exists, so the words match the words
   the rest of this repo's docs use.
4. **Say what it means for the user** — what decision, if any, is now theirs.

Then stop, and return to exactly where the run was. Nothing about the run
changes: no re-plan, no re-score, no undo, no new question.

## Keep this skill short

Its brevity is the design. A long skill that says "be clear" produces a verbose
model, because the model copies the length it sees. There is nothing else here on
purpose.

## Rules

- **Explain only.** Never dispatch an agent, never edit or write any file, never
  change a gate outcome or a phase.
- **No trace.** This lane owns no run, writes no trace and deletes no pointer —
  it can fire many times in one session and tracing it would flood `log_dir` for
  zero signal. The consequence is accepted and stated: `/orc-explain` usage is
  invisible to `orc stats`, which says so in its own help text.
- **User-invoked only.** No lane ever calls this for the user.
- If the user actually wanted the work redone rather than restated, say so and
  point at the lane that does it — do not quietly become that lane.

## Config

Resolve with `orc lane config orc-explain --json` and obey `effective`. Never merge
`.claude/orc.config.yaml` yourself, and never re-derive a precedence. Exit ≠ 0 →
say so and use `../_shared/config-precedence.md`'s documented defaults, out
loud. Nothing this lane reads is contested, gated or a stop, so it owes no
preflight line and has no gate to honour.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls orc-explain --json` names every
CLI call this lane makes, each with its exit-code contract, its cost, when to run
it, and what an EMPTY answer means. Never invent a spelling, never re-word an
exit code, and never re-derive a state word — the CLI's state words are the only
state words, and **an exit code is an ANSWER wherever that contract says so, not
a failure**. A call the answer does not name is a call this lane does not make.
Exit ≠ 0 from the catalogue itself → say the CLI is unavailable and name the
command you are about to run, out loud, before running it.

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **none** · safe point **read-only, seconds long**. Nothing here to checkpoint, so all three modes behave identically — say so rather than asking. Never begin a wait between a dispatch and its validated return, or before the smoke gate has reported.
