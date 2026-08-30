# Phase — Phase 0 — Entry & auto-branch (on /orc-wiki)   (id: `phase-0`)

> **`/orc-wiki` phase file.** Moved out of `orc-wiki/SKILL.md` at v1.0.0 W14. The
> spine is loaded IN FULL when the skill activates; this is loaded when the phase
> fires — and a wiki run reaches FEW of them: Phase 0 auto-branches into fresh /
> resume / refresh / repair, and Phase 3c is a legacy backfill. ONE consumer, so
> it stays in this lane (`../../../_shared/phases/README.md`: a file with one
> consumer stays home). `orc lane phases orc-wiki --json` names the file.

<!-- orc:layer full -->

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
- **`/orc-wiki crosslink compile` (explicit)** → **CROSSLINK COMPILE**
  (references/crosslink-compile.md) — one-shot: resolve/consume → generate the
  LOCAL atlas → write it into each linked repo → inject the CLAUDE.md pointer
  block locally AND in each peer (in-place, byte-preserving). Hard
  precondition: a crosslink config with ≥1 edge (else explain `orc crosslink`
  and stop). Each step warn-only; never a re-scan, never a doc rewrite; one
  end-of-run trace packet.
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
- **`/orc-wiki refresh <doc> | --only <glob> | --top N | --all-touched`
  (explicit)** → **TARGETED REFRESH** (references/partial-refresh.md). Skips
  branch detection AND area planning — the doc exists, so its coverage area is
  already in its own header. Probe with `orc wiki plan --json` (free, ranked,
  priced), confirm the doc + delta + resolved TIER + estimate in ONE turn, scan,
  `orc wiki sync`, integrity-check that doc. **Free repairs are always offered
  before anything that costs money** — sync, then the orientation doc, then a
  crosslink backfill, and only then a paid scan.
- **Complete wiki, no active checkpoint** → REFRESH. **Run `orc wiki impact`
  FIRST** (deterministic probe — exit 0 clean / 2 delta / 3 full recommended;
  staleness.md mode 1). **Delta is the default path**: on exit 2, offer to
  re-scan only the TOUCHED docs; on exit 3, present the impact table and let
  the user choose (never silently full). Other modes on request: full
  regenerate · selective (stale-flagged docs) · pre-push git-diff scan ·
  nothing — each with a cost note; scan only on consent. Every mode
  re-publishes crosslink tags in the same pass (hard rule 11), preserves the
  folder (rule 12), and ends by regenerating the orientation doc + atlas
  (derived, cheap). A LEGACY wiki with unpublished tags is a backfill, not a
  refresh — route to CROSSLINK-ONLY.

<!-- /orc:layer -->
