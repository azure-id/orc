# Reference — Cross-Repo Wiki Crosslink (federation at the boundary)

Lets one repo's wiki reference *another repo's* wiki at integration boundaries
(BE↔FE, BE→gRPC service, …) so executors build against real cross-repo contracts
instead of guessing. Crosslink is a **subsystem of orc-wiki** — no slash command,
no standalone runtime role. It federates on the *boundary surface*, not the whole
wiki. Shapes: `../schemas/crosslink-tag.md`. Kinds: `crosslink-kinds.md`.

## Load-bearing invariant: advisory, never blocking

You cannot control another team's repo — its wiki version, scan freshness, or
whether it adopted crosslink. So **every** failure mode (missing repo, no wiki,
old schema, drift, breaking change) degrades to a *warning + reduced context*,
never a gate. Cross-repo output is always labeled "hints, not verified".

## Hard boundary: read foreign WIKI only, never foreign SOURCE, never WRITE

The entire foreign footprint is read-only on a handful of the linked repo's
files, resolved from its `repo_path` (repo root):

- `<repo_path>/wiki/crosslink/**` — per-point tag files (the surface)
- `<repo_path>/wiki/orc-reference-api-surface.md` — coarse fallback for v1 repos
- `<repo_path>/.claude/orc/wiki-meta.json` — its freshness manifest + provider registry
- `<repo_path>/.claude/orc-crosslink.config.yaml` — bulk-add peek only
- read-only git queries in `<repo_path>` (`git rev-list --count`, `git diff
  --name-only`) — wiki tiers are commit-distance computed, not mtime-derivable

Never read the linked repo's *source*, never write anything in it. The only
writes are inside THIS repo: `.claude/orc/crosslink/needs.json`,
`.claude/orc/crosslink/cache/**`, and this repo's own `wiki/crosslink/**`.

## Two surfaces, one direction rule

- **Provided (inbound)** — what a repo exposes (gRPC handlers, routers). Read by
  whoever *calls* it.
- **Consumed (outbound)** — what a repo reaches for (its client calls). Its edges.

Direction decides **which side runs drift: you only drift-check what you
consume.** An edge `from: self to: z via: grpc` means self consumes z → watch z's
tags. `from: fe to: self via: api-client` means self is the provider → no drift
on our side (we publish; they watch us).

## The config (CLI-composed, skill-read)

`.claude/orc-crosslink.config.yaml` is written ONLY by the `orc crosslink` CLI
(the DIY pattern — human configs live directly under `.claude/`). orc-wiki only
READS it. Nodes + a directed edge list; `self` is node 1:

```yaml
version: 1
self: service-x-be
nodes:
  - name: service-z-be
    repo_path: ../service-z          # repo ROOT — wiki/, wiki-meta, config, .git derive from it
    kinds: [grpc, repository]
links:
  - from: service-x-be to: service-z-be via: grpc    # we consume z
```

`links` is an edge list (not `linked_to` per node) because one pair can have
edges in both directions/kinds (x→z gRPC AND z→x webhook).

---

## Provider emission (this repo publishes its surface — ALWAYS ON, per scan-task)

Publish is **not** a Phase-3 add-on and has **no enable switch** (v0.24.0). It is
a per-scan-task byproduct of reading the code, the same pattern registration
follows — so it can never be skipped by a run that pauses (every 5 tasks, by
design) or by an incremental refresh with no drift.

