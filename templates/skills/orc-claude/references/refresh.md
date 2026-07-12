# Reference — Refresh Protocol (section-scoped, fingerprint-driven)

REFRESH runs when `CLAUDE.md` carries an `orc-claude:meta` header. It touches
ONLY stale fenced sections — small drift means a small diff (one section body,
the version, the date, one fingerprint).

## Fingerprints

Each scanned section's fingerprint is a 6-hex digest of the CANONICAL INPUT
STRING that produced it — the inputs, not the prose — so cosmetic rewording of
generated text never marks a section stale.

Canonical input string per section (pipe-joined, sorted where a list):

| Section | Canonical input |
|---------|-----------------|
| `whatis` | manifest name+description fields + top-level dir names |
| `commands` | sorted `name=command` pairs of every verified script/target |
| `layout` | sorted top-level dir names (+ workspace package names) |
| `conventions` | sorted basenames+size of lint/format/type config files |
| `boundaries` (scanned half) | sorted `.gitignore` non-comment lines + generated/vendored dir names |
| `workflow` | CI workflow file basenames + detected branch/commit convention |
| `decisions` | dependency-manifest name (tiebreakers only change if stack changes) |
| `patterns` | sorted config basenames + primary language name |
| `testing` | test-runner name + test dir names |
| `adr` | manifest name+version field |
| `environment` | sorted env-var names found |
| `pointers` | sorted `docs/claude-*.md` basenames |

Compute with a real command — never mentally:

```bash
node -e "console.log(require('crypto').createHash('md5').update(process.argv[1]).digest('hex').slice(0,6))" "<canonical input string>"
```

`@user` sections have no fingerprint and are NEVER regenerated. For
`@user+scan` (boundaries), fingerprint and refresh only the scanned half; the
user half is untouchable.

## The refresh algorithm

1. Parse the `orc-claude:meta` header (version, updated, line-budget,
   sections map). Malformed header → treat the file as foreign → UPDATE mode.
2. Run the Phase-1 scan; recompute every scanned section's fingerprint.
3. Diff against the header's `name@fingerprint` entries →
   - **stale**: fingerprint changed → regenerate that fence's interior.
   - **new**: a section that now scans non-empty but isn't in the file →
     append it (fenced) and add it to the header map.
   - **gone**: a scanned section whose inputs vanished entirely (e.g. tests
     removed) → leave the fence but note it in the report; never silently
     delete (the user may want the history). Flag, don't cut.
   - **@user**: skip always.
4. **No stale/new sections** → print
   `CLAUDE.md up to date (v<X.Y.Z>, <DD-MM-YYYY>)` and STOP. No write, no
   bump, no bak.
5. Otherwise: write `CLAUDE.md.bak` (overwrite the old bak), apply the
   section replacements inside their fences only, bump `version` by exactly
   0.0.1, set `updated:` to today (DD-MM-YYYY), rewrite the header's
   fingerprint map, and re-emit the one-line visible trademark under the
   header with the new version/date.
6. Contradiction check: if the scan contradicts a user-authored line (e.g.
   file says `yarn`, repo uses `pnpm`), list it under "Conflicts flagged" in
   the report. NEVER edit the user's line.
7. Budget: regenerated sections respect the persisted `line-budget` for
   generated content, same overflow rule as CREATE (cut Zone B → `docs/` +
   pointer). Existing user content never counts and is never trimmed.

## Invariants (hold in every refresh)

- Exactly +0.0.1 per content-changing run; no bump on noop.
- DD-MM-YYYY everywhere a date is written.
- Nothing outside `orc-claude:section` fences and the `orc-claude:meta`
  header is ever modified.
- The `ORC-WIKI:START`…`ORC-WIKI:END` block (owned by orc-wiki) is
  byte-preserved even when it sits between generated sections.
- Zero questions to the user, in every branch.
