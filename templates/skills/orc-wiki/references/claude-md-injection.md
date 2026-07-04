# Reference — CLAUDE.md Pointer Injection

Inject a MANAGED, POINTER-ONLY block. Never inline doc summaries — CLAUDE.md
loads into every context, so it must stay small.

## The managed block

Find the markers; if absent, append at the end of CLAUDE.md. Rewrite ONLY the
content between the markers — never touch anything outside them.

```
<!-- ORC-WIKI:START (managed by orc-wiki — do not edit by hand) -->
This project has an orc-wiki knowledge base in `/wiki`.
Before planning or reasoning about a feature/area, consult the relevant
overview: `wiki/orc-feature-*-overview.md`, `wiki/orc-reference-*.md`, and
`wiki/orc-architecture-overview.md`. Docs carry a `status: fresh|stale` header —
prefer fresh docs; treat stale ones as hints, verify against code.
Last updated: DDMMYY HH:MM:SS · N docs.
<!-- ORC-WIKI:END -->
```

## Rules

- If CLAUDE.md doesn't exist, create it with just this block.
- Idempotent: re-running replaces the block's content, never duplicates it.
- Update the "Last updated" line and doc count on every wiki run.
- The block is a signpost that creates the lookup habit; the knowledge itself
  stays in `wiki/` and is pulled on demand.
