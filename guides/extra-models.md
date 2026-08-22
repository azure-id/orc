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
| `cli` | an agentic CLI you already have (`opencode`, `codex`) | you already trust that tool, or you want to attach to a server it is running |

**The asymmetry matters and ORC never hides it.** On `api`, a task's
`declared_files` is a RULE the loop enforces. On the other two it is an
INSTRUCTION in the prompt, and a return that says the fence held is reported as a
warning rather than a pass — a constraint that was never applied is never
reported as kept.

Not sure? Start with `claude-shim` if your provider publishes an `/anthropic`
base (most in the catalog do), and switch to `api` the day you want the fence.

---

## The credential

Two sources, and **the first one is recommended**:

```bash
# 1. an environment variable your OS already protects   ← recommended
orc extra add cheap --provider deepseek --engine api --env-key DEEPSEEK_API_KEY

# 2. the encrypted vault, for people who would rather not manage variables
orc extra add cheap --provider deepseek --engine api --key-stdin
printf '%s\n%s\n' "$KEY" "$PASSPHRASE" | orc extra ping cheap --key-stdin
```

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
