---
name: orc-pr-setup
description: >
  Stacked-PR PLANNER. Use for "/orc-pr-setup", "plan the stacked PRs", "split
  this change into stacked pull requests", "where do the PR cut lines go".
  Decides the LAYERING of a big change — ordered layers, each with a purpose, a
  value class, an explicit file list, a measured LoC/file budget and a
  dependency reason — and writes stacked-pr/<slug>/stack-plan.md. Runs
  INDEPENDENTLY (no orchestrator needed) and is also the lane ORC's ship phase
  hands off to when a change is too big for one PR. It NEVER touches git
  history: no branches, no commits, no pushes — that is orc-pr-driver's job.
  P0 HARD GATE: when a boundary is uncertain it STOPS and asks, one decision at
  a time, and records the answer.
---

# ORC-PR-SETUP (stacked-PR planner)

Big PRs are not reviewed, they are rubber-stamped. A 3k-LoC / 40-file diff is
unreviewable, so review is weak, merges are big-bang, and reverts are painful.
GitHub's **stacked pull requests** fix the mechanics — an ordered chain of PRs in
one repo, each targeting the branch below it, each reviewable on its own.

The mechanics are the easy half. **The hard part is deciding where the cut lines
go**, and that is this skill's entire job: decide the layering correctly, prove
each layer stands alone, and **refuse to guess**.

This lane **plans only**. It writes one markdown file and stops. Every branch,
commit, push and merge belongs to `/orc-pr-driver`.

**Tier.** Not effort-gated (the effort guard matches the exact skill name `orc`),
so it runs at whatever tier the chat is on. Layering judgment is better at Opus
high; it is correct at any tier.

**Human guide:** this skill's own `README.md` (what a stack is, the whole
workflow, the plan file field by field, FAQ) — point the USER there when they ask
how any of this works; never load it to drive the run.

**Load at their phase, never preloaded:**
`../_shared/gh-stack-commands.md` (preflight + command surface) ·
`../_shared/stack-plan.md` (plan location, schema, budget math, `STACK-FROM`) ·
`../_shared/pr-templates.md` (template resolution) ·
`references/layer-taxonomy.md` (where the cut lines go) ·
`references/certainty-gate.md` (the P0 gate + red flags).

## Hard rules

1. **Never touches git history.** No branch, no commit, no push, no PR. Reads
   git (`diff --numstat`, `status`, `log`) only.
2. **P0 HARD GATE — uncertainty ASKS.** Every candidate boundary is classified
   CERTAIN or UNCERTAIN (`references/certainty-gate.md`). Every UNCERTAIN stops
   the lane and asks the user, **one decision at a time**, with the cost of each
   option and a recommendation. Never a silent default, never "I assumed and
   noted it".
3. **Every layer needs a purpose and a value class.** No purpose → it is not a
   layer, it is part of another one.
4. **Budgets are measured, not estimated** (`../_shared/stack-plan.md`): real
   `git diff --numstat` numbers, exclusions applied, ceilings from config.
5. **Every answer is recorded** under `## Decisions` in the plan — that is the
   audit trail and what makes the plan re-runnable after compaction.
6. **A ticket is required.** Branch names and layer titles derive from it. No
   ticket after asking once → stop and recommend one regular PR.

## Phases

`orc lane phases orc-pr-setup --json` is this lane's pipeline: the ordered list, where
each phase lives, and how much of it to read. **The CLI owns the order** — never
derive it from the headings below, and never renumber or rename one without the
manifest, because a `read: section` pointer names a HEADING and a renamed heading
is a pointer into nothing.

## Phase S0 — Preflight (probe, never assume)

Per `../_shared/gh-stack-commands.md`: `gh` present and ≥ 2.0 · authed ·
`github/gh-stack` installed (offer the install if not) · **same repo, not a
fork** (a fork is a hard STOP — cross-fork stacks are unsupported) · trunk name ·
branch protections / required checks (this is where "N layers = N CI runs"
becomes a real number) · merge queue present? Report the block in a few lines.

Any hard fail → say which check failed and recommend ONE regular PR. Do not
plan a stack that cannot be submitted.

The SHAPE of these steps — the order, and the four rules that make it worth
having — is `../_shared/phases/preflight.md` (`core`). The probes
themselves are this lane's own and stay here.

## Phase S1 — Intake (ticket, entry mode, template)

1. **Ticket** — ask for it if it was not given. Required (hard rule 6).
2. **Entry mode** (`../_shared/stack-plan.md`) — exactly two:
   - **`greenfield`** — nothing written yet; the input is a spec / TSD / ticket.
   - **`orc-run`** — the change already exists in the worktree (ORC built it, or
     the user did). The split is **file-granular only**; hunk surgery is
     forbidden.
   Detect it: a dirty worktree with real changes → `orc-run`; a clean tree →
   `greenfield`. Say which mode you picked. An already-open fat PR is out of
   scope — say so and recommend one regular PR.
3. **`STACK-FROM` handoff?** If the invocation points at a
   `stacked-pr/<slug>/STACK-FROM.md`, read it and skip everything it carries
   (ticket, slug, entry mode, template, surface, run dir). `BUILD-GREEN: false`
   is a **hard stop** — never plan a stack over a red build.
4. **PR template** — resolve per `../_shared/pr-templates.md` (ORC template →
   project → CLAUDE.md → recommend three options). The user declining every
   option means the **stack is skipped** — say so and stop; the change ships as
   one regular PR.
