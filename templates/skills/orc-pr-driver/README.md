# ORC-PR-DRIVER — build and ship your stacked pull requests

**Guide for humans.** Plain, simple English. This skill takes a stack plan and
makes it real: one branch per layer, one PR per layer, each one tested on its
own.

Read the planning guide first if you have not:
**[ORC-PR-SETUP README](../orc-pr-setup/README.md)** — it explains what a stack
is, and it writes the plan this skill needs.

---

## 1. The short version

```
stack-plan.md ──▶ /orc-pr-driver ──▶ branch per layer
                                     ↳ build + test + lint each layer ALONE
                                     ↳ gh stack submit  → 3–6 small PRs
                                     ↳ sync / rebase / merge from the bottom up
```

Run it with:

```
/orc-pr-driver
```

**The one rule that matters:** a layer is never pushed, submitted, or merged
until it is green **on its own base**. Not "green when all layers are applied
together". Green alone. Because you may merge layer 1 today and layer 2 next
week — and layer 1 alone must not break your main branch.

---

## 2. Before you start: is the plan ready?

The plan lives at `stacked-pr/<slug>/stack-plan.md`. Check it:

```bash
orc pr stack status              # or: orc pr stack status my-feature
```

| Result | Meaning | What to do |
|---|---|---|
| `✓ READY` (exit 0) | the plan is complete | run `/orc-pr-driver` |
| `✗ absent` (exit 1) | there is no plan | run `/orc-pr-setup`, or `orc pr stack template <slug>` |
| `✗ NOT READY` (exit 1) | the plan still has `<...>` gaps | fill them in; the message lists what is missing |

**The driver refuses to run** when the plan has any of these problems. It tells
you exactly which one, and it never fills in a value for you:

- a question in `## Decisions` that you never answered,
- no ticket number,
- a layer with no purpose, or no value class,
- a `FOUNDATION` layer that does not name the layer using it,
- fewer than 2 layers (that is not a stack — just open one PR),
- the build was red when the change was handed over.

It also re-checks the tools: `gh` version 2.0+, logged in,
`github/gh-stack` installed, and **your repo is not a fork** (GitHub cannot stack
across forks). If a check fails, it says so and recommends one normal PR.

---

## 3. Your work is protected first (the snapshot)

If your code already exists in your working tree — the normal case when `/orc`
hands the change over — the driver **saves everything before it touches any
branch**:

```bash
git status --short > list-of-changed-files        # the authoritative list
git checkout -b orc-stack-snapshot/<slug>         # your files stay as they are
git add -A && git commit -m "<TICKET> snapshot"   # now your work lives in a commit
```

Then it checks that the snapshot really contains every changed file. If one file
is missing, it stops. It never starts branch work with a partial snapshot.

That snapshot branch:

- is **never pushed** and never becomes a PR,
- stays until the last layer is merged — it is your undo button,
- is deleted only after asking you.

Every layer is then filled from the snapshot, file by file:

```bash
git checkout <snapshot> -- path/to/file.go        # add/modify files of THIS layer
git rm path/to/deleted_file.go                   # deletions of THIS layer
```

**Files are moved whole.** The driver never cuts a file in half (no
"hunk surgery", no `git add -p`). If one file's content seems to belong in two
layers, that is a question for you — and the usual answer is "put the whole file
in the lowest layer that needs it".

Before submitting anything, it proves nothing was lost:

```bash
# file list of the top layer  ==  file list of the snapshot   → must be identical
```

If they differ, a file was dropped or duplicated, and it stops. A silently
missing file is exactly the accident stacking is meant to prevent.

---

## 4. What happens, step by step

| Phase | What it does |
|---|---|
| **D0 Read the plan** | probe, read, refuse if incomplete, re-measure the real sizes, check the tools |
| **D1 Snapshot** | save your work (section 3). Skipped when the code is not written yet |
| **D2 Build the layers** | `gh stack init` → per layer: `gh stack add`, put that layer's files in, **run the green gate**, commit through your repo's hooks |
| **D3 Submit** | `gh stack submit`, then verify with `gh stack view --json` that each PR's base and diff are correct, and fill in every PR body |
| **D4 Maintain** | keep the stack healthy while review happens: `sync`, `rebase --upstack`, `modify` |
| **D5 Merge** | merge from the **bottom up**, checking each layer's own CI first |

After each layer it prints one line, for example:

```
L2 PAY-4211-store — 9 files, 640 LoC — GATE GREEN
```

---

## 5. The green gate (the part people get wrong)

Every layer runs four steps, in order. All four are required.

