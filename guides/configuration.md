# Configuration

Every setting is edited with the **`orc config` CLI**. That is deterministic
terminal input and output, so editing settings costs **zero model tokens** —
nothing is loaded into a Claude session.

```bash
orc config                    # interactive menu — each value, its default, and what it does
orc config list               # print the effective config  (--json for a machine)
orc config set max_scouts 5   # validate, then write one setting
orc config reset max_scouts   # revert one key (omit the key to reset everything)
orc config path               # where the override file lives
orc config recommend          # read this repo and suggest ONE profile, with its reasons
orc config profile <name>     # apply a coherent bundle: solo-fast | balanced | paranoid | token-lean
```

Your changes go into `.claude/orc.config.yaml`, which `orc update` and
`orc upgrade` never touch. `skills/orc/config.md` holds the shipped defaults.
Add `--global` to edit `~/.claude`.

**Config does not merge.** `~/.claude/orc.config.yaml` and
`<project>/.claude/orc.config.yaml` are separate files; the one that applies is
the one belonging to the install that answered. `orc doctor` reports that
conflict when both exist.

`orc ui` ▸ Settings edits the same keys with the same validators — it shells
this CLI for every write.

---

## Common keys

| Key | Default | What it does |
|---|---|---|
| `max_wave_tasks` | `3` | Parallel tasks per wave (a hard cap). |
| `batch_pause_every` | `2` | Waves between stop-and-continue pauses. It is a **gate**, not a hint. |
| `rubric_bands` | `5` | How finely the scoring report is grouped (2–8). The score→model table does not change. |
| `max_scouts` | `3` | Parallel read-only scouts in deep analysis. |
| `default_analysis_depth` | `standard` | `standard` or `deep`. The run still confirms. |
| `generate_tests` | `false` | Phase 6.5 writes test cases (files + `TEST-PLAN.md` + a curl bundle) into `test-generator/<slug>/`. It never runs them. |
| `pattern_findings` | `ask` | On a code-pattern cache miss: `ask` prompts, `on` learns automatically, `off` stays language-agnostic. |
| `gotchas` | `on` | Repair memory: record what went red→green, and inject the matching ones into later slices. |
| `gotchas_max` | `40` | Live gotchas kept before the least useful are archived (never deleted). |
| `security_review` | `off` | Opt-in Phase 5.5 security pass. Fires only when a task scored ≥ 70. |
| `run_budget_dispatches` | `0` | Stop before wave 1 if the run is forecast to exceed this many subagents. `0` = off. |
| `mock_example` | `ask` | After a green verify, offer a runnable mocked example in `mock-examples/<slug>/` (never committed). |
| `tdd_loop_max` | `3` | Implement→test→repair rounds per task before an honest red report. |
| `stacked_pr` | `ask` | Ship as a stack of PRs when the change trips the thresholds below. |
| `stacked_pr_loc` | `1000` | LoC that trips the gate, and the per-layer ceiling. |
| `stacked_pr_files` | `20` | Changed files that trip the gate, and the per-layer maximum. |
| `stacked_pr_max_layers` | `6` | Soft cap on layers per stack. |
| `opus5_only` | `false` | One model for every role, with effort as the cost dial. See [model selection](model-selection.md). |
| `pact_gate` | `warn` | Inject a drifted promise into the planner as a constraint. There is no `block`. |
| `pact_recheck_on_verify` | `true` | At verify, re-check only the promises this change touched. |
| `boundary_gate` | `warn` | `block` lifts a REFUSED task out of its wave — **the wave still runs the rest**. |
| `handoff_write` | `true` | Whether `/orc-handoff` may write a graded surface at all. |
| `budget_min_samples` | `5` | Dispatches a band needs before a forecast is called confident. |
| `budget_units` | `auto` | Which unit a forecast leads with: tokens, usd, quota, or all. |
| `budget_plan` | `auto` | Your Claude plan, for the quota view. Asked once, then stored. |
| `challenge_pass_severity` | `p1` | The severity at or above which an open `/orc-challenge` finding blocks a pass. Accepted exceptions are subtracted first, and the pass itself is computed by the CLI — never declared by the judge. |
| `challenge_stall_after` | `3` | Iterations with no net reduction before a cycle is flagged `stalled`. A flag, never a cap: each turn is a person sitting down to work. |
| `challenge_reader` | `on` | The cold read that measures whether a reader with no context can follow the artifact. `off` makes that dimension report `NOT-CHECKED` with that reason — never silently. |
| `challenge_gate` | `warn` | One `/orc` preflight line when the document it is about to build from has an in-flight, failing review cycle. There is no `block`. |

