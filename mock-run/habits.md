# Mock run — habits (`orc habit`)

> You keep giving the same answer to the same question. ORC notices, asks you
> ONCE at the end of a run, and applies nothing without your yes.

---

## 1. What it does

Every lane asks you questions: review first or commit now, use TDD or not,
open a PR or commit only. Some of those answers are the same every time.

With habits on, each answer writes one `ASK` line into the run's trace. The
CLI (`orc habit`, no model) counts those lines. When one answer is clearly your
usual, it proposes it — once, at the end of a run, inside the questions the
lane already asks.

Habits are **off by default**. Off costs zero tokens: no line is written, no
question changes, and `orc lane config --json` has no habits field.

---

## 2. Turn it on

```
$ orc config set habits propose
  habits: off → propose
  ORC now writes one ASK line per answered question. At the end of a run it may
  ask ONE question. Nothing is applied without your yes.
```

`observe` is the quieter step: ORC counts, and `orc habit show` tells you what
it sees, but it never proposes.

---

## 3. Six runs later

You ran `/orc-quick` six times on `shopcart`. Each time, at the Q3 offers, you
chose **review first**. The seventh run opens with the usual preflight lines,
plus one more:

```
habits: propose — 0 learned, 0 usual mark(s), 1 proposal for the end of the run
```

The work runs as normal. The dispatch gate still asks which agent to use —
every time, with or without habits. At the end, the proposal is ONE line in
the offers you already get:

```
Entry 7 written to orc-quick/cart-rounding/quick-context.md

  1  review first     dispatch orc-reviewer-opus-5-low on the diff
  2  commit directly
  3  stop

You chose review first in 6 of your last 6 answers to "Code review before
commit". Make it your usual? [yes · not now · never]

> 1, and yes
```

ORC runs the command that the `lane config` answer named for "yes". Nothing
else changes in this run.

---

## 4. The next run

```
habits: propose — 0 learned, 1 usual mark(s), no proposal
```

```
  1  review → then commit   → usual (6 of 6)
  2  commit without review
  3  stop
```

The usual answer is FIRST and marked. It is not pre-selected: the question is
still asked, and the review is still a dispatch, so its gate still asks which
agent.

---

## 5. Look at it, and undo it

```
$ orc habit show
  mode propose · window 30d · 7 runs · 7 answers

  H-3f9a2c  Code review before commit   applied   6 of 6
            You chose review first in 6 of your last 6 answers to "Code review
            before commit".
            rule: Wilson95 LB 0.61 (n_eff 6, raw n 6) — proposes at ≥ 0.55 with
            n ≥ 5 and the last 3 agreeing
            undo: orc habit forget H-3f9a2c

$ orc habit why H-3f9a2c        # every ASK line behind it
$ orc habit forget H-3f9a2c     # back to asking with no mark
```

`orc ui` ▸ **Behaviour** shows the same rows, with the buttons the CLI allows.

---

## 6. What to notice

- **Nothing is applied without your yes.** There is no automatic level, and
  `orc config set habits auto` is refused by name.
- **A habit moves only toward the careful side.** A habit can turn
  `review_before_push`, `mini_tdd` or `quick_update_tests` to `on`. A habit to
  skip a review, drop TDD or continue on a stale wiki is never applied.
- **Your config file wins.** An accepted habit is the `learned` rank, below
  `.claude/orc.config.yaml`. `orc config set` always beats it.
- **Your words are never stored.** An answer in your own words is recorded as
  `chose=other`.
- **A habit can go stale.** Two overrides in the last three answers, or 90 days
  without use, and ORC asks again at the end of a run.
- **Old runs do not count.** Traces from before 2.0.0 have no `ASK` lines, so
  habits start at `none yet`.

---

## 7. Related

- The full guide: [`guides/habits-and-gotchas.md`](../guides/habits-and-gotchas.md)
- The quick lane: [orc-quick](orc-quick.md)
