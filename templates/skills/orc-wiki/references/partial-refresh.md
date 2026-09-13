# Reference — targeted refresh, the scan tier ladder, debt and usage (v0.46.0)

Loaded when the user asks for a refresh, or when `/orc-wiki refresh …` is the
entry. This is the half that makes a 2-line change cost 2 lines.

## What already worked, and must not be rebuilt

- `orc wiki impact` already classifies every doc `CLEAN | TOUCHED | STRUCTURAL`
  against **its own** `scanned_commit`.
- Delta refresh has been the default since v0.33.0.
- `orc wiki sync` is free and CLI-only.
- `computeWikiFreshness` already makes staleness coverage-relative.

Nothing here replaces any of it. `orc wiki plan` sits ON TOP of `impact` and
answers the question impact does not: **what to do about it, in what order, for
how much.**

## Free repairs ALWAYS come before anything that costs money

A hard rule, in this order, every time:

| # | Step | Cost | Fixes |
|---|---|---|---|
| 1 | `orc wiki sync` | free | UNREGISTERED / drifted registration |
| 2 | regenerate `wiki/orc-orientation.md` | free | the derived doc every consumer reads first |
| 3 | crosslink-only backfill | free | tags publishable from already-anchored rows |
| 4 | targeted refresh | **money** | actual doc rot |

**A user must never be able to pay for something a free step would have fixed.**
`orc wiki plan` prints the available free repairs above the priced table; do the
same in prose, and never offer step 4 while a step 1–3 is outstanding.

## `orc wiki plan` — the ranked, priced work list

Free, CLI, no model. Exit 0 nothing to do · 1 work pending, all light · 2 work
pending, at least one deep · 3 cannot compute.

**The ranking rule, and the reasons for it:**

1. **`STRUCTURAL` always first.** A doc pointing at a file that no longer exists is
   actively lying, and no cheaper step repairs it — a targeted refresh cannot
   re-anchor blind, which is also why STRUCTURAL always takes the deep tier.
2. **Then by use × delta**, where `used` is how many of the last 20 runs actually
   put that doc into a slice. Refresh what gets read.
3. **Zero-use docs sink to the bottom** with a retire hint. `used: ?` (no usage
   data yet) is NOT zero-use and must never be ranked as dead.

Render what the CLI returns. **Never compute the order, the tier or the estimate
in this skill** — one engine, the same rule the wiki tier itself lives under
(`../../_shared/detecting-artifacts.md`).

## Targeted refresh

```
/orc-wiki update <doc>                   the same thing, under the name people type
/orc-wiki update "<topic>"               resolved to a doc first — see below
/orc-wiki refresh <doc>
/orc-wiki refresh --only api/refunds/**
/orc-wiki refresh --top 2
/orc-wiki refresh --all-touched          (today's delta behaviour)
```

`update` is an ENTRY, not a second mechanism. A filename goes straight into
R0–R5 below. A topic goes through `orc wiki resolve "<topic>" --json` first
(free, no scan): **exit 0** names the doc · **exit 2** is AMBIGUOUS, so ask which
one rather than scanning a guess · **exit 1** means nothing covers it, and the
request is really an ADD.

It **skips Phase 0 branch detection and Phase 1 area planning entirely** — the doc
exists, so its coverage area is already in its own header. That skip is the whole
saving in wall-clock terms.

```
R0  probe        orc wiki plan --json                       (free)
R1  confirm      the doc, the delta, the TIER, the token + $ estimate. ONE turn.
R2  scan         ONE scan-task, at the tier the ladder resolved
R3  write        doc body + crosslink tags (unchanged — per-scan-task rule)
R4  register     orc wiki sync                              (free)
R5  integrity    the existing self-check, scoped to the touched doc
```

**No new pause mechanic.** The fixed pause every 5 scan-tasks still holds; a 1–2
task refresh simply never reaches it.

**Crosslink rules are unchanged:** tags publish per scan-task, no refresh path
bulk-deletes `wiki/crosslink/`, and the dead-tag sweep still runs per point.

## Add ONE topic — `/orc-wiki add "<topic>"`   (v1.7.0)

The other half of "one doc at a time". Targeted refresh answers *this doc has
moved*; this answers *this topic is not in the wiki at all* — and until v1.7.0 a
new coverage area only appeared as a by-product of the coverage-gap sweep during
a delta refresh, so "add the remittance feature" had no path that did not
re-plan every area in the repo.

