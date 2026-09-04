# The ORC status line

> This page is written in Simplified Technical English. Short sentences, one
> idea each, plain words. See `bin/webui/i18n/TERMS.md` for the term list.

ORC shows two lines at the bottom of your terminal. Claude Code draws them.
ORC writes them.

Every value comes from a file on your disk or from data Claude Code gives the
hook. No value costs model tokens. Nothing here starts a run.

```
🚀 ORC v1.2.1 - Opus 5/high · context (34%) · 5h 41% (2h13m) ↔ wk 12% · ucs 6% · wiki: fresh
   ▰ status: quick · Q3 DO · agents 7 (2 running) · orc-extra: on · Dur 48m · MTok 412K · main
```

Line 1 answers: **what model am I on, and how much do I have left?**
Line 2 answers: **what is this session doing?**

---

## Line 1

### 1. The icon and `ORC v1.2.1 - Opus 5/high`

The icon is the verdict. The words are the ORC version you have installed and
the model and effort you are running now.

| Icon | Meaning | What to do |
|---|---|---|
| ✅ | Good. This is the base tier. | Nothing. |
| 🚀 | Better than the base tier. | Nothing. |
| ⛔ | ORC will work less well here. | Read the reason in brackets. Change the model or the effort. |

The ⛔ line always gives a reason:

```
⛔ ORC v1.2.1 - Sonnet 5/high (model≠Opus5/Opus4.8/Fable5) · context (34%)
```

If ORC cannot read its own version, it shows `ORC` with no number. It does not
guess.

**This line can only warn you.** A status line cannot stop a command. The
`orc-effort-guard.js` hook is what stops a run at a low effort.

### 2. `context (34%)`

How full the context window is. At 100% Claude Code must compact the session.

### 3. `5h 41% (2h13m) ↔ wk 12%`

Your subscription use. Anthropic sends these numbers; ORC does not estimate
them.

- `5h 41%` — you used 41% of the 5-hour window.
- `(2h13m)` — the 5-hour window resets in 2 hours and 13 minutes.
- `wk 12%` — you used 12% of the 7-day window.

A `⚠` appears at 75%. A `⛔` appears at 90%, and the verdict changes to ⛔.

Older versions of Claude Code do not send these numbers. Then this part is
absent.

### 4. `ucs 6%`

**ucs = usage, current session.** The 5-hour window moved 6% while this session
ran.

Two facts to know:

- The window is for your **whole account**. A second terminal moves it too. So
  `ucs` is what moved, not only what you used here.
- A window reset is not a refund. ORC banks what you used before the reset. The
  count continues.

`ucs 0%` is an answer. It means nothing measurable moved yet.

### 5. Extra parts

These parts appear only when they apply.

| Part | Meaning |
|---|---|
| `wiki: fresh` / `AGING (14c)` / `STALE (52c)` | How old your project wiki is. The number is commits since the scan. |
| `wiki: UNREGISTERED (run \`orc wiki sync\`)` | You have wiki documents, but no index. The fix is free. |
| `diy:my-flow READY` / `STALE→recompile` | Your `/orc-diy` flow. `STALE` means you must run `orc diy compile`. |
| `orc 1.2.2 available` | A newer ORC exists. Run `orc upgrade`. |

---

## Line 2

### 1. `▰ status: quick · Q3 DO`

The lane that is running now, and the phase it is in. The small symbol in front
moves. Each kind of phase has its own symbol.

| Symbol | Kind | The lane is |
|---|---|---|
| `◔ ◑ ◕ ●` | look | reading files and collecting facts |
| `? ¿` | ask | waiting for your answer |
| `▁ ▃ ▅ ▇` | plan | deciding what to do and in what order |
| `▰ ▱` | do | running agents that write code |
| `◇ ◈ ◆` | check | reviewing, verifying or testing |
| `› » ≫` | ship | finishing and handing over |
| `· ˙` | wait | stopped on purpose |
| braille | generic | a phase with no symbol of its own |

