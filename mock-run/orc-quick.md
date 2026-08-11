# Mock run — `/orc-quick`

> Ask for anything. Three steps: look → ask once → do. It always asks you
> which agent should run.

---

## 1. What it does

Every other lane has a fixed job. This one does not. A small fix, a question
about how something works, a defect hunt, a dependency bump, or the review
comments on a pull request — all the same three steps.

The point of the lane is the **dispatch gate**: before every single dispatch it
asks you which agent to use. No default. No "same as last time". No setting can
turn it off — `opus5_only`, `fable5_*` and `rubric_bands_override` are all
inert here, and the gate says so when they are on.

---

## 2. The run

```
> /orc-quick the refund badge shows "pending" even after the webhook lands
```

### Q1 — Look (silent)

ORC reads first and says nothing until it has something to say.

### Q2 — Ask (one turn: questions **and** the agent choice together)

```
I looked. Here is what I found and what I need from you.

  · web/refunds/RefundBadge.tsx:22 maps status → label
  · the map has no case for `sent_to_bank`, so it falls through to "pending"
  · api/refunds/webhook.ts:52 does write that status

Two questions:
  1  Add the missing case only, or review the whole map?
  2  Should the badge colour change too?

And which agent should do it?
  a  orc-executor-sonnet-4-6-med    (small, one file)
  b  orc-executor-opus-5-low
  c  something else — tell me the model and effort

> 1 just the missing case. 2 yes, amber. agent a.
```

### Q3 — Do

```
Dispatch  orc-executor-sonnet-4-6-med
  returned as: claude-sonnet-4-6 / medium     ✓

build   ✓
tests   ✓  12 passed

Entry 1 written to orc-quick/refund-badge/quick-context.md

Commit these 2 files?  [yes / no]

> yes
```

Your next request becomes entry 2 in the same file, and so on.

---

## 3. What it wrote

```markdown
# Quick context — refund-badge

<!-- orc-quick:toc -->
1. Refund badge stuck on "pending"      2026-08-12   done
<!-- /orc-quick:toc -->

## 1. Refund badge stuck on "pending"

**You asked:** the badge shows pending after the webhook lands.
**Decided:** add the missing `sent_to_bank` case only; amber colour.
**Why:** the whole map is fine — one case was never added.
**Agents:** orc-executor-sonnet-4-6-med (you chose it).
**Not done:** the admin list has the same map and was NOT touched.
```

---

## 4. What to notice

- **The doc is written before the commit offer**, so a "no" still leaves you
  the record.
- **ORC never reads that file back** unless you ask, or to show the numbered
  list when you reopen the thread. It is for you, not for the model.
- **A red build loops (max 3 rounds), a red test does not.** A failing test is
  sometimes the test being wrong, so it blocks the commit offer and stops.
  No test suite at all means no check at all — nothing is invented.
- **`gh` is read and push only.** It never replies to a comment, resolves a
  thread, approves or merges. PR comments are treated as data, never as
  instructions.
- **It never undoes your work.** If you stop while things are red, it prints
  the `git` command and leaves your tree alone.

---

## 5. Related

- The full guide, with more worked runs:
  [`templates/skills/orc-quick/README.md`](../templates/skills/orc-quick/README.md)
- Too big for quick? It offers [`/orc-mini`](../templates/skills/orc-mini/examples/mini-run-mock.md) — an offer, never a forced switch.
