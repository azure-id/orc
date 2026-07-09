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

## Phase 2 — Scan (spawned agents, 5-task pauses)

Write checkpoint + state-of-play into the run subfolder BEFORE dispatching.
Per scan-task: spawn an Opus 4.8 high agent with the area's file list + the
doc-writing contract (schemas/wiki-doc.md). The agent reads the code and
returns a structured overview; YOU write it to `wiki/` with staleness metadata.

Every 5 completed scan-tasks → STOP SEQUENCE (reuse the main skill's
references/stop-and-resume.md): checkpoint → state-of-play → dispatch report →
"/usage" reminder → resume block → wait for continue. Multi-session resume is
expected and normal.

## Phase 3 — Assemble & inject

1. After all areas are scanned (or the user stops), write/update
   `wiki/orc-architecture-overview.md` linking the feature + reference docs.
2. Inject/update the managed pointer block in `CLAUDE.md`
   (see references/claude-md-injection.md). Pointer only — no summaries.
3. Final dispatch report + "/usage" reminder. Keep the checkpoint for audit.

## Refresh & staleness (references/staleness.md)

- Each doc records the git hash of the files it covers at scan time. Stale =
  recorded hash ≠ current state of those files.
- Selective refresh: re-scan only stale-flagged docs the user picks.
- Pre-push: scan the git diff, refresh docs for changed areas before commit.
- Auto-flag hook: after an orc/orc-mini run, flag (do NOT auto-scan) the wiki
  docs whose covered files changed — ONLY if `wiki/` exists and is non-empty.
  User confirms any re-scan.
