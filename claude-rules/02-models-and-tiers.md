# Models, effort tiers and the score->model tables

**Read: on demand** — read when touching agent files, the score->model bands, `opus5_only`, the effort guard, or `MODEL-MAPPING.md`.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **Tier guard:** `orc init` merges a `PreToolUse` effort hard-block + a
  statusline model warning into `.claude/settings.json` (see `knowledge.md` §4a).
  The merge is non-destructive — keep it that way (never clobber a user's
  `statusLine`, never duplicate the hook). Model tier can only be warned, not
  blocked (Claude Code doesn't expose the model id to blocking hooks).
  **Opus 5 (v0.34.0)** clears `/orc` from `medium` up, exactly like Fable 5 —
  one shared `isMediumOkModel` regex in the guard, fed by the statusline's
  session-model bridge (fail-open). **The score→model table is SIX bands and
  ends `opus-5-low [65,90) · opus-5-med [90,100]` (v1.0.0 W4)**; the
  `opus5_only` ladder is TWO, `[0,90)` low · `[90,100]` med, sharing that same
  round 90 edge. **"Five places" was WRONG and is corrected here** — a grep finds
  **fifteen** files carrying a band or a retired executor name, and the wave that
  changes the table changes all of them in ONE commit:
  `skills/orc/config.md` · `agents/MODEL-MAPPING.md` ·
  `skills/orc/references/effort-and-mode.md` · `build-agents.js` VARIANTS ·
  `DIY_SCORE_TABLE`, `OPUS5_SCORE_TABLE` and `DIY_EXECUTORS` (the tier-clip
  roster — a table row naming an agent it does not know is a CRASH) in `cli.js` ·
  `verify-contracts.js` · the four `webui/fixtures/{extra,flow,settings,stats}.js`
  · `skills/orc/references/{trace-protocol,ultra-mode,preflight-report}.md` ·
  `skills/_shared/opus5-only.md` · `skills/orc-retro/examples/retro-mock.md`.
  **`OPUS5_BANDS` is now an ALIAS of `OPUS5_SCORE_TABLE`, never a second array** —
  the two had already drifted in name once, and a golden asserts the alias by
  source text, not by deep equality. Three golden tests cover the rest: the exact
  rows, the frozen set of executors NO band names, and every live band edge
  appearing in both payload copies while every retired edge appears in neither.
  **Four executors are named by no band and still ship (D14)** —
  `opus-4-7-med`, `opus-4-7-high`, `opus-4-8-high`, `opus-5-high` — reachable via
  `rubric_bands_override`, `orc diy` `fixed_executor` and `extra_fallback_agent`;
  a table change is not a model change, and an agent's model change is always a
  RENAME. **Two bands in six now need an Opus 5 main session** where one in eight
  did. Tables RESOLVE highest-wins: `opus5_only` > `rubric_bands_override`
  (hand-written, registry-less by design — not a phantom key) > the default
  6-band. See `knowledge.md` §4v.

- **`opus5_only` is a FORCING mode across EVERY dispatched role (v0.36.0),** not
  just executors — renamed from `opus5_executor_only`, which is kept as a
  deprecated read+set alias (`LEGACY_KEYS` in `cli.js`) for one release so a
  renamed key is not a silent revert. Default false. Executors use the 2-band
  ladder (`[0,90)` low · `[90,100]` medium); NINE fixed roles
  flip to a shipped Opus 5 variant (mini/fast executor, mini analyst, mini
  planner, scout, pattern codifier, wiki scanner, CLAUDE.md writer, retro
  miner). **Both halves of every pair ship — an agent's model change is always a
  RENAME**, so the toggle needs both files (agent count 40, floor raised in
  `verify-package.js`). While ON it outranks `rubric_bands_override` AND the
  whole `fable5_*` block — and because a shadowed setting must never be silent,
  `orc config set` names every key it makes inert and `config list` marks them.
  NEVER forced: `orc-trace-writer-haiku-4-5` (it transcribes a packet) and
  orc-diy (compile-owned via `flow.lock.json`). Cost lands hardest on scouts
  (parallel, `max_scouts`) and the wiki scanner (per scan-task). It ends
  orc-fast's "runs fine at Sonnet medium" premise while on — the effort guard is
  UNCHANGED (still matches only `orc`). Canonical prose:
  `templates/skills/_shared/opus5-only.md`; the role table is mirrored in
  `OPUS5_ONLY_ROLES` (`cli.js`) with a golden test comparing the two. See
  `knowledge.md` §4v.1. **Every core fixed role is also pinned to `claude-opus-5` and
  RENAMED accordingly** (analyst `-opus-5-high`, planner/reviewer/verifier/
  test-author `-opus-5-med`, combiner `-opus-5-high`, learn writer
  `-opus-5-low`, ultra advisor/judge `-opus-5-xhigh`; mini/scout/codifier/retro/
  trace-writer/claude-writer unchanged). **An agent's model change is ALWAYS a
  rename** — traces derive `expect=<model>/<effort>` from the agent NAME, so a
  file whose name disagrees with its frontmatter breaks the downgrade check.
  See `knowledge.md` §4u.

