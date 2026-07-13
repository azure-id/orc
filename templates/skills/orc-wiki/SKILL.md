---
name: orc-wiki
description: >
  Build and maintain a persistent project knowledge base for ORC.
  Use for "/orc-wiki", "build the project wiki", "scan the codebase
  for a knowledge base". Scans the project with Opus 4.8 high and writes
  wiki/orc-feature-*, wiki/orc-reference-*, and orc-architecture-overview.md,
  then injects a pointer block into CLAUDE.md so future runs consult it.
  EXPENSIVE and often multi-session — always warns and gets explicit consent
  before scanning. Auto-branches: fresh start / resume / refresh. Reuses the
  orchestrator's checkpoint, stop-continue, and fresh-session resume.
---

# ORC-WIKI

A separate orchestrator whose OUTPUT is documentation, not code. It reuses the
main spine's machinery (checkpoint, state-of-play, stop-continue, fresh-session
resume, parallel dispatch, "orchestrator never scans-and-writes itself — it
always spawns") but has its own phases below.

**Worked example** (orient only — never execute from it): `examples/wiki-run-mock.md`.

It shares the run-folder
discipline: run artifacts in `.claude/skills/orc/run/{run-slug}/`,
but the KNOWLEDGE BASE output goes in the project's `wiki/` folder.

Run as Opus 4.8, high effort — orchestrator AND scanning agents. Cost is
accepted by design; the trade is knowledge-base QUALITY. This makes the consent
gate mandatory.

## Hard rules

1. **Never scan before explicit consent.** On a fresh run, show the generic
   cost warning and do NOTHING to the repo until the user says ok/continue/
   proceed. No pre-scan, not even to estimate area count.
2. **You never scan-and-write yourself — you spawn.** Scanning agents (Opus 4.8
   high) do the reading/summarizing; you plan, dispatch, and assemble.
3. **Fixed pause every 5 scan-tasks.** Not user-configurable. Multi-session
   resume via the inherited checkpoint.
4. **Wiki docs are persistent** in `wiki/` (project root). Run artifacts
   (checkpoint, state-of-play) stay in the run subfolder.
5. **Every doc carries staleness metadata** (see schemas/wiki-doc.md).
6. **CLAUDE.md gets a managed POINTER block only** — never inline summaries
   (keeps CLAUDE.md small; it loads into every context).
7. Usage: report the dispatch log + remind the user to run `/usage`. Never
   invoke `/usage` programmatically.
8. **Every scan/refresh ends by writing the freshness manifest + index.**
   Rewrite `.claude/orc/wiki-meta.json` (last_scan, scan_commit, branch, pages,
   discovered build/test `commands`, and the per-doc `docs` registry with each
   doc's `covers` + `covered_files` hashes — see references/staleness.md for
   the schema) and `wiki/INDEX.md` (one structured line per doc:
   `- <file> · <doc_type> · <status> — <one-line description> · kw: <k1, k2, k3>`).
   ONLY orc-wiki ever writes these two files — consumers compute freshness on
   read, never store it.
9. **Every scan/refresh passes the integrity self-check before it is done**
   (references/integrity-check.md): docs ↔ INDEX ↔ manifest registry ↔
   CLAUDE.md block must agree, `covers` must resolve, evidence anchors
   spot-verified. Emit `WIKI-CHECK` trace lines when logging is on.
10. **Docs are evidence-anchored (schema v2 — schemas/wiki-doc.md).** Contract
   sections cite the files they come from; a claim the scan agent can't anchor
   is omitted, not guessed. This is what makes the wiki a legitimate second
   source of truth (precedence: `code > fresh wiki > stale wiki (hints) >
   model priors` — staleness.md).

## Behavior trace (logging — same rule as orc/orc-mini; wiki runs trace too)

Resolve config at run start (`../orc/config.md` defaults + the
`.claude/orc.config.yaml` override): read `logging` + `log_dir`. When
`logging: true`, follow `../orc/references/trace-protocol.md` for the wiki's
phase set — WITHOUT this section the `orc-trace.js` hook has no run-pointer and
writes nothing, so a wiki run would produce no `.txt` at all:

