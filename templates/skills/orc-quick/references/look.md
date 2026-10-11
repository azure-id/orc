# The dig — ask the graph first

This is Q1's read-only half. It has one job: **find the right files, fast, and
then stop.** You are not studying the code here. An agent does that later, if
the user says yes at the gate. This keeps your context small.

The intent ledger prints on ONE line so nothing is skipped in secret.

## 1. Why the graph goes first

A Grep finds a name. Then you still have to open the file to see what the name
is part of, and you still do not know who uses it.

A card answers all three in ONE call: where the symbol is, who calls it, and
which tests reach it. Since v1.8.2 "reaches it" also covers a test or a client
that arrives through a URL, not only a direct call.

So: **the graph, then Grep for what the graph does not know.** Never the other
way round.

## 2. Which call, per request

| The request | The call |
|---|---|
| names a symbol | ONE `orc graph ctx <symbol> --anchors --focus=<words> --if-enabled --json --brief` — the card gives the callers, the tests (also via a caller) and the coverage verdict: do not Grep that name, do not run `coverage` unless the card says `partial` |
| names a file | `orc graph ctx <targets> --if-enabled --json --brief` — 5 targets at most |
| names none ("where is the retry logic?") | `orc graph map --focus=<3–6 words from the request> --budget 300 --if-enabled --json --brief`, then `ctx` on the files it ranks first |
| asks what breaks, or who uses a FILE | `orc graph ctx <files> --if-enabled --json --brief`, then `orc graph coverage <files> --if-enabled --json --brief` |

Exit 3 = the graph is off → Grep and Glob, as before, and make no other graph
call this session. Exit 1 = no index → the same. **A `map` answer is ONE call**,
not one per file it lists. After `map`, get facts about the files it names with
ONE `orc graph ctx <files…> --if-enabled --json --brief` (≤ 5) — not `cat`/`grep`
of those files. Read source only for a fact the card cannot give (a literal
string, a template line).

Copy each answer's `line` into chat. Copy each answer's `trace` into the running
record, word for word.

## 3. Four rules that keep the dig honest

**A card does not replace reading the range it names.** It tells you where to
look. It never tells you what the code does.

**The slice gets the pack path, never a card.** A dispatch that writes code
gets ONE pack (§5). **No pack when the change stays inside ONE file the user
named and nothing outside it changes** (no signature change, no new export):
the executor reads that file anyway, and a pack there is pure cost.

**`--source [N]` is for a range you will NOT edit.** A caller's body, a
neighbour, a test. A file the executor is going to change is read in full by the
executor (`../../_shared/read-ladder.md`, exception 1). Never paste `--source`
text into a slice as something to edit from.

**Exit 4 means not found OR ambiguous.** Grep for the name, and put EVERY
candidate into your Q2 question. Never pick one in silence.

## 4. A blast-radius question

"What breaks if I change this?" · "Who uses this?" · "Is it safe to change?"

Run `orc graph coverage <the files in play> --if-enabled --json --brief` FIRST. A file
whose coverage is `partial` is read in the source before you call anything
absent in it.

Then keep the four kinds of caller APART, in the answer and in any recon slice.
They break differently and they are found differently:

| Class | What it is |
|---|---|
| `direct` | a caller that names the symbol |
| `route` | a test or a client that reaches it through a URL |
| `via_alias` | reached through an instance or a re-export |
| `inherited` | reached through a base class member |

When ANY of those lists rests on the graph alone, the answer carries this
sentence, word for word:

> A card lists every caller that NAMES the symbol. A card's silence is not proof
> of absence.

## 5. What you hand to an executor

**A request that names a symbol:** the look call `ctx <symbol> --anchors` (§2)
already returned the anchors. Its `anchors_card` goes into the slice as
`graph_anchors` — no second `--for-slice` call for that dispatch. Declared files
= the target file + the caller files the card lists.

**A request that names files, or nothing (map first):**

```
orc graph ctx --for-slice <file1> <file2> … (space- or comma-separated) --focus=<the dig words> [--refs=<copy-from files>] --anchors --if-enabled --json --brief
```

ONE call, 10 files at most. No file is written; it answers ONE `line` (print it)
and a `card`. Paste the `card` into the slice VERBATIM as `graph_anchors`, with its `read all: …` line and its code block — never shorten it. With `graph_anchors` in the slice, list at most ONE wiki page path (the one about the feature's intent), not 1–3. The card:
up to 12 `path:a-b` ranges the dig found — the members of the declared files and
of the `--refs` files that best match the focus words — and ONE `read all:` command
the executor runs first. `--refs` = every file the request or its
requirement document says to copy behaviour or style FROM, plus the precedent
the dig found (max 5) — never the files you will edit. You have none → leave it out; the CLI picks them.

`--focus=` takes 3–8 words from the request AND from the requirement document it names — always
the words the document uses to name a file to copy behaviour or style from (e.g. `swap,modal,selection`).
Before the anchors call, locate every copy-from file the document names with ONE
`orc graph map --focus=<its words> --budget 300 --if-enabled --json --brief` (or `orc graph ctx <Name>
--if-enabled --json --brief` when the name is exact), and pass it in `--refs=`.
Exit 3 or 4 → none. One named file, nothing outside it changes → none (§3).

Its `trace` gets `entry=<n>`.

## 6. What you hand to a recon agent

- the `question`, word for word
- `anchors[]` — every path, symbol and `file:line` you found
- `read_budget` — 12 files unless you have a reason
- `blast_radius: true|false`
- `thread_note` — one sentence on what earlier entries decided, or none
- `precedence`, word for word:
  `code > graph structure (current blob) > fresh wiki > stale wiki (hints) > graph notes > model priors`

## 7. The cap, and the offer

**12 files.** If you go over, or you cannot find the right files, or the job
needs real edits in more than about 3 files: print a `GATE` line, say it
plainly, and **offer** `/orc-mini`
(`../../_shared/fallback-handoff.md`, REASON `dig-inconclusive` or
`scope-too-large`).

Never keep digging in silence. It is an OFFER — the user may still say "keep
going", and that choice goes into the entry.
