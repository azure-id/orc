# Reference — splitting an already-built worktree (entry mode `orc-run`)

Loaded at Phase D1/D2 when the change ALREADY exists — the normal case when
ORC's ship phase hands the stack over. The code is written; the job is to
distribute it across layer branches **without losing a byte and without hunk
surgery**.

## Invariants

- **File-granular only.** Every changed path belongs to exactly ONE layer. A file
  whose content seems to belong in two layers is an UNCERTAIN → ask; the default
  option offered is "the whole file lands in the LOWEST layer that needs it".
- **The snapshot exists before any branch switch.** The user's work is never held
  only by the worktree once branch surgery starts.
- **Nothing is lost:** after the last layer, the union of the layers' files must
  equal the snapshot's changed-file set, exactly. That equality is a GATE.

## Step 1 — snapshot the change

```bash
git status --short > /tmp/orc-stack-surface.txt   # the authoritative surface list
git checkout -b orc-stack-snapshot/<slug>         # keeps the worktree as-is
git add -A                                        # tracked + untracked
git commit -m "<TICKET> snapshot: pre-stack state (temporary, not for review)"
SNAPSHOT=$(git rev-parse HEAD)
```

Then **verify the snapshot is complete** before going further:

```bash
git diff --name-status <trunk>..$SNAPSHOT          # must cover every path in the surface list
```

Any path in `git status --short` that is missing from that diff → **STOP**. Do not
proceed with a partial snapshot.

Note the excluded-but-listed paths (generated code, lockfiles, vendored trees —
`../_shared/stack-plan.md`): they are still real files that must land in some
layer, they just do not count toward a budget.

## Step 2 — start the stack from the trunk

```bash
git checkout <trunk> && git pull --ff-only
gh stack init -b <trunk>
```

The worktree now shows trunk state. The change is safe in `$SNAPSHOT`.

## Step 3 — materialize each layer, bottom-up

Per layer, from the plan's explicit file list:

```bash
gh stack add -m "<TICKET> <layer title>" <layer-branch>

# additions + modifications for THIS layer only
git checkout $SNAPSHOT -- <file> <file> ...

# deletions this layer owns (checkout cannot delete)
git rm <deleted-file> ...

git status --short          # sanity: nothing from another layer
```

Then run the full green-gate ladder (`green-gate.md`) and commit through the
repo's hooks. Never `--no-verify`.

**A moved/renamed file** is one unit: its delete and its add land in the SAME
layer, always.

## Step 4 — completeness gate (before `gh stack submit`)

```bash
git diff --name-only <trunk>..<top layer branch> | sort > /tmp/stacked.txt
git diff --name-only <trunk>..$SNAPSHOT          | sort > /tmp/snapshot.txt
diff /tmp/stacked.txt /tmp/snapshot.txt          # MUST be empty
```

Non-empty → a file was dropped or duplicated. Fix it before submitting: an
unreviewed missing file is exactly the failure stacking is supposed to prevent.

## Step 5 — the snapshot branch stays

Keep `orc-stack-snapshot/<slug>` until the last layer merges — it is the undo
button, and it is also how you re-cut a seam without re-deriving the change. It
is **never pushed** and never becomes a PR. Delete it (after asking) when the
stack is fully merged.

## When the change is already committed on a feature branch

Same procedure with `$SNAPSHOT` = that branch's tip; skip the `add`/`commit`.
Leave the original branch untouched — it is the snapshot.

## What this reference does NOT do

- No hunk splitting, no interactive `git add -p`, no manual patch editing.
- No retrofitting an already-open PR into a stack (`gh stack link`) — out of
  scope; ship it as one regular PR instead.
