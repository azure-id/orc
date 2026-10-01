---
name: orc-diy
description: >
  User-composable ORC lane. Use for "/orc-diy" or "run my custom orc flow". The
  pipeline shape is configured ENTIRELY through the `orc diy` CLI and compiled
  into a flow file — never configured in-session. HARD-GATED: no config or a
  stale compile → this skill never runs the custom flow; it explains the CLI
  steps and offers plain /orc instead. "/orc-diy compile" re-runs the
  deterministic CLI compiler.
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

First `orc lane config orc-diy --json`. **`habits{}` in it → print `habits.line`,
read `../_shared/habits.md` NOW**; none → ignore every `(H …)`. Then:
Read `.claude/orc/diy/FLOW-COMPILED.md` and follow it as your orchestrator
spine for this run — it is self-contained: tier self-check, locked rules,
phase sequence, and the references it cherry-picks from the installed orc
skill. Honor its generated header: if its own self-gate fails, stop exactly
as it says. Never consult this stub again this run, and never load orc's
SKILL.md as a spine — the flow names every subskill and schema it needs.

## Lane contract (`../_shared/lane-contract.md` — read it ONLY when a call exits ≠ 0)

- **Calls:** `orc lane calls orc-diy --json` names every call and its exit codes.
  **An exit code is an ANSWER where it says so, not a failure.** Make no other call.
- **Config:** `orc lane config orc-diy --json`. Obey `effective`, print every line
  in `announce[]` VERBATIM at preflight, and honour `stops[]` before wave 1.
  Never merge `.claude/orc.config.yaml` yourself (`../_shared/config-precedence.md`).
- **Habits:** Step 2, first.
- **Rules:** `orc rules slice --lane orc-diy --json` is the ONLY assembler
  (`../_shared/phases/rules.md`). Its `line` prints VERBATIM at preflight.

The flow SHAPE is not in that answer: it is compile-owned and lives in
`flow.lock.json`. The resolver answers for everything else this lane still
reads, and `extra` is the same split — the flow decides WHETHER, the resolver
still decides WHERE.

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
Checkpoint **full** · safe point **compiled phase edge**.
