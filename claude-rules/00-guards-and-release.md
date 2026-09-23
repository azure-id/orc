# Guards, verification and release

**Read: MANDATORY** — read before any commit, push, version bump or edit under `bin/` or `templates/`.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **NEVER build/commit this repo inside a cloud-synced folder** (OneDrive,
  iCloud, Documents, Desktop). It corrupts commits → broken installs. See
  `PUSH-CHECKLIST.md`.

- **Always run `npm run verify` before every push** — must print
  `✅ ORC package OK` AND `✅ ORC contracts OK`. Confirm `bin/cli.js` and
  `templates/**` are staged.

- The integrity guard (`bin/verify-package.js`) requires ≥37 skills, ≥44 agent
  files, names EVERY non-generated agent explicitly (a dropped file is reported
  by name; a set-equality test makes an unguarded agent file impossible to add),
  and — since v0.29.0 — fails on committed mojibake (U+FFFD or a whitespace-
  flanked `???` run) across `package.json`/`bin/**`/`templates/**`. Keep it
  passing when editing `templates/`.

- **Deterministic test suite (`npm test`, v0.29.0).** `test/` holds a zero-dep
  `node:test` suite covering the CLI (`where`, config roundtrip + validators,
  manifest prune both paths, doctor, pattern-status exit codes) and the three
  hooks (trace SPAWN/RETURN incl. the A2 tool_name-on-SubagentStop case, the
  v0.32.0 attribution set — duplicate-stop dedupe, ≥2-in-flight approx
  restraint, orc-retro exclusion, PHASE-EDGE emission/suppression, rename
  repair — effort-guard block/allow, statusline never-`undefined` + rate limit).
  Runs on `prepack`; add a case when you touch a covered function. Needs Node
  ≥18 (`engines` bumped from `>=16`).

- **The 6 executor agent files are GENERATED — never hand-edit them.** Edit
  `agents-src/executor.template.md` (or the VARIANTS table in
  `bin/build-agents.js`) and run `npm run build:agents`; `npm run verify` fails
  on any hand-edited generated file.

- **Shared contracts: the lint table is the registry.** Cross-file contract
  tokens and their EXACT file sets live in `bin/verify-contracts.js` — when
  changing a shared contract, update every registered copy AND that table in
  the same commit (the lint fails on a skipped copy or an unregistered new
  one). Do NOT re-enumerate drift surfaces here or in knowledge.md; the table
  is authoritative. Cross-lane contract prose has ONE canonical copy under
  `templates/skills/_shared/` (return-validation, smoke-gate,
  fallback-handoff) — lane spines keep only the token + a pointer; never fork
  a copy back into a spine. **A contract may also pin `binFiles: ["bin/cli.js"]`
  (v0.29.0)** — a presence-only assertion so single-token CLI mirrors (config
  keys like `crosslink_fresh_days`, artifact filenames like `flow.lock.json`,
  `FLOW-COMPILED.md`, `orc-diy.config.yaml`, `orc-crosslink.config.yaml`,
  `wiki-meta.json`, `crosslink_provided`, `wiki/crosslink/`, `crosslink/cache/`,
  the `orc wiki sync` command) fail the lint if renamed on either side.
  Remaining documented drift the lint still cannot see is GRAMMAR/PARSER-shaped,
  not single tokens: the DIY block-stitching grammar, `crosslink-kinds.md` ↔
  `CROSSLINK_KINDS`, the score→model preset rows, the wiki-doc header parser
  fields, `countBoundaryRows`, and pattern-status exit codes — golden-fixture /
  behavior tests in `test/` cover these where practical; otherwise change both
  sides together.

- **Commit ONLY skill/package changes — never process docs.** Commits must
  contain only the actual skill work (`templates/**`, `bin/**`, `package.json`,
  `CLAUDE.md`, `knowledge.md`, and the like). NEVER commit working-process
  documents: `docs/superpowers/**` (brainstorming specs, implementation plans),
  `.superpowers/**` (SDD ledger/scratch), OpenSpec artifacts, or any similar
  planning/scratch doc. Keep them on disk for reference, but leave them out of
  git. They are git-ignored — do not `git add` them or use `git add -A` in a way
  that sweeps them in.

