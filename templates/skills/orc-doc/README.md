# `/orc-doc` — build your own long document

You bring a context. You leave with a finished Markdown document that imports
cleanly into Notion, Obsidian, Google Docs, Coda, Craft and GitHub — plus a file
that lets a brand-new session pick the work up months later without you
explaining anything twice.

## The one sentence

> **The orchestrator never reads the document body.** It knows the document only
> through the CLI's derived section map and through what the agents it
> dispatched report back.

That is why a 900-line TSD does not end a session. Nothing that holds context
ever holds the document: each writer owns exactly ONE file, each checker reads
ONE bounded part, and the orchestrator holds a map.

And since v0.49.0 there is a second sentence:

> **`sections/` is the source of truth. `document.md` is a build artifact.**

Each section lives in its own file you can open, edit and diff in a PR.
`orc doc compile` rebuilds the document from them, for free, whenever you ask —
so a resumed session, an update and a re-check never touch the 10,000-line
file.

## Five base templates

| Type | For |
|---|---|
| `prd` | a product requirements document |
| `tsd` | a technical specification / design document |
| `collaboration` | a cross-team working agreement (RACI is the spine) |
| `report` | a status or outcome report (executive summary + RAG) |
| `workflow` | an SOP or runbook, written for the least experienced person qualified to do the job |

`orc doc templates` prints all five with their section lists. **A template is a
floor, not a cage** — bring your own and its headings become the outline.

## What it asks you, in this order

| Gate | What | If you have nothing |
|---|---|---|
| **D1** | What do you want written, and about what? | It **stops**. A document invented from nothing is worse than no document |
| **D2** | Any files I should read first? | "none" is a complete answer |
| **D3** | Do you have your own template? | It uses the shipped one and shows you the sections first |
| **D4** | What is it for · who reads it · what must they be able to do · language · type · where it will end up · how long | Every field has a recommended default, and accepting one counts as answering |

Then it shows you the outline and waits. Changing the outline after a write wave
is what costs money.

It also asks **how much to write at once**: `partial` (recommended) writes ONE
wave and stops so you can read those section files and redirect before the rest
is paid for; `all` writes every wave. Asked once, stored, never re-decided.

Then, **once, before the first paid wave**, it shows you the run map: how many
sections, how many waves, how many agents per wave, **how many times it will
stop**, and what the whole document is likely to cost. With no history to go on
it says so and refuses to invent numbers — `orc doc forecast <slug> --naive`
gives you a floor from the public price table instead.

## Your project's own house rules

A **house rule** is your standing instruction about what a document says and how
it reads: *"open with a one-paragraph summary a PM can read on a phone"*,
*"money always carries its currency"*. They are read **first** in every dispatch,
above ORC's own rules.

```
orc doc rules add --priority P0 --text "every document opens with a summary"
orc doc rules                       # the project ledger
orc doc rules <slug>                # what THIS document was frozen against
orc doc rules <slug> --sync         # re-freeze, deliberately
```

**P0** must · **P1** should (breaking it is recorded as a gap) · **P2** prefer.

Each document **freezes** the rules that were enabled when it started, so a rule
you change at wave 3 cannot silently invalidate half a document. `orc doc rules
<slug>` names every rule that moved since; `--sync` re-freezes and tells you
which sections predate the change. **It re-writes nothing on its own** — whether
any of them needs redoing is your call.

House rules govern **what the document says and how it reads**. They can never
change how this lane runs, and ORC says so rather than pretending to detect it:
a rule that asks for something structural comes back marked unsupported, as a
gap you can see.

## Four rules it applies to every document

All four are free — a deterministic check, no model tokens.

- **No questions or confirmations in the body.** The document answers; it does
  not ask. A section your own outline calls *open questions*, *risks* or
  *assumptions* is exempt, and so is fenced code.
- **What is missing is `N/A` plus one short line** — never written around.
- **A section well over its planned length is a finding** (1.5× its budget).
- **No local-only references.** No `src/foo.ts:42`, no `./relative`, no
  `localhost`, no link to a local `.md` — whoever reads a PRD has no repository.
  Code examples are exempt, and `doc_local_refs` turns it down to a warning (or
  off) for a genuinely internal runbook.

**A template you supply is a cage, not a suggestion.** A heading it never had is
a lint error, and a part that grew one is refused rather than recorded.
`--template-soft` opts out.

## Every wave is a stop

A wave boundary is not a loop iteration. At the end of each one you get every
file path it wrote, a free way to see it as one document, and the single line
that resumes the work:

```
Wave 2 of 7 done — 6 of 17 sections written.
  orc/orc-doc/acme-prd-170826/sections/05-rollout.md   96 L

See it as one file (free):   orc doc compile acme-prd-170826 --partial
To carry on — new session, or after your usage limit resets:
    /orc-doc resume acme-prd-170826
```

`RESUME.md` is written **first**, before anything that needs a subagent, into
`.claude/orc/run/<slug>/` — so `orc resume` and `orc run list` can actually find
it. The section files on disk ARE the progress: the next session starts at wave
3 and re-reads nothing it already wrote.

## Doing it by hand

Every step has a real CLI command, and every one of them is free:

```bash
orc doc templates                          # the five, with their sections
orc doc targets                            # where a .md can actually go
orc doc init my-prd --type prd --target notion
orc doc outline my-prd --set my-headings.md   # or bring your own structure
orc doc mode my-prd --set partial          # one wave at a time, then stop
orc doc plan my-prd --role write --json    # the batching: <=2 agents, ONE FILE PER SECTION
#   … writers fill sections/<id>.md …
orc doc parts my-prd --confirm 01-x,02-y   # record the validated returns
orc doc parts my-prd                       # what is written, and what is not
orc doc compile my-prd [--partial]         # sections/ -> document.md. FREE
orc doc lint my-prd                        # the free check (0 clean / 1 findings)
orc doc map my-prd                         # fresh line numbers, never stored
orc doc plan my-prd --role check --json    # one bounded part file per checker
orc doc split my-prd --section 04-design --by-heading   # store a big section in parts
orc doc split my-prd                       # recover sections/ from document.md
orc doc status my-prd                      # 0 nothing to do / 1 something to do / 2 unknown
orc doc next my-prd                        # what to do next, and whether it costs money
```

`orc doc assemble`, `extract` and `splice` still work — they are thin aliases for
one release. A v1 document migrates the first time you touch it: `document.md` is
split into `sections/` and **never deleted**, and an unparseable one is refused
rather than guessed at.

`orc doc list` shows every document with its `Where it stands:` line.

## What it cost

```
orc doc forecast <slug>     # before you pay: waves, stops, and a range
orc doc cost <slug>         # after: joined across EVERY session it spanned
```

`orc budget actual` works per run, and a document is not a run. `orc doc cost`
joins every trace for the slug to your local usage transcripts and reports per
role and per section. A section it cannot join reads `—`, never `0` — an unknown
reported as a number is worse than an unknown reported as unknown.

## Coming back

```
/orc-doc resume                      lists every document
/orc-doc resume prd-checkout         a prefix is enough
```

The new session reads `context.md`, tells you which sections **you** edited
since last time, and then **stops and asks what should change**. It never
re-asks what you already answered, and it never rewrites a section you touched
unless you name it.

## What it will not do

- Read your document body into the orchestrator's context.
- Invent a fact. Anything it was not given comes back as a **gap** — recorded in
  `gaps.md` and raised with you, never written into the document.
- Put its own bookkeeping in your deliverable.
  The document **carries content only**: no `> **Open:**`, no
  `> **Assumption:**`, no note callout, in `document.md` OR in a section file.
- Stub a section it has not written. Under `--partial` a missing section is
  simply **absent**, and named loudly outside the document.
- Overwrite a paragraph you wrote. A section whose hash moved is `user-edited`,
  and nothing rewrites it without you naming it.
- Ship a document that is behind its own sections. `orc doc ship` refuses and
  names what moved.
- Stage or commit anything. It prints the `git add` command.
- Grade its own output. It offers `/orc-challenge`, in a separate session.

## Config

| Key | Default | What it does |
|---|---|---|
| `doc_max_lines_per_agent` | `400` | write/read budget per dispatched agent |
| `doc_max_parallel` | `2` | agents per wave. **Hard cap 2** — larger is clamped, and the clamp is announced |
| `doc_write_mode` | `ask` | `partial` writes one wave then stops · `all` writes every wave · `ask` makes it a question, asked once and stored |
| `doc_language` | `en` | the D4 default, always confirmable per run |
| `doc_local_refs` | `error` | how a local-only reference is treated: `off` · `warn` · `error` |
| `doc_dir` | `orc/orc-doc` | where the folders live |

`opus5_only` is a **no-op** here: both agents are already `claude-opus-5`. The
lane is *unaffected*, not exempt.