**This part can be absent, and that is correct.** ORC shows a phase only when a
file on disk proves it. Two things prove a phase: an agent that ORC dispatched,
or a phase note the run wrote to its trace.

So some phases show nothing:

- a phase that only reads files and asks you a question, for example `Q1 LOOK`
  and `Q2 ASK` in `/orc-quick`;
- a run that stopped more than 10 minutes ago;
- a worker that runs outside Claude (`orc extra`), unless the run wrote a note.

ORC hides the part instead of guessing. A wrong phase is worse than no phase.

**The symbol is not a progress bar.** Claude Code draws the status line when
something happens. So the symbol moves while you type and while ORC works. It
stops when the session is idle. That is true, and it is the design.

To turn the motion off, set `ORC_STATUSLINE_MOTION=0`.
To use plain ASCII symbols, set `ORC_STATUSLINE_ASCII=1`.

### 2. `agents 7 (2 running)`

How many agents this session dispatched, and how many have not returned yet.

`(2 running)` is important. If you see a number here and nothing is happening,
an agent is still working. Do not start the same task again. Run
`orc run inflight` to check.

Two limits:

- ORC counts only agents it dispatched with a name. A quick read that uses no
  named agent is not counted.
- If you continue an agent instead of dispatching a new one, ORC cannot see it.
  So this number is a floor, not a total.

### 3. `orc-extra: on`

`on` means ORC may send some work to a provider that is not Claude. `off` means
all work stays on Claude.

To change it, run `orc config set extra_enabled true` or `false`.

### 4. `Dur 48m`

How long this session has run.

### 5. `MTok 412K`

**MTok = main token.** The tokens your **main session** used. `412K` is 412
thousand.

This is the sum of all four token kinds: new input, cache write, cache read and
output.

**Claude Code does not record tokens for a dispatched agent.** So an hour of
agent work adds almost nothing to this number. `MTok` tells you how much your
own conversation costs. It does not tell you what a run costs.

For the true cost of a run, use `orc usage report` or `/orc-budget`.

`MTok —` means ORC could not measure it. It never shows `0`, because `0` would
say the session was free.

### 6. `main`

The branch you are on. A detached HEAD shows as `@a1b2c3d`.

---

## If a part is missing

| You see | Reason |
|---|---|
| Only one line | The hook could not read your `.claude/orc/` folder. It failed quietly, which is correct: a status line must never break your session. |
| No `status:` | No run is active, or the phase cannot be proved. See above. |
| No branch | This folder is not a Git repository. |
| `MTok —` | ORC could not read the session transcript. |
| No `5h`/`wk` | Your Claude Code version does not send usage numbers. |

---

## For maintainers

- The hook is `orc-statusline.js`. `orc init` installs it and wires it into
  `.claude/settings.json`. It never replaces a status line you already have.
- The phase list is **not** in the hook. `orc init` and `orc update` write it to
  `hooks/orc-lane-rails.json` from the CLI registries. Run `orc lane rails` to
  read it. The hook renders that file and decides nothing about it.
- The hook reads the disk once every 5 seconds and caches the answer, because a
  status line redraws on every keystroke. `MTok` reads only the new bytes of the
  transcript. The wiki part joined that scan in v1.3.0: it used to start a `git`
  process on every redraw.
- `ORC_STATUSLINE_SCAN_MS` is the one seam over that budget. It exists for
  tests. Nothing in ORC sets it.
- **The budget is small.** Claude Code waits 300 ms between redraws and stops a
  script that is still running when the next redraw starts. On Windows, starting
  `node` alone takes about 285 ms of that. So the hook has about 15 ms to do all
  its work. This is why nothing here starts a process, and why every answer is
  cached.
- The cache file is `.claude/orc/usage-session.json`. The hook reads it once and
  writes it once, after the text is ready. It stores raw numbers only — never a
  word like `fresh` or `STALE`, which is computed each time it is shown.
