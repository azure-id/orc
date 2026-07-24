---
name: orc-learn
description: >
  Per-feature onboarding docs for the LOCAL project. Use for "/orc-learn",
  "help me learn feature X", "onboard me to this feature", or "orc-learn
  refresh". Runs INDEPENDENTLY — no orchestrator, no run folder. Picks one
  feature (wiki topics first), then generates learning-docs/<feature>/ with
  learning.md (pedagogy: mental model, walkthrough, recipes, FAQ) and
  knowledge.md (reference: file:line-anchored functions & flow, contracts,
  fingerprints). Output is LOCAL and git-ignored — each dev regenerates their
  own. Refresh lists every generated feature with a computed freshness flag
  and regenerates only what the user picks. The skill dispatches the pinned
  orc-learn-writer-opus-5-low agent — it never writes the docs itself.
---

# ORC-LEARN (standalone)

Teach a developer ONE feature of the local repo well enough to safely extend
it — the human-onboarding lane. It is NOT the wiki: the wiki grounds the
*pipeline* (repo-wide, contract-level); orc-learn goes one level deeper for a
*person* — function-level, full-flow, pedagogical. Target is always
`<repo root>/learning-docs/<feature-slug>/` (git-ignored, local per dev).

**Dispatch, don't do.** Whatever model this chat runs on, the skill only picks
the topic/mode and spawns `orc-learn-writer-opus-5-low` (the pinned
engine) — the deepening scan + all writes run at Opus 5 low regardless of
the caller's tier. The skill's only self-writes are the behavior-trace
markers around the spawn. Interactivity is DELIBERATELY minimal but non-zero
(unlike orc-claude): exactly one question per mode — "which feature?" (INIT)
or "which to refresh?" (REFRESH). Never more.

**Grounding precedence** (constellation rule, unchanged):
`code > fresh wiki > stale wiki (hints) > model priors`. The writer re-verifies
every wiki claim it uses against the code; on conflict the code wins.

**Worked example** (orient only — never execute from it):
`examples/learn-run-mock.md`.

## The two modes (auto-selected by argument)

1. **INIT** (default: `/orc-learn`, optional `focus=<hint>`) — pick ONE
   feature, generate `learning-docs/<slug>/learning.md` + `knowledge.md`,
   derive `learning-docs/INDEX.md`.
2. **REFRESH** (`/orc-learn refresh`) — list every generated feature with a
   computed freshness flag; regenerate only the ones the user picks.
   Protocol: `references/refresh.md`.

Not inside a git repo / no project root findable → say so and stop.

## Mode A — INIT

Behavior-trace logging is permanent (always on). Resolve `log_dir`
(`../orc/config.md` default + `.claude/orc.config.yaml`) at start and follow
`../orc/references/trace-protocol.md`; the marker set is in "Behavior trace"
below. Weave the **Trace:** steps in as each event happens.

1. **Topic pick (wiki-first).** Read `wiki/INDEX.md` +
   `.claude/orc/wiki-meta.json` and compute the freshness tier
   (`../orc-wiki/references/staleness.md` — computed on read, never stored).
   **Trace:** `WIKI-CONSULT tier=<FRESH|AGING|STALE|none> :: topic-pick`
   (emitted even when the wiki is absent, with `none`).
   - Wiki FRESH/AGING → present its feature areas as a pick-list; the chosen
     area's `covers` globs seed the writer's file set.
   - No wiki / STALE / topic not covered → ask the user to point at the
     feature (a directory or a `focus=` hint); the writer will do a
     **targeted** scan of just those files — never repo-wide. A stale wiki
     doc may still ride along as hints (precedence above).
   - Ask which feature as ONE question (one feature per invoke). Derive
     `feature_slug` (kebab-case) from the chosen topic/area.
2. **Trace:** write `log_dir/.current` = `run-learn-<slug>-<DDMMYY>-<HHMMSS>.txt` BEFORE the
   spawn (the `orc-trace.js` hook also bootstraps it on the dispatch, so the
   skeleton is never lost).
3. Spawn `orc-learn-writer-opus-5-low` with: `mode=init`, `repo_root`,
   `feature_slug`, `topic_area`, `covers[]` (from wiki or user pointer),
   `wiki_tier`, `focus_hint|null`, and the paths to
   `references/deepen.md`, `references/template-learning.md`,
   `references/template-knowledge.md`. **Trace:**
   `DISPATCH orc-learn-writer :: init <slug> expect=opus-5/low` just
   before the spawn (the hook adds `SPAWN`/`RETURN` on its own).
