# ORC — Config

This file is the **shipped defaults**. Central knobs the orchestrator reads at
run start. Override any value for a single run without editing the file.

## Config resolution (defaults ← override file)

At run start, resolve **each key independently** as: **default (this file), then
the user override on top.** The override lives at `.claude/orc.config.yaml`
(project `.claude/` root), holds ONLY the keys the user changed, and is written
exclusively by the **`orc config`** CLI. It sits OUTSIDE `templates/`, so `orc
update` never clobbers it.

Per-key means: a key present in `orc.config.yaml` uses the override value; a key
NOT present there falls back to this file's default — independently, key by key.
Example: if the override contains only `max_wave_tasks: 5`, then `max_wave_tasks`
is 5 and every other key (`batch_pause_every`, `rubric_bands`, `max_scouts`,
`default_analysis_depth`, …) still comes from this file's defaults. If the
override file is absent entirely, use these defaults unchanged. A per-run inline
override still wins over both.

> Config editing is a CLI concern, not a slash command — it's pure file I/O, so
> it runs deterministically with zero model tokens. Users run **`orc config`**
> (interactive menu) or `orc config set <key> <value>` in their terminal; this
> skill only READS the resolved values at run start.

```yaml
# --- Wave grouping ---
max_wave_tasks: 3          # max parallel tasks per wave (hard cap; overflow → next wave).
                           # Waves are computed for EVERY run (sequential too) —
                           # dispatch style is intra-wave concurrency only.

# --- Batch pausing ---
batch_pause_every: 2       # waves between MANDATORY stop-and-continue pauses.
                           # After wave W, if W % N == 0 AND a later wave exists,
                           # the stop is a HARD gate (not orchestrator judgment) —
                           # see references/stop-and-resume.md. The exact schedule
                           # is confirmed at intake (Phase 2) and stored as
                           # pause_schedule in the checkpoint.

# --- Rubric width (the "metrix") ---
rubric_bands: 5            # how many scoring bands the rubric REPORTS. Range 2–8.
                           # Granularity only — it no longer selects a preset.
                           # The score→model mapping is the SINGLE 8-band table
                           # below, used regardless of this value.

# --- Analysis (System Analyst) ---
max_scouts: 3              # max parallel read-only code scouts in DEEP analysis mode
default_analysis_depth: standard   # standard | deep — depth gate default (run still confirms)

# --- Test authoring (opt-in Phase 6.5; ORC writes test cases, never runs them) ---
generate_tests: false      # author test cases before ship? (run confirms at intake)

# --- Code-pattern findings (make executors match the project's house style) ---
pattern_findings: ask      # ask | on | off — on an FE/BE cache miss during /orc:
                           #   ask → P0 prompt (learn via orc-pattern, or agnostic)
                           #   on  → auto-codify on miss, no prompt
                           #   off → always agnostic (invariants only), never ask
orc_wiki_pattern_findings: false  # orc-wiki also codifies ALL detected langs during
                                  #   its scan (rides under the wiki's scan-consent)

# --- Repair memory (gotchas — what this project has already gotten wrong) ---
gotchas: on                # on | off — record a gotcha when a repair loop goes
                           #   red → green, and inject the SCOPE-MATCHING ones
                           #   into executor slices. Lives at
                           #   .claude/orc/gotchas.md — outside templates/, never
                           #   in the install manifest, so update/prune can never
                           #   touch it. NEVER injected unfiltered.
gotchas_max: 40            # live entries before the lowest-value tail is archived
                           #   to gotchas-archive.md (archived, never deleted).

# --- Mock example + drift recovery (Phase 6.7 — implementation lanes only) ---
mock_example: ask          # ask | on | off — post-verify mocked runnable example
                           #   (mock-examples/<change-slug>/ at project root; NEVER
                           #   committed — ship never stages it, no .gitignore edit):
                           #   ask → MANDATORY offer after a green verify/smoke gate
                           #   on  → always build; off → never. Drift answer →
                           #   DRIFT-FROM recovery (_shared/drift-recovery.md, cap 2).

# --- TDD anchor (plan-time acceptance tests; full orc + ultra ALWAYS on) ---
# SCOPED (v0.41.0): each tdd_spec entry carries a `disposition` derived from the
# planner's facets — new-surface | behavior-change get tests; covered-by-existing
# (cites an existing test) and no-behavior (constants, translation strings, docs,
# config) get NONE; no-runner is the whole-run exemption. A task with a cited
# facets.risk[] can NEVER be scoped out. There is no key for this: a switch here
# would just restore the tautological tests it removes.
tdd_loop_max: 3            # max implement→test→repair iterations per task in the
                           #   TDD gate; cap hit → STOP SEQUENCE + honest red report.
                           #   Lane policy (fixed, not configurable): full orc +
                           #   ultra always on · orc-mini ONE intake question ·
                           #   orc-fast off (no planner) · orc-diy `tdd` flow key ·
                           #   standalone /orc-plan ON (a saved plan's only consumers
                           #   are the TDD-always build lanes, so a plan with no
                           #   tdd_spec is unusable by the lane that runs it).

# --- Stacked PRs (Phase 8 gate; full /orc + /orc-ultra only) ---
stacked_pr: ask             # ask | on | off — what happens when the change is too
                            #   big for one PR (threshold below):
                            #   ask → ONE P0 question (stack it, or one regular PR)
                            #   on  → take "yes" without asking
                            #   off → never offer; always one regular PR
                            #   Never fires in orc-mini / orc-fast (the fast lane
                            #   never stops the chat) or orc-diy (compile-owned).
stacked_pr_loc: 1000        # change LoC (additions+deletions, exclusions applied)
                            #   >= this → stack candidate. SAME number is the
                            #   per-layer LoC ceiling: a change that cannot fit in
                            #   one layer's budget is what is worth stacking.
stacked_pr_files: 20        # changed files >= this → stack candidate; also the
                            #   per-layer hard max (soft target = half of it).
stacked_pr_max_layers: 6    # soft layer cap: <= cap proceed · cap+1..cap+2 warn +
                            #   explicit override · beyond → STOP (multiple stacks
                            #   or a phased release). N layers = N full CI runs.

# --- Security pass (opt-in Phase 5.5; OFF by default) ---
security_review: off       # off | ask | on — fires only on runs where a task
                           #   scored ≥ 70 (the existing risk floor):
                           #   off → skip silently (default)
                           #   ask → one prompt after review, user decides
                           #   on  → dispatch the security pass without asking

# --- Opus-5-only dispatch (HARD-GATED, FORCING — default off) ---
opus5_only: false          # true → EVERY dispatched role resolves to a claude-opus-5
                           #   agent, effort as the only cost dial. Outranks BOTH
                           #   rubric_bands_override and the whole fable5_* block.
                           #   Never forced: the Haiku trace writer, orc-diy (compile-
                           #   owned). Needs an Opus 5 main session or every dispatch
                           #   downgrades. See _shared/opus5-only.md.

# --- Fable 5 role override (HARD-GATED — nothing changes unless enabled) ---
#     (entirely INERT while opus5_only: true)
fable5_enabled: false      # master gate. false = inert (this whole block does nothing).
fable5_effort: medium      # medium | high | xhigh | max — effort for the Fable 5 role agents.
                           #   The `orc config set fable5_effort` CLI rewrites the effort:
                           #   line in the installed orc-<role>-fable-5 agents.
fable5_roles: []           # subset of [analyze, plan, advisor, judge, review]. Each listed
                           #   role dispatches its orc-<role>-fable-5 variant instead of the
                           #   default. advisor/judge are ultra-lane only. Empty = no effect.

# --- Artifact locations (internal by default) ---
run_dir: .claude/orc/run                  # run folders (checkpoint, state-of-play,
                                          #   intent-spec). Lives OUTSIDE the payload
                                          #   trees `orc update` replaces, so an
                                          #   update/doctor --fix can never destroy a
                                          #   mid-run checkpoint. Pre-0.34.1 state at
                                          #   .claude/skills/orc/run/ is migrated once.
analyzer_dir: .claude/skills/orc/analyzer
planner_dir:  .claude/skills/orc/planner
report_out_dir: analyst_report            # project-root copy target on report-only

orchestrator_model: claude-opus-4-8       # main session; high effort (never downgraded)

# --- Retro delivery (/orc-retro files its report upstream; PR preferred, issue fallback) ---
retro_repo: azure-id/orc      # GitHub owner/repo that receives retro reports.
                              # /orc-retro REQUIRES a delivery channel (authed gh
                              # CLI or a GitHub MCP) and refuses to run without one.

# --- Behavior trace logging (PERMANENT — always on, not a toggle) ---
# Every ORC run writes a persistent behavior trace; there is no on/off key.
log_dir: .claude/orc/logs     # persistent trace folder — NEVER deleted on completion

# --- Wiki freshness (COVERAGE-RELATIVE, computed on read by `orc wiki status`) ---
wiki_fresh_max: 10            # per-doc commit distance < this → FRESH (silent)
wiki_aging_max: 30            # distance ≤ this → AGING (notice); beyond → STALE
wiki_refresh_ask_tasks: 3     # post-ship refresh ask fires when tasks ≥ this…
wiki_refresh_ask_files: 10    # …or the run's touched files exceed this (full/ultra lanes)

# --- Cross-repo crosslink snapshot freshness (Signal-B; DAY-based, computed on read) ---
crosslink_fresh_days: 10      # days since sync ≤ this → FRESH cross-repo hint
crosslink_aging_days: 15      # ≤ this → AGING; beyond → STALE (advisory only, never blocks)

# --- Wiki delta refresh (`orc wiki impact` — the default refresh path) ---
wiki_delta_full_threshold: 30 # TOUCHED docs above this % of registered docs →
                              #   impact recommends a FULL refresh (user decides;
                              #   never silently full)
```

