# orc-wiki

Builds and maintains a persistent, evidence-anchored project knowledge base (the
**wiki**) under project-root `wiki/`, plus a cross-repo **crosslink** subsystem.
Skill mechanics live in `SKILL.md`; freshness in `references/staleness.md`;
integrity in `references/integrity-check.md`; doc shape in `schemas/wiki-doc.md`.

## What the wiki is

`/orc-wiki` scans the codebase with Opus 4.8 high and writes `wiki/orc-feature-*`,
`wiki/orc-reference-*`, and `wiki/orc-architecture-overview.md`, an `INDEX.md`, and
the machine manifest `.claude/orc/wiki-meta.json`. Future ORC runs consult it —
precedence `code > fresh wiki > stale wiki (hints) > model priors`. Freshness is
computed on read (git commit distance), never stored. Expensive and often
multi-session — it always warns and gets consent before scanning.

---

## Build-your-own: cross-repo crosslink

**What it solves.** In a multi-repo setup — a BE that a FE dashboard calls, a BE
that calls other services over gRPC — each repo's wiki only knows its own code.
Crosslink lets a repo reference another repo's wiki *at the integration boundary*
so an executor building a new gRPC call or endpoint grounds against the real
contract instead of guessing. It is **advisory, never blocking**, and reads only
the linked repo's wiki (never its source, never writing it). Full mechanics:
`references/crosslink.md`; shapes: `schemas/crosslink-tag.md`; kinds:
`references/crosslink-kinds.md`.

### Setup

1. **Give every repo a wiki.** Run `/orc-wiki` in each repo you want to link. A
   scan now also emits that repo's boundary as per-point tag files under
   `wiki/crosslink/<kind>/<slug>.md` and a `crosslink_provided` registry in its
   manifest — published proactively, whether or not anyone consumes them yet.

2. **Compose the graph** in the consuming repo:

   ```
   orc crosslink                 # interactive: add / list / remove / done
   orc crosslink add             # add one linked repo non-interactively
   orc crosslink status          # gate + per-node freshness (read-only)
   ```

   For each linked repo you give: a **name**, a **repo path** (the repo ROOT,
   relative to this repo — `../service-z`), the **kinds** it exposes (multi-pick
   from the catalog, plus "Other"), the **direction** (this repo calls them, or
   they call this repo), and the **target** (option 1 is always *this repo*).
   On paste, the CLI reads the linked repo's `wiki-meta.json` and reports its
   freshness right then — so a typo or an un-scanned repo fails loud immediately.
   If the linked repo already declares a matching edge back at you, the CLI
   offers to **mirror** it. This writes `.claude/orc-crosslink.config.yaml` — the
   only file the CLI touches; it never writes the linked repo.

3. **Let orc-wiki discover the specifics.** You configure only coarse topology
   (which repos, which kinds, who calls whom). The next `/orc-wiki` scan walks
   your call sites, resolves the exact per-point tags you depend on into
   `.claude/orc/crosslink/needs.json`, and mirrors snapshots into
   `.claude/orc/crosslink/cache/` (gitignored). You never hand-list endpoints.

### What you get

- **Run-time grounding** — `/orc`, `/orc-fast`, `/orc-mini` inject the linked
  contract into a task's slice *only* when that task touches a boundary.
- **Per-point drift, warn-only** — if a contract you depend on changes or
  disappears, the next scan warns you by exact tag. Nothing is ever blocked.
- **Graceful version skew** — link a repo on an older wiki and you get coarse
  hints from its `api-surface`; it upgrades to precise per-point tags for free
  the day that repo re-scans. No cross-team coordination required.

### Git hygiene

Committed: `.claude/orc-crosslink.config.yaml`, `.claude/orc/crosslink/needs.json`,
`wiki/crosslink/**`. Gitignored: `.claude/orc/crosslink/cache/**` (derived). The
`orc crosslink` CLI offers, once, to append the cache path to `.gitignore` — it
never edits `.gitignore` silently. `orc update` never touches any of these.
