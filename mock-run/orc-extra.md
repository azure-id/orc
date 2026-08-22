# Mock run — `orc extra`

> Run some of ORC's work on a different AI model, and still know exactly what
> left your machine. DeepSeek, GLM, Kimi, a model on your own laptop, or any
> endpoint you name.

---

## 1. What it does

ORC gives every task a score, from 0 to 100, for how hard it is. Then it picks
the cheapest Claude model that can still do it. A tiny rename does not need the
biggest model.

`orc extra` adds one step. You can say: **"this part of the ladder should run
somewhere else."**

```
score   0 ──────── 30 ──────── 55 ──────── 100
        └ DeepSeek ┘└─────── Claude ───────┘
          (yours)      (unchanged)
```

Three things stay true, always:

| | |
|---|---|
| **ORC itself never moves** | Only the task is sent away. The planning, the reviewing and the checking stay where they are. |
| **Nothing happens until you say so** | It is off by default, and a connection you have not tested can never be used. |
| **You are always told** | Every run that will send work away prints a line saying so, **before** the work starts. |

---

## 2. Setting one up

Six commands. The comments say why each one exists.

```bash
$ orc extra providers
```

> ```
> ORC · extra — 14 providers (catalog dated 2026-08-22)
>
>   deepseek     DeepSeek                api · claude-shim
>   zai          Z.ai (GLM)              api · claude-shim
>   moonshot     Moonshot (Kimi)  [cn]   api · claude-shim
>   ollama       Ollama (local)          api · claude-shim
>   opencode     OpenCode                cli
>   codex        Codex                   cli
>   custom       Custom endpoint         api · claude-shim · cli
>
>   Model ids are NOT shipped — they rot within a quarter.
> ```

**Why no model names?** A model name that ships in a package is wrong within a
few months, and wrong quietly. It would break in the middle of your work. ORC
asks the provider for the real list instead, in a moment.

```bash
$ orc extra add cheap --provider deepseek --engine api --env-key DEEPSEEK_API_KEY
```

> ```
> Added profile cheap  →  .claude/orc/extra.json
>
>   provider     deepseek  DeepSeek
>   engine       api
>   base url     https://api.deepseek.com
>   credential   env DEEPSEEK_API_KEY
>   verified     no — nothing routes to an unverified profile
>
>   Next:  orc extra ping cheap
>
>   A profile does nothing until a route points at it. Nothing has changed
>   about how this repo builds yet.
> ```

**Note what it stored: the NAME of an environment variable, not your key.** ORC
never asks for the key itself here, and it refuses a `--key` flag on purpose —
anything you type on a command line is visible to other programs and is saved in
your shell history.

```bash
$ orc extra ping cheap
```

> ```
> ✅ cheap verified via models  412ms
>    https://api.deepseek.com
>
>    2 models: deepseek-chat, deepseek-reasoner
> ```

This is **the gate**. Nothing can be routed to a connection that has never
answered. It also costs nothing: asking a provider for its list of models is a
free request, and no model runs. Only if that list is unavailable does ORC send
one tiny request instead — and it tells you which of the two actually answered.

```bash
$ orc extra route set 0-30 cheap/deepseek-chat
$ orc config set extra_enabled true
$ orc extra route
```

> ```
> ORC · extra — the routing table
>
>   [0,30)     cheap/deepseek-chat     api · VERIFIED
>   [30,40)    orc-executor-sonnet-4-6-med          claude
>   [40,55)    orc-executor-sonnet-4-6-high         claude
>   [55,65)    orc-executor-sonnet-5-high           claude
>   [65,70)    orc-executor-opus-4-7-med            claude
>   [70,80)    orc-executor-opus-4-7-high           claude
>   [80,90)    orc-executor-opus-4-8-high           claude
>   [90,100]   orc-executor-opus-5-high             claude
>
>   A gap is not a hole — it is Claude, and it is printed so "I left the top band
>   on Opus on purpose" and "there is no top band" can never look the same.
> ```

**Read that last line twice.** Everything you did not route is still shown, with
the exact model it will use. You never have to remember what you left alone.

---

## 2b. When the provider is a program on your computer

Two of these are not websites. They are tools you install, and a tool can simply
not be there — so ORC checks first, every time, and never remembers the answer.

