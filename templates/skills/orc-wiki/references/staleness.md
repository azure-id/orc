# Reference — Freshness, Staleness & Refresh

THE canonical freshness reference for the whole constellation. Every skill that
consults the wiki (orc, /orc-ultra, orc-mini, orc-fast, planners) follows the
rules here; this file is the single source of truth for the manifest format,
the tier thresholds, the refresh modes, and the precedence rule.

## Precedence (source-of-truth contract)

**code > fresh wiki > stale wiki (hints) > model priors.** The wiki is a
DERIVED source of truth: on any conflict between a wiki claim and the actual
code, the code wins and the doc gets stale-flagged. Never let a confident wiki
claim override what a file actually shows; never let a model prior override a
fresh, evidence-anchored wiki claim without reading the code.

## The manifest — `.claude/orc/wiki-meta.json`

Written **ONLY by the `orc wiki sync` CLI** — never by a model, never by a
consumer. The manifest is DERIVED data: every field it carries already lives in
the docs' own headers (schemas/wiki-doc.md), so deriving it is deterministic and
free, while authoring it from memory is neither. orc-wiki runs `orc wiki sync`
after every scan-task, at every pause, and at Phase 3; consumers only ever READ
it, and never persist the freshness status they compute from it (below) — that
status goes stale the moment anyone commits. Lives outside `templates/` next to
the pattern cache, so `orc update` never clobbers it.

> **Why the CLI owns this.** Registration was once the model's job at the end of
> orc-wiki's Phase 3 — the last step of a lane that pauses every 5 scan-tasks by
> design. Every run stopped at a pause left real docs on disk that nothing had
> indexed, invisible to every consumer and to `orc crosslink`. The one field no
> header carries is `commands` (discovered during the scan): sync preserves it
> across rebuilds and falls back to `package.json` scripts, and it is the only
> key a model may hand-edit.

```json
{
  "last_scan": "12-07-2026 14:32:05",
  "scan_commit": "<full git hash — HEAD at scan time>",
  "branch": "main",
  "pages": 14,
  "commands": {
    "build": "npm run build",
    "test_fast": "npm test",
    "lint": "npm run lint"
  },
  "docs": [
    {
      "file": "wiki/orc-feature-orders.md",
      "area": "orders",
      "doc_type": "feature",
      "covers": ["src/orders/**"],
      "covered_files": { "src/orders/service.ts": "a1b2c3d" },
      "scanned_commit": "<git hash>"
    }
  ]
}
```

- `last_scan`: dd-mm-yyyy hh:mm:ss, local time.
- `scan_commit`: the anchor every staleness compute measures against.
- `commands`: the project's build/test/lint invocations, discovered ONCE during
  the scan. Consumers (especially orc-fast's smoke gate) run these directly
  instead of rediscovering the project's tooling every run. Omit keys the
  project doesn't have; never guess.
- `docs` (v2 registry): one entry per wiki doc mirroring its header's
  `covers` + `covered_files` (`wiki_schema: 2` docs). Purpose: ALL staleness
  questions become answerable from ONE small JSON read + two git commands —
  no doc opens. A manifest without `docs` is v1: consumers fall back to
  doc-header reads; the next refresh writes the registry.

## Computing freshness (on read — never stored)

Two git commands, no file reads:

```
distance = git rev-list --count <scan_commit>..HEAD
drift    = git diff --name-only <scan_commit>..HEAD    (pass 2, only when needed)
```

| Tier | Condition (pass 1) |
|-------|--------------------|
| FRESH | distance < `wiki_fresh_max` (default 10) |
| AGING | `wiki_fresh_max` ≤ distance ≤ `wiki_aging_max` (default 30) |
| STALE | distance > `wiki_aging_max`, OR pass-2 drift intersects the `covers` globs of the docs being consulted |

Pass 2 runs only when pass 1 lands AGING or worse: intersect `drift` with the
relevant docs' `covers` (from the manifest's `docs` registry when present —
no doc opens; else from doc headers). Drift touching covered files upgrades
severity; drift entirely elsewhere may be read as "old but still accurate for
this area". Thresholds come from config (`wiki_fresh_max`, `wiki_aging_max`).

## UNREGISTERED — docs without a manifest

If `wiki-meta.json` is ABSENT but `wiki/` has docs, the wiki is **UNREGISTERED**,
not missing and not stale. The docs may be perfectly current; nothing has indexed
them. Never treat this as a reason to re-scan — the fix is derived and free:

