# Shared contract — PR-description template resolution (stacked + regular)

Canonical, single-copy rule for WHERE a PR body comes from. Read by ORC's
ship-phase stack gate (`orc/subskills/orc-pr/stack-gate.md`), `orc-pr-setup`
(which records the resolved source in the plan) and `orc-pr-driver` (which fills
it per layer). A stacked PR without a real template is a wall of prose in N
copies — so template resolution is a **gate**, not a nicety.

## Resolution order (first hit wins — probe, never guess)

1. **ORC template** — `.claude/skills/orc/subskills/orc-pr/pr.md`. Counts as
   available only when the team REPLACED it: if the file still contains its
   `PLACEHOLDER` marker, treat it as **not available** and keep looking.
2. **Project template** — first existing of
   `.github/pull_request_template.md` · `.github/PULL_REQUEST_TEMPLATE.md` ·
   any `.github/PULL_REQUEST_TEMPLATE/*.md` (more than one → ask which) ·
   `docs/pull_request_template.md` · a `docs/**` file whose name contains both
   `pr`/`pull-request` and `template`.
3. **CLAUDE.md** — a PR-template section in the repo's `CLAUDE.md` (a heading
   matching `PR template` / `pull request template`, or a fenced block labelled
   as one). Use the section body verbatim as the template.
4. **Nothing found → RECOMMEND, one question, three options** (below). The user
   picks one, pastes their own, or declines.
5. **User declines every option → the stacked PR is SKIPPED.** Say so in one
   line and push/PR the change **regularly**, as one PR. Never invent a house
   template and never stack without one — a template is what makes N layer
   bodies readable.

Record the winner as `pr template:` in the stack plan
(`orc | project:<path> | claude.md | picked:<name>`) so the driver never
re-resolves and the two lanes cannot disagree.

## The three recommended options (offer all three, with this framing)

### Option A — `minimal` (fastest to review; good default for small teams)

```markdown
## What
<one paragraph — what this PR changes>

## Why
<the ticket's intent in one or two lines>

## How to verify
<commands or steps a reviewer runs>
```

### Option B — `context-first` (best for stacked PRs — carries the layer's place in the chain)

```markdown
## Summary
<what this layer does, one paragraph>

## Why this layer exists
<purpose + value class; for FOUNDATION, name the consumer layer>

## Not in this PR
<what a reviewer might expect but will find in another layer> → layer <n>

## Verification
- build: <command + result>
- tests: <command + result>
- lint: <command + result>

## Notes for reviewers
<excluded-from-budget files, risks, rollback>
```

### Option C — `risk-and-rollback` (best for payment/data paths and regulated changes)

```markdown
## Change
<what changes, in behavioral terms>

## Blast radius
<surfaces, consumers, data touched>

## Risk & mitigation
<what can go wrong; what guards it>

## Rollback
<exact revert/flag-off procedure>

## Evidence
build · tests · lint · manual checks (commands + results)
```

On a pick, offer once to save it as `.github/pull_request_template.md` (a repo
change — never write it unasked). Declined → the template is used for this stack
only and lives in the plan.

## Per-layer fill rules (stacked PRs)

Whatever template wins, every layer's body ALSO carries these four facts —
appended if the template has no home for them:

- **Layer `n` of `N`** + the ticket, and the stack map GitHub renders above it.
- **Purpose + value class** (`USER | OPERATOR | CONTRACT | FOUNDATION`, with the
  consumer layer named for FOUNDATION).
- **Deliberately NOT here** → the layer that has it. This is what stops a
  reviewer from rejecting a layer for something the next layer fixes.
- **Excluded-from-budget files**, listed — generated/vendored/lockfiles that the
  numbers ignore but the reviewer should still see.

Regular (unstacked) PRs use the same resolution order and none of the four
layer facts.
