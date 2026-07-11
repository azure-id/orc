---
name: orc-verify
description: >
  Standalone verification for ORC. Use for "verify my changes",
  "/orc-verify", or "check the modified files". Runs INDEPENDENTLY —
  no orchestrator, no planning, no run folder required. Verifies only the
  git-modified changes in the working tree and shows a summary of results. Uses
  Opus 4.8 high effort. Read-only: it reports, it does not fix or commit.
---

# ORC-VERIFY (standalone)

A focused, dependency-free verify pass. No intake, no planning, no checkpoint —
you point it at your uncommitted work and it tells you what's wrong.

Run as Opus 4.8, high effort.

**Worked example** (orient only — never execute from it): `examples/verify-mock.md`.

## Procedure

1. **Gather the change surface** from git: `git diff --name-only` (unstaged +
   staged) and, if useful, `git diff` for the actual hunks. Scope is ONLY the
   modified/added files — do not review the whole repo.
2. **Detect the stack** (package manager, test runner) from the repo.
3. **Verify the changes:**
   - Run the build if one exists; capture failures.
   - Run the tests that cover the changed files (or the full suite if scoping
     isn't clean); capture failures.
   - Check the diff for obvious breakage: broken imports, references to removed
     symbols, unhandled errors introduced, type errors.
4. **Classify findings** on the P0–P3 severity ladder (same rule as the full
   skill: P0 = failing build/tests, broken references, runtime errors ·
   P1 = correctness/security risk · P2 = maintainability · P3 = cosmetic).
   P0/P1 mean NOT ready to commit; P2/P3 are advisory.
5. **Show a summary** and STOP. This skill does not fix, stage, or commit.

## Output (summary)

```
ORC-VERIFY — <n> files changed
Build: <pass/fail/none>   Tests: <x/y passing>
P0/P1 (gate — fix before commit):
  - <P0|P1> <file:loc> <issue>
P2/P3 (advisory):
  - <P2|P3> <file:loc> <issue>
Verdict: <READY / NEEDS FIXES>
```

## Boundaries

- **Read-only.** Never edit, stage, commit, or push. Report only.
- **Independent.** Requires no orchestrator, no run folder, no intent-spec.
- If there are no git changes, say so and stop.
- Reminder: to see usage limits, tell the user to run `/usage` (never invoke it
  programmatically).