```bash
$ orc extra tools
```

> ```
> ORC · extra — local tools (catalog dated 2026-08-22)
>
>   opencode  ✔ ready
>   binary     /usr/local/bin/opencode
>   version    1.17.4
>   floor      1.10.0
>   signed in  yes
>   models     19
>
>   codex  ✖ absent
>     `codex` is not on PATH. Install it with:
>       npm i -g @openai/codex   (npm)
>       brew install --cask codex   (brew)
>     or run: orc extra install codex   — opens a terminal and runs it there
>     there is no install-free alternative for this one — the install is the only route.
> ```

**Two things worth noticing.** The exact install command comes from ORC's dated
catalog, not from memory — the common mistake here installs a completely
unrelated package that has been sitting on npm since 2012. And the last line is
not padding: one of these two tools *can* be used without installing anything,
and this one cannot. ORC says which, rather than leaving you looking.

If you try to connect anyway, it stops you before you have a broken connection
rather than after:

```bash
$ orc extra add cx --provider codex --engine cli --env-key OPENAI_API_KEY
```

> ```
> ❌ "codex" is a program that runs on this machine, and `codex` is not on PATH.
>    Install it:  npm i -g @openai/codex
>    or run:      orc extra install codex   (opens a terminal and runs it there)
>    There is no install-free alternative for this one; the install is the only route.
> ```

### Letting ORC install it

```bash
$ orc extra install codex
```

> ```
> ┌──────────────────────────────────────────────┐
> │ ORC will run this in YOUR terminal:          │
> │                                              │
> │   npm i -g @openai/codex                     │
> │                                              │
> │ then check it with: codex --version          │
> └──────────────────────────────────────────────┘
>
>   ✔ a terminal window opened — come back and press Re-check when it finishes
> ```

A window opens with the command printed in it before it runs. You can read it,
scroll it, and stop it with Ctrl-C. **ORC never asks for administrator rights** —
if the install needs them you will see it ask, in your own window, and that is
yours to decide. If no window can be opened at all, you get the command to paste
and nothing pretends it worked.

### Testing it properly

A connection to a program is not one question, it is five, and ORC keeps them
apart:

```bash
$ orc extra ping oc
```

> ```
> ✔ oc verified via cli-models
>   /usr/local/bin/opencode
>
>   19 models: opencode/big-pickle, opencode-go/glm-5, opencode-go/kimi-k2.6, …
>
>   ⚠ a model being LISTED is not a model that WORKS — a listed id can be dead
>     upstream. `orc extra models oc --test <id>` is the only thing that tells
>     those two apart.
> ```

That warning is not boilerplate. A model can be on the provider's own list and
still fail the moment you call it:

```bash
$ orc extra models oc --test opencode/deepseek-v4-flash-free
```

> ```
>   ✖ opencode/deepseek-v4-flash-free — model_not_found
>   Upstream request failed: Model is unavailable. (400)
> ```

And when one does work, you see what came back and what it cost:

```bash
$ orc extra ping oc --live
```

> ```
> ✔ oc verified via cli-live   14733ms
>
>   reply: OK
>   new input 131 · written to cache 0 · read from cache 15616 · output 14
>
>   ⚠ this tool does not say which model answered, so if it quietly used a
>     different one there is no way to tell from here.
> ```

**Read the cache number again.** A one-line message cost fifteen thousand words
of input, because the tool loads its own instructions before it sends anything.
That is why sending a real message is a separate button with its own warning,
and why the free checks above are the ones that run by default.

---

## 3. A run, with it on

```
> /orc build the CSV export
```

> ```
> ── ORC · preflight ───────────────────────────────────────────
> wiki:      FRESH (3 commits behind)
> pattern:   javascript — cached
> extra:     ON — 2 of 6 tasks foreign · cheap/deepseek-chat via api [0,30)
> ──────────────────────────────────────────────────────────────
> ```

That `extra:` line is printed **before any work starts**, on every run where the
feature is on. It is not optional and it has no quiet version. Two of the six
tasks will leave this machine; the other four will not.

Then the plan, with one extra column:

