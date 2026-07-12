---
description: Build/update/refresh the LOCAL project's CLAUDE.md — scanned facts, fenced sections, 0.0.1 version bumps, zero questions
---

Use the **orc-claude** skill independently (no orchestrator): build, update,
or refresh the **local repo's** `CLAUDE.md` from verified repo facts. Auto
mode: meta header present → section-scoped REFRESH (+0.0.1 bump, DD-MM-YYYY);
foreign CLAUDE.md → back up to `CLAUDE.md.bak` and merge without trimming a
single user line; missing → create fresh. Fully non-interactive — P0/Gotchas/
Glossary are placeholders the user fills themself. Default generated-content
budget 400 lines (`budget=N` to override, persisted). Never touches the
orc-wiki block.

Optional arguments (e.g. `budget=600`): $ARGUMENTS