> "This wiki has {N} docs but no manifest, so nothing can read it. Run
>  `orc wiki sync` — instant, no re-scan."

Consumers treat an unregistered wiki as STALE for precedence purposes (they
cannot prove freshness without an anchor) but must surface the sync fix, never a
refresh. `orc wiki status` names the state; `orc wiki sync --check` is the
read-only test. The same applies to a manifest that exists but won't parse
(CORRUPT) or that has drifted from the docs on disk (OUT OF SYNC) — one command
fixes all three.

**Do not conflate incomplete coverage with unregistered.** A scan stopped at a
pause has both: partial coverage (real, fix by resuming — costs money) and no
registration (fix with sync — free). Diagnose them separately; only the first
is worth spending on.

## Per-skill reactions

| Tier | orc / /orc-ultra / planners | orc-mini | orc-fast |
|-------|-----------------------------|----------|----------|
| FRESH | silent | silent | proceed |
| AGING | one-line notice, proceed | one-line notice, proceed | one-line notice, proceed |
| STALE | prominent warning, continue (these lanes self-ground) | prominent warning, continue | **user gate** — see the orc-fast skill (refresh-then-continue recommended / drop to mini / continue anyway) |

## Per-doc staleness (advisory second signal)

Each doc records `scanned_commit` and per-file `covered_files` hashes (v1 docs:
a single `covered_hash`). A doc is stale when the current state of any file in
`covered_files` differs from its recorded hash. Cheap to check via the manifest
registry, no re-scan needed. The doc-header `status: fresh|stale` flag is
ADVISORY only — it is flipped by the auto-flag hook below, which fires only on
ORC runs, so commits made outside ORC never flip it. The computed tier above is
always the authoritative check.

## Refresh modes

0. **Register-only (`orc wiki sync`)** — not a refresh at all, but it is the
   right answer whenever the complaint is "ORC can't see my wiki". Re-derives
   the manifest + INDEX from the doc headers. No scan, no cost, no doc changes.
   Always try this BEFORE offering any mode below: a wiki that is merely
   unregistered needs no re-scan, and re-scanning it wastes real money. Sync
   also runs the **boundary detector** (references/crosslink.md): a non-empty
   `## Contracts & shapes` table with zero `wiki/crosslink/` tags → prominent
   warning + `--check` exit 1 (a documented boundary that never published), and
   an N→0 tripwire when the manifest listed tags but the folder is now empty.
1. **Incremental (recommended default when a manifest exists)** —
   `git diff --name-only <scan_commit>..HEAD`, match changed files against the
   registry's `covers`/`covered_files`, re-scan ONLY the affected docs, then run
   `orc wiki sync` to re-derive the manifest from the updated headers. A delta
   pass, not a full re-scan — this is what makes "refresh first" cheap enough
   to recommend. The delta pass also runs the two sweeps below.
2. **Full regenerate** — re-scan every area. Full cost warning. Timestamps all
   docs fresh. Does NOT clear `wiki/` or `wiki/crosslink/` first: docs and tags
   are overwritten per-area/per-point as each re-scan lands, so the crosslink
   surface is never momentarily wiped (a full regenerate must never destroy the
   boundary — hard rule 12).
3. **Selective refresh** — list stale-flagged docs; user picks which to
   re-scan. Only those spawn agents.
4. **Pre-push diff-scan** — `git diff --name-only` against the push target;
   find docs whose `covers` intersect the changed files; offer to refresh those
   before commit.

**Coverage-gap sweep (incremental refresh + integrity check):** changed files
matched by NO doc's `covers` = uncovered drift — the silent way a wiki becomes
a partial map while still reading FRESH. Report them grouped by directory and
propose new areas/docs; the user consents per new area (rides the refresh
consent, no separate warning). Never silently ignore uncovered drift.

**Dead-doc sweep:** registry entries whose `covers` match ZERO existing files
(area deleted/moved) → offer per doc: archive to `wiki/archive/` (kept out of
INDEX.md) or delete. Never silent, never automatic.

**Dead-tag sweep (crosslink, beside the dead-doc sweep):** a `wiki/crosslink/`
tag whose `anchor` file no longer exists, or whose owning area was re-scanned
this pass and returned `crosslink_tags` WITHOUT it → offer archive/delete per
tag. This is the ONLY way a tag is retired — a refresh never bulk-deletes the
folder (references/crosslink.md preservation rule). Never silent, never automatic.

