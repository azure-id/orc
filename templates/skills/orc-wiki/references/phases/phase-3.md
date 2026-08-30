# Phase — Phase 3 — Assemble & inject   (id: `phase-3`)

> **`/orc-wiki` phase file.** Moved out of `orc-wiki/SKILL.md` at v1.0.0 W14. The
> spine is loaded IN FULL when the skill activates; this is loaded when the phase
> fires — and a wiki run reaches FEW of them: Phase 0 auto-branches into fresh /
> resume / refresh / repair, and Phase 3c is a legacy backfill. ONE consumer, so
> it stays in this lane (`../../../_shared/phases/README.md`: a file with one
> consumer stays home). `orc lane phases orc-wiki --json` names the file.

<!-- orc:layer full -->

## Phase 3 — Assemble & inject

Phase 3 assembles the whole; it is NOT where registration or crosslink first
happen (both ran per scan-task — hard rules 8, 11). If the user stopped early,
the docs + tags are already registered and this phase simply hasn't run yet.

1. After all areas are scanned, write/update
   `wiki/orc-architecture-overview.md` linking the feature + reference docs. **OPTIONAL** — a wiki without one registers cleanly, and its CLAUDE.md pointer is conditional on the file existing.
2. **Derive `wiki/orc-orientation.md`** (references/orientation.md) from the
   already-written docs + the overview WHEN IT EXISTS (absent → say so in the doc; degrade explicitly, never silently) — NEVER a new scan
   area; one assemble-time write. Sections: Repo identity · Reading order · Journeys (each step
   anchored `file:line`; unanchored = omitted) · Neighbors (only when
   crosslink is configured AND the cache/atlas exists; else the explicit
   "no outward boundary"-style line). Standard doc header → registered by sync.
   Regenerate it (free, derived) whenever any doc it points to refreshes.
3. **Crosslink resolve + dead-tag sweep + ATLAS** (references/crosslink.md):
   publish already happened per scan-task (hard rule 11) — here only, if
   `.claude/orc-crosslink.config.yaml` exists, resolve consumed needs +
   `.claude/orc/crosslink/cache/` (warn on per-point drift), run the
   dead-tag sweep (references/staleness.md) — retire per-point ONLY tags whose
   anchor vanished; never bulk-delete `wiki/crosslink/` — then generate the
   federation atlas (`wiki/crosslink/atlas.md`) and write the SAME file into
   each linked repo (sanctioned peer FILE write — never commit/push, warn-only
   on failure; crosslink.md ATLAS section).
4. **Run `orc wiki sync`** (hard rule 8) — re-derives `wiki/INDEX.md` +
   `.claude/orc/wiki-meta.json` from every doc header, including the
   architecture + orientation docs and the `crosslink_provided` index of the
   per-scan-task tags (`atlas.md` is derived — sync never registers it). The
   build/test `commands` you discovered during the scan are the
   ONE thing no header carries: if the manifest's `commands` is absent or wrong,
   fix that key by hand — it is the only part of the manifest you ever touch.
5. **Run the integrity self-check** (hard rule 9 — references/
   integrity-check.md): registration (`sync --check`), covers-resolve,
   coverage, anchor + crosslink spot-checks, orientation pointers resolve.
   Runs AFTER sync (validates the derivation). Fix failures first; emit
   `WIKI-CHECK` when logging.
6. Inject/update the managed pointer block in `CLAUDE.md`
   (see references/claude-md-injection.md) — includes the orientation
   "read this first" pointer and, when crosslink is configured, the atlas
   pointer. Pointer only — no summaries; in-place block update, never
   duplicated.
7. Final report: lead with **✅ Wiki complete — all {M} areas scanned**
   (unmistakably distinct from a pause), then the dispatch log + "/usage"
   reminder. Keep the checkpoint for audit.

<!-- /orc:layer -->
