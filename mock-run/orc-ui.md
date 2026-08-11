# Mock run — `orc ui`, the control panel

> A local web page for everything in ORC that is **not** ai. It never runs a
> lane and never calls a model.

---

## 🎬 Video walkthrough

<!--
  VIDEO PLACEHOLDER — the walkthrough goes right here.

  1. Record the panel (`orc ui --fixtures`). Keep it under ~2 minutes.
  2. Save it as:            mock-run/media/orc-ui-demo.mp4
     and a still frame as:  mock-run/media/orc-ui-demo-poster.png
  3. Replace the blockquote below with this line:

       [![Watch the orc ui walkthrough](media/orc-ui-demo-poster.png)](media/orc-ui-demo.mp4)

  GitHub note: a <video> tag with a repo-relative src does NOT play inline on
  github.com. Two things that DO work:
    · the image link above (click → opens the file), or
    · drag the .mp4 into a GitHub issue/PR comment, copy the
      https://github.com/user-attachments/... URL it produces, and paste that
      URL on its own line here — GitHub renders that one as a player.
-->

> **Not recorded yet.** The two files to drop in, and the exact line to paste
> here, are in [`media/README.md`](media/README.md).

---

## 1. Start it

```bash
$ orc ui
```

```
orc ui  ·  http://127.0.0.1:9921/?t=3734924cb00ae0fe…
  project   /home/rina/shopcart
  token     new for this launch — the URL is the key
  idle      shuts down after 30 minutes with no tab open

Opening your browser.
```

Other ways to start it:

```bash
orc ui --port 9930     # an explicit port never auto-walks: a collision is an error
orc ui --no-open       # print the URL only
orc ui --idle 0        # never shut down on idle
orc ui --fixtures      # canned data — no project needed, every state visible
orc ui --stop          # stop this project's server (exit 0 stopped / 1 none)
```

---

## 2. What is in it

| Panel | Shows | Can change |
|---|---|---|
| **Overview** | version, `orc doctor`, wiki tier, what is waiting, and **Worth doing** — one list of everything wanting a decision | — |
| **Settings** | every config key, grouped, each with the right control | staged edits, applied together |
| **Runs** | run history; a row opens in place into state-of-play, resume prompt, checkpoint, trace tail | — |
| **Knowledge** | wiki freshness and refresh scope, code patterns, gotchas, wiki debt | `wiki sync`, `gotcha prune` |
| **Stats** | lane and agent usage, downgrades, and a **Cost** tab with a stacked token bar | — |
| **Flow** | the compiled DIY flow, its gate, and a stepper of every phase in order | `diy set`, `diy compile`, presets |
| **Crosslink** | Design (the boundary drawn as a graph) and Settings (each peer's freshness) | `crosslink add` / `remove` |
| **Promises** | the pact ledger, with *"also flagged by"* when boundary and aftermath agree | `pact check`, `pact sync` |
| **Boundary** | execute / escalate / refuse per area, and what would make a refuse a yes | — |
| **Self-serve** | the graded surfaces a non-developer can change | `handoff set` |
| **Mocked Skill Use** | every mocked run that ships with ORC, grouped and searchable | — |
| **Learn** | the `orc onboarding` walkthrough, one section at a time | — |
| **Experiment** | every lane with a copy button; opens a Claude session in a terminal | — |
| **Maintenance** | `update`, `update --prune`, `doctor --fix`, `upgrade` | preview, then apply |

---

## 3. A maintenance action, start to finish

```
Maintenance ▸ Remove orphaned files

  Command:   orc update --prune
  [ Preview ]           ← Apply stays disabled until you press this

  Preview (read-only, this is `orc doctor` output):
    3 files ORC owns are no longer part of the payload:
      .claude/agents/orc-executor-opus-4-8-med.md
      .claude/skills/orc/references/old-scoring.md
      .claude/commands/orc-config.md
    Nothing else will be touched. Your config, patterns, wiki and run
    folders are never in this list.

  [ Apply ]   → confirm → the real command runs, output streams here
```

---

## 4. What to notice

- **The panel is the CLI.** Every number on screen came from
  `orc <command> --json`, and every button shells the real command. It cannot
  drift from the CLI, because it has no second copy of anything.
- **A free action gets a button. A paid action gets a command to copy.**
  Anything that would cost model tokens is never run from here.
- **A prune names every file.** A count is not consent.
- **It is treated as a write surface**: loopback only, a fresh token per
  launch, a check against DNS rebinding, no CORS, and mutations must be POST.
- **Project-scoped.** There is no `--global` config here. If a global install
  exists that could win skill resolution, every page carries a banner saying
  so — reported, never edited from here.
- **English and Indonesian**, switched from the rail. Only the panel's own
  words are translated: config keys, model ids, paths, commands and doctor
  messages are printed exactly as the CLI wrote them, because a translated
  config key is a key that does not exist.

---

## 5. Related

- The terminal half: [`orc` CLI tour](orc-cli.md)
- Compose a flow the panel can then edit: [`/orc-diy`](orc-diy.md)
