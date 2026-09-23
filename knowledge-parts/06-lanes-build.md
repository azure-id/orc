# knowledge.md — Part V — The build lanes

**Read: on demand** — read when touching `/orc`, `/orc-mini`, `/orc-fast`, `/orc-ultra`, `/orc-diy`, `/orc-poly`, `/orc-learn`, `/orc-claude`, the analyst evidence gate, or Phase 6.5 test authoring.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4b.1 Analyst evidence gate — coverage, and the literals around it (v0.34.6)

The analyst-return gate is the only mechanical defence against a plausible-but-
wrong `file:line` reaching the planner, and it was checking the wrong rows.

- **Coverage (K3).** `analyst-gates.md` Grep-verified quoted snippets only on
  `status: exists|conflict` rows. The two statuses a GOOD audit most often
  produces are `resolved` (a challenged row the user decided) and `buildable`
  (the actual work) — both outside the gate. A measured spec had zero
  `exists|conflict` rows, so the mandated verification covered **0 of 5 refs**,
  and `src/auth.js:5` cited for a quote living at line 4 passed. Caught only
  because a grader over-verified. The gate now checks EVERY quote-anchored ref
  regardless of status — one Grep per ref, enforcing the rule hard rule 2
  already states rather than a subset of it. Causal note worth keeping: that ref
  began as a line RANGE with no quote (auto-UNVERIFIED); narrowing it to one
  line + quote was the CORRECT fix and is what introduced the off-by-one — so
  tightening evidence granularity is itself an error surface.
