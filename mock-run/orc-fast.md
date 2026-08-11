# Mock run — `/orc-fast`

> The fastest lane. It skips the analyst and the planner completely — because
> the knowledge they would produce is already on disk.

---

## 1. What it does

`/orc-fast` has **two hard requirements** before it will run:

1. a project **wiki** that is FRESH or AGING (`/orc-wiki` built it), and
2. a cached **code pattern** for the language of your request (`/orc-pattern`).

If both are there, ORC already knows your codebase and your house style, so it
does not need to pay an analyst and a planner to work them out again. One
executor does the job.

If either is missing, ORC does **not** stop the chat and does not scold you. It
hands the request to `/orc-mini` and keeps going.

---

## 2. The run — both gates green

```
> /orc-fast add GET /orders/count
```

```
Preflight
  wiki      FRESH   (4 commits since the scan; edge is 10)   ✓
  pattern   express — cached 12 days ago                     ✓
  Both gates pass. No analyst, no planner.

Fit gate + one question
  This looks like one task, one file group, no risk flags.
  Anything I should NOT touch?

> nothing, follow api/orders/

Dispatch  orc-executor-sonnet-4-6-high
  slice carries:
    · wiki pointers   wiki/orc-feature-orders.md  (the route table)
    · the express pattern, copied in literally
    · your one constraint
  returned as: claude-sonnet-4-6 / high      ✓

Smoke gate
  build   ✓
  tests   ✓  41 passed
  (a red build would get ONE repair round, then stop)

Ship?  > yes
Committed on feat/orders-count.

~9 minutes · 1 subagent · 0 repair rounds
```

---

## 3. The run — a gate is red

```
> /orc-fast add GET /orders/count
```

```
Preflight
  wiki      STALE   (61 commits since the scan; STALE starts after 30)   ✗
  pattern   express — cached                                             ✓

One gate failed, so this lane cannot be honest about your codebase.
Handing over to /orc-mini with your request carried over.

FALLBACK-FROM: orc-fast
  reason      wiki STALE
  carried     "add GET /orders/count"
  re-derived  intake questions (mini asks its own)

/orc-mini starting …
```

Nothing was lost, and you were not asked to do anything first. If you want the
fast lane back, run `/orc-wiki refresh` — but that is your choice, later.

---

## 4. What to notice

- **The gates print, always.** A fresh wiki and a cached pattern are never
  silently assumed. You see the tier and the age every time.
- **Freshness is worked out when it is read**, from the wiki manifest. It is
  never stored as a word in a file, because a stored word goes out of date.
- **This lane is the payoff for `/orc-wiki` and `/orc-pattern`.** That is the
  deal: pay once for the knowledge, then run cheap.
- **The main chat can run at Sonnet medium here.** There is no scoring and no
  planning judgment to protect, so the effort guard does not apply to this lane.

---

## 5. Related

- Build the wiki first: [`/orc-wiki`](../templates/skills/orc-wiki/examples/wiki-run-mock.md)
- Cache the pattern first: [`/orc-pattern`](orc-pattern.md)
- Where it falls back to: [`/orc-mini`](../templates/skills/orc-mini/examples/mini-run-mock.md)
