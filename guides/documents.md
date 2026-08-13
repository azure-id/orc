# Documents — `/orc-doc` in detail

README overflow. The short version is in the README under *Documents that go
somewhere*; this is everything that would have bloated it.

---

## The two contracts

> **The orchestrator never reads the document body.** It knows the document only
> through the CLI's derived section map and through what the agents it
> dispatched report back.

> **The context is gathered once and frozen.** A resumed session reads
> `context.md` from disk; it never re-interviews you for what session 1 already
> settled.

Both are registered contract tokens. Everything below serves one of them.

## Why it is built this way

Writing a long document with an agent fails in three ways, and all three are
context-window problems wearing a costume:

1. **The orchestrator reads the document it is writing.** A 900-line TSD is
   ~30,000 tokens. Read it three times across a session and the session is over.
2. **Every edit re-reads and re-writes the whole file.** Changing one paragraph
   in section 9 should not cost the other 14 sections.
3. **The context dies with the session.** You come back on Monday, the model
   knows nothing, and you paste the same brief for the fourth time.

## Who holds what

| Holder | What it holds |
|---|---|
| the orchestrator | `context.md`, `outline.md`, the section map, the lint findings, each agent's ~30-line return |
| each writer | its own `.work/<id>.md`, and nothing else |
| each checker | one line range, read with an offset and a limit |
| nobody | the whole document |

**Line arithmetic is the CLI's job.** It is the one thing a language model is
guaranteed to get wrong, and the entire saving depends on the numbers being
right — so the map is computed by `bin/cli.js`, re-derived after every write, and
**never stored**. A stored line number is a wrong line number one edit later.

## The arithmetic, on a real document

| | |
|---|---|
| Document | 10,000 lines, 40 sections |
| `doc_max_lines_per_agent` | 400 |
| `doc_max_parallel` | 4 (hard cap) |
| Batches | 25 agent slices |
| Waves | ⌈25 / 4⌉ = **7**, parallel within each |
| Orchestrator context spent | 25 returns × ~30 lines ≈ **750 lines**, plus the map |
| Reading it twice instead | **20,000+ lines** |

On a re-check after an edit, only the sections whose hash changed are
re-dispatched — typically 1 or 2 slices, not 25. **The hash is what turns a
re-check from a full pass into a diff.**

## The gates, in order

| Gate | Question | If missing |
|---|---|---|
| **D1** | What do you want written, and about what? | **HARD STOP.** Nothing is created — no folder, no file |
| **D2** | Paths to supporting documents? | "none" is a complete answer and is recorded |
| **D3** | Do you have your own template? | Falls back to the shipped base template |
| **D4** | Intent · audience · expectation · language · type · target · length | Re-ask once with a recommended default per field |
| **D5** | The outline, confirmed before a word is written | — |

Asking D2 and D3 is mandatory even though answering them is not. D4 must be
answered, but *"yes, use your default"* is an answer.

## The five templates

| Type | Backbone |
|---|---|
| `prd` | cover → problem → goals → requirements → risks → rollout |
| `tsd` | context → goals → design → **alternatives considered** → cross-cutting → rollout |
| `collaboration` | parties → shared goal → **RACI** → interfaces → decision rights → decision log |
| `report` | executive summary → **RAG status** → results → risks → **decisions needed from you** |
| `workflow` | purpose → **when NOT to use this** → the procedure → **when it goes wrong** → escalation |

Each ships as `templates/skills/orc-doc/references/templates/<type>.md`: a
heading skeleton, a one-line purpose comment per section (stripped at assemble,
never reaching the deliverable), and a starter table where a table is the right
shape.

**A template is a floor, not a cage.** Your own template REPLACES the shipped one
entirely — its headings become the outline, its body is instructions for the
writer, and the two are never merged silently.

## Where a Markdown file can go

| Target | Imports `.md`? | Watch out for |
|---|---|---|
| **Notion** | native | **Only H1–H3 exist** — H4+ degrades to bold text. 5 MB/file free, 50 MB paid, 5 GB/ZIP. A hidden file in the ZIP fails the import |
| **Obsidian** | native format | nothing |
| **Google Docs** | native | tables convert, but complex ones flatten |
| **Coda** | native | `/import` on the canvas |
| **Craft** | yes | imports an Obsidian/Markdown folder with backlinks |
| **Apple Notes** | native (macOS Tahoe / iOS 26+) | older versions have no support |
| **GitHub / GitLab** | native | relative image paths must exist in the repo |
| **Docusaurus / Hugo / Jekyll / MkDocs** | yes | these **want** YAML front matter |
| **Confluence** | app required | a marketplace importer, or a converter script |
| **OneNote** | **no** | convert to Word or PDF first |

`orc doc targets` is the machine copy, and `orc doc lint --target <id>` enforces
it. **A lint rule that came from a real product limit is worth ten invented
ones.**

## The portability rules

