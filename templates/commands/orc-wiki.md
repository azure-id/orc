---
description: Build/maintain the project knowledge base (wiki) — Opus 4.8 high, expensive, multi-session, warns before scanning
---

Use the **orc-wiki** skill. Start at Phase 0: auto-detect whether this is a
repair of an unregistered wiki, a fresh build, a resume of an in-progress scan,
or a refresh of an existing wiki, and branch accordingly. On a fresh build, show
the cost warning and scan NOTHING until the user explicitly confirms. Refreshes
also sweep for coverage gaps (changed files no doc covers → propose new areas)
and dead docs (covered files gone → archive/delete, user decides). Every run
registers via `orc wiki sync` and ends with the integrity self-check. Follow the
skill's SKILL.md exactly.

**Crosslink is always on.** Plain `/orc-wiki` — every scan, resume, incremental,
full regenerate, or selective refresh — publishes/updates this repo's boundary
tags (`wiki/crosslink/`) in the SAME pass as the docs, and a refresh never
deletes them. There is no separate "generate crosslink" step in a wiki's normal
life; the only crosslink config is the graph (`orc crosslink`), needed only to
resolve what this repo consumes.

**`/orc-wiki crosslink`** → the CROSSLINK-ONLY branch (Phase 3c) is a LEGACY
BACKFILL: publish tags + resolve consumption from the existing docs'
`Contracts & shapes` rows (opening only the files they anchor), for wikis whose
docs predate v0.24.0 and so have no `wiki/crosslink/` yet. No area is re-scanned,
no doc rewritten. On a wiki scanned at ≥v0.24.0, missing tags are not this
branch — `orc wiki sync --check` names the real fix. Never a refresh.

Optional focus (or `crosslink`): $ARGUMENTS
