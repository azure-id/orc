---
description: Run your CLI-composed custom ORC flow (hard-gated — needs `orc diy init` + `orc diy compile` first; stale/unconfigured offers plain /orc)
---

Use the **orc-diy** skill. Start at Step 0/1: if the argument is `compile`
(or `status`), route it to the `orc diy` CLI and relay. Otherwise run the
hard gate (`orc diy status`): UNCONFIGURED or STALE → explain the CLI fix and
offer the regular /orc lane (one question, never silent); READY → dispatch
the compiled flow at `.claude/orc/diy/FLOW-COMPILED.md` as the orchestrator
spine. Flow shape is configured only via the `orc diy` CLI — never
in-session.

Request: $ARGUMENTS
