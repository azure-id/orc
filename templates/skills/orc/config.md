# ORC — Config

Central knobs the orchestrator reads at run start. Override any value for a
single run without editing the file.

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

# --- Artifact locations (internal by default) ---
analyzer_dir: .claude/skills/orc/analyzer
planner_dir:  .claude/skills/orc/planner
report_out_dir: analyst_report            # project-root copy target on report-only

orchestrator_model: claude-opus-4-8       # main session; high effort (never downgraded)
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
| Mini analyst | orc-mini-analyst-sonnet-5-high |
| Mini planner | orc-mini-planner-sonnet-5-high |
| Mini executor | orc-executor-sonnet-5-high (reused) |

## Rules
- Read at run start; missing values use defaults (max_wave_tasks 3,
  batch_pause_every 2, rubric_bands 5).
- `rubric_bands` sets HOW MANY bands the rubric produces; the preset maps the
  resulting score to a model. More bands = finer score granularity, same model
  set — the preset boundaries define the mapping.
- max_wave_tasks is a hard cap in wave-grouping.
