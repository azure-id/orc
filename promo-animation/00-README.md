# ORC promotional animation — prompt pack

Nine prompt files for **Claude Design animation**. Each one produces a short,
recordable animated scene promoting ORC. Paste one file per animation.

ORC v0.54.0 · github.com/azure-id/orc

---

## How to paste this into Claude Design

**One animation per paste. One conversation per animation.**

Use the files in **`standalone/`**. Each one is self-contained — the design
system is already baked in — so it is a **single paste** and nothing else:

1. Open a **new** Claude Design conversation.
2. Paste the entire contents of `standalone/02-hero-what-is-orc.md`.
3. Let it build. Iterate in that same conversation until the scene is right
   ("slow the scoring beat down", "the parallel bars are too synchronised").
4. Record it.
5. Open a **new** conversation for the next scene, and repeat.

Eight scenes, eight conversations, eight recordings. Cut them together after.

### Why not paste all eight at once?

Because you get one confused composite instead of eight clean scenes. Each file
is a separate deliverable with its own timing, its own held final frame, and its
own recording. Keeping them apart is also what lets you re-shoot scene 05 later
without disturbing the other seven.

### The two folders

| Folder | Use it when |
|---|---|
| **`standalone/`** | **Normal use.** One file = one paste = one animation. |
| root (`01`–`09`) | You want to iterate on the design system itself. Paste `01` once, then scenes `02`…`09` into that same conversation. Cheaper on tokens, but the scenes influence each other — only do this if you are deliberately tuning the shared look. |

The root files are the source; `standalone/` is generated from them. If you edit
the brand system in `01`, regenerate `standalone/` rather than editing sixteen
copies of it.

### Recording

Browser at **1920×1080**, zoom 100%, dark theme. Every scene ends on a held
frame of at least 1.5 seconds — that is your out point.

---

## The scenes, in order

| # | File | Length | What it sells |
|---|---|---|---|
| 01 | `01-brand-and-motion-system.md` | — | Shared design system. Already inside every `standalone/` file. |
| 02 | `02-hero-what-is-orc.md` | ~12s | The hook. One feature in, shipped code out. |
| 03 | `03-orc-the-full-pipeline.md` | ~25s | `/orc` — scoring, waves, parallel agents, ship. |
| 04 | `04-orc-doc-long-documents.md` | ~20s | `/orc-doc` — write a 900-line doc without holding it. |
| 05 | `05-orc-challenge-the-judge.md` | ~18s | `/orc-challenge` — the lane that refuses to fix. |
| 06 | `06-orc-extra-other-models.md` | ~18s | `orc extra` — route cheap work off Claude, visibly. |
| 07 | `07-orc-ui-control-panel.md` | ~22s | `orc ui` — the local panel, setup to first use. |
| 08 | `08-install-and-first-run.md` | ~14s | Install → `orc init` → first slash command. |
| 09 | `09-closing-lane-constellation.md` | ~12s | The 29 lanes, then the CTA card. |

Total, cut together: about **2 minutes 40 seconds**.

---

## Facts every scene must respect

These are true of the real product. Do not invent around them.

- ORC is **not a program that runs**. It is markdown skills, slash commands and
  model-pinned subagent definitions that Claude Code reads. The npm package just
  copies them into `.claude/`.
- **Zero dependencies.** Node ≥18. Version **0.54.0**.
- ORC **never writes code itself** — it dispatches subagents.
- Every task gets a **score 0–100**, which picks the **cheapest model that can
  still do it**.
- Tasks that do not touch the same files run **at the same time** — a "wave".
- State is written to disk continuously, so a run **survives a new chat**.
- `orc ui` **never runs a lane and never calls a model.**
- The whale emoji **🐋** is ORC's mark.

## Words to use, words to avoid

**Use:** lane · wave · score · dispatch · subagent · slice · gate · ship ·
run folder · trace.

**Avoid:** "AI-powered", "revolutionary", "10x", "effortless", "magic",
"game-changing". ORC's tone is precise and unhyped. The product is the pitch.