| Step | What | Why |
|---|---|---|
| 1 | **build** at this layer's base | the layer must compile alone |
| 2 | **tests** for this layer's code | the layer must pass alone |
| 3 | **lint, compared to this layer's own base** | so layer 4 is not blamed for layer 1's code |
| 4 | **your repo's own pre-commit hooks** — unbypassed | those hooks are the real gate; if they fail, the PR cannot land |

Common commands per language:

| Language | build | tests | lint |
|---|---|---|---|
| Go | `go build ./...` | `go test ./<pkgs>/...` | `golangci-lint run --new-from-rev <base>` |
| Node / TypeScript | `npm run build` | `npm test -- <paths>` | `eslint <changed files>` |
| Java / Kotlin | `./gradlew compileJava` | `./gradlew test --tests …` | checkstyle / detekt |
| Python | type-check / compile | `pytest <paths>` | `ruff check <paths>` |
| Rust | `cargo build` | `cargo test <filter>` | `cargo clippy -- -D warnings` |

Your project's own scripts always win over these examples. If your project
generates code (`mockery`, `go generate`, `protoc`, `npm run codegen`), that runs
first — a missing generated file looks like a compile error and sends you
hunting the wrong problem.

**If any step is red:** stop, fix it, and run **all four steps again from the
start** for that layer. Do not continue to the next layer. Do not push.

**`git commit --no-verify` is forbidden.** Skipping the hooks does not make the
PR mergeable; it only hides the problem until CI finds it.

### The lint trap that only happens with stacks

Many projects tell their linter to check "new code since `origin/main`". In a
stack, that makes layer 4 look like it contains layers 1–3's code too — noisy and
wrong. The driver overrides the baseline per layer
(`--new-from-rev <that layer's base>`), so each layer is judged on **its own**
changes.

### "unused function" on a low layer — a question, not a lint fix

Your storage layer adds `FindByRef()`. Only the handler layer (higher up) calls
it. Linters like Go's `unused`, TypeScript's `noUnusedLocals`, or Rust's
`dead_code` will mark it as dead code and the layer goes red.

That red is **useful information**: as a standalone PR, this layer really does
add unused code. So the driver stops and asks you:

```
[a] merge the storage layer into the handler layer   (recommended — no dead code)
[b] keep both layers, move the first caller down into the storage layer
[c] accept it: add one suppression comment that names the layer which will use it
    (your decision only)
```

It never adds a suppression by itself, never invents a fake caller, and never
deletes your code to make the linter quiet. Your answer goes into the plan's
`## Decisions`.

### Code-quality scans (SonarQube and similar)

If your scan analyzes the project without pull-request decoration, layer 3's
scan measures layers 1+2+3 **together**, not layer 3 alone. So:

- do not trust "new code coverage" as a per-layer number — check coverage
  locally, per layer,
- treat the scan as a **whole-stack** gate,
- a scan reported as `SKIPPED` usually means the test job failed first. Read it
  as red, not as a flaky tool.

This is also why each layer keeps **its own tests with its own code**: a layer
with no tests can fail a coverage rule all by itself.

---

## 6. PR descriptions

Every PR body comes from the template chosen in the plan (`pr template:`). On top
of that template, every layer's body always shows four facts:

1. **Layer 2 of 4** + the ticket number (GitHub also draws the stack map).
2. **Purpose and value class** — why this layer exists, who it helps.
3. **Deliberately NOT here → layer 3.** This is important: it stops a reviewer
   from rejecting your layer for something the next layer fixes.
4. **Files excluded from the size count** — generated code, lock files, vendored
   folders. The numbers ignore them, but reviewers should still know they exist.

---

## 7. Keeping the stack healthy during review

Reviews take days. The trunk moves. Things need updating. Four events, four
answers:

| Event | Command | Then, always |
|---|---|---|
| the trunk moved | `gh stack sync` | run the green gate again at **every** layer, bottom to top |
| you changed a lower layer | `gh stack rebase --upstack` | run the green gate again from that layer upward |
| review asks for a structural change | `gh stack modify` (drop / combine / insert / reorder / rename) | update the plan file, then re-run the gate from the lowest changed layer |
| a layer was merged | nothing — GitHub retargets automatically | confirm the layers above retargeted and their CI re-ran |

**Why re-run the gate:** changing a lower layer rewrites every branch above it.
A layer that was green yesterday can be red now. "It was green when I made it" is
not evidence.

### Conflicts during a rebase

1. Fix the conflict **inside the layer where it appears**. Never pull content
   down from a higher layer — that silently moves code between layers.
2. If two layers really own the same file, the cut line was wrong. Stop, decide
   with the skill (merge the layers, or move the whole file down), write the
   decision into the plan, and re-cut.
