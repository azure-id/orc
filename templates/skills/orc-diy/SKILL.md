---
name: orc-diy
description: >
  User-composable ORC lane. Use for "/orc-diy" or "run my custom orc flow".
  The pipeline shape (analyze/review/verify/security/testgen on-off, scoring
  or a fixed executor, autonomy, ship mode, session tier) is configured
  ENTIRELY through the `orc diy` CLI and compiled into a flow file —
  never configured in-session. HARD-GATED: no config or a stale compile →
  this skill never runs the custom flow; it explains the CLI steps and offers
  plain /orc instead. "/orc-diy compile" re-runs the deterministic CLI
  compiler. See references/flow-schema.md and references/compile.md.
---

# ORC-DIY (stub — gate + dispatcher)

You are the entry gate for the user's compiled custom flow. You NEVER invent,
modify, or interpret flow configuration in-session — the `orc diy` CLI is the
only writer, the compiler is the only builder, and this stub only gates and
dispatches. All state lives in the project's `.claude/` (project-scoped; no
global variant).

## Step 0 — route `compile`

If the invocation argument is `compile` (from `/orc-diy compile`): run
`orc diy compile` via Bash and relay its output. If the `orc` CLI is not on
PATH, tell the user to run `orc diy compile` in their own terminal — do NOT
reimplement the compiler in-session. Then end the turn. (`status` routes the
same way to `orc diy status`.)

## Step 1 — the hard gate (every other invocation)

Run `orc diy status` via Bash and branch on the reported state. If the CLI is
unavailable, apply the same checks manually from
`.claude/orc-diy.config.yaml` + `.claude/orc/diy/flow.lock.json` per
`references/flow-schema.md` — and treat ANYTHING you cannot verify as STALE
(fail closed).

- **UNCONFIGURED** — no config exists. Tell the user, in this order: what
  orc-diy is (one sentence), the exact bootstrap
  (`orc diy init` → optionally `orc diy set <key> <value>` →
  `orc diy compile` — see the skill's README for the full guide), then ask
  ONE question: *"Run this request through the regular full `/orc` lane
  instead?"* Yes → invoke the `orc` skill with the user's original request
  carried over verbatim. No → end the turn. Never proceed on an
  unconfigured flow, and never write the config yourself.
- **STALE** — configured but not runnable. Report the specific reason the
  status gave (config changed since compile / orc was updated / compiled
  flow modified or missing) and the fix (`orc diy compile`), then the same
  single `/orc` fallback question as above. Never run a stale flow.
- **READY** — proceed to Step 2.

## Step 2 — dispatch the compiled flow

Read `.claude/orc/diy/FLOW-COMPILED.md` and follow it as your orchestrator
spine for this run — it is self-contained: tier self-check, locked rules,
phase sequence, and the references it cherry-picks from the installed orc
skill. Honor its generated header: if its own self-gate fails, stop exactly
as it says. Do not consult this stub again for the rest of the run, and do
not load orc's SKILL.md as a spine (the compiled flow already references the
exact orc subskills and schemas it needs).

## Where the compiled flow comes from

You never read these; `orc diy compile` does, once, and stitches the result
into `FLOW-COMPILED.md`. The table is here so a maintainer can see the
provenance of a compiled phase without reading the compiler — `orc lane phases
orc-diy --json` is the authoritative version and marks every row below
`when: compile-time`.

Eleven phases come from the shared library, as that file's `composed` LAYER —
NOT its `full` layer, which is `/orc`'s procedure for the same phase:
`../_shared/phases/trace.md` · `../_shared/phases/planning.md` ·
`../_shared/phases/scoring.md` · `../_shared/phases/execution.md` ·
`../_shared/phases/review.md` · `../_shared/phases/security.md` ·
`../_shared/phases/verify.md` · `../_shared/phases/testgen.md` ·
`../_shared/phases/mock-example.md` · `../_shared/phases/ship.md` ·
`../_shared/phases/summary.md`.

Five have no counterpart anywhere else in the payload and stay this lane's own:
`references/blocks/header.md` (the tier self-gate), `wiki.md`, `analyze.md`,
`pattern.md` and `extra.md`. They are composition prose about a decision only a
composed flow makes, so there is nothing to share them WITH.

Four more are pointed at from inside those stitched layers rather than stitched
themselves: `../_shared/phases/intake.md`,
`../_shared/phases/wave-grouping.md`,
`../_shared/phases/security-checklist.md` and
`../_shared/phases/stop-resume.md`.

The stitch ORDER is the compiler's `order` array and is documented in
`references/compile.md`; a golden test holds the three lists together.


## Config

**ONE resolver, and it is not you:** `orc lane config orc-diy --json`. Obey
`effective`, print every line in `announce[]` VERBATIM at preflight, and honour
`stops[]` before wave 1. Never re-derive a value, a precedence or an inertness
from `.claude/orc.config.yaml` — a key this lane does not read is not in the
answer, and a key another key shadows comes back already marked. Exit ≠ 0 → say
the CLI is unavailable and fall back to `../_shared/config-precedence.md`'s
documented defaults, out loud. Priorities and families:
`../_shared/config-precedence.md`.

The flow SHAPE is not in that answer: it is compile-owned and lives in
`flow.lock.json`. The resolver answers for everything else this lane still
reads, and `extra` is the same split — the flow decides WHETHER, the resolver
still decides WHERE.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls orc-diy --json` names every
CLI call this lane makes, each with its exit-code contract, its cost, when to run
it, and what an EMPTY answer means. Never invent a spelling, never re-word an
exit code, and never re-derive a state word — the CLI's state words are the only
state words, and **an exit code is an ANSWER wherever that contract says so, not
a failure**. A call the answer does not name is a call this lane does not make.
Exit ≠ 0 from the catalogue itself → say the CLI is unavailable and name the
command you are about to run, out loud, before running it.

## Hard rules

1. The compiled flow is a build artifact — NEVER edit
   `FLOW-COMPILED.md`, `flow.lock.json`, or `orc-diy.config.yaml` yourself,
   and never "patch" the flow conversationally. Config changes go through
   `orc diy set` + `orc diy compile`, both run by the user.
2. Fail closed: any gate ambiguity = STALE, with the reason shown.
3. The fallback ask is ONE question with two outcomes (`/orc` or stop) —
   never a menu, never a silent fallback.

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **full** · safe point **compiled phase edge**. `soft` FORCES that checkpoint and does NOT stop if the write fails; `hard` skips it and can lose an in-flight return. Never begin a wait between a dispatch and its validated return, or before the smoke gate has reported.
