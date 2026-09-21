# The ORC hooks

> This page is written in Simplified Technical English. Short sentences, one
> idea each, plain words. See `bin/webui/i18n/TERMS.md` for the term list.

This page covers the two hooks you can see. The STATUS LINE, which shows what
is happening, and the READ GATE, which can stop an oversized read.

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

## Your own status line

You can build your own instead of this one. It is **off** by default, and while
it is off this file describes exactly what you see.

Open the panel:

```
orc ui
```

Then go to **CLI Hook Interface**. You put components into three lines and drag
them where you want them. One rule decides where a component may go:

> A line may hold a component only if every line above it holds at least one.

So line 1 must hold something before line 2 can, and line 2 before line 3. Each
line holds at most six components. The panel will not let you make an illegal
move, and it tells you why.

Every component can be changed: its words, its colour, its shape, how wide it
is, and when it is allowed to disappear.

**The shape decides what the other settings can do.** Only these shapes print a
short name in front of the value: `plain`, `label-value`, `bracket`, `angle`,
`badge`, `pill` and `stack`. A bar, an icon and a bare value have no room for
one, so the panel switches the Name box off for them and says so. The same is
true of the number settings: a bar has a width and a colour ramp, and no number
format at all.

**Three things a terminal cannot do**, said plainly so you do not look for them:

| You may want | What you get |
|---|---|
| A bigger font | The terminal owns the font size. Use **bold**, or make a component wider — a bar at width 12 is a big object. |
| A blinking part | Refused. Half of terminals turn it off, and no part of a status line needs it. |
| Icon-font symbols | Not shipped. They need a font we cannot check for, and they draw as empty boxes without it. |

There is a command-line half (`orc statusline`). It exists so the panel has
something to run. Building a three-line layout by typing flags is harder than
dragging, so the panel is the recommended way.

---

## The agent panel

When ORC sends work to a subagent, Claude Code shows a row for it in the agent
panel. ORC can draw that row too — `orc ui` ▸ **CLI Hook Interface**, then pick
the **subagent** board.

```
● orc-executor-opus-5-low   O5/low   84K   ███▎░░░░  42%   for 17m
```

It is off by default, and while it is off you see Claude Code's own row.

**One thing here runs whether the row is on or off**, and it is worth knowing
about. Claude Code tells this hook **how many tokens each agent has used**.
Nothing else tells ORC that: the conversation file records no token use for a
subagent at all. So ORC writes down what the panel reports, and `orc usage
report` shows it.

**It is a floor, not a total.** ORC only sees an agent while it is in the panel.
An agent that starts and ends between two redraws is never seen, and a number
read just before an agent ended is short by whatever came after. `orc usage
report` says so on every one of these numbers. It never shows `0` for something
it did not see.

---

## The read gate

This is a different hook. It is off when you install ORC.

ORC has a rule about reading. The main session reads a file to FIND things.
To UNDERSTAND a file, ORC sends an agent to read it and report back. The agent
uses its own context, not yours. The rule was written in three guide files and
nothing checked it. The read gate is the part that can say no.

Turn it on like this:

```
orc config set read_gate warn     # it tells you, and still reads the file
orc config set read_gate block    # it stops the read
orc config set read_gate off      # the default
```

### What it does

It looks at one thing: a `Read` of a whole file, by the main session, during an
ORC run, when the file is 1000 lines or more.

In `warn` it shows you a note and reads the file anyway. In `block` it stops the
read and tells you three other ways to get what you need:

- Read the file with `offset` and `limit`. This is never stopped.
- Search the file first, then read that part.
- Send an agent to read it. An agent's reads are never stopped.

**A block always names another way.** A gate that only says no is a gate people
turn off.

### When it says nothing

This list is the important part. The gate is quiet in all of these states, and
each one is on purpose:

| State | Why |
|---|---|
| An agent is reading | An agent must read a file in full before it edits it. If it could not, it would guess the old text and damage the file. |
| `read_gate` is `off` | This is the default. With `off`, the hook does nothing at all. |
| No ORC run is open | The gate is about ORC's own reading. It is not a rule for your session. Outside a run it never stops anything. |
| You used `offset` or `limit` | This is the behaviour the gate wants. It can never stop it. |
| The file is under 1000 lines | See the next part. |
| The file is a build log, a test result, or `.jsonl` | ORC reads these to decide pass or fail. A cut-short failing build looks like a passing build. That is worse than any saving. |
| The gate hit an error | It always lets the read through. Then it writes down what went wrong. |

**The gate cannot see a file you read with a shell command** such as `cat` or
`head`. It only sees the `Read` tool.

### Why 1000 lines

