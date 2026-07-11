---
description: Learn & cache the project's real code conventions per language — reconciles a generic playbook against your actual files so ORC executors match your house style
---

Use the **orc-pattern** skill. Start at Phase 0: detect the project's
frontend/backend languages, then branch per language (cache miss → codify; cache
hit + no drift → report and skip; cache hit + drift → auto-refresh). Dispatch the
`orc-pattern-codifier-sonnet-5-high` subagent to reconcile the generic playbook
against the most-recently-modified real files (project conventions win; invariants
always kept; conflicts flagged), then write `.claude/orc/patterns/<lang>-pattern.md`.
Never run tests or change project code. Follow the skill's SKILL.md exactly.

Optional: a language name to codify just that one, or `--refresh` to force
re-codification. $ARGUMENTS
