# Reference — stack maintenance & conflict playbook

Loaded at Phase D4/D5. A stack is a living chain: the trunk moves, review demands
changes, layers merge. Every one of those events rewrites branches above the
change, so every one of them ends with the same obligation — **re-run the green
gate at every tip above it, bottom-up** (`green-gate.md`).

## The four events and their exact response

| Event | Command | Then |
|---|---|---|
| the trunk moved | `gh stack sync [--prune]` | re-run the ladder at EVERY layer tip, bottom-up |
| you amended layer N | `gh stack rebase --upstack` | re-run the ladder from layer N upward |
| review wants a structural change | `gh stack modify` (drop / combine / insert / reorder / rename) | update the plan file + `## Decisions`, then re-run the ladder from the lowest touched layer |
| a layer merged | (automatic retarget) | confirm the upper layers retargeted and their CI re-ran |

`gh stack rebase` also takes `--downstack`, `--no-trunk`, `--continue`,
`--abort` — see `../../_shared/gh-stack-commands.md`.

## Conflict resolution during a rebase

1. **Resolve in the layer where the conflict appears**, never by pulling content
   down from a higher layer — that silently moves code between layers and breaks
   the plan's file list.
2. If the conflict shows that two layers genuinely own the same file, that is a
   **seam defect**: stop, ask (merge the layers · move the file wholesale to the
   lower one), record the answer in the plan, and re-cut.
3. `gh stack rebase --continue` after each resolution; `--abort` to get back to a
   known state — aborting is always allowed and always better than a guessed
   resolution.
4. After the rebase completes, the ladder runs at every tip above the conflict.
   A conflict resolution is a code change like any other.

## Force-push discipline

Amending a lower layer force-pushes every branch above it, and reviewers lose
in-progress review context (comments detach, "viewed" marks reset). So:

- prefer **fixup-on-top** (a new commit in the same layer) over an amend while a
  layer is under active review;
- prefer `gh stack modify` over hand-rolled history rewrites;
- when a force-push is unavoidable, tell the reviewers in a PR comment which
  layers moved and why.

## Merge sequence (bottom-up, non-negotiable)

```
for L in bottom..top:
    gh pr view <L> --json statusCheckRollup     # this layer's own CI green?
    reviewers approved?
    gh stack merge <L> [--squash|--merge|--rebase]
    confirm: upper layers retargeted, their CI re-ran
```

- Merging the **top ready layer** lands every unmerged layer below it in one
  operation — convenient, but only when every one of those layers is green and
  approved. Otherwise merge one at a time.
- Never merge a middle layer while an unmerged layer sits below it.
- A merge queue may or may not be enabled for stacked PRs on a given repo —
  **probe, never assume** (`../../_shared/gh-stack-commands.md`).

## Abandoning a stack

`gh stack unstack [<stack-no>] [--local]` removes tracking (and the stack on
GitHub). The branches survive. If the plan turned out wrong, this plus the
snapshot branch (`orc-run-split.md`) is a clean reset: unstack, re-plan with
`/orc-pr-setup`, re-cut from the snapshot.

## When the preview breaks under you

Stacked PRs are a GitHub **public preview**. If a command in
`../../_shared/gh-stack-commands.md` is renamed or removed:

1. Do NOT hand-roll the stack with bare `git push` + manual base edits — nothing
   retargets on merge and a half-built stack is worse than one honest big PR.
2. Say what broke, and fall back to a single regular PR (or leave the already-
   submitted layers as plain PRs, merged bottom-up by hand).
3. The fix is one file: update the command table.
