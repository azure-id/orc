---
name: orc-route
description: >
  Plan-only lane router — you have a plan, this tells you which lane should build
  it. Use for "/orc-route", "which lane for this plan?", "is this worth the full
  orc run?". It reads the plan's own numbers (tasks, waves, files, top score,
  risk) plus ORC's deterministic knowledge probes, then names ONE recommended
  lane, the runners-up with the reason each lost, and any lane that is not
  possible with the blocking condition named. It routes a PLAN and nothing else —
  given a request in words it refuses and says why, because routing from a
  sentence is guessing. Zero agents, user-invoked only, nothing is built.
---

# ORC-ROUTE

**This is not a general "which command should I use" helper.** It only works on a
plan, on purpose.

A plan contains real numbers — tasks, the files each task touches, dependencies,
facets, scores. A sentence like *"add notifications"* contains none of them.
Routing from a plan is arithmetic. Routing from a sentence is guessing, and a
guess that looks like a calculation is worse than no answer.

The newcomer's "which of these commands do I type?" is answered by
`orc onboarding first-run`, not here. That is the trade: a narrow tool that is
always right, instead of a broad one that is sometimes wrong.

## Input contract — reuse, never reinvent

A valid input is **exactly** what `../orc/references/plan-handoff.md` already
defines as a plan input:

- pasted planning-output (a block matching `../orc/schemas/planning-output.md` —
  a `tasks:` list with `declared_files`, `depends_on`, `grounding[]`);
- a `plan-{name}.md` path the user points at;
- an `orc/planner/{name}/` checkpoint (the planner's "Save & stop" artifact).

Load that reference and use its definition — do NOT write a second one here. A
second definition of "what counts as a plan" is drift the contract lint cannot
see, and the two would eventually disagree about the same file.

Schema-validate against `../orc/schemas/planning-output.md`. A structurally
malformed plan is not a routing question: say which field is missing and point at
`/orc-plan`.

## Refusal — anything that is not a plan

Do not guess. Do not quietly downgrade into a general suggestion box.

```
This is not a plan, so I cannot route it.

I can only route a plan — a pasted ORC plan, a plan-<name>.md file, or a saved
planner checkpoint. What you gave me is a request in words.

Make a plan first with /orc-plan, then come back here.
```

If the input is a plain request AND the user seems unsure what they even want,
you may add ONE line offering `/orc-grill` first. Offer it; never run it.

## What it reads

Only the plan, plus the deterministic probes ORC already ships — **never an
ad-hoc `find`**, per `../_shared/detecting-artifacts.md`:

| Probe | Tells you |
|---|---|
| `orc wiki status` | wiki tier — the `/orc-fast` prerequisite |
| `orc pattern status <lang>` | cached code-pattern — the other `/orc-fast` prerequisite |
| `orc gotcha status` | whether this project has repair memory for the area |
| `orc diy status` | exit 0 = a compiled custom flow exists and is READY |

Signals taken from the plan itself: task count, wave count, total distinct files
in `declared_files`, the top facet score, whether any task carries a **cited**
`risk[]`, and whether `plan_confidence` is low.

Read nothing else. This lane opens no source file.

## How it decides

Not a formula to hide behind — these are the real discriminators, in order:

1. **Hard gates first.** A lane whose prerequisites fail is `not possible`, not
   "runner-up". `/orc-fast` needs a FRESH or AGING wiki **and** a cached pattern
   **and** a single-task plan — it runs ONE task, **and (v0.46.0) a plan carrying
   any boundary REFUSE can never route there**: fast has one executor and no wave
   to lift the refused task out of, so the gate has nowhere to act. `/orc-diy`
   needs `orc diy status` to exit 0.
2. **Risk beats size.** Any task with a cited `risk[]`, or `plan_confidence:
   low`, recommends `/orc` — review and verify are what you are paying for, and
   a small risky change is exactly the case that earns them.
3. **Then size.** Roughly: 1 task with both `/orc-fast` gates green → `/orc-fast`;
   1–3 tasks, no risk, one wave → `/orc-mini`; anything multi-wave, or a top
   score in the high bands, or more than a handful of files → `/orc`.
4. **`/orc-ultra` is never a default.** Name it only when the plan itself
   justifies maximum rigor (cited risk on more than one task, or a security-
   surface plan), and say plainly that it costs the most.

State the numbers you decided from. A recommendation without its evidence cannot
be argued with, and the user is the one who knows whether the risk is real.

**Cost, when it is knowable (v0.46.0).** Run `orc budget forecast <plan> --json`
and add ONE cost column per lane, in the primary unit `budget_units` resolves to.
Routing stops being qualitative the moment "about 3x faster" becomes "1.23M vs
0.41M raw, 18% vs 6% of a 5-hour window". Two rules ride with it: a band below
`budget_min_samples` makes the number a FLOOR and the column says so, and **exit 3
(no history) means the column is simply absent** — never a guessed figure, and
never a reason to withhold the recommendation itself, which does not depend on
cost.

## Output shape

```
Plan: merchant-notifications — 7 tasks, 3 waves, 14 files touched
      top score 78, two tasks marked risky

→ /orc          the plan has risky tasks and a task above 70;
                review and verify are worth paying for here
                1.23M raw · 18% of a 5-hour window on Max 20x
   runner-up    /orc-mini — about 3x faster and 0.41M raw (6% of a window),
                but it skips full review and verification. Fine only if you
                will read the diff yourself.
   not possible /orc-fast — needs a fresh wiki (yours is STALE) and this plan
                is 7 tasks; that lane runs ONE task. It also carries 1 boundary
                REFUSE, which fast has no wave to lift out.

Start /orc now?  [yes / no]
```

Rules for that block:

- **Every runner-up names what it costs you**, not just that it is cheaper.
- **Every `not possible` names the blocking condition AND its fix** ("run
  `/orc-wiki` to refresh"). A blocked lane with no stated fix is a dead end.
- **The final offer starts the recommended lane.** `no` ends the run cleanly.

## Second entry point — one question after "Save & stop"

`../orc/subskills/orc-planner/SKILL.md` ends in a three-way branch. On **Save &
stop** ONLY, it asks:

> Want a lane recommendation for building this? [yes / no]

*Take into build* never asks — the lane is already chosen and running. *Poly
split & stop* never asks — it has its own per-repo handoff. One question, in
exactly one branch.

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases` names
the file and the layers). Lane token `route`, tier **Single-dispatch** —
exactly ONE end-of-run packet, dispatched solo before `.current` is deleted.
At run start write `log_dir/.current` = `run-route-<slug>-<DDMMYY>-<HHMMSS>.txt` AND
`touch the trace file` of that name in the SAME step.
Nothing else about the protocol is restated here; a phase that ends with
`zero new trace lines is a protocol violation`.

## Rules this lane always keeps

Routes a plan, refuses anything else · zero agents, nothing dispatched · reuses
`plan-handoff.md`'s plan definition, never a second one · deterministic probes
only, never an ad-hoc `find` · reads no source file · never starts a lane the
user did not accept · never edits config or any project file.

## Config

Resolve with `orc lane config orc-route --json` and obey `effective`. Never merge
`.claude/orc.config.yaml` yourself, and never re-derive a precedence. Exit ≠ 0 →
say so and use `../_shared/config-precedence.md`'s documented defaults, out
loud. Nothing this lane reads is contested, gated or a stop, so it owes no
preflight line and has no gate to honour.
