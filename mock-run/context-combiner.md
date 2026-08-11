# Mock run — the context combiner

> Two analyses of two related documents, merged into one spec — and it proves
> that nothing was lost.

There is no slash command for this. It is offered by `/orc-analyze` when two or
more related analyses already exist.

---

## 1. What it does

You analysed the refund policy PDF last week. Today you analysed the support
escalation doc. Both talk about refunds. Building from either one alone means
building half the thing.

The combiner pools **every** requirement from **every** source and gives each
one exactly one outcome. Then it counts. If the count is not 100%, it does not
hand off.

---

## 2. The run

```
/orc-analyze  …  Phase F:

  Two related analyses found. Merge them into one spec?
  · refund-policy       11 requirements   2026-08-04
  · support-escalation   7 requirements   2026-08-12

> yes
```

```
Dispatching orc-context-combiner-opus-5-high …
returned as: claude-opus-5 / high        ✓

Phase B — are these really related?
  shared files       api/refunds/ (both), web/refunds/ (both)
  shared subject     refund state and who is told about it
  Verdict: related. Continuing.

Phase C — pooled 18 requirements, reconciled one at a time

  exact duplicate    R-04 = S-02  "refund state must be visible to support"
                     → ONE row, both sources cited
  partial overlap    R-07 "notify the customer" vs S-05 "notify support"
                     → SPLIT into two rows, never collapsed into "notify"
  conflict           R-09 says refunds are final; S-06 describes a re-open
                     → CONFLICT, raised to you (below)
  ordering           S-01 must happen before R-02 (it creates the state)

Phase D — one question at a time

  ❓ R-09 vs S-06 — can a closed refund be re-opened?
     R-09 (policy PDF, p.4): "a completed refund is final"
     S-06 (escalation doc, §2): "support may re-open within 14 days"
     ➡️  The escalation doc is newer. I recommend S-06 wins, with R-09 kept
        as a note. Your call.

  > S-06 wins, and add the 14 days as a hard rule

Phase E — conservation gate
  source requirements   18
  rows in the merged spec 19   (one split into two)
  every source id has exactly one outcome:
     kept 15 · merged 2 · split 1→2 · resolved-by-you 1 · dropped 0
  coverage_pct: 100        → handoff allowed

Phase F — written
  combined-report.md
  combined-requirement-spec.md          (a normal spec, plus the source map)

Evidence freshness: 2 anchors from last week no longer match HEAD.
  api/refunds/create.ts:31 → now :44     (flagged, not silently fixed)
```

---

## 3. What to notice

- **Nothing may vanish quietly.** Below 100% coverage there is no handoff.
  Dropping a requirement is allowed — but only as your explicit decision, and
  it is recorded as one.
- **A partial overlap is split, never collapsed.** Collapsing two similar
  requirements into one shorter sentence is how scope disappears.
- **Old evidence is re-checked against HEAD**, because an anchor that was true
  last week is not a fact today.
- **The merged spec is a normal spec.** The planner and the build pipeline do
  not know or care that it came from two documents.
- **Full lane only.** There is no mini version of this, and it never builds
  anything or spawns anything itself.

---

## 4. Related

- Where it starts: [`/orc-analyze`](../templates/skills/orc-analyze/examples/analyze-mock.md)
- What happens next: [`/orc-plan`](orc-plan.md)
