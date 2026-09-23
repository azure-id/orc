# The usage gate — how it runs

> Written in Simplified Technical English (ASD-STE100 in spirit, not in
> certification). Every command, config key, state word, model id and path is a
> value the CLI computes. These values keep their exact spelling.

This page explains a design. Nothing on this page is built yet.

---

## 1. The problem

Claude Code knows how much of your 5-hour window you used. It also knows how
much of your 7-day window you used. It sends both numbers to the statusline
hook.

The hook shows the numbers. Then the hook exits. Nothing saves the numbers.

The result: ORC starts a wave, and ORC does not know that the window is almost
full. The wave stops in the middle. You lose the work in that wave.

---

## 2. The four parts

The design has four parts. Each part is small. Each part is useful alone.

| # | Part | Where | Cost |
|---|---|---|---|
| 1 | Save the numbers | `templates/hooks/orc-statusline.js` | free |
| 2 | Read the numbers | `orc usage check --json` | free |
| 3 | Ask before you spend | the lane spines | free |
| 4 | Wait for the reset | a background command | free |

Part 4 is optional. Parts 1 to 3 are useful without it.

---

### Part 1 — save the numbers

The statusline hook already reads `rate_limits.five_hour` and
`rate_limits.seven_day`. Today the hook shows them and forgets them.

Add one write. The hook writes `.claude/orc/usage.json`:

```json
{
  "five_hour":  { "used_percentage": 94, "resets_at": 1788201000 },
  "seven_day":  { "used_percentage": 41, "resets_at": 1788600000 },
  "written_at": 1788194280000
}
```

Three rules for this file:

1. Save the raw numbers only. Never save a word such as `LOW`.
2. If the write fails, do nothing. The statusline must always show a line.
3. The file is run state. Do not commit it.

Rule 1 is important. A saved state word is wrong one minute later. The CLI
computes the state on each read.

---

### Part 2 — read the numbers

One command reads the file. No skill reads the file itself.

```
orc usage check --json
```

The command returns one object and one exit code:

| Exit | State | Meaning |
|---|---|---|
| 0 | `ok` | You have enough quota. Continue. |
| 1 | `low` | You are at the limit or below it. Stop or wait. |
| 2 | `unknown` | There is no number to read. Continue. |

Exit 2 has three causes. The file does not exist. The file is older than 30
minutes. Your Claude Code is older than v2.1.80.

Exit 2 never stops a run. An absent number is not a low number.

---

### Part 3 — ask before you spend

A skill cannot hold a timer. A skill can only check at a step. This is better,
because the useful step is the step before the money.

| Lane | Where it checks |
|---|---|
| `/orc` | before each wave, at the pause it already makes |
| `/orc-mini` | before the one executor |
| `/orc-fast` | before the one executor |
| `/orc-ultra` | before each judge gate |
| `/orc-quick` | at the agent gate, where you already read a menu |
| `/orc-doc` | before each write wave |

The lane runs `orc usage check --json`. Then the lane obeys the exit code.

A hook can also do this. `templates/hooks/orc-effort-guard.js` already blocks a
tool call. A second hook can block a dispatch in the same way. A hook is
stronger, because the model cannot forget a hook.

---

### Part 4 — wait for the reset

This part is optional. Set `usage_gate: wait` to enable it.

The lane does not sleep. A background command sleeps. The background command
uses no tokens and no model.

The lane waits in short steps. Each step is 30 minutes or less.

```
1. Run orc usage check --json.
2. If the exit code is 0, dispatch the wave. Stop here.
3. Write RESUME.md.
4. Read resets_at. Compute the seconds that remain.
5. Set hop = the smaller of 30 minutes and the remaining time.
6. Run a detached command that waits for hop seconds.
7. The command ends. The harness starts the session again.
8. Go to step 1. Do this 5 times maximum.
```

Step 3 is the most important step. Write `RESUME.md` **before** you wait.

Reason: the wake-up message is a Claude Code behaviour. ORC cannot promise it.
The user can close the terminal. The computer can sleep. If `RESUME.md` is on
the disk, a lost wake-up message costs nothing. The user runs `orc resume`.

Short steps have a second benefit. Each wake-up is session activity. Session
activity makes the statusline run again. So each new reading is fresh.

---

## 3. Mocked example A — a full `/orc` run

