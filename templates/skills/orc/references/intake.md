# Reference — Phase 0 Intake

Goal: extract just enough that the intent-spec can't be misread, then get out of
the way. A wrong understanding parallelized is worse than a wrong understanding
done serially. Never interrogate; never ask what the repo can tell you.

**Before intake questions — analyst auto-trigger (see SKILL.md Phase 0):** if the
input includes a document OR the requirement is ambiguous/underspecified, dispatch
the System Analyst FIRST (doc-optional; standard/deep gate; scouts in deep mode).
It resolves scope + accuracy with evidence-or-mark and recommended-option
questions before any intent-spec is drafted. When it hands back "take into build",
its confirmed spec feeds Phase 1 planning.

## Step 0 — Create the run folder FIRST

Before anything else, derive a `{run-slug}` from the user's request (short,
lowercased, hyphenated intent name, e.g. "merchant-notifications") and create
`.claude/skills/orc/run/{run-slug}/`. ALL run artifacts
(intent-spec, checkpoint, state-of-play, decision log) live here — never in the
project root, never loose in run/. If a folder with that slug exists, append a
short timestamp.

## Step 1 — Rough-size (picks the question tier)

Fast read: how many distinct feature areas does the request imply? Use the
request text + a quick repo glance. If genuinely unclear, ask ONE sizing
question ("roughly how big — a small change, a feature, or multiple features?").
This is a rough size for tier selection only; the REAL effort estimate happens
in Phase 2 with the intent-spec in hand.

## Step 2 — Tiered questions (ask in ONE batched round)

**Always (even small tasks):**
1. In one or two sentences, what should exist when this is done that doesn't now?
2. What's explicitly *out* of scope?

**Add for medium+:**
3. How will we know it's done — what should work/pass?
   (→ becomes Phase 6 verify's acceptance criteria)
4. Anything the code must respect or avoid — patterns to follow, libraries not
   to add, files not to touch? (→ hard rules in every worker slice)

**Add for high / multi-feature:**
5. What existing parts of the system does this touch that it must not break?
   (→ feeds the conflict graph / integration surface)
6. Anything you're unsure about or expect to change mid-build?
   (→ pre-empts mid-run escalations)

Infer stack, test framework, file layout, existing patterns from the repo.
Only intent, scope, and priorities are askable.

## Step 3 — Draft the intent-spec

Write `run/{run-slug}/intent-spec.md` per `schemas/intent-spec.md`. Restate the
user's intent in YOUR words — restating is what surfaces misreadings.

## Step 3.5 — Repo cross-check of the draft (evidence-or-mark, proportional)

Before showing the spec, cross-check its claims against the repo — the direct
path (no analyst) is the only lane where a spec can reach planning ungrounded.
Same vocabulary as the analyst: confirm or tag `UNVERIFIED`, never silently
assume.

- **What to check:** every file, module, command, or existing behavior the
  draft NAMES — in Definition of done, Constraints, and Integration surface.
  A quick Glob/Grep per item; you are confirming the noun exists as described,
  not analyzing it.
- **Proportional to the tier:** 2-question tier → check named files/modules
  only. 4/6-question tiers → full pass over the three sections above.
- **Anything unconfirmable gets an `UNVERIFIED` tag in the spec** and the tags
  become ONE batched question in the sign-off round ("These I could not confirm
  in the repo: … — confirm, correct, or drop?"). Never more than one round.
- **Escalation valve:** more than 3 tags means the request is under-grounded
  for a direct intake — RECOMMEND routing through `orc-analyze` (requirement
  mode) instead of stretching intake into a second analyst. The user chooses.

## Step 4 — Sign-off

Ask: hard gate (nothing proceeds until explicit approval) or soft (proceed
unless objection)? **Default when unspecified: GATE.**
Show the spec. Gate mode: wait for approval or edits. Soft: proceed after
showing unless the user objects.

## Fresh-session reconfirm

When resuming a run in a fresh session, show a ONE-LINE reconfirm of the
intent-spec's scope ("Resuming: <one-line scope>. Still correct?") before
continuing. Catches requirements that changed between sessions, costs one line.