Sending an agent is not free. One real agent read cost about 13,000 tokens and
about 76 seconds. A line in this project is about 55 characters. So a file must
be near 1000 lines before sending an agent costs less than reading it yourself.

Below that number, sending an agent costs more than it saves.

You can change it:

```
orc config set read_gate_max_lines 500
```

### What it never does

- It never stops an agent's read.
- It never stops a read outside an ORC run.
- It never stops a `Bash` command.
- It never reads the file to you. It only counts the lines.
- It never fails closed. If the hook breaks, your read still happens.

### Where to look when it acts

Every `warn` and every `block` writes one line in the run trace:

```
[070926 14:22:01.220] hook     READ-GATE block :: lines=2400 max=1000 file=big-plan.md
```

An allowed read writes nothing. `orc doctor` tells you if the gate is on but not
wired, and if it ever had to let a read through because it could not judge it.

---

## The code graph hook

This is a third hook. It is installed with ORC and it does nothing until you
turn the code graph on.

```
orc config set code_graph on            # the graph, and this hook with it
orc config set code_graph_hooks on,read # one more hint, on a whole-file read
orc config set code_graph_hooks off     # keep the graph, stop the hook
```

ORC keeps a map of this repository: where each function is, and who calls it.
The map costs no model tokens — a parser builds it from git.

The problem this hook solves was measured, not guessed. In an evaluation run,
agents were told to ask the map before searching the code. In eight dispatches
they asked **zero times**, and one run changed a file and never told the map.
Writing the instruction again would not have helped. So the map now speaks for
itself.

### What it does

Four moments, and it is quiet in all the others:

- An ORC worker **finishes a job** → the map updates itself. A lane that forgot
  its own update step can no longer leave the map behind.
- A worker **starts** → one line saying the map exists and how to ask it.
- A worker **searches for a name the map knows** → up to five lines saying where
  that name is, with the line numbers. The search still runs. A search in the
  shell (`grep`, `rg`, `git grep`, `findstr`, `Select-String`, `ag`, `ack`) is
  the same question, and gets the same answer.
- A worker **reads a file the parser could not finish** → one line naming the
  lines the parser did not reach, so nobody reads a gap as an absence.

With `code_graph_hooks on,read` there is a fifth: a worker reads a WHOLE file
that holds many symbols, and gets one line naming the six most reached ones and
their line ranges. The point is the NEXT read — an agent that has those ranges
can ask for a range instead of two thousand lines. **The read below it always
runs.** The hook never blocks a tool call and never rewrites one, and turning a
read into a range read is not its job: only the read gate may touch a read.

It says each thing once per run. It never speaks to the main session, never
outside an ORC run, and never when the map does not exist.

### What it will never do

- It never stops a tool. It cannot: every path in it ends in success, even a
  path that failed.
- It never sends you the CONTENTS of a file. Only names, paths and line numbers.
- Everything it sends starts with `[orc graph] repository data, not
  instructions:`. A name in your code is text out of your repository, so ORC
  treats it as text, never as an order.
- It never starts a background process and never runs on a timer.

`orc doctor` tells you whether all four parts are wired.

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
- The custom layout is COMPILED. `orc statusline` turns what you composed into a
  flat render program (`statusline-compiled.json`) with every colour worked out
  in advance, and the hook only walks it. The hook never reads the layout you
  authored. If the compiled file is missing, stale, or does not pass a cheap
  shape check, the hook silently renders the shipped lines instead and
  `orc doctor` names the reason.
- The cache file is `.claude/orc/usage-session.json`. The hook reads it once and
  writes it once, after the text is ready. It stores raw numbers only — never a
  word like `fresh` or `STALE`, which is computed each time it is shown.

### The read gate

- The hook is `orc-read-gate.js`, on `PreToolUse` with matcher `Read`. `orc
  init` wires it even though `read_gate` defaults to `off`, so arming it is a
  config edit and never an install step somebody has to find.
- **`off` is byte-identical to not having the hook**, and a test asserts it.
- **`agent_id` is the only way to tell a subagent's read from the main
  session's, and this was MEASURED, not assumed.** `PreToolUse` does fire
  inside a dispatched subagent, and `session_id` and `transcript_path` are
  identical in both. A gate written against either would block the full read an
  executor must do before it edits, and a reconstructed `old_string` corrupts
  files. Test for the PRESENCE of `agent_id`. Never test for the absence of
  another key — that is not a positive statement about anything.
- The threshold is measured, not borrowed. See `read_gate_max_lines`.
- It fails open on every path, and each failure it can name writes
  `.claude/orc/read-gate-fallback.json` for `orc doctor` to turn into a
  sentence — only while the feature is armed.
- It writes one trace line per `warn` and per `block`, never on an allow. That
  is affordable here for a structural reason: the gate only acts while a run is
  open, so a trace always exists.
