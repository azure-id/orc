# ORC-DIY — Compile procedure

Compilation turns the CLI-written config into a runnable flow. It is
**deterministic and CLI-owned**: `orc diy compile` does pure file stitching
with zero model tokens. `/orc-diy compile` in a session is a thin wrapper —
it runs the same CLI command via Bash and reports the result; there is no
second implementation, and the skill never stitches the flow itself.

## What the compiler does (implemented in `bin/cli.js`)

1. **Validate.** Load `.claude/orc-diy.config.yaml`; run the full cross-key
   validation from `flow-schema.md`. Any hard error aborts the compile.
2. **Resolve sources.** Block templates come from the installed stub
   (`.claude/skills/orc-diy/references/blocks/`). Cherry-picked orc material
   is REFERENCED in place, never copied: the compiler verifies that every
   orc file a chosen variant points at actually exists under
   `.claude/skills/` (project first, `~/.claude/skills/` fallback for a
   global orc install) and aborts naming the missing file if orc is absent
   or incomplete.
3. **Stitch.** Concatenate in fixed order: `header` → `locked-blocks.md`
   (verbatim) → `wiki` → `analyze` → `planning` → `pattern` → `scoring` →
   `execution` → `review` → `security` → `verify` → `testgen` → `ship` →
   `summary`. Inside each block, keep text outside markers, and keep a
   `<!-- diy:when key=value -->…<!-- /diy:when -->` section only when the
   config's `key` equals one of the listed values (`|`-separated).
4. **Substitute placeholders.** `{{flow_name}}`, `{{config_hash}}`,
   `{{orc_version}}`, `{{compiled_at}}`, `{{tier_model}}`, `{{tier_effort}}`,
   `{{max_wave_tasks}}`, `{{batch_pause_every}}`, `{{fixed_executor}}`,
   `{{score_table}}`. The score table is the shipped preset for the config's
   `rubric_bands`, CLIPPED to `session_tier` at compile time (bands above the
   tier collapse into the highest allowed executor) — the compiled flow never
   clips at runtime.
5. **Write + lock.** Emit `.claude/orc/diy/FLOW-COMPILED.md`, then finalize
   `flow.lock.json`: `compiled_hash` (sha256 of the emitted file),
   `compiled_at`, `orc_version` (from the installed payload stamp
   `hooks/orc-version.json`, package version fallback), `session_tier`.
   Print the gate status (should now be READY).

## Recompile triggers

Any of these flips `orc diy status` to STALE until the user recompiles:
- the config changed (`config_hash` mismatch — every `orc diy set` does this),
- orc was updated (`orc_version` mismatch — `orc update`/`orc upgrade`),
- `FLOW-COMPILED.md` was edited or deleted (`compiled_hash` mismatch).

The stub skill NEVER runs a stale flow — it surfaces the reason and the fix
(`orc diy compile`), then offers the plain `/orc` fallback.
