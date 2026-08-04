---
description: Quick lane for almost anything — look, ask once, dispatch. Always asks which agent. Saves every request as a numbered entry in orc-quick/<slug>/quick-context.md
---

Use the **orc-quick** skill. It is standalone — not part of the `/orc` pipeline,
and no config key can change how it dispatches.

Three steps per request, one user turn:

1. **LOOK** (silent) — check the wiki and code-pattern if they exist (never a
   blocker), find the files, read the PR comments if this is PR work, and note
   anything the user already decided.
2. **ASK** (one turn) — up to 3 grounded questions *plus* the dispatch gate in
   the same turn. **The gate is hard: always ask which agent to dispatch.**
   Code work offers `orc-executor-sonnet-4-6-med` or `orc-executor-opus-5-low`;
   read-only work offers an ad-hoc model + effort.
3. **DO** — dispatch, check the return, run build/tests if they exist, write the
   numbered entry to `orc-quick/<slug>/quick-context.md`, then offer tests /
   review / commit.

Not only for code: a quick context dig, a defect hunt, a dependency bump, or
fixing PR review comments all run the same way. A request that turns out too big
gets an **offer** of `/orc-mini` — never a forced fallback.

No smoke gate. A red build starts a repair loop (2 rounds reuse the executor,
round 3 asks again, then it asks what to do). Red tests stop the commit offer but
never loop. No test suite means no check at all.

`gh` is read + push only — never a comment, never a resolve, never a merge.

Ask for a new request any time and it becomes entry 2, 3, 4 … in the same doc.

Request (or `pr <n>`, `thread=<name>`): $ARGUMENTS