## Score → model table (executor agent dispatched by name)

The orchestrator scores each task 0–100, then maps to a model via this SINGLE
canonical 8-band table, and dispatches the matching **executor agent**. There is
no longer a narrow/wide preset choice — `rubric_bands` sets scoring granularity
only, never which table is used.

| Score | Model | Effort | Executor agent |
|-------|-------|--------|----------------|
| [0,30)   | claude-haiku-4-5  | —      | orc-executor-haiku-4-5 |
| [30,40)  | claude-sonnet-4-6 | medium | orc-executor-sonnet-4-6-med |
| [40,55)  | claude-sonnet-4-6 | high   | orc-executor-sonnet-4-6-high |
| [55,65)  | claude-sonnet-5   | high   | orc-executor-sonnet-5-high |
| [65,70)  | claude-opus-4-7   | medium | orc-executor-opus-4-7-med |
| [70,80)  | claude-opus-4-7   | high   | orc-executor-opus-4-7-high |
| [80,90)  | claude-opus-4-8   | high   | orc-executor-opus-4-8-high |
| [90,100] | claude-opus-5     | high   | orc-executor-opus-5-high |

(Haiku has no effort ladder — that agent carries no `effort:` field.) The risk
floor (≥70) lands `orc-executor-opus-4-7-high` at minimum in THIS table — under
the Opus-5-only preset below it lands `orc-executor-opus-5-med` instead. The top
band dispatches **Opus 5 high** — it needs an Opus 5 MAIN session or it silently
falls back to the session model (the tier-honesty rule reports the downgrade).

