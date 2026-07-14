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
max_wave_tasks: 3          # max parallel tasks per wave (hard cap; overflow → next wave)

# --- Batch pausing ---
batch_pause_every: 2       # default waves between stop-and-continue pauses

# --- Rubric width (the "metrix") ---
rubric_bands: 5            # how many scoring bands. Range 2–8.
                           #   2–5  → "narrow" preset
                           #   6–8  → "wide" preset
                           # Determines the score→model mapping below.

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

# --- Security pass (opt-in Phase 5.5; OFF by default) ---
security_review: off       # off | ask | on — fires only on runs where a task
                           #   scored ≥ 70 (the existing risk floor):
                           #   off → skip silently (default)
                           #   ask → one prompt after review, user decides
                           #   on  → dispatch the security pass without asking

# --- Artifact locations (internal by default) ---
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

# --- Wiki freshness (computed on read from .claude/orc/wiki-meta.json) ---
wiki_fresh_max: 10            # commit distance < this → FRESH (silent)
wiki_aging_max: 30            # distance ≤ this → AGING (notice); beyond → STALE
wiki_refresh_ask_tasks: 3     # post-ship refresh ask fires when tasks ≥ this…
wiki_refresh_ask_files: 10    # …or the run's touched files exceed this (full/ultra lanes)

# --- Cross-repo crosslink snapshot freshness (Signal-B; DAY-based, computed on read) ---
crosslink_fresh_days: 10      # days since sync ≤ this → FRESH cross-repo hint
crosslink_aging_days: 15      # ≤ this → AGING; beyond → STALE (advisory only, never blocks)
```

## Score → model presets (executor agent dispatched by name)

The orchestrator scores each task 0–100, then maps to a model via the preset
selected by `rubric_bands`, and dispatches the matching **executor agent**.

### NARROW preset (rubric_bands 2–5)
| Score | Model | Effort | Executor agent |
|-------|-------|--------|----------------|
| [0,30)   | claude-sonnet-4-6 | medium | orc-executor-sonnet-4-6-med |
| [30,50)  | claude-sonnet-4-6 | high   | orc-executor-sonnet-4-6-high |
| [50,65)  | claude-sonnet-5   | high   | orc-executor-sonnet-5-high |
| [65,85)  | claude-opus-4-7   | medium | orc-executor-opus-4-7-med |
| [85,100] | claude-opus-4-8   | high   | orc-executor-opus-4-8-high |

### WIDE preset (rubric_bands 6–8)
| Score | Model | Effort | Executor agent |
|-------|-------|--------|----------------|
| [0,40)   | claude-sonnet-4-6 | medium | orc-executor-sonnet-4-6-med |
| [40,50)  | claude-sonnet-4-6 | high   | orc-executor-sonnet-4-6-high |
| [50,70)  | claude-sonnet-5   | high   | orc-executor-sonnet-5-high |
| [70,80)  | claude-opus-4-7   | high   | orc-executor-opus-4-7-high |
| [80,100] | claude-opus-4-8   | high   | orc-executor-opus-4-8-high |

### Override
To use custom band edges/models, set `rubric_bands_override:` with your own
list of `{min, max, agent}` rows; the orchestrator uses it instead of a preset.

## Fixed-role agents (not score-mapped)
| Role | Agent |
|------|-------|
| System Analyst | orc-system-analyst-opus-4-8-high |
| Requirement Planner | orc-planner-opus-4-8-med |
| Reviewer | orc-reviewer-opus-4-8-high |
| Verifier | orc-verifier-opus-4-8-high |
| Mini analyst | orc-analyze-mini-sonnet-5-high |
| Mini planner | orc-planner-mini-sonnet-5-high |
| Mini executor | orc-executor-sonnet-5-high (reused) |
| Pattern codifier | orc-pattern-codifier-sonnet-5-high |
| Ultra advisor (/orc-ultra only) | orc-advisor-opus-4-8-max |
| Ultra judge (/orc-ultra only) | orc-judge-opus-4-8-max |

## Rules
- Read at run start via the resolution rule above (defaults ← `orc.config.yaml`
  override). Missing values use defaults (max_wave_tasks 3, batch_pause_every 2,
  rubric_bands 5, max_scouts 3, default_analysis_depth standard,
  generate_tests false, pattern_findings ask, security_review off).
  Behavior-trace logging is not listed here — it is PERMANENT (always on).
- `generate_tests` gates the opt-in Phase 6.5 (Test Authoring, default OFF). When
  on, after Verify the orchestrator dispatches `orc-test-author-opus-4-8-high` to
  WRITE test cases (automated files + `TEST-PLAN.md` + a curl bundle for HTTP
  APIs) — it never runs them; the user tests manually. Full lane runs it as
  Phase 6.5; orc-mini also offers it (opt-in end-of-run ask on a GREEN smoke gate).
- `max_scouts` caps the parallel scouts fanned out in the analyst's DEEP mode
  (never exceeds it, same as max_wave_tasks caps a wave).
- `default_analysis_depth` only presets the analyst's standard/deep gate — the
  run still confirms; deep never auto-escalates without consent.
- `rubric_bands` sets HOW MANY bands the rubric produces; the preset maps the
  resulting score to a model. More bands = finer score granularity, same model
  set — the preset boundaries define the mapping.
- max_wave_tasks is a hard cap in wave-grouping.
- Behavior-trace logging is PERMANENT (always on) — there is no `logging` key.
  Every run, the orchestrator follows `references/trace-protocol.md` and the
  `orc-trace.js` hook writes a persistent `.txt` under `log_dir`. The hook is the
  deterministic guarantee: it bootstraps `log_dir` + the run pointer itself, so a
  trace exists even if the orchestrator never writes a marker.
- `log_dir` is the persistent trace folder; unlike the decision log (`run/…md`,
  deleted on success) traces are NEVER auto-deleted — post-hoc review is the point.
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
- **Ultra lane has no config key** — `/orc-ultra` forces its overrides
  run-scoped (deep analyze, `pattern_findings` on, `generate_tests` on,
  `security_review` on, executor tier floor) and NEVER writes them to
  `orc.config.yaml`. See the orc skill's `references/ultra-mode.md`.
- `wiki_fresh_max` / `wiki_aging_max` set the wiki freshness tier edges. The
  tier is ALWAYS computed on read (`git rev-list --count <scan_commit>..HEAD`
  against `.claude/orc/wiki-meta.json` — written only by orc-wiki): FRESH →
  silent, AGING → notice, STALE → warn (full/mini lanes) or the orc-fast user
  gate. See `../orc-wiki/references/staleness.md`.
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
