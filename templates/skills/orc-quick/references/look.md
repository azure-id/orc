# The dig — ask the graph first

This is Q1's read-only half. It has one job: **find the right files, fast, and
then stop.** You are not studying the code here. An agent does that later, if
the user says yes at the gate.

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
| names a file or a symbol | `orc graph ctx <targets> --if-enabled --json` — 5 targets at most |
| names none ("where is the retry logic?") | `orc graph map --focus "<3–6 words from the request>" --budget 800 --if-enabled --json`, then `ctx` on the files it ranks first |
| asks what breaks, or who uses something | `orc graph ctx <symbol> --depth 2 --if-enabled --json`, then `orc graph coverage <files> --if-enabled --json` |

Exit 3 = the graph is off → Grep and Glob, as before, and make no other graph
call this session. Exit 1 = no index → the same. **A `map` answer is ONE call**,
not one per file it lists.

Copy each answer's `line` into chat. Copy each answer's `trace` into the running
record, word for word.

## 3. Four rules that keep the dig honest

**A card does not replace reading the range it names.** It tells you where to
look. It never tells you what the code does.

**No card in the slice for a change inside one file the user named**, when no
signature changes and nothing new is exported (`../../_shared/code-graph.md`
§7). The executor reads that file whole anyway, so the card would be paid twice.

**`--source [N]` is for a range you will NOT edit.** A caller's body, a
neighbour, a test. A file the executor is going to change is read in full by the
executor (`../../_shared/read-ladder.md`, exception 1). Never paste `--source`
text into a slice as something to edit from.

**Exit 4 means not found OR ambiguous.** Grep for the name, and put EVERY
candidate into your Q2 question. Never pick one in silence.

## 4. A blast-radius question

"What breaks if I change this?" · "Who uses this?" · "Is it safe to change?"

Run `orc graph coverage <the files in play> --if-enabled --json` FIRST. A file
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

```
orc graph ctx <declared files> --for-slice --if-enabled --json
```

ONE call, 10 files at most. Its `card` becomes the slice's `graph` block. This
is the **outside view** — who imports these files, who calls into them from
elsewhere, which tests reach them, where they are mounted. It is the half the
executor cannot see by reading the files it was given.

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
