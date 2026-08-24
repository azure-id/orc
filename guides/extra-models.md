# Running ORC work on another AI model

> `orc extra` — the provider-by-provider setup detail that would bloat the
> README. For what the subsystem IS and why it is shaped this way, see
> `knowledge.md` §4z.15. For the panel, open `orc ui` ▸ **Extra**.

ORC scores every task and picks the cheapest capable Claude model for it. This
lets you point a **band of that score ladder** at somewhere else — DeepSeek, Z.ai
(GLM), Moonshot (Kimi), MiniMax, Qwen, Xiaomi MiMo, StepFun, SiliconFlow,
OpenRouter, a local Ollama, any endpoint you name, or an agentic CLI you already
have installed.

**ORC's own session never moves.** Only the task slice does. The orchestrator,
the planner, the reviewer and the verifier stay where they are unless you name
them explicitly in `extra_roles`.

---

## The five minutes

```bash
orc extra providers                     # what ORC knows how to reach, and its date
orc extra tools                         # ...and which of them are programs you must install
orc extra add cheap --provider deepseek --engine api --env-key DEEPSEEK_API_KEY
orc extra ping cheap                    # THE GATE. Nothing routes until this passes
orc extra route set 0-30 cheap/deepseek-chat
orc config set extra_enabled true       # nothing is armed until you do this
orc extra route                         # the whole ladder, including what stays on Claude
```

Then run a lane as usual. Every armed run prints an `extra:` line at Phase 1,
before wave 1, naming how many tasks will cross the boundary and where they go.

### Undoing it

```bash
orc config set extra_enabled false      # everything falls back to Claude, instantly
orc extra route rm 0-30                 # or drop one band
orc extra remove cheap --reason "…"     # or the whole connection (a reason is required)
```

---

## Choosing an engine

| engine | what it runs | pick it when |
|---|---|---|
| `api` | ORC's own tool loop against an OpenAI-compatible endpoint | you want the **file fence** or a **privacy policy** — this is the only engine that composes the request body, so it is the only one that can enforce either |
| `claude-shim` | a nested `claude -p` pointed at the provider's `/anthropic` base | you want the highest tool fidelity for the least setup — it is Claude Code's own agent loop, driven by somebody else's model |
| `cli` | an agentic CLI you already have (`opencode`, `codex`) | you already trust that tool, or you want to attach to a server it is running. **These are programs on your machine** — see *Tools that live on this machine* below |

**The asymmetry matters and ORC never hides it.** On `api`, a task's
`declared_files` is a RULE the loop enforces. On the other two it is an
INSTRUCTION in the prompt, and a return that says the fence held is reported as a
warning rather than a pass — a constraint that was never applied is never
reported as kept.

Not sure? Start with `claude-shim` if your provider publishes an `/anthropic`
base (most in the catalog do), and switch to `api` the day you want the fence.

---

## Tools that live on this machine

Two of the things ORC can hand work to are not websites — they are programs
installed on your own computer. That means one thing no endpoint ever does:
**it can simply not be there.**

```bash
orc extra tools            # what is installed, what version, signed in, how many models
```

Four states, and each one has exactly one next thing to do:

| state | what it means | what to do |
|---|---|---|
| `absent` | the program is not on your PATH | install it (below) — `orc extra add` will refuse until you do, and it names the command |
| `outdated` | older than the version ORC knows how to drive | the same install, as an upgrade |
| `unauthenticated` | installed, but no sign-in ORC can see | `orc extra keyhelp <profile>` says what it takes |
| `ready` | version, sign-in, and a live model list | connect, or test |

One of the two has a route that needs no install at all — an ordinary endpoint
serving the same models, reachable with a key. The other does not, and ORC says
so plainly rather than leaving you looking for one.

### Letting ORC run the install

```bash
orc extra install <provider>       # opens a terminal window and runs it there
```

**It runs in YOUR terminal, not in the background.** A global install can ask for
a password, hit a permissions error, pull 80 MB or take a minute — and inside a
hidden process all four look the same: nothing happened. So you get a real
window, with the command printed on screen before it runs, which you can read,
scroll and stop with Ctrl-C.

**ORC never asks for administrator rights.** If your package manager needs them,
you will see it ask, in your own window, and it is your call. If no terminal can
be opened at all — over SSH, or on a locked-down machine — you get the command to
paste and nothing pretends otherwise.

