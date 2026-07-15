---
name: orc-wiki
description: >
  Build and maintain a persistent project knowledge base for ORC.
  Use for "/orc-wiki", "build the project wiki", "scan the codebase
  for a knowledge base". Scans the project with Opus 4.8 high and writes
  wiki/orc-feature-*, wiki/orc-reference-*, and orc-architecture-overview.md,
  then injects a pointer block into CLAUDE.md so future runs consult it.
  EXPENSIVE and often multi-session — always warns and gets explicit consent
  before scanning. Auto-branches: fresh start / resume / refresh. Reuses the
  orchestrator's checkpoint, stop-continue, and fresh-session resume.
---

# ORC-WIKI

A separate orchestrator whose OUTPUT is documentation, not code. It reuses the
main spine's machinery (checkpoint, state-of-play, stop-continue, fresh-session
resume, parallel dispatch, "orchestrator never scans-and-writes itself — it
always spawns") but has its own phases below.

**Worked example** (orient only — never execute from it): `examples/wiki-run-mock.md`.

It shares the run-folder
discipline: run artifacts in `.claude/skills/orc/run/{run-slug}/`,
but the KNOWLEDGE BASE output goes in the project's `wiki/` folder.

Run as Opus 4.8, high effort — orchestrator AND scanning agents. Cost is
accepted by design; the trade is knowledge-base QUALITY. This makes the consent
gate mandatory.

## Hard rules

1. **Never scan before explicit consent.** On a fresh run, show the generic
   cost warning and do NOTHING to the repo until the user says ok/continue/
   proceed. No pre-scan, not even to estimate area count.
2. **You never scan-and-write yourself — you spawn.** Scanning agents (Opus 4.8
   high) do the reading/summarizing; you plan, dispatch, and assemble.
3. **Fixed pause every 5 scan-tasks.** Not user-configurable. Multi-session
   resume via the inherited checkpoint.
4. **Wiki docs are persistent** in `wiki/` (project root). Run artifacts
   (checkpoint, state-of-play) stay in the run subfolder.
5. **Every doc carries staleness metadata** (see schemas/wiki-doc.md).
6. **CLAUDE.md gets a managed POINTER block only** — never inline summaries
   (keeps CLAUDE.md small; it loads into every context).
7. Usage: report the dispatch log + remind the user to run `/usage`. Never
   invoke `/usage` programmatically.
8. **You NEVER hand-write the registration — you run `orc wiki sync`.**
   `.claude/orc/wiki-meta.json` + `wiki/INDEX.md` are DERIVED from the docs' own
   headers, so the CLI writes them deterministically and you never author their
   content. Run it **after every scan-task, at every pause, and at Phase 3** —
   not once at the end. Registration is cheap, instant, and idempotent; the only
   way to get it wrong is to skip it.
   ```bash
   orc wiki sync      # or: npx --no-install orc wiki sync
   ```
   **Why this is a hard rule:** registration used to be your job at the end of
   Phase 3 — the last step of a lane that pauses every 5 scan-tasks BY DESIGN.
   Any run stopped at a pause left real docs on disk that nothing had indexed:
   invisible to every consumer, and `orc crosslink` reported the repo as having
   no wiki at all. Registering as you go makes a paused wiki a VALID wiki with
   partial coverage — **incomplete coverage and unregistered are different
   states, and only one of them is broken.**
   Consumers compute freshness on read and never store it. If `orc` is not on
   PATH, say so and continue — never hand-write the manifest to compensate;
   a wrong manifest is worse than an absent one.
9. **Every scan/refresh passes the integrity self-check before it is done**
   (references/integrity-check.md): docs ↔ INDEX ↔ manifest registry ↔
   CLAUDE.md block must agree, `covers` must resolve, evidence anchors
   spot-verified. Emit `WIKI-CHECK` trace lines when logging is on.
10. **Docs are evidence-anchored (schema v2 — schemas/wiki-doc.md).** Contract
   sections cite the files they come from; a claim the scan agent can't anchor
   is omitted, not guessed. This is what makes the wiki a legitimate second
   source of truth (precedence: `code > fresh wiki > stale wiki (hints) >
   model priors` — staleness.md).
