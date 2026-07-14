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

## Hard rules

1. The compiled flow is a build artifact — NEVER edit
   `FLOW-COMPILED.md`, `flow.lock.json`, or `orc-diy.config.yaml` yourself,
   and never "patch" the flow conversationally. Config changes go through
   `orc diy set` + `orc diy compile`, both run by the user.
2. Fail closed: any gate ambiguity = STALE, with the reason shown.
3. The fallback ask is ONE question with two outcomes (`/orc` or stop) —
   never a menu, never a silent fallback.
