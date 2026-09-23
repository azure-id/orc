# 01 — What ORC already implements

Read off the working tree at **v1.5.0**, 2026-09-07. Every row carries its
evidence. Nothing here is measured cost — that is W0.

---

## 1. The diagram, row by row

| Diagram element | ORC | Evidence |
|---|---|---|
| A router that picks a cheap model before an expensive one | **Present, and further along** | `DIY_SCORE_TABLE` — six bands, `[0,30)` → `orc-executor-haiku-4-5` up to `[90,100]` → `orc-executor-opus-5-med` (`bin/cli.js:4960`); `orc extra` routes whole bands off Claude entirely |
| "A mode is configuration, not infrastructure" — a declarative file: instructions, a model, a temperature, tools | **Present, and stronger** | `templates/agents/*.md` are exactly that. 51 files, model-pinned, tool-scoped |
| Modes resolve by name, preferring yours, then your team's, then company-wide | **Present, and stronger** | `CONFIG_FAMILIES.ranks[]` with six rank states; `orc lane config <lane> --json` is ONE resolver that names every shadow and every inertness already worded |
| `code-write` → straight to disk, fences stripped, "Claude never reads what it produced" | **Present** | Executors write to disk and return structured JSON — status, files, gates. `agents-src/executor.template.md` return contract carries no code bodies |
| The instruction that saves the most: "output only code, no explanation, no fences" | **Present** | Same return contract. Generated content never re-enters the orchestrator's context |
| Scripts layer — "keeps the plumbing out of the model's reach" | **Present, and stronger** | `bin/webui/` subprocesses `node bin/cli.js <cmd> --json` for every read and shells the real command for every write, so UI/CLI drift is structurally impossible |
| Delegated reading; only a summary returns | **Present, per-role** | `orc-scout-*`, `orc-wiki-scanner-*`, `orc-doc-checker-opus-5-low` read files and return findings; the orchestrator never sees the source |
| "Anything small is not delegated" — overhead exceeds the saving | **Present** | `/orc-quick`'s three steps; free CLI probes before paid ones; `orc wiki plan`'s free-repairs-first ladder |
| "Editing a file is not delegated" — worker summaries carry no reliable line numbers | **Present, for a stronger reason** | `_shared/read-ladder.md` exception 1: a file in `declared_files` is read in FULL, first, always, because Claude Code enforces a path-keyed read-before-write gate and a reconstructed `old_string` is a corruption bug |
| "Reasoning is not delegated" | **Present, and computed rather than hand-drawn** | `/orc-boundary`'s four deterministic questions; `extra_risk_tasks` holding a cited `risk[]` on Claude; `/orc-challenge` never routes foreign |
| **Hooks — "the only layer that can say no"** | **ABSENT for reads** | See §3 |

---

## 2. ORC already reached the same conclusion — in prose

Three places in the payload state the diagram's central rule. All three are
advisory.

| File | Line | What it says |
|---|---|---|
| `templates/skills/_shared/read-ladder.md` | whole file | A four-step ladder — Locate → Outline → Range → Full — with an anti-chain rule and an explicit read budget. *"Reading more is not understanding more."* |
| `templates/skills/orc-quick/SKILL.md` | 21 | *"You read only to FIND the right files. To UNDERSTAND something, you dispatch an agent. This keeps your context small."* |
| `templates/skills/orc-doc/SKILL.md` | 66 | Hard rule 0: *"The orchestrator never reads the document body. Not `document.md`, not a `sections/` file, not a supporting document, not the template file. Reading is DELEGATED, always."* |

`orc-doc` is the closest existing analogue to the whole right-hand column of the
diagram — and even there the rule is prose the model must remember.

**This is the pattern this repo has already lost five times.** CLAUDE.md records
each one under a different name: v0.32.0 narration, v0.49.5 hand-back, v0.53.2
spend log, v0.54.0 journal, v1.1.0 wait. Each time the conclusion was identical
— *a fact relayed through a model's memory is a fact this repo has already
lost*, and the fix was to move the mechanism into the CLI or a hook. The read
ladder is the same shape and has not had that fix.

The source post says the same thing from the other side, under *"Why the first
version failed"*: the routing rules lived in a `CLAUDE.md`, the model read them
and redirected itself, and it worked **sometimes**.

---

## 3. The gap, stated exactly

ORC wires exactly **two** `PreToolUse` hooks:

| Hook | Matcher | Wired at |
|---|---|---|
| `orc-effort-guard.js` | `Skill` | `bin/cli.js:284` |
| `orc-trace.js` | `Task\|Agent` | `bin/cli.js:364` |

**Nothing matches `Read`. Nothing matches `Bash`.** Confirmed by grepping every
`matcher` assignment in `bin/cli.js` — the only two values that exist are
`"Skill"` and `"Task|Agent"`.

So layer 1 of the diagram — the only layer the post says can refuse — does not
exist in ORC for reads. Layers 2 and 3 are built to a higher standard than the
diagram describes.

---

## 4. Where a new hook would have to land

Five integration points, all named so W2 does not have to rediscover them.

| # | Point | Location |
|---|---|---|
| 1 | Non-destructive settings merge (add once, refresh path on update) | `bin/cli.js:270–290`, the effort-guard block is the pattern to copy verbatim |
| 2 | The shipped-file manifest — names every hook and asserts set equality | `bin/verify-package.js:470–483` |
| 3 | Hook behaviour tests | `test/hooks.test.js` (32.7K, already covers the effort guard's block/allow) |
| 4 | Config key declaration | `CONFIG_META` in `bin/cli.js` — `statusline_custom` (`bin/cli.js:1293`) is the shape for a hook's operating key |
| 5 | `SEED_EMPTY` allowlist — a key with a permanently empty `lanes[]` | `bin/verify-contracts.js:3717`. **A hook has no lane and cannot resolve config**, so a read-gate key belongs here, exactly as `statusline_custom` and `wait_hop_minutes` do |

---

## 5. What the diagram's numbers do NOT transfer

| Their number | Why it does not transfer |
|---|---|
| **350 lines** | Derived from *their* delegation overhead. Ours is different — see below |
| **10–30 s per delegation, capped at 30** | A Claude Code subagent round trip is nowhere near this. v1.2.0 measured a healthy `orc-executor-opus-5-low` dispatch at **17m8s** in a real trace, and an incident at 50m/115m/100m. ORC's break-even threshold is therefore **far above** 350 lines |
| **~90% mean saving on bulk reads** | Their own footnote: measured by one author across four scenarios on one Java monorepo, not audited, and not a company-wide result. It is a reason to measure, never a number to quote |
| **temperature 0.2** | ORC does not expose temperature on an agent file; the equivalent control is the effort ladder, which is already a measurement choice per role |

**The instrument ORC needs for its own number already exists.** v1.2.1's `MTok`
is this session's own four-kind total, and `orc usage report` (`bin/cli.js:39298`)
reads the per-session ledger at `.claude/orc/usage-session.json`.
