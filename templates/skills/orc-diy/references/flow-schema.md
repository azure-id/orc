# ORC-DIY — Flow config schema

The single source of intent is `.claude/orc-diy.config.yaml`, written ONLY by
the `orc diy` CLI (never by hand, never in a Claude session). Every write
regenerates `.claude/orc/diy/flow.md` (the human-readable spec) and updates
`.claude/orc/diy/flow.lock.json`, invalidating any previous compile.

**Project-scoped only.** The config, lock, and compiled flow live in the
project's `.claude/` — there is no global variant; `orc diy` rejects
`--global`. One flow per project; `flow_name` is a display label, never a
selector.

## Keys (all set via `orc diy set <key> <value>`)

| Key | Values (default first) | Meaning |
|---|---|---|
| `analyze` | `auto` / `off` / `mini` / `full` | Doc-intake analyst routing |
| `planning` | `auto` / `own-planner` / `superpowers` / `openspec` | Planning route |
| `pattern` | `ask` / `off` / `on` | Code-pattern gate on a cache miss |
| `scoring` | `on` / `off` | Rubric scoring; `off` needs `fixed_executor` |
| `fixed_executor` | (none) — an executor agent name | Used for every task when `scoring: off` |
| `review` | `on` / `off` / `blocking-only` | Review phase strictness |
| `security` | `off` / `ask` / `on` / `always` | Security pass; `always` drops the risk-floor trigger |
| `verify` | `full` / `off` / `smoke` | Verify depth |
| `testgen` | `off` / `ask` / `on` | Test-authoring phase |
| `wiki_gate` | `notice` / `off` / `hard` | Wiki freshness handling at preflight |
| `post_ship_wiki_ask` | `on` / `off` | Post-ship wiki refresh offer on big runs |
| `summary` | `full` / `off` / `short` | Summary depth |
| `autonomy` | `interactive` / `semi` / `hands-off` | Who answers routine asks |
| `ship_mode` | `ask` / `commit` / `pr` / `report-only` | Terminal ship behavior |
| `session_tier` | `sonnet-4-6-{med,high}` / `opus-4-7-{med,high}` / `opus-4-8-{med,high,xhigh,max}` / `fable-5-{med,high,xhigh,max}` | Required main-session model+effort (default `opus-4-8-high`) |
| `max_wave_tasks` | `3` (integer ≥ 1) | Wave hard cap |
| `batch_pause_every` | `2` (integer ≥ 1) | Waves between pauses |
| `rubric_bands` | `5` (2–8) | Scoring granularity (`scoring: on` only) |
| `flow_name` | `my-flow` (slug) | Display label for traces/statusline |

## Cross-key validation (CLI `orc diy validate`; also runs on every write)

Hard errors (config not written):
- `scoring: off` without a `fixed_executor`.
- `fixed_executor` or any agent choice above `session_tier` (tier order:
  haiku-4-5 < sonnet-4-6 < sonnet-5 < opus-4-7 < opus-4-8 < fable-5 — subagents
  cannot exceed the main session; effort medium < high < xhigh < max).
- `review: off` with `security` not `off` (the security pass reuses the
  reviewer).
- Anything that would disable a locked rule (see `locked-blocks.md`).

Warnings (written, reported):
- `scoring: off` with `rubric_bands` overridden (ignored).
- `testgen` on/ask with `verify: off` (testgen normally follows verify).
- `autonomy: hands-off` with `ship_mode: commit` or `pr` (fully unattended
  git actions).
- `session_tier` below `opus-4-8-high` with `review`/`verify` on: the pinned
  Opus reviewer/verifier agents will silently run at the session's model —
  the flow still works, honesty-checked by the tier-honesty locked rule.

## `flow.lock.json` (machine state — written by the CLI only)

```json
{
  "flow_name": "my-flow",
  "session_tier": "opus-4-8-high",
  "config_hash": "sha256 of orc-diy.config.yaml",
  "flow_hash": "sha256 of flow.md",
  "compiled_hash": "sha256 of FLOW-COMPILED.md (null until compiled)",
  "compiled_at": "ISO timestamp or null",
  "orc_version": "installed orc payload version at compile time, or null"
}
```

Gate status (computed by `orc diy status`, consumed by the stub skill, the
effort guard, and the statusline):
- **UNCONFIGURED** — no config file (or empty).
- **STALE** — no lock / never compiled / `config_hash` mismatch (config
  changed since compile) / `orc_version` mismatch (orc was updated) /
  compiled file missing or `compiled_hash` mismatch (artifact modified).
- **READY** — everything matches; `/orc-diy` may run the compiled flow.
