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
ever holds the document: the writers each own one part file, the checkers each
read one line range, and the orchestrator holds a map.

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

## Doing it by hand

Every step has a real CLI command, and every one of them is free:

```bash
orc doc templates                          # the five, with their sections
orc doc targets                            # where a .md can actually go
orc doc init my-prd --type prd --target notion
orc doc outline my-prd --set my-headings.md   # or bring your own structure
orc doc plan my-prd --role write --json    # the batching: <=4 agents, no split sections
#   … writers fill .work/<id>.md …
orc doc assemble my-prd                    # parts -> document.md, outline order
orc doc lint my-prd                        # the free check (0 clean / 1 findings)
orc doc map my-prd                         # fresh line numbers, never stored
orc doc plan my-prd --role check --json    # the checker ranges
orc doc extract my-prd --section 04-goals  # one part file + its hash
orc doc splice my-prd                      # bottom-up, refuses on a conflict
orc doc status my-prd                      # 0 complete / 1 in progress / 2 unknown
```

`orc doc list` shows every document with its `Where it stands:` line.

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
- Invent a fact. Anything it was not given becomes a visible `> **Open:**` or
  `> **Assumption:**` line.
- Overwrite a paragraph you wrote. `splice` refuses on a hash conflict and names
  the section.
- Stage or commit anything. It prints the `git add` command.
- Grade its own output. It offers `/orc-challenge`, in a separate session.

## Config

| Key | Default | What it does |
|---|---|---|
| `doc_max_lines_per_agent` | `400` | write/read budget per dispatched agent |
| `doc_max_parallel` | `4` | agents per wave. **Hard cap 4** — larger is clamped, and the clamp is announced |
| `doc_language` | `en` | the D4 default, always confirmable per run |
| `doc_dir` | `orc/orc-doc` | where the folders live |

`opus5_only` is a **no-op** here: both agents are already `claude-opus-5`. The
lane is *unaffected*, not exempt.