## Post-ship refresh ask (big runs — full orc + /orc-ultra ship phase)

GUARD FIRST: only if `wiki/` exists AND contains > 0 docs. No wiki → completely
silent (no ask, no note).

A run counts as BIG when, judged by FINAL counts at ship time (so a medium run
that grew counts): tasks dispatched ≥ `wiki_refresh_ask_tasks` (default 3), OR
union of executors' touched files > `wiki_refresh_ask_files` (default 10), OR
waves > 1. Relevance check: if the run's touched files intersect ZERO docs'
`covers`, downgrade to the passive note regardless of size.

- **BIG** → right after ship, ask:
  1. **Refresh wiki now** *(recommended)* — incremental refresh (mode 1),
     scoped to the docs this run staled.
  2. **Later** — print: "This was a big change — N wiki docs are now stale.
     Refresh ASAP (/orc-wiki) or orc-fast and future runs will degrade." Stamp
     `wiki_refresh_declined` in the checkpoint so /orc-retro can correlate.
- **Small runs** → the passive auto-flag note below only. No ask.

orc-mini keeps the passive note only (single-task lane); orc-fast never asks
(its preflight polices freshness on the way in).

## Auto-flag hook (after orc / orc-mini runs)

GUARD FIRST: only act if `wiki/` exists AND contains > 0 files. On an empty/
absent wiki this hook is a silent no-op.

If guarded in:
1. Take the files the orc run touched (from its dispatch/actual_files).
2. Mark every wiki doc whose `covers` intersect those files as `status: stale`.
   This is a metadata flip only — instant, free, no scanning.
3. Tell the user: "N wiki docs are now stale from this change. Run
   /orc-wiki to refresh when ready." Never auto-scan. (On a BIG full-lane run
   the post-ship refresh ask above replaces this passive note.)

## Cross-repo crosslink freshness (references/crosslink.md — advisory only)

A crosslink hint is trustworthy only if BOTH signals hold; the weakest wins,
`effective = min(Signal-A, Signal-B)`. Both are computed on read; the cache
stamp is a fallback INPUT, never a stored status.

- **Signal A — provider wiki tier.** The SAME git-commit-distance compute above,
  run read-only in the linked repo's checkout (`git rev-list --count
  <scan_commit>..HEAD` in `<repo_path>`), using the DEFAULT edges
  (`wiki_fresh_max` 10 / `wiki_aging_max` 30) — we do not read the provider's
  overrides. Provider not checked out or git fails → fall back to the
  `source_tier` stamped in `.claude/orc/crosslink/cache/` at sync, "as of last
  sync".
- **Signal B — snapshot age.** The ONLY day-based tier in the constellation
  (two repos share no commit axis): `days = today − synced_at`, against
  `crosslink_fresh_days` (default 10 → FRESH) and `crosslink_aging_days`
  (default 15 → AGING; beyond → STALE).

Reaction is always advisory: label the injected surface with the effective tier
+ "cross-repo hints, not verified", and warn on per-point drift — never block.
Precedence extends the local rule: `local code > local fresh wiki > cross-repo
fresh wiki (hints) > cross-repo stale wiki (weak hints) > model priors`.

## Consume rule (main orc + orc-mini)

Before consulting the wiki during planning/scoring: check `wiki/` exists and has
> 0 files. If yes, compute the freshness tier (above) and react per the
per-skill table, then read the relevant `orc-feature-*` / `orc-reference-*` /
`orc-architecture-overview.md` for the area being planned — selecting pages via
`wiki/INDEX.md` (one line per doc: type, status, description, keywords)
instead of globbing and skimming headers. Pull the cross-cutting reference
maps when they exist and the task touches their domain:
`orc-reference-api-surface` (route/endpoint inventory — the best planning
input for API work), `orc-reference-data-model` (tables/entities + owners),
`orc-reference-glossary` (domain terms — read it whenever the request uses
project jargon), `orc-reference-config-env` (env/config keys). In each doc the
`TL;DR` section is the cheap read; `Contracts & shapes` and `Testing map`
carry the file-anchored specifics. Apply the precedence rule above. If
`wiki/` is empty/absent, ignore entirely and plan as normal. The wiki is
purely additive.
