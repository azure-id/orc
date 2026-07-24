# Reference — CLAUDE.md Pointer Injection

Inject a MANAGED, POINTER-ONLY block. Never inline doc summaries — CLAUDE.md
loads into every context, so it must stay small.

## The managed block

Find the markers; if absent, append at the end of CLAUDE.md. Rewrite ONLY the
content between the markers — never touch anything outside them. Block content
is versioned (the `block: vN` stamp below): re-injection updates an existing
block IN PLACE — never duplicates it, never leaves an older block behind.

```
<!-- ORC-WIKI:START (managed by orc-wiki — do not edit by hand) -->
This project has an orc-wiki knowledge base in `/wiki`.
**Read `wiki/orc-orientation.md` first** — repo identity, reading order,
traced journeys; it says which doc answers what. Then consult the relevant
overview: `wiki/INDEX.md` (one line per doc: type, status, description,
keywords) → the matching `wiki/orc-feature-*-overview.md`,
`wiki/orc-reference-*.md`, and `wiki/orc-architecture-overview.md`. Each doc
opens with a TL;DR brief; claims are anchored to real files. Precedence:
code > fresh wiki > stale wiki (hints) > model priors — on conflict, the
code wins.
Crosslink is configured → for cross-repo context, consult
`wiki/crosslink/atlas.md` (the federation map + peek hints) BEFORE peeking
any peer wiki.
Last updated: DDMMYY HH:MM:SS · N docs · block: v2.
<!-- ORC-WIKI:END -->
```

Conditional lines:
- The orientation line appears only when `wiki/orc-orientation.md` exists
  (pre-v0.33.0 wikis keep the INDEX-first wording until their next refresh).
- The crosslink/atlas line appears only when crosslink is configured
  (`.claude/orc-crosslink.config.yaml` with ≥1 edge) — otherwise omit it
  entirely; never point a session at an atlas that can't exist.

## Rules

- If CLAUDE.md doesn't exist, create it with just this block.
- Idempotent: re-running replaces the block's content, never duplicates it.
- Update the "Last updated" line and doc count on every wiki run.
- The block is a signpost that creates the lookup habit; the knowledge itself
  stays in `wiki/` and is pulled on demand.
- User content outside the markers is byte-preserved — always (orc-claude
  honors the same rule from its side).

## Peer injection (ONLY from `/orc-wiki crosslink compile` — v0.33.0)

The compile branch (references/crosslink-compile.md) also injects/updates this
block in EACH linked repo's CLAUDE.md — the second half of the sanctioned
peer-write exception (crosslink.md hard-boundary section): a FILE write only,
never a commit, never a push, warn-and-continue on any failure. Same in-place
block-update rules; user content in the peer's CLAUDE.md is byte-preserved. A
peer with NO CLAUDE.md gets a minimal file containing only the block. Plain
scans/refreshes never write a peer's CLAUDE.md — only the compile branch does.
