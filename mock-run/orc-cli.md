# Mock run — the `orc` terminal commands

> Everything here costs **zero model tokens**. It is plain Node reading files.

The CLI is not a side door to the skills. It owns the parts that must be
deterministic: installing, settings, probes with exit codes, and reading back
run state.

---

## 1. Install and health

```bash
$ orc init
```

```
Installed into /home/rina/shopcart/.claude
  skills    30
  commands  27
  agents    40  (+ MODEL-MAPPING.md)
  hooks     3   effort guard · statusline · behavior trace
  manifest  .claude/orc/install-manifest.json

Merged into .claude/settings.json (nothing of yours was replaced):
  · PreToolUse effort guard
  · statusline  (you had none — if you had, I would print the snippet instead)

Next: orc onboarding first-run
```

```bash
$ orc doctor
```

```
orc doctor — /home/rina/shopcart/.claude

  version      0.46.0 project · 0.44.0 GLOBAL ~/.claude
               ⚠ the global install is older and can win skill resolution
               fix: orc update --global
  payload      ✓ every shipped file present
  orphans      3 files ORC owns are no longer in the payload
               fix: orc update --prune   (it will name all three first)
  settings     ✓ guard wired · ✓ statusline wired
  trace        ✓ pointer valid
  diy          STALE — compiled before the last update

3 findings                                                        (exit 1)
```

---

## 2. Settings, without spending tokens

```bash
$ orc config recommend
```

```
Reading this repo (read-only)…
  a real `npm test` script exists          → gates have something to check
  CI is configured                         → this repo is shared
  7 contributors in history                → coordination cost is real
  a project wiki exists                    → grounding is already cheap

Recommended profile: paranoid
Apply with: orc config profile paranoid
```

```bash
$ orc config set max_wave_tasks 4
max_wave_tasks: 3 → 4      written to .claude/orc.config.yaml

$ orc config set opus5_only true
opus5_only: false → true
  ⚠ this makes 4 keys inert while it is on:
      fable5_enabled, fable5_effort, fable5_roles, rubric_bands_override
    They are shown as shadowed in `orc config list`.
```

---

## 3. Probes — the exit code is the answer

These are what the knowledge-gated lanes run before they start. They print one
line and set an exit code, so nothing has to guess.

```bash
$ orc pattern status express   ;  echo "exit $?"
express   cached   2026-08-12
exit 0

$ orc wiki status
wiki   AGING   17 docs · worst doc 24 commits behind · edges 10 / 30

$ orc wiki impact              ;  echo "exit $?"
4 of 17 docs TOUCHED, 0 STRUCTURAL → a delta refresh is enough
exit 2

$ orc diy status               ;  echo "exit $?"
UNCONFIGURED — no .claude/orc-diy.config.yaml
exit 1
```

---

## 4. Reading run state back

```bash
$ orc run list
```

```
  slug                     lane      state        when
  refund-visibility        orc       waiting      2 hours ago
  order-notes              orc       finished     yesterday
  badge-fix                quick     finished     yesterday
  csv-export               diy       incomplete   4 days ago

`waiting` = RESUME.md exists. `incomplete` = no finish and no resume file —
that is all the disk proves, so that is all this says.
```

```bash
$ orc resume
```

```
1 run is waiting:
  1  refund-visibility   /orc · phase 3 · wave 2 of 3

Pick one:  > 1

Paste this into a fresh Claude Code session (already copied to your clipboard):

  | Continue ORC run `refund-visibility`.
  | Read .claude/orc/run/refund-visibility/state-of-play.md, then checkpoint.json.
  | Resume from the checkpoint phase/wave. Do not re-plan. Do not redo done tasks.
```

```bash
$ orc stats --since 2026-07-01
```

```
Lanes          runs        Agents                          dispatches
  orc            12          orc-executor-sonnet-4-6-med       41
  quick          31          orc-executor-sonnet-5-high        22
  mini            9          orc-planner-opus-5-med            21
  wiki            3          orc-reviewer-opus-5-med           12
  fast            2          orc-wiki-scanner-opus-4-8-high     9

Downgrades caught: 2   (a subagent answered on a lower model than its name)
Counted from trace filenames. No model ran to produce this.
```

---

## 5. Mocked runs, from the terminal

```bash
$ orc mock-run list
```

```
mocked runs — 24 documents that ship with ORC

Start here
  the-example-project        the shopcart project every mock uses
  a-normal-day               all six new lanes inside one ordinary run
Build a change
  orc                        the full pipeline, start to ship
  orc-ultra                  advisor + three judges
  …

Read one:  orc mock-run show orc-pact
Or open the panel:  orc ui   ▸ Mocked Skill Use
```

---

## 6. What to notice

- **`update` and `upgrade` are different.** `update` re-copies what is already
  in this package (offline). `upgrade` fetches the newest package first, then
  copies. Your `.claude/orc.config.yaml` survives both.
- **Every read command speaks `--json`** — exactly one object on stdout and the
  same exit code the human output would use. That is what `orc ui` is built on.
- **Empty is an answer.** A command with no results still prints its object and
  says so, rather than looking broken.
- **`orc onboarding`** is the whole walkthrough in the terminal, so you never
  need this repository open to get started.

---

## 7. Related

- The same things with buttons: [`orc ui`](orc-ui.md)
- Full command list: `orc --help`
