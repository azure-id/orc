# Building your own status line

> The full reference for `orc ui` ▸ **CLI Hook Interface**, added in v1.3.0.
> The short version lives in the [README](../README.md#changelog); the
> user-facing explanation of the *built-in* line is
> [`templates/hooks/README.md`](../templates/hooks/README.md), which ships into
> `.claude/hooks/` beside the hook it describes.

ORC's status line is two hardcoded lines. This makes it yours: three lines, each
holding one to five parts you choose, each drawn in a shape you pick and styled
the way you want.

**It is off until you enable it, and while it is off the bar is byte-for-byte
what it always was.**

---

## 1. Start here

```
orc ui
```

Then open **CLI Hook Interface**. Everything below is on that one page.

There is a command-line half too — `orc statusline` — but it exists so the panel
has something to run. Building a three-line layout by typing flags is harder
than dragging one, and `orc statusline --help` says so on its first line.

---

## 2. The board, and the one rule

Three lines. Each holds **at most five** parts.

> **A line may hold a part only if every line above it holds at least one.**

So line 1 must have something before line 2 can, and line 2 before line 3. The
panel will not let you break this: an illegal line is drawn hatched and disabled
with the reason on it. You are never allowed to do the wrong thing and then told
off for it.

**A group counts as one.** Wrap two to four parts into one visual object and it
takes one slot — the limit is about how much a line *says*, and a group says one
thing. Groups do not nest, and a group never spans two lines.

**Three parts do not count at all**: a spacer, a divider and a fill are
punctuation, not information.

---

## 3. Everything you can put on it

128 parts, in eight groups. `orc statusline components` lists them all with what
each costs to read.

| Group | What is in it |
|---|---|
| Session and tier | the verdict, the model, the effort, the context window, the project |
| Quota and spend | both usage windows, session cost in dollars, tokens, burn rate |
| Run state | the running lane and phase, agents, duration, waves, the animated mark |
| Cache health | whether the prompt cache is warm, its hit ratio, what a rebuild would cost |
| Session mode | Claude Code's version, vim mode, thinking, fast mode |
| Project and VCS | the branch, the repo, the PR, lines added and removed |
| Knowledge | the wiki's age, whether a code pattern is cached, linked peers |
| Static | your own text, a clock, a divider, a right-align fill |

### What each part costs

| Cost | Means |
|---|---|
| `free` | it is already in the data Claude Code hands the hook |
| `scan` | it rides in the one reading ORC already does every five seconds |
| `new read` | it opens a small file of its own, on its own clock |
| `refused` | ORC will not do it, and the row says why |

**Eight parts are refused**, and the reason is always a measurement. A `git
status` takes 53 ms; the hook has about 15 ms of room. Three wiki numbers would
need a git walk *per document*. `orc doctor` is a whole program. Every one of
those rows still appears in the list, with its reason — because *"we decided
against this"* and *"we forgot"* must not look the same.

**A part that cannot be worked out shows `—`, never `0`.** A zero would say the
thing was measured and found empty.

---

## 4. Shapes

Every part offers the shapes that make sense for it. The panel draws each one
with **that part's real value**, so you are choosing between pictures rather
than between words.

| Family | Examples |
|---|---|
| Text | `47%` · `context 47%` · `CONTEXT: 47%` · `[CONTEXT 47%]` · `⟪CTX⟫47%` |
| Proportion | `47% [\|\|\|\|\|·····]` · `█████░░░░░` · `████▊     ` · `▮▮▮▮▮▯▯▯▯▯` · `●●●●●○○○○○` · `◕` |
| State | a different **shape** per state, an icon, or the state word |
| History | a sparkline, a direction arrow, a change since last time |
| Motion | the animated mark |

A proportion shape is only offered where the value has a real maximum. A bar
over a number with no ceiling is a lie, and ORC refuses to draw one.

---

## 5. Colour

Two colours per part — one for its name, one for its value — plus a background.
Dim name, bright value is what most bars actually want, and one colour cannot
say it.

- **Named colours come first** (`red`, `bright-cyan`, …) because they follow
  *your* terminal theme, and ORC does not know your background.
- **Hex** is behind Custom, for exact control.
- **Colour by value** (a *ramp*) picks the colour from the number: green →
  amber → red for anything where high is bad, and the reverse where high is
  good. You can move the points where it changes.

**A colour can say something.** Parts with states — the verdict, the wiki's age,
the cache — carry meaning in their colour. Setting a fixed colour turns that off,
and the panel says so at the moment you pick it. A green ⛔ is a status line that
lies.

---

## 6. Three things a terminal cannot do

Said plainly, because a picker that does nothing is worse than no picker.

| You may want | What there is instead |
|---|---|
| **A bigger font** | Your terminal owns the font size and no program can change it. **Bold** is the closest thing to bigger and **dim** to smaller. To make a part *visually* bigger, give it more cells: a bar at width 12 is a large object. |
| **Blinking** | Refused. Half of terminals disable it and no state on a status line deserves it. |
| **Icon-font symbols** | Not shipped. They need a font ORC cannot check for, and without it they draw as empty boxes. Put one in a `text` part if you have one and want to own that choice. |

---

## 7. When a part is allowed to disappear

**By default nothing disappears.** `ucs 0%` and "this build has no ucs part" are
different facts and must not look the same.

You can change that per part, and the conditions are a **checklist** — tick as
many as you want:

`empty` · `zero` · `unknown` · `healthy` · `no run` · `narrow terminal`

`healthy` is the one that makes a dense layout liveable: eleven health parts set
to hide while healthy take up no room at all until one of them has something to
say. The trade is real, and the panel states it — a part that can vanish has an
absence that means two things.

---

## 8. A narrow terminal

Each part carries the width range in which it is worth its cells, and a **drop
order** from 1 to 5. When the line does not fit, `1` goes first.

This is better than cutting off the right-hand end, because **you** choose what
survives rather than losing whatever happened to be last.

---

## 9. Ready-made layouts

| Preset | What it is |
|---|---|
| `orc-default` | today's two lines, exactly |
| `minimal` | one line, four parts, dimmed |
| `cost-watch` | what this session is spending, in every free unit |
| `run-watch` | what ORC is doing, promoted to line 1 |
| `knowledge` | almost always empty — a part appearing IS the signal |
| `cache-watch` | the prompt-cache block |
| `mono` | no colour at all: shapes and weight only |

**Applying one replaces your whole layout**, so it always asks first and names
what you lose.

`mono` is worth knowing about for two reasons: it is the right layout for a
screenshot, and multi-line status lines with heavy colour are the configuration
most likely to render oddly in an unusual terminal. If yours misbehaves, `mono`
is the answer.

---

## 10. Why it is fast

A composed layout can be **faster** than the built-in one.

The hook has about 15 milliseconds. Claude Code redraws the status line every
300 ms at most and **stops a script that is still running**, and simply starting
`node` takes about 285 ms of that on Windows.

So ORC does the thinking in advance. When you save a layout it is *compiled*
into a flat list of drawing instructions with every colour already worked out;
the hook walks that list and decides nothing. It also records which readings
your layout needs — and reads nothing else.

Measured, cold, on the same machine:

| | built-in lines | a composed `minimal` |
|---|---|---|
| render | 346.7 ms | **298.2 ms** |

300 ms is the line at which Claude Code gives up. That is the whole difference.

---

## 11. If something goes wrong

The hook can never refuse, so it falls back — silently, to the built-in lines —
and writes down why. `orc doctor` turns that into a sentence:

| Finding | Means |
|---|---|
| `statusline-layout-invalid` | the layout does not pass its own rules |
| `statusline-layout-unreadable` | the compiled layout is missing or stale |
| `statusline-layout-orphaned` | your layout names a part this ORC version no longer has |

**An orphaned part is reported, never repaired for you.** Which part replaces a
retired one is your decision, not ORC's.

All three appear only while the feature is enabled. A layout you built and never
enabled is a draft, not a problem.

---

## 12. The commands, if you want them

```
orc statusline components          every part, with its cost and its shapes
orc statusline show                your layout, resolved
orc statusline preview [--width N] what it will look like, in all four forms
orc statusline explain <line>:<pos>  where every setting on one part came from
orc statusline validate            exit 0 valid, 1 not — and it names each problem
orc statusline set <line> <pos> <part> [--render …] [--color …] …
orc statusline move <line>:<pos> <line>:<pos>
orc statusline remove <line>:<pos>
orc statusline group <line>:<pos> <line>:<pos> [...]   two to four as one object
orc statusline expand <line>:<pos>                     back into its parts
orc statusline clone <line>:<pos>
orc statusline presets | apply <name> | reset | compile
```

`explain` is the one worth knowing about: after a theme change it tells you
which of your own settings are still yours.

Turn the whole thing on and off with:

```
orc config set statusline_custom on
```

The switch refuses while the layout does not validate, and names the reason.
Enabled with nothing saved is not a state.

---

## 13. The second board — one row per agent (v1.4.0)

Claude Code draws a row for every subagent in the agent panel. ORC can draw that
row too. Open the same panel and switch to **One row per agent**.

```
● orc-executor-opus-5-low   O5/low   84K   ███▎░░░░  42%   for 17m
✓ orc-reviewer-opus-5-med   O5/med   31K   █▌░░░░░░  16%   for  4m
```

Everything above still applies — the same shapes, the same colours, the same
editor, the same preview. Three things differ:

1. **A row is one line.** Claude Code renders one per agent, so there is no
   second or third line and no rule about filling one before another.
2. **The parts are about ONE AGENT**: its name, what it is running at, its
   status, its own context window, how long it has been going, and how many
   tokens it has used. A part from the status line cannot go here, and the
   panel says so if you try.
3. **It is a separate switch** — `subagent_line_custom` — so you can have one
   board on and the other off.

### The number that was missing

ORC has never been able to tell you what a subagent cost. The conversation file
records no token use for one at all, so `orc usage report` has said `tokens:
null` and explained why.

**The agent panel reports one.** So ORC writes down what it is handed, and
`orc usage report` shows it.

**It is a floor, not a total.** ORC only sees an agent while it is in the panel.
An agent that starts and finishes between two redraws is never seen, and a
number read just before an agent ended is short by whatever came after. Every
one of these numbers says so, and a number ORC did not see reads `not-seen` —
**never `0`**, which would mean the work was free.

**This part runs whether the row is on or off.** It is not part of the display:
it is a measurement Claude Code hands over either way, and throwing it out
because a display setting is off would be the wrong trade. `orc init` and
`orc update` wire it for that reason, and never replace a `subagentStatusLine`
you already have.

### Presets

| Preset | What it is |
|---|---|
| `agent-default` | what the agent is, what it runs at, and what it has cost |
| `agent-watch` | status, its own context window, and the clock |
| `agent-tier` | the model and effort ORC actually got, per agent |

```
orc statusline apply agent-default --board subagent
orc config set subagent_line_custom on
```

Every command above takes `--board subagent`. Without it you are editing the
status line, and a preset from the wrong board is refused by name with the flag
that would have worked.