### The Opus-5-only ladder (`opus5_only`, default **false**)

One model, EFFORT as the cost dial. Off by default; nothing changes until set.

| Score | Model | Effort | Executor agent |
|-------|-------|--------|----------------|
| [0,40)   | claude-opus-5 | low    | orc-executor-opus-5-low |
| [40,80)  | claude-opus-5 | medium | orc-executor-opus-5-med |
| [80,100] | claude-opus-5 | high   | orc-executor-opus-5-high |

Rationale (why the key exists): deep SWE-benchmark work on cost vs efficiency
across Claude models finds a single Opus 5 agent with the effort ladder the
most efficient setup — model-class variety traded for effort variety.
**Tier cost:** today ONE band in eight needs an Opus 5 main session; with this
on, EVERY dispatch does, so a lower session downgrades every task (warn-only —
a hook can gate effort, never model). **Scope:** this key is NOT executor-only.
It also forces every fixed role (see below) across every lane. orc-diy's table
stays compile-owned and reads only `orc-diy.config.yaml`, never this file.

### Resolution — highest wins

1. `opus5_only: true` — the 3-band preset above, and every fixed role forced to
   its Opus 5 variant. It FORCES: while on, it outranks BOTH a hand-written
   `rubric_bands_override` and the whole Fable 5 role override.
2. `rubric_bands_override` — hand-written `{min, max, agent}` rows (hand-edit
   only; deliberately not a CLI key). Wins over the default table.
3. the default 8-band table.

`rubric_bands` sets scoring GRANULARITY only, in every case — it never selects a
table. Whichever table resolves, **show it** with the Phase 2 scoring table and
record the mode in the `CONFIG` trace line: an un-shown table is as unaccountable
as an un-shown number.

### Override
To use custom band edges/models, set `rubric_bands_override:` with your own
list of `{min, max, agent}` rows; the orchestrator uses it instead of the table.

## Fixed-role agents (not score-mapped)
| Role | Agent |
|------|-------|
| System Analyst | orc-system-analyst-opus-5-high |
| Requirement Planner | orc-planner-opus-5-med |
| Reviewer | orc-reviewer-opus-5-med |
| Verifier | orc-verifier-opus-5-med |
| Mini analyst | orc-analyze-mini-sonnet-5-high |
| Mini planner | orc-planner-mini-sonnet-5-high |
| Mini executor | orc-executor-sonnet-5-high (reused) |
| Pattern codifier | orc-pattern-codifier-sonnet-5-high |
| Ultra advisor (/orc-ultra only) | orc-advisor-opus-5-xhigh |
| Ultra judge (/orc-ultra only) | orc-judge-opus-5-xhigh |

