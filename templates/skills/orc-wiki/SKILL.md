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
resume, parallel dispatch, "never scans-and-writes itself — it always spawns")
with its own phases below, and shares the run-folder discipline: run artifacts
in `.claude/skills/orc/run/{run-slug}/`, KNOWLEDGE BASE output in the project's
`wiki/` folder. Run as Opus 4.8 high — orchestrator AND scanning agents; cost
is accepted by design (the trade is knowledge-base QUALITY), which is what
makes the consent gate mandatory.

**Worked example** (orient only — never execute from it): `examples/wiki-run-mock.md`.

## Hard rules

1. **Never scan before explicit consent.** On a fresh run, show the generic
   cost warning and do NOTHING to the repo until the user says ok/continue/
   proceed. No pre-scan, not even to estimate area count.
2. **You never scan-and-write yourself — you spawn.** Scanning agents (Opus
   4.8 high) read/summarize; you plan, dispatch, assemble.
3. **Fixed pause every 5 scan-tasks** — not user-configurable; multi-session
   resume via the inherited checkpoint.
4. **Wiki docs are persistent** in `wiki/` (project root); run artifacts stay
   in the run subfolder.
5. **Every doc carries staleness metadata** (schemas/wiki-doc.md).
6. **CLAUDE.md gets a managed POINTER block only** — never inline summaries
   (it loads into every context).
7. Usage: report the dispatch log + remind the user to run `/usage`; never
   invoke it programmatically.
8. **You NEVER hand-write the registration — you run `orc wiki sync`** (or
   `npx --no-install orc wiki sync`). `.claude/orc/wiki-meta.json` +
   `wiki/INDEX.md` are DERIVED from the docs' own headers — the CLI writes
   them deterministically. Run it **after every scan-task, at every pause,
   and at Phase 3** — never once at the end (a lane that pauses every 5 tasks
   BY DESIGN would otherwise strand unindexed docs; registering as you go
   makes a paused wiki a VALID wiki with partial coverage — **incomplete
   coverage ≠ unregistered, and only one of them is broken**). Consumers
   compute freshness on read, never store it. `orc` not on PATH → say so and
   continue; never hand-write the manifest (wrong is worse than absent).
9. **Every scan/refresh passes the integrity self-check before it is done**
   (references/integrity-check.md): docs ↔ INDEX ↔ manifest registry ↔
   CLAUDE.md block must agree, `covers` must resolve, evidence anchors
   spot-verified. Emit `WIKI-CHECK` trace lines when logging is on.
10. **Docs are evidence-anchored (schema v2 — schemas/wiki-doc.md).** Contract
   sections cite the files they come from; an unanchorable claim is omitted,
   never guessed — that is what makes the wiki a legitimate second source of
   truth (precedence: `code > fresh wiki > stale wiki (hints) > model priors`
   — staleness.md).
11. **Crosslink is ALWAYS ON, advisory, reads foreign WIKI only**
   (references/crosslink.md): publish is unconditional, PER SCAN-TASK — every
   scan/resume/refresh emits this repo's boundary as per-point tag files in the
   SAME pass (no boundary → reported via `crosslink_tags: none`; no
   enable/disable switch). The graph config
   (`.claude/orc-crosslink.config.yaml`) is needed ONLY for consume/resolve.
   NEVER reads a linked repo's source or writes in it; failures degrade to a
   warning.
12. **A refresh NEVER bulk-deletes `wiki/crosslink/**`** — tags overwrite
   per-point as re-scans land; a vanished point is retired ONLY by the dead-tag
   sweep (references/staleness.md). A vanishing surface trips the `orc wiki
   sync` N→0 tripwire (warning + `--check` exit 1) — a silent wipe is
   impossible.

## Behavior trace (PERMANENT — same rule as orc/orc-mini; wiki runs trace too)

Follow `../orc/references/trace-protocol.md` for the wiki's phase set: run
start (after consent) create `log_dir` + write `log_dir/.current` + store
`trace_path` in the wiki checkpoint (a resumed session re-anchors to the SAME
file); append AS THE RUN GOES — each phase's `PHASE` line BEFORE announcing
it, `DISPATCH <agent> :: <area>` per spawn, `VERIFY` per return
(`actual_model`/`actual_effort` vs expected — surface any ⛔ DOWNGRADE). A
phase or scan-task ending with
zero new trace lines is a protocol violation — go append them now. `.current` STAYS in place across the 5-task
pauses. Run end (Phase 3 done or abort): `FINISH …`, delete `log_dir/.current`.

## Phase 0 — Entry & auto-branch (on /orc-wiki)

**FIRST, always: run `orc wiki sync --check`** (read-only, instant, costs
nothing). It answers "is what's on disk registered?" before you branch on
anything else. If it reports out-of-sync, the REPAIR branch below takes
precedence over REFRESH — a wiki can be perfectly current and still unreadable.

