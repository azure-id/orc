# `orc graph` — the code graph, in one file

**Status:** built, tested and committed on `feat/orc-graph` as `b94bce9`.
**Version:** 1.8.0, not released and not pushed. **Default: `off`.**
**Date:** 16-09-2026.

This file is the short answer to four questions: what it is, how to use it, what
it costs, and whether it is worth it. The long answers are in `CHECKPOINT.md`
(the build record) and in `findings/` (the measurements).

---

## 1. What it is

A local map of your repository, under `.claude/orc/graph/`. It is git-ignored.

It has two layers, and only one of them costs money.

| Layer | Written by | Cost | Answers |
|---|---|---|---|
| **Structure** | the CLI parser | **0 model tokens** | where a symbol is, who calls it, what it calls, which SQL / HTTP / env / file effect it has |
| **Notes** | a Sonnet 4.6 agent | one dispatch per batch | one sentence: what this function does |

Structure is the feature. Notes are optional and `off` by default.

**It is not the wiki, and it does not need one.** The wiki says what a feature is
and why. The graph says where the code is and what it connects to, right now.

---

## 2. How to use it

### Turn it on

```bash
orc config set code_graph on
orc graph update            # first build
orc graph ctx <a function in your repo>
```

After that, every code lane — `/orc`, `/orc-ultra`, `/orc-diy`, `/orc-mini`,
`/orc-fast`, `/orc-quick` — builds it, uses it and updates it on its own. No
other lane calls it.

Run `orc update` in your project to get the lane changes.

### The commands

| Command | What you get |
|---|---|
| `orc graph status [--heal]` | is the map fresh, behind, missing or off. `--heal` builds or repairs it in the same call |
| `orc graph update` | parse the files whose git hash moved |
| `orc graph ctx <symbol or file[:line]>` | the card: where it is, who calls it, what it calls |
| `orc graph impact <file...>` | who would feel a change to these files |
| `orc graph path <from> <to>` | is there a call path between these two |
| `orc graph coverage <file...>` | which lines the parser could not finish |
| `orc graph changes [--base <ref>]` | the symbols THIS diff touches, with risk and the reason for it |
| `orc graph cochange <file>` | files that change WITH this one, from git history |
| `orc graph gc` | compact the store |
| `orc graph notes pending` / `notes apply` | the optional one-sentence notes |

Every read command speaks `--json` and takes `--budget`, `--format prose|tree`,
`--offset` and `--dir`.

### The config keys

| Key | Default | What it does |
|---|---|---|
| `code_graph` | `off` | the whole feature |
| `code_graph_notes` | `off` | `wave` or `end`. **The only part that costs tokens** |
| `code_graph_notes_min` / `code_graph_notes_cap` | `5` / `40` | fewest and most functions in one notes batch |
| `code_graph_card_budget` | `1200` | token ceiling for one card (300–4000) |
| `code_graph_auto_update` | `true` | a lane's preflight repairs a stale map itself |
| `code_graph_heal_ms` | `1500` | how long a read may spend repairing the map first |
| `code_graph_hooks` | `on` | whether the installed hook acts |

---

## 3. What it costs, and what it saves

### Time — it is fast, and this is measured

| Repository | Measure | Result |
|---|---|---|
| django/django (3,040 files, 44,160 symbols) | first build, nothing cached | **12.2 s** |
| django/django | `ctx` on the widest file | **415 ms** |
| django/django | `impact` on the widest file | **365 ms** |
| this repo (143 files) | `ctx <file>`, after the EW2 cache | **458 ms**, from 702 ms (**−35%**) |
| this repo | `impact <file>`, after the EW2 cache | **455 ms**, from 644 ms (**−29%**) |
| this repo and django | card size with `--format tree` | **−17.4% / −20.6%** |

Updates are small. Git already hashes every file, so only the files whose hash
moved are parsed again.

### Tokens — it does NOT save them, and this is also measured