5. Derive `<slug>` (kebab-case, from the ticket or the change).

## Phase S2 — Inventory (the real numbers)

- `orc-run`: `git diff --numstat` (staged + unstaged) → every changed file with
  its additions/deletions. Apply the exclusion list from
  `../_shared/stack-plan.md`, keeping excluded files in a separate LISTED bucket.
- `greenfield`: enumerate the files the change WILL touch from the spec, and
  estimate each one's size — marked as estimates, refined by the driver.
- Build the **dependency graph** between those files (imports/callers, schema →
  reader, type → consumer). A `RUN-DIR` from a `STACK-FROM` handoff gives you
  ORC's per-task `declared_files` and `depends_on` — use it; it is better
  evidence than a fresh guess.
- Report: total LoC, total files, excluded count, and how many layers the
  ceilings imply.

## Phase S3 — Tier-assign

Map every file to a taxonomy tier per `references/layer-taxonomy.md` (framework
tiers first — data/schema → store → domain → adapter → wiring → transport →
async → tests-at-scale → docs/flag; generic fallback for unlisted stacks). A
file that fits no tier is an UNCERTAIN, not a guess.

## Phase S4 — Cut (the P0 gate lives here)

Group tiers into layers under the config ceilings (`stacked_pr_loc`,
`stacked_pr_files`, `stacked_pr_max_layers`). **Ordering principle: dependency
direction = stack direction.** Layer N may depend only on layers < N; the bottom
is the widest blast radius and the least reversible (schema), the top is the
thinnest (docs, flag flip).

At **every seam**, run the certainty classifier (`references/certainty-gate.md`).
CERTAIN → proceed silently. UNCERTAIN → **STOP and ask**, one decision at a
time, showing both candidate boundaries, the LoC/file/CI cost of each, the
review-experience consequence, and a recommended option. Record the answer.

Component and handler are **different layers by default** — even when both are
small and were written in the same sitting. Same for handler vs async consumer,
and migration vs the code that reads the new column.

## Phase S5 — Validate the plan (all seven, explicitly)

| # | Check | Fail → |
|---|-------|--------|
| 1 | every layer ≤ `stacked_pr_loc` | split, or log an accepted exception |
| 2 | every layer ≤ `stacked_pr_files` (soft target = half) | same |
| 3 | every layer has a purpose + value class (FOUNDATION names its consumer) | merge it into its consumer |
| 4 | component/handler and migration/reader are separated | re-cut |
| 5 | dependency order is acyclic and bottom-up | ask which seam breaks the cycle |
| 6 | every layer can plausibly **build + test on its own base** | re-cut, or ask |
| 7 | layer count ≤ `stacked_pr_max_layers` (+2 with an override, beyond → STOP) | multiple stacks or a phased release |

Check 6 is REASONED here and **verified for real by the driver** — say so, never
claim it as proven.

## Phase S6 — Emit the plan, then stop

Write `stacked-pr/<slug>/stack-plan.md` exactly per the schema in
`../_shared/stack-plan.md`, including per-layer draft PR titles/bodies built from
the resolved template, `## Decisions` (every P0 answer) and `## Accepted
exceptions`. Then:

1. Show the layer table in chat (# · branch · purpose · value · files · LoC).
2. State plainly that **nothing has been created yet** — no branches, no PRs.
3. Offer the handoff: write `stacked-pr/<slug>/STACK-FROM.md`
   (`STACK-FROM: orc-pr-setup`, per `../_shared/stack-plan.md`) and tell the user
   to run **`/orc-pr-driver`** — human approval sits exactly here, before any git
   surgery.

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases` names
the file and the layers). Lane token `prsetup`, tier **Single-dispatch** —
exactly ONE end-of-run packet, dispatched solo before `.current` is deleted.
At run start write `log_dir/.current` = `run-prsetup-<slug>-<DDMMYY>-<HHMMSS>.txt` AND
`touch the trace file` of that name in the SAME step.
Nothing else about the protocol is restated here; a phase that ends with
`zero new trace lines is a protocol violation`.

## Boundaries

- **Plans only.** Never a branch, commit, push, PR, or `gh stack` write command.
- **Never guesses a seam.** Uncertainty is a question, not an assumption.
- **Never fake-splits** an unsplittable atom, and never games the budget.
- Out of scope: splitting an already-open PR (`gh stack link` retrofit), and
  cross-repo stacks (unsupported by GitHub — use `/orc-poly` for cross-repo
  planning).
- Reminder: to see usage limits, tell the user to run `/usage` (never invoke it
  programmatically).

## Config

Resolve with `orc lane config orc-pr-setup --json` and obey `effective`. Never merge
`.claude/orc.config.yaml` yourself, and never re-derive a precedence. Exit ≠ 0 →
say so and use `../_shared/config-precedence.md`'s documented defaults, out
loud. Nothing this lane reads is contested, gated or a stop, so it owes no
preflight line and has no gate to honour.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls orc-pr-setup --json` names every
CLI call this lane makes, each with its exit-code contract, its cost, when to run
it, and what an EMPTY answer means. Never invent a spelling, never re-word an
exit code, and never re-derive a state word — the CLI's state words are the only
state words, and **an exit code is an ANSWER wherever that contract says so, not
a failure**. A call the answer does not name is a call this lane does not make.
Exit ≠ 0 from the catalogue itself → say the CLI is unavailable and name the
command you are about to run, out loud, before running it.
