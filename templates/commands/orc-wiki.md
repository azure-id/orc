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

**`/orc-wiki crosslink`** → the CROSSLINK-ONLY branch (Phase 3c): publish this
repo's boundary tags + resolve what it consumes, reading the existing docs'
`Contracts & shapes` rows and only the files they anchor to. No area is
re-scanned and no doc is rewritten. Use this when there are no crosslink tags
yet — never a refresh.

Optional focus (or `crosslink`): $ARGUMENTS