The user runs a build with 6 waves. The window is almost full.

```
$ /orc add rate limiting to the public API

  ── Phase 1 · preflight ─────────────────────────────────
  wiki:     FRESH (12 docs)
  pattern:  node cached
  usage:    5h 71% · wk 38% · gate at 90%
  extra:    off

  ...

  ── Wave 2 of 6 · 3 tasks ───────────────────────────────
  usage:    5h 88% (2h11m) · below the gate · continue
  DISPATCH  orc-executor-opus-5-med    task 4
  DISPATCH  orc-executor-sonnet-5-high task 5
  DISPATCH  orc-executor-sonnet-5-high task 6
  RETURN    3 of 3 ok
  VERIFY    build green · tests green

  ── Wave 3 of 6 · 2 tasks ───────────────────────────────
  usage:    5h 94% (1h47m) · at the gate

  ⛔ There is not enough quota for wave 3.
     5-hour window: 94% used. 6% remains.
     The window resets in 1h47m, at 18:41.

     I wrote the hand-back:
     .claude/orc/run/rate-limit-api/RESUME.md

     Where it stands:  /orc · phase 4 · wave 3 of 6

     Choose one:
       1. Wait for the reset. I check again every 30 minutes.
       2. Stop now. Run `orc resume rate-limit-api` after 18:41.
       3. Use a lower band for this wave. Tasks 7 and 8 score 61 and 58.
       4. Send this wave off Claude. `orc extra` has 1 ready connection.
       5. Continue now. The wave can stop in the middle.
```

The user chooses 1. The lane waits.

```
     I wait. Hop 1 of 4. 30 minutes.
     This uses no tokens. Press Ctrl+C to stop.

  [30 minutes later — the session starts again]

     usage: 5h 96% (1h15m) · still at the gate
     I wait. Hop 2 of 4. 30 minutes.

  [30 minutes later]

     usage: 5h 97% (44m) · still at the gate
     I wait. Hop 3 of 4. 44 minutes.

  [44 minutes later]

     usage: 5h 11% (4h58m) · the window reset
     ✅ Continue.

  ── Wave 3 of 6 · 2 tasks ───────────────────────────────
  DISPATCH  orc-executor-opus-5-med    task 7
  ...
```

Read hop 3 again. The lane waited 44 minutes, not 30 minutes. The remaining
time was smaller than the hop. So the lane used the remaining time.

---

## 4. Mocked example B — `/orc-quick`

`/orc-quick` asks you which agent to dispatch. The gate adds one line to that
same question. You do not read a second message.

```
  Entry 4 · fix the null check in cart.js

  usage: 5h 91% (38m) · at the gate

  Which agent do you want?
    1. orc-executor-sonnet-5-high   (the usual choice here)
    2. orc-executor-haiku-4-5       (cheaper, and enough for a null check)
    3. extra:deepseek/…             (off Claude, and it does not use the window)
    4. Wait 38m for the reset. Then ask me again.
```

The gate does not choose. `/orc-quick` never chooses an agent for you.

---

## 5. Mocked example C — there is no number

```
  ── Wave 2 of 6 · 3 tasks ───────────────────────────────
  usage:    unknown (no reading in the last 30 minutes) · continue
  DISPATCH  orc-executor-opus-5-med    task 4
```

The run continues. The line still prints. You always know what ORC knew.

---

## 6. What the design does NOT do

- It does not dispatch an agent to wait. An agent uses your 5-hour window.
- It does not use Python. ORC uses Node, and Node is already a requirement.
- It does not use a timer. A skill cannot hold a timer.
- It does not save a state word. The CLI computes the state on each read.
- It does not wait as a default. You must set `usage_gate: wait`.
- It does not block on `unknown`. An absent number is not a low number.

---

## 7. The two new config keys

| Key | Values | Default | What it does |
|---|---|---|---|
| `usage_gate` | `off` `warn` `stop` `wait` | `warn` | what happens at the gate |
| `usage_stop_pct` | 1 to 50 | `10` | the percent that must remain |

`warn` shows the line and continues. `stop` writes `RESUME.md` and stops.
`wait` writes `RESUME.md`, waits, and then continues.

There is no key for the hop length. There is no key for the maximum number of
hops. A wait that you can make infinite is a session that never comes back.
