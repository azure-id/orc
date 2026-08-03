# Shared contract — the stack plan (`stack-plan.md`) + the `STACK-FROM` handoff

Canonical, single-copy contract for stacked pull requests. `orc-pr-setup` WRITES
the plan; `orc-pr-driver` READS it; ORC's ship-phase stack gate
(`orc/subskills/orc-pr/stack-gate.md`) hands off to one or the other. All three
read this file — the schema is never remembered.

## Location (one path, no ambiguity)

```
stacked-pr/<slug>/stack-plan.md
```

Project root, visible, **committed** — same class of deliverable as
`poly-repo-implementation/` and `test-generator/`. Never inside `.claude/`,
never inside the run folder (the installer replaces skill dirs; a plan there
would vanish on `orc update`). `<slug>` is kebab-case from the change or the
ticket (`[a-z0-9-]`, ≤32 chars). The `orc pr stack template [<slug>]` CLI writes
the same path, so a hand-filled plan and a generated one are indistinguishable
to the driver.

## Existence probe (deterministic — never an ad-hoc `find`)

`orc pr stack status [<slug>]` — exit **0** = a READY plan (exists, no unfilled
`<...>` placeholders, ≥2 layers), exit **1** = absent or unfilled. Same
exit-code convention as `orc pattern status <lang>` and `orc diy status`. Run it
FIRST; do not second-guess a positive probe.

## Budget mechanics (measured, not estimated)

Per layer: `git diff --numstat <that layer's base>..<layer head>`.

- **LoC = additions + deletions** over non-excluded files.
- **Excluded from LoC AND from the file count:** generated code (`*.pb.go`,
  `*_gen.go`, mocks, openapi/swagger output), lockfiles (`go.sum`,
  `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`,
  `poetry.lock`), `vendor/`, `node_modules/`, `testdata/` fixtures, and pure
  renames/moves with no content change. Excluded files are still **LISTED in the
  PR body** — a reviewer must know they exist.
- **Tests COUNT** toward the budget (they are reviewable code). A layer over
  budget *only* because of tests may split its tests into their own layer rather
  than splitting logic badly.
- **Ceilings** come from config (`orc/config.md`): `stacked_pr_loc` (default
  1000) is the per-layer LoC hard max; `stacked_pr_files` (default 20) is the
  hard max file count, with **half of it the soft target**. Over either → split,
  or the user explicitly overrides and the override is logged under
  `## Accepted exceptions`.
- **Sizing beats budget-gaming.** A 999-LoC / 20-file layer that mixes handler +
  migration is a FAIL even though it is under budget. The budget is a ceiling,
  not a definition of a good layer.
- **Unsplittable atom:** when the smallest coherent unit alone exceeds a ceiling,
  do NOT fake-split it — flag it, state why, and ask the user to accept the
  oversized layer (the P0 gate path).
- **Layer cap** `stacked_pr_max_layers` (default 6): ≤ cap proceed · cap+1..cap+2
  warn and require an explicit user override · beyond that **STOP** and
  recommend multiple stacks or a phased release. N layers = N full CI runs.

## Schema (the contract between the lanes)

```markdown
# Stack plan: <feature>

- ticket: <TICKET-123>            # REQUIRED — branch names and layer titles derive from it
- repo: <owner/name>              # same repo for every layer (cross-fork is unsupported)
- trunk: <main>                   # the bottom layer's base
- entry mode: greenfield | orc-run   # orc-run = ORC already built the change (file-granular split)
- pr template: <resolved source>  # orc | project:<path> | claude.md | picked:<name>
- totals: <LoC> LoC · <n> files · <n> layers

## Layers
| # | branch | purpose (1 line) | value class | files | LoC | depends on | build-alone? |
|---|--------|------------------|-------------|-------|-----|------------|--------------|

## Layer <n> — <title>
- Purpose: <one line — no purpose means it is not a layer>
- Value class: USER | OPERATOR | CONTRACT | FOUNDATION (+ consumer layer if FOUNDATION)
- Files: <explicit list — every path, no globs>
- Excluded-from-budget files: <listed, uncounted>
- Deliberately NOT here: <what a reviewer might expect> → layer <m>
- Green-gate commands: build · test scope · lint scope (`--new-from-rev <this layer's base>`)
- Gate status: GREEN | RED <step> | NOT RUN
- Risk / rollback: <one line>

## Decisions
<every P0 gate answer: boundary, the options offered, what the user chose, why>

## Accepted exceptions
<over-budget layers, oversize atoms, FOUNDATION chains, layer-cap overrides>
```

**Driver hard gate:** a plan with an unanswered UNCERTAIN, a missing ticket, a
layer with no purpose or no value class, a FOUNDATION layer naming no consumer,
or fewer than 2 layers is **not runnable**. The driver says which field is
missing and stops — it never fills a field in for the user.

## The `STACK-FROM` handoff block

Written into the stack-plan folder as `stacked-pr/<slug>/STACK-FROM.md` by
whoever hands off (ORC's ship gate, or `orc-pr-setup` → `orc-pr-driver`). Same
shape as `_shared/fallback-handoff.md`: the writer announces one line, writes the
block, then invokes the reader pointing at it.

```
STACK-FROM: orc-ship | orc-pr-setup
TICKET: <TICKET-123>
SLUG: <kebab-slug>
PLAN: stacked-pr/<slug>/stack-plan.md   # or "none — plan the layers first"
ENTRY-MODE: greenfield | orc-run
PR-TEMPLATE: orc | project:<path> | claude.md | picked:<name>
CHANGE: <one-line description of the change being stacked>
SURFACE: <n> files · <n> LoC (excluded paths already removed)
RUN-DIR: <.claude/orc/run/{run-slug}/ if an ORC run produced the change, else "none">
BUILD-GREEN: true | false          # false is a hard stop — never stack a red build
```

**Reader side.** Acknowledge the source + ticket in one line, run the existence
probe, and skip anything already carried: an attached PLAN replaces the planner
lane entirely; `ENTRY-MODE: orc-run` means the code is ALREADY in the worktree,
so the driver splits what exists (file-granular, below) instead of writing code;
a `RUN-DIR` gives the driver the run's task graph, acceptance criteria, and
verify evidence for free.

## Entry modes (exactly two)

- **`greenfield`** — nothing is written yet. Plan the layers up front, then build
  layer by layer. The cheapest, cleanest path.
- **`orc-run`** — an ORC build already produced the whole change in the worktree.
  The split is **FILE-GRANULAR ONLY**: each changed file belongs to exactly one
  layer, and ORC's per-task `declared_files` is the seam evidence. **Hunk surgery
  is forbidden** — a file whose content belongs in two layers is an UNCERTAIN, and
  the default answer offered is "the whole file lands in the LOWEST layer that
  needs it".

Splitting an already-open fat PR (the retro case, `gh stack link`) is **out of
scope**: say so and ship the change as one regular PR instead.
