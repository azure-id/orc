---
name: orc-verify
description: >
  Standalone verification for ORC. Use for "verify my changes",
  "/orc-verify", or "check the modified files". Runs INDEPENDENTLY —
  no orchestrator, no planning, no run folder required. Verifies only the
  git-modified changes in the working tree and shows a summary of results. Uses
  Opus 5.5 medium effort. Read-only: it reports, it does not fix or commit.
---

# ORC-VERIFY (standalone)

A focused, dependency-free verify pass. No intake, no planning, no checkpoint —
you point it at your uncommitted work and it tells you what's wrong.

Run as Opus 5.5, medium effort.

**Worked example** (orient only — never execute from it): `examples/verify-mock.md`.

## Procedure

1. **Gather the change surface** from git: `git diff --name-only` (unstaged +
   staged) and, if useful, `git diff` for the actual hunks. Scope is ONLY the
   modified/added files — do not review the whole repo.
2. **Detect the stack** (package manager, test runner) from the repo.
   If a cached pattern exists for a changed file's language — test it with the
   deterministic probe `orc pattern status <lang>` (exit 0 = cached; see
   `../_shared/detecting-artifacts.md`, never an ad-hoc `find` for
   `.claude/orc/patterns/<lang>-pattern.md`) — read its Invariants +
   Validation-gate sections and check the diff against them too (an invariant
   violation or unmet enforceable gate line is P0). No cached pattern → skip
   silently, never codify from here.
3. **Verify the changes:**
   - Run the build if one exists; capture failures.
   - Run the tests that cover the changed files (or the full suite if scoping
     isn't clean); capture failures.
   - Check the diff for obvious breakage: broken imports, references to removed
     symbols, unhandled errors introduced, type errors.
   - **Adversarial pass (v0.33.0):** attack the diff the way the pipeline's
     Phase 6 does — edge cases the change ignores (empty/zero/max, unicode),
     error paths (each external call's failure), contract violations (response
     shapes/status codes vs consumers), race/ordering on shared state, and
     workflow breaks (dead wiring, broken commands). Same evidence rule.
4. **Classify findings** on the P0–P3 severity ladder (same rule as the full
   skill: P0 = failing build/tests, broken references, runtime errors ·
   P1 = correctness/security risk · P2 = maintainability · P3 = cosmetic).
   P0/P1 mean NOT ready to commit; P2/P3 are advisory. **Evidence-or-advisory
   (same rule as the full pipeline):** every P0–P2 finding carries `file:line`
   + the offending line(s) quoted VERBATIM from a file read this session; a
   finding that can't be anchored is AUTO-P3 and never gates the verdict.
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

## Behavior trace (always on)

`../_shared/phases/trace.md` (`core`, at run start; `orc lane phases orc-verify --json` →
`trace_grammar` gives the verbs). Lane token `verify`, tier
**Single-dispatch**. At run start write `log_dir/.current` =
`run-verify-<slug>-<DDMMYY>-<HHMMSS>.txt` AND `touch the trace file` of that name
in the SAME step. A phase that ends with `zero new trace lines is a protocol violation`.

## Boundaries

- **Read-only.** Never edit, stage, commit, or push. Report only.
- **Independent.** Requires no orchestrator, no run folder, no intent-spec.
- If there are no git changes, say so and stop.
- Reminder: to see usage limits, tell the user to run `/usage` (never invoke it
  programmatically).

## Lane contract (`../_shared/lane-contract.md` — read it ONLY when a call exits ≠ 0)

- **Calls:** `orc lane calls orc-verify --json` names shared calls and exit codes.
  **An exit code is an ANSWER where it says so, not a failure.** Own calls are here; make no other.
- **Config:** `orc lane config orc-verify --json`. Obey `effective`. Never merge
  `.claude/orc.config.yaml` yourself (`../_shared/config-precedence.md`). Nothing
  here is contested, gated or a stop: no preflight line, no gate to honour.
- **Rules:** `orc rules slice --lane orc-verify --json` is the ONLY assembler
  (`../_shared/phases/rules.md`). Its `line` prints VERBATIM at preflight.

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **none** · safe point **single dispatch**.