This is the most important line in this file, so it is stated plainly.

> **The code graph does not reduce token usage by a two-digit percentage, and it
> cannot. This is structural, not a tuning problem.**

The working is in `findings/EW8-TOKEN-VERDICT.md`. It replayed **242 real ORC
lane windows** (40.5 M tokens) and **78 real development sessions** (79.2 M
tokens) with `eval/graph-replay.js`, at **zero token cost**.

Where the tokens actually go:

| Share of tokens ADDED to context | ORC lane runs | Dev sessions |
|---|---|---|
| the growing context prefix | ~69% | ~58% |
| model output | 18.4% | 29.3% |
| first-turn prompt | 7.1% | 7.3% |
| **all tool results** | **5.5%** | **5.7%** |
| — `Read` | 3.28% | 0.65% |
| — `Bash` | 1.62% | 4.67% |
| — **`Grep` + `Glob`** | **0.06%** | **0.06%** |

The graph targets the last row. **A PERFECT locator — every search answered and
every whole-file read turned into a range read — saves 0.1% of a run.**

So the honest statement is: **the graph costs no model tokens to build, and it
saves none either.** Turn it on for the cards, not for a smaller bill.

### Time saved by a person — one real measurement, and it cuts both ways

One question, asked word for word in two fresh sessions
(`findings/R3-results.md`):

> List every place that would break if I changed the signature of
> `searchByItemPrefix`.

| | graph OFF | graph ON |
|---|---|---|
| time | 1 m 3 s | **37 s** |
| direct call sites found | 7 of 7 | 7 of 7 |
| invented a call site | no | no |
| the 11 route-level tests that also break | found, and marked indirect | **declared absent — wrong** |

The graph made the answer **41% faster and exactly right on the direct callers**.
It also made the agent over-confident: it read the card's silence as a boundary
and wrote one false sentence. See §6.

---

## 4. The verdict

**Ship it as a correctness and navigation tool. Never sell it as a token saving.**

That is what the release docs now say, and it is what the commit says.

The original gate for this build was *prove a two-digit token saving, then keep
enhancing*. **That gate failed, and it failed structurally** — the target is a
tenth of a percent. Two rounds of live A/B testing could not have shown anything,
because the fixture was eight files and the metric was total session tokens,
where retrieval is 3.2% and the run-to-run spread is 34%.

The engine is nevertheless sound, and that was checked on a real repository, not
a toy: on django/django only **0.3% of files** were incompletely parsed, and
**51.3% of in-repo calls** resolve confidently.

---

## 5. Pros and cons

### Pros

- **The structure is free.** The CLI parses it. No model, no dependency, no
  network, no background process, no timer.
- **It is fast.** A 3,040-file repository indexes in 12 seconds and answers in
  under half a second.
- **It says how sure it is.** Every link is `LOCAL`, `IMPORT`, `UNIQUE`,
  `AMBIGUOUS` with every candidate listed, or `UNRESOLVED`. It never guesses.
- **It says where it could not read.** A card header says
  `coverage partial 327-466` when the parser stopped early.
- **It keeps itself current three ways**, and only one needs a lane to remember a
  step: a read repairs what it is about to answer for, the hook updates the map
  when a worker finishes, and the lane updates after a change.
- **It is honest about time.** Every answer carries a `generation`, so a card
  quoted back later can be placed in time.
- **It is safe against injection.** Everything the hook hands a worker is
  labelled repository data, never an instruction. Names and paths are stripped of
  control characters. **File contents are never injected** — only names, paths
  and line ranges. The hook never blocks a tool call, and it is silent in the
  main session and outside an ORC run.
- **It answers questions a search cannot.** `changes` gives the symbols a diff
  touches with the reason for its risk rating. `cochange` gives files that move
  together, from real git history.
- **It costs nothing when it is off.** Default `off`, and the shipped status line
  is byte-identical with it off.

