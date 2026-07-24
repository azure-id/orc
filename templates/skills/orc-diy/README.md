# ORC-DIY — Build your own ORC flow

> This guide is intentionally separate from the main project README. The root
> README covers installing and using the shipped lanes; **everything about
> composing your own lane lives here.**

ORC-DIY lets you assemble a custom orchestrator pipeline from ORC's real
parts — keep the phases you want, drop the ones you don't, pick the session
tier, and decide how autonomous the run is. The shape is chosen entirely in
your **terminal** (deterministic, zero model tokens); Claude only ever runs
the flow you compiled.

```
orc diy init          →  orc diy set … (repeat)  →  orc diy compile  →  /orc-diy <request>
   (config created)       (shape your flow)          (build the flow)     (run it)
```

## 1. Bootstrap

**Easiest path — the interactive composer.** Run bare `orc diy` in a real
terminal: it creates the flow if none exists (pick full-lane defaults or a
preset from a numbered list), then lets you shape every key with numbered
pick-lists, shows the live gate status and validation issues as you go, and
offers to compile on exit. Everything below is the same thing, non-interactive:

```bash
orc diy                         # interactive composer (create + shape + compile)
orc diy init                    # scriptable: create the default config (full-lane shape)
orc diy init --preset lean      # or start from a preset: lean | paranoid | solo-fast
```

This writes three project-scoped files (there is no global variant — `orc
diy` rejects `--global`; one flow per project):

| File | What it is | Who writes it |
|---|---|---|
| `.claude/orc-diy.config.yaml` | your flow choices | the CLI only |
| `.claude/orc/diy/flow.md` | human-readable flow spec (regenerated on every change) | the CLI only |
| `.claude/orc/diy/flow.lock.json` | hashes + compile stamp — the gate's state | the CLI only |

## 2. Shape the flow

```bash
orc diy show                    # current flow + gate status (READY / STALE / UNCONFIGURED)
orc diy set review blocking-only
orc diy set verify smoke
orc diy set scoring off
orc diy set fixed_executor orc-executor-sonnet-5-high
orc diy set session_tier opus-4-7-med
orc diy set autonomy semi
orc diy validate                # re-check cross-key rules any time
```

The full key table lives in `references/flow-schema.md`. Highlights:

- **Phases** — `analyze`, `review`, `security`, `verify`, `testgen`,
  `summary`, `wiki_gate`: each phase has off/on/strictness values. Order is
  fixed; you choose presence and strictness.
- **Scoring** — `scoring on` keeps the per-task rubric; `scoring off` skips
  it and sends every task to your `fixed_executor`.
- **Session tier** — `session_tier` is the model+effort the compiled flow
  requires. DIY is SEPARATE from the baseline /orc rule — pick any tier from the
  full grid: `sonnet-4-6-{med,high}`, `opus-4-7-{med,high}`,
  `opus-4-8-{med,high,xhigh,max}`, `opus-5-{med,high,xhigh,max}`,
  `fable-5-{med,high,xhigh,max}` (default
  `opus-4-8-high`). The effort guard enforces the effort half deterministically
  (the compiled effort OR higher on the ladder); the statusline warns on the
  model half. Executor choices above the tier are rejected at validate time; the
  score table is clipped to the tier at compile time.
- **Autonomy** — `interactive` (all asks), `semi` (routine asks
  auto-accepted), `hands-off` (only hard stops + ship). Locked safety rules
  are never overridden — see `references/locked-blocks.md` for what you can
  NEVER configure away.
- **Ship** — `ship_mode`: `ask`, `commit`, `pr`, or `report-only`.

## 3. Compile

```bash
orc diy compile                 # deterministic stitch — no model, no tokens
```

The compiler validates, cherry-picks the needed references from your
installed orc skill, stitches `.claude/orc/diy/FLOW-COMPILED.md`, and stamps
`flow.lock.json`. Details: `references/compile.md`.

**Every change requires a recompile.** The gate flips to STALE whenever:
- you change any key (`orc diy set` …),
- you update orc (`orc update` / `orc upgrade`),
- the compiled file is edited or deleted.

`/orc-diy` will not run a stale flow — it names the reason, tells you to run
`orc diy compile`, and offers the regular `/orc` lane for the request at
hand. `/orc-diy compile` in a session just runs the same CLI compiler.

## 4. Run

```
/orc-diy implement the CSV export endpoint
```

The stub skill checks the gate, then follows your compiled flow: same run
folders, checkpoints, subagents, and evidence rules as the full lane — minus
the phases you removed, plus the strictness you chose.

## Presets

| Preset | Shape |
|---|---|
| `lean` | analyze off, review blocking-only, verify smoke, summary short |
| `paranoid` | analyze full, security always, testgen on, verify full |
| `solo-fast` | scoring off → one Sonnet 5 high executor, review off, verify smoke, autonomy semi |

Presets are just config bundles — inspect with `orc diy show`, tweak with
`set`, and compile like any other flow.

## Command reference

```
orc diy                                    INTERACTIVE composer (create/shape/compile in one menu)
orc diy init [--preset <name>] [--force]   create (or overwrite) the config
orc diy show                               flow table + gate status
orc diy status [--json]                    gate status only (used by the skill/hooks)
orc diy set <key> <value>                  change one key (invalidates the compile)
orc diy validate                           run cross-key validation
orc diy compile                            build FLOW-COMPILED.md + stamp the lock
orc diy reset                              delete config, flow, lock, and compiled file
```

## Boundaries (read before getting creative)

- The CLI is the only writer. Never hand-edit the config, the lock, or the
  compiled flow — and never ask Claude to; the skill refuses by contract.
- `references/locked-blocks.md` is compiled into every flow verbatim: the
  orchestrator never implements, checkpoint discipline, wave conflict rules,
  the severity ladder, and red-build ship blocking are not yours to remove.
- orc-diy needs the orc skill installed next to it (it cherry-picks by
  reference); `orc init` installs both.
