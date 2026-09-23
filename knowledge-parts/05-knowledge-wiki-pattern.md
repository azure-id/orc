# knowledge.md — Part IV — Knowledge (wiki · pattern · crosslink · gotchas)

**Read: on demand** — read when touching `orc wiki`, `orc pattern`, crosslink, freshness, the knowledge gates, or the gotcha ledger.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4d. Code-pattern findings (executors match the project's house style)

So executors write code that matches the EXISTING codebase (not a generic
template), the run resolves a per-language **code-pattern** at dispatch. New
sibling skill **`orc-pattern`** (`/orc-pattern`) + agent
**`orc-pattern-codifier-sonnet-5-high`** reconcile a generic per-language playbook
against the project's real files.

- **Two rule classes.** Playbooks split into **Conventions** (style/shape:
  layout, naming, DI, delivery order) — the PROJECT wins on conflict — and
  **Invariants** (security/correctness: no plaintext passwords, no SQL string-
  interpolation, no secrets/stack-traces exposed, effect cleanup, no index-as-key)
  — ALWAYS enforced. Reconciliation only ever overrides the soft (convention) half.
- **Playbooks** live in `templates/skills/orc-pattern/references/` split per
  language, selected via `INDEX.md` (FE: react, nextjs, vue, angular; BE: fastapi,
  django, nestjs, express, go — extensible). The codifier reads the generic playbook + the
  most-recently-modified real files and returns a reconciled pattern
  (`schemas/pattern-doc.md`): conventions [project-won] + invariants [always] +
  conflicts + a `fingerprint` + `pattern_version`.
- **Cache:** `.claude/orc/patterns/<lang>-pattern.md` (project `.claude/`, one per
  language, reused across runs; refreshed only on drift vs. the recorded fingerprint
  or `/orc-pattern --refresh`). The orchestrator writes it; the codifier only returns.
- **Cross-cutting `postgres` playbook (v0.14.0).** `be-postgres.md` is a DB
  data-access playbook (the `getDataUser` layer) that CO-APPLIES with the framework
  lang rather than replacing it: a Postgres project (driver/ORM in deps — `pg`,
  `psycopg`, `asyncpg`, `pgx`, `lib/pq`, `Npgsql`, Prisma `postgresql`, `postgrex`)
  also codifies `postgres-pattern.md`, and any task tagged `db:postgres` (its
  `declared_files` touch repositories/dao/queries, `*.sql`, ORM entities/migrations)
  gets it MERGED into its slice ON TOP of the framework pattern (or standalone if the
  task has no framework lang). Query invariants — bound params only (no SQL
  string-interpolation), pooled connections, transactional multi-writes, no inline
  DDL, no leaked driver errors — ride the EXISTING `pattern` slice +
  `invariants_checked`/`pattern_version` return + Reviewer invariant re-check, so
  there is **no new contract token**. Tagged at Phase 2, resolved + merged at Phase 3.
  Purely static — never connects to a database. It is a data-driven `INDEX.md`
  addition ("no code changes" extension), so `bin/verify-contracts.js` is unchanged.
  **All three lanes co-inject it on a cache HIT for a data-access task:** full
  (resolve/codify + merge), `orc-mini` (inject-if-cached; mini never codifies), and
  `orc-fast` (bonus-only — NEVER a gate prerequisite, so a missing `postgres-pattern.md`
  never triggers a fast→mini fallback). Cache miss on mini/fast falls back to the
  universal invariants + neighbor imitation, not a codify.
- **Config.** `pattern_findings: ask (default) | on | off` — on an FE/BE cache MISS
  during Phase 3: `ask` = P0 prompt (batched once for all missing langs), `on` =
  auto-codify, `off` = agnostic. Cache HIT is used silently.
  `orc_wiki_pattern_findings: false (default) | on` — orc-wiki codifies ALL detected
  langs during its scan (on/off only; rides under the wiki's scan-consent).
- **Three entry points, one cache.** Lazy (`/orc` dispatch miss), eager (`orc-wiki`),
  manual (`/orc-pattern`). **Agnostic fallback** (declined/off/no-playbook): no
  codifier, no scan — executor enforces the universal invariants and imitates
  neighbor files it already reads (~zero added cost).
- **Anti-skip (3 layers).** (1) resolved conventions + blocking invariants injected
  LITERALLY into each executor slice (`pattern` field, never a pointer); (2) executor
  return echoes `pattern_version` + `invariants_checked` (validated like
  `actual_model` — a false/absent attestation on a pattern task is malformed);
  (3) the Reviewer independently re-checks invariants against the diff (violation =
  blocking). With `logging: true`, the applied `pattern_version` is recorded.
- **Drift by design (update every copy):** the `pattern` input slice + the
  `pattern_version`/`invariants_checked` return fields are duplicated across the 6
  executor agent files + `orc-execution` (SKILL.md + core.md); the `invariants[]`
  re-check is in the reviewer agent + `orc-review-verify` (SKILL.md + core.md).

## 4i. Crosslink — cross-repo wiki references (advisory; orc-wiki subsystem) — v0.17.0

Lets one repo's wiki reference **another repo's** wiki at integration boundaries
(BE↔FE, BE→gRPC, …) so executors ground against real cross-repo contracts. Three
principles: **advisory, never blocking** (every failure — missing repo, no wiki,
old schema, drift, breaking change — warns, never gates); **read foreign WIKI
only** (never foreign source, never a foreign write; footprint is read-only wiki
files + read-only git queries in the linked checkout); **coarse human config,
precise machine discovery** (the CLI captures topology, orc-wiki discovers the
per-point tags). NOT a new skill — it has no slash command or runtime role, so it
lives as an orc-wiki subsystem (references + README there), avoiding
`verify-package.js` skill-count churn.

- **Files:** `.claude/orc-crosslink.config.yaml` (human graph — written ONLY by
  `orc crosslink`, like the diy config; directly under `.claude/`),
  `.claude/orc/crosslink/needs.json` (machine drift baseline — per-point tags
  this repo consumes, committed), `.claude/orc/crosslink/cache/**` (machine
  snapshot mirror, **gitignored**), `wiki/crosslink/<kind>/<slug>.md` (this
  repo's own per-point provider tags — project-root `wiki/`, committed). All
  outside `templates/`; `orc update` never clobbers them.
- **Provider emission (ALWAYS ON, per scan-task — v0.24.0):** publish is no
  longer a Phase-3 add-on with an enable switch — it is a per-scan-task
  byproduct of reading the code, the same pattern registration follows (hard
  rule 8). Each scan agent returns a REQUIRED `crosslink_tags` field
  (schemas/wiki-doc.md) — one evidence-anchored tag body per OUTWARD boundary
  point it found IN SOURCE (routes/gRPC/events, not doc prose — which kills the
  "thin docs starve the publish" failure), or the token `none`+reason; a return
  missing the field is MALFORMED → requeue. The orchestrator writes the doc AND
  its tags to `wiki/crosslink/<kind>/<slug>.md` (Windows-safe reversible slug:
  `/`→`_`, `:`→`.`) then runs `orc wiki sync` — so the boundary accrues from the
  FIRST scan-task, however the run ends (a paused run has a live partial
  boundary matching its live partial docs). Trace carries a `tags:N`/`tags:none`
  count per scan-task. Phase 3 shrinks to consumer resolve + dead-tag sweep +
  integrity. `crosslink_provided` is still the derived machine index (NOT
  `INDEX.md`/`docs` — keeps the human index + `pages` clean).
- **Preservation (v0.24.0 — never delete, only replace):** no refresh mode
  (incl. full regenerate) clears `wiki/crosslink/` first; each tag is
  overwritten per-point as its area re-scans. A tag whose boundary genuinely
  vanished is retired ONLY by the **dead-tag sweep** (the crosslink analog of
  the dead-doc sweep, staleness.md): anchor file gone, or the re-scanned area
  returned `crosslink_tags` without it → offer archive/delete per tag, never
  silent. This is what stops a regenerate from wiping the surface (the first
  observed bug).
- **Silent-zero is impossible now (v0.24.0 — three LOCAL-artifact guards, all
  gateable; foreign drift stays warn-only):** (1) `orc wiki sync`'s boundary
  detector — a non-empty `## Contracts & shapes` table (`boundary_rows`) with
  zero tags → prominent warning + `--check` exit 1; (2) the N→0 tripwire — the
  manifest listed tags but the folder is now empty → warning + `--check` drift
  (sync still writes: files are the source of truth, it just can't erase the
  registry silently); (3) the `crosslink-anchors` integrity item is now
  UNCONDITIONAL (was "only when this repo published a boundary this run"): any
  doc reporting boundaries OR carrying a non-empty `Contracts & shapes` table
  requires `wiki/crosslink/` to exist with every tag on disk + registered, and
  a zero-tag completion needs the explicit "crosslink: no outward boundary
  ({reason})" line — a bare zero-tag finish FAILS. `orc wiki status` reports the
  tag count or `crosslink: UNPUBLISHED boundary`.
- **Consumer discovery (Phase 3 add-on, only with a config):** walk this repo's
  call sites; each boundary matching an edge's `via:<kind>` toward a linked node
  resolves that node's tag under `<repo_path>/wiki/crosslink/`, records the need,
  syncs a stamped cache snapshot, and warns on per-point drift.
- **Graph (`orc crosslink` CLI):** nodes + directed edge list (a pair can have
  multiple edges/directions), `self` is node 1 (auto from package.json/dir name)
  and always option 1 in the linked-to picker. Add flow: name → repo ROOT path
  (paste-time git-based freshness report; degrades to date-only when git
  unavailable, PENDING when path missing) → kinds multi-pick (extensible catalog
  + "Other") → explicit direction (`this repo CALLS them` / `they CALL us` —
  drift runs only on edges whose `from` is self) → target. Bulk-add peeks the
  linked repo's OWN config and offers to mirror a reciprocal edge (no config
  there → warn, continue). Offers once to gitignore the cache dir. Subcommands:
  `list`/`status`/`remove`; bare `orc crosslink` = interactive (non-TTY prints
  the graph). Project-scoped; rejects `--global`.
- **Freshness (two orthogonal signals, computed on read, `min()` governs):**
  Signal A = provider wiki tier (the SAME git-commit-distance compute, run
  read-only in the linked checkout with DEFAULT edges 10/30; falls back to the
  `source_tier` stamped at sync when the provider isn't checked out); Signal B =
  snapshot age (the ONLY day-based tier in the constellation — two repos share no
  commit axis — via `crosslink_fresh_days` 10 / `crosslink_aging_days` 15). Never
  stored; the cache stamp is a fallback INPUT. Precedence extends the local rule:
  `local code > local fresh wiki > cross-repo fresh wiki (hints) > cross-repo
  stale wiki (weak hints) > model priors`.
- **Run-time injection:** orc/orc-fast/orc-mini inject the cached linked contract
  into a task's slice ONLY when a declared file touches a matching need — same
  mechanism as the `pattern` slice, but advisory: NO executor return contract
  (nothing to attest). Absent needs file or no boundary → nothing extra.
- **Drift surfaces (update every copy + the lint table):**
  `orc-crosslink.config.yaml` / `crosslink/needs.json` / `crosslink/cache/` /
  `wiki/crosslink/` / `crosslink_provided` span the orc-wiki README + SKILL.md +
  crosslink/staleness/integrity references + crosslink-tag schema (needs.json
  also spans orc/orc-fast/orc-mini + orc-execution SKILL.md/core.md — the
  run-time consumers; `wiki/crosslink/` also spans the orc-wiki command +
  staleness.md as of v0.24.0); `crosslink_fresh_days` spans config.md +
  staleness.md + crosslink.md + the schema. NEW v0.24.0 lint token
  `crosslink_tags` spans SKILL.md + crosslink/integrity/staleness references +
  crosslink-tag + wiki-doc schemas. The CLI's `CROSSLINK_KINDS` mirrors
  `crosslink-kinds.md`, the two config keys mirror `config.md`, and the sync
  boundary detector (`countBoundaryRows`) + N→0 tripwire + status tag count live
  ONLY in `bin/cli.js` — documented drift like the diy compiler (the lint's ROOT
  is `templates/`, cannot see cli.js). The table in `bin/verify-contracts.js` is
  authoritative for the contract count; `npm run verify` prints the current
  total (this section grew the set in v0.24.0).

## 4j. Wiki registration — `orc wiki sync` (the CLI owns it) — v0.18.0

**The split.** The wiki has two halves with opposite natures, and conflating
them was a real bug:
- **Docs** (`wiki/*.md`) — prose. Needs a model to read code. Expensive. Written
  by orc-wiki's scan agents.
- **Registration** (`wiki/INDEX.md` + `.claude/orc/wiki-meta.json`) — the index
  + manifest that make the docs findable. **100% derived** from the docs' own
  headers (schemas/wiki-doc.md carries `doc_type`/`area`/`covers`/`keywords`/
  `scanned_commit`/`covered_files`/`status` — field-for-field the manifest's
  `docs` registry). Written ONLY by `orc wiki sync`. No model, ever.

**The bug it fixes (v0.17.3 and earlier).** Registration was the model's job at
the END of orc-wiki's Phase 3 — the last step of a lane that pauses every 5
scan-tasks *by design* (hard rule 3) and calls multi-session resume "expected and
normal". Worse, a pause and a completion presented identically (both = dispatch
report + `/usage` reminder). So the normal outcome of scanning any repo with >5
areas was: real docs on disk, zero registration, user believes it's done. The
wiki was then invisible to every consumer, and `orc crosslink` reported
`no wiki-meta.json — run orc-wiki`, sending people to re-buy a wiki they owned.
Same class as the v0.17.2 trace bug (§4b): **an essential artifact that depended
on model memory at the least reliable point in the run.** Same cure: a
deterministic writer.

**Vocabulary (the fix's core insight).** `UNREGISTERED` ≠ missing ≠ stale. Docs
without a manifest are a real, possibly-complete wiki that nothing indexed.
Likewise **incomplete coverage ≠ unregistered**: a paused scan has both, but only
coverage costs money to fix. Never offer a refresh/re-scan for a registration
problem. States: `registered` / `UNREGISTERED` / `corrupt` (unparseable JSON) /
`drifted` (docs added/removed since) / `none`.

**Mechanics.**
- `orc wiki sync` — derives + writes both artifacts; idempotent; never scans,
  never edits a doc. `--check` = read-only (exit 1 on drift). `orc wiki status`
  names the state.
- **`scan_commit` = the OLDEST resolvable doc `scanned_commit`** (greatest
  `git rev-list --count <c>..HEAD`), never the newest: the wiki is only as fresh
  as its oldest doc, and overstating freshness is the one error an anchor must
  not make. Unresolvable → key omitted → consumers treat as pre-manifest.
- **`commands` is the one non-derivable key** (build/test/lint, discovered at
  scan time, in no header). Sync preserves it across rebuilds, else falls back to
  `package.json` scripts. It is the ONLY manifest key a model may hand-edit.
  Absent → orc-fast's smoke gate rediscovers tooling (degraded, not broken).
- **v1 docs degrade, never fail**: no `covered_files` → `covered_hash` preserved,
  entry stays indexed; integrity's `schema-upgrade-note` lists them for lazy
  upgrade.
- `crosslink_provided` is derived from `wiki/crosslink/**` headers. Tag FILES
  stay model-written (scanned contract prose + anchors); the ARRAY is an index.
  Tags cannot leak into `INDEX.md`/`docs` — sync builds them from different
  sources.
- **Sync crosslink guards (v0.24.0).** `orc wiki sync` gained a cheap
  `countBoundaryRows` detector (counts data rows in each doc's `## Contracts &
  shapes` table): `boundary_rows > 0` with an empty derived `crosslink_provided`
  → prominent "boundary documented but no crosslink tags" warning + `--check`
  exit 1; and an N→0 tripwire — a previous non-empty registry now deriving to
  zero → "tags VANISHED" warning + `--check` drift. Sync stays a truthful
  deriver (files are the source of truth, write mode still writes) — it just can
  never erase the registry silently. `orc wiki status` prints `crosslink tags:
  N` or `crosslink: UNPUBLISHED boundary`. These are the shipping-side half of
  the always-on crosslink fix (§4i); the detector is coarse by design (any
  non-empty `Contracts & shapes` table counts, so a repo documenting only
  internal DB/env rows can warn until it publishes or the backfill records
  `none`).

**Skill-side prevention (orc-wiki SKILL.md).**
- Hard rule 8 inverted: "you NEVER hand-write registration — you run
  `orc wiki sync`", after **every scan-task**, at every pause, and at Phase 3.
- Phase 0 runs `orc wiki sync --check` FIRST; new **REPAIR** branch takes
  precedence over REFRESH and offers the free fix (never bundles a scan). Can
  coexist with RESUME — register first, then price the remaining areas separately.
- Pauses lead with `⏸ PAUSED — not finished ({N} of {M} areas)`; completion says
  `✅ Wiki complete`. A pause must never read as a finish.
- Phase 3 order (v0.24.0): architecture doc → crosslink RESOLVE + dead-tag sweep
  → **sync** → integrity → CLAUDE.md block → report. Publish already happened
  per scan-task (§4i), so Phase 3 no longer publishes. Integrity runs AFTER sync
  (validates the derivation rather than racing it).

**Integrity collapse.** index-sync / registry-sync / counts-match /
crosslink-sync compared four hand-maintained artifacts. Derivation makes them
structurally incapable of disagreeing, so they became one line:
`orc wiki sync --check`. What remains is what derivation *cannot* see:
covers-resolve, coverage-report, claudemd-match (the pointer block is
hand-injected), schema-upgrade-note, anchor-spot-check, crosslink-anchors.

**CROSSLINK-ONLY (`/orc-wiki crosslink`, SKILL.md Phase 3c) — a LEGACY BACKFILL
as of v0.24.0.** Because publish is now per-scan-task (§4i), a ≥v0.24.0 wiki
always has tags — so this branch exists ONLY for wikis whose docs predate
v0.24.0 (docs exist, `wiki/crosslink/` absent). On a current-version wiki,
missing tags are NOT this branch: the sync boundary guard/`--check` fired and
names the fix. The material is already on disk in the docs' evidence-anchored
`Contracts & shapes` rows, so the backfill branch:
reads those rows (docs, not source), dispatches Opus 4.8 high over **only the
anchored files** to pull each contract body (unanchorable row = SKIPPED +
reported, never guessed), writes the tags, runs the consume half when a config
exists, then `orc wiki sync` + crosslink-anchors integrity. Never re-scans an
area, rewrites a doc, or touches coverage/`pages` — **coverage is a scan
question, the boundary is not, and conflating them is what sells people a
re-scan they don't need.** Prereq: docs exist (else refuse). Consent is a small
honest note, NOT the scan warning. Sync can never do this: a tag needs the
contract body pulled from the anchor, which is model work — sync only INDEXES
tag files that already exist. **A zero-tag outcome is always explicit +
reasoned, never a bare finish:** rows genuinely too thin/absent to tag → SAY so
and recommend an incremental refresh of just those areas (an honest cost — the
one case where a refresh IS the answer, dropping the old "never a refresh"
dogma); a pure consumer (inbound-only edges, no API of its own) → valid no-op
but NAME the inbound-only edges it rests on.

**Consumer + surfacing changes.** `crosslinkProviderInfo` (cli.js) now checks
`<repo>/wiki/` for docs before concluding anything from a missing manifest, and
splits `no-wiki` / `unregistered` / `corrupt` into three distinct messages
(previously all three, plus a JSON parse failure, returned `no-wiki`). The
statusline prints `wiki: UNREGISTERED (run \`orc wiki sync\`)` so the state can
never be silent again.

- **Drift surfaces (update every copy + the lint table):** `orc wiki sync` spans
  the orc-wiki command + statusline hook + orc-wiki README + SKILL.md +
  crosslink/integrity/staleness references + crosslink-tag schema;
  `UNREGISTERED` spans the statusline hook + orc-wiki README + SKILL.md +
  crosslink.md + staleness.md; `CROSSLINK-ONLY` spans the orc-wiki command +
  orc-wiki README + SKILL.md + crosslink.md.
  The `wiki-meta.json` / `covered_files` / `wiki_schema` / `wiki/crosslink/` /
  `crosslink_provided` sets are unchanged in membership but their *writer*
  statement changed everywhere. cli.js's parser mirrors `schemas/wiki-doc.md` —
  documented drift like the diy compiler (the lint's ROOT is `templates/`, it
  cannot see cli.js). **The table in `bin/verify-contracts.js` is authoritative
  for the contract count; `npm run verify` prints the current total** (this
  section grew the set in v0.18.0).

## 4n. Deterministic artifact detection — a generated wiki/pattern is never missed (v0.25.0)

**The bug.** A generated wiki manifest and a cached code-pattern must be seen by
every lane that gates on them. But existence was described declaratively (a path)
and the actual probe was left to the model's ad-hoc `find`/glob/`ls`. Both
artifacts live under the HIDDEN `.claude/` dir (`.claude/orc/wiki-meta.json`,
`.claude/orc/patterns/<lang>-pattern.md`), so a search that skips dot-directories
or runs from the wrong CWD (a subfolder, an eval sandbox root) false-negatives —
`/orc-fast` reported both prerequisites "missing" when both were present, and
needlessly fell back to orc-mini.

**The fix — existence is a shared contract, decided by deterministic CLI probes.**
Canonical prose: `templates/skills/_shared/detecting-artifacts.md` (the existence
sibling of `staleness.md`, which stays the source of truth for FRESHNESS). The
rule: at preflight, BEFORE any gate logic, probe ONCE with the CLI and treat its
output as the source of truth — never a raw filesystem search, never second-guess
a positive result.

- **Wiki:** `orc wiki status` → `none | unregistered | corrupt | drifted |
  registered`. Only `none` = truly absent; every other state = wiki EXISTS.
- **Pattern:** `orc pattern status <lang>` → exit 0 = cached, exit 1 = absent (the
  exit code IS the contract); no arg lists every cached language. New in v0.25.0
  (`patternStatus`/`listPatternLangs`/`patternsDir` in `bin/cli.js`); mirrors
  `orc wiki status` and resolves `.claude` via `resolveClaudeDir` (CWD-independent).

**Consumers rewired to point at the contract** (contract-lint token
`detecting-artifacts.md`, registered in `bin/verify-contracts.js`): orc-fast's
two F0 preflight gates, `references/wiki-consult.md` (Trigger), `references/
pattern-gate.md` (Phase 3 resolve), `orc-wiki/references/staleness.md` (consume
rule), orc-mini (postgres grounding), orc-verify (step 2). Lanes that only
delegate to those references (orc Phase 1, orc-learn topic pick) inherit the rule
for free. **Documented drift the lint can't see:** the CLI half — the
`orc pattern …` command dispatch + help in `bin/cli.js` — lives outside
`templates/`, so a change to the probe grammar must touch cli.js in the same commit.

---

### 4n.1 The artifact probe answers "unknown key", not "absent" (v0.34.8)

`orc pattern status <lang>` globbed `<lang>-pattern.md` and would report on a key
that exists nowhere in the payload. Three independent parts of the payload agree
the keys are FRAMEWORK names from `orc-pattern/references/INDEX.md` (`express`,
`react`, `fastapi`, …) — the detection map, `orc/references/pattern-gate.md`, and
the codifier — but the CLI is key-agnostic and caches whatever it is handed.

Probing `js` therefore returned a clean "absent", the knowledge gate fell back
CORRECTLY, and the failure read as a lane defect: the eval that demanded the
cached artifact failed *while the artifact sat right there under its real name*,
and it failed the way correct behavior looks. Two graded runs, one phantom P1.

Now: **exit 2 = unknown language key**, with the real keys listed; 0 (cached) and
1 (absent) are unchanged, so no existing gate moves. The no-arg form exits 1 on
an empty cache — the same absent contract, previously 0. Documented at the call
site in `_shared/detecting-artifacts.md`, which is where a lane reads it.

This is the shipped half of the eval-suite hygiene pass; the rest of that work
(targeted reset ritual, answer-key isolation, the `js`→`express` sweep, splitting
eval 11's session-tier contradiction into an 11b, and pointing the trace harness
at the live hook instead of a frozen v0.23.0 snapshot) lives in the fixture repo
and is deliberately NOT part of this package.

---

## 4t. Knowledge deepening + verification revamp (v0.33.0)

Single release, six features. Locked decisions: atlas peer write SANCTIONED
(file only, never commit/push — exception #2 beside orc-poly's handoff plan);
mock example never committed (ship never stages `mock-examples/`, no
`.gitignore` edit) and always ASKED in `ask` mode; TDD scope full orc + ultra
always · mini one intake question · fast off; Phase 5 reviewer stays SEPARATE
from the adversarial Phase 6; caps configurable (`tdd_loop_max` 3) or fixed
(drift recovery 2).

1. **Wiki orientation doc** (`wiki/orc-orientation.md`,
   `orc-wiki/references/orientation.md`) — DERIVED at Phase 3 assemble from the
   already-written docs (never a new scan area): Repo identity · Reading order ·
   anchored Journeys · conditional Neighbors. Registered via its standard
   header (sync); regenerated free whenever a doc it points at refreshes.
   `wiki-consult.md` reads it FIRST; integrity check item 7 verifies it.
2. **ATLAS** (`wiki/crosslink/atlas.md`, crosslink.md ATLAS section) — ONE
   repo-agnostic federation doc in EACH linked repo: Federation map (incl.
   transitive nodes), Per-node profiles + peek hints, Freshness ledger
   (`min(own wiki tier, oldest peek age)`, computed on read). Generated at
   every scan/refresh end + cheap regenerate from cache in build lanes; after
   the local write, the SAME file is written into each linked repo — the
   sanctioned peer FILE write (never commit/push, warn-only). Newest `generated`
   stamp wins on read. Sync treats it as derived (never registered, never
   bulk-deleted; explicit in `readWikiDocs`' crosslink skip + a test).
   orc-poly reads it and lists transitive nodes at slug resolution.
3. **CLAUDE.md injection v2 + `/orc-wiki crosslink compile`**
   (`claude-md-injection.md`, `crosslink-compile.md` new) — the pointer block
   gains the orientation "read first" line + a conditional atlas line; block
   content versioned, in-place update. The compile branch (hard precondition:
   crosslink config with ≥1 edge) does resolve → local atlas → peer atlas
   writes → CLAUDE.md injection locally AND per peer (peer with no CLAUDE.md
   gets a minimal block-only file) → one summary line per repo; every step
   warn-only, never a re-scan; one end-of-run trace packet.
4. **Commit-scoped delta refresh** (`orc wiki impact` in `bin/cli.js`,
   staleness.md mode 1 rewritten) — the deterministic probe maps
   `git diff <scan_commit>..HEAD` against the registry's
   `covers`/`covered_files`: per-doc `CLEAN | TOUCHED (n) | STRUCTURAL` +
   blind-spot sweep; exit 0 clean / 1 can't-compute / 2 delta / 3 full
   recommended (threshold `wiki_delta_full_threshold` % of registered docs,
   default 30 · STRUCTURAL · `wiki_aging_max` distance). DELTA is the default
   refresh path (Phase 0); full is recommended, never silent — user decides.
   Golden-fixture test in `test/cli.test.js`.
5. **Mock example + drift recovery** (`_shared/drift-recovery.md` canonical —
   sibling of fallback-handoff; config `mock_example` ask|on|off) — after a
   GREEN verify/smoke gate, before ship, implementation lanes only (orc 6.7,
   mini X, fast F3.5, ultra after Gate 3, DIY block): build
   `mock-examples/<change-slug>/` (EXAMPLE.md + one runnable mocked artifact;
   never real services). ONE question after the user runs it; `drift:` →
   `DRIFT-FROM` handoff → analyze-mini gap analysis → mini planner patch plan →
   scored dispatch → re-verify → re-offer, HARD CAP 2 then honest unresolved
   report. Trace verbs `PHASE mock-example`, `DRIFT loop=<n>`.
6. **TDD-anchored planning + adversarial verify** — planning-output gains
   required `tdd_spec` (per-requirement given/when/then + runnable skeletons,
   or `tdd: exempt — <reason>`; no runner → whole-run exemption, one preflight
   line). Wave 0 materializes the failing tests (red proven; a pre-impl pass =
   spec bug → blocks that requirement). Executor slices carry `tdd_spec` +
   return `tdd_state: green|red` (green needs quoted evidence; `done`+red
   malformed — return-validation §5); repair loop capped at `tdd_loop_max`
   (config, default 3), trace `TDD-RED`/`TDD-GREEN`. Phase 6 = TDD gate
   (deterministic; `tdd_suite[]` slice, `tdd:{green,red,exempt}` return) +
   adversarial review (edge cases, error paths, contract violations,
   race/ordering, workflow breaks — existing P0–P3 semantics). `/orc-verify`
   gains the adversarial pass, stays report-only. Phase 6.5 testgen untouched
   and distinct (TDD tests DO run and ship with the code; `test-generator/`
   never runs). DIY: `tdd` flow key + `diy:when tdd=on` sections in
   planning/execution/verify blocks + the `mock-example` block/order slot
   (compiler + blocks changed together).

CLI floor: CONFIG_META keys `mock_example` (ask), `tdd_loop_max` (3),
`wiki_delta_full_threshold` (30, advanced); DIY_META keys `mock_example` +
`tdd`; `orc wiki impact`; sync/atlas derived handling. Tests: new-key
validators, impact golden fixture (CLEAN→DELTA→FULL), sync-atlas preservation.
Contracts: 14 new tokens registered (impact, atlas.md, crosslink compile,
orc-orientation.md, mock-examples/, drift-recovery.md, DRIFT-FROM, tdd_spec,
tdd_loop_max, tdd_state, tdd_suite, TDD-RED, mock_example,
wiki_delta_full_threshold); spine budgets raised 392→424 (orc), 264→289
(wiki), 197→219 (mini), 171→179 (fast) — documented in BUDGETS.

### 4t.1 Wiki: silent tag loss, and a delta that could not clear itself (v0.34.5)

Two P1s that corrupt the wiki's own guarantees — one loses a published boundary
while the integrity gate reports GREEN, the other makes the v0.33.0 delta
feature unable to report its own success.

1. **`orc wiki sync` dropped any tag whose `kind` contains `/`, and `--check`
   still exited 0.** The registry walk was exactly ONE directory level deep,
   while the payload's own catalog ships `auth/oidc` — so with 7 well-formed tag
   files on disk sync said "6 indexed", the manifest held 6, and the gate passed.
   That gate (integrity item 6) exists precisely to catch "boundary documented,
   nothing published", and the N→0 tripwire could not help either: the surface
   did not go to zero, it went to 6-of-7. A consumer resolving `auth/oidc:*`
   finds nothing and concludes this repo publishes no identity boundary.
   Two fixes: (a) the enumeration is RECURSIVE, so a pre-v0.34.5 wiki keeps the
   tag it already has, and the kind DIRECTORY is sanitized `/`→`-` on write with
   the header keeping `kind` verbatim (`kind` was always read from the header —
   proven to round-trip exactly); (b) the durable one — sync compares FILES FOUND
   vs ENTRIES WRITTEN and fails `--check` on any mismatch. (a) fixes the known
   trigger; (b) catches the next one.
2. **A completed delta refresh re-reported the identical delta forever.**
   `orc wiki impact` matched ONE repo-wide diff, anchored on `meta.scan_commit`,
   against every doc — and `scan_commit` is the OLDEST doc's anchor by design,
   which a delta refresh leaves untouched by definition. Measured: before a
   refresh 3 touched / 60% / exit 3; after a complete, correct DELTA refresh
   **identical**; only the FULL refresh moved the anchor. The user is told to run
   the expensive path the feature exists to avoid, forever. Fix: each doc is
   measured against its OWN `scanned_commit`; the global diff stays the input to
   the blind-spot sweep, which genuinely needs a repo-wide view. `last_scan`
   moves to the NEWEST doc's stamp (it reported a delta's start time while
   summarizing docs written 20 minutes later); `scan_commit` stays the oldest
   deliberately — it is the conservative floor. The summary percentage is
   relabelled **`affected`**: it counts touched + structural, and it is the
   number users tune `wiki_delta_full_threshold` against.
3. **A branch switch faked an out-of-sync wiki.** `sync --check` compared the
   SERIALIZED manifest, and `branch` is recorded in it — so any feature-branch
   checkout exited 1 with nothing unindexed, and because REPAIR takes precedence
   over REFRESH the user was told "the docs are fine; nothing indexed them" and
   offered a repair that pre-empted the refresh they came for. The comparison now
   excludes volatile fields.
4. **`orc-wiki-scanner-opus-4-8-high` ships (§4j addendum).** orc-wiki's hard
   rule 2 says scans go to an Opus 4.8 high agent; `templates/agents/` had no
   such file, so (a) the pin was unenforceable — dispatch fell through a generic
   agent whose coarse family enum cannot distinguish 4-7 / 4-8 / 5, and all five
   scans returned MISMATCH; and (b) the trace hook only emits SPAWN/RETURN for
   `orc`-prefixed names, so a wiki run's trace showed a run that dispatched
   nothing but its own logger, with `PHASE-EDGE` inference dead for the same
   reason. The contract was already fully specified in `schemas/wiki-doc.md`
   §"Scan-agent return"; only the definition was missing. Agent floor 30 → 31.
5. **The scan slice carries the kind catalog.** The return contract made
   `crosslink_tags` mandatory but never pointed the agent at
   `references/crosslink-kinds.md`, so agents invented `route` beside
   `rest-endpoint` and emitted nameless tags (structurally impossible — `tag`
   must be `<kind>:<name>` or it has no slug and therefore no file). A synonym
   kind writes a SECOND file for one boundary point, and since a refresh may
   never bulk-delete `wiki/crosslink/`, the duplicate is PERMANENT — the dead-tag
   sweep never fires on it because its anchor is perfectly valid.
6. **Orientation's blind spots.** Its `covers` tracked only the entry-point
   source files, while its CONTENT derives from the docs it summarizes — so it
   read CLEAN in the same impact table where three docs it points at were
   TOUCHED and its Journeys described a changed handler. `covers` now includes
   the union of the summarized docs' `covers`, plus a `derived_from`
   `{doc: content_hash}` map so a rewritten doc marks it stale too. And the
   architecture overview is stated OPTIONAL: a wiki without one has registered
   cleanly since v0.18.0, so orientation must degrade explicitly when it is
   absent and the CLAUDE.md pointer is conditional on the file existing.

Behavior tests (grammar-shaped, invisible to the token lint): a `/`-kind indexed
end-to-end, an unregistered tag file failing `--check`, a branch switch staying
in sync, and a doc refreshed at HEAD reading CLEAN while the global anchor is
behind.

---

## 4z.0 Gotchas — repair memory (v0.40.0)

The fourth knowledge artifact. Canonical prose:
`templates/skills/_shared/gotchas.md`. Gate: config `gotchas` (`on` | `off`,
default `on`) + `gotchas_max` (default 40). **Zero new skills, zero new agents.**
Design informed by `yvgude/lean-ctx` (Apache-2.0); no text copied.

### What it is, and what it deliberately is not

| Artifact | Answers |
|---|---|
| the wiki | "what IS this codebase" |
| the pattern cache | "how does this project WRITE code" |
| `tdd_spec` | "what must this change PROVE" |
| **gotchas** | **"what has this project already gotten WRONG here"** |

A gotcha is ONE project-specific failure a repair already solved — the residue of
a red → green. Not a convention (that is the pattern), not a fact about the code
(that is the wiki), not an acceptance test.

### The artifact

`.claude/orc/gotchas.md` (live, capped) + `.claude/orc/gotchas-archive.md`. Both
are SIBLINGS of `orc/patterns/`, never inside it — `listPatternLangs()` can never
see them. Neither is in the install manifest, so `orc update`,
`orc update --prune` and `orc doctor --fix` all leave them byte-identical (one
test asserts all three, plus that the SHIPPED contract
`skills/_shared/gotchas.md` IS in the manifest — that distinction is the point).

Entry format is load-bearing (the parser and every writer depend on it):
heading `## G-<3-digit id> · <lang-or-area> · <kind>` with `kind` ∈
`repair | drift | review | verify`, then a FIXED field order —
`trigger, symptom, cause, fix, scope, origin, hits, last_seen`. `scope` is a glob
matched against `declared_files`; dates are `DD-MM-YYYY`; IDs are monotonic and
**never reused, even after archival**.

### Record / inject — the two rules that keep it from becoming bloat

**RECORDED only on a red → green repair**: the TDD repair loop, a resolved
`DRIFT-FROM` round, a reviewer P0/P1 fixed in-run, a verifier `unmet[]` closed
in-run. **A loop that hit its cap and STOPPED records NOTHING** — an unsolved
failure is an open problem, and writing one anyway seeds the memory with advice
that never worked. A first-try success has no repair to remember; a green
`regression-guard` was never red.

**INJECTED only when the `scope` glob matches** that task's `declared_files`, cap
**3**, highest `hits` first, **zero matches = no block at all** (not an empty
one). **Never unfiltered** — that is the exact failure mode that would turn this
feature into the bloat it exists to prevent.

### Three parties, no overlap

1. The AGENT returns the body in `gotcha_recorded` (`return-validation.md` §7) —
   body, or `none` + a one-line reason. Same body-or-`none`+reason shape as
   `crosslink_tags`, which is the established pattern for this in ORC.
2. The ORCHESTRATOR appends it at phase close (where it already dispatches the
   trace packet), deduping on `symptom` + `scope` — a match bumps
   `hits`/`last_seen` and appends nothing. **A subagent never writes either file.**
3. The CLI owns counting, capping and archival. Deterministic bookkeeping, never
   a model's judgement.

### CLI (`bin/cli.js`)

```
orc gotcha status | list     exit 0 = entries exist · 1 = none
orc gotcha prune             archive the low-value tail down to gotchas_max
```

**The exit code IS the contract**, same convention as `orc pattern status <lang>`
and `orc diy status`; `.claude/` is hidden, so an ad-hoc `find` false-negatives
(the `detecting-artifacts.md` rationale). Project-scoped — `--global` refused.
`parseGotchas()` splits whole entry BLOCKS on the heading; an unparseable
`last_seen` sorts as the OLDEST possible date, so a malformed entry is evicted
BEFORE a well-formed one rather than outliving it. Prune ranks fewest `hits`, then
oldest `last_seen`, and **APPENDS whole blocks to the archive — never deletes**.
The live file's preamble survives a prune.

### Wiring

- `orc/SKILL.md` — Phase 1 probe, Phase 3 slice injection, step 5 phase-close
  capture. Spine budget raised 445→455 (all three are decisions the spine owns).
- `orc/references/preflight-report.md` — the `gotchas:` line, **always printed**
  (`<n> known · <m> match` / `none yet` / `off`). `off` prints too: a user who
  turned it off should see the run is not learning from its repairs.
- `orc/references/pattern-gate.md` — the block rides BESIDE the pattern block;
  the difference is pattern = per LANGUAGE, gotcha = per `scope` GLOB.
- `orc-execution/core.md` — the `gotchas` slice slot + `gotcha_recorded` return.
- `orc-review-verify/core.md` — the reviewer receives matching entries as a
  CHECKLIST (a confirmed hit is a normal anchored finding, never an automatic P0
  because a gotcha named it) + may return `gotcha_recorded`.
- `orc-mini` — reads AND writes, one compact row (budget 220→225).
- `orc-fast` — **reads only**, and an explicit NON-gate (budget 182→187). Its two
  prerequisites stay two; a missing file never forces a fallback. It never writes
  because one executor + one repair round is too little signal to attribute a
  cause.
- `orc-retro` — reads as calibration input, **never writes/prunes/edits** (hard
  rule 2 is report-only, and repair memory is no exception).
- `orc-diy` — a `gotchas` flow key. **Implemented as a `diy:when` VARIANT on the
  `execution` block, exactly like `tdd`** — NOT a new block, so the stitch order
  and `compile.md` are untouched and the golden stitch-order test stays valid.
  (The plan called for "all four together"; three sufficed because no new block
  was needed. Verified by compiling with the key on and off.)
- **`/orc-quick` — NO CHANGE, not even a read.** Its Q0 reads `log_dir` and no
  other config key, by contract; a `gotchas` read would break that guarantee. The
  release diff for `templates/skills/orc-quick/` is empty and `grep -r gotcha`
  over that tree returns nothing. Intentional, not an oversight.

### Staleness is the USER's job

An injected gotcha is presented as fact and nothing re-verifies it; prune handles
CAPACITY, not correctness. The documented procedure is: delete an entry that
stopped being true. Deliberately manual — a model deciding which of its own
memories to forget is a worse failure mode than a stale line a human can read.

### Lint

Two new rows: `.claude/orc/gotchas.md` (9 files + `binFiles: bin/cli.js`) and
`gotcha_recorded` (20 files: 10 generated executors, 2 reviewers, 1 verifier, and
the 7 skill files). `_shared/gotchas.md` was ALSO registered into five existing
contracts whose tokens it genuinely depends on — `unmet[]`,
`detecting-artifacts.md`, `AGING`, `DRIFT-FROM`, `tdd_spec` — so a rename of any
of them reaches it.

**Roster note:** the plan's agent list named `orc-verifier-opus-4-8-high` and
`orc-reviewer-opus-4-8-high`; neither exists on disk. Actual: one verifier
(`orc-verifier-opus-5-med`) and two reviewers (`orc-reviewer-opus-5-med`,
`orc-reviewer-fable-5`). Read `ls templates/agents/`, never a count in prose.

Files: `bin/{cli.js,verify-contracts.js}`,
`templates/skills/_shared/{gotchas,return-validation,README}.md`,
`agents-src/executor.template.md` + the 10 generated executors,
`templates/agents/{orc-verifier-opus-5-med,orc-reviewer-opus-5-med,orc-reviewer-fable-5}.md`,
`templates/skills/orc/{SKILL.md,config.md}`,
`templates/skills/orc/references/{preflight-report,pattern-gate}.md`,
`templates/skills/orc/subskills/{orc-execution,orc-review-verify}/core.md`,
`templates/skills/{orc-mini,orc-fast,orc-retro}/SKILL.md`,
`templates/skills/orc-diy/references/{flow-schema.md,blocks/execution.md}`,
`test/cli.test.js`, `README.md`, `package.json`.

---

## 4z. Wiki freshness truth, wiki visibility, TDD necessity (v0.41.0)

Three reported defects. Two share one root cause; the third is a scope defect in
the planner contract.

### 4z.1 The wiki was permanently STALE with an unchanging hash

`meta.scan_commit` is the **OLDEST** doc's anchor (`oldestCommit()` keeps the
LARGEST distance from HEAD) — deliberately, as the conservative floor for the
blind-spot sweep. But DELTA refresh (the default path since v0.33.0) re-scans
only TOUCHED docs, so untouched docs keep their original `scanned_commit` and
**that anchor can never move**. Every refresh reported the same hash and a
distance that only ever grew: permanently STALE, which is the exact state a
refresh exists to clear.

v0.34.5 already diagnosed this — for `impact`'s per-doc classification only. The
comment in `bin/cli.js` says it verbatim ("the anchor never moves and a correct,
complete delta refresh re-reported the identical delta forever"). Four other
consumers were left on the frozen anchor: `wiki sync`'s printed hash,
`wiki status`'s tier, `impact`'s SUMMARY (`aging` → permanent exit 3 "FULL
refresh recommended" even with every doc CLEAN — a direct token burn), and
`crosslinkProviderInfo` for peers.

Second, independent defect at the same site: `wikiStatus` hardcoded the 10/30
edges and never called `readOverride`, so `wiki_fresh_max`/`wiki_aging_max` were
honored by `impact` and silently ignored by `orc wiki status`. Raising them to
quiet the STALE spam did nothing.

**The fix — `computeWikiFreshness()`, one shared engine, COVERAGE-RELATIVE.** A
doc is stale when commits since ITS OWN anchor touched files IT covers
(`git rev-list --count <doc.scanned_commit>..HEAD -- <its covers/covered_files>`);
the wiki's tier is its WORST doc. A doc about auth does not rot because the
README changed forty times. Edges come from config. Used by `wiki status`
(rewritten, + `--json`), `wiki sync`'s closing line, `impact`'s summary, and
peer lines (peers keep DEFAULT edges — their config is not ours to read).

**A STRUCTURAL blind spot degrades the tier ONE step, never past AGING.** This
was a deliberate correction found while testing: forcing STALE on any uncovered
changed file recreates the permanent-STALE bug from the other direction, since
every repo grows a README edit or a helper no doc covers. A blind spot is a
COVERAGE gap — the docs on disk are accurate, coverage is incomplete — and
`orc wiki impact` is the right place for it to escalate to a FULL-refresh
recommendation.

`meta.scan_commit` is UNCHANGED on disk (still the oldest anchor, still the
blind-spot input): this is a read-side fix, so no migration and no re-scan.

### 4z.2 Wiki use was invisible

The one-line tier report was already MANDATED (`wiki-consult.md`,
`preflight-report.md`) but the tier was **computed by the model** — a hand-run
`git rev-list` against `wiki-meta.json`. That is the failure class this repo has
already lost twice (§4b: narration is dispatched, not remembered), and when it
did run it inherited 4z.1's frozen anchor.

Worse, there was no attribution at the POINT OF USE: `executor.template.md`
mentioned the wiki zero times and no return field proved a doc was read. "Is the
wiki actually working?" was unanswerable.

Fixes: (1) `orc wiki status` IS the tier — `_shared/detecting-artifacts.md` now
extends its deterministic-probe rule from EXISTENCE to FRESHNESS; (2) a `wiki:`
continuation on every `DISPATCH` whose slice carried wiki material, naming the
docs and the tier **at time of use** (a run's own commits can age the wiki
mid-run); (3) `wiki_used` in the return contract — the docs the agent ACTUALLY
read, or `none`. `none` on a slice that carried docs is a REAL signal and is
never dropped: a wiki shipped into every slice and read by nobody is precisely
the failure this field exists to expose.

### 4z.3 TDD was authored for things that cannot fail

Two defects. **(a) The exemption was too narrow.** The only escape was "no
runnable surface (docs/config/markdown)". A translation map and a constant DO
have a runnable surface, so the planner correctly authored tests that only
restated their own assignment — a tautology costing plan, red-proof and executor
tokens. A pure file split was worse: it got brand-new tests when the existing
suite already proved the behavior unchanged. **(b) Everything was authored and
materialized UP FRONT** in a single synthesized Wave 0.

**The leverage: the planner already computed the classification.** `facets`
carries `novelty: mechanical|…` and `test_surface: none|update-existing|…`. A
constant is `mechanical + none`; a file split is `mechanical + update-existing`.
The data to skip both was in every plan and thrown away. So the fix is a
DERIVATION, not a new judgment call — which is what keeps it auditable.

`tdd_spec.exempt` (binary) becomes `disposition` (closed set of 5):
`new-surface` · `behavior-change` (both authored) · `covered-by-existing`
(cites an existing test, none authored) · `no-behavior` (declarative value,
none authored) · `no-runner` (whole-run). Derived from the facets:
`none + mechanical` → `no-behavior`; `update-existing + mechanical` →
`covered-by-existing`; otherwise a test is authored.

**Two guards keep this from becoming a coverage hole** — a rule that only ever
prevents tests is a rule that deletes coverage. Phase-1 gate check 5 bounces a
`covered-by-existing` whose `covered_by` path does not resolve (Globbed exactly
like `disposition: exists`), and the **safety floor** forbids
`covered-by-existing`/`no-behavior` on any task with non-empty `facets.risk[]`
(auth, money, migration, security, concurrency, data-integrity). Preflight prints
a REQUIRED `skipped:` breakdown naming every scoped-out requirement and its
reason — scoping TDD down is only safe if the scoping is visible.

**Wave 0 is gone; TDD is a PAIRED TASK.** The planner emits a separate TDD task
per impl task that needs one, and the impl task `depends_on` it. They are
ORDINARY tasks: same conflict graph, own facets, same pause schedule — so
independent red proofs SHARE a wave and run in parallel, while `depends_on`
guarantees a proof is always in an earlier wave than the code it proves. **No
task needs a test → no TDD task and no extra wave at all.** The
orchestrator-synthesized-task rule in `wave-grouping.md` now covers only the
mock example.

### Guards (v0.41.0)

`test/cli.test.js` — the delta refresh MOVES the anchor and clears STALE (the
literal regression); churn on one doc leaves the others FRESH; a changed covered
file IS stale (guards against over-correcting to always-FRESH); config edges move
the boundary; a blind spot degrades to AGING and no further; the `--json` shape;
`impact` exits 3 while genuinely rotten and 0 after the delta refresh.
`test/payload.test.js` — the disposition vocabulary is identical in all files
that state it; the facet→disposition derivation is stated wherever it is derived;
every skip site states the risk floor; no monolithic Wave 0 survives anywhere;
the tier is read from the probe; `wiki_used` reaches every executor.

Touched: `bin/cli.js`, `bin/verify-contracts.js`,
`templates/skills/orc/{SKILL.md,config.md}`,
`templates/skills/orc/schemas/planning-output.md`,
`templates/skills/orc/references/{wiki-consult,preflight-report,analyst-gates,wave-grouping,trace-protocol}.md`,
`templates/skills/orc/subskills/{orc-planner/SKILL.md,orc-execution/core.md}`,
`templates/skills/_shared/{return-validation,detecting-artifacts}.md`,
`templates/skills/orc-wiki/references/staleness.md`,
`templates/skills/orc-mini/SKILL.md`,
`templates/skills/orc-diy/references/{flow-schema.md,blocks/execution.md}`,
the 4 planner agents, `agents-src/executor.template.md` + the 10 generated
executors, `test/{cli,payload}.test.js`, `README.md`, `package.json`.

---

---

## 4z.25. v1.7.0 — the rules that keep the slop out

**The problem.** ORC writes a lot of prose and a lot of code, and both came out
carrying the same recognisable defaults. There was one standing card against it —
the seven-line house rules in `_shared/phases/house-rules.md` — and it is about
CODE. Nothing said anything about the words.

**The shape.** `orc rules` is a SECOND rule surface with two halves that never
mix:

| Half | Writer | Path | Changes when |
|---|---|---|---|
| ORC rules | ORC | `templates/skills/_shared/rules/` → `.claude/skills/_shared/rules/` | `orc update` |
| User rules | the project | `.claude/orc/rules.md` | `orc rules` writes it |

The user half is the `orc doc rules` file format REUSED WITHOUT CHANGE (§4z.13,
§4z.14). That argument was had once and it holds here: a standing instruction is
prose, not a form; nobody's real P0 fits on one line; the unit is the block, and
the whole block is dispatched verbatim.

### The packs, and why the ids are the contract

`OSW` writing (23) · `OSC` code (22) · `OSD` delivery (10) · `OSU` UI (10).
**65 rules**, and that count is computed by the CLI from the files — never
written down in a skill.

Parsed by a fixed heading shape, `### OSW-01 · HARD · Title`, with the body
running to the next `###`, `## ` or `---`. **The `---` case is not optional:**
without it the pack's own horizontal rule bled into the last rule of every file
and rode into every slice.

The id IS the contract. A finding, an override and a slice line must all name the
same thing across versions, so a prefix is never renamed.

### Three tiers, and the reason the middle one exists

**HARD** absolute · **PURPOSE** allowed with a written one-line reason · **LOCK**
consistency, reported never blocking. Taken from `miqdadbadjuber/anti-slop`.

The purpose gate is the mechanism that matters: **a ban list alone leaves a void,
and a model fills a void with its most generic output.** Asking for the reason is
what separates craft from a default.

### Precedence, and the sentence that gets misread

```
house rules  >  user rules  >  ORC rules
```

**Layer 1 is CODE and BEHAVIOUR only.** It governs how a change is made. It says
nothing about the words an agent writes, so it never overrules a writing rule —
it does not speak about prose at all. A lane that presents the house card as
beating `OSW-*` has misread it.

**Layer 2 beats layer 3 OUTRIGHT.** Not a waiver: the ORC rule is removed from
the slice and the removal is stated inside it.

### An override is counted the only honest way

The CLI counts ORC rule ids the user NAMED, and says so in the same breath. A
conflict nobody named is found by the agent at dispatch and returned as
`rules_conflicts[]`.

**THE CLI CANNOT PARSE INTENT, SO IT DOES NOT PRETEND TO.** This is the §4z.13
boundary decision applied again: a validator that is right often enough to be
trusted and wrong often enough to matter makes a clean pass mean nothing. The
agent is the only reader that can tell, so the agent is where the answer comes
from.

### One assembler

`orc rules slice --lane <lane> [--pack ui]` builds the card, and nothing else
does. Two reasons, both already paid for elsewhere: a card assembled in 28 spines
is 28 ideas of the precedence order, and **it is the only place the per-spawn
token weight can be measured.**

Measured at v1.7.0: **14 252 chars (~3 600 tokens)** per build-lane slice, 17 306
with the UI pack, 8 665 for a prose lane. HARD rules carry their body; PURPOSE
and LOCK carry one line plus the file to open. If it must come down, the lever is
`rulesSlice()` — never a lane trimming its own card.

**`ui` rides per TASK**, added at dispatch when a task's declared files are
front-end. A UI rule in a backend slice is tokens paid on every spawn for a rule
that cannot apply.

### The lint, and the line that makes it honest

`orc rules lint` checks **13 of 65** — what a string match can prove — and prints
in every mode, clean or not:

```
checked 13 rules of 65 — not checked here: 52 rules. They need a reader, not a matcher.
```

**A clean exit that stands in for a review nobody did is the failure that line
prevents.** Findings are advisory; there is no gate, because a style preference
that fails a build gets switched off within a week and then nothing is enforced
at all.

Two exemptions, both counted: a file whose head carries an `orc-rules:` marker is
a rules pack and is skipped whole (a rule that bans a word has to print that word
to define it — the `anti-slop` R-02 carve-out), and `orc-rules-ignore-file` /
`orc-rules-ignore` is the user's own opt-out.

`OSW-13` (em dash) is a DOSE rule measured per file, not per occurrence. ORC's
own documentation uses em dashes constantly, and **a rule the shipping project
breaks on every page is a rule nobody will believe.**

### Credit is a shipped artifact

Every pack opens with its sources; `CREDITS.md` is the long form with the date
each source was read; `orc rules credits --json` returns the table as data.
Adapted from `petergyang/no-ai-slop` (MIT), `miqdadbadjuber/anti-slop` (MIT),
`ehmo/slopkit`, `BioInfo/slopless`, Karpathy's `CLAUDE.md`, Matty Cartwright's
Anti-Slop Writing Rules, and three arXiv papers on LLM code smells.

### The wiring, and what it cost

`PHASE_FILES.rules` (single layer `core`, the `house-rules.md` precedent),
`LANE_PHASES.rules` (28 lanes), `PHASE_ORDER` immediately after `house-rules`,
a six-line `## Rules` pointer in all 28 spines, the `rules:` preflight line,
`return-validation.md` §5c, and the `rules-slice` call catalogue row.

**Three spine budgets were raised deliberately** — `orc-mini` 253→260,
`orc-analyze` 255→260, `orc-fast` 225→230 — each with its reason in a comment.
The first-cut pointer was 15–19 lines and blew them; the fix was a shorter
pointer AND a small reviewed raise, not one or the other.

**`orc-doc` is excluded everywhere.** It has its own ledger. The slice refusal
names `orc doc rules` rather than saying "unknown lane".

### Two contract-lint lessons

`bin/verify-contracts.js` matches FIXED SUBSTRINGS. `code.md` saying "orphaned"
tripped the `orphan` contract and `INDEX.md` naming the doc ledger's filename
tripped that one — **both fixed by rewording**, because a rules pack has no
business in another contract's file set. But `partial-refresh.md` genuinely
describes the doc header now, so `covered_files` was **registered** there. Know
which kind you have before reaching for either fix.

The call catalogue lint measures which lane spines NAME a call, with `lanes[]`
matching exactly — so a call is catalogued only AFTER the spines point at it. The
`rules-slice` row was written, removed, and re-added a wave later for that reason.
It must also never read `RULE_LANE_PACKS`: that table is declared far below the
catalogue and the reference is a temporal dead zone that crashes every command.

---

## 4z.26. v1.7.0 — `orc wiki`, one doc at a time

Targeted refresh has existed since v0.33.0 (§4t) and was NOT rebuilt. The missing
half was **adding one topic** to a wiki that already exists: a new coverage area
only ever appeared as a by-product of the coverage-gap sweep during a delta
refresh, so "add the remittance feature" had no path that did not re-plan every
area in the repo.

Three free commands. None scans, none spawns, and **`orc wiki sync` stays the
only writer of `wiki-meta.json` and `INDEX.md`**.

### `orc wiki resolve <topic>` — 0 match · 1 new · 2 ambiguous · 3 no wiki

Scores each doc's `keywords` (4), `title`/`area` (3), filename (2) and `covers`
(1) against the topic's terms, one field per term. It reads the doc HEADERS, not
`per_doc`, because `keywords` and `area` are the two fields a topic actually
matches on and neither survives into the freshness rows.

**A MATCH must beat the runner-up by half again plus one.** Anything closer is
AMBIGUOUS and becomes a question. Two docs a point apart is exactly where
guessing costs a scan of the wrong area, which is money and a doc that documents
something else.

For a NEW topic it proposes `covers` from PATH NAMES ONLY, preferring a directory
with two or more matches over the files themselves — a coverage area is a place,
not a list — and the payload carries the caveat that this is a starting point.

### `orc wiki add <slug> --title --covers` — a RESERVATION, not a doc

Writes a stub carrying `status: reserved` and a body whose first prose line says
nothing in it is evidence. That line becomes the `INDEX.md` description if a sync
lands between the reservation and the scan, so **a half-finished add can never
look like a page**. A doc that lies is worse than a doc that is missing.

`--covers` is required: a doc with no coverage can never be marked stale, so it
is not a doc.

### `orc wiki refs [--check]` — the DERIVED-REFERENCE sweep

After ONE doc changes, six surfaces derived from the doc SET are behind it:
registration · reserved rows · `orc-orientation.md` · the architecture overview ·
the `CLAUDE.md` pointer's doc COUNT · dead crosslink tags.

Before this they were repaired from memory, one at a time, and the ones nobody
remembered stayed wrong — **likeliest on a SMALL run, because the run feels too
small to need a sweep.**

It repairs **only the registration**, because `orc wiki sync` is free and already
the single writer. Everything else is reported with its command. A sweep that
silently regenerated prose would be spending money nobody asked it to spend —
the same rule the free-repair ladder is built on (§4t).

The lane half is `/orc-wiki update <doc-or-topic>` (an ENTRY onto the existing
R0–R5, not a second mechanism) and `/orc-wiki add "<topic>"` (A0–A7), both
branches in `phase-0.md`.

---

## 4z.27. v1.7.1 — the rules card now reaches the agent

**The defect.** v1.7.0 shipped `orc rules slice`, and the CLI built the card
correctly. But every executor dispatch site — `_shared/phases/execution.md`
step 1, `orc-mini` Phase 3, the `orc-fast` and `orc-quick` slice lists,
`extra-dispatch.md`, and the executor contract (`agents-src/executor.template.md`,
`orc-execution/core.md`) — named only the `house_rules` card. The six-line
`## Rules` pointer said "rides under the house rules", but the orchestrator
builds the slice from the dispatch step, not from the pointer. `/orc` Phase 3
also loaded `house-rules.md` and not `rules.md`, and the `/orc` preflight
template had no `rules:` row. Result: subagents and preflight showed house rules
only.

**The fix.** A named slice field, `rules_card` = the `text` field of
`orc rules slice --lane <lane> [--pack ui] --json`, injected verbatim directly
under `house_rules` at every dispatch site. The executor contract reads it and
returns `rules_applied[]` / `rules_conflicts[]` / `rules_overridden[]`
(`return-validation.md` §5c). `rules.md` now says the `line` is the report and
the `text` is the card. `/orc` Phase 3 loads `rules.md`; `preflight-report.md`
gains the `rules:` row.

**Guards.** `rules_card` is a registered contract token in
`bin/verify-contracts.js` (20 files). `test/payload.test.js` asserts every
dispatch site carries both cards.

**How to check it works.** `orc rules slice --lane orc --json` — `text` must
start with `YOUR PROJECT'S RULES` when `.claude/orc/rules.md` has content, and
`line` must say `yours N lines`, not `yours none`. In a run, the preflight prints
`rules:`, and each executor return carries the three `rules_*` fields.

---

## 4z.28. v1.8.0 — the code graph (`orc graph`)

> **HISTORY.** §4z.30 is the current record of the code graph. Where the two
> disagree, §4z.30 wins — it lists what changed at the end.

A local, git-ignored map of how the repository is connected, under
`.claude/orc/graph/`. It is the fourth knowledge artifact and deliberately none
of the other three: the wiki says what a feature IS, the pattern cache how the
project WRITES code, gotchas what it already got WRONG — the graph says WHERE a
thing is and what it is connected to, right now. Canonical contract:
`templates/skills/_shared/code-graph.md`.

### 4z.28.1 Two layers, and only one costs money

| Layer | Written by | Cost |
|---|---|---|
| Structure | `bin/graph-extract.js` (CLI) | 0 model tokens |
| Notes | `orc-graph-noter-sonnet-4-6-med`, stored by `bin/graph-notes.js` | one dispatch per batch |

**Why structure is not a model's job:** every comparable tool (Graphify,
Codebase-Memory, Aider's repo map) extracts with a parser. A parser is free and
exact for its input; a model that "updates the cache" costs tokens and can be
wrong. S1 and "the free check runs before the paid one" say the same.

### 4z.28.2 The store — `bin/graph.js`

- **Detection from git's own hashes.** `git ls-files -s -z` (every tracked blob in
  one call) + `git status --porcelain=v1 -z --untracked-files=all --no-renames` +
  `git hash-object --stdin-paths` for dirty and untracked files only. No
  `--no-filters`: the clean filter (autocrlf) must run or every CRLF file reads as
  changed forever.
- **Content-addressed records** — `blobs/<ab>/<sha>.json`. A branch switch back
  reuses them (a test proves `parsed: 0, reused: 1`).
- **Write order** blobs → `index.json` → `files.json` → `meta.json`, each atomic
  (temp + rename, with a short retry for Windows EPERM). A crash leaves
  `files.json` old, so the next status reads DRIFTED and the next update redoes
  the work.
- **`.lock`** opened `wx`; older than 10 minutes = a dead writer's. Readers never
  take it.
- **`ENGINE = "graph@2"`** — a record from an older engine is re-extracted.
- Always skipped: `.claude/`, `node_modules/`, `*.min.js`, files > 512 KB.
- **No background process, ever.** Graph tools that rebuilt from a hook on every
  turn froze machines (the code-review-graph guide).

### 4z.28.3 Extraction — `bin/graph-extract.js`

The ladder (D3): **borrowed Python `ast`** (one subprocess for the whole batch;
`ORC_GRAPH_NO_BORROW=1` forces the heuristic, `ORC_GRAPH_PYTHON` names the binary)
→ **heuristic**: a comment/string MASK that keeps every offset, then per-language
declaration patterns (js/ts, py, go, java, cs, php), brace or indentation bodies,
a call scan, imports with bindings, and effects (`sql` string literals, `db` call
shapes, `http`, `env`, `fs`). **TypeScript's own parser is NOT borrowed** — no
TypeScript was available to test it, and an untested extractor is worse than an
honest heuristic.

`body_hash` = sha1 of the symbol's whitespace-collapsed text. It moves with THAT
symbol only, never with a neighbour — notes key on it.

**`heuristic@3` / `graph@3` (W9 round 2).** W9 round 1 measured 6 files and ONE
symbol on the Express fixture: every route handler is anonymous. Now:
- `router.get("/path", mw, (req, res) => …)` is a `route` symbol named
  `<METHOD> <path>`. Its body is the whole registration call, so the middleware
  and every call in the handler belong to it. The first argument must be a string
  that starts with `/` (or is `*`), and a function must follow — `cache.get("/k")`
  and `request(app).get("/orders")` are not routes.
- A bare or dotted identifier ARGUMENT is a `ref` (`requireAuth`, `items.map(normalize)`).
  `finalize` keeps a ref only when its head is defined in the file or bound by an
  import; the borrowed Python `ast` emits refs too.
- A keyword after a dot is a method name (`router.delete(`), so its arguments are
  scanned. `async (req, res) =>` is not a call to `async`.
- The fixture now indexes 6 files · 8 symbols, and `requireAuth` is used by two routes.

Bugs real repositories found (each has a test): TypeScript overload signatures
became symbols (nestjs: `ctx NestFactoryStatic.create` was ambiguous); C# `void`
methods were dropped (`void` was in the keyword list); a depth-2 effect vanished
from `--json` (the effect's own `type` overwrote the item marker, now `item`).

### 4z.28.4 Resolution is computed on read — `bin/graph-query.js`

**Never stored** (a change from plan §3 step 5). The resolve pass is 175 ms on
Django; stored edges would add ~12 MB per parse and an invalidation path that can
go stale silently. The wiki-tier rule, applied again.

| State | Meaning |
|---|---|
| `LOCAL` | same file; a `this.`/`self.` call prefers the caller's class |
| `IMPORT` | the name or its receiver is bound by an import that resolves here |
| `UNIQUE` | one repo symbol with that name, and the receiver agrees |
| `AMBIGUOUS` | 2+ candidates, OR a receiver no candidate confirms — all listed |
| `UNRESOLVED` | nothing in this repo; an import to no file (a package) is always this |

`EXACT` is reserved for a type-checker-backed resolution and nothing emits it.
**A `ref` resolves only `LOCAL` or `IMPORT`** — anything else becomes
`UNRESOLVED`, so `res.json(order)` never finds a repo function named `order`.
Confident refs count as callers (`← used by` on a card, `→ uses` for a callee)
and are followed by `impact`.
Import targets: js/ts relative + `@/`/`~/` + `.js`→`.ts`, python relative/absolute
+ suffix, go via `go.mod`, java/php suffix, php include.

Read commands, all budgeted (`fit()`: pick by priority, print in display order,
the footer always says what it hid): `ctx` (symbol card or file card; exit 4 =
not found or ambiguous target), `impact` (confident callers by depth, tests,
wiki docs), `path` (shortest confident chain). The card header compares the
focal file's blob with `git hash-object` → `current · CHANGED · DELETED`.
`ctx` takes up to 5 targets under ONE budget (split evenly) — a slice builder
that had to loop over its declared files ran the first and skipped the rest.

Every graph `--json` answer carries `line` (the chat line) and `trace`
(`GRAPH-CONSULT` · `GRAPH-UPDATE` · `GRAPH-NOTES`); a read card omits `line`
because the card IS the line. `status --heal` builds a NONE graph and updates a
DRIFTED one inside the same call (not when `code_graph_auto_update: false`),
then reports the new state with a `healed` object.

### 4z.28.5 Notes — `bin/graph-notes.js`

- `notes pending --files` (REQUIRED — no repo-wide mode): `function`/`method`/`route`
  with ≥3 lines whose CURRENT `body_hash` has no note. Classes are excluded —
  their hash moves with every method.
- `--if-enabled`: exit 3 when `code_graph` or `code_graph_notes` is off.
  `--at wave|end` names the call site; the other site is exit 5 `deferred`.
  Below `code_graph_notes_min` is exit 5 `below-min`.
- `notes apply <file|->` validates every row against the current index and
  rejects by name (`unknown-symbol · stale-body-hash · empty-note · multi-line ·
  too-long`); the valid rows still apply; exit 6 when any row was rejected.
- A note shows on a card only while `body_hash` matches; otherwise
  `note: stale`. `gc` compacts `notes.jsonl` inside its lock.
- **The noter pipes to the CLI itself and returns ONE line.** The first design
  returned ~2K of notes per wave into the orchestrator's run-long context —
  about 100K extra tokens across a 6-task run (`code-graph-notes/03-simulasi-token.md`).
- No Opus 5 variant: under `opus5_only` a lane prints
  `graph notes: skipped (opus5_only)`.

### 4z.28.6 The lanes

Code-changing lanes only: orc, ultra, diy, mini, fast, quick. The preflight line
is in `_shared/phases/preflight.md` (`core`); execution step 4a, planning and
review `impact`, ship update + `--at end` notes are in their shared phase files
(with DIY `composed` variants behind the `code_graph` flow key).

- **The catalogue lint measures a lane's calls from `templates/skills/<lane>/`
  only**, by the first three words. So each code lane's OWN folder names its graph
  calls (orc's constellation line, diy's `flow-schema.md`, the mini/fast/quick
  spines). `_shared/` text counts for no lane.
- **The three steps (`code-graph.md` §0), every code lane, never skipped:**
  consult + build (`status --if-enabled --heal --json`, before the first
  dispatch) · use (ONE `ctx <declared files…>` per slice, and the executor's own
  `ctx` at read-ladder step 0) · update (after every code change). While
  `code_graph` is on, `laneAnnounce()` puts the three steps in `announce[]` for
  every lane in `LANE_CALLS["graph-status"].lanes` — the resolver every lane
  already prints verbatim.
- W6 put the mini/fast pointers into LENGTHENED lines to fit the spine budgets.
  **W9 round 1 measured those lanes skipping the calls.** W9 round 2 gave each
  lane its own step (`orc-mini` section, `orc-fast` F0 step e., `orc-quick` Q0
  step 4 + `GATE graph`) and raised the budgets deliberately: mini 260→270, fast
  230→240.
- `/orc-quick` reads only `log_dir`: every call carries `--if-enabled`. The noter
  is ORC bookkeeping, not a Q2 gate dispatch (`dispatch-gate.md` rule 8).
- Precedence gains two rungs and loses none:
  `code > graph structure (current blob) > fresh wiki > stale wiki (hints) > graph notes > model priors`.
  The old `code > fresh wiki` line stays in its 15 files (still true); the full
  line lives in 4 files under its own lint token.

### 4z.28.7 Config, doctor, panel, status line

- Keys (family `graph`, all `lanes: []` + `SEED_EMPTY`, all but the first
  `gated_by: code_graph`): `code_graph` (off), `code_graph_notes`
  (off·wave·end), `code_graph_notes_min` (5), `code_graph_notes_cap` (40),
  `code_graph_card_budget` (1200, 300–4000), `code_graph_auto_update` (true).
  **`code_graph_ignore` is not a key** — engine support only.
- DIY flow key `code_graph` defaults to **`on`** (W9 round 2): the compiled
  steps all carry `--if-enabled`, so the global key still decides at run time;
  `off` removes the steps. The `diy-compile-default.md` golden carries them.
- `orc doctor` → `graph-drifted`, only while `code_graph` is on (the read-gate
  rule), routed to Knowledge.
- `orc ui` Knowledge: a `code graph` strip value + a card (`/api/graph`, POST
  `/api/graph/update` — free, so a button). Fixture DRIFTED.
- Status line: component `graph` (group D, `new-read`) — a FLOOR comparing
  `meta.json`'s commit with HEAD read from `.git` (`gitHeadCommit()`, no
  subprocess). States `fresh · behind · none · off` — **`behind`, never
  `drifted`**, because the hook cannot see file edits. Not in the shipped lines.
  `graph.` had to join the compiler's `EXTENDED` regex, or the lock never names
  `scan.extended` and the row renders an em dash forever.

### 4z.28.8 Measurements and honest limits

W0 (a prototype): `ls-files -s` 42 ms for 7,091 files; JSON index parse 135 ms
at 23.7 MB. W2/W3 (the real commands): django first build 5.5 s heuristic /
10.7 s with `ast`, one-file update 0.9 s, `ctx` 0.73 s; nest 2.4 s. Content
addressing: 1,695 records for 1,920 nest files.

Limits: TypeScript's parser not borrowed; an instance alias (`NestFactory = new
NestFactoryStatic()`) does not match its class (118 `maybe` callers on nest);
`--files` hint for `update` not implemented; **the token A/B in real sessions was
not run in the build** — it is the release gate (`eval/results/1.8.0/`).

**W9 round 1 (15-09-2026) did NOT pass the gate.** S2 (`/orc-mini`) ON never
called the graph; S3 (`/orc`) ON used it without notes: tokens −8.9%, tool calls
−4.4% — inside ±10%, so inconclusive. An S1 pair with NO graph use still differed
by 54%: one run per cell cannot see this effect. Round 2 repeats S2 and S3 three
times and gates on medians.

**W9 round 2 (15-09-2026) did NOT pass either**, and EW8 (16-09-2026) explains
why no repeat could: replaying 242 real ORC lane windows and 78 real development
sessions with `eval/graph-replay.js` — at zero token cost — shows `Grep`+`Glob`
results are 0.06% of what a session adds to its context, every tool result
together is 5.5%, and a PERFECT locator would save 0.1% of a run. **The code
graph is a correctness and navigation tool, never a token saving, and every
release doc says so.**

**Round 3 (16-09-2026) — `code-graph-notes/findings/R3-results.md`.** Three
checks, two of them free. **A:** a hook's `additionalContext` IS delivered into a
subagent on `SubagentStart` (the probe subagent quoted the marker back) — DE3 is
confirmed and the four hook events stay; `PreToolUse` delivery is still
unconfirmed and stays fail-quiet. **B:** django/django, 3,040 files, 44,160
symbols, 13 s build, 0.3% of files incompletely parsed, 51.3% of in-repo calls
confident, tree cards −18.7% median — every bar met. **C:** with the graph ON the
answer was faster (37 s vs 1 m 3 s) and the direct call sites were exactly right
(7 of 7, none invented), but it declared 11 route-level tests absent. **A card
lists only the callers that NAME the symbol** — an HTTP route test names a URL,
so there is no edge, the file still reads `coverage: full`, and the card is
silent. A card's silence is not proof of absence. Doc rule only; no engine change.

## 4z.30. v1.8.2 — the code graph, round 2 (`orc graph`)

Round 3 of the 1.8.0 build (§4z.28.8, case C) found one defect: **a card was
silent about a caller that reaches a symbol through a URL.** This release fixes
that and four more edge classes, adds five heuristic languages and two borrowed
parsers, cuts round trips, and makes a one-symbol card about twice as fast.
Plan: `code-graph-notes/06-IMPROVEMENT-PLAN.md`. Record:
`code-graph-notes/CHECKPOINT-1.8.2.md` (every decision in force). **§4z.28 is
history — where the two disagree, this section wins.**

Engine `graph@5` / `heuristic@5` / `RESOLVE_SCHEMA 3`. The index re-extracts
itself on the first `update` after the upgrade (`graph-upgrade.test.js`).

### 4z.30.1 The five edge classes (W1 · W2)

- **ROUTE (G1).** A route handler gets an alias symbol named `<METHOD> <path>`,
  kind `route`, `handler: <id>`, which CALLS the handler — one local edge, so
  `impact` walks handler → route → test with no special case. The same-file or
  same-class prefix is folded in at EXTRACTION (`@Controller("orders")` +
  `@Get(":id")`); a mount from another file (`app.use`, `include_router`,
  `register_blueprint`, Django `include`) is applied at RESOLUTION. A URL
  literal in a call (`request(app).get("/p")`, `client.post(…)`,
  `httptest.NewRequest`) resolves to it. An unknown prefix or an ambiguous mount
  matches by TAIL: one candidate → `ROUTE` with `mount: unknown`, several →
  `AMBIGUOUS`. `ROUTE` is a new confident state word (`STATE_SHORT.ROUTE = "R"`,
  cache ref flag 2).
- **The guess that was REMOVED (W1-bare-method).** A bare call with no receiver
  never resolves `UNIQUE` to a class METHOD. 1.8.1 made every supertest `.get(…)`
  a caller of the only method named `get`. A method is reached through a
  receiver, `this`, or inheritance.
- **Aliases (G2).** `x = new Service(); x.run()` resolves. An alias head IS a
  class name, so `router.get` with `router = Router()` is `UNRESOLVED
  (external)`, never a list of every `get` in the tree (the nest 118-maybe
  noise). A local that re-binds the name to a non-class SHADOWS it and falls
  back to the 1.8.1 `maybe`.
- **Inheritance (G3).** An inherited member carries the state the BASE resolved
  with from the subclass's file, plus `inherited: true` (ref flag 3).
  `super.m()` skips the class's own `m`.
- **Barrels (G4).** The IMPORT rung searches the imported file first, then what
  its re-exports reach (depth ≤ 3). A barrel that DEFINES the name wins over one
  that passes it on.
- **`code_graph_ignore` (G8)** is a comma-separated STRING (`vendor/**,*.gen.ts`),
  default `""`, validator `vGlobs` — config values are scalars. A glob with no
  slash matches at any depth. Default skips gained root `dist/ build/ out/`,
  any-depth `vendor/ __pycache__/ .next/ .nuxt/ .venv/ venv/ target/classes/`,
  and the bundle/generated patterns. Root only for `build/`/`dist/`:
  `pkg/build/` is a package name in real repositories.

Measured 1.8.1 → 1.8.2: django confident edges 65,379 → 72,955, `UNIQUE` guesses
23,866 → 6,442, 656 routes, build 12.5 → 13.7 s. nest: 7,288 → 9,426 confident,
maybe 81,485 → 33,906, `UNIQUE` 1,957 → 275, 344 routes, 3.1 → 4.0 s.
`EST_MS_PER_FILE` 3.5 → 5.6.

### 4z.30.2 Languages and borrowed parsers (W5 · W6)

Heuristic rungs added: **Ruby, Rust, Kotlin, C/C++, and Vue/Svelte SFCs** (the
SFC is parsed by BLANKING everything outside `<script>` and keeping every
newline, so the js/ts rung is unchanged and every line number is the FILE's own;
`lang="ts"` picks the ts rung). Partial rate on a real repository per language:
rubocop 2.4% · tokio 0.3% · ktor 1.4% · primevue 0.5% · svelte 0% · abseil-cpp
1.7% · redis 4.5%. Rules that cost the most to find:

- Ruby is read by KEYWORD DEPTH one line at a time; `if`/`unless`/`while`/`until`
  open a block only as the FIRST word (`save if valid?` is a modifier).
- A RECEIVER form is a Ruby call; a BARE word is not (far more often a local).
- In Ruby and Kotlin a bare call inside a method is a call on the object — marked
  `self` only when the file has no top-level function and no import of that name.
- `impl Trait for Type` is Rust's inheritance; a `trait` body owns its defaults.
- A C macro at column 0 with a block body (`TEST_F(S, C) { … }`) is a DEFINITION.
  Without it abseil-cpp went 1.7% → 11% partial and 9,661 → 14,110 symbols.
- Rust, Kotlin and C/C++ join Go's DIRECTORY-SCOPE rung. A Rust `tests/` file
  names the crate by its `Cargo.toml` package name. A Kotlin import resolves to
  `<pkg>/<Class>.kt`, then the package FOLDER, never a same-named file anywhere.

**Borrowed TypeScript and Go (G7).** The project's own `node_modules/typescript`
(in process) and the `go` on PATH (one program) join the borrowed Python `ast`.
A borrowed rung emits the RAW dotted call name — `extractOne` normalises every
rung in ONE place, and normalising twice loses `self` and every inherited edge.
A call's line is the CALLEE's own line. A receiver the parser cannot name leaves
the bare member name (it carries the URL). CommonJS `require` is an import. A
borrowed rung still runs the heuristic ROUTE pass (a route handler is anonymous,
so an AST has no name for it) and RESETS the coverage counter after it.

> **The W6 gate was NOT met and it ships anyway — the user's call, 21-09-2026.**
> The gate was +10 points of confident RATE: measured +1.0 (nest), −0.3
> (vuejs/core), −0.3 (hugo). **The gate measured the wrong thing:** that rate is
> pinned by calls into external packages, which no parser can resolve. What moved
> is INVENTED edges — `UNIQUE` guesses fell 36–40%, `IMPORT` facts rose. Cost
> +0.24 s (TS) / +0.70 s (Go) per incremental update. No new config key;
> `ORC_GRAPH_NO_BORROW=1` stays the escape hatch. Not delivered, gate closed:
> Ruby `Prism`, Java, PHP (DE-G — the heuristic had to miss >5%; Ruby missed
> 2.4%). Swift, Scala, Dart stay out (DE-F).

### 4z.30.3 Delivery (W3) and the hook

- **`ctx --source [N]`** appends the target's own lines (80 default, 200 cap) to
  the SAME budget.
- **`ctx --for-slice <files…>`** prints only the OUTSIDE view — callers in,
  importers, routes answered, tests — and NO symbol table. An executor reads its
  declared files in full anyway, so a file card repeated what it was about to
  read on every later turn. 30%/51% on the fixture, 46% aggregate on django. ONE
  row per calling FILE: one row per (symbol, caller) pair came out LARGER.
- **`update --notes-pending`** answers both in one process and one lock.
- **The legend rule (W3-legend).** One-letter states plus a legend are printed
  only when that is SMALLER than the words; `states` in the JSON says which body
  was used. Always-short makes small cards bigger.
- **The footer rule (W3-footer).** A card that hid nothing prints NO footer;
  `budget {used, max}` stays in the JSON either way. `fit()` reserves the LONGEST
  footer the card could print, so `used` never passes the budget.
- **The hook gained two matchers.** A shell search (`grep`, `rg`, `git grep`,
  `findstr`, `Select-String`, `ag`, `ack` — only these seven, only as the FIRST
  word) is the same question as a Grep. Under `code_graph_hooks: on,read` a
  whole-file Read of a WIDE file gets one line naming its six most reached
  symbols and ranges, from `wide.json`. **`updatedInput` exists and the hook
  deliberately never uses it** — turning an agent's Read into a range read is
  what the read ladder's first exception forbids, and the read gate stays the
  only layer allowed to touch a read.
- **Hook p95, measured and NOT met.** 384 ms wall on django — of which **303 ms
  is a bare `node -e 0` on this machine**. The hook's own work is ~70 ms. No Node
  hook can meet the plan's 150 ms WALL here; it is the W0 DE-I wall again.

### 4z.30.4 Doc notes (W4) and the gain meter (W4b)

**`doc` is the AUTHOR's first sentence**, extracted for 0 model tokens from a
docstring / JSDoc / `///` / `#` block. Python looks INSIDE first (the docstring),
then at a `#` block above. Resolution order: **current model note → doc → stale
model note** — a sentence matching the bytes on disk beats one that matched a
body nobody has, and a model that READ the code beats a comment that claims to
describe it.

> **The plan's >60% doc share was wrong.** Measured: django **19.9%** of notable
> symbols (30.6% of non-test source), nest 7.1% / 9.0%. The extractor is correct
> (verified by hand). Every release doc quotes the measurement, never the
> estimate.

**DE-D — the Haiku noter is NOT built.** `orc-graph-noter-haiku-4-5` and
`code_graph_notes_model` are gated on a blind 30-symbol comparison that costs
real model tokens and has not been run. The protocol is in
`code-graph-notes/findings/W4-W4b-notes-and-gain.md`. Default was `sonnet` and
still is.

**The gain meter — `bin/graph-gain.js`, `orc graph gain`.** One line per read in
`gain.jsonl`, appended by five read paths and by the hook. Three halves that
never merge: **paid** (recorded, exact) · **avoided** (an ESTIMATE, always a
RANGE) · **measured** (`--measured`, its own API route and its own button because
it reads Claude Code's transcripts and a panel that stalls on open is a panel
nobody opens; silent below N=3 in EACH group). `bytes` and `lines` went into the
INDEX, not a new store — the counterfactual needs a file's average line length,
and opening the file for it would make every ledger row a file read. `orc stats`
reports `graph: null` with no ledger, never `0`. **K6: the meter may never block
a read** — W8 found `gainRowFor` (which PRICES the answer) sitting OUTSIDE the
fail-quiet wrapper and moved it in.

### 4z.30.5 The map (W7) — planning only

`bin/graph-map.js`. PageRank over the call/import graph; edge weight is the
SQUARE ROOT of the call count (one import used in a loop must not outrank ten
callers); a test file ×0.1; an all-private file ×0.5. `map.json` is 335 KB on
django and saves ~175 ms a call.

- **`--focus` (W7-focus-baseline)** gives every file a personalisation share of 1
  and adds `MAP_FOCUS_MASS / n` ON TOP for the focus. The literal plan reading
  ("focus files get 100/n") hands the focus the whole vector and leaves every
  file it does not reach at exactly ZERO — a hundred tied zeroes sort
  alphabetically, which turns the rest of the map into a directory listing. A
  test holds the line: the unfocused remainder must not be alphabetical.
- **The cut is a PREFIX** chosen by binary search over the row count, never
  `fit()`'s greedy pass — `fit` is right for a card of independent sections and
  wrong for a list whose whole meaning is the ORDER. `fit` still does the budget
  arithmetic and the footer reserve.
- **"rank is a HINT about where to look first" is a pri-0 row INSIDE the card**,
  charged to the budget. It was first appended to the CLI's human line, where the
  `--json` reader — the only consumer there is — never saw it.

> **The M2 gate was NOT met, and the plan had already chosen the fallback.** M2
> measured **0.39** answerable planning calls per main window (16 over 41) against
> a gate of ≥ 3. DE-H names its own branch — "(a) planner + analyst + quick if
> M2 shows ≥ 3; else **(b) planner only**" — so the map ships wired to PLANNING
> ONLY. The analyst and `/orc-quick` wiring was built and then REMOVED,
> `references/orientation.md` deleted, `LANE_CALLS["graph-map"].lanes` cut to
> `["orc", "orc-diy"]`. **No user decision was needed.** Honest caveat, recorded
> and deliberately not acted on: the fixture transcripts drive lanes over a
> fourteen-file Express toy, where a planner has nothing to sweep. Re-measure on
> a real repository in a later version.

### 4z.30.6 Sharded reads (W8, DE-I)

`bin/graph-shard.js`. `resolved/<ab>.json` per name prefix (callers · maybe ·
forward calls · interned candidates), written by `update` in the same pass, GC'd
by `gc`. A one-symbol `ctx` reads only the shards it needs.

- **Fast or nothing (W8-fast-or-nothing).** `fastModel()` returns null the moment
  it cannot PROVE the card is identical. Every answer carries `read:
  sharded|full`; a decline carries `read_fallback: <reason>`. It declines a path,
  a URL, a `file:line`, a spaced query, a name at `names.json`'s five-row cap, a
  bare name that is not exactly one qname, a duplicate qname in one file, a stale
  shard, `--for-slice`, a file card and any multi-target call.
- **Candidate lists are INTERNED PER SHARD** — a row carries the index. django's
  shards went 25.3 → 8.2 MB, the whole set 47 → 30 MB. Per shard, not globally:
  a shard is the unit a reader parses, and a shared table would mean opening a
  second file to render one row.
- **`loadFile` THROWS `FastUnavailable`.** The fast model reads blobs lazily, so
  an unreadable blob is found when the card is half built and `ctx` would drop
  the row in silence. The CLI catches and rebuilds from the full model. A path
  the index never held stays a plain `null` — the full model does not know it
  either.
- **The fast path is NOT gated on `healOnRead` returning nothing.** A `skipped`
  heal (django's, over the heal cap) changes nothing on disk, and a heal that ran
  rewrote the shards in the same locked pass. The first version gated on it and
  so never fired on the one repository it was built for.
- **`basis.grep_hits` is `null` on a sharded read, never a confident 0.**
  `nameHits` needs the whole call index. A zero would have quietly shrunk the
  gain estimate as the fast path spread, and a falling estimate reads as a
  falling saving. `orc graph gain` prints `unsized` in its own line.

**Gate MET.** 577 cards compared on django + nest: **0 different.** In process
361 → **50 ms** median (gate 150, p95 62). Whole call 881 → **480 ms** — the
floor is node's ~300 ms start-up. **Cost the plan did not budget: disk.** django's
shard set is 30 MB, taking `.claude/orc/graph` from ~87 MB to ~117 MB. The update
pays nothing measurable (3,767 → 3,646 ms with BOTH new stores written).

### 4z.30.7 Config, contracts, tests

- **New key `code_graph_ignore`** (see 4z.30.1) — §4z.28.7's "`code_graph_ignore`
  is not a key" is superseded. `code_graph_hooks` gains the value `on,read`.
- Contract tokens registered: `ROUTE` · `code_graph_ignore` · `--for-slice` ·
  `--source [N]` · `--notes-pending` · `on,read` · `--with-source` · `graph notes
  and doc notes` · `GRAPH-GAIN` · `AN ESTIMATE` · `Ruby, Rust, Kotlin` ·
  `ORC_GRAPH_NO_BORROW` · `orc graph map` · `GRAPH-MAP` · `a HINT about where to
  look first` · `resolved/<ab>.json`. 192 → **206 contracts**.
- Ten NEW graph test files (`graph-routes` · `graph-edges` · `graph-upgrade` ·
  `graph-delivery` · `graph-doc` · `graph-gain` · `graph-langs` · `graph-borrow`
  · `graph-lanes` · `graph-shard`). `npm test` 1022 (1.8.1) → **1096 passed, 0
  failed, 1099 tests, 74 files**. `test/goldens/graph-1.8.1/` is FROZEN and is
  never regenerated.
- The eval fixtures are nine, with 86 answer-key rows; `node
  eval/fixture-graph/check.js` must be **0 FAIL**. The baseline was 37 FAIL of 38.
- **§4z.28's limits that no longer hold:** "TypeScript's parser is NOT borrowed",
  "an instance alias does not match its class", "`code_graph_ignore` is not a
  key", `ENGINE = graph@2`, and "resolution is never stored" (it is derived and
  stored — still never a source, and a missing cache changes no answer).

## 4z.32. v1.9.1 — the graph that was paid for and never asked

The graph was maintained far more than it was consulted, and the answer a lane
read was 4 to 8 times the card the meter counted. On the user's Vue project
416 of 429 `.vue` files had no symbol. This release makes answers smaller,
fixes two meter defects, says when the map is thin, delivers source with the
paid reads, and reads the Vue Options API. **§4z.30 still holds except where
this section says otherwise.**

Engine `graph@6` / `heuristic@6` / `RESOLVE_SCHEMA 3` (unchanged). A graph@5
store reads DRIFTED (`engine_stale`) and the next `status --heal` re-extracts
every file once; notes and function ids survive (`graph-upgrade.test.js`, the
frozen graph@5 golden `test/goldens/graph-1.9.0/`).

### 4z.32.1 `--brief` (B1 · B2 · B3)

- A BARE switch on every `--json` read: keeps the card, the line, the trace,
  every scalar and every count; drops row arrays (`briefOf()` in `bin/cli.js`,
  `GRAPH_BRIEF_DROP` / `_KEEP` / `_WHOLE`); compact JSON. Without it `--json`
  is unchanged — the 1.9.0 answers are goldens (`test/goldens/graph-json-1.9.0/`)
  compared key for key; every addition is named in `ADDED`, every moved value
  in `CHANGED` (`graph-brief.test.js`).
- Measured here: −74 % to −87 %. All 46 payload call sites carry it.
- `paid.envelope` = the answer beyond its card, counted in `finish()`.

### 4z.32.2 The CLI computes the lines (V1 · V2 · V3)

- `changes`: `totals`, `tests[]`, `tests_line`, `blast_line`, `--files=`.
- `impact --complexity [--risk=…]`: mini's line, its numbers and `facts{}` in
  one process. The four thresholds are constants in `bin/graph-signals.js`,
  pinned by a contract row.

### 4z.32.3 THIN, the audit, the map knock-down (A1 – A4)

- `meta.density` (written by every update; backfilled once under `--heal`,
  generation unchanged). `THIN` = files ≥ 30 AND symbols/file < 3 AND empty
  share ≥ 0.40 — provisional, three named constants.
- `orc graph audit` (`bin/graph-audit.js`) — no lane may call it (`lanes: []`).
  Its shape reading is a HINT and says so.
- `orc graph map` ranks an empty file below every file with a symbol.

### 4z.32.4 The meter (M1 – M3)

- **Fixed:** the hook writes a `hook-update` ledger row (it only bumped its
  counters file, so `hints.updates` was always 0). **Fixed:** `paid` counts the
  envelope. `never_called` = `READ_SET` minus the ledger, with no advice.

### 4z.32.5 Delivery (R1 – R4)

- `ctx <symbol> --callers-source`: ≤ 5 CONFIDENT callers × 6 lines, charged
  after everything else, a block kept whole or not at all, never the target's
  own file, a CHANGED caller file says so; the sharded path declines it
  (`callers-source`); priced as `paid.source` + `sourceAvoided` per block.
- `lsp_at {file, line, character}` on every symbol card (1-based character;
  `null` when not `current` or the name is not on the line) — computed on the
  sharded path too, so both paths answer the same field. The read ladder, both
  recon agents and every executor ask an `LSP` tool there on `AMBIGUOUS`.
  `EXACT` stays reserved: the CLI never emits it.
- `wide_unhinted`: under `on`, a subagent's whole-file read of a wide file is
  one ledger row, once per file per run, no context. DE-8 decided **no default
  flip** — this count is the evidence for one.
- Under `on,read` the wide hint names the run's `name:` tokens first.

### 4z.32.6 The Options API (W5b, DE-15)

- `objectDefs()` in `bin/graph-extract.js`, run on BOTH rungs (after the
  borrowed TypeScript walk too). E1: `export default {…}` /
  `defineComponent` / `Vue.extend` → a `class` owner (`name:` or the file
  stem) + `method` members (`<Owner>.<name>`, the section never in the qname),
  `mixins`/`extends` → `bases`. E2: exported constants → `const` (a
  `require(…)` value is a re-export and is skipped; a Svelte `export let` is a
  prop). E3: `<script setup>` / Svelte / no script → one NAME-ONLY `class`.
- A `const` and a name-only class own no line, so they carry `calls: []` and a
  module-scope alias stays visible.
- `classSymbol()`: a default import of a file with exactly one exported class
  resolves to it, whatever the local name.
- Measured here: vs graph@5, only 189 new `const` symbols and 34 new `ref`
  edges to them; empty files 25 → 7. `check.js` 0 FAIL on 10 fixtures, both
  rungs. The Vue gate (< 20 % empty `.vue`, ≥ 4 per file) is measured on the
  user's project.
- Not in this release: `<template>` edges (`@click="submit"`).

Contracts 208 → **214**. Tests 1110 → **1202 passed, 0 failed, 1205 tests, 80
files**.
