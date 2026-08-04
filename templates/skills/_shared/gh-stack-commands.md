# Shared contract — `gh stack` command surface (pinned)

Canonical, single-copy reference for GitHub's stacked-pull-request CLI. Both
stacked-PR lanes (`orc-pr-setup`, `orc-pr-driver`) and ORC's ship-phase stack
gate read THIS file — never a remembered command list.

**Why one file:** stacked PRs are a GitHub **public preview** (shipped
2026-07-30). The command surface can be renamed under us. Pinning it here makes
a breaking rename a one-file fix instead of a hunt across five skills.

## Preflight (probe, never assume)

| Check | Command | Fail meaning |
|---|---|---|
| gh present, ≥ 2.0 | `gh --version` | no `gh` → stacking is impossible; regular push |
| authed | `gh auth status` | not authed → regular push |
| extension | `gh extension list` (look for `github/gh-stack`) | absent → offer `gh extension install github/gh-stack` |
| same repo, not a fork | `gh repo view --json isFork,nameWithOwner` | **fork → STOP.** Cross-fork stacks are unsupported; this workflow does not apply |
| trunk name | `gh repo view --json defaultBranchRef` | the bottom layer's base |
| protections / required checks | `gh api repos/{owner}/{repo}/branches/{trunk}/protection` (404 = none) | tells you N layers = N full CI runs |
| merge queue | same protection payload | preview support is rolling out — **probe, never assume** |

## Command table (verbatim surface)

| Command | Purpose |
|---|---|
| `gh stack init [-b <base>] [branches...]` | start a stack in the current repo (interactive with no args; can adopt the current branch as layer 1) |
| `gh stack add [-A] [-u] [-m <msg>] [branch]` | new branch on top of the current stack |
| `gh stack view [-s] [--json]` | show the stack — `--json` is the machine-readable form every gate reads |
| `gh stack checkout <stack-no \| pr-no \| pr-url \| branch>` | check out a stack |
| `gh stack modify [--continue] [--abort]` | interactive restructure: drop / combine / insert / reorder / rename |
| `gh stack unstack [<stack-no>] [--local]` | remove from tracking / unstack on GitHub |
| `gh stack submit [--auto] [--open] [--remote <n>]` | push branches, create/update PRs, create the stack |
| `gh stack sync [--remote <n>] [--prune]` | fetch, rebase, push, sync PR state |
| `gh stack rebase [--downstack] [--upstack] [--no-trunk] [--continue] [--abort]` | cascading rebase |
| `gh stack push [--remote <n>]` | push active branches |
| `gh stack link [--base <b>] <a> <b> [...]` | link EXISTING PRs into a stack (no local tracking) — the retrofit path |
| `gh stack merge [<stack-no> \| <pr-no>] [--merge\|--squash\|--rebase] [-y]` | merge one or more layers |
| `gh stack switch` / `up [n]` / `down [n]` / `top` / `bottom` / `trunk` | navigate |
| `gh stack alias [--remove] [name]` | shorthand alias |

## Semantics that shape the lanes

- **stack** = an ordered chain of PRs in ONE repo. **layer** = one PR in it.
  Bottom layer's base is the trunk; each upper layer's base is the branch below.
- **retarget** — merging a lower layer automatically repoints the layers above.
- **restack** — server-side cascading rebase from the PR UI, or `gh stack rebase`.
- **merge is BOTTOM-UP.** Merging the top "ready" layer lands every unmerged
  layer below it in one operation; merging one layer leaves the ones above open
  and auto-rebased. History equals merging each layer individually from the
  bottom. commit / squash / rebase are all supported.
- The **stack map** renders at the top of every PR in the stack.
- Layers can be reviewed **in parallel** by different reviewers — that is the
  whole point of splitting.
- **Every layer runs full CI.** N layers = N CI runs (plus N code-quality scans).
  Layer count is a cost, so it is justified, never maximized.
- No documented maximum layer count — the cap in
  `_shared/stack-plan.md` is ORC's, for review sanity.

## Fallback when `gh stack` is unavailable

No `gh`, no extension, or a fork → say so in one line and ship the change as a
**single regular PR**. Never hand-roll a stack with bare `git push` + manual
base edits: without the extension nothing retargets on merge, and a half-built
stack is worse than one honest big PR.