4. On return, check `actual_model`/`actual_effort` against the pinned tier —
   mismatch → prepend a tier-downgrade warning to the report. **Trace:**
   `VERIFY writer actual=<model>/<effort> ✅ MATCH` (or
   `⛔ DOWNGRADE expected=opus-5/low`).
5. Relay the writer's report verbatim. If `learning-docs/` is not in
   `.gitignore`, offer the line (`learning-docs/`) — append only on an
   explicit yes; never edit silently. **Trace:** `FINISH :: init <slug>`,
   then delete `log_dir/.current`. Stop. The skill NEVER writes the docs
   itself — not even a "trivial" INDEX touch.

## Mode B — REFRESH

1. No `learning-docs/` (or no feature folders inside) → "nothing generated
   yet; run `/orc-learn` first." Stop — no trace run needed.
2. Read every `learning-docs/<feature>/knowledge.md` fingerprint header
   (`source_commit` + per-file hashes) and compute FRESH/AGING/STALE per
   feature — `references/refresh.md`. Freshness is computed on read, never
   stored as a status.
3. Present the FULL list, each with its computed flag; the user
   multi-selects which to regenerate (one question, multi-select). Nothing
   selected → stop, no writes.
4. **Trace:** write `log_dir/.current` = `run-learn-<slug>-<DDMMYY>-<HHMMSS>.txt`. For each
   selected feature, spawn the writer with `mode=refresh` and that feature's
   slice (re-deepen just that feature; a FRESH/AGING wiki may again seed the
   boundary — emit one `WIKI-CONSULT tier=<tier> :: refresh` when the wiki is
   read). One `DISPATCH`/`VERIFY` pair per feature, same markers as INIT.
5. The (last) writer re-derives `learning-docs/INDEX.md` from all current
   feature headers. Relay the combined report. **Trace:**
   `FINISH :: refresh <n> features`, then delete `log_dir/.current`.

## Behavior trace (PERMANENT — minimal dispatch-lane protocol; always on)

orc-learn owns the trace for its run like every trace-owning lane, but it is
a dispatch-only lane: it emits ONLY markers it can truthfully witness — no
phase/score/finding/verdict markers (deepening and writing happen inside the
writer, which self-traces nothing and only returns `actual_model`/
`actual_effort`). The marker set, in order (actor `orc`, plus the hook's
`SPAWN`/`RETURN`):

1. `WIKI-CONSULT tier=<tier> :: <topic-pick|refresh>` — at every wiki read
   (orc-learn is a wiki-grounding lane; the consult is always traced, absent
   wiki included).
2. `log_dir/.current` = `run-learn-<slug>-<DDMMYY>-<HHMMSS>.txt` — before the first spawn.
3. `DISPATCH orc-learn-writer :: <mode> <slug> expect=opus-5/low` — one
   per spawn; REFRESH runs one per selected feature.
4. `VERIFY writer actual=<model>/<effort> ✅ MATCH` or
   `⛔ DOWNGRADE expected=opus-5/low` — from the returned
   `actual_model`/`actual_effort` (this lane's honesty signal for
   `/orc-retro`).
5. `FINISH :: <init <slug>|refresh <n> features>`, then delete `.current`.

Narration is **dispatched, never remembered**: record each marker with its REAL
timestamp as its event happens, then — as a single-dispatch lane — dispatch the
trace writer ONCE with the whole event list plus `decisions` (the WHY: which
feature was picked and why, the user's answer verbatim) after the writer return
validates and BEFORE you delete `.current`. Stamps are the run's timeline, never
the write time, and a run that
ends with zero new trace lines is a protocol violation.

## Boundaries

- **Writes ONLY** under `learning-docs/` (via the writer) and, on an explicit
  yes, one `.gitignore` line. Never edits source code, never commits, never
  pushes.
- **One question per mode, ever.** Which feature (INIT); which to refresh
  (REFRESH). Everything else is decided or reported, never asked.
- `learning-docs/` is LOCAL — git-ignored, regenerated per dev, never a
  committed shared artifact. A stale copy costs one regeneration, nothing
  more.
- `INDEX.md` is DERIVED by the writer from the feature headers in the same
  dispatch — never hand-maintained, never edited by the skill.
- The wiki is consumed read-only as a boundary source; orc-learn never
  writes wiki files, never triggers a wiki scan, never treats "not in the
  wiki" as a blocker (it falls back to a targeted scan of user-pointed
  files).
- Reminder: to see usage limits, tell the user to run `/usage` (never invoke
  it programmatically).
