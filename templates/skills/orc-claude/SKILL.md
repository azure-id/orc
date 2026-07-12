---
name: orc-claude
description: >
  CLAUDE.md builder/updater for the LOCAL project. Use for "/orc-claude",
  "build a CLAUDE.md", "update the CLAUDE.md", or "refresh the CLAUDE.md".
  Runs INDEPENDENTLY — no orchestrator, no run folder. Scans the repo for
  ground-truth facts (verified commands, layout, conventions, boundaries) and
  writes a section-fenced, version-stamped CLAUDE.md at the repo root — even
  when ORC itself is installed globally. Never asks questions: P0 rules are a
  template the user fills in themself. Refresh regenerates ONLY stale sections
  and bumps the file version by 0.0.1. Never trims user-authored content;
  never touches the orc-wiki pointer block. The skill dispatches the pinned
  orc-claude-writer-opus-4-8-high agent — it never writes the file itself.
---

# ORC-CLAUDE (standalone)

Build or maintain the **local project's** `CLAUDE.md` from verified repo facts.
The target is ALWAYS `<repo root>/CLAUDE.md` of the current working directory —
never `~/.claude/CLAUDE.md`, even if ORC is installed globally.

**Dispatch, don't do.** Whatever model this chat runs on, the skill itself only
selects the mode and spawns `orc-claude-writer-opus-4-8-high` (the pinned
engine) — so the scan + writing always run at Opus 4.8 high regardless of the
caller's tier. **Fully non-interactive: ask the user NOTHING.** No
AskUserQuestion, no confirmation prompts. Dispatch, relay the report, stop.

**Worked example** (orient only — never execute from it):
`examples/claude-run-mock.md`.

## The three modes (auto-selected, in this order)

1. **REFRESH** — `CLAUDE.md` exists AND contains an `orc-claude:meta` header.
   Recompute section fingerprints; regenerate ONLY stale fenced sections;
   bump `version` by exactly 0.0.1; update `updated:` (DD-MM-YYYY). Nothing
   stale → report "up to date (vX.Y.Z)" and write NOTHING (no bump, no bak).
   Protocol: `references/refresh.md`.
2. **UPDATE** — `CLAUDE.md` exists but has NO `orc-claude:meta` header (a
   foreign / hand-written file). Copy it to `CLAUDE.md.bak` first (one bak,
   overwritten each run; offer a `.gitignore` line for it in the report). Then
   inject the meta header at the top and append/merge fenced generated
   sections at version `0.0.1`.
   **NEVER trim, delete, reorder, or rewrite existing user content — not one
   line.** If a generated section would duplicate what the user already wrote,
   generate the slimmer remainder or skip that section. The merged file MAY
   exceed the budget (e.g. 600 existing lines + generated → 800): that is OK
   by design — end the report with a hard note that the user should trim
   unused content themself for better instruction-following.
3. **CREATE** — no `CLAUDE.md` at the repo root. Generate a fresh one from
   `references/template.md` at version `0.0.1`.

Not inside a git repo / no project root findable → say so and stop.

## Dispatch (the skill's only real job)

1. Detect the repo root and pick the mode (REFRESH / UPDATE / CREATE above —
   header sniff only; the writer re-verifies).
2. Spawn `orc-claude-writer-opus-4-8-high` with: `mode`, `repo_root`,
   `budget` (from a `budget=N` argument, else null), and the paths to
   `references/template.md` + `references/refresh.md`.
3. On return, check `actual_model`/`actual_effort` against the pinned tier —
   mismatch → prepend a tier-downgrade warning to the report.
4. Relay the Phase-3 report verbatim and stop. The skill NEVER writes
   CLAUDE.md itself — not even in a "trivial" refresh.

The writer performs Phases 1–3 below.

## Phase 1 — ground-truth scan (facts, never guesses)

Read-only. Detect from real files, never from memory:

- **Stack & manifests:** `package.json`, `pyproject.toml`, `go.mod`,
  `Cargo.toml`, `pom.xml`/`build.gradle`, `*.csproj`, `composer.json`,
  `Gemfile`, `mix.exs` … Monorepo? (workspaces, `pnpm-workspace.yaml`,
  `turbo.json`, `nx.json`, multiple manifests).