Come back and press *Check again* (or re-run `orc extra tools`) when it is done.
ORC stores no "installing" state, because you might close the window and that
flag would be a lie from then on.

### ORC never touches the tool's own sign-in

Your key stays in ORC's vault or in your own environment variable, and ORC hands
it to the program for each run. Nothing global changes, revoking it in ORC
actually revokes it, and if you already signed that tool in yourself, ORC leaves
it completely alone — say so with `--tool-auth` and ORC will not ask you for a
key at all.

```bash
orc extra keyhelp <profile>        # which of three routes applies, and why
```

---

## The credential

Three sources, and **the right one depends on who already holds the key**:

```bash
# 1. an environment variable your OS already protects   ← recommended
orc extra add cheap --provider deepseek --engine api --env-key DEEPSEEK_API_KEY

# 2. the encrypted vault, for people who would rather not manage variables
orc extra add cheap --provider deepseek --engine api --key-stdin
printf '%s\n%s\n' "$KEY" "$PASSPHRASE" | orc extra ping cheap --key-stdin

# 3. the tool signs itself in and holds its own key   ← engine `cli` only
orc extra add local --provider opencode --engine cli --cli opencode --tool-auth
```

**If `orc extra tools` says a program is signed in, use option 3.** It needs no
key from ORC, no variable, no vault and no deadline — and ORC never writes
another tool's credential store. The connect form in `orc ui` offers all three,
and pre-selects this one when the tool you pressed Connect on is already signed
in.

There is deliberately **no `--key <value>`**. argv is world-readable in a process
list and lands in shell history, so ORC refuses that flag by name.

### If you use the vault, read this once

- The key is encrypted with **your passphrase plus a per-machine pepper**. ORC
  does not store the passphrase and **cannot recover it**.
- The key is stored **only after a connection test passes**. A failed test leaves
  nothing behind — not the key, not even the profile.
- **Ten wrong attempts and ORC deletes the stored key on purpose.** The profile,
  its routes and its cached model names survive; you paste a new key.
- The counter stops someone at your keyboard. It does **not** stop someone who
  copies the vault file and tries offline — scrypt's cost is the only defence
  there, which is why unlocking takes a moment and why that must never be "sped
  up".

```bash
orc extra unlock cheap                    # prove the passphrase (the key is never printed)
orc extra rekey cheap                     # change it (needs the old one)
orc extra ping cheap --passphrase-stdin   # re-test a stored key
```

`extra_unlock` decides when you are asked. `per-run` (the default) asks ONCE at
the Phase-1 stop the lane already has; `per-dispatch` asks every time and
**refuses to start an unattended wave**, naming why.

### Save the passphrase, with a deadline

Without this, a vaulted key needs the passphrase every single time — and a run
that cannot get it announces a fallback to Claude and carries on. That is safe,
and it is also a decision being made for you.

```bash
printf '%s\n' "$PASSPHRASE" | orc extra session cheap --save --ttl 30
orc extra session                       # every connection, and when each deadline falls
orc extra session cheap --forget        # delete it now
orc extra preflight                     # the gate that runs before wave 1
```

**Say the honest part out loud, because it is the whole shape of the feature:**
a passphrase stored on the same machine as the vault it opens is **not a second
factor any more — it is a deadline**. While it is saved, anything that can run
as you on this computer can open the connection. The deadline is what limits
that.

One thing it does keep, and it is real: the passphrase is cached **in the
project** and encrypted under a key that lives in **your home directory**, so
**copying the project folder to another computer opens nothing**.

- Deadlines are a closed set: **1 · 3 · 7 · 14 · 30 · 90 · 180 · 360 days.** There is
  no `0` and no "forever" — "forever" is the option that makes every other one
  pointless. `extra_passphrase_ttl_days` (default 30) is only what the picker
  opens on; the deadline is stored per connection.
- **Using it does not extend it.** A deadline that renews itself is not a
  deadline.
- **When it runs out, the next run STOPS.** It does not fall back to Claude:
  `extra_on_failure` is about an endpoint that failed, and this is a deadline you
  set yourself. The stored key is deleted and the connection is marked expired
  — **but your routing rows survive**, so re-connecting is one step, not a
  rebuild.
- `--passphrase <value>` does not exist, for the same reason `--key <value>` does
  not.

---

## Model names

