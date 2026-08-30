# Phase — Phase 2 — Scan (spawned agents, 5-task pauses)   (id: `phase-2`)

> **`/orc-wiki` phase file.** Moved out of `orc-wiki/SKILL.md` at v1.0.0 W14. The
> spine is loaded IN FULL when the skill activates; this is loaded when the phase
> fires — and a wiki run reaches FEW of them: Phase 0 auto-branches into fresh /
> resume / refresh / repair, and Phase 3c is a legacy backfill. ONE consumer, so
> it stays in this lane (`../../../_shared/phases/README.md`: a file with one
> consumer stays home). `orc lane phases orc-wiki --json` names the file.

<!-- orc:layer full -->

## Phase 2 — Scan (spawned agents, 5-task pauses)

Write checkpoint + state-of-play into the run subfolder BEFORE dispatching.
**Resolve the scan TIER per task first** (`wiki_scan_tier`, default `ladder`;
`wiki_tier_deep_files`, default 3 — full ladder in references/partial-refresh.md):
first scan · STRUCTURAL · wide delta · a new exported symbol → **deep**; otherwise
**light** (`orc-wiki-scanner-sonnet-5-high`). `always_deep` restores the old
behaviour, `opus5_only` collapses BOTH tiers onto `orc-wiki-scanner-opus-5-med`
(no new pair). **PRINT the resolved tier** — a cheaper model is never a quiet
substitution. **Extra (`extra_enabled`) reaches the SCANNER ONLY, and it is a POSITION per tier** — `wiki-scanner-deep` / `wiki-scanner-light`, held by `orc extra role` and resolved for the tier JUST PICKED. The resolved tier already prints; PRINT ITS TARGET with it. Load `../extra.md` at the scan phase when the gate is on; `orc wiki sync` never routes foreign (registration is CLI-derived — there is no model in it to replace). A wiki doc is evidence-anchored and cheap to re-scan, which is what makes the scanner the one role here worth handing over; `orc wiki sync` never routes foreign (registration is CLI-derived — there is no model in it to replace). `wiki_refresh_budget` (0 = no cap) caps scan-tasks per run as a
PLANNED stop, and `wiki_retire_after_runs` (0 = never) offers — never performs —
retirement of a doc no run has sliced.
Per scan-task: spawn `orc-wiki-scanner-opus-4-8-high` BY NAME (`orc-wiki-scanner-opus-5-med` under `opus5_only`, `orc-wiki-scanner-sonnet-5-high` at the light tier) with the area's file list + the
doc-writing contract (schemas/wiki-doc.md — v2: evidence anchors in contract
sections, `keywords[]` + per-file `covered_files` hashes, AND `crosslink_tags`
= one tag body per OUTWARD boundary point in the area's files, or `none`+reason)
**+ the kind catalog** (references/crosslink-kinds.md — an agent never shown it cannot "prefer an existing kind", and a near-synonym like `route` beside `rest-endpoint` is a PERMANENT duplicate: refresh never bulk-deletes).
YOU write BOTH the doc (to `wiki/`, staleness metadata) AND its tags (to
`wiki/crosslink/<kind>/<slug>.md` — the kind DIRECTORY sanitizes `/`→`-`, the header keeps it verbatim; schemas/crosslink-tag.md), then run
**`orc wiki sync`** (hard rule 8) — docs and boundary are indexed from the first
scan-task on, however the run ends; the boundary accumulates in the SAME pass as
the docs (hard rule 11), so a paused run has a live partial boundary. A return
missing keywords/covered_files/`crosslink_tags`, or with unanchored contract
sections, is malformed (requeue). Trace each scan-task's `DISPATCH`/`VERIFY`
with a `tags:N` count (or `tags:none`).

Every 5 completed scan-tasks → STOP SEQUENCE
(`../../../_shared/phases/stop-resume.md`): checkpoint → state-of-play →
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

<!-- /orc:layer -->
