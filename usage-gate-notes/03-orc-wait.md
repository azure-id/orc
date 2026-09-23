# `/orc-wait` — the manual wait

> Written in Simplified Technical English (ASD-STE100 in spirit, not in
> certification). Every command, config key, state word, model id and path is a
> value the CLI computes. These values keep their exact spelling.

Read `01-how-it-runs.md` and `02-risks-and-choices.md` first.

---

## 1. What it is

You look at the statusline. You see that the window is almost full. You type:

```
/orc-wait 30
```

ORC finishes the step it is in. Then ORC waits 30 minutes. Then ORC continues
the run from the same place.

You made the decision. ORC did not compute it.

---

## 2. Why this is a good idea

There are four reasons, and the first one is the strongest.

**1. It works when the numbers do not exist.** The automatic gate reads
`.claude/orc/usage.json`. That file is absent on Claude Code before v2.1.80. It
is also `unknown` when the reading is older than 30 minutes. In both cases the
gate is blind.

You are not blind. You can see the statusline. `/orc-wait` uses your eyes
instead of a file.

**2. It has no dependencies.** It does not need part 1. It does not need part
2. It does not need a threshold. You can build it first, and you can build it
alone.

**3. It proves the mechanism.** The automatic wait and the manual wait use the
same background command and the same `RESUME.md`. If `/orc-wait` works, the
hard part of `usage_gate: wait` is already finished.

**4. A human decision is always allowed.** ORC gates its own dispatch. ORC
never gates your instruction. This rule is already in `/orc-boundary`.
`/orc-wait` obeys the same rule.

---

## 3. One engine, two triggers

Do not build two wait mechanisms. Build one.

| Trigger | Who decides | Needs a reading | Ships |
|---|---|---|---|
| `/orc-wait 30` | you | no | first |
| `usage_gate: wait` | the CLI | yes | after |

Both triggers write `RESUME.md`. Both use a detached command. Both check again
after each hop. Only the source of the decision is different.

---

## 4. The hard problem — when does the wait start?

You type `/orc-wait 30` while a wave runs. Claude Code puts your message in a
queue. The message arrives at the next turn.

So the wait cannot start immediately. This is correct. A wait that stops a
dispatch in the middle is worse than no wait.

The wait must start at a **safe point**. A safe point is a place where the run
can stop with no loss.

| Safe point | Why |
|---|---|
| after a wave ends | every return is validated |
| after a phase ends | the trace packet is sent |
| before a dispatch | nothing is in flight |
| at a `batch_pause_every` stop | the run already stops here |

These are unsafe points. Never wait at one of them:

| Unsafe point | Why |
|---|---|
| between a dispatch and its return | the return is lost |
| inside the stop sequence | `RESUME.md` is not written yet |
| during a `splice` or a file write | the file is half written |
| before the smoke gate reports | you do not know if the build is green |

So the rule is: **`/orc-wait` is the highest priority at the next safe point.**
It is not the highest priority immediately.

Say this in the message. The user must know that the wait is queued.

---

## 5. Mocked example A — a wait during a wave

```
  ── Wave 3 of 6 · 3 tasks ───────────────────────────────
  DISPATCH  orc-executor-opus-5-med    task 7
  DISPATCH  orc-executor-sonnet-5-high task 8
  DISPATCH  orc-executor-sonnet-5-high task 9

> /orc-wait 30

  ⏸ I got your wait. 30 minutes.
     Wave 3 is running. I do not stop a dispatch in the middle.
     I start the wait after wave 3 ends.

  RETURN    3 of 3 ok
  VERIFY    build green · tests green

  ── The wait ────────────────────────────────────────────
  I wrote the hand-back:
  .claude/orc/run/rate-limit-api/RESUME.md

  Where it stands:  /orc · phase 4 · wave 4 of 6

  I wait 30 minutes. It ends at 19:14.
  This uses no tokens. Press Ctrl+C to stop the wait.

  [30 minutes later — the session starts again]

  usage: 5h 62% (3h51m)
  ✅ I continue.

  ── Wave 4 of 6 · 2 tasks ───────────────────────────────
  DISPATCH  orc-executor-opus-5-med    task 10
```

---

## 6. Mocked example B — a wait with no run

```
> /orc-wait 45

  No run is active. I wait 45 minutes. It ends at 19:29.
  This uses no tokens. Press Ctrl+C to stop the wait.

  [45 minutes later]

  usage: 5h 8% (4h47m)
  ✅ The wait ended. What do you want to do?
```

This is the simplest case. There is no run, so there is no safe point and no
`RESUME.md`.

---

## 7. Mocked example C — wait for the reset

```
> /orc-wait reset

  usage: 5h 94% (1h47m)
  The window resets at 18:41.
  I wait in steps of 30 minutes. I check after each step.

  I wait. Hop 1 of 4. 30 minutes.
```

