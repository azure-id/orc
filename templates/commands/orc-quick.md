---
description: Quick lane — look, ask once (questions + which agent), do. One numbered entry per request
---

Use the **orc-quick** skill. Three steps per request, one user turn:

1. **LOOK** (silent) — the graph first, then the files; PR comments if it is PR work.
2. **ASK** (one turn) — up to 3 grounded questions **plus** the dispatch gate. It
   always asks which agent. Nothing runs until you answer.
3. **DO** — dispatch, check the return, run the affected tests and then the
   suite, write the numbered entry, then offer tests / review / commit.

A **defect** is reproduced RED before it is fixed, and both runs are shown. A
gate line may carry `→ suggested` with its reason — a recommendation, never a
default.

Too big → an **offer** of `/orc-mini`. `gh` is read + push only. Another request
becomes entry 2, 3, 4 … in the same doc.

Request (or `pr <n>`, `thread=<name>`): $ARGUMENTS