## Fable 5 role override

| Key | Default | What it does |
|---|---|---|
| `fable5_enabled` | `false` | Master switch. Nothing changes unless this is true. |
| `fable5_effort` | `medium` | Effort for the Fable 5 agents. |
| `fable5_roles` | *(empty)* | Which roles use it: `analyze`, `plan`, `advisor`, `judge`, `review`. |

`opus5_only: true` outranks this whole block, and says so when you set it.

## Advanced keys

| Key | Default | What it does |
|---|---|---|
| `wiki_fresh_max` / `wiki_aging_max` | `10` / `30` | Wiki freshness edges, in commits. Computed on read, never stored. |
| `wiki_scan_tier` | `ladder` | `ladder` sends a small no-new-surface delta to a lighter scanner (~40% cheaper). The resolved tier is always printed. |
| `wiki_tier_deep_files` | `3` | Covered files touched at or above this send the refresh to the deep scanner. |
| `wiki_refresh_budget` | `0` | Max scan-tasks per refresh. A planned stop, not an interrupt. `0` = no cap. |
| `wiki_retire_after_runs` | `0` | Offer to retire a doc no run has used in this many runs. Retiring moves it, never deletes it. |
| `wiki_delta_full_threshold` | `30` | Percent of touched docs above which a FULL refresh is recommended. |
| `wiki_refresh_ask_tasks` / `wiki_refresh_ask_files` | `3` / `10` | When the post-ship "refresh the wiki?" question fires. |
| `orc_wiki_pattern_findings` | `false` | Also learn code patterns during a wiki scan. |
| `crosslink_fresh_days` / `crosslink_aging_days` | `10` / `15` | Cross-repo snapshot age edges. Advisory; they never block. |
| `aftermath_window_days` | `30` | How far back `/orc-aftermath` grades. |
| `budget_price_table` | *(shipped)* | Your own dated price table. Older than 90 days prints a warning. |
| `retro_repo` | `azure-id/orc` | Where `/orc-retro` files its report. |
| `log_dir` | `.claude/orc/logs` | Behavior traces. Never auto-deleted. |
| `run_dir` | `.claude/orc/run` | Run state — deliberately outside the installer's reach. |
| `analyzer_dir` / `planner_dir` / `report_out_dir` | — | Where artifacts are written. |
| `orchestrator_model` | `claude-opus-4-8` | The main-session model ORC assumes. |

**Behavior-trace logging is permanent.** Every run writes a `.txt` trace under
`log_dir`: phases, every spawn, the model that actually answered, scores and
outcomes. There is no on/off key — only `log_dir` moves it.

---

## Two separate config families

These are **not** part of `orc config`:

| Family | File | Guide |
|---|---|---|
| `orc diy …` | `.claude/orc-diy.config.yaml` | [ORC-DIY README](../templates/skills/orc-diy/README.md) |
| `orc crosslink …` | `.claude/orc-crosslink.config.yaml` | [ORC-WIKI README](../templates/skills/orc-wiki/README.md) |

## Profiles

```bash
$ orc config profile
  solo-fast    One person moving fast, reads their own diffs. Fewer gates, bigger waves.
  balanced     Today's defaults. Change nothing unless you know why.
  paranoid     Shared codebase, real users. Every gate on, small waves, pause often.
  token-lean   Big repo, tight budget. Narrow scans, shallow analysis.
```

`orc config recommend` reads your repo (tests? CI? contributors? a wiki?
monorepo?) and suggests one, listing the reasons it decided from. It writes
nothing.