**ORC ships no model ids, ever.** They change within a quarter and they change
silently — a stale one is a 404 in the middle of a wave. `orc extra ping` reads
the live list from the provider and caches it:

```bash
orc extra models cheap        # what the last ping actually saw
```

A route may name a model outside that list — ORC's cache is not the authority on
somebody else's catalogue — but it becomes an `orc extra doctor` finding rather
than a surprise later.

### A model on the list is not a model that works

This one costs people real time, so it is worth the paragraph. A model list is
what the provider **offers**. An id can be on that list and still be dead: it
answers *"model is unavailable"* the moment you actually call it. That has been
seen on a live provider, with an id its own list returned.

There is exactly one way to tell those apart:

```bash
orc extra models cheap --refresh              # re-read the live list
orc extra models cheap --test <model-id>      # actually call it. THIS costs money
orc extra ping cheap --live                   # or test the whole connection for real
```

`--live` sends one short fixed message and shows you the round trip, the reply,
and what it cost — split into four token counts that are never added together.

**A real message through a local tool is not a cheap test.** The tool loads its
own instructions and tool definitions before it sends anything, so one short
message costs thousands of words of input rather than a handful. ORC says which
of the two you are about to spend before you press the button.

**Neither local tool tells you which model actually answered.** So if one quietly
served you something else, nothing here can detect it — ORC prints that sentence
rather than leaving the field blank, because a blank reads as "all fine".

### Providers with regions

`moonshot`, `minimax` and `qwen` serve different base URLs per region:

```bash
orc extra add kimi --provider moonshot --engine api --region cn --env-key MOONSHOT_API_KEY
```

`orc extra providers --json` lists every region a provider declares.

### A provider ORC has never heard of

```bash
orc extra add mine --provider custom --engine api \
  --base-url https://api.example.com/v1 --env-key MY_KEY
```

`custom` is the escape hatch that keeps the catalog from being a gate. You supply
the base URL; everything else works the same.

### A local model

```bash
orc extra add local --provider ollama --engine api --base-url http://localhost:11434
```

Nothing leaves your machine at all. Note that Ollama's Anthropic-compatible
surface rejects an `x-api-key` header, which is why the catalog names the auth
variable rather than a header — ORC sends whichever one that variable implies.

---

## Deciding which bands to route

```bash
orc extra route                 # the whole 0→100 ladder, foreign rows and Claude rows
orc extra resolve 42            # what a task scoring 42 would actually get, and why
```

**A gap is not a hole — it is Claude.** The table is printed with the Claude
fall-through split at the Claude ladder's own edges, so "I left the hard work on
Claude on purpose" and "there is no band up there" can never look the same.

A sane starting shape is the bottom of the ladder only: the tasks ORC already
scores as mechanical are the ones where a cheaper model costs you least when it
is wrong. Then read `orc extra stats` after a few runs and move the line.

Rows may not overlap — ORC refuses one that would, and names the `route rm` that
clears it. Rows do **not** have to tile.

### A band is not the same thing as a lane

```bash
orc extra lanes                 # which lane each band actually governs
```

`/orc` scores every task, so a row covering `[40,55)` applies score by score.
**`/orc-fast` does not work that way**: it pins ONE executor, so ORC resolves
that agent's band at **both edges** and requires them to agree. One edge foreign
and the other not — the lane stays on Claude, and `orc extra lanes` names the row
that covered only part of it. A row covering three scores out of fifteen should
not capture a whole lane.

Some lanes never route at all, whatever the table says: `/orc-quick` asks which
agent before every dispatch, and `/orc-challenge`'s lenses are measuring
instruments. **A lane the list does not mention does not route foreign** —
absence is a no, not an omission.

`/orc-doc` is its own case: it is a per-document switch, because a document's
voice is the deliverable.

```bash
orc doc extra <slug> --set writer   # off | writer | checker | both  (default off)
```

---

## What never leaves Claude, whatever the table says

- A task whose plan cites a **`risk[]`** (auth, money, migration, security,
  concurrency, data-integrity) — `extra_risk_tasks`, default `off`.
- A task in an area a **boundary card marks REFUSE** — in `warn` mode as well as
  `block`. A REFUSE is by construction an area where ORC cannot verify its own
  output, so it is the last work that should go to the worker with the weakest
  fence.
- Everything `extra_roles` does not name. The default is `executor` only.
- `/orc-challenge`'s lenses, always. Swapping a lens for a different model does
  not make the lane cheaper — it changes what is being measured, invisibly.

