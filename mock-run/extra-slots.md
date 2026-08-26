# Mock run — the jobs that have no score

> Four ORC lanes never give a task a score. They give one job to one agent. This
> walkthrough shows you how to send one of those jobs to a cheaper model, and
> what ORC tells you before it does.

---

## 1. What this is about

`orc extra` lets a task run on a different AI model — DeepSeek, GLM, Kimi, or a
model on your own laptop. Until now you told it **which score ranges** may go
there:

```
[0,30)   → deepseek/deepseek-chat
[30,55)  → glm/glm-4.6
```

That works for `/orc`, `/orc-ultra`, `/orc-mini` and `/orc-diy`, because those
lanes give every task a score.

**Four lanes never do.** `/orc-quick`, `/orc-fast`, `/orc-doc` and `/orc-wiki`
give one job to one agent and no score at all. So they get **positions** instead
of ranges. A position is one job with one name:

| position | the lane | the job |
|---|---|---|
| `quick-executor` | `/orc-quick` | writing the code for one quick entry |
| `fast-executor` | `/orc-fast` | the single executor of a fast run |
| `doc-writer` | `/orc-doc` | writing one part of a document |
| `doc-checker` | `/orc-doc` | reading one part back and reporting on it |
| `wiki-scanner-deep` | `/orc-wiki` | a full scan of one area |
| `wiki-scanner-light` | `/orc-wiki` | a small update to a doc that exists |

---

## 2. Looking at the positions

```
$ orc extra role
```

```
ORC · extra — the positions
───────────────────────────

  quick-executor      claude · orc-executor-sonnet-4-6-med    /orc-quick
  fast-executor       claude · orc-executor-sonnet-4-6-high   /orc-fast
  doc-writer          claude · orc-doc-writer-opus-5-med      /orc-doc
  doc-checker         claude · orc-doc-checker-opus-5-low     /orc-doc
  wiki-scanner-deep   claude · orc-wiki-scanner-opus-4-8-high /orc-wiki
  wiki-scanner-light  claude · orc-wiki-scanner-sonnet-5-high /orc-wiki

  what each position is
    quick-executor      asked at the gate
    fast-executor       announced: the F0 preflight `extra:` line, before wave 1
    doc-writer          announced: before the wave, naming the sections
    ...

  A slot with no row is not a hole — it is Claude, and it is printed so "I left
  the checker on Claude on purpose" and "there is no checker" never look the same.
```

**All six are always listed, even the ones you have not touched.** A row you did
not fill in is not missing — it runs on the Claude agent printed beside it, and
you can see which one that is without going to look.

---

## 3. Giving one job to a cheaper model

You already connected DeepSeek and tested it (`orc extra add`, then
`orc extra ping`). Now give it the doc **writer** job — and only that one:

```
$ orc extra role set doc-writer ds/deepseek-chat
```

```
doc-writer → ds/deepseek-chat   /orc-doc
  takes this position off: orc-doc-writer-opus-5-med
```

Two things it will not do:

- **It will not let you point a job at a connection that never answered.** You
  get a refusal that names the connection and the command that tests it.
- **It will not change any other job.** The doc *checker* is still on Claude, and
  `orc extra role` will keep saying so.

---

## 4. What the document lane tells you, before it spends anything

A document is the one thing where the model is visible in the result — it is the
writing. So `/orc-doc` says which model writes which sections **before** the
wave, not after:

```
$ orc doc next prd-billing
```

```
extra: writer — sections 03-scope, 04-users will be written off Claude.
  writer → deepseek/deepseek-chat (via ds, displaces orc-doc-writer-opus-5-med).
  A document's voice is the deliverable, so this is said before the wave, not
  after it.
```

The **checker** is not mentioned, because the checker is not going anywhere. Two
different jobs, two different answers — that is the whole point of a position.

You can also switch it off for one document without touching the position:

```
$ orc doc extra prd-billing --set off
```

---

## 5. The quick lane ASKS. It always asks.

`/orc-quick` never picks an agent for you. So a position there does not route
anything — it just **adds a third line to the menu you already read**:

```
Which executor for entry 2 — "add retry header"?

  1. orc-executor-sonnet-4-6-med    cheap, fits a 3-file change
  2. orc-executor-opus-5-low        thinks harder, about 3× the cost
  3. deepseek/deepseek-chat         via profile `ds` — sends this slice to a third party
```

- It is **never** the default.
- It does **not** stick to the next entry.
- If it fails, the same menu comes back with the reason. ORC does not quietly
  pick option 1 for you.

---

## 6. What ORC costs, and where it went

A job that ran somewhere else is written down like any other:

```
$ orc extra stats
```

```
  ds / slot:doc-writer      4 dispatches   in 41.2k · cw 0 · cr 128.0k · out 9.1k   $0.03
  ds / [0,30)              11 dispatches   in 88.0k · cw 0 · cr 210.4k · out 22.6k  $0.07
```

Each position gets its own line, so "the doc writer cost this much" is a
question you can answer.

---

## 7. The one rule underneath all of it

> **Extra decides whether a Claude agent runs at all. `opus5_only` and the score
> tables only decide which Claude agent runs where extra did not take it.**

If you gave `doc-writer` to DeepSeek, `opus5_only` is not consulted for that job
at all. It is still fully in charge of `doc-checker`, because you left that one
alone. `orc config list` prints both facts, so a setting is never quietly doing
nothing.

---

## 8. What this walkthrough did not do

- It never sent your code anywhere without printing a line about it first.
- It never picked a model for you in `/orc-quick`.
- It added **no new settings** to your config file. A position is a row you set
  with one command and remove with one command.
