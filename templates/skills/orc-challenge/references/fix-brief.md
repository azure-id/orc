# The stop, and `fix-brief-NN.md`

## The stop sequence (C8)

**Written by ORC itself, never by a dispatched agent** — the v0.42.0 rule: a
dispatch inside the stop sequence lets a stop fail because a subagent did.

1. `orc challenge record` — append the iteration, compute the verdict.
2. Write `fix-brief-NN.md`.
3. Write `{run_dir}/{slug}/RESUME.md` with the one parseable line:
   ```
   Where it stands:  /orc-challenge · iteration 2 · awaiting fix · 4 blocking findings
   ```
   Keep that shape — it is the line `orc resume` and `orc run list` parse, which
   is how a listing never has to open the ledger. **`RESUME.md` existing IS the
   "run unfinished" flag**, so this is free integration.
4. `orc challenge report <slug>` — re-derive `CHALLENGE.md`.
5. Dispatch the trace packet for the iteration.
6. Print the stop block and **END THE TURN.** No follow-up question, no "want me
   to fix it?" — offering would be hard rule 1 with better manners.

On PASS instead: no advisor, `orc challenge report` writes the final report,
DELETE `RESUME.md`, dispatch the `FINISH` packet, delete `.current`.

## The file

`orc/orc-challenge/<slug>/fix-brief-NN.md` — named for the iteration it CLOSES.
(`iteration-1-continue-to-2` reads as a file about a transition; this is a file
about work to do.)

It opens with a fenced block that is literally the prompt to paste:

````markdown
# Fix brief — iteration 1 · tsd-payments

**Goal (frozen v1):** a backend team implements this without asking me anything
**Audience:** backend engineers, 2 of 5 non-native English readers
**Done means:** no open interface question and no TBD in §3–§7

## Paste this into a NEW Claude Code session

```
Fix the findings in orc/orc-challenge/tsd-payments/fix-brief-01.md.

Artifact:  docs/tsd-payments.md
Goal:      orc/orc-challenge/tsd-payments/goals.md  (read this first)

Write the revised version to:  docs/tsd-payments-v2.md
(see "Where to put the revised version" in the brief)

Rules:
- Change the artifact only. Do not edit anything under orc/orc-challenge/.
- Do not mark findings resolved. The next judgement decides that.
- If you think a finding is wrong, do not argue with it here —
  run: orc challenge rebut tsd-payments F-007 "why"

When you are done, start ANOTHER new session and run:
  /orc-challenge tsd-payments
```

## Where to put the revised version

  Write to:      docs/tsd-payments-v2.md        ← this exact path
  Copied from:   docs/tsd-payments.md           (iteration 1's version)
  Do NOT write:  anything under orc/orc-challenge/tsd-payments/

  When you are done, this is what the next session will look for.
  If you must use a different path, run:
    orc challenge expect tsd-payments --set <path>

## 4 blocking · 6 advisory · grouped by root cause
…
````

**A plan the user cannot deviate from is a plan they will deviate from
silently.** The escape is a recorded command, not a guess — and that is why
`orc challenge diff` resolves the expectation FIRST, so the resumed session opens
knowing whether the work exists.

When it does not, the state is `MISSING-REVISION` and the CLI **lists candidates
without adopting one** (`cycle-state.md`). Open the resumed session with that
list and let the user say which file is theirs — a judge pointed at the wrong
file writes a page of confident, useless findings.

## Below the paste block

Per the advisor's grouping, in the advisor's suggested order:

- the **group**, its **root cause** in one sentence, and the dependency reason
  the order rests on (*"fix the glossary first — six D5 findings dissolve"*)
- per finding: `id`, the anchor, the quote, what is wrong, the **consequence**,
  and the **acceptance line** — *"fixed when §4.2 names the retry budget and the
  dead-letter destination"*
- the **decisions that are not defects**, routed: a P0/P1 that is really an
  unmade decision ("the doc never says whether refunds are idempotent") belongs
  in `/orc-pact` as a constraint, or in `/orc-grill` as a question — not in a
  fifth iteration of a document review
- **accepted exceptions**, if any, so the fixer does not fix something the user
  already signed off

## What the brief must NEVER contain

- rewritten prose, a suggested paragraph, or a diff. That is the fixer's job, and
  handing over wording is fixing by another name.
- a claim that a finding is easy, or an estimate in hours. Effort is in the
  artifact's own units — sections, endpoints, rows.
- a promise about what the next judgement will say.

## The council changes the ORDER of the brief (v0.49.1)

Three blocks, in this order, and the order is the argument:

1. **Open premise challenges — FIRST.** A premise disputes the frozen goal, and
   the goal is the yardstick every finding below it was measured against. If the
   user adopts one, some of the findings underneath stop mattering. Print each
   with its `reframe` and its `cheapest_test`, and the two commands that resolve
   it — `orc challenge goals <slug> --set <path> --reason "…"` (adopt) or
   `orc challenge premise <slug> <id> --dismiss --reason "…"`. **Neither is
   automatic, and ORC never picks.**
2. **The findings**, grouped by the advisor's root causes, exactly as before.
   A council-origin finding shows its raiser (`raised by the contrarian · adopted
   by the judge`) — an id is permanent, and so is its credit.
3. **Opportunities — LAST, and clearly marked NOT WORK.** They never block and
   nothing here is required. Each carries its `first_step` and its route, and the
   route is where it belongs *next*: `/orc-brainstorm`, `/orc-pact`,
   `/orc-grill`, or nowhere yet. **This lane never builds one.**

And rule 15: **a selected lens that did not run is named here too, with its
reason.** A brief that silently omits a role the user paid to select is the same
defect as a silently skipped dimension.
