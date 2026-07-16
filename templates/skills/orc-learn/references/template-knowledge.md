# Template — `knowledge.md` (reference; jump-to lookup)

The lookup half of a feature's onboarding pair, and the file that carries the
feature's freshness fingerprints. Sections are required unless marked
optional; empty-scan sections are OMITTED, never stubbed. Every claim is
anchored `file:line`, verified this run.

## The fingerprint header (required, machine-readable)

The first thing in the file — an HTML comment block the refresh protocol
parses (`refresh.md`). Field names are orc-learn's own (`source_commit`, not
the wiki's scan fields) so the two schemas can never be confused:

```markdown
<!-- orc-learn:meta
feature: <feature-slug>
generated: <DD-MM-YYYY>
updated: <DD-MM-YYYY>
source_commit: <full git hash — HEAD when this doc was written>
covered_files:
  <repo-relative path>: <6-hex md5>
  <repo-relative path>: <6-hex md5>
-->
```

- `covered_files` lists every source file the doc's claims rest on, with a
  6-hex md5 of its content — computed with the real `node -e` md5 one-liner
  (same command as `orc-claude/references/refresh.md`), never mentally.
- Refresh recomputes freshness FROM this header on read; no freshness status
  is ever stored here.

## Body sections

```markdown
# Knowledge — <Feature Name>

## Architecture summary

<5–15 lines: the pieces, their responsibilities, how data moves. A compact
diagram if the shape warrants it.>

## Functions & flow

<THE deepened section — the value-add over any wiki doc. One row/entry per
function or entrypoint that composes the feature: name, file:line anchor,
role in one line. Then the full call flow of one real invocation, entry to
exit, as an ordered chain of those anchors — the SAME flow learning.md
walks through pedagogically.>

## Contracts & invariants

<What must not break when you touch this feature: shapes, ordering rules,
error conventions, cross-feature promises. Anchored to where each is
enforced or assumed.>

## Dependencies & extension points

<In: what this feature consumes (modules, config, env names — never values).
Out: who consumes it. Extension points: the seams a next iteration should
use, anchored.>

## How to verify a change

<The build/test/lint invocations that prove a change to THIS feature is
safe — taken from the wiki manifest's `commands` map when one exists, else
from the project's real manifests. Only invocations that provably exist;
never invented. Include the narrowest test scope that covers the feature.>

## Doc changelog

<One line per generation/refresh: DD-MM-YYYY — init|refresh — short note.>
```

## Rules

- `covered_files` is the refresh contract: any file the doc leans on that is
  missing from the map silently escapes staleness detection — err on
  including it.
- Unanchored claims are omitted, never guessed. On any wiki-vs-code conflict
  the code wins and the doc records what the code shows.
- `INDEX.md` (derived by the writer from every feature's header) carries per
  feature: slug · one-liner · generated/updated dates · path. Freshness is
  NOT stored in the index — it is computed on read by refresh mode.