Like a targeted refresh it **skips Phase 0 branch detection and Phase 1 area
planning**. Unlike one, it ends with the **reference sweep**: adding a doc moves
more derived surfaces than changing one does.

```
A0  resolve     orc wiki resolve "<topic>" --json                       free
                exit 0 MATCH      → this is really an UPDATE. Say so, route there.
                exit 2 AMBIGUOUS  → ask which doc. NEVER scan a guess.
                exit 1 NEW        → continue.
                exit 3            → no wiki, or unregistered. Fix that first.
A1  scope       the resolver returns `suggested_covers` from PATH NAMES ONLY.
                Show them as a proposal and let the user correct them. ONE turn.
                A wrong glob is a doc that documents the wrong area forever.
A2  confirm     slug · title · covers · the resolved TIER · the token + $ estimate.
                ONE turn. NOTHING spawns before the user says yes.
A3  reserve     orc wiki add <slug> --title "<t>" --covers "<glob>"      free
                Writes a STUB with `status: reserved` — a target for the scan,
                not a document. It is reported as outstanding until a scan
                replaces the body, so a half-finished add can never look done.
A4  scan        ONE scan-task, at the tier the ladder resolved
A5  write       doc body + crosslink tags (the per-scan-task rule, unchanged).
                Replace `status: reserved` with a real `scanned_at`,
                `scanned_commit` and `covered_files` set.
A6  references  orc wiki refs                                            free
A7  integrity   the existing self-check, scoped to the new doc
```

### A6 — the reference sweep, and why it is its own step

After ONE doc is written, these surfaces are derived from the doc SET and are
now behind it. Before v1.7.0 they were repaired from memory, one at a time, and
the ones nobody remembered stayed wrong — which is likeliest on a SMALL run,
because the run feels too small to need a sweep.

| Surface | What goes wrong | Repaired by |
|---|---|---|
| `wiki-meta.json` + `wiki/INDEX.md` | the new doc is not registered | `orc wiki refs` does it (free) |
| a reserved row | the reservation never got its scan | reported, with the update command |
| `wiki/orc-orientation.md` | its reading order predates the new doc | reported — free to regenerate |
| `wiki/orc-architecture-overview.md` | it names neither the file nor the area | reported — free, and OPTIONAL |
| the `CLAUDE.md` pointer block | its doc COUNT is now measurably wrong | reported |
| `wiki/crosslink/**` | a tag anchored to a file that is gone | reported, offered per tag, never bulk-deleted |

`orc wiki refs` **repairs only the registration**, because `orc wiki sync` is
free and already the single writer of those two files. Everything else is
REPORTED with its command. A sweep that silently regenerated prose would be
spending money nobody asked it to spend, which is the same rule the free-repair
ladder above is built on.

`orc wiki refs --check` reports and repairs nothing. Exit **0** clean · **1**
work pending or registration repaired · **2** cannot compute.

## The scan tier ladder (`wiki_scan_tier`, default `ladder`)

Every scan-task used to dispatch the most expensive scanner in the payload whether
the delta was 2 lines or 2000. Five rows, in order, first match wins:

| Condition | Tier | Agent |
|---|---|---|
| first scan of an area (no doc yet) | deep | `orc-wiki-scanner-opus-4-8-high` |
| `STRUCTURAL` | deep | `orc-wiki-scanner-opus-4-8-high` |
| ≥ `wiki_tier_deep_files` covered files touched (default 3) | deep | `orc-wiki-scanner-opus-4-8-high` |
| a new exported symbol in a covered file | deep | `orc-wiki-scanner-opus-4-8-high` |
| otherwise (small delta, no new surface) | **light** | **`orc-wiki-scanner-sonnet-5-high`** |

- **`opus5_only` needs no new pair.** It already forces the wiki scanner to
  `orc-wiki-scanner-opus-5-med`, which already ships, so **both tiers collapse onto
  that one agent** while the flag is on. `OPUS5_ONLY_ROLES` gains no row and no
  phantom pair — see `../../_shared/opus5-only.md`.
- **`wiki_scan_tier: always_deep`** restores pre-v0.46.0 behaviour exactly.
- **NEVER SILENT.** The resolved tier is printed in `orc wiki plan` and in the R1
  confirmation. A cheaper model is a decision the user sees, never a quiet
  substitution.
- The light scanner escalates rather than under-delivers: a `needs_context` return
  naming a new symbol or a missing anchor is re-run deep. That is cheap; a doc with
  invented anchors is permanent.