11. **Crosslink is advisory, never blocking, and reads foreign WIKI only.** The
   cross-repo subsystem (references/crosslink.md) emits this repo's boundary as
   per-point tag files and resolves what it consumes from linked repos' wikis.
   It NEVER reads a linked repo's source and NEVER writes anything in it — the
   only foreign footprint is read-only wiki files + read-only git queries. Every
   cross-repo failure (missing repo, no wiki, drift, breaking change) degrades to
   a warning, never a gate. Inert unless `.claude/orc-crosslink.config.yaml`
   exists or this repo has an outward boundary to publish.

## Behavior trace (PERMANENT — same rule as orc/orc-mini; wiki runs trace too)

Behavior-trace logging is always on (no toggle). Resolve `log_dir` at run start
(`../orc/config.md` default + the `.claude/orc.config.yaml` override) and follow
`../orc/references/trace-protocol.md` for the wiki's phase set. The `orc-trace.js`
hook bootstraps `log_dir` + the run-pointer on the first scan/codifier dispatch,
so a `.txt` exists even if the run-start step below is skipped — but still do it
so the file carries the rich markers, not just SPAWN/RETURN:

- **Run start (after consent, before any dispatch):** create `log_dir`, write
  `log_dir/.current` = `<run-slug>-<DDMMYY>.txt`, and store
  `logging_enabled: true` + `trace_path` in the wiki checkpoint so a resumed
  session re-anchors to the SAME file. Emit a `PHASE` line at each wiki phase
  transition (entry → area-planning → scan → assemble).
- **Each scan/codifier dispatch:** announce the model derived from the agent
  NAME and emit `DISPATCH <agent> :: <area> expect=<model>/<effort>`. The hook
  writes the `SPAWN`/`RETURN` skeleton independently once `.current` exists.
- **Each return:** read `actual_model` + `actual_effort`, compare to expected,
  emit `VERIFY <area> actual=…/… ✅ MATCH` or `⛔ DOWNGRADE expected=…` and
  surface any downgrade to the user.
- **Stop sequence (5-task pause):** the trace file persists and `.current`
  STAYS in place across the pause — a resumed session appends to the same
  trace via the checkpoint's `trace_path` (re-write `.current` from it if
  missing).
- **Run end (Phase 3 done or abort):** emit `FINISH …` and delete
  `log_dir/.current`.

## Phase 0 — Entry & auto-branch (on /orc-wiki)

**FIRST, always: run `orc wiki sync --check`** (read-only, instant, costs
nothing). It answers "is what's on disk registered?" before you branch on
anything else. If it reports out-of-sync, the REPAIR branch below takes
precedence over REFRESH — a wiki can be perfectly current and still unreadable.

Then detect state and branch:
- **`wiki/` has docs but registration is missing or drifted** → **REPAIR**
  (`orc wiki sync --check` exits non-zero; `orc wiki status` names it
  UNREGISTERED / corrupt / out-of-sync). The docs are fine; nothing indexed
  them. Do NOT offer a refresh or a re-scan — neither is the problem and both
  cost real money. Say what's actually wrong and offer the free fix:
  > "Your wiki has {N} docs, but it isn't registered — {INDEX.md / the
  >  freshness manifest} {is/are} missing, so ORC and `orc crosslink` can't see
  >  it. I can register the docs you already have: instant, free, nothing is
  >  re-scanned and no doc changes. Fix it now?"
  On consent run `orc wiki sync`, report what it registered, then re-branch on
  the state below. **Never bundle a scan into this** — repair is registration
  only. This branch can coexist with RESUME (a paused scan is the usual way a
  wiki ends up unregistered): register first, THEN offer to resume the
  remaining areas as a separate, clearly-priced choice.
- **`/orc-wiki crosslink` (explicit), OR `wiki/` has docs while `wiki/crosslink/`
  is absent and the docs show an outward boundary** → **CROSSLINK-ONLY**
  (Phase 3c). Publishes/resolves ONLY the cross-repo boundary: no area is
  re-scanned, no doc is rewritten. This is the right branch whenever the
  complaint is "no crosslink tags yet" — the contract rows are already in the
  docs, so a refresh is the wrong and expensive answer. In the auto-detect case
  OFFER it (one line, with its small cost note); never start it unasked.
- **Empty/absent `wiki/` AND no wiki checkpoint** → FRESH. Show the generic
  cost warning:
  > "Building the project knowledge base scans your code with Opus 4.8 high.
  >  This is expensive and will likely span multiple sessions (fixed pause
  >  every 5 areas). Nothing is scanned until you confirm. Proceed?"
  Wait for explicit ok/continue/proceed. Only THEN go to Phase 1.
