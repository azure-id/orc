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

**`/orc-wiki crosslink compile`** → the one-shot CROSSLINK COMPILE branch
(v0.33.0 — references/crosslink-compile.md): resolve/consume from the graph →
generate the federation atlas (`wiki/crosslink/atlas.md`) → write it into each
linked repo → inject/update the CLAUDE.md pointer block locally and in each
linked repo (in-place, user content byte-preserved). Requires a crosslink
config with ≥1 edge; every step warn-only; never a re-scan. Peer writes are
FILE writes only — never a commit or push.

| Argument | Branch |
|---|---|
| *(none)* | Phase 0 auto-branch: repair / fresh / resume / refresh (delta default) |
| `crosslink` | Phase 3c legacy backfill (publish tags from existing docs) |
| `crosslink compile` | one-shot resolve + atlas + CLAUDE.md injection (local + peers) |

Optional focus (or `crosslink` / `crosslink compile`): $ARGUMENTS
