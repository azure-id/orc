---
name: orc-config
description: >
  Reachable configuration for ORC. Use for "/orc-config", "change orc settings",
  "set max wave tasks", "configure orc". Views and edits every ORC config knob
  through a guided menu (with a power-user `<key> <value>` shortcut and a `reset`),
  writing ONLY changed values to an update-safe override file
  (.claude/orc.config.yaml) that `orc update` never clobbers. config.md stays the
  shipped defaults. Tiers settings into common vs advanced, validates every value,
  and warns before risky changes. Runs in the main session — dispatches nothing.
---

# ORC-CONFIG

Makes ORC's configuration reachable for users who won't hand-edit `config.md`.
**This runs in the main session and dispatches no subagent** — it is light,
interactive read/validate/write of a small YAML file.

## The override model (read this first)

- `.claude/skills/orc/config.md` = the **shipped defaults**. NEVER edit it here;
  `orc update` re-copies it.
- `.claude/orc.config.yaml` = the **user override**. Holds ONLY the keys the user
  changed. Lives at the `.claude/` root (outside `templates/`), so `orc update`
  never touches it. This skill only ever writes THIS file.
- **Effective value = default, then override on top.** (See config.md's
  "Config resolution" rule — every run resolves config this way.)

## Forms

### `/orc-config` (no args) — guided
1. Read the defaults (config.md) and the override (orc.config.yaml if present).
2. Show the **effective config table**: `key · value · source (default |
   overridden) · one-line description`, COMMON keys first, then an advanced
   section.
3. Offer the menu: "Which setting do you want to change?" On a pick, explain what
   it does in plain language, state the **recommended value** and range/options,
   ask for the new value, VALIDATE it, then write it to the override file.
4. Confirm what changed and the new effective value. Loop or finish.

### `/orc-config <key> <value>` — direct (power user)
Validate `<value>` for `<key>`, write it to the override, confirm. Reject unknown
keys and invalid values with the allowed range/options.

### `/orc-config reset [key]` — revert
Remove `<key>` from the override (reverts to default). No key → clear the whole
override (revert everything). Confirm before a full reset.

## Settings

### Common (offer first, plain-language)
| Key | Default | Valid | What it does |
|-----|---------|-------|--------------|
| `max_wave_tasks` | 3 | integer ≥1 | Max parallel tasks per execution wave. |
| `batch_pause_every` | 2 | integer ≥1 | Waves between stop-and-continue pauses. |
| `rubric_bands` | 5 | 2–8 | Scoring granularity (2–5 narrow preset, 6–8 wide). |
| `max_scouts` | 3 | integer ≥1 | Max parallel code scouts in deep-analysis mode. |
| `default_analysis_depth` | standard | standard \| deep | Default the analyst's depth gate opens on (run still confirms). |

### Advanced (behind a warning — "these can break dispatch if set wrong")
| Key | Default | Valid | What it does |
|-----|---------|-------|--------------|
| `rubric_bands_override` | (unset) | list of {min,max,agent} | Custom score→agent bands, replaces the preset. |
| `analyzer_dir` | .claude/skills/orc/analyzer | path | Internal analyst artifact dir. |
| `planner_dir` | .claude/skills/orc/planner | path | Internal planner artifact dir. |
| `report_out_dir` | analyst_report | path | Project-root copy target on report-only. |
| `orchestrator_model` | claude-opus-4-8 | model id | Main-session model. **⚠ Setting below Opus breaks the model-tier ladder — every opus-* agent silently falls back to Sonnet.** Warn hard and require confirmation. |

## Validation rules
- Integers: parse and enforce the minimum (`max_wave_tasks`, `batch_pause_every`,
  `max_scouts` ≥1). `rubric_bands` in 2–8.
- Enums: `default_analysis_depth` ∈ {standard, deep}.
- `orchestrator_model`: must be a known ORC model id (claude-opus-4-8 /
  claude-opus-4-7 / claude-sonnet-5 / claude-sonnet-4-6); warn if below Opus.
- `rubric_bands_override`: each row needs numeric min<max and an existing executor
  agent name.
- Reject unknown keys; never write an unvalidated value.

## Override file format
```yaml
# .claude/orc.config.yaml — ORC user overrides (written by /orc-config).
# Only changed keys appear here. Effective value = config.md default, then this.
# orc update never touches this file.
max_wave_tasks: 4
default_analysis_depth: deep
```

## Rules
- Only ever write `.claude/orc.config.yaml`. Never edit `config.md`.
- Write only keys the user actually changed (keep the override minimal).
- Always show the resulting effective value after a change.
- Never dispatch a subagent — this is main-session I/O.
