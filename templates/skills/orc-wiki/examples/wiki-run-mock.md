# Example — Annotated Wiki Build (dry run)

W: = wiki builder (Opus 4.8 high) · U: = user. Nothing real. EXPENSIVE and often
multi-session — always warns and gets explicit consent BEFORE scanning.

U: /orc-wiki

## Consent gate (always — before any scan)
W: Building the knowledge base scans the whole codebase with Opus 4.8 high. That's
   token-heavy and may span multiple sessions (I pause periodically and checkpoint).
   Auto-branch: no wiki/ found → this is a FRESH build. Proceed?
U: yes

## Scan + write (checkpointed; resumable)
W: [maps the repo: 4 feature areas, 2 shared libs, 1 service boundary, plus the
    standard cross-cutting reference docs (API surface, data model, glossary,
    config/env — skipped when the project lacks the surface)]
   Writes into wiki/:
     wiki/orc-feature-orders.md         (orders domain: flows, entry points, risks)
     wiki/orc-feature-billing.md
     wiki/orc-reference-http-clients.md (shared HTTP client conventions)
     wiki/orc-architecture-overview.md  (service map + "Notes for planning")
   Each doc: schema v2 — TL;DR brief, file-anchored claims, keywords, per-file
   hashes, status: fresh. Run ends with the integrity self-check (docs ↔ INDEX ↔
   manifest agree) before the manifest + INDEX.md are rewritten.
W: [batch boundary] Paused after 2 feature docs — checkpoint written. Continue?
U: continue   → [finishes remaining docs]

## CLAUDE.md pointer (so future runs consult the wiki)
W: Injects a pointer block into CLAUDE.md → /orc and /orc-mini now read the relevant
   overviews during planning/scoring, sharpening core-vs-isolated and risk judgment.

## Later — refresh branch
U: /orc-wiki   (wiki/ already exists)
W: Auto-branch: wiki/ present → REFRESH. Files changed since last scan flag docs as
   stale; I re-scan only those (or a full refresh on request). Fresh docs are trusted;
   stale ones are hints to verify against code.