- **Run start (after consent, before any dispatch):** create `log_dir`, write
  `log_dir/.current` = `<run-slug>-<DDMMYY>.txt`, and store
  `logging_enabled: true` + `trace_path` in the wiki checkpoint so a resumed
  session re-anchors to the SAME file. Emit a `PHASE` line at each wiki phase
  transition (entry → area-planning → scan → assemble).
- **Each scan/codifier dispatch:** announce the model derived from the agent
  NAME and emit `DISPATCH <agent> :: <area> expect=<model>/<effort>`. The hook
  writes the `SPAWN`/`RETURN` skeleton independently once `.current` exists.
- **Each return:** read `actual_model` + `actual_effort`, compare to expected,
  emit `VERIFY <area> actual=…/… ✅ MATCH` or `⛔ DOWNGRADE expected=…` and
  surface any downgrade to the user.
- **Stop sequence (5-task pause):** the trace file persists and `.current`
  STAYS in place across the pause — a resumed session appends to the same
  trace via the checkpoint's `trace_path` (re-write `.current` from it if
  missing).
- **Run end (Phase 3 done or abort):** emit `FINISH …` and delete
  `log_dir/.current`.

When `logging: false`, do NONE of this (the hook no-ops).

## Phase 0 — Entry & auto-branch (on /orc-wiki)

Detect state and branch:
- **Empty/absent `wiki/` AND no wiki checkpoint** → FRESH. Show the generic
  cost warning:
  > "Building the project knowledge base scans your code with Opus 4.8 high.
  >  This is expensive and will likely span multiple sessions (fixed pause
  >  every 5 areas). Nothing is scanned until you confirm. Proceed?"
  Wait for explicit ok/continue/proceed. Only THEN go to Phase 1.
- **Wiki checkpoint exists (mid-scan)** → RESUME. Re-anchor from state-of-play
  + checkpoint. Show "Resuming wiki scan: X of Y areas done, ~Z remaining."
  Light cost note, no full warning. Continue where it stopped.
- **Complete wiki, no active checkpoint** → REFRESH. Offer modes:
  **incremental (recommended when `wiki-meta.json` exists** — diff since
  `scan_commit`, re-scan only affected docs; a cheap delta pass) ·
  full regenerate · selective refresh of stale-flagged docs · pre-push
  git-diff scan · nothing. Each with its own cost note. Only scan on consent.

## Phase 1 — Area planning (after consent)

Infer the knowledge slicing from repo structure: directories, services,
modules, routes, domains — plus cross-cutting topics (auth, data model, API
conventions, deployment, build). Produce a scan plan: a list of scan-tasks,
each = one area/topic to document, with the files it covers. Show the plan
(areas, count, where the 5-task pauses fall). Doc types:
- `wiki/orc-feature-{x}-overview.md` — a feature/domain area
- `wiki/orc-reference-{topic}.md` — cross-cutting reference/convention
- `wiki/orc-architecture-overview.md` — the top-level map tying them together