- **The handoff checklist could never be fully ticked (K4).** Items 4–5 ("spec
  derived AFTER the user confirmed this report", "scope_closed written into the
  spec") can only become true after `report.md` is frozen, so every correct run
  shipped a report whose checklist read as failed. Both are now labelled
  `(satisfied post-confirmation — see the spec)` with the reason stated inline
  — the smaller change, and it keeps the report self-contained.
- **Shipped literals that contradicted the code.** The combiner's model pin said
  Opus 4.8 in two places after the v0.34.0 re-pin — in the gates prose and, more
  dangerously, in `combined-report.md`'s TEMPLATE, which is copied by whoever
  fills it. Same for the analyst report templates. And
  `report-requirement.md` claimed the report is written to `analyst_report/…`
  when SKILL.md writes it to `analyzer_dir` and only COPIES out on stop-here.
  A test now ties each schema template's `model:` literal to the agent that
  actually fills it (a merely-valid pair is not enough: `opus-4.8-high` IS a
  real pair, just the wrong agent's).
- **`R#` is the SPEC's namespace.** A report row labelled `R1` collides with the
  spec's ids, and the derivation lint compares the two sets — it would
  false-pass or false-bounce. Report rows are "row N"; a row that legitimately
  duplicates another's `files[]` carries `yields_build_work: false`.
- **Analyst returns lead with structured fields.** A 41k-token pass-1 return was
  observed arriving as ONE line (`**actual_effort:** high`) — an environment
  transport defect, not ours, but with a cheap payload mitigation: emit status,
  `actual_model`/`actual_effort` and the verdicts FIRST so a truncation costs
  prose. That hook's `RETURN` line also carried no `model=`, because the hook
  appends it only when `actual_model` is visible in the last message.

Not ours, recorded so it is not re-litigated: subagent `Write` refusal is
NONDETERMINISTIC and keys on filename/intent ("report"), firing on the FIRST
dispatch of an analyst thread and not on continuations — so Phase E step 1
(author `report.md`) is the one step that reliably fails and the orchestrator
persists the file verbatim, while step 2 (the spec) works normally. Any eval
line grading *the analyst writing report.md* is untestable in this environment.

---

## 4c. Test Authoring — Phase 6.5 (opt-in; default OFF)

Gated by `generate_tests` (config; default `false`). When on, after Verify (6)
and before Ship, the orchestrator dispatches `orc-test-author-opus-5-med`
(subskill `orc-testgen`: SKILL.md + subagent.md + core.md) to **write** test
cases as a deliverable. It **runs nothing and gates nothing** — the user tests
manually.

- **Reasons from:** the run's `actual_files` (diff) + intent-spec definition-of-
  done + touched flows. Types: new-behaviour, flow/E2E, change-focused, regression
  (bounded to the diff's blast radius).
- **Deliverables (stack-detected):** automated test files in the project's
  framework; a manual `TEST-PLAN.md` with two SEPARATED sections ("run the
  automated suite" = the exact CLI command, vs "exercise the real running
  service" = manual/curl steps); and, for HTTP-API backends, a Postman-importable
  `test-cases.http` curl bundle (env-var placeholders — never real secrets).
- **Manual-QA output is pinned (v0.26.0).** The two manual deliverables
  (`TEST-PLAN.md` + `test-cases.http`) are USER deliverables, not run state, so
  they are written to **`test-generator/<change-slug>/` at the project root** —
  NEVER inside `.claude/` and NEVER inside the run folder (`<change-slug>` = the
  run's existing kebab-case run-folder slug). The return's
  `test_plan_path`/`curl_bundle_path` MUST point inside that folder; any other
  location is a malformed return (the caller re-dispatches per the existing
  failure handling). The folder is a SHIPPED deliverable — committed on ship, not
  gitignored — and both caller lanes state the exact path in the end-of-run
  summary so self-QA is discoverable. Automated test files are NOT moved — they
  stay in the project's own test conventions (`output_conventions`). The location
  sentence (`test-generator/<change-slug>/`) is a registered contract token in
  `bin/verify-contracts.js`, pinned across core.md / the testgen SKILL.md / the
  agent / orc / orc-mini so it can't drift.
- **Not a gate.** Advisory `notes[]` may flag a case the code likely won't satisfy,
  but nothing blocks ship — the user decides. The agent returns the standard
  `actual_model`/`actual_effort` fields so it participates in the trace's
  claimed-vs-actual VERIFY like every other agent. Full lane runs it after Verify;
  **orc-mini also offers it** (opt-in end-of-run ask, only when GREEN — it never
  gates the mini ship either).

## 4e. Ultra lane (`/orc-ultra` — advisor + three judgment gates)

The maximum-rigor lane for complex/ultra-complex requests. NOT a separate
spine: `/orc-ultra` runs the `orc` skill with `ultra_mode: true` forced on;
the deltas live in `orc/references/ultra-mode.md` (loaded only on ultra runs).
Never active in `/orc` or `orc-mini`. Cost is accepted by definition — stated
once at intake, never prompted mid-run.

- **Forced overrides (run-scoped, NEVER written to `orc.config.yaml`):** deep
  analyze (the analyst's standard/deep gate is bypassed), `pattern_findings`
  on, `generate_tests` on, `security_review` on, and an executor **tier
  floor** (no dispatch below `orc-executor-sonnet-5-high`; top bands →
  `orc-executor-opus-4-8-high`).
- **Phase U0 — Advisor.** New sibling skill **`orc-advisor`** + agent
  **`orc-advisor-opus-5-xhigh`** (read-only, xhigh effort, one dispatch per
  run): a code-grounded advisory brief — risks, alternatives, a MANDATORY
  security section, a request-specific **rubric** (correct analysis / correct
  plan / faithful implementation) — plus `open_questions[]` (relayed to the
  user in ONE batch; unanswered → proposed default + UNCONFIRMED ledger entry)
  and the seed of the run's **assumption ledger**
  (`run/…/ultra/assumption-ledger.md`). The brief is injected LITERALLY into
  analyst/planner/judge/executor slices. Return: `brief_path`,
  `open_questions[]`, `assumptions[]`, `actual_model`/`actual_effort`.
- **Three judgment gates.** New sibling skill **`orc-judge`** + ONE agent
  **`orc-judge-opus-5-xhigh`** (read-only), three dispatch contexts:
  `gate=analysis` (after the analyst-return deterministic gates),
  `gate=plan` (after the Phase 1 exit gate + an orchestrator-built
  **blast-radius map**), `gate=implementation` (after Phase 6/6.5 + a
  deterministic **traceability matrix** `R# → task → diff hunks → verify
  evidence` + the project's own static analysis — never installed). Gate 3 is
  fidelity (nothing missing, nothing invented, matrix-guided reading — never
  an inlined diff) + ultra-strict quality (security / SonarQube-class smells /
  simplification / wrong placement / pattern-invariant violations — blocking
  when justified).
- **Verdict discipline:** APPROVE | REVISE | ESCALATE. A blocking finding
  needs a verbatim anchor + class-appropriate justification
  (`failure_consequence` for correctness/security; named category + concrete
  alternative for smell/simplification/placement) or the orchestrator
  auto-downgrades it to advisory; a security finding with a concrete
  consequence NEVER downgrades. APPROVE-with-zero-findings is legitimate.
  REVISE re-dispatches the author with findings verbatim (author echoes
  `finding_id → resolution`); re-judges obey the **convergence rule** (block
  only on unresolved prior ids or revision-changed lines) with a **hard cap
  of 2 loops per gate**, then the ESCALATE menu (accept-and-proceed / manual
  fix + re-judge / one extra loop / stop-and-checkpoint). Advisory findings
  never loop. Judge gates ADD to user sign-offs, never replace them;
  deterministic checks always run BEFORE a judge; no gate re-litigates an
  earlier approved gate.
- **Plumbing:** `ADVISE`/`JUDGE` trace verbs + `judgment` GATE name
  (pass|bounce|escalate); checkpoint `ultra_mode` flag + `ultra` block
  (per-gate `{verdict, round, loops_used}` + brief/ledger/matrix paths — a
  resumed run continues mid-loop); verdicts persist as
  `run/…/ultra/verdict-<gate>-<round>.md` (mined by `/orc-retro`).
- **Drift by design (update every copy):** `ultra_mode` spans the command +
  orc SKILL.md + ultra-mode.md + trace-protocol.md + checkpoint schema;
  `brief_path` spans advisor agent + skill + ultra-mode.md + checkpoint;
  `failure_consequence` spans judge agent + skill + ultra-mode.md — all three
  linted in `bin/verify-contracts.js` (19 contracts at v0.10.0; 23 as of
  v0.11.0 — see §4f).

## 4f. Fast lane (`/orc-fast` — knowledge-gated) + wiki freshness infrastructure

The fastest lane, and the wiki upgrade that makes it trustworthy (v0.11.0).

- **`orc-fast` skill + `/orc-fast` command.** Skips the analyst AND planner by
  requiring two prerequisites at preflight: (a) a **fresh wiki** and (b) a
  **cached code-pattern** for the request's language
  (`.claude/orc/patterns/<lang>-pattern.md`). Either missing → **fallback to
  orc-mini** via the `FALLBACK-FROM` handoff block (reason + intent-spec/raw
  request carried over; shared run-folder format, no migration) — the chat
  never stops. A fit gate bounces multi-task / >~5-file / core-surface
  requests the same way. One combined pre-spawn confirmation, then ONE
  `orc-executor-sonnet-4-6-high` dispatch (wiki page PATHS from `wiki/INDEX.md`
  as pointers + the pattern injected literally + house-rules card), then a
  build+test smoke gate using the manifest's cached `commands` (one repair
  round; red blocks ship; second red → escalate menu). The orchestrator runs
  fine at **Sonnet medium** — the effort guard only matches the exact skill
  name `orc`, so orc-fast passes it untouched.
- **Wiki freshness manifest (`.claude/orc/wiki-meta.json`).** Written ONLY by
  orc-wiki at the end of every scan/refresh: `last_scan` (dd-mm-yyyy hh:mm:ss),
  `scan_commit`, `branch`, `pages`, and the project's discovered build/test
  `commands`. **Freshness is computed on read, never stored** — a stored
  status would go stale on the next commit. Tiering:
  `git rev-list --count <scan_commit>..HEAD` → FRESH (<`wiki_fresh_max`, 10) /
  AGING (≤`wiki_aging_max`, 30) / STALE (beyond, or drift touching consulted
  docs' `covers`). Reactions: full/mini lanes notice/warn and continue (they
  self-ground); orc-fast STALE triggers a user gate — refresh-then-continue
  *(recommended)* / drop to mini / continue anyway (stamps
  `wiki_stale_override`). Manifest absent but wiki present = STALE-with-notice.
  Canonical reference: `orc-wiki/references/staleness.md`.
- **`wiki/INDEX.md`** — one line per doc, emitted every scan; consumers select
  pages by reading ONE small file.
- **Incremental refresh** — diff since `scan_commit`, re-scan only docs whose
  `covers` the drift touches, rewrite the manifest. Makes "refresh first"
  cheap enough to honestly recommend.
- **Post-ship refresh ask (full + ultra lanes)** — after ship on a BIG run
  (tasks ≥ `wiki_refresh_ask_tasks` 3, or touched files >
  `wiki_refresh_ask_files` 10, or >1 wave; only when the run touched covered
  files; guarded on a non-empty wiki): ask refresh-now *(recommended,
  incremental)* vs later ("later" prints the refresh-ASAP note + stamps
  `wiki_refresh_declined`). Small runs / mini keep the passive stale-flag
  note; fast never asks.
- **Statusline** — `orc-statusline.js` appends a zero-token
  `wiki: fresh|AGING (Nc)|STALE (Nc)` segment computed from the manifest
  (fail-silent; thresholds mirror the config defaults — the hook can't read
  resolved config).
- **Wiki v2 (v0.15.0) — evidence-anchored second source of truth.** Doc schema
  v2 (`wiki_schema: 2`, `schemas/wiki-doc.md`): contract sections (Key files /
  Public interface / **Contracts & shapes** — routes, tables, events, config
  keys / Data & state / Dependencies) MUST anchor every claim to a real file —
  "a claim you can't anchor is omitted, not guessed"; unanchored contract
  sections or a return missing `keywords[]`/`covered_files` = malformed
  (requeue). New sections: **TL;DR (60-second brief)** at the top of every doc
  and a **Testing map** (where the area's tests live + scoped run command).
  Four standard cross-cutting reference docs planned whenever the surface
  exists (never fabricated): `orc-reference-api-surface` / `-data-model` /
  `-glossary` / `-config-env`. The manifest gains a per-doc **`docs` registry**
  (covers + per-file `covered_files` hashes) so all staleness questions
  resolve from one JSON read + two git commands; incremental refresh runs a
  **coverage-gap sweep** (changed files no doc covers → propose new areas) and
  a **dead-doc sweep** (covers match nothing → archive to `wiki/archive/` or
  delete, user decides). `wiki/INDEX.md` lines are structured
  (`file · doc_type · status — description · kw:` keywords). Every scan/
  refresh ends with the **integrity self-check**
  (`references/integrity-check.md`): index-sync, registry-sync,
  covers-resolve, coverage report, counts-match, anchor spot-check — with
  `WIKI-CHECK` trace lines. Precedence rule stated everywhere the wiki is
  consumed: `code > fresh wiki > stale wiki (hints) > model priors`. v1 wikis
  keep working (consumers degrade gracefully; refresh upgrades docs lazily).
  Consumers updated to pull the new surfaces: orc + orc-mini consult passages
  (keywords match, TL;DR/Contracts-&-shapes/Testing-map pulls, cross-cutting
  maps by domain), orc-fast F2 pointer selection (keyword match + precedence
  line injected into the slice), both planner subskills + agent files
  (Contracts & shapes for grounding, Testing map for declared test files).
- **Drift by design (update every copy + the lint table):** `wiki-meta.json`
  and the `AGING` tier enum span statusline + orc/orc-mini/orc-fast/orc-wiki
  SKILL.md + config.md + staleness.md (wiki-meta also in integrity-check.md);
  `wiki_refresh_ask` spans orc SKILL.md + config.md + staleness.md;
  `FALLBACK-FROM` spans orc-fast + orc-mini. Wiki v2 tokens: `covered_files` +
  `wiki_schema` span orc-wiki SKILL.md + wiki-doc.md + staleness.md +
  integrity-check.md; `WIKI-CHECK` spans orc-wiki SKILL.md +
  integrity-check.md; `orc-reference-api-surface` spans orc/orc-mini/orc-fast/
  orc-wiki SKILL.md + staleness.md; `code > fresh wiki` spans those four
  SKILL.md + staleness.md + claude-md-injection.md. orc-fast also registered
  as a consumer of `actual_model`, `invariants_checked`, `house_rules`,
  `unmet[]`, backtick-`GATE`, and `.current` (34 contracts total as of
  v0.15.0).

## 4g. CLAUDE.md builder (`/orc-claude` — local-target, zero-question)

A standalone skill (`templates/skills/orc-claude/`) + command that builds,
updates, or refreshes the **current repo's** `CLAUDE.md` from verified facts —
even when ORC is installed globally it never targets `~/.claude/CLAUDE.md`.
Fully non-interactive (no AskUserQuestion, ever). **Dispatch, don't do:** the
skill (whatever model the chat runs) only picks the mode and spawns the pinned
`orc-claude-writer-opus-4-8-high` agent — the engine that scans and writes —
then checks `actual_model`/`actual_effort` on return and relays the report.
Any caller tier can invoke it safely; the writing is always Opus 4.8 high.

- **Three auto-selected modes:** REFRESH (file carries an `orc-claude:meta`
  header → regenerate only fingerprint-stale fenced sections, bump the FILE's
  version by exactly 0.0.1, date DD-MM-YYYY; noop → no write/bump/bak),
  UPDATE (foreign hand-written file → `CLAUDE.md.bak` first, inject header +
  fenced sections, NEVER trim/rewrite a user line — contradictions are flagged
  in the report, not fixed), CREATE (no file → fresh from
  `references/template.md` at 0.0.1).
- **Structure:** meta header (generated-by / version / updated / line-budget /
  `name@fingerprint` section map) + `orc-claude:section` fences per generated
  section. Zone A rules (P0, whatis, commands, boundaries, workflow,
  decisions) then Zone B reference (layout, conventions, patterns, gotchas,
  testing, adr, environment, glossary, pointers). Empty-scan sections omitted.
- **User-authored sections** (`@user`: P0, Gotchas, Glossary + boundaries'
  user half) are emitted as placeholders with a hard fill-it-yourself note and
  never regenerated.
- **Budget** (default 400, `budget=N` overrides, persisted in the header)
  counts ONLY generated lines; overflow cuts Zone B into `docs/claude-*.md` +
  a pointer, Zone A never. Existing user content never counts and is never
  trimmed — a 600-line file growing to 800 is fine; the report tells the user
  to prune themself.
- **Fingerprints** are md5-first-6 of each section's canonical INPUT string
  (recipe table in `references/refresh.md`), computed via a real `node -e`
  command, so rewording never marks a section stale.
- **Wiki block:** the `ORC-WIKI:START`…`END` block stays byte-identical;
  orc-claude generates no wiki-overlapping content.
- **Drift by design (update every copy + the lint table):** `orc-claude:meta`
  spans SKILL.md + both references + the example; `orc-claude:section` spans
  SKILL.md + both references; `ORC-WIKI:START` spans the writer agent +
  orc-claude SKILL.md + `references/refresh.md` + orc-wiki
  `references/claude-md-injection.md`. orc-claude is also registered as a
  consumer of `actual_model` (skill + writer agent) and `.current`; its trace
  emits the single-dispatch marker set (`DISPATCH`/`VERIFY`/`FINISH` + the
  hook's `SPAWN`/`RETURN`), so it is no longer a `GATE` consumer — the mode
  rides in the `DISPATCH`/`FINISH` tails (29 lint contracts total as of
  v0.13.0).

## 4h. DIY lane (`/orc-diy` — CLI-composed flow, compiled, hard-gated) — v0.16.0

A lane whose pipeline shape the USER composes. Three principles: **the CLI is
the only writer** (config, flow spec, lock, compiled artifact — never a Claude
session), **compile, don't interpret** (the skill follows a stitched flat flow
file, no runtime config reading), and **fail closed** (anything not verifiably
compiled-and-current never runs).

- **Files (all project-scoped; `orc diy` rejects `--global`; one flow per
  project):** `.claude/orc-diy.config.yaml` (choices),
  `.claude/orc/diy/flow.md` (human-readable spec, regenerated per write),
  `.claude/orc/diy/flow.lock.json` (hashes + compile stamp),
  `.claude/orc/diy/FLOW-COMPILED.md` (the runnable artifact). All outside
  `templates/`, so `orc update` never clobbers them.
- **Interactive composer (v0.16.1):** bare `orc diy` on a TTY opens a menu —
  bootstrap wizard when unconfigured (defaults or a preset, each shown with
  what it changes), per-key numbered pick-lists for string enums (number OR
  value accepted; numeric keys stay type-the-value to avoid index/value
  ambiguity), live gate status + validation in the header, `c`ompile /
  `v`alidate / `x` reset-a-key actions (a failed compile returns to the menu
  — `diyCompile` returns a boolean, only the `orc diy compile` case exits),
  and a compile offer when quitting with a non-READY gate. Non-TTY (e.g. a
  Claude Bash call) never hangs — it prints the `show` table. `orc config`'s
  menu gained the same numbered pick-lists.
- **Config surface** (`orc diy set`): phase presence/strictness (`analyze`
  auto/off/mini/full, `review` on/off/blocking-only, `security`
  off/ask/on/always, `verify` full/off/smoke, `testgen`, `wiki_gate`
  notice/off/hard, `post_ship_wiki_ask`, `summary`), `planning` route,
  `pattern`, `scoring` on/off (+ `fixed_executor` required when off),
  `autonomy` interactive/semi/hands-off, `ship_mode` ask/commit/pr/report-only,
  `session_tier` (default `opus-4-8-high`; the full v0.30.0 grid: sonnet-4-6 ·
  opus-4-7 · opus-4-8 · fable-5, each at med/high — opus-4-8 & fable-5 also
  xhigh/max), wave/pause/band numbers, `flow_name`. Presets: `lean`, `paranoid`,
  `solo-fast`. Cross-key validation: scoring-off needs a catalog
  fixed_executor within tier; security needs review; agent > tier = hard
  error; fixed Opus roles under a lower tier = warning (tier-honesty reports
  the silent downgrade at runtime).
- **Compile (`orc diy compile`, deterministic, zero tokens):** stitches block
  templates from `skills/orc-diy/references/blocks/` (variant sections chosen
  by `<!-- diy:when key=value -->` markers; the parser half lives in cli.js —
  change them together), injects `references/locked-blocks.md` verbatim
  (never-implement, disk-is-truth, wave conflict rule, severity ladder +
  quote spot-check, checkpoint discipline, red-build ship block, tier
  honesty), substitutes `{{placeholders}}`, CLIPS the single 8-band score→model
  table to `session_tier` at compile time, verifies every cherry-picked orc path
  exists (referenced in place, not copied), writes the artifact, stamps the
  lock (`config_hash`/`compiled_hash`/`orc_version` from the installed
  payload stamp). `/orc-diy compile` in-session just shells out to the CLI.
- **Gate (`orc diy status`, same computation in stub + guard + statusline):**
  UNCONFIGURED (no config) / STALE (never compiled · config changed since
  compile — `config_hash` in the lock is COMPILE-owned, `orc diy set` never
  refreshes it · orc updated · artifact modified/missing) / READY. The stub
  skill on UNCONFIGURED/STALE explains the CLI fix and offers plain `/orc`
  (one question, never silent); READY → it follows `FLOW-COMPILED.md` as the
  spine. The effort guard derives the required effort from the lock's
  `session_tier` slug suffix (that effort OR stronger — e.g. a `-med` slug
  accepts medium+; no lock → deterministic onboarding block; `compile`/
  `status` args pass at any effort). The statusline appends
  `diy:<flow> READY|STALE→recompile` + a model-mismatch warn. `orc update`
  prints a recompile nudge when the lock's `orc_version` differs.
- **Docs split (deliberate):** the how-to-build guide is
  `templates/skills/orc-diy/README.md` — NOT the root README, which only
  links to it (Commands row + `/orc-diy` section + config-section note).
  Keep new DIY documentation in the skill README, not the root.
- **Drift surfaces (update every copy + the lint table):** `flow.lock.json`
  spans both hooks + stub SKILL.md + orc-diy README + compile.md +
  flow-schema.md; `FLOW-COMPILED.md` spans the command + statusline + stub +
  README + both references; `orc-diy.config.yaml` spans statusline + stub +
  README + both references; `diy:when` spans all 12 block files + compile.md
  (+ the unlinted parser in `bin/cli.js`). The `DIY_PRESET_NARROW/WIDE`
  tables in cli.js MIRROR `skills/orc/config.md` presets — a documented
  drift like the executor agents (38 lint contracts total as of v0.16.0).

### 4h.1 DIY status is an exit-code contract, and the compile spec matches (v0.34.7)

The gate itself graded clean — the hook blocks before the skill body loads, STALE
refused a still-valid `FLOW-COMPILED.md`, and an A/B compile proved the tier clip
is byte-targeted to the over-tier row. These are the sharp edges around it.

- **`orc diy status` exited 0 in all three states.** The exit code carried no
  information, so a consumer branching on it treated a hard-blocked flow as
  runnable — the direct INVERSE of the sibling contract in
  `_shared/detecting-artifacts.md` ("the exit code IS the contract" for
  `orc pattern status <lang>`). Two status verbs in one CLI with opposite
  conventions, neither documented at the call site. Now 0 = READY, 1 = STALE |
  UNCONFIGURED, documented in `flow-schema.md`; the no-arg `orc pattern status`
  exits 1 on an empty cache (the mirror-image gap).
- **STALE reported only the FIRST trigger.** A real config had two live
  (`config_hash` + `orc_version`, lock 0.24.0 vs payload 0.34.0) and status said
  only "config changed". Harmless there because `compile` fixes both — but not
  in the case it hides: a flow stale ONLY because `orc update` ran reports a
  reason that contradicts the user's own knowledge of their config. All live
  triggers are collected and joined now.
- **`compile.md` documented a stitch order missing `mock-example`** (added to the
  compiler in v0.33.0). `compile.md` is the SPEC a reviewer checks the compiler
  against, so a maintainer reconciling the two would "fix" the compiler by
  deleting a working phase — the same trap class as a doc that names a config key
  the CLI does not have. A golden test now compares the documented list against
  the `order` array, and the doc states that `tdd` is NOT a block (it composes
  into planning/execution/verify via `diy:when` markers).
- **The self-gate only checked for a LOWER session model.** The band clip is
  frozen at compile time, but the pinned role agents are named verbatim and never
  clipped — so on a session ABOVE the compiled tier the reviewer/verifier run at
  full pin while the executor table stays clipped, and `orc diy status` still
  says READY because the session model is in no hash. The compiled header now
  reconciles both directions and names the fix. `session_tier` is a DECLARATION
  the system cannot verify (a hook can block on effort, never on model), so the
  `diy validate` warning no longer asserts the pinned agents "will" downgrade —
  on a higher session they demonstrably do not.

---

## 4m. Learning lane (`/orc-learn` — per-feature onboarding docs) — v0.22.0

The **human-onboarding lane**: teach one developer another developer's feature
well enough to safely extend it next iteration. Deliberately NOT the wiki —
the wiki grounds the *pipeline* (repo-wide, contract-level, machine-read);
orc-learn goes one level deeper for a *person*: function-level, one fully
traced flow, pedagogical voice.

**Output** — `learning-docs/<feature-slug>/` at the repo root, **local and
git-ignored** (the skill offers the `.gitignore` line, appends only on an
explicit yes). Two files per feature:
- `learning.md` — pedagogy: mental model, guided walkthrough of one real
  invocation entry→exit, common-change recipes, gotchas, **FAQ (required,
  ≥5 questions, seeded from real scan findings)**.
- `knowledge.md` — reference: `file:line`-anchored functions & flow (the same
  flow the walkthrough narrates), contracts/invariants, deps + extension
  points, verified how-to-verify commands, and the `orc-learn:meta`
  fingerprint header (`source_commit` + `covered_files` path→md5 map — its
  own field names, never the wiki's scan fields).
Plus a derived `learning-docs/INDEX.md` (slug · one-liner · dates · path —
never a stored freshness status).

**Scoping is wiki-first, then deepened.** INIT reads `wiki/INDEX.md` + the
manifest, computes the tier on read (staleness.md recipe), and offers the
wiki's feature areas as topics; the chosen area's `covers` globs seed the
writer's file set. No/stale wiki or uncovered topic → targeted scan of the
files the user points at (`focus=` hint or directory) — never repo-wide,
never a blocker. Precedence unchanged: `code > fresh wiki > stale wiki
(hints) > model priors`; every wiki claim used is re-verified against code.
As a wiki-grounding lane it traces `WIKI-CONSULT` on every wiki read (absent
wiki included, `tier=none`).

**Refresh** (`/orc-learn refresh`) lists EVERY generated feature with a
freshness tier computed on read from each `knowledge.md` header — same
git-distance + drift-intersect recipe as the wiki, reusing the existing
`wiki_fresh_max`/`wiki_aging_max` keys (**no new config keys**) — and the
user multi-selects which to regenerate. Nothing picked → zero writes.
Unselected features are byte-untouched.

**Shape** — modeled on orc-claude: the skill only picks topic/mode, writes
the trace markers, and dispatches the pinned
`orc-learn-writer-opus-5-low`; the writer does all scanning and every
`learning-docs/` write (including deriving INDEX.md). Returns carry
`actual_model`/`actual_effort` for the tier-downgrade check. Two deliberate
divergences, both by design: (1) orc-learn asks exactly ONE question per mode
(which feature / which to refresh) — orc-claude asks none; (2) INDEX.md is
model-derived, not CLI-derived — the wiki's CLI-only registration rule exists
because paused scans left shared docs unregistered; orc-learn is
single-dispatch with no pause window and its output is git-ignored/local, so
a stale index costs one regeneration, not a corrupted shared source of truth.

Files: `templates/skills/orc-learn/` (SKILL.md + references
`deepen.md`/`refresh.md`/`template-learning.md`/`template-knowledge.md` +
`examples/learn-run-mock.md`), `templates/agents/orc-learn-writer-opus-5-low.md`,
`templates/commands/orc-learn.md`.

## 4o. Poly-repo planning lane (`/orc-poly`) — v0.27.0

**The problem.** A single change often lands in two-or-more repos at once — a
new endpoint in the backend and the UI that calls it in the frontend, a service
and its downstream gRPC consumer. Built one repo at a time from memory, the
halves **drift**: the FE assumes a field the BE never returns, the consumer
expects a status the service never sends. ORC's existing crosslink subsystem
(§4i) describes the *existing* seam; it does nothing to coordinate a *new* one.

**The lane.** `/orc-poly` is a **planner, not a builder** (command-entry only;
no config key). It runs in the **HOST** repo (the current repo — where it writes)
and the user pastes the path of each **PEER** repo (one or many — N peers, e.g.
FE→BE→another service's gRPC). It gathers the cross-repo context, freezes the
shared boundary into a single **interface contract**, and drives the split into
one plan per repo. The actual build happens LATER, per repo, in its own session
via plain `/orc` pointed at that repo's plan — every plan pins the same frozen
contract, so no repo drifts.

**Read-only peer, one plan-only write.** PEER **source is READ-ONLY**: orc-poly
reads it (via absolute paths — a peer is outside CWD) to learn where/how the
change lands. The ONLY thing ever written into a PEER is its handoff plan file
(Phase P5). It never edits peer source, never commits, never pushes — in any
repo. HOST writes live only under `poly-repo-implementation/<slug>/` (a visible,
committed deliverable — the carried source of truth, never inside `.claude/`).

**PEER input = path OR crosslink slug (P0).** Each PEER the user gives is either
a filesystem path or a **crosslink node name** — a `nodes[].name` slug in the
HOST's `.claude/orc-crosslink.config.yaml` (the `orc crosslink` graph, §4i). A
slug that resolves yields the peer's `repo_path` AND the host↔peer relation for
free (read from the `links[]` edges — which side consumes the boundary); a raw
path carries no edge info, so orc-poly asks the relation. An unrecognized slug
never guesses: it names the bad input, **lists every available node name** (or
"no crosslink config"), and offers pick-a-slug or paste-a-path-and-state-the-
relation. This reuses a graph the user may already have configured for §4i.

**Flow (P0–P5).** P0 intake (identify HOST + PEERs + the change; derive
`<slug>`). P1 knowledge gate PER repo, **non-blocking**: HOST wiki via
`orc wiki status` + tier from `wiki-meta.json`; a PEER wiki is read directly at
its path (the `orc` CLI is CWD-scoped). Both repos have a usable wiki → read the
pages + each repo's `wiki/crosslink/` boundary tags before digging source. A
repo lacks a usable wiki → **ask the user** for that repo's folders/files or a
pattern (never a blind repo-wide scan) — a missing wiki is never a blocker and
never falls back to another lane. P2 recon + the **question loop**: read the
pointed files across all repos, keep asking until the boundary can be written
with **no guesses**. P3 write the doc set: `poly-context.md` (understanding),
`interface-contract.md` (the FROZEN boundary — request/response schema,
status/error codes, auth, versioning; THE anti-drift artifact), `poly-spec.md`
(machine-readable handoff carrying the `orc-poly:spec` marker + a `repos[]`
block). P4 iterate — ask exactly THREE choices every iteration: **pass to
orc-plan** / **stop & chat** / **add more context** (another PEER path or pasted
knowledge); only the first leaves the loop. P5 split — hand `poly-spec.md` to
`/orc-plan`; the shared planner self-activates **poly-repo split mode** on the
marker.

**Poly-repo split mode (the shared planner).** `orc-planner-opus-5-med` detects
the `orc-poly:spec` marker and produces **one planning-output per `repos[]`
entry** (never a merged plan): each scoped to that repo's `in_scope[]`
(grounded against THAT repo's files via absolute paths), each embedding the
frozen `interface-contract.md` **verbatim** with the requirement's `contract_ref`
copied into the guarded task's `spec_invariants[]`. The HOST plan is written
under the HOST repo's `poly-repo-implementation/<slug>/`; each PEER plan is
written INTO that peer repo at the same relative path (the sole peer write).
Normal (non-poly) specs never trigger this branch, so the core `/orc` flow is
untouched. The mode is gated purely on the marker. **The `/orc` orchestrator
spine itself honors the exception** (orc/SKILL.md Phase 1 + the orc-planner
subskill): the "planning always hands back → run Phase 2–8" rule has ONE carve-
out — a poly-spec is split-and-STOP (present the per-repo plans + handoff, never
score/wave/build; each repo builds later in its own `/orc` session). This is why
`/orc` on a poly-spec doesn't try to build a merged plan. (Adding the exception
took orc/SKILL.md to 334 lines; its lint budget was deliberately raised to 335.)

**Contracts registered** (`bin/verify-contracts.js`): `orc-poly:spec` (marker),
`poly-repo-implementation/` (output dir), `interface-contract.md` (frozen
boundary). orc-poly also joins the trace/wiki shared contracts it consumes
(`.current`, the cadence self-check, `` `GATE ``, `WIKI-CONSULT`, `AGING`,
`wiki-meta.json`, `code > fresh wiki`, `detecting-artifacts.md`, `wiki/crosslink/`)
and the planner + `poly-spec.md` join the `git_head` staleness-stamp contract.

**Tier.** Not effort-gated — the effort guard matches the exact skill name `orc`,
never `orc-poly`, so this lane runs at whatever tier the chat is on (Opus high is
better for cross-repo reasoning; it is correct at any tier). Behavior-trace
logging is permanent as in every lane.

Files: `templates/skills/orc-poly/` (SKILL.md + `references/gather.md`,
`references/poly-spec.md`, `examples/poly-run-mock.md`),
`templates/commands/orc-poly.md`; the poly-split branch lives in
`templates/agents/orc-planner-opus-5-med.md` + a pointer in
`templates/commands/orc-plan.md`.

---

## 4z.31 v1.9.0 — `/orc-mini` measures its own complexity read

**The problem.** Mini's complexity read replaced the full lane's scoring table
with a sentence of judgment: *"single coherent area, low blast radius →
mini-appropriate."* Nothing behind it could be checked, moved or argued with.
The planner could not see a single repository fact. The exit gate Globbed one
declared path at a time. And the orchestrator read wiki page BODIES into its own
context — the 74–80% surface — to hand a summary to agents that could have read
the page themselves for less.

**M1 — the line carries numbers.** After the planner returns and passes the exit
gate, mini counts, from `orc graph impact <declared_files>` (ONE call) and
`orc graph cochange <each declared file>`:

- confident callers — `LOCAL` · `IMPORT` · `UNIQUE` · `ROUTE` — whose file is
  **outside** `declared_files`. A caller inside the plan is part of the change,
  not blast radius.
- the distinct files those callers sit in.
- the tests that reach.
- `cochange` partners with `count >= 3` not in `declared_files`.
- the planner's own `facets.risk[]`.

`AMBIGUOUS` callers are counted **separately** and printed as `maybe <n>`; they
never trip a threshold alone, which is the catalogue's own rule ("an `AMBIGUOUS`
caller is counted, never followed").

```
complexity: mini-ok — 3 files · confident callers 4 in 2 files · tests reach 2 · risk none · cochange none
complexity: recommend /orc — 6 files · callers 27 in 9 files · risk auth (src/routes/orders.js:12) · cochange src/auth.js x3 not in plan
complexity: mini-ok (graph off) — 3 files · risk none
```

Trace: `GATE complexity :: <the line>`.

**The four thresholds, and why each number.** Each is stated with its reason in
`templates/skills/orc-mini/references/complexity.md`, because a threshold
without a reason cannot be defended or moved.

| Threshold | The reason |
|---|---|
| confident callers in **4+ files** outside `declared_files` | mini's premise is ONE coherent area; four outside files is a change felt across areas, and areas are what a planner and a reviewer exist for |
| **8+ confident callers** outside `declared_files` | one executor and one smoke gate verify a small blast radius well; eight callers is where a reviewer starts to earn its cost |
| **any `facets.risk[]` entry** | the six classes (auth · money · migration · security · concurrency · data-integrity) are what the full lane's review and verify phases exist for, and the planner already floors them to 70 |
| a **`cochange` partner with 3+ co-commits** not in `declared_files` | history says people always touch that file too; a plan without it is probably missing a file, and mini has no second pass to notice |

**It is an OFFER (DE-8, DE-14).** *"1. switch to /orc (recommended — <reason>) ·
2. continue in mini."* Continuing writes the **numbers** into the decision log,
not just the choice, so `/orc-retro` can move a threshold from evidence rather
than argument. The VERDICT is computed by the lane, not the CLI: the spine
states the rule, the CLI supplies the counts, the orchestrator prints the line.
A CLI-computed verdict (`orc graph impact … --fit mini`) is the right next step
and is deliberately NOT in 1.9.0 — the thresholds survive a retro first.

**Graph off is a first-class answer.** Exit 3 anywhere → the `(graph off)` form,
decided from `facets.risk[]` alone. A number is never invented to fill the line.

**M2 — the planner is dispatched WITH the facts.** The slice carries
`graph_facts` (or `null`): `map` (the `map --focus` text, 800 tokens at most),
`impact` rows `{file, confident_callers, caller_files, tests_reaching}`,
`cochange` rows `{file, partners: [{path, count}]}`, and the `generation`. Both
mini planner variants gained the same paragraph: ground `declared_files` and
`facets.breadth` on `impact`; a `cochange` partner **not** in the plan is an
`open_questions[]` entry and **never** a silent addition; `tests_reaching` feeds
`test_surface`; cite as `graph gen <n>`; the graph is a LOCATOR, so confirm a
path exists before marking it `exists`, and a card's silence is not proof of
absence.

**M3 — the exit gate batches.** `analyst-gates.md`'s "Glob every
`disposition: exists` path" becomes, for mini, `orc graph ctx <paths>` five at a
time: exit 0 confirms, exit 4 or an unindexed path falls back to a Glob.
Coverage, cycle and collision checks are unchanged. The delta is stated in the
mini spine, not in the shared file, because `analyst-gates.md` is `core` for
every lane.

**M4 — wiki POINTERS, never bodies.** The orchestrator reads `wiki/INDEX.md`
(one line per doc) and `orc wiki status --json`, selects 1–3 page PATHS by
keyword, and puts the paths in the planner slice AND the executor slice with
*"Read these first: the TL;DR for orientation, `Contracts & shapes` for
specifics"*. **It never reads a page body into its own context.** The shared
lane-delta sentence in `_shared/phases/wiki-consult.md` becomes "**orc-fast and
orc-mini** pass POINTERS, not content"; the FULL lane still reads content
itself, because it has a reviewer and a verifier to spend that context on. Mini
also had to be ADDED to the `wiki-status` catalogue row — it always consulted
the wiki, and the tier this command computes is what the path selection rests
on.

**M5 — the smoke gate runs the affected tests first.** `orc graph changes`,
filtered to `actual_files`, unions the `tests[]` (call AND `ROUTE`); those run
before build and suite. A runner that takes no file list says so in one line.
The same answer prints a one-line blast radius where `risk` never appears
without its `why`.

**The `changes` signal is one OPTION, never a gate (DE-8).** A `risk: high` row
— exported, fan-in 3+, no test reaches it — adds ONE option to the EXISTING
end-of-run question batch (mock example · test authoring · ship): *a.* dispatch
`orc-reviewer-opus-5-med` on the diff (P0/P1 block the commit offer once) ·
*b.* write a test in Phase T · *c.* ship anyway. **No new user turn**, and mini
still skips full review — this is a CLI signal with its reason and three exits,
not a review phase smuggled back in.

**M6 — `none` is recorded.** `wiki_used: none` and `graph_used: none` from any
return reach the checkpoint and the ship line
(`knowledge: wiki 2 pages offered · used none · graph card 2 targets · used
none`). Two runs in a row with `wiki_used: none` on FRESH pages prints one line
suggesting the pages' TL;DRs are the problem. A signal, never a gate, and never
dropped for looking like a null result.

**M7 — the gain line.** `orc graph gain --run <this run>` at the smoke-gate
close, `line` copied verbatim. A new `graph-gain` catalogue row was required:
two lanes now name the command, and the lint refuses a call two lanes name that
the catalogue does not hold. Its three `never`s: never restate the line as a
saving, never drop the word "estimate" or the range, never block or fail a run.

**Two catalogue facts this release created.** Mini **left**
`graph-notes-pending` — Phase M runs ONE `orc graph update --notes-pending
--files <actual_files>`, which answers the update and the pending batch together
— and it still dispatches the noter when that answer has rows. And mini
**gained** `graph-map`, `graph-impact`, `graph-changes`, `graph-cochange`,
`graph-gain` and `wiki-status`. The `graph-map` row's v1.8.2 "planning ONLY"
premise is NARROWED, not dropped: DE-H's measured 0.39 answerable planning calls
per run was the ANALYST asking for a map after the files were already known;
mini asking before its tiered round is the same orientation question from a lane
with no planner to ask it.

**Budget.** The spine went 268 → 246 at the trim, then to **280** against a pin
raised **270 → 280 with its comment** in `bin/verify-contracts.js`. The
arithmetic — how to count, why each threshold is that number, the `graph_facts`
shape, the offer wording, the decision-log line — lives in
`references/complexity.md`, mini's first `references/` file. The spine keeps the
line format, the four thresholds in one sentence, the `GATE complexity` verb and
the pointer.

Files: `templates/skills/orc-mini/{SKILL.md,references/complexity.md,
examples/mini-run-mock.md}`, `templates/commands/orc-mini.md`,
`templates/agents/orc-planner-mini-{sonnet-5-high,opus-5-med}.md`,
`templates/skills/_shared/phases/wiki-consult.md`, `bin/cli.js` (`LANE_CALLS`),
`bin/verify-contracts.js` (the budget pin), `test/cli/graph-lanes.test.js`.