- **Wiki checkpoint exists (mid-scan)** → RESUME. Re-anchor from state-of-play
  + checkpoint. Show "Resuming wiki scan: X of Y areas done, ~Z remaining."
  Light cost note, no full warning. Continue where it stopped.
- **Complete wiki, no active checkpoint** → REFRESH. Offer modes:
  **incremental (recommended when `wiki-meta.json` exists** — diff since
  `scan_commit`, re-scan only affected docs; a cheap delta pass) ·
  full regenerate · selective refresh of stale-flagged docs · pre-push
  git-diff scan · nothing. Each with its own cost note. Only scan on consent.
  **If the ask was really "I have no crosslink tags", do not sell a refresh** —
  route to CROSSLINK-ONLY above. An incremental refresh with no drift can
  legitimately find nothing to do and never reach Phase 3, leaving the tags
  still unpublished after the user paid for the pass.

## Phase 1 — Area planning (after consent)

Infer the knowledge slicing from repo structure: directories, services,
modules, routes, domains — plus cross-cutting topics (auth, data model, API
conventions, deployment, build). Produce a scan plan: a list of scan-tasks,
each = one area/topic to document, with the files it covers. Show the plan
(areas, count, where the 5-task pauses fall). Doc types:
- `wiki/orc-feature-{x}-overview.md` — a feature/domain area
- `wiki/orc-reference-{topic}.md` — cross-cutting reference/convention
- `wiki/orc-architecture-overview.md` — the top-level map tying them together

