# Ship-phase STACKED-PR gate (Phase 8, deterministic)

Loaded by `orc-pr` at Phase 8, before the commit/push/PR question. Turns "this
change is too big for one PR" from a judgment call into a measured gate with ONE
P0 question.

Scope: full `/orc` and `/orc-ultra` only — **never in orc-mini**, orc-fast (the
fast lane never stops the chat) or orc-diy (flow shape is compile-owned).

## Step 1 — measure the change (never estimate)

```bash
git diff --numstat            # unstaged
git diff --numstat --cached   # staged
git status --short            # untracked adds
```

`LoC = additions + deletions` and `files = count`, both **after** removing the
exclusion list in `../../../_shared/stack-plan.md` (generated code, lockfiles,
`vendor/`, `node_modules/`, `testdata/`, pure renames). Excluded paths are kept as
a LISTED bucket, never silently dropped. `test-generator/` deliverables count;
`mock-examples/` is never staged, so it never counts.

## Step 2 — the threshold (config, not vibes)

Resolve with `orc lane config orc --json` and read `effective` (v1.0.0 W7 —
the defaults live in the CLI registry, never in a second table here). The
Default column below is what the registry ships today, for orientation only:
a disagreement means the registry is right.

| Key | Default | Meaning here |
|---|---|---|
| `stacked_pr` | `ask` | `ask` = P0 question when the threshold trips · `on` = go straight into the stack flow · `off` = never offer, regular PR |
| `stacked_pr_loc` | 1000 | change LoC **≥ this** → stack candidate (also the per-layer LoC ceiling) |
| `stacked_pr_files` | 20 | changed files **≥ this** → stack candidate (also the per-layer file ceiling) |
| `stacked_pr_max_layers` | 6 | soft layer cap the planner honors |

**Trigger = `LoC >= stacked_pr_loc` OR `files >= stacked_pr_files`.** One number
does both jobs on purpose: a change that cannot fit inside ONE layer's budget is
exactly the change worth stacking.

Below the threshold, or `stacked_pr: off` → **no question, no mention**: continue
the normal ship flow. Emit `GATE stack-gate pass :: under-threshold loc=<n>
files=<n>` and move on. Above it, print the one-line report either way:

```
STACK GATE — <n> LoC · <n> files (excluded: <n> files) → threshold <loc>/<files> TRIPPED
```

## Step 3 — prerequisites (both required, asked in the SAME round as the P0)

1. **Ticket number.** Required — layer branch names and titles derive from it.
   Ask once. No ticket → skip stacking, ship one regular PR.
2. **PR template.** Resolve per `../../../_shared/pr-templates.md`: the ORC
   template (`pr.md`, only if the team replaced the placeholder) → a project
   template (`.github/`, `docs/`) → a PR-template section in `CLAUDE.md` → else
   RECOMMEND three options (`minimal`, `context-first`, `risk-and-rollback`) and
   let the user pick or paste their own. **Declining every option → skip
   stacking, ship one regular PR** and say so in one line.

Neither prerequisite is silently defaulted, and neither is a build failure — both
degrade to a regular PR.

## Step 4 — the P0 question (one question, both answers legitimate)

With the threshold tripped and both prerequisites satisfied, ask ONE question
(`stacked_pr: on` skips the asking and takes "yes"):

```
This change is <n> LoC across <n> files — above the one-PR budget
(<stacked_pr_loc> LoC / <stacked_pr_files> files).

Stack it into reviewable layers?
  [yes] plan the layers (/orc-pr-setup) → build + submit them (/orc-pr-driver).
        <n> layers means <n> full CI runs; each layer is reviewable on its own.
  [no]  push one regular PR as usual.        ← no penalty, no re-ask
```

"No" → continue the normal ship flow, and never re-ask this run. Emit
`GATE stack-gate pass :: declined`.

## Step 5 — handoff (never inline)

The ship phase does NOT plan or cut layers itself. It hands off:

1. Verify the build is green (`build_green` — hard rule 10: never stack a red
   build; a red build ends the gate).
2. Commit the run's work as usual **on the current feature branch** — the
   snapshot the driver splits from (`orc-pr-driver/references/orc-run-split.md`).
   Do not push it as a PR yet.
3. Write `stacked-pr/<slug>/STACK-FROM.md` per `../../../_shared/stack-plan.md`
   with `STACK-FROM: orc-ship`, the ticket, `ENTRY-MODE: orc-run`, the resolved
   `PR-TEMPLATE`, the measured `SURFACE`, this run's `RUN-DIR` (the driver reads
   the task graph, `declared_files` and verify evidence from it) and
   `BUILD-GREEN: true`.
4. Tell the user, in this order: run **`/orc-pr-setup`** (plans the layers, asks
   on every uncertain seam, writes `stacked-pr/<slug>/stack-plan.md`), then
   **`/orc-pr-driver`** (branches, per-layer green gate, `gh stack submit`).
   A user who already has a filled plan can go straight to `/orc-pr-driver`.
5. Emit `GATE stack-gate pass :: handoff ticket=<T> slug=<slug>` and finish the
   ship phase normally (usage report, wiki stale-flag, `FINISH`) — the stack
   itself completes in the two standalone lanes.

## Boundaries

- The gate **measures and asks**; it never plans layers, never creates a branch
  per layer, never runs `gh stack`.
- Missing `gh`/`gh-stack`, or a fork, is not this gate's problem to solve — the
  lanes preflight it (`../../../_shared/gh-stack-commands.md`) and fall back to a
  regular PR.
- One question per run. A declined stack is never re-offered.