**Opus-5-only override (forcing):** when `opus5_only: true`, every role above
that is not already `claude-opus-5` dispatches its Opus 5 variant instead —
mini analyst → `orc-analyze-mini-opus-5-med`, mini planner →
`orc-planner-mini-opus-5-med`, mini executor → `orc-executor-opus-5-low`,
pattern codifier → `orc-pattern-codifier-opus-5-med` — plus the roles owned by
other lanes (scout, wiki scanner, CLAUDE.md writer, retro miner, fast
executor). The full mapping, the two exclusions (the Haiku trace writer and
orc-diy) and the tier consequence are in `../_shared/opus5-only.md`. It
outranks the Fable 5 override below.

**Fable 5 role override:** (INERT while `opus5_only: true`) when
`fable5_enabled: true`, each role in
`fable5_roles` dispatches its `orc-<role>-fable-5` variant INSTEAD of the default
above (`analyze`→`orc-analyst-fable-5`, `plan`→`orc-planner-fable-5`,
`advisor`→`orc-advisor-fable-5`, `judge`→`orc-judge-fable-5`,
`review`→`orc-reviewer-fable-5`). Same slice, same contract. See
`../_shared/fable5-override.md`.

## Rules
- Read at run start via the resolution rule above (defaults ← `orc.config.yaml`
  override). Missing values use defaults (max_wave_tasks 3, batch_pause_every 2,
  rubric_bands 5, max_scouts 3, default_analysis_depth standard,
  generate_tests false, pattern_findings ask, security_review off).
  Behavior-trace logging is not listed here — it is PERMANENT (always on).
- `generate_tests` gates the opt-in Phase 6.5 (Test Authoring, default OFF). When
  on, after Verify the orchestrator dispatches `orc-test-author-opus-5-med` to
  WRITE test cases (automated files + `TEST-PLAN.md` + a curl bundle for HTTP
  APIs) — it never runs them; the user tests manually. The manual deliverables
  are pinned to a visible **`test-generator/<change-slug>/`** folder at the
  project root (not `.claude/`, not the run folder) and are committed on ship.
  Full lane runs it as Phase 6.5; orc-mini also offers it (opt-in end-of-run ask
  on a GREEN smoke gate).
- `max_scouts` caps the parallel scouts fanned out in the analyst's DEEP mode
  (never exceeds it, same as max_wave_tasks caps a wave).
- `default_analysis_depth` only presets the analyst's standard/deep gate — the
  run still confirms; deep never auto-escalates without consent.
- `rubric_bands` sets HOW MANY bands the rubric REPORTS (finer or coarser score
  granularity) — it no longer selects a preset. The score→model mapping is the
  single 8-band table above, used regardless of `rubric_bands`.
- max_wave_tasks is a hard cap in wave-grouping.
- `batch_pause_every` is a DETERMINISTIC hard gate, not a cadence hint: after
  wave W, `W % N == 0` with a later wave remaining forces the stop sequence
  (references/stop-and-resume.md). The schedule is computed and confirmed at
  Phase 2 intake and persisted as `pause_schedule` so resumes enforce it too.
- Behavior-trace logging is PERMANENT (always on) — there is no `logging` key.
  Every run, the orchestrator follows `references/trace-protocol.md` and the
  `orc-trace.js` hook writes a persistent `.txt` under `log_dir`. The hook is the
  deterministic guarantee: it bootstraps `log_dir` + the run pointer itself and
  segments the run with `PHASE-EDGE` lines, so a usable trace exists even if the
  orchestrator never narrates. The RICH narration is dispatched per phase to the
  pinned Haiku trace writer — never appended from memory.
- `log_dir` is the persistent trace folder; its top level holds the run `.txt`
  plus its sidecars (`.pending.json`, `.jsonl`). Unlike the decision log
  (`run/…md`, deleted on success) traces are NEVER auto-deleted — post-hoc
  review is the point.
- `retro_repo` is where `/orc-retro` files its calibration report (PR preferred,
  issue fallback, AI-readable markdown). The retro hard-gates on a delivery
  channel — an authed gh CLI or a GitHub MCP server — and does not run at all
  when neither exists. See the `orc-retro` skill.
