# orc-wiki

Builds and maintains a persistent, evidence-anchored project knowledge base (the
**wiki**) under project-root `wiki/`, plus a cross-repo **crosslink** subsystem.
Skill mechanics live in `SKILL.md`; freshness in `references/staleness.md`;
integrity in `references/integrity-check.md`; doc shape in `schemas/wiki-doc.md`;
crosslink mechanics in `references/crosslink.md`.

## What the wiki is

`/orc-wiki` scans the codebase with Opus 4.8 high and writes `wiki/orc-feature-*`,
`wiki/orc-reference-*`, and `wiki/orc-architecture-overview.md`, an `INDEX.md`, and
the machine manifest `.claude/orc/wiki-meta.json`. Future ORC runs consult it —
precedence `code > fresh wiki > stale wiki (hints) > model priors`. Freshness is
computed on read (git commit distance), never stored. Expensive and often
multi-session — it always warns and gets consent before scanning.

## Two halves: docs and registration

- **Docs** (`wiki/*.md`) — prose. Written by the skill's scan agents, because it
  takes a model to read code and summarize it. This is the expensive half.
- **Registration** (`wiki/INDEX.md` + `.claude/orc/wiki-meta.json`) — the index
  and manifest that make the docs *findable*. Every field is derived from the
  docs' own headers, so the **`orc wiki sync` CLI** writes it: instant, free,
  deterministic. No model is ever involved.

```bash
orc wiki                 # registration state: registered / UNREGISTERED / corrupt / out of sync
orc wiki sync            # (re)build INDEX.md + wiki-meta.json from the docs on disk
orc wiki sync --check    # read-only; exit 1 if registration doesn't match the docs
```

**If ORC or `orc crosslink` says it can't see your wiki, run `orc wiki sync` —
not a re-scan.** A wiki with docs but no manifest is UNREGISTERED, not missing:
the docs are fine, nothing indexed them. This is common and expected, because
`/orc-wiki` pauses every 5 areas by design, and a run stopped at a pause never
reached its assemble phase. Sync fixes it in a second, for free; re-scanning
buys you docs you already have. `/orc-wiki` also detects this on entry and
offers the repair without any scan.

---

# Cross-repo crosslink — the complete guide

## Why you'd want this

You have more than one repo, and they talk to each other:

- a **backend** that a **frontend dashboard** calls over HTTP, or
- a **backend** that calls **another service** over gRPC (maybe several).

Each repo's wiki only knows *its own* code. So when you ask ORC to build a new
gRPC call from `service-a` to `service-c`, it has no idea what `service-c`'s
`CreateInvoice` actually expects — it guesses the field names. **Crosslink fixes
that:** it lets `service-a`'s wiki read `service-c`'s wiki *at the exact boundary*
so the executor builds against the real contract.

**The one rule that makes it safe:** crosslink is **advisory and never blocking**,
and it only ever **reads** another repo's *wiki* — never its source code, and it
never writes anything in the other repo. If a linked repo is missing, un-scanned,
or out of date, you just get a warning and less context — your build never stops.

## The mental model (30 seconds)

1. Every repo **publishes** its own boundary (its endpoints / gRPC methods) as
   small per-point "tag" files when you scan it — automatically.
2. You **draw the graph** once with a CLI: "this repo calls that one over gRPC."
3. ORC **connects the dots**: when a task touches a boundary, it hands the
   executor the linked repo's real contract as a hint.

You do step 2 (coarse: which repos, which way). The machine does the rest.

## Before you start

- ORC installed in **each** repo you want to link (`orc init`).
- The repos checked out as **siblings** (or anywhere reachable by a relative
  path), e.g. `~/code/service-a`, `~/code/service-c`, `~/code/dashboard`.
- A terminal open in the **consuming** repo (the one that calls the others).

---

## Step 1 — give every repo a wiki

In **each** repo, run:

```
/orc-wiki
```

Besides the normal knowledge base, a scan now also **publishes that repo's
boundary**: one small per-point tag file per endpoint / gRPC method under
`wiki/crosslink/<kind>/<slug>.md`, plus a `crosslink_provided` list in that
repo's `.claude/orc/wiki-meta.json`. This happens **proactively** — a repo
publishes its surface whether or not anyone links to it yet, so you never have to
coordinate timing between teams.

> A repo with no outward boundary simply publishes nothing. That's fine.