**Standard cross-cutting reference docs** — plan these four as scan-tasks
whenever the project has the surface (they count toward the 5-task pause
cadence; SKIP any that don't apply — never fabricate one):
- `wiki/orc-reference-api-surface.md` — full route/endpoint inventory: method,
  path, handler file, owning area (the single best planning input for API work)
- `wiki/orc-reference-data-model.md` — cross-area DB/entity map: every
  table/model, owning area, key relations
- `wiki/orc-reference-glossary.md` — domain terms → meaning → where defined in
  code (kills the #1 cause of AI misreads: project jargon)
- `wiki/orc-reference-config-env.md` — every env var/config key: where read,
  default, effect

## Phase 2 — Scan (spawned agents, 5-task pauses)

Write checkpoint + state-of-play into the run subfolder BEFORE dispatching.
Per scan-task: spawn an Opus 4.8 high agent with the area's file list + the
doc-writing contract (schemas/wiki-doc.md — v2: evidence anchors mandatory in
contract sections, `keywords[]` + per-file `covered_files` hashes in the
return). The agent reads the code and returns a structured overview; YOU write
it to `wiki/` with staleness metadata. A return missing keywords/covered_files
or with unanchored contract sections is malformed (requeue).

Every 5 completed scan-tasks → STOP SEQUENCE (reuse the main skill's
`../orc/references/stop-and-resume.md`): checkpoint → state-of-play → dispatch report →
"/usage" reminder → resume block → wait for continue. Multi-session resume is
expected and normal.

## Phase 3 — Assemble & inject

1. After all areas are scanned (or the user stops), write/update
   `wiki/orc-architecture-overview.md` linking the feature + reference docs.
2. Write/update `wiki/INDEX.md` — one structured line per doc
   (`- <file> · <doc_type> · <status> — <one-line description> · kw: <k1, k2, k3>`,
   keywords from the doc header), so consumers select pages by reading ONE
   small file and matching on type + keywords, not just titles.
3. **Run the integrity self-check** (hard rule 9 — references/
   integrity-check.md): index-sync, registry-sync, covers-resolve, coverage
   report, counts-match, anchor spot-check. Fix failures before proceeding;
   emit `WIKI-CHECK` trace lines when logging.
4. Rewrite `.claude/orc/wiki-meta.json` (hard rule 8): fresh `last_scan` +
   `scan_commit` = current HEAD, page count, the project's discovered
   build/test `commands`, and the per-doc `docs` registry (schema in
   references/staleness.md).
5. Inject/update the managed pointer block in `CLAUDE.md`
   (see references/claude-md-injection.md). Pointer only — no summaries.
6. Final dispatch report + "/usage" reminder. Keep the checkpoint for audit.

## Code-pattern pre-warm (opt-in — only when config `orc_wiki_pattern_findings: on`)

Default OFF. When on, after Phase 3 also **codify the project's code-pattern for
every detected FE/BE language** as a byproduct of this scan — pre-warming
`.claude/orc/patterns/<lang>-pattern.md` so later `/orc` runs never hit the
`pattern_findings` prompt. This rides under the wiki's existing scan-consent, so
there is NO separate ask (that is why the config is on/off only, no `ask`).

Per detected language (see `../orc-pattern/references/INDEX.md`): dispatch
`orc-pattern-codifier-sonnet-5-high` with the generic playbook + the
most-recently-modified real files for that language; YOU write the returned pattern
to the cache. Never run tests or change project code. Skip languages already cached
and un-drifted. This reuses the `orc-pattern` engine — you never codify yourself.

## Refresh & staleness (references/staleness.md — THE canonical freshness reference)

- **Freshness is computed on read, never stored:** consumers measure
  `scan_commit` (from `wiki-meta.json`) against HEAD and get a tier —
  FRESH / AGING / STALE — with per-skill reactions. Only orc-wiki writes the
  manifest; nobody persists a status.
- Each doc also records the git hash of the files it covers at scan time
  (advisory per-doc signal). Stale = recorded hash ≠ current state.
- **Incremental refresh** (recommended): diff since `scan_commit`, match the
  drift against the manifest's `docs` registry, re-scan only the affected
  docs, rewrite the manifest. Includes the **coverage-gap sweep** (changed
  files no doc covers → propose new areas) and the **dead-doc sweep** (registry
  entries whose `covers` match nothing → archive/delete, user decides) — see
  staleness.md.
- Selective refresh: re-scan only stale-flagged docs the user picks.
- Refresh touching a v1 doc (no `wiki_schema: 2` header) upgrades it to
  schema v2 in place — lazy migration, never a forced full re-scan.
- Pre-push: scan the git diff, refresh docs for changed areas before commit.
- Auto-flag hook: after an orc/orc-mini run, flag (do NOT auto-scan) the wiki
  docs whose covered files changed — ONLY if `wiki/` exists and is non-empty.
  User confirms any re-scan. On BIG full-lane runs the post-ship refresh ask
  (see staleness.md) replaces the passive note.
