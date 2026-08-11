# Mock run — `/orc-pr-setup` and `/orc-pr-driver`

> One big change, split into a stack of small pull requests that each build and
> test on their own.

Two lanes, in order. **Setup** decides where the cut lines go and writes a plan.
**Driver** takes that plan and actually creates the branches and the PRs.

---

## 1. `/orc-pr-setup` — where do the cuts go?

```
> /orc-pr-setup split the refund visibility change
```

```
The change: 14 files, 980 lines added, 210 removed.

Layers, bottom first. A layer may only depend on layers BELOW it.

  L1  db + state enum            3 files   120 LoC   value: makes the state exist
      db/migrations/0042_sent_to_bank.sql, api/refunds/state.ts, its test
      why first: everything else imports this enum

  L2  webhook writes the state   2 files   140 LoC   value: the state is real
      depends on L1

  L3  customer badge             4 files   260 LoC   value: customers see it
      depends on L1 (not L2 — the badge only reads the enum)

  L4  admin list + filters       5 files   410 LoC   value: support sees it
      depends on L1

One thing I am NOT sure about — I will not guess:

  ❓ web/refunds/format.ts is used by BOTH L3 and L4.
     a  put it in L1 (a "shared" layer at the bottom)
     b  put it in L3, and L4 depends on L3
     ➡️  I recommend (a). It makes L3 and L4 independent, so they can be
        reviewed in parallel.

> a

Layer budget check: every layer is under 1000 LoC and 20 files ✓
4 layers, under the soft cap of 6 ✓

Written: stacked-pr/refund-visibility/stack-plan.md
I have touched no branch, no commit, and no remote.
```

---

## 2. `/orc-pr-driver` — build and submit the stack

```
> /orc-pr-driver
```

```
Plan check
  stacked-pr/refund-visibility/stack-plan.md   READY   (exit 0)
  ticket SHOP-231 ✓ · PR template resolved ✓ · no unanswered questions ✓

Snapshot taken first: your working tree is saved before anything moves.

L1  branch refund/01-state
    only L1's 3 files staged
    GREEN GATE, at this layer's own base:
      build ✓   tests ✓ 41 passed   lint ✓
      (your repo's own hooks ran — never --no-verify)
    pushed

L2  branch refund/02-webhook  (base: refund/01-state)
    GREEN GATE  ✓ ✓ ✓        pushed

L3, L4 …  same shape

gh stack submit
  #412 L1 state   #413 L2 webhook   #414 L3 badge   #415 L4 admin
  each PR body written from your template, with its layer's purpose
```

Later, when review comments land:

```
> /orc-pr-driver restack

L1 got a change. Rebasing 02, 03, 04 on top, in order.
  L2 clean · L3 clean · L4 CONFLICT in web/admin/RefundList.tsx
  Stopping here and showing you the conflict. Nothing force-pushed yet.
```

And merging:

```
> /orc-pr-driver merge

Bottom up, always: #412 first.
  #412 approved ✓ merged
  #413 retargeted to main, CI re-ran, ✓ merged
  … 
```

---

## 3. What to notice

- **Setup never touches git.** No branch, no commit, no push. That belongs to
  the driver.
- **Every layer is green on its own base.** A stack where only the top builds
  is not a stack, it is one PR wearing four hats.
- **An uncertain cut line stops the lane.** Setup asks, one decision at a time,
  and writes your answer into the plan.
- **You can start at the driver.** `orc pr stack template` writes an empty plan
  you fill in by hand — no planner run needed.
- **Merging is bottom up, and that is not a preference.** Merging the top first
  makes every layer below it lie about its own diff.

---

## 4. Related

- Full guides: [ORC-PR-SETUP README](../templates/skills/orc-pr-setup/README.md) ·
  [ORC-PR-DRIVER README](../templates/skills/orc-pr-driver/README.md)
- ORC's own ship phase hands off here when a change is too big for one PR.