### Already have a wiki but no tags? Don't re-scan.

Publishing happens at the END of a scan, so two very common cases have docs but
no `wiki/crosslink/` folder: a scan that stopped at one of the 5-area pauses,
and any wiki built before crosslink existed. The boundary is already described
in your docs' evidence-anchored `Contracts & shapes` rows, so recovering it
needs no repo scan:

```
/orc-wiki crosslink
```

This is the **CROSSLINK-ONLY** branch. It reads those rows, opens *only* the
files they anchor to, writes the tag files, resolves what you consume, and
indexes it all with `orc wiki sync`. It never re-scans an area, never rewrites a
doc, and never touches coverage. **"No crosslink tags" is never a reason to pay
for a refresh.**

> **Run it in the repo being CALLED.** Tags are published by the *provider*, so
> `no crosslink tags yet` about your backend is fixed in the **backend**, not in
> the frontend you're standing in. Running it in the caller publishes the
> caller's *own* surface — which for a typical frontend is nothing at all, since
> a pure consumer exposes no API and correctly publishes zero tags. If both repos
> call each other (e.g. backend webhooks into the frontend), run it in both.

## Step 2 — draw the graph (in the consuming repo)

From the repo that *calls* the others, run:

```
orc crosslink
```

You'll get a tiny menu:

```
ORC crosslink — self: service-a  ·  0 linked repo(s), 0 edge(s)
  [1] add linked repo   [2] list   [3] remove   [4] done
> 1
```

Adding a link walks you through five short prompts. Here's a real one — linking
`service-a` to a gRPC dependency `service-c`:

```
  name for the linked repo (slug): service-c
  repo path (repo ROOT, relative to this repo, e.g. ../service-z): ../service-c
  ✓ wiki found · last_scan 11-07-2026 09:12:00 · FRESH · 8 tags

  kinds this repo exposes/consumes (catalog):
    1) grpc      2) rest-endpoint   3) graphql
    ... (18 in the catalog, plus type your own)
  pick (numbers and/or names, comma-separated): 1

  direction?  [1] this repo CALLS them   [2] they CALL this repo
  > 1

  linked to which repo?
   1) this repo (service-a)
  > 1
  ✓ added service-c  ·  edge self ──grpc──▶ service-c  (we consume → drift-checked)
```

What each prompt means:

| Prompt | What to enter |
|--------|---------------|
| **name** | any short slug for the linked repo (`service-c`, `dashboard`) |
| **repo path** | the linked repo's **root folder**, relative to this repo (`../service-c`) — not its `wiki/` folder |
| **kinds** | how they connect — pick from the catalog (`grpc`, `rest-endpoint`, …) or type your own; "Other" is always allowed |
| **direction** | `[1]` = *you* call them (you'll get drift-checked against their contract); `[2]` = they call you |
| **linked to** | which repo is the other end — **option 1 is always this repo**; other repos you've added show up as 2, 3, … |

**The freshness line after you paste the path is the important safety check.** The
CLI reads the linked repo's `wiki-meta.json` right then and tells you:

- `✓ wiki found · … · FRESH · 8 tags` — great, fully linked.
- `⚠ no wiki-meta.json there — run orc-wiki in that repo first` — typo or you
  skipped Step 1 there. The link is still saved (inert until they scan).
- `✗ path not found — saved as a PENDING edge` — wrong path; fix it later, it
  resolves automatically when the path exists.

**Bulk-add (nice shortcut).** If the linked repo *already* declares a matching
link back at you, the CLI notices and offers to mirror it:

```
  service-c also declares service-c ──webhook──▶ service-a — mirror it into your config? (y/n) y
   ✓ mirrored
```

When you're done, pick `[4]`. On your first setup the CLI offers to add the
derived cache folder to `.gitignore` — say yes.

Everything you just did was written to **one file**: `.claude/orc-crosslink.config.yaml`.
The CLI never touches the linked repo.

## Step 3 — let ORC connect the dots

Back in the consuming repo, run `/orc-wiki` once more (or your next scan/refresh).
Now that the graph exists, orc-wiki walks your call sites and:

- resolves the **exact** per-point contracts you depend on into
  `.claude/orc/crosslink/needs.json` (you never hand-list endpoints), and
- mirrors snapshots of those contracts into `.claude/orc/crosslink/cache/`
  (gitignored) so they're available even when the other repo isn't checked out.

That's it. You're set up.

## Step 4 — check it worked

```
orc crosslink status
```

```
Crosslink status — self: service-a, 1 linked repo(s), 1 edge(s)

  service-c:
    ✓ wiki found · last_scan 11-07-2026 09:12:00 · FRESH · 8 tags

  needs baseline: .claude/orc/crosslink/needs.json (per-point tags orc-wiki resolved)
```

From now on, when you run `/orc`, `/orc-fast`, or `/orc-mini` and a task touches
that gRPC boundary, the executor gets `service-c`'s real `CreateInvoice` contract
handed to it as a hint — no more guessed field names.

---

## What lives where (after setup)

| File | Who writes it | Committed? | What it is |
|------|---------------|-----------|------------|
| `.claude/orc-crosslink.config.yaml` | `orc crosslink` CLI (you) | yes | the graph you drew |
| `wiki/crosslink/**` | `/orc-wiki` | yes | this repo's own published boundary tags |
| `.claude/orc/crosslink/needs.json` | `/orc-wiki` | yes | the exact contracts you depend on (drift baseline) |
| `.claude/orc/crosslink/cache/**` | `/orc-wiki` | **no** (gitignored) | mirrored snapshots of linked contracts |

`orc update` never touches any of these.

## Everyday use

- **Drift warnings.** If a contract you depend on changes or disappears, the next
  `/orc-wiki` scan warns you *by exact tag* (`grpc:billing.v1.CreateInvoice
  changed under you`). It's a **warning only** — nothing is ever blocked.
- **Keeping it current.** Re-run `/orc-wiki` (incremental refresh is cheap) in
  the consuming repo to re-sync the cache and re-check drift.
- **Freshness you can trust.** A linked hint is only used as fresh when *both* the
  provider's wiki is fresh *and* your snapshot is recent — the weaker of the two
  wins, and it's labeled "cross-repo hints, not verified". Local code always wins
  over any cross-repo hint.

## Troubleshooting

| You see | What it means | Fix |
|---------|---------------|-----|
| `⚠ wiki found (N docs) but UNREGISTERED` | that repo's wiki is real and possibly complete — nothing ever indexed it (usually a scan stopped at a 5-area pause) | `orc wiki sync` in the linked repo — instant, free, **do not re-scan** |
| `⚠ wiki-meta.json there is unreadable` | the manifest is corrupt JSON | `orc wiki sync` in the linked repo rebuilds it from the docs |
| `⚠ no wiki there` | that repo genuinely has no docs | run `/orc-wiki` in the linked repo |
| `✓ inbound only (they call us)` | that repo only *consumes* your API — you read nothing from it | nothing to do; its tags/freshness are irrelevant on your side |
| `⚠ linked, but no edge yet` | you added the repo but never drew an edge | `orc crosslink` → add the edge; a node alone does nothing |
| `✗ path not found — PENDING` | the repo path is wrong or not checked out | fix the path with `orc crosslink` (remove + re-add), or check the repo out |
| `no crosslink tags yet (coarse hints only)` | that repo has wiki docs but never published its boundary — its scan stopped before the publish step, or its wiki predates crosslink | run **`/orc-wiki crosslink`** in that repo: publishes the tags from the docs it already has, no re-scan. (It also upgrades on that repo's next full scan — but don't pay for a scan just for this.) |
| `tier unknown (git unavailable there)` | linked folder isn't a git checkout | freshness falls back to the snapshot date — still works |
| executor didn't get a contract | the task didn't touch a linked boundary, or `needs.json` isn't built | run `/orc-wiki` in this repo to build the needs baseline |

## The guarantees (why it's safe to adopt)

- **Advisory, never blocking** — every failure degrades to a warning; your build
  never stops on a cross-repo issue.
- **Reads foreign *wiki* only** — never another repo's source, never a write to
  another repo. The whole footprint is a few read-only wiki files + read-only git
  queries.
- **No cross-team coordination** — publish and consume are independent; a repo on
  an older wiki gives you coarse hints today and precise ones for free the day it
  re-scans.

## Git hygiene

Commit `.claude/orc-crosslink.config.yaml`, `.claude/orc/crosslink/needs.json`,
and `wiki/crosslink/**`. Keep `.claude/orc/crosslink/cache/**` out of git — it's
derived and regenerable. The `orc crosslink` CLI offers, once, to append the cache
path to `.gitignore`; it never edits `.gitignore` silently.