**Standard cross-cutting reference docs** — plan these four as scan-tasks
whenever the project has the surface (they count toward the 5-task pause
cadence; SKIP any that don't apply — never fabricate one):
- `wiki/orc-reference-api-surface.md` — full route/endpoint inventory: method,
  path, handler file, owning area (the single best planning input for API work)
- `wiki/orc-reference-data-model.md` — cross-area DB/entity map: every
  table/model, owning area, key relations
- `wiki/orc-reference-glossary.md` — domain terms → meaning → where defined in
  code (kills the #1 cause of AI misreads: project jargon)
- `wiki/orc-reference-config-env.md` — every env var/config key: where read,
  default, effect

## Phase 2 — Scan (spawned agents, 5-task pauses)

Write checkpoint + state-of-play into the run subfolder BEFORE dispatching.
Per scan-task: spawn an Opus 4.8 high agent with the area's file list + the
doc-writing contract (schemas/wiki-doc.md — v2: evidence anchors mandatory in
contract sections, `keywords[]` + per-file `covered_files` hashes in the
return). The agent reads the code and returns a structured overview; YOU write
it to `wiki/` with staleness metadata. A return missing keywords/covered_files
or with unanchored contract sections is malformed (requeue).

**After each doc lands, run `orc wiki sync`** (hard rule 8). One command, no
model work — it re-derives the registration from the headers you just wrote. The
wiki is then readable by every consumer from the very first doc onward, however
the run ends.

Every 5 completed scan-tasks → STOP SEQUENCE (reuse the main skill's
`../orc/references/stop-and-resume.md`): checkpoint → state-of-play → dispatch report →
"/usage" reminder → resume block → wait for continue. Multi-session resume is
expected and normal.

**A pause must never read as a finish.** The stop sequence's dispatch report +
"/usage" reminder look exactly like Phase 3's completion report, and users have
reasonably concluded the wiki was done and walked away from a half-scanned
repo. So at every wiki pause, lead with the coverage line — never bury it:
> ⏸ **PAUSED — not finished.** {N} of {M} areas scanned, {M−N} remaining.
> The {N} docs so far are registered and usable now. Reply **continue** to scan
> the rest.
At completion, say **✅ Wiki complete — all {M} areas scanned.** The two must be
impossible to confuse at a glance.

## Phase 3 — Assemble & inject

Phase 3 assembles the whole; it is NOT where registration first happens (that
ran after every scan-task — hard rule 8). If the user stopped early, the docs
are already registered and this phase simply hasn't run yet.

1. After all areas are scanned, write/update
   `wiki/orc-architecture-overview.md` linking the feature + reference docs.
2. **Crosslink publish + resolve** (references/crosslink.md — Phase 3 add-on):
   emit this repo's `wiki/crosslink/**` tag files, and if
   `.claude/orc-crosslink.config.yaml` exists, resolve needs +
   `.claude/orc/crosslink/cache/` and warn on per-point drift.
3. **Run `orc wiki sync`** (hard rule 8) — re-derives `wiki/INDEX.md` +
   `.claude/orc/wiki-meta.json` from every doc header, including the
   architecture doc from step 1 and the `crosslink_provided` index of the tags
   from step 2. The build/test `commands` you discovered during the scan are the
   ONE thing no header carries: if the manifest's `commands` is absent or wrong,
   fix that key by hand — it is the only part of the manifest you ever touch.
4. **Run the integrity self-check** (hard rule 9 — references/
   integrity-check.md): index-sync, registry-sync, covers-resolve, coverage
   report, counts-match, anchor spot-check. It runs AFTER sync — it validates
   the derived registration rather than racing it. Fix failures before
   proceeding; emit `WIKI-CHECK` trace lines when logging.
5. Inject/update the managed pointer block in `CLAUDE.md`
   (see references/claude-md-injection.md). Pointer only — no summaries.
6. Final report: lead with **✅ Wiki complete — all {M} areas scanned**
   (unmistakably distinct from a pause), then the dispatch log + "/usage"
   reminder. Keep the checkpoint for audit.

## Phase 3c — CROSSLINK-ONLY (standalone: publish/resolve with NO area scan)

Entry: `/orc-wiki crosslink`, or the Phase 0 CROSSLINK-ONLY branch. Runs the
Phase 3 crosslink add-on and nothing else.

**Why it exists.** Tags are Phase 3 artifacts, so two whole populations have
docs but no tags: any wiki whose Phase 3 never ran (a scan stopped at a pause),
and EVERY wiki built before crosslink existed. The raw material is already on
disk — the docs' `Contracts & shapes` rows, each evidence-anchored at scan time.
Re-scanning the repo to recover a boundary the docs already describe is pure
waste. **"No crosslink tags" is never a reason to re-scan.**

**Direction — publish happens in the PROVIDER.** This branch publishes THIS
repo's own surface. It cannot give a linked repo tags: "no crosslink tags yet"
about the backend is fixed by running this **in the backend**. Say so plainly
when the user's goal is a linked repo's tags — a pure consumer (typical
frontend) exposes no API and correctly publishes zero tags, so running it there
looks like a no-op and is easily mistaken for a bug. Both directions (e.g. the
backend also webhooks into the frontend) → run it in both repos.

**Prerequisites** (check, never assume):
- `wiki/` has docs → else refuse: "no wiki docs to publish from — run
  `/orc-wiki` to build the wiki first." Never invent a boundary.
- Some doc has a non-empty `Contracts & shapes` section → else report "no
  outward boundary found in the wiki; nothing to publish" and stop. A repo with
  no boundary correctly publishes nothing — that is a valid result, not a
  failure. Say it in one clear line and name the likely cause (this repo only
  CALLS others), so a no-op never reads as a failure.

**Consent** — small and honest; this is NOT the scan warning:
> "This reads your existing wiki docs' `Contracts & shapes` rows and opens only
>  the {N} files they anchor to. It does NOT scan your repo and does not touch
>  your docs — far cheaper than a refresh. Proceed?"

**Steps:**
1. Collect boundary points from the docs' `Contracts & shapes` rows + their
   evidence anchors. Read DOCS, not source — those rows were already scanned.
2. Dispatch Opus 4.8 high agents over **the anchored files only** (hard rule 2 —
   you never read-and-write yourself). Each returns a tag contract body per
   schemas/crosslink-tag.md (shape, field names + types, error codes) pulled
   from its anchor. A field the agent cannot see in the anchored file is
   OMITTED, not guessed; an unanchorable row is SKIPPED and reported. Never
   publish a contract on a guess — a wrong tag silently misleads another repo.
3. Write the tag files to `wiki/crosslink/<kind>/<slug>.md`.
4. **Consume half** (only when `.claude/orc-crosslink.config.yaml` exists):
   resolve needs + cache exactly as the Phase 3 add-on does (references/
   crosslink.md).
5. Run `orc wiki sync` — indexes the tags into `crosslink_provided`.
6. Integrity: crosslink-anchors (integrity-check.md); emit `WIKI-CHECK
   crosslink …` when logging.
7. Report tags published per kind, plus every skipped row and why.

**Never** re-scan an area, rewrite a doc, change coverage, or touch `pages`.
Coverage is a scan question; this is a boundary question, and conflating them is
what makes people pay for a re-scan they don't need.

## Code-pattern pre-warm (opt-in — only when config `orc_wiki_pattern_findings: on`)

Default OFF. When on, after Phase 3 also **codify the project's code-pattern for
every detected FE/BE language** as a byproduct of this scan — pre-warming
`.claude/orc/patterns/<lang>-pattern.md` so later `/orc` runs never hit the
`pattern_findings` prompt. This rides under the wiki's existing scan-consent, so
there is NO separate ask (that is why the config is on/off only, no `ask`).

Per detected language (see `../orc-pattern/references/INDEX.md`): dispatch
`orc-pattern-codifier-sonnet-5-high` with the generic playbook + the
most-recently-modified real files for that language; YOU write the returned pattern
to the cache. Never run tests or change project code. Skip languages already cached
and un-drifted. This reuses the `orc-pattern` engine — you never codify yourself.

## Crosslink — cross-repo boundary publish + resolve (references/crosslink.md)

Runs as a Phase 3 add-on after the docs and BEFORE the closing `orc wiki sync`
(so the tags it emits get indexed by that same sync), riding the same scan
consent — no separate ask. Two halves, both advisory and never-blocking; skip the
consume half entirely when `.claude/orc-crosslink.config.yaml` is absent.

- **Publish (always, when this repo has an outward boundary):** from the
  `Contracts & shapes` rows already scanned, emit one per-point tag file per
  integration point under `wiki/crosslink/<kind>/<slug>.md` (schema
  schemas/crosslink-tag.md — Windows-safe reversible slug). You write the tag
  FILES (they carry scanned contract prose + evidence anchors); `orc wiki sync`
  then derives `wiki-meta.json`'s `crosslink_provided` array from their headers
  — never hand-maintain that array. Tags stay OUT of `wiki/INDEX.md` and `docs`
  (they are a machine index; keeping them out preserves the human index +
  `pages` count), which sync enforces by construction. Then run the crosslink
  integrity rule (integrity-check.md).
- **Resolve (only with a config):** read `.claude/orc-crosslink.config.yaml`
  (linked nodes + `repo_path`s + directed edges), walk THIS repo's call sites,
  and for each boundary matching an edge's `via: <kind>` toward a linked node,
  resolve that node's tag under `<repo_path>/wiki/crosslink/`. Record the
  dependency in `.claude/orc/crosslink/needs.json` (the drift baseline; the human
  never hand-lists tags) and sync a stamped snapshot into
  `.claude/orc/crosslink/cache/` (gitignored). Compute per-point drift against
  the needs baseline — a changed/vanished contract is a **warn only**, never a
  gate. Freshness = `min(Signal-A commit-distance, Signal-B day-age)` computed on
  read (crosslink.md). Emit `WIKI-CHECK crosslink …` trace lines when logging.

## Refresh & staleness (references/staleness.md — THE canonical freshness reference)

- **Freshness is computed on read, never stored:** consumers measure
  `scan_commit` (from `wiki-meta.json`) against HEAD and get a tier —
  FRESH / AGING / STALE — with per-skill reactions. Only orc-wiki writes the
  manifest; nobody persists a status.
- Each doc also records the git hash of the files it covers at scan time
  (advisory per-doc signal). Stale = recorded hash ≠ current state.
- **Incremental refresh** (recommended): diff since `scan_commit`, match the
  drift against the manifest's `docs` registry, re-scan only the affected
  docs, rewrite the manifest. Includes the **coverage-gap sweep** (changed
  files no doc covers → propose new areas) and the **dead-doc sweep** (registry
  entries whose `covers` match nothing → archive/delete, user decides) — see
  staleness.md.
- Selective refresh: re-scan only stale-flagged docs the user picks.
- Refresh touching a v1 doc (no `wiki_schema: 2` header) upgrades it to
  schema v2 in place — lazy migration, never a forced full re-scan.
- Pre-push: scan the git diff, refresh docs for changed areas before commit.
- Auto-flag hook: after an orc/orc-mini run, flag (do NOT auto-scan) the wiki
  docs whose covered files changed — ONLY if `wiki/` exists and is non-empty.
  User confirms any re-scan. On BIG full-lane runs the post-ship refresh ask
  (see staleness.md) replaces the passive note.