`/orc-wait reset` needs `.claude/orc/usage.json`. If the file is absent, the
command must refuse and say why:

```
> /orc-wait reset

  ⛔ I cannot read the reset time.
     There is no reading in the last 30 minutes.
     Type a time instead. Example: /orc-wait 45
```

A refusal that names the fix is better than a guess.

---

## 8. What the command accepts

| You type | ORC waits |
|---|---|
| `/orc-wait 30` | 30 minutes |
| `/orc-wait 90m` | 90 minutes |
| `/orc-wait 2h` | 2 hours |
| `/orc-wait until 18:41` | until 18:41 today |
| `/orc-wait reset` | until the 5-hour window resets |

A number with no unit is minutes. Say this in the help text.

---

## 9. Rules this command must obey

1. **Write `RESUME.md` before the wait.** The wake-up message can be lost.
2. **Start at the next safe point.** Never stop a dispatch in the middle.
3. **Wait in steps of 30 minutes or less.** Each wake-up makes the next reading
   fresh.
4. **Command entry only.** No lane can run `/orc-wait` for itself. Only you can
   type it. This is the same rule as `/orc-ultra`.
5. **The manual wait wins.** If `usage_gate: wait` is enabled and you type
   `/orc-wait`, ORC uses your time. A human decision beats a computed one.
6. **Show the end time, not only the length.** "30 minutes" is harder to use
   than "it ends at 19:14".
7. **Say how to stop it.** Ctrl+C must be in the message.
8. **Say the cost.** A wait under 60 minutes keeps the prompt cache. A longer
   wait ends it, and the next turn reads the whole context again.

---

## 10. Is `/orc-wait` a lane?

This is a real design question. It has a repository rule behind it.

Rule (v0.42.0): a lane that the protocol declares must be a lane that something
opens. A test reads the payload and fails on a lane in the enum that no skill
opens. A declared lane that nothing opens is a permanent zero in `orc stats`.

`/orc-wait` does not open a run. It waits inside a run that already exists, or
it waits with no run at all.

There are two answers.

| Answer | Result |
|---|---|
| A lane | It needs a `run-wait-<slug>` pointer. But there is no run to name. |
| Not a lane | It writes a `WAIT` verb into the current run's trace, or nothing. |

**Choose "not a lane".** `/orc-explain` is the precedent. It does not trace,
and `orc stats --help` states this blind spot.

But a wait inside a run **is** part of that run's story. So write one line into
the trace that is already open:

```
WAIT  requested=30m start=18:44 end=19:14 reason=user
```

`/orc-retro` can then see how much a run waited. Write nothing when no run is
active.

---

## 11. What it costs to add

`/orc-wait` is not free to ship. This is the mechanical work.

| Item | Change |
|---|---|
| `templates/commands/orc-wait.md` | new file. 29 commands become 30. |
| `templates/skills/orc-wait/` | new skill folder. |
| `bin/verify-package.js` | the skill count floor moves. |
| `templates/hooks/orc-trace.js` | the `WAIT` verb, if you choose section 10. |
| `README.md`, `knowledge.md`, `CHANGELOG.md` | the P0 rules in `CLAUDE.md`. |
| `orc-ui-wiki.md` | only if the panel shows the wait. |

There are **zero new agents**. The wait uses a detached command. No model runs
during a wait.

---

## 12. What can go wrong

| # | Failure | Result | Protection |
|---|---|---|---|
| 1 | The user types `/orc-wait` during a dispatch and expects it to stop now | The user thinks the command failed | Answer at once. Say when the wait starts. |
| 2 | The wait starts at an unsafe point | A return is lost, or a file is half written | Define the safe points in the skill. Section 4. |
| 3 | The wake-up message is lost | The run stops with no message | `RESUME.md` is on the disk. Run `orc resume`. |
| 4 | The user waits 3 hours for a 4-minute wave | The wait costs more than the work | Show the wave size beside the wait time. |
| 5 | `/orc-wait reset` uses an old reading | You wait after the window already reset | Check after each hop. Stop early when the exit code is 0. |
| 6 | A lane runs `/orc-wait` for itself | ORC waits, and you did not ask | Command entry only. Rule 4. |
| 7 | The user forgets that a wait is active | The terminal looks dead | Print the end time in every hop message. |

---

## 13. My opinion

This is a good addition, and it is the piece to build first.

It is smaller than the automatic gate. It needs no reading, so it cannot be
blind. It uses your eyes, which are better than a 30-minute-old file. And it
proves the wait engine before you connect a threshold to it.

The one thing you must get right is section 4. A wait that starts in the middle
of a dispatch loses work. That is worse than the problem you are solving.