- `pattern_findings` gates the code-pattern subsystem (default `ask`). On an FE/BE
  cache MISS during Phase 3 dispatch: `ask` → P0 prompt (learn conventions via the
  `orc-pattern` skill, or proceed language-agnostic); `on` → auto-codify, no prompt;
  `off` → always agnostic (invariants enforced, conventions imitate neighbor files),
  never ask. A cache HIT is used silently regardless. The codifier
  (`orc-pattern-codifier-sonnet-5-high`) writes `.claude/orc/patterns/<lang>-pattern.md`,
  reused by future runs. See the `orc-pattern` skill.
- `orc_wiki_pattern_findings` (default `false`, on/off only — no `ask`, because the
  wiki's scan already has consent) makes `orc-wiki` codify ALL detected languages as
  a byproduct of its full scan, pre-warming the pattern cache so later `/orc` runs
  never hit the `pattern_findings` prompt.
- `fable5_enabled` / `fable5_effort` / `fable5_roles` gate the **Fable 5 role
  override** (default OFF — a hard P0 gate). Nothing changes unless
  `fable5_enabled: true`. Then each role in `fable5_roles` (subset of
  `analyze, plan, advisor, judge, review`) dispatches its `orc-<role>-fable-5`
  agent instead of the default; `advisor`/`judge` apply only under `/orc-ultra`.
  `fable5_effort` (medium default) sets those agents' effort — the CLI rewrites
  their frontmatter on set. Enabled with empty `fable5_roles` = no effect (the
  CLI warns). The whole block is INERT while `opus5_only: true`. See
  `../_shared/fable5-override.md`.
- `opus5_only` (default `false`) is a **forcing** dispatch mode: every scored
  executor AND every fixed role resolves to a `claude-opus-5` agent, with effort
  as the only cost dial. While on it outranks `rubric_bands_override` and the
  entire `fable5_*` block. Two things are never forced: the pinned Haiku trace
  writer, and orc-diy (compile-owned). Every dispatch then needs an Opus 5 main
  session — including `/orc-fast`, whose Sonnet-medium session premise holds
  only while this is off. See `../_shared/opus5-only.md`.
- **Ultra lane has no config key** — `/orc-ultra` forces its overrides
  run-scoped (deep analyze, `pattern_findings` on, `generate_tests` on,
  `security_review` on, executor tier floor) and NEVER writes them to
  `orc.config.yaml`. See the orc skill's `references/ultra-mode.md`.
- `wiki_fresh_max` / `wiki_aging_max` set the wiki freshness tier edges. The
  tier is ALWAYS computed on read, and **`orc wiki status` is the only thing
  that computes it** (v0.41.0 — `--json` for a machine-readable `.tier`): never
  hand-run a `git rev-list` against `.claude/orc/wiki-meta.json`. Freshness is
  **coverage-relative** — a doc is stale only when commits since ITS OWN
  `scanned_commit` touched files IT covers, and the wiki's tier is its worst
  doc. (Measuring from the manifest's `scan_commit` — the OLDEST doc's anchor,
  which a delta refresh deliberately leaves frozen — reported the same hash and
  a growing distance forever, so the wiki read STALE no matter how often it was
  refreshed.) A STRUCTURAL blind spot degrades the tier ONE step, never past
  AGING: that is a coverage gap, not doc rot. FRESH → silent, AGING → notice,
  STALE → warn (full/mini lanes) or the orc-fast user gate. See
  `../orc-wiki/references/staleness.md`.
- `wiki_refresh_ask_tasks` / `wiki_refresh_ask_files` set the BIG-run trigger
  for the post-ship wiki refresh ask (full + ultra lanes only; guarded on a
  non-empty wiki). Judged by FINAL counts at ship time.
- `crosslink_fresh_days` / `crosslink_aging_days` set the day edges for the
  cross-repo crosslink snapshot age (Signal B — the only day-based tier in the
  constellation; two repos share no commit axis). The effective cross-repo tier
  is `min(Signal-A provider-wiki-tier, Signal-B snapshot-age)`, computed on read,
  advisory only — a stale crosslink warns, never blocks. See
  `../orc-wiki/references/crosslink.md` + `../orc-wiki/references/staleness.md`.
- `security_review` gates the opt-in Phase 5.5 security pass (default `off`).
  The trigger is the EXISTING risk floor: it can only fire on a run where at
  least one task scored ≥ 70 (security/money/migrations/auth). `ask` → one
  prompt after review; `on` → dispatch without asking; `off` → skip silently.
  The pass reuses the reviewer (`phase=security`) with the checklist from
  `references/security-checklist.md`, sweeping only the run's changed files
  (wraps Semgrep if installed, never installs tooling). Findings use the same
  P0–P3 ladder + hard-rule-5 handling.