- **Commands:** only invocations that PROVABLY exist — a script in a manifest,
  a Makefile/Taskfile target, a CI step. Prefer the single-test form when the
  runner supports one. **Never invent a command.** Unverifiable → omit.
- **Conventions:** lint/format/type configs (eslint, prettier, biome, ruff,
  black, clippy, tsconfig strictness…) + a small sample of real source files.
  Record only DEVIATIONS from language defaults.
- **Boundaries:** generated/vendored/build dirs (from `.gitignore` + tree),
  lockfiles, migration dirs, obvious legacy zones.
- **Environment:** env-var NAMES referenced in code/config/`.env.example`
  (never values), external services.

## Phase 2 — generate / merge

Follow `references/template.md` exactly: the meta header, the section order
(Zone A rules → Zone B reference), and the fence grammar. Every generated
section sits inside `<!-- orc-claude:section <name> -->` …
`<!-- /orc-claude:section -->` fences so refresh can replace it surgically.
Sections whose scan came back empty are OMITTED, not stubbed.

**P0 is user-authored, always.** Emit the P0 placeholder template from
`references/template.md` with its hard fill-it-yourself note. Never invent P0
rules, never ask for them. Same for the other `@user` sections (Boundaries'
user half, Gotchas, Glossary): placeholder + note, then leave.

**Line budget — generated content only.** Default 400 lines, persisted as
`line-budget:` in the meta header. The budget counts ONLY orc-claude's own
output (header + fenced sections) — existing user content NEVER counts against
it and is NEVER trimmed to meet it. If generation would exceed the budget,
trim Zone B first: move overflow to a `docs/` file and leave an `@docs/...`
pointer. Zone A is never cut. The user may pass a different budget as an
argument (`/orc-claude budget=600`) — honor it and persist it in the header.

**Wiki block is untouchable.** If the file contains an `ORC-WIKI:START` /
`ORC-WIKI:END` block (managed by orc-wiki), byte-preserve it and generate no
wiki-overlapping content. orc-claude never writes inside another skill's
markers.

## Phase 3 — report

Show a short summary and STOP:

```
ORC-CLAUDE — <create|update|refresh> → CLAUDE.md v<X.Y.Z> (<DD-MM-YYYY>)
Sections written: <list>   ·   skipped (empty scan): <list>
Sections stale→refreshed: <list>            (refresh mode only)
Preserved untouched: user content (<n> lines), wiki block
Conflicts flagged (scan contradicts existing text — NOT auto-edited):
  - <file says X, repo shows Y>
Backup: CLAUDE.md.bak <written|not needed>   (add it to .gitignore)
NOTE: file is <n> lines total (budget covers generated content only) — trim
unused user content yourself for better instruction-following.
Fill in the P0 / Gotchas / Glossary placeholders yourself — orc-claude never
writes them for you.
```

## Behavior trace (config `logging` — every ORC entry point traces)

Resolve `logging` + `log_dir` (`../orc/config.md` defaults +
`.claude/orc.config.yaml`) at start. When `logging: true`, follow
`../orc/references/trace-protocol.md`: write `log_dir/.current` =
`<slug>-<DDMMYY>.txt` first, emit `PHASE` lines for scan/generate/report, a
`GATE` line for the mode decision (`create|update|refresh|noop`), then
`FINISH` + delete `.current`. When `logging: false`, do none of this.

## Boundaries

- **Writes ONLY** `CLAUDE.md`, `CLAUDE.md.bak`, and (on budget overflow) a
  `docs/` overflow file. Never edits source code, never commits, never pushes.
- **Never asks the user anything.** Placeholders + report notes replace every
  question.
- **Never deletes or rewrites user-authored lines** — contradictions are
  flagged in the report, not fixed.
- **Never touches** the orc-wiki managed block or any other skill's markers.
- Version bumps are always exactly +0.0.1; dates are always DD-MM-YYYY.
- Reminder: to see usage limits, tell the user to run `/usage` (never invoke
  it programmatically).
