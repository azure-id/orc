# Reference — Wiki Consult (shared by orc / orc-mini / orc-fast)

The ONE canonical description of how a lane grounds itself in the project wiki.
Load at the consult point (full/mini: Phase 1 planning; fast: F0 gate + F2
slice-build). The lane spines keep only the trigger, the precedence line, and
the `WIKI-CONSULT` emit rule — this file is the mechanism.

## Trigger

Does a wiki exist? Decide with the deterministic probe in
`../../_shared/detecting-artifacts.md` — run `orc wiki status`, never an ad-hoc
`find` (`.claude` is hidden, so a raw search false-negatives a generated wiki).
`none` → ignore it and proceed as normal (the wiki is purely additive); emit
`WIKI-CONSULT absent :: docs=none` (or `empty`) AND print the one user-visible
line `wiki: absent — running without knowledge base (build one with /orc-wiki)`,
then move on. Any other state = wiki present → continue below.

## Step 1 — Compute the freshness tier (never stored, always computed)

Read `.claude/orc/wiki-meta.json` and compute
`git rev-list --count <scan_commit>..HEAD` → **FRESH / AGING / STALE** per
`../../orc-wiki/references/staleness.md` (the canonical tier rules; tier edges
come from config `wiki_fresh_max` / `wiki_aging_max`). Manifest absent while
docs are present = STALE-with-notice. **Every tier prints exactly ONE
user-visible line at the consult point** (no tier is silent — the user must
always know whether the run is grounded and how fresh):

- **FRESH** → `wiki: FRESH — N docs consulted`, then consult.
- **AGING** → `wiki: AGING — consulted with caution (refresh recommended)`,
  then consult.
- **STALE** → `wiki: STALE — hints only; code wins (run /orc-wiki refresh)`,
  then continue (full/mini self-ground against code; orc-fast instead gates on
  this — see its F0 preflight).

## Step 2 — Select and pull pages (orientation FIRST)

**When `wiki/orc-orientation.md` exists, read it FIRST** (v0.33.0 — the wiki's
front door): its `Repo identity` orients, its `Reading order` says which docs
to dive into and why, its `Journeys` trace the end-to-end flows, and its
`Neighbors` section flags cross-repo context. Then dive into the docs it
points at. Without an orientation doc, select pages via `wiki/INDEX.md` — one
line per doc: type, status, description, keywords; match the request against
**keywords**, not just titles. Read the relevant `wiki/orc-feature-*`,
`wiki/orc-reference-*`, and `wiki/orc-architecture-overview.md` for the areas
in play.

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

**What full orc reads at run time:** ONLY the pre-built
`.claude/orc/crosslink/needs.json` + `.claude/orc/crosslink/cache/` artifacts,
written by a prior `/orc-wiki` crosslink run. It NEVER reads
`.claude/orc-crosslink.config.yaml` at run time and NEVER reads peer source —
a stale or absent cache means **no peer knowledge this run**, full stop.

**Atlas first (v0.33.0):** when `wiki/crosslink/atlas.md` exists, read it
BEFORE any peer-wiki peek — its per-node profiles + peek hints say WHICH peer
doc answers which question, so peeks are targeted, never a foreign-wiki crawl.
Newest-wins: trust the copy with the newer `generated` timestamp. Atlas
missing/stale while the cache exists → a build lane may cheaply regenerate it
from `needs.json` + `cache/` (and propagate it to peers per the sanctioned
file-write in `../../orc-wiki/references/crosslink.md`) — never a scan.

**Report + trace (at the consult point, alongside the wiki line):**
- `needs.json` present → print
  `crosslink: N boundaries cached (peers: <names>) — advisory contracts will be injected`
  and emit `CROSSLINK cached :: boundaries=N peers=<names>`.
- `orc-crosslink.config.yaml` present but `needs.json` absent → print
  `crosslink: configured but cache not built — run /orc-wiki to resolve peers (peer wikis are NOT being read this run)`
  and emit `CROSSLINK configured-no-cache :: boundaries=0 peers=<names>`.
- neither present → say nothing to the user; emit
  `CROSSLINK none :: boundaries=0 peers=none` only if any crosslink probe ran.

**Injection:** if `needs.json` exists and a task's declared files touch a
matching boundary call site, inject the cached linked contract into that task's
slice as `crosslink` — labeled with its effective cross-repo tier + "hints, not
verified" — the same slice mechanism as `pattern`, and emit
`CROSSLINK inject task=<id> :: <boundary>`. Precedence extends the local rule:
cross-repo can NEVER outrank local code or local wiki hints; it never blocks.
Absent needs file or no boundary → no injection.

## Post-run stale-flag (all lanes that changed code)

After a run that changed code, flag (do NOT re-scan) any wiki docs whose
covered files this run changed and point the user at `/orc-wiki`. Mini/fast
keep this passive note only; the full/ultra post-ship refresh ASK is defined in
`../../orc-wiki/references/staleness.md`.
