---
name: orc-grill
description: >
  Standalone idea-sharpening lane — start from one vague sentence and leave with
  a settled idea written down. Use for "/orc-grill", "help me think this
  through", "I want X but I do not know what I want yet", "something is wrong
  with Y". It asks you rounds of questions (every question that is ready, in the
  same round), looks facts up itself instead of making you recite your own
  codebase, and stops only when YOU say the idea matches what you meant. Three
  exits: save it, carry it straight into /orc-analyze, or drop it. No scan, no
  plan, no build, no run folder, no code written. The orchestrator never answers
  its own questions.
---

# ORC-GRILL

The lane you use **before** you know what you want. One short sentence is a
complete input:

> "I want notifications for merchants."
> "Something is wrong with our refunds."

**Vagueness is the input here, not a reason to refuse.** Every other lane
punishes a thin request — the planner refuses it, the analyst absorbs it into
`ASSUMPTION` tags and then asks you the questions anyway, at scan prices. This
lane asks them at conversation prices, and hands the result to those lanes
already sharp.

## What this lane is NOT

- **Not `/orc-analyze`.** Analyze checks a requirement **against the code**. It
  answers "does the repo really do that?". Grill answers "what do I actually
  want?". Grill first, analyze second — that order is the whole point.
- **Not `/orc-plan` or `/orc`.** No tasks, no waves, no scoring, no build. It
  never writes code and never touches a file outside its own context doc.
- **Not `/orc-learn`.** Learn teaches you an existing feature. Grill shapes one
  that does not exist yet.
- **Not `/orc-quick`.** Quick DOES something now. Grill decides what should be
  done at all.

## Nothing to configure

Standalone and command-entry only. It reads `log_dir` and nothing else. No
dispatch-forcing key applies, because it has no scored dispatch to force.

---

## G0 — Preflight (ONE time, silent, nothing here can stop the run)

1. **Config.** Read `log_dir`. Read no other key.
2. **Trace.** Write `log_dir/.current` = `run-grill-<slug>-<DDMMYY>-<HHMMSS>.txt`
   AND `touch the trace file` of that name in the SAME step. Both, or neither.
   The slug comes from the user's opening sentence; if it is too vague to slug,
   use `idea` plus the next free number.
3. **Knowledge probes.** Follow `../_shared/detecting-artifacts.md` — never a raw
   `find`, because `.claude` is hidden. `orc wiki status` · `orc pattern status
   <lang>` · `orc gotcha status`. **All three are helpful extras.** Missing
   knowledge never gates this lane, never triggers a scan, and never causes a
   fallback — it only means more of the frontier is a question instead of a
   lookup. Print ONE line each, then move on.

---

## G1 — The interview (the whole lane)

**Follow `../_shared/interview.md` exactly.** It is the canonical mechanic and
this lane does not get a private version of it. In short, and in that file's
words:

- Build a **design tree** of open questions from the opening sentence. Draw the
  dependencies — "which queue?" sits under "is this async at all?".
- Ask the **whole frontier** each round: every open question whose prerequisites
  are settled, and nothing that depends on an answer you do not have yet.
- Use the fixed shape, so a round can be answered by number:
  `❓ **Q1** — **<title>**: <body>`, then the recommendation alone on a `➡️` line.
- **Facts are yours to find; decisions are the user's to make.** Resolve facts up
  the ladder — wiki status, wiki pages, cached pattern, `orc gotcha list`, and a
  read-only ad-hoc dispatch **last**. Never block a round on a running fact-find;
  only the questions genuinely downstream of it wait. And never soften the other
  half: **a lane that answers its own interview question has broken this
  contract.**
- Tag every settled decision `intent` or `constraint` as it settles. The
  constraints are what later become `spec_invariants[]` — this is the step that
  makes the conversation load-bearing instead of merely pleasant.

**Fact-finding dispatches.** Read-only recon is an **ad-hoc dispatch by model +
effort** (the `/orc-quick` recon precedent), never a pinned agent — so no agent
file ships for this lane and the hook writes no `SPAWN`/`RETURN` for it. Announce
it on one line before it goes out (`recon: claude-sonnet-4-6 / medium — where
refunds are written`) so the spend is never silent, but do NOT stop the round
waiting for permission. Emit `DISPATCH … adhoc=true` and `VERIFY` yourself; the
agent reports its own `actual_model` / `actual_effort`.

**No question cap.** Some ideas settle in three questions and some need fifty. A
cap would truncate exactly the case this lane exists for. The controls are the
user's own words ("stop asking, just save it") and `/orc-explain` when a round
gets dense.

**Ungrillable questions get named, not talked around.** "How should this feel?"
cannot be settled by talking — say so and point at ORC's `mock_example` phase
(`mock-examples/<slug>/`). "Does the code really do that?" is `/orc-analyze`.
Carrying an open question with the right instrument named is a finished answer.

**The confirmation gate ends the lane, not an empty frontier.** Play the idea
back in plain words and ask whether it matches what they meant. Only a yes ends
it.

---

## G2 — Exit (ONE question, three answers)

Ask once, after the confirmation gate:

```
The idea is sharp now. What next?

1  Stop here — save it        → writes orc-grill/<slug>/grill-context.md
2  Continue into /orc-analyze → checks it against the real code
3  Stop, save nothing
```

**When is it sharp enough?** Exit 2 exists to clear the analyst's own entry
floor, so use that floor as the bar:
**analyzable ⇔ the input names (a) a subject the repo could plausibly contain —
a feature, a flow, a file, or a document — AND (b) at least one thing that should
be true when the work is done.** Below it, exit 2 just bounces straight back.

- **1 — save.** Write the doc (below) and end the run.
- **2 — hand off.** Write the doc first, then enter `/orc-analyze` with that file
  as the input. The analyst receives an already-scoped requirement and spends its
  tokens **grounding it in code** instead of re-asking scope. From there it is an
  ordinary analyze run — same phases, same gates, same `requirement-spec.md`.
  When this lane was entered FROM `/orc-analyze` (its reverse trigger), exit 2
  returns to that same invocation and the user retypes nothing.
- **3 — drop it.** Write nothing. Still close the trace properly.

---

## The doc it writes

```
<projectRoot>/orc-grill/<slug>/grill-context.md
```

Project root, visible — **never inside `.claude/`**, never inside a run folder,
for the same reason `/orc-quick` puts its doc there: a document a human reads and
reuses belongs where the human can find it. One `.md` per slug, ever; the same
slug re-opens and extends the same file. **Never staged for commit by ORC.**

Shape, and what each part is for: `references/grill-doc.md`. The top carries a
delimited `<!-- orc-grill:context -->` block so a later session reads the summary
without reading the whole file.

## Behavior trace (always on — same as every lane)

Follow `../orc/references/trace-protocol.md`. Lane name `grill`. This is a
**single-dispatch** lane: **exactly ONE end-of-run packet**, dispatched solo to
`orc-trace-writer-haiku-4-5` after the exit choice and BEFORE you delete
`log_dir/.current`. It carries `run_meta`, the round-by-round event list, the
settled decisions as `decisions` (the WHY layer), the exit taken, and `FINISH`. A
run that ends with `zero new trace lines is a protocol violation`.

## Rules this lane always keeps

Never answer your own question · never write code or edit a project file · never
scan the repo · never force a lane on the user (exit 2 is an offer) · look facts
up before asking for them · announce every dispatch · tag every decision `intent`
or `constraint` · never stage `orc-grill/**` · tell the user to run `/usage`
(never run it yourself).
