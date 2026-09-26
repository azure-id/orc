---
description: Run the tests against the real running system — happy path to security — and report only what was observed
---

Use the **orc-test** skill. Standalone: no plan, no build, no code written into
your project. It RUNS the system; Phase 6.5 (`test-generator/`) writes tests and
never runs them. It never edits the system under test, and it never reports a
result it did not observe. The report is `orc/orc-test/<slug>/REPORT.md`; the
run folder is never staged. Read the state back with `orc test status <slug>`.

The slug to open or reopen (or nothing, and it will ask): $ARGUMENTS