Then detect state and branch:
- **`wiki/` has docs but registration is missing or drifted** → **REPAIR**
  (`orc wiki sync --check` exits non-zero; `orc wiki status` names it
  UNREGISTERED / corrupt / out-of-sync). The docs are fine; nothing indexed
  them. Do NOT offer a refresh or re-scan — both cost real money and neither
  is the problem. Offer the free fix ("I can register the {N} docs you
  already have: instant, free, nothing re-scanned, no doc changes. Fix it
  now?"); on consent run `orc wiki sync`, report, then re-branch below.
  **Never bundle a scan into repair.** REPAIR can coexist with RESUME (a
  paused scan is the usual cause): register first, THEN offer the resume as a
  separate, clearly-priced choice.
- **`/orc-wiki crosslink` (explicit), OR a LEGACY wiki (docs predate v0.24.0,
  `wiki/crosslink/` absent) whose docs show an outward boundary** →
  **CROSSLINK-ONLY** (Phase 3c) — a legacy BACKFILL: publish/resolve the
  boundary from existing docs, no re-scan, no doc rewrite. On a wiki scanned at
  ≥v0.24.0, missing tags are NOT this branch — the `orc wiki sync --check`
  boundary guard fired and already names the real fix. Auto-detect OFFERS it in
  one line with a small cost note; never start unasked.
- **Empty/absent `wiki/` AND no wiki checkpoint** → FRESH. Show the generic
  cost warning ("scans your code with Opus 4.8 high — expensive, likely
  multi-session, fixed pause every 5 areas; nothing scanned until you
  confirm") and wait for explicit consent. Only THEN Phase 1.
- **Wiki checkpoint exists (mid-scan)** → RESUME. Re-anchor from
  state-of-play + checkpoint; show "X of Y areas done, ~Z remaining"; light
  cost note; continue where it stopped.
- **Complete wiki, no active checkpoint** → REFRESH. Offer: **incremental
  (recommended when `wiki-meta.json` exists** — diff since `scan_commit`,
  re-scan only affected docs) · full regenerate · selective (stale-flagged
  docs) · pre-push git-diff scan · nothing — each with a cost note; scan only
  on consent. Every mode re-publishes crosslink tags in the same pass (hard
  rule 11) and preserves the folder (rule 12) — a refresh never loses tags. A
  LEGACY wiki with unpublished tags is a backfill, not a refresh — route to
  CROSSLINK-ONLY.

## Phase 1 — Area planning (after consent)

Infer the knowledge slicing from repo structure (directories, services,
modules, routes, domains) plus cross-cutting topics (auth, data model, API
conventions, deployment, build). Produce a scan plan: scan-tasks, each = one
area/topic with the files it covers. Show the plan (areas, count, where the
5-task pauses fall). Doc types:
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
doc-writing contract (schemas/wiki-doc.md — v2: evidence anchors in contract
sections, `keywords[]` + per-file `covered_files` hashes, AND `crosslink_tags`
= one tag body per OUTWARD boundary point in the area's files, or `none`+reason).
YOU write BOTH the doc (to `wiki/`, staleness metadata) AND its tags (to
`wiki/crosslink/<kind>/<slug>.md`, schemas/crosslink-tag.md), then run
**`orc wiki sync`** (hard rule 8) — docs and boundary are indexed from the first
scan-task on, however the run ends; the boundary accumulates in the SAME pass as
the docs (hard rule 11), so a paused run has a live partial boundary. A return
missing keywords/covered_files/`crosslink_tags`, or with unanchored contract
sections, is malformed (requeue). Trace each scan-task's `DISPATCH`/`VERIFY`
with a `tags:N` count (or `tags:none`).

Every 5 completed scan-tasks → STOP SEQUENCE
(`../orc/references/stop-and-resume.md`): checkpoint → state-of-play →
dispatch report → "/usage" reminder → resume block → wait for continue.
Multi-session resume is expected and normal.

**A pause must never read as a finish.** The stop sequence looks exactly like
Phase 3's completion report, and users have walked away from a half-scanned
repo believing it was done. At every pause, lead with the coverage line:
> ⏸ **PAUSED — not finished.** {N} of {M} areas scanned, {M−N} remaining.
> The {N} docs so far are registered and usable now. Reply **continue** to scan
> the rest.
At completion, say **✅ Wiki complete — all {M} areas scanned.** The two must be
impossible to confuse at a glance.

## Phase 3 — Assemble & inject

Phase 3 assembles the whole; it is NOT where registration or crosslink first
happen (both ran per scan-task — hard rules 8, 11). If the user stopped early,
the docs + tags are already registered and this phase simply hasn't run yet.

1. After all areas are scanned, write/update
   `wiki/orc-architecture-overview.md` linking the feature + reference docs.
2. **Crosslink resolve + dead-tag sweep** (references/crosslink.md): publish
   already happened per scan-task (hard rule 11) — here only, if
   `.claude/orc-crosslink.config.yaml` exists, resolve consumed needs +
   `.claude/orc/crosslink/cache/` (warn on per-point drift), then run the
   dead-tag sweep (references/staleness.md) — retire per-point ONLY tags whose
   anchor vanished; never bulk-delete `wiki/crosslink/`.
3. **Run `orc wiki sync`** (hard rule 8) — re-derives `wiki/INDEX.md` +
   `.claude/orc/wiki-meta.json` from every doc header, including the
   architecture doc from step 1 and the `crosslink_provided` index of the
   per-scan-task tags. The build/test `commands` you discovered during the scan are the
   ONE thing no header carries: if the manifest's `commands` is absent or wrong,
   fix that key by hand — it is the only part of the manifest you ever touch.
4. **Run the integrity self-check** (hard rule 9 — references/
   integrity-check.md): registration (`sync --check`), covers-resolve,
   coverage, anchor + crosslink spot-checks. Runs AFTER sync (validates the
   derivation). Fix failures first; emit `WIKI-CHECK` when logging.
5. Inject/update the managed pointer block in `CLAUDE.md`
   (see references/claude-md-injection.md). Pointer only — no summaries.
6. Final report: lead with **✅ Wiki complete — all {M} areas scanned**
   (unmistakably distinct from a pause), then the dispatch log + "/usage"
   reminder. Keep the checkpoint for audit.

## Phase 3c — CROSSLINK-ONLY (legacy backfill: publish/resolve, NO area scan)

Entry: `/orc-wiki crosslink`, or the Phase 0 CROSSLINK-ONLY branch. A LEGACY
BACKFILL — for wikis whose docs predate v0.24.0 (docs exist, `wiki/crosslink/`
absent); the boundary is already on disk in the docs' `Contracts & shapes` rows.
On a ≥v0.24.0 wiki tags publish per scan-task, so missing tags mean the
`orc wiki sync --check` boundary guard fired — not this branch. **Never a
re-scan.** **Consent** is small and honest, NOT the scan warning: "reads
existing docs' rows, opens only the {N} anchored files, no repo scan, no doc
changes. Proceed?" (Prereq: `wiki/` has docs.)

**Steps:** collect boundary points from the docs' `Contracts & shapes` rows
(read DOCS, not source) → dispatch Opus 4.8 high over the anchored files ONLY
(tag bodies per schemas/crosslink-tag.md; unanchorable row = SKIPPED + reported)
→ write `wiki/crosslink/<kind>/<slug>.md` → resolve the consume half when
`.claude/orc-crosslink.config.yaml` exists → `orc wiki sync` → crosslink
integrity (`WIKI-CHECK crosslink …`). **Never** re-scan, rewrite a doc, or touch
coverage/`pages` — coverage is a scan question; the boundary is not.

**Zero-tag outcome is always explicit + reasoned, never a bare finish:** rows
too thin/absent to tag → SAY so + recommend an incremental refresh of just those
areas (an honest cost, not "never a refresh"); pure consumer (inbound-only, no
API of its own) → valid no-op but NAME the inbound-only edges (references/crosslink.md).

## Code-pattern pre-warm (opt-in — only when config `orc_wiki_pattern_findings: on`)

Default OFF. When on, after Phase 3 codify the code-pattern for every detected
FE/BE language as a scan byproduct (no separate ask — rides the scan consent).
Load `references/pattern-prewarm.md` when the flag is on.

## Crosslink — cross-repo boundary publish + resolve (references/crosslink.md)

ALWAYS ON (hard rules 11–12), two advisory halves — full procedure in
references/crosslink.md. **Publish** rides each scan-task (tag files under
`wiki/crosslink/<kind>/<slug>.md`; sync derives `crosslink_provided` from their
headers; tags stay OUT of `wiki/INDEX.md`). **Resolve** (only with
`.claude/orc-crosslink.config.yaml`) records consumed deps in
`.claude/orc/crosslink/needs.json` + the gitignored `.claude/orc/crosslink/
cache/`; per-point drift warns, never gates. Emit `WIKI-CHECK crosslink …`.

## Refresh & staleness (references/staleness.md — THE canonical freshness reference)

Freshness is computed on read, never stored: measure `scan_commit` (from
`wiki-meta.json`) against HEAD → FRESH / AGING / STALE. Only orc-wiki writes the
manifest (via `orc wiki sync`). Refresh modes (incremental with the coverage-gap
+ dead-doc + dead-tag sweeps · selective · pre-push), the per-doc
`covered_files` signal, lazy `wiki_schema: 2` upgrades, and auto-flag /
post-ship refresh-ask all live in staleness.md — load it, never act from memory.
