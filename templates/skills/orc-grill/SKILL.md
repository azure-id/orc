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
- **Not `/orc-brainstorm`.** Brainstorm GENERATES options when you have none —
  it proposes and you judge. Grill sharpens the one you have — it asks and you
  answer. Brainstorm picks which mountain; grill picks the path up it.

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

The SHAPE of these steps — the order, and the four rules that make it worth
having — is `../_shared/phases/preflight.md` (`core`). The probes
themselves are this lane's own and stay here.

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

**"I do not even know what the options are" is a different lane, not a worse
answer.** When a round comes back that way — the user cannot choose because
nobody has generated anything to choose between — OFFER `/orc-brainstorm`, which
proposes candidates on purpose and hands the chosen direction back here. Use
`../_shared/lane-suspend.md` (`RETURN-TO`) so the trip returns to this same
invocation. This does not soften the rule above: handing the user a lane whose job
is generating options is not answering their question for them. It is an offer —
"answer it roughly and I will keep going" stays on the menu.

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
3  Save the constraints to the pact → they outlive this run  (/orc-pact)
4  Write it up as a document  → /orc-doc, so other people can act on it
5  Stop, save nothing
```

**Exit 3 (v0.46.0)** is present only when at least one decision settled here was
tagged `constraint`. It writes the doc first, then hands those rows — quoted
VERBATIM, with `origin: {lane: orc-grill, run: <this run>}` — to `/orc-pact`,
which is the only thing that writes the ledger. Without it, every constraint this
lane settles evaporates when the run ends, which is exactly the failure `/orc-pact`
exists for. No constraints settled → the option is **absent with the reason
printed**, never a dead number.

**Exit 4 (v0.48.0)** writes the doc first, then enters `/orc-doc` with it as the
D1 context. The interview has already produced exactly what D1 and D4 ask for, so
those gates are **pre-answered from the artifact and the user only confirms** —
which is the whole point of not re-asking a frozen question. Settled decisions
travel with their `intent`/`constraint` tags, and any `spec_invariants[]` lands
in `context.md`'s decision table. Exits 2 and 4 are different questions: 2 asks
*is this buildable*, 4 asks *can somebody who was not here act on it*.

**When is it sharp enough?** Exit 2 exists to clear the analyst's own entry
floor, so use that floor as the bar:
**analyzable ⇔ the input names (a) a subject the repo could plausibly contain —
a feature, a flow, a file, or a document — AND (b) at least one thing that should
be true when the work is done.** Below it, exit 2 just bounces straight back.

**One extra exit, present ONLY when this run was entered with a `RETURN-TO`
marker** (`../_shared/lane-suspend.md`): `Return to /<sender-lane> — carry these
decisions back`, and it is the recommended option in that state. It is added to
the menu, never a replacement: a user who picks "stop, save nothing" simply does
not return, and the sender's snapshot is still on disk. Decisions travel back with
their `intent`/`constraint` tags intact plus `source: /orc-grill`, and the
**Facts looked up** rows go with them.

- **1 — save.** Write the doc (below) and end the run.
- **2 — hand off.** Write the doc first, then enter `/orc-analyze` with that file
  as the input. The analyst receives an already-scoped requirement and spends its
  tokens **grounding it in code** instead of re-asking scope. From there it is an
  ordinary analyze run — same phases, same gates, same `requirement-spec.md`.
  When this lane was entered FROM `/orc-analyze` (its reverse trigger), exit 2
  returns to that same invocation and the user retypes nothing.
- **5 — drop it.** Write nothing. Still close the trace properly.

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

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases` names
the file and the layers). Lane token `grill`, tier **Single-dispatch** —
exactly ONE end-of-run packet, dispatched solo before `.current` is deleted.
Nothing else about the protocol is restated here; a phase that ends with
`zero new trace lines is a protocol violation`.

Read-only recon is an **ad-hoc dispatch by model + effort**, never a pinned
agent — so the hook writes no `SPAWN`/`RETURN` for it. Emit `DISPATCH …
adhoc=true` and `VERIFY` yourself.

## Rules this lane always keeps

Never answer your own question · never write code or edit a project file · never
scan the repo · never force a lane on the user (exit 2 is an offer) · look facts
up before asking for them · announce every dispatch · tag every decision `intent`
or `constraint` · never stage `orc-grill/**` · tell the user to run `/usage`
(never run it yourself).

## Config

Resolve with `orc lane config orc-grill --json` and obey `effective`. Never merge
`.claude/orc.config.yaml` yourself, and never re-derive a precedence. Exit ≠ 0 →
say so and use `../_shared/config-precedence.md`'s documented defaults, out
loud. Nothing this lane reads is contested, gated or a stop, so it owes no
preflight line and has no gate to honour.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls orc-grill --json` names every
CLI call this lane makes, each with its exit-code contract, its cost, when to run
it, and what an EMPTY answer means. Never invent a spelling, never re-word an
exit code, and never re-derive a state word — the CLI's state words are the only
state words, and **an exit code is an ANSWER wherever that contract says so, not
a failure**. A call the answer does not name is a call this lane does not make.
Exit ≠ 0 from the catalogue itself → say the CLI is unavailable and name the
command you are about to run, out loud, before running it.

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **snapshot** · safe point **round edge**. `soft` FORCES that checkpoint and does NOT stop if the write fails; `hard` skips it and can lose an in-flight return. Never begin a wait between a dispatch and its validated return, or before the smoke gate has reported.