### Cons

- **It saves no tokens.** Measured, not assumed. See §3.
- **A card's silence is not proof of absence.** It lists only the callers that
  NAME the symbol. See §6 — this is the one that can mislead you.
- **TypeScript is read with pattern matching**, not with the TypeScript compiler.
  JS and TS use a hardened heuristic.
- **An instance alias does not link to its class.**
  `x = new Service(); x.run()` shows as `AMBIGUOUS`.
- **There is no `code_graph_ignore` key yet.** The engine supports ignore globs;
  the config key is not wired.
- **Notes cost real tokens** — one Sonnet 4.6 dispatch per batch. They are `off`
  by default, and they are the only paid part.
- **The status line component compares HEAD with the index.** It sees a commit
  move, never an uncommitted edit. Only `orc graph status` sees those.
- **Agents do not always use it.** In the round 2 evaluation, executors ran
  `orc graph ctx` themselves in 0 of 8 dispatches. That is why the hook and the
  read-repair exist: two of the three freshness paths no longer depend on anyone
  remembering a step.
- **`impact` does not meet the card-size bar.** It is −7.1% on django and 0.0%
  here, against a 15% bar. It keeps the flag because the code path is shared and
  it is provably never worse, but that is recorded, not rounded up.

---

## 6. The one thing to understand before you trust a card

**A card lists every caller that NAMES the symbol.**

A caller that arrives another way is not a link, and never will be:

- an HTTP route test that calls `.get("/orders/search")`
- a job runner that starts work from a queue
- a string dispatch, or reflection
- a function passed as middleware without its name

In those cases there is no edge to record. The file still reads
`coverage: full`, and the card is still silent. **The card is right. Its silence
is not an answer.**

This is not a defect to repair. It is the shape of the tool, and it is now
written into `_shared/code-graph.md` §2, the release limits and both READMEs.

The rule that follows is the top of the precedence line, and it has not moved:

```
code > graph structure > fresh wiki > stale wiki > graph notes > model priors
```

**Use a card as an anchor. Read the code before you act on behaviour.**

---

## 7. When to turn it on, and when not to

**Turn it on when** you work in a repository too big to hold the call structure in
your head, you want "who calls this" answered in half a second with the kind of
edge attached, or you want a review to look at the symbols a diff touched instead
of every symbol in the files it touched.

**Leave it off when** your repository is small enough to grep in one pass, or you
turned it on to get a smaller bill. It will not give you one.

---

## 8. If you want the bill to go down, look here instead

From `findings/EW8-TOKEN-VERDICT.md` §5, in descending order of size. **None of
these is the code graph.**

1. **The growing context prefix (~69% / ~58%).** Compaction policy, shorter skill
   spines, and fewer agent definitions per dispatch are worth more than every
   retrieval optimisation together.
2. **Model output (18–29%).** Shorter returns and tighter report formats.
3. **`Bash` results (1.6% / 4.7%)** — on real development sessions this is bigger
   than `Read`, `Grep` and `Glob` together. Build and test output is read whole,
   on purpose, and **nothing summarises it today.** This is the best single
   target on the list.
4. **`Read` (3.3% / 0.65%).** The read gate already works on this.

---

## 9. Where the evidence is

| Question | File |
|---|---|
| the build record, every decision in force | `CHECKPOINT.md` |
| what to do next | `RESUME.md` |
| the token verdict, and how it was measured | `findings/EW8-TOKEN-VERDICT.md` |
| round 3 — hooks, django, correctness | `findings/R3-results.md` |
| card size and the cheap signals | `findings/EW5-EW6.md` |
| the resolution cache and coverage | `findings/EW1-EW2.md` |
| the hooks, and update without a lane step | `findings/EW3-EW4.md` |
| the two failed token evaluations | `findings/W9-eval.md` |
| reproduce the token measurement, free | `node eval/graph-replay.js ...` |
