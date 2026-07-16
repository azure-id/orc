# Reference — Wiki Consult (shared by orc / orc-mini / orc-fast)

The ONE canonical description of how a lane grounds itself in the project wiki.
Load at the consult point (full/mini: Phase 1 planning; fast: F0 gate + F2
slice-build). The lane spines keep only the trigger, the precedence line, and
the `WIKI-CONSULT` emit rule — this file is the mechanism.

## Trigger

If `wiki/` exists AND has > 0 files. Empty or absent → ignore it and proceed
as normal (the wiki is purely additive); emit `WIKI-CONSULT absent :: docs=none`
(or `empty`) and move on.

## Step 1 — Compute the freshness tier (never stored, always computed)

Read `.claude/orc/wiki-meta.json` and compute
`git rev-list --count <scan_commit>..HEAD` → **FRESH / AGING / STALE** per
`../../orc-wiki/references/staleness.md` (the canonical tier rules; tier edges
come from config `wiki_fresh_max` / `wiki_aging_max`). Manifest absent while
docs are present = STALE-with-notice. Reactions:

- **FRESH** → consult silently.
- **AGING** → one-line notice, then consult.
- **STALE** → prominent warning but continue (full/mini self-ground against
  code; orc-fast instead gates on this — see its F0 preflight).

## Step 2 — Select and pull pages

Select pages via `wiki/INDEX.md` when it exists — one line per doc: type,
status, description, keywords; match the request against **keywords**, not just
titles. Read the relevant `wiki/orc-feature-*`, `wiki/orc-reference-*`, and
`wiki/orc-architecture-overview.md` for the areas in play.

**What to pull (v2 wikis):**
- each doc's `TL;DR` — cheap orientation;
- `Contracts & shapes` — file-anchored routes/tables/events/config;
- `Testing map` — where the area's tests live;
- the cross-cutting maps when the task touches their domain:
  `orc-reference-api-surface` (endpoint inventory) for API work,
  `orc-reference-data-model` for schema work, `orc-reference-glossary`
  whenever the request uses project jargon, `orc-reference-config-env` for
  config/env work.

**Lane delta — orc-fast passes POINTERS, not content:** fast selects 1–3 page
PATHS from `wiki/INDEX.md` and puts the paths in the executor slice with the
instruction to READ them first (TL;DR for orientation, `Contracts & shapes` for
specifics). Fast never pastes wiki bodies into a slice (a Sonnet-medium
orchestrator curating wiki prose defeats the lane). Full/mini read the content
themselves at planning time.

## Step 3 — Precedence (everywhere the wiki is consumed)

`code > fresh wiki > stale wiki (hints) > model priors`

Prefer `status: fresh` docs; treat `stale` ones as hints to verify against
code; on ANY wiki-vs-code conflict the code wins.

## Step 4 — Emit the grounding record

**Emit `WIKI-CONSULT <tier> :: docs=<pages pulled, comma list>`** — one trace
line recording the freshness tier (`fresh`/`aging`/`stale`, or
`absent`/`empty` with `docs=none`) and which wiki pages grounded this run.

## Scoring bonus (full lane, Phase 2)

If a non-empty `wiki/` is present, use its overviews' "Notes for planning" to
inform the core/isolated and risk scoring factors — the wiki makes these scores
sharper than inference alone.

## Crosslink injection (cross-repo, advisory — same consult point)

If `.claude/orc/crosslink/needs.json` exists and a task's declared files touch
a matching boundary call site, inject the cached linked contract into that
task's slice as `crosslink` — labeled with its effective cross-repo tier +
"hints, not verified" — the same slice mechanism as `pattern`. Precedence
extends the local rule: cross-repo can NEVER outrank local code or local wiki
hints; it never blocks. Absent needs file or no boundary → nothing extra.

## Post-run stale-flag (all lanes that changed code)

After a run that changed code, flag (do NOT re-scan) any wiki docs whose
covered files this run changed and point the user at `/orc-wiki`. Mini/fast
keep this passive note only; the full/ultra post-ship refresh ASK is defined in
`../../orc-wiki/references/staleness.md`.