Each scan agent, having already read the area's files to write the `Contracts &
shapes` rows, returns a REQUIRED `crosslink_tags` field alongside its `doc_body`
(schemas/wiki-doc.md): either **one tag body per OUTWARD boundary point** it
found (routes, gRPC handlers, produced events — pulled from source, NOT from the
doc prose, which is what kills the "thin docs starve the publish" failure), or
the token **`none` + a one-line reason**. A return missing `crosslink_tags`
entirely is MALFORMED → requeue.

The orchestrator then, in the SAME pass:

1. Writes the doc to `wiki/` AND each tag to `wiki/crosslink/<kind>/<slug>.md`
   (schema §1; slug rule is Windows-safe + reversible).
2. Runs `orc wiki sync` — derives `wiki-meta.json`'s `crosslink_provided` array
   from the tag files just written (schema §2). This registry — NOT
   `wiki/INDEX.md` or `docs` — is where tags live, so the human index and
   `pages` count stay clean. Never hand-maintain the array. Sync's boundary
   detector flags a documented boundary with zero tags (`--check` exit 1).
3. Traces the scan-task's `DISPATCH`/`VERIFY` with a `tags:N` (or `tags:none`)
   count so the boundary is visibly accumulating.

So the boundary accumulates from the FIRST scan-task, however the run ends — a
paused run has a live partial boundary matching its live partial docs.
`crosslink_tags: none` is an auditable claim, never silence; a zero-tag
completion additionally states "crosslink: no outward boundary ({reason})" in
the final report.

## Preservation — replace per-point, never bulk-delete

A refresh (including full regenerate) NEVER clears `wiki/crosslink/` first; each
tag is overwritten per-point as its owning area re-scans. A tag whose boundary
genuinely disappeared is retired ONLY by the **dead-tag sweep** (staleness.md,
beside the dead-doc sweep): a tag whose `anchor` file no longer exists, or whose
re-scanned area returned `crosslink_tags` without it → offer archive/delete per
tag, never silent, never automatic. A whole-surface vanish trips the `orc wiki
sync` N→0 tripwire (loud warning + `--check` exit 1) — a regenerate can no
longer wipe the boundary the way it once did.

## Legacy backfill — `/orc-wiki crosslink` (CROSSLINK-ONLY, SKILL.md Phase 3c)

For wikis whose docs predate v0.24.0 (docs exist, `wiki/crosslink/` absent), the
boundary is already on disk in the evidence-anchored `Contracts & shapes` rows,
so recovering it needs no repo scan: read the rows, open ONLY the files they
anchor, emit the tags, `orc wiki sync` to index. On a ≥v0.24.0 wiki, missing
tags are NOT a backfill case — the sync boundary guard fired and names the fix.
**Never answer "no crosslink tags" with a re-scan.** When the rows are genuinely
too thin to tag, SAY so and recommend an incremental refresh of just those areas
(an honest cost, stated as such) — the one case where a refresh IS the answer.

---

## Consumer discovery (this repo resolves what it needs — Phase 3 add-on)

Also at scan/refresh, when `orc-crosslink.config.yaml` exists:

1. Read the config → linked nodes + `repo_path`s + edges.
2. Walk THIS repo's code; at each call site whose shape matches an edge's
   `via: <kind>` toward a linked node, resolve that node's tag file at
   `<repo_path>/wiki/crosslink/<kind>/<slug>.md`.
3. Record the dependency in `.claude/orc/crosslink/needs.json` (schema §3) — the
   drift baseline. The human never hand-lists tags; discovery fills them.
4. Sync a snapshot into `.claude/orc/crosslink/cache/<node>/…` (schema §4),
   stamped `synced_at` + provider `content_hash` + provider tier +
   provider `scan_commit`.
5. Compute drift on everything already in `needs.json` (below) → **warn only**.

Discovery runs only the **consume** side of edges. Provider-only edges
(`from: fe to: self`) create no needs here.

**So every report is direction-scoped.** A linked repo's tags/freshness matter
ONLY on edges where we CALL them. On an inbound-only edge we read nothing from
that repo, so "no crosslink tags" there is both irrelevant and unfixable — a
pure consumer (a frontend `api-client`) has no API of its own and will never
grow tags. `orc crosslink list`/`status` therefore report inbound-only nodes as
"inbound only (they call us)" and never send anyone to publish a boundary that
legitimately does not exist. **The graph is drawn in the CONSUMER**: the repo
that calls is the one that needs the config, the edge, and the resolved cache.

---

## Freshness — two orthogonal signals, computed on read

A cross-ref is trustworthy only if BOTH hold; the weakest link governs.
`effective = min(Signal-A, Signal-B)`.

- **Signal A — provider wiki tier.** Does the provider's wiki match its code?
  Computed by staleness.md's existing rule — **git commit distance**
  (`git rev-list --count <scan_commit>..HEAD` run read-only in `<repo_path>`),
  NOT days. Use the standard default edges (`wiki_fresh_max` 10 / `wiki_aging_max`
  30); do NOT read the provider's `orc.config.yaml` for custom thresholds (their
  tuning is their business; defaults keep the compute self-contained). When the
  provider isn't checked out or git fails there, fall back to `source_tier`
  stamped in the cache at sync time, labeled "as of last sync".
- **Signal B — snapshot age.** How long since we synced? This is the ONLY
  day-based tier in the constellation (there is no shared commit axis between two
  repos): `days = today − synced_at`, compared against `crosslink_fresh_days`
  (default 10) and `crosslink_aging_days` (default 15). ≤ fresh → FRESH,
  ≤ aging → AGING, else STALE.

Never store the effective tier — the cache stamp is a fallback INPUT, the tier is
always recomputed on read. Inject the linked surface labeled with `effective` +
precedence rank.

## Drift (per-point, warn only)

Per-point tags → per-endpoint drift. Compare cached `source_content_hash` vs the
provider's current tag `content_hash`:

- changed → **contract drifted** → warn ("`grpc:billing.v1.CreateInvoice` changed
  under you since last sync")
- tag file gone → **breaking change** (a tag in `needs.json`) → **warn only**
  (never blocks — advisory invariant)
- unchanged → clean

Topology-drift bonus (free): if `needs.json`/config says we consume z over a
kind but z's own `orc-crosslink.config.yaml` declares no matching provider edge,
note it — warn only.

## Degradation ladder (every rung continues)

| Provider state | What you get | Warn |
|---|---|---|
| v2 wiki + crosslink tags | per-point tags → precise drift | — |
| v2 wiki, boundary documented but tags unpublished (legacy pre-v0.24.0, or a fired sync guard) | api-surface prose → coarse hints, no per-point drift | "boundary documented, tags unpublished — `orc wiki sync --check` there names it; `/orc-wiki crosslink` backfills from the docs, no re-scan" |
| v2 wiki, no boundary at all | nothing to resolve (they expose no API) | — (valid; not a fixable gap) |
| v1 wiki | api-surface only → coarse hints, no per-point drift | "older schema — coarse" |
| wiki UNREGISTERED (docs, no manifest) | edge inert until registered — **but nothing needs scanning** | "run `orc wiki sync` there — instant, no re-scan" |
| manifest CORRUPT (unparseable) | edge inert until rebuilt | "run `orc wiki sync` there to rebuild it" |
| no wiki | edge inert until provider scanned | "run `/orc-wiki` there" |
| path missing | pending edge, resolves when path appears | "path not found — pending" |

Never collapse UNREGISTERED into "no wiki": a repo whose docs are complete but
unindexed looks identical to an unscanned one from the manifest alone, and
telling that team to scan sends them to re-buy a wiki they already own. `orc
crosslink` distinguishes the two by looking for docs under `<repo_path>/wiki/`
before it concludes anything from a missing manifest.

Version skew is expected: a crosslink to a v1/tagless repo gets richer for free
the day that repo re-scans with crosslink. No cross-team coordination needed.

## Run-time injection (how the lanes benefit)

orc / orc-fast / orc-mini inject the linked surface into a task's slice ONLY when
that task touches a boundary — same mechanism as the `pattern` slice. The
orchestrator reads `.claude/orc/crosslink/needs.json`, and for a task whose
declared files include a call site with a matching need, prepends the cached tag
contract (from `crosslink/cache/`) to the slice, labeled with `effective` tier +
"cross-repo hints, not verified". No executor return contract changes — crosslink
is advisory, so there is nothing to attest. A task with no boundary gets nothing.

## Precedence

```
local code > local fresh wiki > cross-repo fresh wiki (hints)
           > cross-repo stale wiki (weak hints) > model priors
```

Cross-repo can never outrank local hints — we cannot verify foreign code.