**Expected saving:** a delta refresh where 3 of 4 docs have a one-or-two-file delta
goes from 4×deep to 1×deep + 3×light — roughly **40% off**, with the deep scan
still doing the work that needs it.

## Budget cap (`wiki_refresh_budget`, default 0 = no cap)

Max scan-tasks per refresh run. A capped refresh is a **planned stop**, not an
interrupt:

```
Refresh · budget reached
  Done : 2 of 4 scan-tasks     Left : 2 tasks, est. 73k tokens / $0.14
  orc wiki sync ran. The wiki is REGISTERED and consistent right now.
  The two remaining docs are AGING, not broken.
  Continue any time:  /orc-wiki refresh --top 2
```

Stopping mid-refresh must leave a VALID wiki. That already holds — sync runs after
every scan-task and freshness is per-doc. This only makes the stop first-class.

**It is a different mechanic from the fixed pause every 5 scan-tasks. Do not merge
them.** The pause is a checkpoint you continue through; the budget is a ceiling you
stop at.

## `orc wiki debt`

One line, for the habit: docs pending, tokens, dollars, oldest debt, tier, and the
reassurance that matters — *nothing is broken*. Exit 0 no debt · 1 debt exists · 3
no wiki.

Inside `/orc`, one preflight tail **only when debt exists**:

```
wiki  : FRESH — 4 docs pending refresh, 335k tok / $0.94
```

**This is the real budget win** — not a cheaper full refresh, but a full refresh you
never need.

## `orc wiki usage` and retirement (`wiki_retire_after_runs`, default 0 = never)

Since v0.41.0 every dispatch whose slice carried wiki material writes a `wiki:`
continuation and every return carries `wiki_used`. Two releases of clean
point-of-use attribution that nothing read back. `orc wiki usage --rebuild` reads
it into `.claude/orc/wiki-usage.json`.

> **Do NOT put usage in `wiki-meta.json`.** That manifest is 100% derived from doc
> headers and `orc wiki sync` is its only writer — a load-bearing rule. Usage comes
> from traces, so it gets its own file and its own writer.

Three things it unlocks: the ranking above · honest coverage on `orc wiki status`
(`14 registered · 8 in active use · 2 never used in 20 runs`) · and retirement.

When `wiki_retire_after_runs` is non-zero and a doc has been in no slice for that
many runs, OFFER retirement — never do it silently:

```
2 docs were never put into a slice in 20 runs. They cost money on every full
refresh — and context tokens whenever they ARE included.
Retire them? (moves to wiki/retired/, drops from INDEX.md and every plan.
              Reversible. Never a delete.)
```

**Retirement MOVES, never deletes**, and `orc wiki sync` re-derives `INDEX.md`
afterwards. A retired doc that turns out to matter is one `git mv` away.

## The consent prompt gets a real number

```
Before: ⚠ This is an EXPENSIVE, possibly multi-session scan. Continue?
After:  ⚠ Full scan: 14 areas, est. 2.1M tokens / $3.80 → $6.10, 25–40 min,
          2 pause points, ~48% of a 5-hour window on Max 20x.
          A targeted refresh of the 4 stale docs: 335k tokens / $0.94.
          Continue with the full scan?
```

The numbers come from `/orc-budget`'s engine (`orc wiki plan --json` carries them).
When there is no history yet, print `insufficient history` rather than a guess.

## Later, opt-in: surgical section refresh — NOT in this release

Noted so it is not re-invented. A doc's sections each anchor to files; in principle
only the sections whose files changed need regenerating (~20% of the body). It
waits because it needs the wiki-doc header parser to carry a section→file map — one
of the GRAMMAR-shaped drift surfaces the contract lint cannot see — and because a
partial body rewrite can break the integrity self-check's anchoring rule. If it is
ever built: default off, and the integrity check still runs over the whole doc.

## What must NOT change

- `orc wiki sync` stays the only writer of `wiki-meta.json` + `INDEX.md`, and stays
  100% derived from doc headers.
- `meta.scan_commit` stays the OLDEST doc's anchor, and nothing reads it as a tier.
- Edges come from `wiki_fresh_max` / `wiki_aging_max`. A hardcoded 10/30 is a bug.
- `computeWikiFreshness` stays the ONE engine. `plan`, `debt` and `usage` all call
  it, and skills never compute a tier.
- Crosslink publish stays per-scan-task.
- A STRUCTURAL blind spot still degrades one step and never past AGING.
- The fixed pause every 5 scan-tasks is not configurable.
