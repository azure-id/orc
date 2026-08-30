# Phase — Phase 3c — CROSSLINK-ONLY (legacy backfill: publish/resolve, NO area scan)   (id: `phase-3c`)

> **`/orc-wiki` phase file.** Moved out of `orc-wiki/SKILL.md` at v1.0.0 W14. The
> spine is loaded IN FULL when the skill activates; this is loaded when the phase
> fires — and a wiki run reaches FEW of them: Phase 0 auto-branches into fresh /
> resume / refresh / repair, and Phase 3c is a legacy backfill. ONE consumer, so
> it stays in this lane (`../../../_shared/phases/README.md`: a file with one
> consumer stays home). `orc lane phases orc-wiki --json` names the file.

<!-- orc:layer full -->

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

<!-- /orc:layer -->