---

## What it cost

```bash
orc extra stats               # per profile per band: outcomes, tokens, usd
orc extra rates               # which provider/model pairs have a price
```

Four token kinds are reported separately and **never blended**: fresh input,
cache write, cache read (usually the largest count and about a tenth of the
price) and output.

**ORC ships no prices.** Several of these vendors price by peak window or by
tier, one sells a subscription rather than tokens, and one is a passthrough with
a surcharge — a shipped figure wrong by 2× is worse than none, because a wrong
figure gets believed. `orc extra rates` prints the JSON to paste into your own
price table:

```bash
orc config set budget_price_table ~/my-prices.json   # so `orc update` never overwrites it
```

Until a pair has a rate, `usd` reads as an em dash. That is the honest answer,
not a zero.

Three things only these stats can tell you, and they are different questions:

- **SUBSTITUTION** — you did not get the model you asked for.
- **REROUTE** — you got the model and a different company served it.
- **FALLBACK** — it did not work and Claude finished the job.

---

## When it goes wrong

```bash
orc extra doctor              # every finding, with the reason
orc extra conform cheap       # measure the shim: streams, tool round trip, cache_control
orc extra privacy router --zdr on --data-collection deny   # engine `api` only
```

`extra_on_failure` decides what an unreachable endpoint, a 401, a timeout or a
malformed return does. `fallback` (the default) re-dispatches the task to the
Claude band it would have had, **announced**, and the run continues. `stop` is
for people who would rather stop than silently start paying Anthropic rates. A
failed foreign dispatch is never a dead run either way.

Two findings have **no fix** and say so rather than offering one that cannot
work: a missing install pepper (the stored key is unrecoverable) and managed
settings that pin a login method (engine `claude-shim` cannot coexist with a
third-party credential — switch that profile to `api`).

### When it stops half-way

A worker that is cut off mid-write has already changed files on your disk. ORC
records what those files looked like **before** the dispatch started, so it can
tell you what changed rather than starting the task again on top of it.

```bash
orc extra reconcile T-2                        # free. What changed, and whose fault it was
orc extra resume-slice T-2 --out .orc/T-2.json # the continuation slice
orc extra dispatch --task .orc/T-2.json --json # the ordinary bridge
orc extra journal list                         # what was recorded, and what never came back
```

`orc extra reconcile` is **free and deterministic** — no model, no tokens — and
it answers with one of five states: `resumable`, `nothing-to-resume`,
`no-journal`, `complete`, or `in-flight` (which is a refusal: two workers on one
file is worse than one lost worker).

It also says **whose fault it was**, and that decides what happens next:

| verdict | what you do |
|---|---|
| `provider` | send it to Claude instead — that works |
| `network` | **fix your connection.** A Claude fallback would fail too, so ORC holds the wave rather than paying for a second failure |
| `local` | something on this machine — a missing program, a disk error |
| `worker` | the model ran out of turns or gave up. The band or the turn cap is wrong |
| `orc` | an ORC bug, and ORC says so |

ORC tells `provider` and `network` apart by making **one cheap request with no
key attached**, with a three-second limit. Any answer at all — even a rejection —
proves the wire is up.

A resume **never widens the file list, never changes what "done" means, never
changes the score, and refuses if the plan changed** between attempts. A
non-retryable failure still goes to Claude — but as a *resume* slice, so the
replacement is told what is already on disk instead of landing on it blind.

**Nothing resumes on its own.** A dispatch that never reported back at all is
reported before your next wave and left alone until you decide.

| key | default | what it does |
|---|---|---|
| `extra_resume` | `on` | Continue a stopped dispatch instead of re-doing it. On by default, because off is the broken behaviour |
| `extra_resume_max` | `2` | Resume attempts per task before the fallback takes over, with an honest report rather than a silent third loop |

---

## The part worth reading twice

What leaves your machine is the task slice: your request, the contents of the
files that task names, the tool results the worker asks for, and the code it
writes back. Who receives it is the provider you configured, at the base URL on
its profile — nobody else is in the path and ORC adds no telemetry of its own.

What ORC **cannot** promise is how long that provider keeps your prompt, whether
it trains on it, or where in the world it runs. Those are their terms, not ORC's.
`orc extra providers --json` carries the link to each one, and reading it is your
call to make.