> ```
> wave 1
>   T01  add the CSV column headers          score 18   via extra  cheap/deepseek-chat
>   T02  wire the download button            score 24   via extra  cheap/deepseek-chat
>   T03  stream the rows without buffering   score 61   via claude orc-executor-sonnet-5-high
>
> wave 2
>   T04  refund totals in the export         score 46   via claude orc-executor-sonnet-4-6-high
>        ⛔ held on Claude — cited risk: money
> ```

**T04 scored 46, which is not in your foreign band anyway — but even if it had
been, it would have stayed.** A task whose plan cites a risk like money, auth,
security or data loss never leaves Claude. Nor does work in an area you have
marked as one the AI should not attempt.

---

## 4. When it does not work

Say the endpoint is down mid-run:

> ```
> ⚠ T02 foreign dispatch failed (timeout after 900s) — falling back to Claude
>   orc-executor-haiku-4-5 will finish this task. The run continues.
> ```

**A failed foreign dispatch is never a dead run.** It is announced, it falls back
to the Claude model that task would have had, and the wave carries on. If you
would rather stop than quietly start paying full rates, set `extra_on_failure` to
`stop` — but you have to choose that; ORC will not choose it for you.

---

## 5. What it cost

```bash
$ orc extra stats
```

> ```
> ORC · extra stats — .claude/orc/logs
>
>   15 foreign dispatches across 6 traces
>
>   cheap [0,30)          15  done:13 partial:1 fallback:1   api
>       in 214k · cache-w 38k · cache-r 1.9M · out 61k
>       usd 0.41
>
>   glm [30,55)            8  done:5 failed:1 fallback:1     claude-shim
>       in 96k · cache-w 0 · cache-r 0 · out 29k
>       ⚠ from 6/8 dispatches — 2 reported no counts
>       usd —  (no rate for zai in the price table; a figure ORC did not price is never printed)
> ```

Three honest things in that small table:

1. **The four kinds of token are never added together.** Cache reads are usually
   the biggest number and cost about a tenth as much. One blended figure would
   mislead you about which band is actually expensive.
2. **"From 6 of 8 dispatches"** — two of them reported nothing, so the total is
   incomplete and it says so. Averaging the gap away would make an unknown cost
   look like a small one.
3. **`usd —`, not `usd 0.00`.** ORC ships no prices for these providers. Some
   charge different rates at different times of day; one sells a subscription
   instead of tokens. A price that is wrong by double is worse than no price,
   because people believe it. `orc extra rates` prints the exact lines to paste
   once you know your own rate.

---

## 6. The panel

`orc ui` ▸ **Extra** shows the same thing as a picture: one bar from 0 to 100,
green where your own connection runs the work and blue where Claude does. The
ranges you did not route keep their place on the bar, so it never looks like the
top of the ladder disappeared.

You can add a connection and test it there too — the button runs the same
command you would type, and the panel itself never talks to a model.

At the top of that page, always visible, never hidden behind a click:

> **What leaves this machine:** your request, the contents of the files that task
> names, the tool results the worker asks for, and the code it writes back.
>
> **Who receives it:** the provider you configured, at the address on its
> profile. Nobody else is in the path.
>
> **What ORC cannot promise:** how long that provider keeps your prompt, whether
> it trains on it, or where in the world it runs. Those are their terms, not
> ORC's — the catalog links them, and reading them is your call to make.

---

## 7. What to notice

- **Off by default, and untested connections are unusable.** Two locks, not one.
- **You are told before, not after.** The `extra:` line is printed at the start
  of the run, not in the summary.
- **A gap is Claude, and it is drawn.** Nothing about your ladder is invisible.
- **Risky work stays.** Money, auth, security, data loss — and anything in an
  area you marked as off-limits for the AI.
- **A failure falls back and says so.** The run does not die and the cost change
  is not silent.
- **No shipped model names and no shipped prices.** Both go stale, and a stale
  one gets believed.
- **Your key is never on a command line.** It is either an environment variable
  your computer already protects, or it is encrypted here with a passphrase ORC
  does not keep and cannot recover.

---

## 8. Related

- [`/orc`](orc.md) — the full lane this plugs into
- [`/orc-budget`](orc-budget.md) — what a run will cost before you run it
- [`/orc-boundary`](orc-boundary.md) — the areas the AI should not attempt, which
  are also the areas that never go to another model
- `guides/extra-models.md` — the setup detail for every provider
