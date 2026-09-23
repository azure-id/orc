# The build lanes (orc, mini, fast, ultra, diy, poly, learn, claude, combiner)

**Read: on demand** — read when touching one of these lanes or the shared build pipeline (waves, pauses, TDD, test authoring).

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **v1.9.0 — `/orc-mini`'s complexity read is COUNTED, and its wiki is
  POINTERS.** Five things, each with one owner. (1) **The complexity read is one
  line with numbers**, not a sentence of judgment: confident callers (`LOCAL` ·
  `IMPORT` · `UNIQUE` · `ROUTE`) OUTSIDE `declared_files`, the files they sit
  in, the tests that reach, the `cochange` partners with 3+ co-commits, and the
  planner's `facets.risk[]`. Four thresholds — **4+ caller files · 8+ callers ·
  any cited risk · a 3+ co-commit partner not in the plan** — each carrying its
  REASON in `references/complexity.md`. `AMBIGUOUS` callers print as `maybe <n>`
  and never trip one alone. It is an OFFER, never a switch, and continuing
  writes the NUMBERS into the decision log so `/orc-retro` can move a threshold
  instead of anyone arguing about it. `GATE complexity :: <the line>`.
  (2) **The planner is dispatched WITH those facts** (`graph_facts`: `map`,
  `impact`, `cochange`, `generation`, or `null`); a `cochange` partner the plan
  does not name is an `open_questions[]` entry, NEVER a silent addition. Both
  mini planner agents carry the paragraph. (3) **The exit gate BATCHES** —
  `orc graph ctx <paths>` five at a time confirms every `disposition: exists`,
  with a Glob fallback on exit 4 or an unindexed path. (4) **Wiki: PATHS, never
  bodies.** The orchestrator selects 1–3 page paths and puts them in the planner
  AND executor slices; it never reads a page body into its OWN context, because
  that context is the surface that fills up first. The shared lane-delta sentence
  in `_shared/phases/wiki-consult.md` now reads **"orc-fast and orc-mini pass
  POINTERS"**. (5) **Phase M runs the AFFECTED tests first** (`orc graph
  changes`), then build and suite, then a blast-radius line where `risk` never
  appears without its `why`; a `risk: high` row with no test adds ONE option to
  the EXISTING end-of-run batch — no new user turn, and mini still skips full
  review. Mini also LEFT the `graph-notes-pending` catalogue row (one
  `update --notes-pending` answers both) and GAINED `wiki-status`. Budget raised
  **270 → 280 with its comment**; the arithmetic lives in
  `references/complexity.md`. See `knowledge.md` §4z.

- **The batch pause is a DETERMINISTIC hard gate, and the Phase-1 knowledge
  gates always report (v0.28.0).** `batch_pause_every` is NOT a cadence hint:
  after wave W, `W % N == 0` with a later wave remaining forces the STOP SEQUENCE
  (never dispatch W+1 past an unacknowledged boundary); the schedule is confirmed
  at Phase 2 intake and persisted as `pause_schedule`. Wiki tier, resolved
  pattern, and crosslink state each print ONE user line at Phase 1 (the preflight
  block) — no tier/hit is silent. Full orc consumes only the pre-built crosslink
  `needs.json`/`cache/`, never `orc-crosslink.config.yaml` or peer source at run
  time; `configured-no-cache` warns the user. See `knowledge.md` §4p.

- **Test Authoring is an opt-in Phase 6.5 (`generate_tests`, default OFF).** It
  WRITES test cases (files + `TEST-PLAN.md` + curl bundle), NEVER runs tests,
  NEVER gates the ship; orc-mini offers it end-of-run on a GREEN smoke gate. The
  manual deliverables (`TEST-PLAN.md` + `test-cases.http`) are PINNED to a
  visible `test-generator/<change-slug>/` folder at the project root — never
  inside `.claude/`, never inside the run folder; a return pointing elsewhere is
  malformed. The folder is a shipped deliverable (committed on ship, not
  gitignored). The location sentence (`test-generator/<change-slug>/`) is a
  registered contract token in `bin/verify-contracts.js`. See `knowledge.md` §4c.

- **Code-pattern findings are opt-in (`pattern_findings`, default `ask`).**
  Patterns reconcile a per-language playbook against the project's real files:
  **conventions defer to the project; security/correctness invariants are
  always enforced.** The cache (`.claude/orc/patterns/<lang>-pattern.md`) lives
  outside `templates/` (`orc update` never clobbers it) and is injected
  LITERALLY into executor slices. Playbooks live under
  `orc-pattern/references/` (register new ones in `INDEX.md`). See
  `knowledge.md` §4d.

- **TDD is SCOPED to what can actually fail, and is a PAIRED TASK (v0.41.0).**
  Each `tdd_spec` entry carries a `disposition` from the closed set
  `new-surface | behavior-change | covered-by-existing | no-behavior |
  no-runner`, DERIVED from facets the planner already computes
  (`test_surface: none` + `novelty: mechanical` → `no-behavior`;
  `update-existing` + `mechanical` → `covered-by-existing`), so constants,
  translation strings and pure file splits get NO test. TWO guards make the skip
  safe: `covered-by-existing` MUST cite a resolvable existing test (the Phase-1
  gate Globs it and bounces the plan), and a task with non-empty `facets.risk[]`
  can NEVER be scoped out. Preflight prints a REQUIRED `skipped:` breakdown —
  a silently skipped test is indistinguishable from a forgotten one. **The
  monolithic Wave 0 is GONE:** the planner emits a separate TDD task per impl
  task that needs one and the impl task `depends_on` it; they are ORDINARY tasks
  (same conflict graph, own facets, same pause schedule), so independent red
  proofs share a wave while the dependency keeps every proof ahead of its code.
  No task needs a test → no TDD task and no extra wave. `wave-grouping.md`'s
  synthesized-task rule now covers only the mock example. There is NO config key
  — one would just restore the tautological tests. See `knowledge.md` §4z.3.

- **The fast lane (`/orc-fast`) is knowledge-gated and never stops the chat.**
  Two hard preflight prerequisites: a FRESH/AGING wiki (tier COMPUTED on read
  from `.claude/orc/wiki-meta.json` — never store a freshness status) + a
  cached code-pattern for the request's language; either missing → fallback to
  orc-mini via the `FALLBACK-FROM` handoff (`_shared/fallback-handoff.md`).
  The effort guard matches the exact skill name `orc`, so orc-fast
  legitimately runs at Sonnet medium — never add it to the guard. See
  `knowledge.md` §4f.

- **The ultra lane (`/orc-ultra`) is command-entry only, config-free.** It runs
  the `orc` skill with `ultra_mode: true` forced RUN-SCOPED (deep analyze,
  pattern/testgen/security on, executor tier floor) — never written to the
  user's config, never active in `/orc` or `orc-mini`. See `knowledge.md` §4e.

- **The context-combiner is lossless by contract (v0.12.0).** Merging 2+
  analyses must prove conservation: every source requirement ID gets exactly
  one outcome, `coverage_pct` must be 100 before `handoff_ready`, partial
  overlaps are SPLIT (never collapsed), stale inherited evidence is flagged.
  Full lane only; no mini variant.

- **The learn lane (`/orc-learn`) is human-onboarding, wiki-deep, and
  git-ignored (v0.22.0).** One feature per invoke: topics come from a
  FRESH/AGING wiki (tier computed on read; else a targeted scan of
  user-pointed files — never repo-wide, never a blocker), then the pinned
  `orc-learn-writer` deepens to function level (anchored functions + one full
  traced flow) and writes `learning-docs/<slug>/learning.md` (FAQ ≥5
  required) + `knowledge.md` (fingerprint header: `source_commit` +
  `covered_files`). Output is LOCAL — git-ignored, never a committed
  artifact; INDEX.md is writer-derived (allowed here: single-dispatch, no
  pause window — the wiki's CLI-only registration rule is wiki-specific).
  `refresh` computes per-feature freshness on read (reuses
  `wiki_fresh_max`/`wiki_aging_max`; no new config keys) and regenerates only
  user-picked features. Exactly ONE question per mode. See `knowledge.md` §4m.

- **The poly-repo lane (`/orc-poly`) is a cross-repo PLANNER, never a builder
  (v0.27.0).** Runs in the HOST repo (where it writes); the user pastes each
  PEER repo path (N peers) — OR a **crosslink node-name slug** from the HOST's
  `.claude/orc-crosslink.config.yaml` (resolves to the peer `repo_path` + the
  host↔peer relation via the `links[]` edges; an unrecognized slug lists the
  available names and offers pick-a-slug or paste-a-path). PEER **source is
  READ-ONLY** — the ONLY write into a peer is its handoff plan file (P5), never
  source, never a commit. HOST docs
  live under `poly-repo-implementation/<slug>/` (committed deliverable, never in
  `.claude/`): `poly-context.md`, the FROZEN `interface-contract.md` (the
  anti-drift artifact), and `poly-spec.md` (marker `orc-poly:spec`). A missing
  wiki is NEVER a blocker — orc-poly asks the user for scope (folders/pattern),
  never a blind scan, never a fallback lane. On "pass to orc-plan" the SHARED
  planner self-activates **poly-repo split mode** on the marker and emits one
  plan per repo (HOST plan in HOST, each PEER plan written into its own repo),
  every plan pinning the same frozen contract so each repo's later plain `/orc`
  build stays on contract. Non-poly specs never trigger the branch. The `/orc`
  spine itself honors the ONE exception to "planning always runs Phase 2–8": a
  poly-spec is split-and-STOP (present per-repo plans + handoff, never build) —
  orc/SKILL.md Phase 1 + the orc-planner subskill (spine budget raised 330→335
  for it). Not
  effort-gated (the guard matches the exact name `orc`). Contract tokens
  `orc-poly:spec` / `poly-repo-implementation/` / `interface-contract.md` are
  registered in `bin/verify-contracts.js`. See `knowledge.md` §4o.

- **The CLAUDE.md builder (`/orc-claude`) is local-target, zero-question,
  never-trimming.** It writes ONLY the current repo's `CLAUDE.md` — never
  `~/.claude/CLAUDE.md`. Generated content lives in `orc-claude:section`
  fences under an `orc-claude:meta` header; refresh regenerates only
  fingerprint-stale sections. Existing user content is NEVER trimmed; the
  `ORC-WIKI:START` block is byte-preserved. The skill never writes the file
  itself — it dispatches the pinned writer agent. See `knowledge.md` §4g.

- **The DIY lane (`/orc-diy`) is CLI-composed, compiled, and hard-gated
  (v0.16.0).** Flow shape is written ONLY by the `orc diy` CLI
  (`orc-diy.config.yaml` → `orc diy compile` → `FLOW-COMPILED.md` +
  `flow.lock.json`); the skill never configures or stitches in-session —
  UNCONFIGURED/STALE never runs and offers plain `/orc`. The compiler parser
  in `bin/cli.js` mirrors the block grammar in
  `orc-diy/references/blocks/` — change both together, and that obligation now
  includes the **documented stitch order** in `references/compile.md` (it lost
  `mock-example` for a release, so a maintainer reconciling spec to code would
  have deleted a working phase; a golden test compares the two lists).
  **`orc diy status` is an EXIT-CODE contract (v0.34.7):** 0 = READY,
  1 = STALE | UNCONFIGURED — same convention as `orc pattern status <lang>`,
  which it used to invert by exiting 0 in every state. STALE reports EVERY live
  trigger, not just the first. The build-your-own
  guide is the skill's own README. See `knowledge.md` §4h.

- **Knowledge deepening + verification revamp (v0.33.0) — five hard rules.**
  (1) **ATLAS peer write is the SECOND sanctioned exception** to crosslink's
  never-write-foreign rule (first: orc-poly's handoff plan): a session may
  write ONLY `wiki/crosslink/atlas.md` and — via `/orc-wiki crosslink
  compile` — the CLAUDE.md pointer block into a linked repo; FILE writes only,
  never commit, never push, warn-only on failure. `orc wiki sync` treats
  `atlas.md` as DERIVED (never a registered doc, never bulk-deleted).
  (2) **`mock-examples/` is NEVER committed** — ship excludes it from staging;
  do NOT edit `.gitignore`. In `mock_example: ask` (default) the offer after a
  GREEN verify is MANDATORY (never silently skipped, never silently run);
  drift recovery (`_shared/drift-recovery.md`, `DRIFT-FROM`) is hard-capped at
  2 loops. (3) **TDD is always on in full orc + ultra + standalone `/orc-plan`**
  (`tdd_spec` in every plan; Wave-0 red proof; repair loop capped by config
  `tdd_loop_max`, default 3, then STOP + honest red report); orc-mini asks ONE
  intake question; orc-fast never (no planner); orc-diy composes it (`tdd` flow
  key). **Each `tdd_spec` entry carries a `kind` (v0.34.4):** `new-surface` MUST
  be red pre-implementation (green = spec bug, blocks that requirement),
  `regression-guard` is EXPECTED green (its passing IS the assertion, blocks
  nothing) — the rule was mis-scoped to greenfield and five consecutive runs had
  to override it. Phase 6 =
  deterministic TDD gate + adversarial review in ONE verifier slot; the Phase 5
  reviewer stays SEPARATE. TDD tests live in the project's test tree and ship
  with the code — distinct from Phase 6.5's never-run `test-generator/`
  deliverables. (4) **Delta is the default wiki refresh**: `orc wiki impact`
  (bin/cli.js — exit 0/1/2/3) decides; a FULL refresh is recommended
  (threshold `wiki_delta_full_threshold`, STRUCTURAL, aging), never silent.
  (5) **`wiki/orc-orientation.md` is derived at assemble** (never a scan
  area), registered like any doc, read FIRST by every consumer. See
  `knowledge.md` §4t.

