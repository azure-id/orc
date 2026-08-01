# Reference — The Orientation & Journey Doc (`wiki/orc-orientation.md`, v0.33.0)

The wiki's front door: how a fresh session (or a human) self-orients in this
repo in one read. **DERIVED at Phase 3 (assemble) from the already-written
docs + the architecture overview — never a new scan area**, so it costs one
assemble-time write. Consumers read it FIRST (`wiki-consult.md`), then dive
into the docs it points at.

## Sections (in order)

1. **`Repo identity`** — what the repo is, the stack, the entry points — each
   claim anchored to a real file (evidence-anchored v2 rule applies here as
   everywhere: unanchored = omitted, never guessed).
2. **`Reading order`** — ordered pointers into the other wiki docs, one line
   of WHY per hop ("start at orc-architecture-overview for the map → then
   orc-feature-orders because most requests land there → …").
3. **`Journeys`** — 2–4 traced end-to-end flows (a request in, a job run, a
   deploy), each step anchored `file:line`. A journey step that cannot be
   anchored to a file a scan actually covered is OMITTED, never guessed.
4. **`Neighbors`** *(conditional)* — present ONLY when crosslink is configured
   AND the resolved cache / ATLAS exists: one paragraph per linked repo (what
   it provides us, what we consume from it), sourced from
   `.claude/orc/crosslink/cache/` + `wiki/crosslink/atlas.md`. No crosslink →
   the section is omitted with the explicit style line
   `Neighbors: none — no outward crosslink configured.` (never silent).

## Rules

- **Registered like any doc:** standard wiki-doc header (schemas/wiki-doc.md —
  `doc_type: reference`, `area: orientation`) → `orc wiki sync` registers it;
  freshness computed on read, existing tiers, NO new config keys. `covers` lists the entry-point
  source files its Repo identity anchors — **plus every source file the docs it
  summarizes cover** (the union of their `covers`). Its CONTENT derives from
  those docs, so anchoring staleness only to `src/app.js` + `package.json` let
  it read CLEAN in the same impact table where three docs it points at were
  TOUCHED, while its Journeys described a handler that had changed. This is the
  doc every consuming lane reads FIRST, so it is the highest-leverage stale doc
  in the wiki — it needs a machine backstop, not only an obligation.
- **`derived_from` (v0.34.5):** the header also records
  `derived_from: {<doc file>: <content_hash>}` for every doc it summarizes. A
  hash that no longer matches means orientation is stale even when no source
  file moved (e.g. a doc was rewritten from the same code) — the Phase 3
  integrity check reads it.
- **Regenerated (free, derived) whenever any doc it points to is refreshed** —
  including the delta refresh (staleness.md mode 1) and after an atlas
  regeneration. Regeneration is an assemble step, never a scan.
- **Consumption:** `wiki-consult.md` reads orientation FIRST, then dives into
  the referenced docs. orc-learn's topic picker may offer the Journeys as
  learnable topics.
- **Integrity:** the Phase 3 self-check verifies the Reading-order pointers
  resolve to registered docs and spot-checks one Journey anchor.