| Rule | Why |
|---|---|
| ATX headings, exactly one H1, no skipped levels | every outline builder depends on it |
| max depth H3 under `notion` and `generic` | Notion has three heading levels |
| **one paragraph, one line** | a wrap at 80 columns becomes a line break inside a Notion paragraph — the single most common import-mangling bug |
| no raw HTML, no HTML comments | some importers render them as literal text |
| simple pipe tables only | everything else survives; these do not |
| ` ``` ` fences with a language tag | `~~~` and indented blocks convert unreliably |
| no wikilinks, footnotes or definition lists | Obsidian-only / Pandoc-only |
| images: alt text **and** a one-line description | images do not travel; the description does |
| front matter off by default, on for the static-site targets | visible junk in Notion, required by Hugo |
| no emoji in headings | some importers slug headings and mangle anchors |

## Writing a human can read

Average ≤ 20 words a sentence, anything over 35 is a finding with its line
number; common words over precise-sounding ones; every acronym expanded on first
use; active voice; facts in tables; each section opens with its conclusion.

**Never invent a fact.** Anything not in `context.md` or `context-sources.md`
becomes a visible line:

```markdown
> **Open:** the fraud limit has not been decided.
> **Assumption:** refunds settle within one banking day. Not stated anywhere I was given.
```

Those are the document being honest. Filler that reads like a fact is the worst
possible output of this lane.

**The checker is `low` effort on purpose.** It reads a short range and answers a
bounded question, and a harder-thinking checker reasons its way past a gap a real
reader would trip on — the same reasoning that pins `/orc-challenge`'s cold
reader at `low`. Nothing may upgrade it.

## Editing safely

```bash
orc doc extract <slug> --section 04-goals   # part file + its recorded hash
#   … a writer edits ONLY that file …
orc doc splice <slug>                       # bottom-up, then re-map and re-lint
```

Bottom-up (highest `start` first) is why the model never does line arithmetic: an
edit that changes a section's length cannot shift a range that has not been
spliced yet.

`splice` **refuses** when a section's hash no longer matches the file on disk —
you edited it while we were working. It reports the conflict by section NAME,
overwrites nothing, and asks. **A `user-edited` section is never rewritten
without an instruction naming it**; a finding inside one is reported and the fix
offered, never applied.

## Resuming

```
/orc-doc resume                  lists every document
/orc-doc resume prd-checkout     a prefix is enough
```

The new session runs `orc doc status` and `orc doc map`, reads `context.md` and
`outline.md` (**not the document**), names the sections you edited, and then
**stops and asks what should change**. No change request → no work.

`RESUME.md` is written by the lane itself, never by a dispatched agent — a
dispatch inside a stop sequence lets a stop fail because a subagent did.

## The CLI

| Command | Exit codes |
|---|---|
| `orc doc list` | 0 |
| `orc doc status <slug>` | **0 complete · 1 in progress · 2 unknown slug** |
| `orc doc show <slug> [--section <id>]` | 0 · 2 unknown |
| `orc doc map <slug>` | 0 · 2 no document |
| `orc doc plan <slug> --role write\|check\|edit` | 0 work to do · 1 nothing to do |
| `orc doc outline <slug> [--set <path>]` | 0 · 2 unknown |
| `orc doc extract <slug> --section <id>` | 0 · 2 unknown section |
| `orc doc splice <slug>` | 0 · **1 hash conflict** |
| `orc doc assemble <slug>` | 0 · 1 missing required part |
| `orc doc lint <slug\|path> [--target <t>]` | **0 clean · 1 findings · 2 unreadable** |
| `orc doc templates` · `orc doc targets` | 0 |
| `orc doc init <slug> --type <t>` | 0 · 1 exists · 2 bad args |

Every read speaks `--json`: one object on stdout, and the exit code the human
path would use. An empty result is an ANSWER, so it still returns its object.

## Config

| Key | Default | What it does |
|---|---|---|
| `doc_max_lines_per_agent` | `400` | write/read budget per dispatched agent |
| `doc_max_parallel` | `4` | agents per wave. **Hard cap 4**; larger is clamped and the clamp is announced |
| `doc_language` | `en` | the D4 default, always confirmable per run |
| `doc_dir` | `orc/orc-doc` | where the folders live |

`opus5_only` is a **no-op** here: both agents are already `claude-opus-5`. The
lane is *unaffected*, not exempt.

## Where it sits

```
/orc-brainstorm   →  which direction?
/orc-grill        →  what exactly is it?
      ↓  ("write this up")
/orc-doc          →  write it down so other people can act on it
      ↓
/orc-challenge    →  is what I wrote actually good enough?   (a SEPARATE session)
      ↓
/orc-analyze → /orc-plan → /orc   build it
```

`/orc-wiki` and `/orc-learn` generate documents derived from the **code**.
`/orc-doc` writes documents derived from **what you decided**, for people who may
never open the repository. No overlap, no shared writer.