3. `gh stack rebase --continue` after each fix. `--abort` is always allowed and
   is better than a guessed fix.

### About force-pushes

Changing a lower layer force-pushes every branch above it, and reviewers lose
their in-progress review (comments detach, "viewed" marks reset). So while a
layer is under review, prefer:

- a new small commit on top of that layer instead of amending it,
- `gh stack modify` instead of hand-made history rewrites,
- and if a force-push cannot be avoided, leave a comment saying which layers
  moved and why.

---

## 8. Merging (order is not optional)

Merge **from the bottom up**. For each layer, in order:

```bash
gh pr view <n> --json statusCheckRollup     # is THIS layer's CI green?
# reviewers approved?
gh stack merge <n> --squash                 # or --merge / --rebase
# then confirm: layers above retargeted, their CI re-ran
```

- Merging the **top ready layer** lands every unmerged layer below it in one
  action. Convenient — but only when all of those layers are green and approved.
- **Never** merge a middle layer while an unmerged layer is still below it.
- Merge queues for stacked PRs are still rolling out at GitHub. The skill checks
  whether your repo has one; it never assumes.

When the last layer is merged, the driver offers to delete the snapshot branch.

---

## 9. Troubleshooting

| You see | What it means | Fix |
|---|---|---|
| `✗ absent — no stacked-pr/...` | no plan file | `/orc-pr-setup`, or `orc pr stack template <slug>` |
| `✗ NOT READY — 12 unfilled placeholders` | the skeleton is not filled in | fill in each `<...>`; the message shows examples |
| "2 stack plans — name one: a, b" | more than one plan exists | add the slug: `orc pr stack status a` |
| "refusing to overwrite a plan" | a plan with that slug already exists | edit it, use another slug, or pass `--force` |
| "this repo is a fork" | stacks cannot cross forks | use one normal PR |
| `gh: unknown command "stack"` | the extension is missing | `gh extension install github/gh-stack` |
| lint flags code from lower layers | the baseline is the trunk, not your layer | the driver sets `--new-from-rev <layer base>`; check your CI does the same |
| "unused" on a low layer | as a standalone PR, that code has no caller | answer the question in section 5 — never add a blind suppression |
| a layer was green, now it is red | a lower layer changed and rewrote this branch | fix, then re-run the gate at every layer above the change |
| `scan SKIPPED` in CI | the test job failed before the scan | treat as red; fix the tests |
| the file lists do not match at the end | a file was dropped or duplicated between layers | the driver stops; fix the layer file lists in the plan |

---

## 10. What this skill never does

- Never plans the layers. No plan → it sends you to `/orc-pr-setup` or the
  template command.
- Never bypasses a gate: no `--no-verify`, no red push, no red submit, no red
  merge.
- Never cuts a file in half.
- Never touches your work without a snapshot first.
- Never merges out of order.
- Never builds a "manual stack" by pushing branches and editing bases by hand
  when the extension is missing — nothing would retarget on merge, and a
  half-built stack is worse than one honest big PR.

---

## 11. FAQ

**Can I start here without `/orc-pr-setup`?**
Yes. That is a supported path. Run `orc pr stack template <slug>`, fill in the
file, then run this skill.

**What if I want to stop in the middle?**
The layers that are already green stay as normal branches/PRs. Your snapshot
branch still holds everything. `gh stack unstack` removes the stack tracking and
keeps the branches.

**Do I need to run CI myself?**
The green gate runs locally, per layer, before anything is pushed. GitHub then
runs your normal CI on each PR. Both matter: local gate finds problems in
seconds, CI is the official record.

**How many layers is too many?**
Above 6 you get a warning, above 8 the planner stops. Each layer is a full CI
run and one more review context.

**Can I use this for a change across two repositories?**
No. GitHub stacks live in one repository. Use `/orc-poly` for cross-repo
planning.

**Does this work with squash merges?**
Yes — `gh stack merge` supports merge, squash, and rebase.

---

## 12. Reference files (the skill loads these when it needs them)

| File | Contains |
|---|---|
| `references/green-gate.md` | the four-step ladder, the lint baseline trap, the dead-code question, re-verification rules |
| `references/orc-run-split.md` | the exact snapshot and file-by-file split procedure |
| `references/conflict-playbook.md` | sync / rebase / modify / merge, conflicts, force-push etiquette |
| `../_shared/stack-plan.md` | the plan format, size rules, the handoff file |
| `../_shared/gh-stack-commands.md` | every `gh stack` command, and what to do if GitHub renames one |
| `../_shared/pr-templates.md` | how a PR description is chosen, plus three ready-made templates |
