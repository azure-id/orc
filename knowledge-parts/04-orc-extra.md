# knowledge.md — Part III — `orc extra` (work that runs somewhere else)

**Read: on demand** — read when touching `orc extra`: providers, the vault, the journal, spend, recovery, role slots, or the stall/demotion machinery.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4z.15. `orc extra` — work that runs somewhere else (v0.50.0)

**The thesis.** ORC scores every task and picks the cheapest capable Claude
model for it. `orc extra` extends that one step: a band of the score ladder can
be answered by a **non-Claude worker** — DeepSeek, GLM, Kimi, MiniMax, Qwen, a
local Ollama, an OpenAI-/Anthropic-compatible endpoint you name, or an agentic
CLI like `opencode` or `codex`. The orchestrator itself never moves; only the
task slice does.

**Nothing changes until you arm it.** `extra_enabled` is `false` by default, and
a profile that has never answered a probe can never be routed to. The failure
mode this whole subsystem is shaped around is not a wrong answer — it is **work
leaving your machine without anybody saying so**, which is why every armed run
prints an `extra:` line at Phase 1 before wave 1.

### 4z.15.1 The three files, one writer each

| file | written by | holds |
|---|---|---|
| `bin/providers.json` | the package | the DATED provider catalog: base URLs, the env var each provider reads, regions, docs and terms links. **Never a model id** |
| `.claude/orc/extra.json` | `orc extra` only | your profiles and the route table |
| `.claude/orc/extra-vault.json` | `orc extra` only | AES-256-GCM ciphertext, mode 0600, git-ignored on first `add` |

**The catalog ships PROVIDERS and never MODELS.** A shipped model id is wrong
within a quarter and wrong *silently*: it becomes a 404 in the middle of a wave.
`orc extra ping` reads the live list from the provider and caches it on the
profile; the panel and the CLI both render that cache and neither invents a
name. Catalog staleness (90 days) is COMPUTED on read — the `bin/pricing.json`
rule.

`redactProfile()` is an **allow-list**, so a field added later that carried a
secret would have to be let through on purpose. A test plants a known key and
passphrase and greps every `orc extra … --json` shape, every trace line and
every fixture for both.

### 4z.15.2 The connection gate — and why it is a LADDER

`orc extra ping <profile>` is the gate: **nothing routes to a profile that has
never answered.** Exit 0 verified · 1 unreachable · 2 unknown profile. It climbs
the cheapest rung first and records WHICH ONE ANSWERED, because "verified by a
models list" and "verified by a real completion" are different guarantees and
one green tick for both would be a lie:

1. `GET {base}{models_path}` — free, zero tokens, and it fills `models_seen`;
2. a `max_tokens: 1` completion — a fraction of a cent (`--deep` forces it);
3. `--model <id>` — recorded as `manual`.

**v0.51.0 — rung 1 is not always a credential proof.** A catalog row may carry
`models_public: true`, which says this provider serves its model list WITHOUT a
credential. Verified against a live endpoint: its `/models` answers 200 with no
key at all and 200 with a garbage one, while `/chat/completions` answers 401. On
such a row the free rung would mark a profile **verified with a bogus key**, so
it fills `models_seen` and then falls THROUGH to the paid rung; the free answer
is recorded on `attempts[]` as `models-public` and is never the profile's
verification.

**v0.51.0 — `--live` is a fourth rung on every engine.** It sends a real message
(a FIXED CONSTANT prompt, never task text) and returns the round trip, the reply
excerpt, the model requested, the model reported, and the four token kinds
unblended. It is opt-in everywhere because the cost is not symmetric: an
`api` probe is about ten input tokens, and the same probe through a local
agentic tool is fifteen thousand, because the tool loads its own system prompt
and tool schemas before it sends anything. Both figures are quoted separately,
before the button.

Rung 2 has the property that makes an endpoint with no model list usable at all:
**an error naming an unknown model still proves the URL and the credential,**
because the endpoint authenticated before it rejected the name. That is recorded
as its own weaker `completion-unknown-model`, never as a plain pass.

Two corrections the research forced: there are **two base URLs** (an
OpenAI-shaped one and an `/anthropic` one) and therefore two probes; and Claude
Code's own `claude|anthropic` model-id filter is deliberately NOT copied, with a
comment saying so — it would discard every DeepSeek and GLM id there is. A
redirect is a **failure**: a credential never follows one.

### 4z.15.3 The vault — encrypted at rest, unlocked by a passphrase ORC never stores

AES-256-GCM under `scrypt(pepper + " " + passphrase)`, N = 2^17, a fresh salt per
record and a fresh IV per write. **No verifier hash is stored** — GCM's auth tag
IS the verifier, and a separate hash would hand an offline attacker a cheaper
oracle than the cipher. The `install` pepper (32 random bytes at
`~/.claude/orc/extra-pepper`) is the default; the `shipped` pepper exists only
for portability and **its weakness is printed wherever it is offered**, because a
secret published on npm is not a secret.

**The lifecycle is TEST FIRST, THEN STORE.** A pasted key is held in memory for
the probe and never written before the test is green; a failed test on a
never-verified profile **removes the profile**, so a typo'd key can never rot in
a vault nobody can open. `attempts` is flushed to disk BEFORE the decrypt is
attempted — a counter written after the attempt is a counter you defeat with
Ctrl-C — and the countdown prints EVERY time. At the cap the ciphertext is
overwritten with random bytes and then removed, leaving a tombstone; **the
profile survives**, because routes and `models_seen` are not secrets.

**The honesty this needs, and it is in the panel and the `--help`:** the counter
stops someone at your keyboard. It does not stop someone who copies the file and
tries offline. scrypt's cost is the only defence there — which is why N is a
feature and must never be tuned down for responsiveness.

**v0.50.0 W14 closed the hole this left.** `orc extra ping --passphrase-stdin`
decrypts the stored key into memory for the probe and for nothing else. Without
it a vaulted profile could never be re-verified — the probe needs the key,
`extraCredentialValue` answers `locked` without one, and `orc extra unlock`
proves a passphrase while deliberately never yielding what it unlocked — so
`extra-stale-verify`'s promise of a re-ping before wave 1 was unreachable for
exactly the profiles the vault exists for. The two stdin flags are **refused
together BY NAME**: line 1 would be a key on one reading and a passphrase on the
other. A wrong passphrase spends an attempt on the SAME counter and does NOT
un-verify a profile that already passed — a failed check is not an erased
history.

### 4z.15.4 The routing table, and THE resolver

`orc extra route set <from>-<to> <profile>/<model>` writes a FLAT table. **A gap
is not a hole — it is Claude**, and `orc extra route --json` always carries the
Claude fall-through, split at the resolving Claude table's own edges, so a gap
reads as the agents it actually resolves to. Overlap is REFUSED BY NAME and
names the `route rm` that clears it. Tiling is not required. A row naming an
unverified profile is refused (R10 at the CLI, not only in the panel); a model
outside `models_seen` WARNS but is allowed, because ORC's cache is not the
authority on somebody else's catalogue — it becomes an `extra-model-gone` doctor
finding instead of a mid-wave 404.

`orc extra resolve <score> [--role] [--risk]` is **THE resolver, and there is
exactly one.** Exit 0 = extra, 1 = claude. It always explains itself (`why`),
always carries the Claude answer it displaced (so a fallback needs no second
lookup), and composes the announcement sentence itself so no lane writes a
second wording. Four gates can hold a task back and each names itself: the
master gate, the role gate, the risk gate (which also reports
`would_have_been`), and the overlay miss.

**`bandFor()` was refactored to consult it.** Otherwise `/orc-budget` would
forecast a run at Opus rates that is going to execute on DeepSeek. A foreign
band returns `agent: null`, which is what stops an Anthropic rate being found
for it.

**A fixed-executor lane has no score, so the resolver gets a BAND.** `/orc-mini`,
`/orc-fast` and a `scoring: off` DIY flow pin ONE executor whose NAME already
encodes a band: **resolve both edges and require them to agree.** A row covering
the band only partially keeps the run on Claude and the preflight says which row
it was. The rejected alternative is worth recording — a midpoint would let a row
covering `[55,58)` capture an ENTIRE mini run on the strength of three scores out
of ten, and **a number ORC invented to satisfy an interface is not a routing
decision the user made.**

### 4z.15.5 Three engines, and what each can and cannot promise

| engine | how | the thing only it can do |
|---|---|---|
| `claude-shim` | a nested `claude -p` against the provider's `/anthropic` base | the highest tool fidelity for the least code — it is Claude Code's own agent loop |
| `api` | ORC's own zero-dependency tool loop against an OpenAI-compatible endpoint | **the ONLY engine that composes the request body**, so the only one that can enforce a `declared_files` fence or carry a privacy policy |
| `cli` | an adapter TABLE driving `opencode` / `codex` | reuse a tool the user already trusts, including one attached to a running server |

A nested `claude` MUST run `--bare`, or it loads ORC's own hooks and the effort
guard blocks its own child. It needs **six** model env vars, not one — Claude
Code makes background calls on the `haiku` alias, so a single `ANTHROPIC_MODEL`
404s mid-wave. **Exit code 0 is not success**: `is_error` in the JSON is the
verdict, and `--output-format stream-json` is what lets `system/api_retry`
classify a failure instead of guessing.

**The fence asymmetry is a RULE, not a footnote.** `declared_files` is enforced
on engine `api` and merely instructed on the other two, so a return carrying
`fence: {declared_files: false}` renders as a WARNING and ORC never reports a
constraint that was never applied. Same discipline on ⚠ REROUTE: on
`claude-shim` and `cli`, **zero reroutes is not evidence there were none**, and
an absent measurement is never a pass.

`orc extra conform <profile>` measures the shim against the published gateway
contract — streams, a tool round trip, `cache_control`, the beta fields — and
every failure maps to one of the fallback reasons, so an unusable shim is
discovered by a cheap conformance run rather than in the middle of a wave.

### 4z.15.6 Nine config keys, and a shadow that runs BOTH WAYS

`extra_enabled` · `extra_roles` · `extra_risk_tasks` · `extra_on_failure` ·
`extra_max_concurrent` · `extra_unlock` · `extra_vault_max_attempts` ·
`extra_timeout_s` · `extra_verify_max_days`.

Extra is an **OVERLAY**, not a table, so neither `opus5_only` nor
`rubric_bands_override` is wholly inert or wholly live under it — the only true
statement is WHICH RANGES were taken. `score_table.active` can now read the
composite `extra+opus5_only`, with `base` and `resolve_order` beside it;
`orc config set` announces the shadow in both directions and `config list` grew a
resolve-order footer. **The `orc ui` ladder card branches on `base`, not
`active`**, or it would draw the wrong ladder the moment Extra was armed.

The three timeouts are DERIVED from one key. Left independent, ORC's timeout
never fires first and every stall is reported by whichever child timer happened
to win — so the user tunes a number that does nothing. Ordered once: idle < api
< wall.

### 4z.15.7 The payload — one canonical contract, and every lane's stance

`templates/skills/_shared/extra-dispatch.md` is the canonical file: the
three-engine capability table, the resolver's return shape, the lane routing
table, the bridge's five exit codes, the return-contract delta and the fallback
procedure. It **points at `return-validation.md` §2b rather than restating it** —
a second copy in a `_shared/` file is the exact fork the `_shared/` rule exists
to prevent.

The `/orc` spine takes it in FOUR seams: the subsystem header (gate + pointer +
`ONE resolver, and it is not you`), the Phase-1 resolve/announce joining the
probe block its five neighbours already occupy, the Phase-2 `via` column plus
the cited-risk hold-back, and the Phase-3 transport switch (Bash, not the Task
tool) with §2b-instead-of-§2 on the return. Budget 494 → 528, recorded with the
justification — and the first draft was +57 lines because it restated three
things that already had one canonical home. **Raise a spine budget LAST.**

Every other lane states its stance in exactly one place: `/orc-mini` and
`/orc-fast` one paragraph each beside their pinned agent; `/orc-diy` a real
compile half (flow key `extra`, `blocks/extra.md`, the `DIY_STEPS` row, the
`order` entry, the documented stitch order) that decides WHETHER while the
resolver still decides WHERE; `/orc-quick` INERT at the dispatch gate;
`/orc-wiki` scanner-only and opt-in; `/orc-doc` writer and checker only, with
the sections going off Claude NAMED before the wave, because a document's VOICE
is the deliverable; `/orc-challenge` **never** — swapping a lens for a different
model does not make the lane cheaper, **it changes what is being measured**, and
invisibly, because the verdict comes back in the same shape either way.

**A foreign return is FOREIGN** (`_shared/untrusted-input.md`), and it is the
ONLY foreign class that EDITS the worktree — which is why everything it says
about what it did is a CLAIM checked against the worktree rather than believed.
It is also the first foreign class HOST source travels *to*, and that direction
is governed by the mandatory announcement, not by trust rules.

**Two hard hold-backs sit beside the resolver, and neither is a second
resolver:** a cited `risk[]` (`extra_risk_tasks`, default `off`) and a **REFUSE
boundary area**, which holds in `warn` as well as `block`. `block` decides
whether ORC should attempt the task; `warn` records that the user accepted that
risk — **neither asked whether the work should leave the machine.** A REFUSE is
by construction an area where ORC cannot verify its own output, so handing
exactly that work to the executor with the weakest fence compounds the condition
the card was written about.

### 4z.15.8 The trace, the stats, and the price that is never guessed

A new `EXTRA` verb, `via=extra:` tails on the dispatch lines, and a foreign
section in the return contract. `orc extra stats` joins them by **profile AND
band** — the pair a routing decision is made in, because a per-provider total
cannot tell you the `[0,30)` row was fine and the `[30,70)` row was a false
economy.

Three facts that are only visible here, and each is a different question:
**SUBSTITUTION** (you did not get the model you asked for), **REROUTE** (you got
the model and a different company served it), **FALLBACK** (it did not work and
Claude finished the job). `tok=none`, `cache_write: 0` and `usage: null` are
three different facts and are never normalised together, in any renderer.

**`bin/pricing.json` ships every `providers.*.models` map EMPTY on purpose.**
Several of these vendors price by peak window or by tier, one sells a
subscription rather than tokens, and one is a passthrough with a surcharge — and
a shipped figure wrong by 2× is worse than none, because a wrong figure gets
believed. `orc extra rates` prints the JSON to paste; `usd` reads as an em dash
until a user supplies a rate. **A cost figure ORC did not price itself is never
printed.**

### 4z.15.9 The panel — `orc ui ▸ Extra`

Rail entry **Extra**, `#/extra`, key `e`, above Flow. It renders
`orc extra … --json` and **names no provider, no model and no agent** — a test
greps the panel file and both string tables for every one of them.

**The boundary card renders ALWAYS**, never behind a hover or a fold: what
leaves this machine, who receives it, what ORC cannot promise about it, and
which engine each profile is on. The connect modal offers only what the catalog
row allows and every refusal is the CLI's own validator speaking. The save modal
opens **only on a green test** and names the self-destruct BEFORE the passphrase
fields.

The rail is a single 0→100 axis. **An unmapped range keeps its slot** and is
drawn in Claude's colour with the agent it resolves to — filtering the gaps out
would make "I left the top band on Opus on purpose" and "there is no top band"
identical. Geometry is solved from the box: a segment is `var(--w)` of the axis
with a readable floor, so a rail too narrow for its labels SCROLLS and is never
squeezed. Staging a change previews it — and **a staged un-route draws an em
dash rather than guessing which Claude agent the range would land on**, because
that is `claudeGaps`'s answer and this panel does not know it.

Writes are staged and batched; every entry is an ACTION, which is what lets one
bar carry a routing change and a guardrail change together. The nine config keys
render through the SHARED `settingRow`/`controlFor`, so adding a tenth is still
zero steps in the panel. The cost card reuses `docTokenBar` — four token kinds,
never blended — and a band nothing joins reads `—`, never `0`, and keeps its
slot.

**D1, the boundary decision.** `CLAUDE.md`'s `orc ui` P0 said the panel "never
calls the Anthropic API". It is narrowed, not broken: the panel never runs a lane
and never does agentic model work; the ONE model-shaped thing it can trigger is a
**connectivity probe**, and even that is `node bin/cli.js extra ping --json` in a
subprocess, so the HTTPS call is the CLI's and every validator, redaction and
exit code comes for free. A probe is a DIAGNOSTIC, the family `orc doctor` is in.

### 4z.15.10 What v0.50.0 deliberately did NOT do

- **No orchestrator on a foreign model.** ORC's own session stays on a
  first-party credential. This routes WORKERS, not the conductor.
- **No `extra-vault-locked` doctor finding.** It is a DISPATCH-TIME state
  (`ORC_EXTRA_KEY` in the bridge's env), and a doctor finding would report a
  disk state that says nothing about whether a wave can run. It landed in the
  LANE instead, as the Phase-1 three-outcome resolution.
- **No route rows baked into `flow.lock.json`.** The score table is clipped to
  the session tier and is therefore a compile-time fact; a route row is a ledger
  the user edits independently, and `diyStatus`'s triggers cannot see it — baked
  rows would go stale in silence. The reasoning is recorded in the `DIY_META`
  comment so nobody "fixes" it later.
- **No shipped model ids and no shipped prices.** Both rot, and both get
  believed.
- **No `--key <value>` anywhere.** argv is world-readable in a process list and
  lands in shell history. The CLI refuses it BY NAME.
- **No password recovery, no hint, no escrow, no OS keychain.** The first three
  are a second door into the vault; the fourth is a native dependency on every
  platform, and the zero-dependency rule is not negotiable.

### 4z.15.11 Some providers are a LOCAL TOOL (v0.51.0)

A catalog row that carries `cli_bin` has no URL: its only surface is a program
on this machine, and a program can simply **not be there**. v0.50.0 surfaced that
as an `extra-engine-unavailable` doctor finding — a report AFTER the user
already had a profile that could not work — and engine `cli` verified by asking
whether a binary was on PATH, said so honestly, and then had nothing else to
offer. `models_seen` stayed empty forever, so the routing box had no list and
the user hand-typed an id they had to find somewhere else.

**`orc extra tools` is the read, and `state` is a CLOSED SET with one next
action each:** `absent` · `outdated` · `unauthenticated` · `ready`. It is
computed fresh on every read and **never stored** — there is deliberately no
"installing" state, because the user may close the terminal window and a stored
flag would be a lie from that moment on (the `computeWikiFreshness` rule applied
to a binary). Exit 0 when at least one tool is ready, 1 otherwise — the
`pattern status` convention. `orc extra add --provider <that row>` **REFUSES
while it is absent**, naming the install command: the refusal before the profile
rather than the finding after it.

**`no_install_alternative` is an asymmetry made data.** One shipped tool has an
install-free route (an ordinary `api` row serving the same catalogue, reachable
with a key and nothing to install) and the other is CLI-only — there is no
endpoint to point ORC at. `null` **MEANS there is none**, never that ORC forgot
to look, and a renderer must say the difference out loud.

**The engine-`cli` ladder replaces the single check.** Rung 0 refuses when the
binary is absent; `cli-bin` is on PATH and above the version floor; `cli-auth`
is the tool's own credential command; `cli-models` is its own model list;
`cli-live` is a real message. Each is its own `verify_method` — nothing may read
stronger than it is — and `verify_method` is the STRONGEST rung that answered,
with the return naming what the ones above it did not prove. **Every rung runs
with ORC's key in the child's environment**, not only dispatch: a list read
without it is whatever the user happened to log in with rather than what this
profile can reach, and the account-scoped list is the entire point.

**The version floor exists because the flag rename already happened.** One tool
replaced `--auto` with `--dangerously-skip-permissions` and its argument parser
is strict, so an unknown flag prints the help text and exits 1 *before any
network call* — every dispatch on that adapter was failing, and failing while
looking like a model problem. The flag is picked from the PROBED VERSION rather
than hard-coded, an unknown version takes the current flag, and an exit whose
output is the tool's own help text is classified `invalid_request` **by name**.
A version ORC could not parse is `null` / `outdated: false` — blocking on a
guess would make an unusual install method look like a broken one.

**Neither tool reports which model answered.** One has no such field in its event
stream; the other's documented `exec --json` events (`thread.started`,
`turn.started`, `item.completed`, `turn.completed`, `turn.failed`, `error`)
carry the thread, the turn and the usage and nothing else. Both adapters are
`reports_model: false`, and every render prints that sentence rather than leaving
a blank — the ⚠ REROUTE discipline: **zero substitutions is never evidence there
were none.** The usage vectors differ too: one reports four kinds, the other
three (no cache-write count), so `supports.usage_kinds` declares which and the
missing kind reads `null`, never `0`.

**The model flag does not set the compute budget on one of them.** `model` and
`model_reasoning_effort` are independent config keys; naming only the model runs
at whatever that user's config says, falling through to `medium` — a SILENT
DOWNGRADE, the failure class `expect=<model>/<effort>` exists to catch. Every
dispatch and every live probe passes `-c model_reasoning_effort="<effort>"`,
derived from **the Claude agent the route displaced**. That tool coerces an
unsupported level to the nearest supported one *silently*, so ORC records the
effort it REQUESTED and never claims it was honoured.

### 4z.15.12 `orc extra install` opens the USER'S terminal (v0.51.0)

A global install can ask for elevation, hit a permissions error, pull 80 MB or
take forty seconds — and inside a hidden subprocess all four look identical:
*nothing happened*. So the install is neither a silent background job nor a
string to copy: it is a **real terminal window, in the foreground, with the
command on screen before it runs**, which the user can read, scroll and Ctrl-C.

Three properties, all load-bearing: **visible** (the failures are the user's to
see), **theirs** (their shell, their profile, their privileges — **ORC NEVER
ELEVATES**: no `sudo`, no `runas`; a package-manager permission problem is
theirs to see and fix, not something ORC papers over), and **fallback-first**
(the command renders whether or not the launch worked — the `openBrowser` rule).
A launch that could not happen is **exit 0** carrying the command to paste.

**The script file is the design.** ORC does not thread a command string through a
terminal host into a shell into a package manager; that nesting is where
cross-platform launchers break and the quoting is unreadable. It writes a small
script (`0600` / `0700` under `.claude/orc/tmp/`) that echoes the command, runs
it, verifies with `<bin> --version`, and **stays open** — a window that vanishes
on failure is worse than no window. It carries **no credential, ever**.

**ORC never writes another tool's credential store.** `orc extra keyhelp` says
which of three routes applies — `env` (the tool reads a variable, so there is
nothing to set up and ORC injects the key), `stdin-login` (the command is
printed and can be opened in a terminal; **ORC never pipes the key itself**), or
`interactive-login` (the tool always prompts, and ORC says so plainly rather
than pretending to automate it). Consequences: nothing global is mutated, ORC's
vault stays the single source, revoking in ORC actually revokes, and a user who
already ran the tool's own login is untouched. A profile added with
`--tool-auth` has `credential.source: "tool"` and `present: null` — ORC has
nothing to send and nothing is missing, so neither `found` nor `not found` is
the truth.

### 4z.15.13 A LISTED model is not a WORKING model, and the setup gate (v0.51.0)

`orc extra models <profile> --json` returns the whole computed object (the
`--json is not a summary` rule): `entry: "list" | "free-text"` — the CLI's
answer to whether a renderer may draw a dropdown at all — plus one row per model
carrying `id`, `label`, `group` and `name_says_free`. `group` is the CLI's
answer so `glm-5 (opencode-go)` is composed from data a panel was HANDED rather
than by splitting a string it does not own. `name_says_free` is a **NAME HINT
and never a price** — ORC prints no cost figure it did not price itself, so it
says what the id says and claims nothing about billing. `custom` and an empty
list are both `free-text`: a dropdown that cannot contain the answer is worse
than a box.

**`--refresh` re-reads the live list; `--test <id>` is the paid rung scoped to
one model.** The second exists because a live list is what the provider OFFERS
and an id in it can be dead upstream — verified: an id present in a real
`models` listing answered *"Model is unavailable"* with a 400. Only a real call
tells those two apart, and the caveat rides beside every list.

**The setup gate.** Arming `extra_enabled` with nothing verified arms nothing:
every dispatch falls straight back to Claude, so the switch reads ON and means
OFF. `orc config set extra_enabled true` **refuses by name** until one profile
has verified, and names the command that fixes it. `extraConnectedState()` is
the ONE definition, read by that gate, by the `extra-enabled-unverified` doctor
finding, and by `orc extra list --json`'s `gate` — a second idea of "has
anything ever answered" is exactly the drift this subsystem forbids elsewhere.
It carries **two floors** and says which: `no-connection` asks for an install or
a key, `never-tested` asks for a test. Someone with neither must never be shown
a control that cannot succeed. In the panel the gated sections — routing, the
limits, cost, the full catalogue — are **NOT APPENDED**, not hidden and not
disabled: a disabled routing table still teaches somebody to fill it in.

### 4z.15.14 What v0.51.0 deliberately did NOT do

- **No silent background install, and no elevation.** Both would make the one
  act in this subsystem that reaches outside ORC indefensible: visible, theirs,
  never elevated, and always with a paste-it-yourself path — remove any one and
  the argument collapses.
- **No writing another tool's credential store.** The key stays in ORC's vault or
  the user's own variable and is injected into the child. Nothing global is
  mutated and revoking in ORC actually revokes.
- **No `opencode serve` lifecycle management.** ORC joins a running server with
  `--cli-attach`; it does not start or stop one.
- **No writing `~/.codex/config.toml`.** A file outside the project is not ORC's
  to edit, and a credential-bearing one least of all. ORC READS it and reports.
- **No caching of a provider's model metadata into the package.** That is a
  shipped model list by another name, and it would be wrong within a quarter.
- **No new agent and no new lane.** Every command here is a CLI read or a CLI
  write; nothing dispatches a model.
- **No stored "installing" flag.** The user may close the window, and the flag
  would be a lie from that moment on. Every tool state is recomputed on read.
- **No `free: true` on a model row.** A price ORC did not price itself is never
  printed, so the field says what the model's NAME says (`name_says_free`) and
  claims nothing about what you will be billed.

### 4z.15.15 The argv defect that made engine `cli` 100% dead (v0.52.0)

`opencode run` is `run [message..]` with `-f, --file [array]`, and **a yargs
array is GREEDY**: it consumes every following non-flag token. ORC's `argv()`
pushed `-f <taskFile>` and then pushed the instruction message last, so the
message was parsed as a **second file to attach**, the `message..` positional
arrived **empty**, and opencode exited 1 in its own parser before any network
call — `dur=0m01s`, `tok=none`, `outcome=failed`.

That is the exact signature of the `--auto` → `--dangerously-skip-permissions`
defect already documented in the same adapter, and the lesson is the same one
twice: **this tool's argument parser is strict and fails for free, looking
exactly like a model problem.** The fix is a reorder, not a rewrite — the
message first, `-f` LAST where a greedy array has nothing left to eat.
`--file=<path>` was rejected: yargs arrays stay greedy with `=`, so it would
look fixed and not be. `probeArgv()` moved to the same order even though it has
no `-f` today, so the two can never diverge the next time a flag is added.

**Codex is unaffected** (`codex exec [OPTIONS] [PROMPT]`, single-value options,
trailing prompt correct) and that adapter was not touched.

**Why nothing caught it.** `test/cli/_fake-cli.js` asserted `--format`,
`--model`, `--dir` and the permission flag — every flag was present, so every
test was green while the engine was dead. It now parses argv **the way yargs
does** (a greedy `-f`, a `message..` positional) and dies when the message is
empty or when a collected file does not exist. The assertion that matters is
**a message arrived**, not **a flag was passed**.

### 4z.15.16 The credential triangle, and the source that was unreachable

There are three credential sources and `extraAdd` has supported all three since
v0.51.0. The panel offered **two**. So a local tool that reports
`authed: true` — one that holds its own credential and needs **no key from ORC
at all** — was pushed into the vault by the only form that could create it, and
the vault then locked the run at wave 1.

| source | who holds the key | needs a passphrase |
|---|---|---|
| `env` | your OS, in a variable you set | no |
| `vault` | ORC, encrypted at rest | **yes** |
| `tool` | the third-party tool's own store | no |

The form has a third radio now, rendered **only** where it can be true (engine
`cli` on a catalog row with `cli_bin`), hiding both key fields when chosen, and
**pre-selected** when the card the user pressed Connect on says the tool is
already signed in. The panel opens on the state they were already looking at.

`orc extra keyhelp` also grew the per-OS instruction for the `env` case, which
was a real and separate hole: `orc extra list` printed `no key (env
DEEPSEEK_API_KEY)` and nothing anywhere said how to set that variable. It is
**placeholders only** — the CLI never renders a real key into an instruction
string, so nothing can leak into a screenshot, a copy button, a shell history or
argv — and ORC still refuses to run it: `setx NAME <value>` puts the key IN
ARGV, which this subsystem refuses by name, and appending `export NAME="…"`
writes the key in plaintext to a file the vault exists to avoid.

### 4z.15.17 The passphrase is a DEADLINE, and the deadline is a P0 gate

**One honest sentence first, because the whole design follows from it: a
passphrase stored on the same machine as the vault it opens is not a second
factor any more.** It is a **deadline** — the shape of `ssh-agent` and
`gpg-agent`. That is a real and respectable thing to build, and it is a
different promise from the one the vault makes, so it is described as what it is
everywhere it appears.

There is exactly one way to keep real value in it, and this design uses it:

| file | lives | protects against |
|---|---|---|
| `.claude/orc/extra-vault.json` | the project, gitignored | already existed |
| `~/.claude/orc/extra-pepper` | `$HOME`, 0600 | already existed — never travels with the repo |
| `.claude/orc/.orc-ec-session` | the project, gitignored, 0600, **encrypted under the pepper** | a copied repo folder, a backup, a synced drive |

Because the pepper is in `$HOME` and the cache is in the project, **a copy of
the project directory opens nothing.** That is a genuine property, it is worth
saying out loud, and it is why the project is the RIGHT place for the file
rather than a compromise. The filename is **stable and non-obvious, never
random**: a name that changes per write is a file nobody can find to delete, and
"delete it whenever you like" is half the point.

Same crypto as the vault, deliberately — one encryption idea in this subsystem
and not two — and **`N = 2^17` is not tuned down here either. That cost IS the
defence.**

- **The state is COMPUTED on read and never stored** (`ACTIVE` · `EXPIRING` ·
  `EXPIRED` · `ABSENT`). The `computeWikiFreshness` rule and the `/orc-pact`
  rule: a stored status word is a wrong status word the next day. `EXPIRING` is
  the larger of "3 days left" and the last 20% of the TTL, so a 1-day deadline
  is not permanently expiring and a 360-day one warns with more than a weekend.
- **The sweep is MEMOISED per process, and that is load-bearing rather than an
  optimisation.** The sweep destroys the evidence the gate needs: swept and
  never-saved both read `ABSENT` off the disk, and those are different facts —
  one is a deadline you set and missed, the other is a passphrase you never
  saved. The list of what a command's own sweep dropped IS the record that it
  expired. There is deliberately **no timer**: a background process that deletes
  credentials is a background process nobody can audit.
- **`orc extra preflight` is the P0 gate**, before wave 1. `ACTIVE` ok ·
  `EXPIRING` ok **plus the date** · `EXPIRED`/`ABSENT` on a vaulted profile a
  route row names → **STOP**. On a stop the vault record is deleted and the
  profile stamped expired so it can never route again — and **its route rows
  survive**, because the bands are work the user did and re-connecting should be
  one modal rather than rebuilding the routing table.
- **`extra_on_failure` does NOT apply.** That key is about an endpoint that
  FAILED; this is a credential that expired. Merging them would let `fallback`
  quietly defeat the gate. **A deadline you set 30 days ago deserves a stop, not
  a substitution** — and the JSON says so in `on_failure_note`, rather than
  leaving it to be inferred.
- **`extra_passphrase_ttl_days`** (default 30, the closed set
  1 · 3 · 7 · 14 · 30 · 90 · 180 · 360) supplies only the value the picker OPENS
  ON. The deadline is stored **per profile**, because two connections may
  legitimately expire on different days. No `0` and no "forever": "forever" is
  the option that makes every other one pointless.
- **No auto-extend on use.** A deadline that renews itself every time you use it
  is not a deadline; `last_used_at` is recorded for the report and changes
  nothing. **No silent re-cache**: a passphrase typed at a `per-dispatch` prompt
  is used and dropped, because only the save modal asked how long.
- **`extraCredentialValue` is the ONE place the cache is read**, so dispatch,
  ping and conform all get it by asking for the credential and there is no
  second idea of where a passphrase comes from.
- The connect-time modal is **not dismissible** (no Escape handler, no backdrop
  click, a capture-phase Escape swallow — the `.tour-block` precedent) with
  **exactly one** other button, and it is destructive and NAMED rather than a
  Cancel. A modal with genuinely no way out is a trap the first time a write
  fails; an escape that destroys the thing being configured cannot be pressed by
  accident and leaves no half-configured state.
- **Two doctor findings and no more.** `extra-passphrase-expiring` (warn) and
  `extra-passphrase-expired` (bad). There is deliberately **no** finding for
  "you have not saved a passphrase": an `env` or `tool` credential never needs
  one, and a doctor that warns about a normal state is a doctor people learn to
  ignore (the `wiki-debt` rule).

`orc extra dispatch --passphrase-stdin` survives as the un-cached escape hatch
for `extra_unlock: per-dispatch`, where the whole point is that nothing is kept.

### 4z.15.18 Extra was invisible to every surface that is not the Extra panel

Four defects, one theme. The correct behaviour was implemented in every case;
none of it was rendered.

**The lane table is CODE now (`EXTRA_LANE_SHAPES`).** The routing table says
`[40,55) → opencode/big-pickle`, which is true for `/orc` and is **not** how
`/orc-fast` works: that lane pins ONE executor and resolves the band its agent
already encodes, **at both edges, requiring them to agree**. That rule was
written down in `_shared/extra-dispatch.md` and its output appeared in traces
(`edges_resolved=40,54 agreeing=true`) and nowhere a user could read it. `orc
extra lanes [--json]` renders it, computed through the **same** `extraResolveFor`
every dispatch uses, and the constant is registered in `bin/verify-contracts.js`
against the markdown with a golden test comparing the two lists **in both
directions** — the `DIY_STEPS` ↔ stitch-order precedent. **A lane whose shape is
unknown is not listed as `claude`**: absence is a `no`, never an omission to be
interpreted.

`extraAgentBand` matches by the agent name's **model+effort tail** across both
shipped ladders, and that is not a convenience: **an agent's model change is
always a rename in this repo**, so the tail is the authoritative statement of
what it runs on. A tail no shipped row carries returns null, and a lane whose
band cannot be resolved stays on Claude and says so. A number ORC invented to
satisfy an interface is not a routing decision the user made.

**The Flow score table sees Extra.** `diyScoreTable` read `DIY_SCORE_TABLE`
unconditionally and knew nothing about the ledger or `cfg.extra`, so a flow with
`extra: on` drew a run that will not happen. The join already existed and was
already correct (`claudeGaps`); it was never called from here. Three rules, all
inherited: the **tier clip applies to Claude rows and never to a foreign one** (a
session tier is a Claude-model ceiling and means nothing to a third party); a
band that cannot route **keeps its row and names its fall-through** (the
OFF-phase-keeps-its-slot rule); and `extra: off` renders **byte-identically** to
before, because the flow key decides WHETHER and the resolver decides WHERE.
**Rendering only — route rows stay out of `flow.lock.json`**, for the reason
`DIY_META`'s own comment already gives.

**`fixed_executor` can name a foreign target**, spelled
`extra:<profile>/<provider>/<model>` — the same `extra:` prefix every trace line
uses, so there is one spelling of a foreign target in the whole system. The
**option list** is extended and `DIY_EXECUTORS` is not: that map exists to feed
`agentFitsTier`, and a foreign target has no model tier. Only VERIFIED profiles
are offered; `agentFitsTier` is skipped **and the compiled flow says so**,
because a rule silently disabled is worse than no rule; `scoring: off` plus a
foreign executor still requires `extra: on`, refused BY NAME rather than
inferred — two keys, two questions. A stale-but-verified profile compiles; a
DELETED one fails the compile with the profile named.

**`/orc-doc` has its own switch** (`orc doc extra <slug> --set
off|writer|checker|both`, in `doc.json`, one writer, default `off`). The
mechanism existed and was GLOBAL, which is the defect: turning it on for a
throwaway runbook turned it on for the PRD you ship, and **a document's voice is
the deliverable**. Resolution is highest-wins and PRINTED (`doc.json.extra` >
`config.extra_roles` > off), and a document set to `both` while `extra_roles`
names neither role resolves to **off and says so** — a shadowed setting must
never be silent. `orc doc next` names the sections going off Claude **before**
the wave. The blocking sub-fix landed first: `/orc-doc` was **declared** as
routing foreign while being absent from the both-edges rule's own list, so the
lane had no defined way to resolve a band at all.

### 4z.15.19 Three panel defects, and one was in every modal

- **A connected tool still offered Connect.** `exToolBox`'s `ready` branch was
  unconditional and never consulted `d.list.profiles`, which was sitting right
  there — while `exKeyhelpRow` did exactly that lookup, so the panel was
  inconsistent with itself. The join is done **in the CLI** now
  (`connected_profiles` / `connected` / `verified` on every tool row): a second
  idea of "connected" living in `app.js` is precisely the drift this panel
  exists to prevent. The verified card has **no Connect button at all**, not a
  disabled one — the `no_install_alternative: null` rule, that an absent control
  and a dead control must not look the same — and keeps "Add another" as a
  secondary, because a second connection to the same tool with a different model
  map is legitimate.
- **A modal scrolled the page behind it**, in **every** modal in the app; the
  Extra ones are simply the tallest. Two things were missing and neither existed
  anywhere in `bin/webui/`: the modal's own scroll **chained** to `<body>` at
  either end (no `overscroll-behavior`), and a wheel over the backdrop — most of
  the screen — was never the modal's to begin with (no body lock). Fixed with
  `overscroll-behavior: contain` on both, `body.modal-open { overflow: hidden }`,
  and `scrollbar-gutter: stable` on `<html>` so the page does not reflow when the
  scrollbar disappears — cheaper and more robust than the `position: fixed` +
  `top: -Npx` dance, and it needs no saved state. `closeModal` is already the
  single exit, so there is one add and one remove and no path around either.
- **Two tool cards sat at different heights.** `.ex-tool` was a grid with
  **implicit** content-sized rows, so the two cards' `kv` blocks started at the
  same y and ended at different ones, and every row below sat at a different
  height in each card. It declares its rows now, with `1fr` as the slack row
  that absorbs the difference in ONE place, and the one genuinely unbounded field
  (`auth_detail`, which is diagnostic rather than prose) is clamped. **Not
  `subgrid`**: it would align two cards perfectly and break the moment a third
  card in a different state joined the row, and the states deliberately carry
  different numbers of children. The `.run-card` lesson, one level down.

### 4z.15.20 Simplified Technical English, and the rule that makes it safe

The Extra panel's **instruction text** — labels, hints, errors, gates,
countdowns, install and connect steps, and the passphrase modal end to end — is
written in Simplified Technical English: one instruction per sentence, 20 words
maximum, active voice, one word one meaning, the condition before the action.

**Rationale prose keeps its voice** and only gets shorter. Applied mechanically
to the whole table, STE destroys the sentences doing the most work here — *"it
stops someone at your keyboard, not someone who copied the file"*, *"`tok=none`
is a real value; `tok=0/0/0/0` would tell `/orc-budget` the run was free"* — and
flattened they become true and useless.

**The default is STE.** A new key is instruction text unless
`bin/webui/i18n/TERMS.md` names it in its `prose-keys` fence, so opting out is a
deliberate line in a diff somebody reads — the contract-lint table's shape. The
term list ships **first** for a reason: without it a wording pass drifts back
within two releases.

**The rule that is not negotiable, and now has a test: NEVER simplify a
CLI-computed value.** A state word, an exit reason, a doctor message, a config
key, a model id, a path, a band or a command is not prose and is not the panel's
to rewrite. **A simplified state word is a state that does not exist** — the same
failure as a translated config key.

There is **no automated STE checker** and there is not going to be one: a real
one needs the approved dictionary, which is licensed. The test asserts the cheap
half (no sentence over 20 words in the STE set, no banned synonym, no stale
opt-out) and the term list plus review is the rest. A checker that half-works
would be worse than none, because people would trust it.

### 4z.15.21 What v0.52.0 deliberately did NOT do

- **No `setx`, and no writing `~/.zshrc`.** The first puts the key in argv, which
  this subsystem refuses by name; the second writes it in plaintext to a file the
  vault exists to avoid. `keyhelp` prints the command with a placeholder and the
  user runs it themselves.
- **No `--passphrase <value>`.** Same reasoning as `--key <value>`, refused by
  name, so there is no "just pass it in a script" path.
- **No `--ttl 0` and no "forever".** Eight values are the whole set.
- **No auto-extend, no silent re-cache, no sweep on a timer.**
- **No doctor finding for "you have not saved a passphrase".** It is a normal
  state for two of the three credential sources.
- **No route rows in `flow.lock.json`.** D7 is a RENDERING fix. A baked row goes
  stale in silence, and `diyStatus`'s triggers cannot see the ledger.
- **No foreign target in `DIY_EXECUTORS`.** That map exists to feed
  `agentFitsTier` and a foreign target has no model tier; the OPTION list is what
  was extended.
- **No `/orc-doc` default other than off.** A document is the one artifact where
  the model choice is visible in the output.
- **No STE pass on the other panels.** Doing Extra first is right — it is the
  panel that spends money and moves data off the machine — and the rest is
  listed as follow-up rather than half-done.

### 4z.15.22 The schema the provider rejected (v0.53.0)

**Engine `cli` on codex was 100% dead for a release, and `npm test` was green
the whole time.** `EXTRA_CLI_RETURN_SCHEMA` shipped with
`additionalProperties: true` and a two-key `required`. OpenAI structured outputs
require a **CLOSED object at every level** and require `required` to list **every
key in `properties`**, so every codex dispatch was an **HTTP 400 raised before
the model was reached** — fast, free, and reported as something vague. That is
the same signature as the two argv defects above.

Two things worth stating exactly, because a partial fix here looks like a NEW
bug rather than an incomplete one:

- **Flipping only `additionalProperties` is a SECOND 400**, naming
  `files_changed`. An optional field is expressed as a **nullable union**
  (`type: ["array", "null"]`), never by omission from `required`.
- **The shape is PROVIDER-DICTATED, not chosen.** The constant used to be
  documented as "deliberately minimal … a schema that guessed would have to be
  unpicked", and that reasoning is what produced the bug: a permissive floor is
  not on offer on this provider. The comment says so now.

The schema file is also written **only for an adapter that declares
`output_schema`** — opencode never read it, and a shape dictated by one provider
belongs to that provider.

**No downstream contract changed.** `structured_output` is relayed verbatim and
read by a model; the only consumer in `bin/cli.js` is the
`typeof v.status === "string"` guard, which is untouched.

### 4z.15.23 A verdict must not lie about where it came from (v0.53.0)

`extraCliClassify` concatenates stderr + stdout and pattern-matches. The real
`invalid_request_error` sat inside a JSON **string** in stdout while codex
printed the benign `Reading additional input from stdin...` on **stderr**, so
nothing matched: a precisely-diagnosable, non-retryable failure came back as
`unknown`, and `retry: false` was reached **by luck rather than by diagnosis**.
`EXTRA_FAILURES.invalid_request` had existed the whole time.

So the codex adapter gained `classify(events)`, consulted **BEFORE** the stderr
patterns, reading the upstream error object codex relays verbatim — its own
`error.type` / `error.code` / HTTP `status`, which is already the vocabulary
`EXTRA_FAILURES` speaks (`EXTRA_CLI_ERROR_TYPES`). It walks the **failed events
only**, so a `status` field somewhere on the happy path can never be read as an
HTTP code, and returning `null` means "ask the stderr patterns", never "there
was no failure".

**And `classified_from` now says which of the two answered.** It was a hardcoded
string claiming "stderr pattern" unconditionally. A field whose entire job is to
report where a verdict came from must not lie about it.

### 4z.15.24 MEASURED rendered as UNKNOWN — the mirror of unknown-as-zero (v0.53.0)

`extraCliUsageVector` gates each kind on the adapter's declared `usage_kinds`,
and codex declared three. It reports four: `turn.completed.usage` on codex-cli
0.149.0 carries `input_tokens`, `cached_input_tokens`,
**`cache_write_input_tokens`**, `output_tokens` and `reasoning_output_tokens`
(observed on two live turns). So codex reported a real measurement, ORC threw it
away, and then told /orc-budget it had never been reported.

That is the **mirror image** of the failure this subsystem is usually guarding
against. "unknown is not zero" is one half; **"measured is not unknown" is the
other**, and both are lies to the same consumer. Two edits, and either alone
still reads `null`: the adapter's `usage_kinds`, and the `num()` alias list.

**`reasoning_output_tokens` is deliberately NOT read.** The Responses API counts
reasoning tokens **inside** `output_tokens`, so adding them would double-count
and over-price every codex run. That is very likely and was not proven, and **an
unproven pricing change is worse than a missing one.**

### 4z.15.25 A FAKE THAT IS MORE PERMISSIVE THAN THE PROVIDER CERTIFIES THE ADAPTER (v0.53.0)

This is the finding worth keeping, because it is now the **third release in a
row** broken by the identical shape on three different third-party surfaces:

| release | surface | failure |
|---|---|---|
| v0.51.0 | opencode `--auto` renamed | unknown flag → help text → exit 1, before the network |
| v0.52.0 | opencode `-f` greedy yargs array | message swallowed → empty prompt → died in the parser |
| v0.53.0 | codex `--output-schema` | open schema → HTTP 400, before the model |

**A strict third-party parser fails for free, and it looks like a model
problem.** Every time the tell was the same: the dispatch was fast, cost nothing,
and reported something vague.

`test/cli/_fake-cli.js` checked that the schema **existed** and **mentioned
`status`**. It modelled not one of the provider's rules, so the suite was green
while the engine was dead — exactly what v0.52.0 already wrote down one adapter
over. It now rejects what OpenAI rejects: a non-`false` `additionalProperties`
at any level, and any key in `properties` missing from `required`, each by name.

**THE DEFENCE IS THE SAME EVERY TIME: the fake must be at least as strict as the
real thing.** A fake that is more permissive than the provider does not test the
adapter; it certifies it.

### 4z.15.26 A card whose child count changes cannot declare its rows (v0.53.0)

`.ex-tool` declared `grid-template-rows: auto auto auto 1fr auto`. The
v0.52.0 diagnosis behind that was right — `.ex-tool-grid` stretches every card to
the tallest, so the internal rows drifted apart and the `1fr` slack row was
meant to absorb the difference in one place. The **remedy** was wrong:
**FOUR STATES CARRY FOUR DIFFERENT NUMBERS OF CHILDREN.** A ready-and-verified
card has exactly five — head, kv, path, the "connected as" chip, actions — so
the chip landed in the stretch row, a grid item defaults to
`align-self: stretch`, and `border-radius: 999px` on a tall full-width box drew
a ~250px green ellipse. It hit whichever ready card had the **shortest** content
in its row, which is why it looked tool-specific and was not.

The card is a flex column now: the footer is pushed down by the FREE SPACE
rather than by a declared row, and a chip is `align-self: flex-start` because
**a chip states a fact and is never a layout element**. A fifth state cannot
break it.

**Why the test did not catch it.** It asserted `grid-template-rows` was
**present** — which it was, while the panel drew an ellipse. A property-presence
assertion cannot see which child is sitting in the stretch row. It asserts the
behaviour now: no row template on this card, the footer pushed by free space,
and a chip that can never be stretched by its parent.

### 4z.15.27 The Extra panel: five tabs, and ONE band ladder (v0.53.0)

Measured on `--fixtures` at 1440px, the panel was **8,786px of unbroken scroll
across nine cards, none of them collapsible**. There was no first step, no last
step, and no way to be *done* with a section.

**Five tabs**, on the panel's own precedent (Knowledge's five, v0.49.1;
Crosslink's two, v0.43.7; the same `.tabs` / `.tab-pane` in `runs.css`) — Extra
was the largest panel in the app and the only big one that never adopted it.
Setup · Routing · Limits · Spending · Providers, grouped by **what you do, in
the order you do it**. Three rules:

- **The header strip and `extra.findings` stay OUTSIDE the tabs.** A caution you
  have to go looking for is a caution nobody reads.
- **`EX_TAB` remembers the open tab across a re-render** — the `KN_TAB` rule. A
  write must not throw you back to Setup.
- **The gate still decides what EXISTS.** With nothing connected, Routing /
  Limits / Spending are **not rendered as empty tabs**; Setup is the only tab
  and its own tab is spotlighted (the Crosslink "nothing linked" rule).

**ONE VERTICAL BAND LADDER replaces the horizontal rail AND the duplicate list
of editable rows below it.** Six defects, and every one of them structural:

1. **The target was truncated** — the single most important fact in the picture
   was the one you could not read.
2. **The widths lied.** `min-width: 128px` fought `var(--w)`, so a 10-point band
   and a 30-point band came out nearly the same width while the `0 … 100` axis
   underneath promised they were to scale.
3. **The last band was off-screen** with no affordance that the rail scrolled.
4. **No legend.** Green against blue carried the whole meaning and was never
   named anywhere on the page — and green means **the work leaves your
   machine**.
5. **`[0,30)` is developer notation.** The half-open bracket is load-bearing so
   it stays — beside a readable form, not instead of one.
6. **The rail and the rows were the same data twice**, and only the rows were
   interactive.

**Moving the proportional bar INSIDE the row is the whole geometric fix.** A
full-width track holding a `var(--w)` bar needs no floor, needs no horizontal
scroll, and can never clip a name — the `VAULT` / `ringRadii` lesson in a
simpler shape. The row expands **in place** (the Runs-row / Knowledge-doc rule),
one at a time.

**THE PLAIN-LANGUAGE LABEL IS THE CLI'S.** Writing "simple work" beside
`[0,30)` in `extra.json` would be the panel deciding what a score means — the
Flow-stepper rule, the `computeWikiFreshness` rule and the `docPlanShape` rule
applied a fifth time. So `orc extra route` computes it: `EXTRA_BAND_MEANINGS`
plus `bandPlain` / `bandMeaning` give every row a `range` ("scores 0 to 29" —
an exact translation of the notation, because scores are integers) and a
`meaning` describing what the SCORE FORMULA measures, never a model. Both are in
`--json` **and** on the human path, with the anchor ladder printed once: **a
field one surface prints and the other omits is drift no lint can see**
(v0.49.1).

**Tool cards get one sentence and one control per state**, with the version,
floor, auth string, model count and binary path behind a native `<details>`. The
**probe error stays out front** — it is the reason for the state, not detail
about it.

**The tour's Extra step moved.** It pointed at `.ex-rail-wrap`, which rendered
in every state because the rail was drawn from the Claude table. Its replacement
lives on the Routing tab, which does not exist on a first run — so the step
points at `.ex-boundary` with `.ex-strip` as the fallback. Same rule a fourth
time: **a tour step must point at something with a SIZE.**

### 4z.15.28 Design rationale served as user instruction (v0.53.0)

The copy problem on this panel was never that it was untranslated — `en` and
`id` were complete and stayed that way. It was **where the rationale sat**.

> "A gap is not a hole. Every range with no connection of yours on it is drawn
> in Claude's colour with the agent it actually resolves to, so 'I left the
> hardest work on Claude on purpose' and 'there is no top band' can never look
> the same."

That is true, and it belongs here. As the first thing under a table it tells a
first-time reader nothing about what to do. Six keys split in two: **the key
KEEPS ITS NAME and becomes the instruction** (STE — one sentence, active,
twenty words at most), and a new `…Why` key takes the reasoning into a collapsed
`exWhy()` disclosure underneath. **Nothing is deleted**, and the rationale keeps
its own voice, which is the one thing `TERMS.md` exists to protect.

The `…Why` keys join the `prose-keys` fence and the instruction keys leave it,
because **a new key is instruction text unless it is listed** and opting out must
stay a deliberate line in a diff somebody reads.

### 4z.15.29 What v0.53.0 deliberately did NOT do

- **Did not touch `output_tokens` for `reasoning_output_tokens`.** It needs one
  confirmation first, and an unproven pricing change is worse than a missing one.
- **Did not change `extra_on_failure`.** The machine that hit the codex outage
  is set to `stop`, which is why the run halted instead of falling back. That
  setting worked exactly as designed; the bug was the schema.
- **Did not "fix" engine `api` / `claude-shim` to match.** Their structured
  output goes through Anthropic's `output_config` beta with different rules.
- **Did not split `extra.js` or `extra.css` into more files.** It is the largest
  panel in the app and worth considering, but `app.html` is the manifest and a
  split is its own change with its own `verify-package.js` set-equality edit —
  not something to fold into a re-layout.
- **Did not add a `prefers-reduced-motion` rule.** Every animation added is a
  ONE-SHOT that finishes at its resting state, so the single block in
  `04-motion.css` needs no new entry. An infinite one would have.
- **Did not touch the other panels' wording.** Same reasoning as v0.52.0: Extra
  first, because it is the panel that spends money and moves data off the
  machine.


### 4z.15.30 The cost that was paid and never written down (v0.53.2)

**The whole cost half of `orc extra` was reported through a RELAY, and the relay
failed both ways on its first two real uses.**

`orc extra dispatch` composes `trace_line` and hands it back for the lane to copy
VERBATIM into a phase packet, which the pinned trace writer then writes. That is
a fact travelling through a model's short-term memory — the
remembered-not-dispatched pattern this repo has already lost to twice (the
v0.32.0 narration lesson, the v0.49.5 `RESUME.md` lesson) — and it lost to it a
third time here, in the one subsystem where the fact is *money*.

Two graded `/orc-fast` runs on the same feature, three real foreign dispatches:

| dispatch | what the lane wrote into the trace | what stats saw |
|---|---|---|
| opencode, `done`, 136/0/20032/134 | **no `EXTRA` line at all** | nothing |
| codex, `done`, 27029/0/159616/1895 | usage folded into a free-form `VERIFY` sentence | nothing |
| codex, `failed`, `tok=none` | `EXTRA Codex/gpt-5.4-mini :: engine=cli …` | nothing — the ` :: ` broke the parser |

`orc extra stats` reported **`0 foreign dispatches across 2 traces`**, `orc extra
rates` had no provider/model pair to price, and `orc ui ▸ Extra ▸ Spending` read
**`0 tasks sent`**. Meanwhile `return.json` and `return-fast.json` were sitting in
`.claude/orc/run/health-endpoint/` with complete four-kind vectors and a perfectly
formed `trace_line` inside each. **A cost report that reads zero when money was
spent is worse than no report, because a zero gets believed.**

**THE FIX IS THE PRINCIPLE, NOT THE PARSER.** The bridge writes the spend down
itself, at the moment it holds the numbers, exactly as `docWrite` writes
`RESUME.md`: the fact is recorded by the hand that computed it.

**`.claude/orc/extra-spend.jsonl`** — append-only, one JSON object per dispatch,
written by `appendExtraSpend()` inside `extraDispatch` before it returns. It
lives under `.claude/orc/`, which `isPrunable` can never match, so `orc update`
never touches it. It is BEST EFFORT BY CONSTRUCTION: it cannot throw, and a
record that could not be written never takes a dispatch down with it — but the
dispatch then reports `spend_logged: false` and says so in the human output,
because a dispatch no cost report can ever see is worth one line now rather than
a mystery later. **No key ever reaches this file.**

**The trace line is DEMOTED, not retired.** It is still the run's narrative, it
is still what `/orc-retro` reads, and the trace-cadence rule still binds every
phase. It is simply no longer what the money depends on. `extraStatsScan` now
merges three sources and reports the split in `sources`:

1. **the spend log** — what the CLI wrote itself; its richer fields (provider,
   reported model, serving providers) win over what a one-line regex can recover;
2. **the traces** — still read, because they cover every dispatch made before the
   log existed AND because `EXTRA fallback` only ever lands there (the CALLER
   emits it, after it re-dispatches; the bridge cannot know it happened);
3. **saved dispatch returns** — `{run_dir}/<slug>/*.json`, accepted only when the
   file carries `dispatched: true` AND a `trace_line` the parser accepts.

**Source 3 is a RECOVERY, not an invention,** and the distinction is the strict
shape check: what is read back is the bridge's own `--json` payload, saved
verbatim by whoever ran it, never a narrative about it. It carries no date and
**none is derived from an mtime** — a file's timestamp is when it was touched, not
when a model was billed (the `/orc-pact` UNCHECKABLE rule) — so under `--since`
those rows are EXCLUDED and COUNTED, never quietly included and never quietly
dropped.

**Dedupe is on the eight fields the trace line itself carries** (`profile · model
· engine · task · band · tok · outcome · dur`), rendered on both sides through
the same `extraTokStr` / `extraDurStr` that compose the line. Anything the line
cannot express cannot be used to tell two rows apart, or a lane that relayed
CORRECTLY would be counted twice — which would punish exactly the behaviour the
contract asks for.

**The parser now tolerates the ` :: ` separator.** Every other verb in a trace is
`VERB … :: tail`, so a trace writer handed this line reaches for it by reflex. A
line that is faithful about the numbers and off by two characters in its
punctuation must still parse. **Tolerance is a net under the contract, not a
licence to reshape the line** — and `_shared/extra-dispatch.md` says so.

**Every count names its source, on both surfaces,** and the two ABSENT counts are
named rather than absorbed: `unreadable_spend_lines` (a torn line in an
append-only file two concurrent dispatches share) and
`run_returns_undated_skipped`. A report quietly short by three rows is the exact
failure being fixed.

### 4z.15.31 The panel that could not survive its own upgrade (v0.53.2)

`orc upgrade` runs `npm i -g` over the package the running `orc ui` server was
loaded from. Node read `bin/webui` at require time and `STATIC` is a **one-time
walk at boot** (v0.48.1), so the upgraded panel keeps serving the old bytes: the
version in the rail does not move, a new tab does not appear, a fixed bug is
still there. The remedy was three manual steps nobody was told about — stop the
server, re-run `orc ui`, find the new URL.

**The server hands itself over.** `ctx.restart()` spawns a DETACHED successor on
**the same port and the same token**, then closes and exits. That pair is the
whole trick: the URL already in the address bar stays valid, so the open tab only
has to reload. A successor on a different port is not a restart — it is a second
server, and the tab being looked at still points at the corpse.

Five rules hold it:

- **`restarts_ui` is DECLARED per maintenance action, never inferred.** `update`,
  `prune`, `fix`, `upgrade` — and deliberately NOT `update-global`, which
  re-copies the payload into `~/.claude`, which is not what this server runs and
  not what any panel here reads. "This command changed the code under me" is not
  something a command's output can be read for.
- **Only on SUCCESS.** A failed upgrade changed nothing, so restarting after one
  would be motion with no reason. `restart_pending` is
  `restart_ui && !running && exit_code === 0`.
- **CLIENT-TRIGGERED, never the job's own close handler.** The job's output lives
  in this process's memory; restarting the instant a command finished would
  destroy the record of what it did before anyone read it. It also means a tab
  that is already closed leaves the old process running the old code, which is
  the safe resting state.
- **THE TOKEN TRAVELS IN THE ENVIRONMENT, NEVER IN ARGV.** It authenticates a
  write surface, which puts it in the same class as the credentials `orc extra`
  refuses on a command line: argv is world-readable in a process list and lands
  in shell history. `ORC_UI_TOKEN` is read ONCE at boot and deleted from
  `process.env` immediately, so the CLI subprocesses this server shells out to
  never inherit it. A successor also SKIPS the idempotent-relaunch lock check —
  the lock it would find names its dying predecessor, and treating that as
  "already running" would make the restart a silent no-op.
- **A failed handover is a note and two commands, never a broken page.** The old
  panel keeps serving and keeps working; it prints `orc ui --stop` and `orc ui`.
  The lock is deliberately NOT removed on handover: the successor overwrites it,
  and a failed spawn leaves a dead pid that `liveLock` cleans up — removing it
  would open a window where `orc ui` sees no server and starts a second one
  somewhere else. And the confirmation says the restart is coming BEFORE the
  apply, because a panel that reloads itself with no warning reads as a crash.

### 4z.15.32 What v0.53.2 deliberately did NOT do

- **Did not remove the `EXTRA` trace line, or make it optional.** The trace is
  the run's narrative and `/orc-retro`'s only input; the spend log is a ledger.
  Two artifacts, two jobs.
- **Did not add an `orc extra ledger` read command.** `orc extra stats --json`
  already carries `sources` and every row it built them from; a second reader
  over the same file is a second idea of what the file means.
- **Did not invent a date for a saved dispatch return.** An mtime would have made
  `--since` "work" and would have been wrong.
- **Did not reconstruct a dispatch from prose.** The run whose trace writer folded
  the usage into a `VERIFY` sentence is recovered from its saved `return-fast.json`
  and from nothing else — nothing rebuilds a cost figure from a sentence, however
  confident the sentence is.
- **Did not restart the panel after `update-global`.** It writes to `~/.claude`.
  Restarting for it would teach people the restart means less than it does.
- **Did not add a config key for any of this.** A spend log you can switch off is
  a spend log that is off on the run you needed it for; behaviour-trace logging is
  permanent for the same reason.
### 4z.15.33 The key it never sent — one variable that outranked the vault (v0.53.3)

**The failure.** A `deepseek` profile on engine `api`, credential source `vault`,
key verified minutes earlier, one route row covering `[40,55)`. Every
`orc extra dispatch` died at HTTP 401 — `Your api key: ****w5f7 is invalid` —
before the model was ever invoked. Nothing was written, nothing was billed, and
the `orc-fast` run halted at F2 under `extra_on_failure: stop`.

**The cause, in two lines of code.** `extraDispatch` resolved the credential with
`inMemory: process.env.ORC_EXTRA_KEY`, and `extraCredentialValue`'s vault branch
opened with `if (opts && opts.inMemory) return …`. So an environment variable
short-circuited the vault before the passphrase, the session cache or the
ciphertext were ever consulted. **Only `dispatch` and `conform` passed that
option.** Every other caller resolved without it, opened the vault, and
succeeded.

**Why it was nasty rather than merely broken.** The bug was invisible in exactly
the four places a user looks — `extra doctor` reported nothing, `extra list`
showed `verified · key vault`, `extra preflight` said `✔ ok`, and
`extra models --test` got a real answer from the real model in 1866ms. Each check
was honest **about the path it exercised**, and not one of them exercised the path
a wave takes. The error text then pointed at the vaulted key the user had just
verified, while the key ORC actually sent came from a variable the message never
named. Proven with an A/B control: same command, same slice, seconds apart, with
`ORC_EXTRA_KEY` unset for one child process — and that one reached the model and
billed real tokens.

**The repair — the two options were one option, and they are different facts.**

| option | what it is | precedence |
|---|---|---|
| `opts.inMemory` | an **explicit** key supplied for THIS invocation (`--key-stdin`) | wins — it is the key being proved and then stored, which is what makes `ping --key-stdin` a re-key rather than a no-op |
| `opts.ambientKey` | a key found lying in the environment (`ORC_EXTRA_KEY`) | **fallback only** — a vault that cannot be opened here, i.e. `extra_unlock: per-dispatch`, where nothing is cached on purpose |

A vault ORC can open always wins. And a passphrase in hand that the vault
**refuses** returns that refusal: falling through to the ambient variable would
burn a vault attempt and then send the wrong secret anyway.

**Three honesty fixes ride with it, because a wrong answer that reports itself
correctly is a five-minute diagnosis.**

1. **The return reports the source it USED.** `credential.source` is `vault` ·
   `env` · `ambient` · `memory` · `tool`, describing what happened rather than
   what the profile declares. The two disagreed for a release, so the one field
   that could have named the bug confirmed the wrong story instead.
2. **An override is never silent.** `credential_override` prints on every
   dispatch that did not use the declared source, pass or fail — the same class
   of fact as work leaving Claude with no `extra:` line.
3. **A 401 attributes itself.** `credential_hint` names the source. The
   provider's message describes the secret it saw; only ORC knows where it came
   from.

### 4z.15.34 `ORC_EXTRA_KEY` is the KEY, and keyhelp said it was the passphrase (v0.53.3)

Found while fixing the above, and worse than it. For a vaulted profile,
`orc extra keyhelp` rendered a per-OS instruction to set
`ORC_EXTRA_KEY="<your passphrase>"`, with the note *"This is the PASSPHRASE, not
the key."* `extraCredentialValue` reads that variable as **the key**. One
variable, two meanings, and the documented one was wrong — so a user who followed
ORC's own instruction exported the secret that opens the vault into the variable a
dispatch sends to a third-party provider in an `Authorization` header.

`knowledge.md`, `CHANGELOG.md`, `test/` and `_shared/extra-dispatch.md` all
described it as the key; only this one block did not. **Nothing in ORC reads a
passphrase from the environment**, so there is no env route for one and
`passphrase_env` is now always `null`. In its place:

- `vault_unlock.cmd` — `orc extra session <name> --save --ttl 30`, the route
  **with a deadline on it** (the whole v0.52.0 design), offered FIRST;
- `key_env` — the variable, described as the key, warned about as the key.

The panel renders both in that order and, as always, names no command of its own.

### 4z.15.35 One completions URL, and a 404 that authenticated nothing (v0.53.3)

The latent second bug in the same report, found and cleared as a cause by
hypothesis 4. There were **two** completions-URL builders:

| path | built | for `base_url: https://api.deepseek.com` |
|---|---|---|
| `ping` rung 2 | hardcoded `joinUrl(probe.base, "/chat/completions")` | `…/chat/completions` |
| `models --test` | the same hardcode | `…/chat/completions` |
| **dispatch** | `apiCompletionsUrl` — inserts `/v1` when the base carries no version segment, and honours `completions_path` | `…/v1/chat/completions` |

Neither probe honoured `completions_path` at all. DeepSeek accepts both
spellings, so this was **not** the 401 — but on a provider that accepts only one
it produces a profile that verifies **green** and dispatches into a 404. That is
the same lie as §4z.15.33 wearing a different status code, and it is why §5c of
the report is the real finding: **a green badge has to be earned by the code path
a wave will actually run.** `extraProbeCompletionsUrl` is now the one builder
both probes call, and `verify_credential_source` records which credential earned
the badge.

**And the unknown-model escape has to be about the model.** Rung 2's escape from
the chicken-and-egg reads a 400/404/422 on an invented model id as proof the
endpoint authenticated before declining the name. That is only true if the
endpoint is the one it was aiming at: a gateway answering `Unknown request URL`
with a 404 authenticated nothing. `extraErrAboutModel` is the guard — the body
must name the model asked for, or speak of a model/engine/deployment and not of a
url/path/endpoint/route — and when it says no the ping FAILS honestly instead of
verifying.

**The fake provider was more permissive than the provider**, which is exactly how
two probes held the wrong path for three releases with a green suite. It answered
a completion on **any** URL; it now serves exactly the path `apiCompletionsUrl`
derives and 404s the rest. Third surface in a row to break on that rule
(v0.53.0's `--auto`, the greedy `-f`, codex's `--output-schema`), and the tell was
the same every time: **the dispatch was fast, cost nothing, and reported
something vague.**

### 4z.15.36 What v0.53.3 deliberately did NOT do

- **Did not remove `ORC_EXTRA_KEY`.** The unattended wave with nothing cached is
  a real case and it is the one the variable was written for. What changed is its
  PRECEDENCE and whether it announces itself.
- **Did not scope the variable per profile** (`ORC_EXTRA_KEY_<NAME>`). A second
  spelling of the same thing is the drift this subsystem lints for everywhere
  else; ordering plus attribution closes the failure without one.
- **Did not fall back to the ambient key when the vault REFUSES a passphrase in
  hand.** That is a real answer about the declared source. Falling through would
  burn a vault attempt and then send the wrong secret.
- **Did not add a config key for any of it.** The ordering is not a preference,
  and an override you can silence is an override that is silent on the run you
  needed to see it.
- **Did not make the probes send a real completion by default.** Rung 1 is free
  and rung 2 spends one token on purpose. The gap was never the *strength* of the
  proof — it was that the proof was about a different code path.

### 4z.15.37 The reload that dropped its own token (v0.53.4)

The hand-over above was correct on the server side and broken end to end. The
panel strips `?t=` out of the visible URL at boot (`00-core.js`,
`history.replaceState`) so the token never lands in a screenshot or a pasted
link — and the hand-over then called `location.reload()`, which re-requests the
**stripped** address. A document request with no `?t=` and no `x-orc-token`
header is exactly the un-authenticated case, so the server answered, correctly,
with `This link is missing its session token.` Every maintenance action
declaring `restarts_ui` ended there, deterministically, and the user's own
recovery (`orc ui --stop`, `orc ui`) minted a NEW token for a server that was
already the new build — which is why nothing about it looked like a token bug.

**A reload is not `location.reload()` in this panel.** `reloadWithToken()`
re-attaches the in-memory token and `location.replace()`s that URL; it is the
only reload route, and a test fails on any bare `location.reload()` in `app.js`.
The stripping is deliberate and stays — the fix belongs to the reload, not to
the strip.

The class of bug is the one this panel keeps re-learning: **two halves of one
mechanism, each individually right.** The server proved the token survives the
handover; the client proved the token does not belong in the address bar.
Nothing tested the sentence they form together.

---

## 4z.16. `orc extra` recovery — a failure is a POSITION, not a blank page (v0.54.0)

### 4z.16.1 The bug, and why it was invisible

A wave dispatches `T-2` to a foreign profile. The slice declares
`src/routes/health.js`. The worker calls `Write`, six lines land on disk, and
then the socket dies — a 502, a wifi handover, a rate limit past the backoff, or
the wall clock. It never writes `module.exports = router;`. **Nothing mounts the
route, and the build may still pass**, because the half-written file is not wired
up yet.

What happened next, before this release: `runApiEngine` returned
`fail("unreachable")`, `extraDispatch` exited 1, and the lane ran P6 — which said,
verbatim, *re-dispatch the SAME slice to `fallback_to.agent`; nothing downstream
learns it was ever foreign.* That clause is exactly the property that makes the
fallback CLEAN when nothing was written, and exactly the property that makes it
DANGEROUS when something was.

A Claude executor then received a slice describing a repository that no longer
existed, and its three plausible moves were all wrong:

- `Write` the file whole → discards whatever the foreign worker got right, and
  re-spends the tokens the user routed foreign to save;
- `Edit` against a stale mental model → `old_string` does not match, and the
  executor improvises;
- read first, then guess whether the existing content is its own earlier work, a
  teammate's, or garbage → a judgment it has no evidence for.

**There was no field in the slice that could have told it, and no field in the
return contract that could have carried it.**

Six gaps produced that, and each is worth naming because each is a different
shape of the same mistake — treating a dead process as if it had left nothing
behind.

1. **The fallback re-dispatched a slice that no longer described reality.**
2. **The record of what the worker did was deleted at the moment it mattered.**
   Engine `api` wrote a genuinely good per-turn transcript into `workDir`, and
   `extraDispatch`'s `finally` removed `workDir`. Engine `cli` was worse: its
   return said `output_file: null, // the work dir is gone by now, and a path to
   a deleted file is worse than none`. **The comment was right about paths and
   wrong about the file.** The answer was never to report a dead path; it was to
   stop deleting the evidence.
3. **`outcome: partial` had no procedure that could act on it.** A `max-turns` or
   `wall-clock` partial has no `unmet[]` — ORC's own loop declared it, not the
   worker — so the lane was told to branch on a structurally absent field, while
   `files_written`, the one thing that WAS present, had no consumer anywhere.
4. **Nothing survived the death of the parent process.** Ctrl-C, a closed
   terminal, a sleeping machine: the `finally` never ran, so the work dir
   survived and nothing knew it existed; **no spend record was written** (that
   append runs after the engine returns), so a dispatch that cost real money was
   invisible to `orc extra stats` — the exact failure v0.53.2 was released to
   fix, reappearing through a different door.
5. **The retry ladder could not survive an ordinary home-internet blip.** Three
   attempts totalling ~1.6 s of backoff, inside a 900-second wall clock, and
   `Retry-After` never read — tuned for a provider hiccup, guaranteed to lose to
   a wifi handover, with ~898 seconds of budget unused.
6. **The taxonomy could not tell "never started" from "cut off mid-write".**
   `unreachable` covered both, and those two want OPPOSITE recoveries. A
   classifier that returns one word for both cannot pick either — which is why
   there was only ever one recovery.

### 4z.16.2 The journal, and the fourth time this lesson has been paid for

`.claude/orc/extra-journal/<task_id>/` — `attempt-NN.json` (the header, and it is
the BASELINE), `attempt-NN.progress.jsonl` (appended per observable event), and
`attempt-NN.result.json` (the final payload, if the dispatch lived to produce
one). **A resume is a new attempt, never an overwrite:** the previous attempt
holds the only record of what the repository looked like before anyone touched
it.

**Written by `orc extra dispatch`, and by nothing else.** This is the v0.53.2
spend-log rule applied a second time, and it is now the FOURTH time this repo has
chosen a written-by-the-CLI fact over a relayed one: v0.32.0's narration (two
fixes that bet on the orchestrator appending rich lines both failed under load),
v0.49.5's `RESUME.md` hand-back, v0.53.2's spend log, and this. A fact that
reaches disk by being relayed through a model's memory is a fact this repo has
already lost.

The header is written **after the credential and the slot resolve, and BEFORE the
first byte leaves the machine**. That instant is the only one at which the
repository is provably untouched by this dispatch, and therefore the only one at
which a baseline means anything. It records HEAD, `git status --short` in FULL,
and `{exists, sha256, lines, bytes}` for every `declared_files` entry — and
`declared_files` ONLY: hashing the whole worktree is unbounded work for a
question nobody asks, and a change outside the fence is the worktree delta's job,
which reads `git status`.

Two details that are not decoration:

- **`--untracked-files=all`, on both sides.** The default `git status --short`
  COLLAPSES an untracked directory into a single `?? src/routes/`, so a declared
  file created in a new directory is never named — and the fence check then
  reports the directory as an undeclared change, which is a false breach on the
  single most ordinary thing a worker does. The baseline and the later comparison
  must use the SAME command, or the set difference between them is comparing two
  different questions.
- **ORC's own bookkeeping is excluded by name.** The journal, the spend log and
  engine `cli`'s work dir are all written BY THIS DISPATCH, between the baseline
  and the read, so every dispatch would otherwise report itself as a fence
  breach — and **a fence warning that always fires is a fence warning nobody
  reads.**

Best effort by construction: **a journal that cannot be written never takes the
dispatch down with it.** The return carries `journal` (a path, or `null`) and
`journal_fidelity`; `null` is the honest answer and means there is nothing to
reconcile against.

**Retention is fixed at 30 days after a `done` close**, swept on the next
dispatch, memoised per process, no config key — the spend-log reasoning verbatim:
a record you can switch off is off on the run you needed it for. **An attempt
with a header and no result is never swept, however old**: that is the one thing
this whole subsystem exists to find.

### 4z.16.3 Fidelity is declared, and never rendered stronger than it is

| engine | what lands in the progress log | `journal_fidelity` |
|---|---|---|
| `api` | every turn, every tool call WITH ITS PATH, the running four-kind usage vector | `per-turn` |
| `claude-shim` | every `stream-json` event ORC already parses, then the result | `per-turn` |
| `cli` | the child's own stdout, redirected by fd | `streamed-opaque` |

Engine `cli`'s change is the one that made a whole class of evidence possible.
`spawnSync` buffers stdout **in the parent**, and the parent is what dies. With
`stdio: ["ignore", fd, "pipe"]` on the progress file, a killed parent leaves the
child's whole output on disk and a wall-clock kill leaves a parsable stream —
`bin/cli.js` used to discard `r.stdout` on `ETIMEDOUT`, which was free evidence
thrown away. stderr stays a PIPE on purpose: the adapter's classifier reads it
separately, and blending the two streams would feed stderr lines to a JSON-event
parser. The bytes are read back from the OFFSET the file held before the spawn,
because the progress file is ORC's own journal and may already contain ORC's own
JSON lines — handing those to `extraCliJsonEvents` would let the adapter dig
ORC's fields out and report ORC's `usage` as the worker's.

**A gap that is not reported reads as a capability.** Nothing may render a
`streamed-opaque` journal as if it had per-turn tool attribution — the same
restraint as `reports_model: false` and "zero reroutes is not evidence there were
none". And the honest limit is stated rather than discovered: **if the parent is
killed the child may keep running and keep writing**, which is exactly why a
resume is gated on liveness and never on "the parent is gone".

### 4z.16.4 Reconcile — free, deterministic, and it computes no judgment

`orc extra reconcile <task_id>`. Zero tokens. **The free check runs before the
paid one** — /orc-doc's lint rule, applied here.

| exit | state | what the lane does |
|---|---|---|
| 0 | `resumable` | the worktree moved off the baseline — offer the resume slice |
| 1 | `nothing-to-resume` | worktree == baseline — re-dispatch the ORIGINAL slice, which is the existing procedure and is right here |
| 2 | `no-journal` | unknown id, or a dispatch that predates this release |
| 3 | `complete` | the journal holds a `done` result — resuming would duplicate work |
| 4 | `in-flight` | the pid is alive inside its lease — **REFUSE** |

0 is the answer the command exists to give, not "healthy" — the `orc pattern
status` convention.

Per declared file: `untouched` · `created` · `modified` · `deleted` ·
`reverted`. Line counts are EXACT or ABSENT, never estimated: `created` and
`deleted` are exact from the baseline's own count; a `modified` file is exact
only when the baseline WAS the HEAD blob, because that is the only case where
`git diff HEAD` describes THIS dispatch's change rather than that change plus
somebody else's uncommitted edits. Anything else answers `null` and says why —
**unknown is not zero.**

**What it deliberately does NOT compute: whether a file is syntactically
complete.** No brace counter, no "the last line looks unfinished" heuristic, no
language sniffing. /orc-doc's house-rule boundary applies verbatim — *the CLI
cannot parse intent, so it does not pretend to* — and **a fake validator would be
worse than none**: a truncation detector that is right 80% of the time teaches
people to trust it the other 20%. The checks for "is this file finished" already
exist and are already engine-blind: the smoke gate, the TDD gate, the reviewer.
Reconciliation's job is to point them at the right thing.

**`in-flight` is a hard refusal, and it is the correctness rule.** A
"disconnected" dispatch is not provably dead: a client-side socket timeout does
not stop a provider streaming, and a `SIGTERM`'d child may still be mid-`write()`.
So the gate is the pid being gone OR the lease having expired. Pid reuse is real
and is SAID: past the lease, a live pid is treated as somebody else's process —
an honest bound, not a proof, and the text says which.

### 4z.16.5 Attribution — the field that decides the recovery

Five verdicts, each carrying a DIFFERENT correct recovery, each with its
evidence attached. The set is closed because a verdict nobody can act on
differently is decoration.

| verdict | derived from | what it changes |
|---|---|---|
| `provider` | the endpoint answered and refused (5xx, 429, 401, an unknown model) | the Claude fallback is exactly right |
| `network` | a connection failure **and** an unauthenticated probe that also fails | **a Claude fallback would fail too — HOLD** |
| `local` | `spawn-failed`, a missing binary, a managed-settings conflict | fix the machine; neither route works |
| `worker` | a clean HTTP conversation ending in `max-turns` / `output-cap` / `empty-diff` / a malformed return | the band or the turn cap is wrong |
| `orc` | ORC refused its own request shape | **an ORC defect**, reported as one |

**The probe is the new part and it earns its place.** "Your wifi is down" and
"deepseek is down" produce the same socket error and have opposite correct
responses. So on the reasons that cannot be separated without it, the bridge
makes ONE unauthenticated request with a 3-second budget and records the result.
It asks exactly one question — *can this machine reach that host at all* — so
**any** HTTP answer, 401 and 404 included, counts as reachable. It is not a
credential check and must never be read as one. It carries no credential, so it
is the one `orc extra` request that cannot leak one.

**`network` HOLDS THE WAVE.** Falling back to Claude when the machine has no
network burns a second failure and a second cost for nothing. **This is the point
of the whole release: fallback and resume are orthogonal, and ORC had been
conflating them.** Before, a failure meant *start over, on Claude*. Now it means
*continue — and here is who continues it, or nobody yet, and here is why*.

**`orc` is deliberately in the set.** This subsystem asks the user to trust a
report about a third party; a report with no way to blame its own author is not a
report anybody should trust. v0.53.3 was exactly an ORC bug that presented as a
bad key — and on a rejection the credential SOURCE now rides in the evidence,
because that is the one field that could have named that shape. It is evidence,
not a verdict: ORC cannot tell its own bug from a bad key, and does not pretend
to.

Two new `EXTRA_FAILURES` rows make the recovery choosable at all:
`stream-interrupted` (the connection was ESTABLISHED and then died — inferred
from whether this dispatch had already got a clean answer out of this endpoint,
which is a bounded inference and is stated as one) and `connection-lost-local`
(the same, with the probe also failing). A `timeout` deliberately keeps its word:
a slow endpoint and a dead link are not the same failure, and the attribution
says `network` either way without renaming what the engine saw.

### 4z.16.6 The resume slice — four changes, and everything else is a rule

`orc extra resume-slice <task_id> --out <f>`. **The CLI composes it** — the same
rule as `trace_line` and `announce`: a lane that wrote its own resume preamble
would produce a second wording for the same facts, and the two would drift.

It is a **NEW DISPATCH OF A DERIVED SLICE**, not a new engine mode. The lane's
flow is reconcile → resume-slice → the ordinary `orc extra dispatch`. **Zero new
engines, zero new dispatch paths, zero new agents** — so the fence, the
concurrency cap, the credential rules, the spend log and §6 all come along for
free, because none of them ever asked whether a slice was a first attempt.

The derived slice differs in exactly four ways: a CLI-composed RESUME PREAMBLE
above the original prompt (never replacing it), `resumed_from`, `preexisting[]`
(the per-file table, machine-readable beside the prose), and
`resume_readonly_hint[]`. Everything it does NOT change is a rule:

- **`declared_files` is never widened.** A resume that could add a path is a
  fence expansion nobody approved, arriving through the one door where nobody is
  watching. A genuine need is a `needs_context` return, and that path exists.
- **`acceptance[]` never moves.** The definition of done was set before any of
  this happened; a resume that could relax it would let a failure rewrite its own
  grade.
- **The score never moves**, so the resume resolves through the SAME
  `extraResolveFor` call and lands on the same band. **A resume is not a
  discount.**
- **The original slice's hash is carried and compared.** A slice that hashes
  differently today is `slice-drifted` and refuses, naming both hashes.
  Continuing a stale task quietly is how a resume produces work nobody asked for.

**Where a resume goes is DERIVED, never a config key** — from
`EXTRA_FAILURES[…].retry` plus the attribution. Retryable → the same profile in a
new session. Non-retryable → `fallback_to.agent`, **still as a RESUME slice**.
`network` / `local` → nobody yet. A key here would let somebody configure "always
resume on the same profile" and then wait out `extra_resume_max` × a 401.

That second row is the one that closes gap 1: **a Claude executor receiving a
resume slice gets the same preamble, the same `preexisting[]` table and the same
instruction not to rewrite finished work.** The Claude fallback stops being a
from-scratch dispatch, which it should never have been.

**Six refusals, each named, each writing NOTHING** — the `orc doc splice` shape:
refuse, name it, write nothing.

| `reason` | |
|---|---|
| `not-resumable` | the reconciliation is not `resumable` |
| `in-flight` | the attempt is alive inside its lease |
| `reverted-file` | a declared file came back closer to HEAD than the baseline |
| `slice-drifted` | the plan moved between attempts |
| `resume-cap` | `extra_resume_max` is spent for this task |
| `resume-disabled` | `config.extra_resume` is off |

The sixth is a deliberate departure from the five the plan named. Folding
`extra_resume: off` into `not-resumable` would make **"you turned this off"** and
**"there is nothing to resume"** the same word with different fixes — and a
command that silently ignores a config somebody set is worse than one that
refuses by name.

**A `reverted` declared file STOPS the resume.** If a file came back CLOSER TO
HEAD than the baseline — the §6 revert signature, which is how a destructive
`git` command inside a slice disguises itself — `resume-slice` writes nothing and
names the paths. Resuming on top of a possible destructive action is the one case
where continuing is worse than starting over, **and ORC does not get to make that
call.**

The refusal ORDER matters and is not arbitrary: the state check answers before
the cap. A second worker that wrote nothing has nothing to continue, so
`not-resumable` is the honest answer whatever `extra_resume_max` says.

### 4z.16.7 The spend a killed dispatch never recorded

`appendExtraSpend` runs AFTER the engine returns, so a killed parent spent real
money invisibly — gap 4, and the exact hole v0.53.2 was released to close. The
progress log carries the running usage vector, so `orc extra reconcile` writes it
to the spend log with `recovered: true` and **`complete: false`**, once, guarded
by a marker file so a read somebody runs repeatedly cannot double-count.

**Measured is not unknown; unknown is not zero; a recovered vector is a FLOOR and
says so** — in a field a renderer cannot miss, and it is never summed into a
total that reads as measured. It is recorded as `outcome: "orphaned"`, not
`failed`: nothing observed this dispatch end, and calling it failed would be a
claim the disk cannot support.

### 4z.16.8 Reporting — orphans, reliability, and the two absent counts

**`orc extra preflight` gains a read-only orphan section** and does **not** change
its exit code: an orphan is a finding, not a stop. **It reports; it never
resumes.** Silently continuing a third party's half-finished write into
somebody's repository is the same class of act as routing off Claude without
saying so, and it gets the same treatment: the user is told, and the user
decides. The `EXTRA orphan` line is the LANE's to emit after it reports — the
`EXTRA fallback` ownership rule, for the same reason.

**`orc extra stats` gains per-profile reliability**: `dispatches`, `failed`,
`resumed`, `orphaned`, mean time to failure, and the attribution split. A
provider that drops one dispatch in three is a fact that belongs **where the user
is choosing a profile**, not in folklore. **Below 10 dispatches there is NO
rate** — a percentage from three tries is noise with a percent sign on it — and
`unattributed` is always printed, including when zero. Two new ABSENT counts are
named (`unreadable_journals`, `journals_without_result`): a report quietly short
by three rows is the failure that produced v0.53.2.

**`orc extra doctor` gains two findings.** `extra-orphan-dispatch`, and
`extra-profile-unreliable` — which **never fires below the sample floor**, the
`wiki-debt` STALE-only restraint: a doctor that warns about noise is a doctor
people learn to ignore.

### 4z.16.9 The panel

**`orc ui ▸ Extra ▸ Recovery`** — a sixth tab, not a tenth card (Extra was split
into five in v0.53.0 precisely because it was 8,786 px of unbroken scroll).

- **A FREE action gets a button; a PAID action gets a copy-able command**, and
  that line is visible rather than hidden. `reconcile` costs nothing and is a
  button; `resume-slice` composes a slice for a dispatch that WILL cost money and
  the dispatch is a lane action — so Recovery ships copy-able commands and **no
  Run button**. The panel never runs a lane.
- **A row with nothing to show KEEPS ITS SLOT.** `nothing-to-resume` and
  `complete` render as rows. Filtering them makes "there was nothing to resume"
  and "ORC did not look" identical.
- **`in-flight` renders as a REFUSAL with its reason**, naming the pid and the
  lease — never a disabled control with no explanation.
- **Every state word is the CLI's**, and neither string table may contain one: a
  translated state word is a state that does not exist. A test greps both tables.
- **The row is a FLEX COLUMN, not a declared grid.** `.ex-tool`'s 250px ellipse
  (v0.53.0) is what a declared row template does to a card whose child count
  changes with its state, and a recovery row has five states with five different
  child counts. **A chip states a fact — it is never a layout element.**
- Prune is preview-then-apply and **names every directory**; why each kept record
  is KEPT is as much of the answer as why one goes.
- **Spending gains the reliability strip**, and the sample floor is the CLI's
  number, never one written in the panel.
- **Overview gets ONE line**, only when there is something to say, declaring
  `.no-caret` because it navigates rather than expands (the v0.49.2 card
  contract). It never offers to continue anything.

`--fixtures` carries one of every state including the ugly ones — the
`in-flight` refusal, the `reverted` block, a `streamed-opaque` journal with no
per-turn attribution to render, a `no-journal` answer, and reliability profiles
both ABOVE and BELOW the sample floor. You cannot design a `sample too small`
chip against a fixture set where every profile has a percentage.

### 4z.16.10 What this release deliberately did NOT do

- **No syntax checker.** See §4z.16.4.
- **No auto-resume.** An orphan is REPORTED at preflight and the lane OFFERS.
- **No new engine, no new dispatch path, no new agent.** Agent floor stays 51.
- **No promise of per-turn fidelity on engine `cli`.** That engine spawns a black
  box; the journal says which fidelity it had.
- **Four config keys refused**, and they are written down in the contract rather
  than left for somebody to propose again: a key for where a resume goes, a key
  for the retry ladder, a key to disable the journal or its retention, and a key
  for the network probe.

### 4z.16.11 What the lint caught in this release's own work

Worth recording, because it is the argument for the lint existing.

- **A WRAPPED TOKEN IS NOT THE TOKEN.** The spine sentence in `orc/SKILL.md` was
  hard-wrapped across `` `orc extra\n   reconcile <task>` ``, so the registered
  token did not appear in the file at all. `verify-contracts.js` reported it as
  MISSING from a registered copy.
- **A BARE ENGLISH WORD IS A FRAGILE TOKEN.** The `orphan` row's token is the
  plain word, registered to twelve plan files. v0.54.0 gave it a second,
  unrelated meaning whose lowercase literals (`orphans[]`, the `EXTRA orphan`
  trace verb, `extra-orphan-dispatch`) cannot be spelled any other way, so three
  files had to be registered under a row whose NAME is about plan coverage. The
  row now carries a note saying so. Its real job — a plan file that DROPS the
  word — is unaffected, because that is caught by `missing`, not `unregistered`.
- **Three incidental cross-references** borrowed `RESUME.md`, `flow.lock.json`
  and `tdd_loop_max` from other contracts. Each was decoration; each was reworded
  to state the rule it pointed at instead.
- **The spine budget fired** (529 vs 528) and, per its own rule, the pointer won
  and the prose went back to three lines.

---

## 4z.17. `orc extra` ROLE SLOTS — the non-scored half of routing (v0.55.0)

### 4z.17.1 The thesis, in one line

**A score is what a band needs, and four lanes do not have one.**

Bands stay for the lanes that score — `/orc`, `/orc-ultra`, `/orc-mini`,
`/orc-diy`. Every other lane that may go foreign gets an explicit **SLOT**: one
named agent POSITION, one chosen `profile/model`. Resolving a pinned agent's
band at both edges was arithmetic on a number nobody chose.

### 4z.17.2 Three bugs this release closes, all read out of the working tree

**P1 — `/orc-wiki` could not route at all. The row was DEAD.**
`EXTRA_LANE_SHAPES` declared the lane with `roles: ["wiki-scanner"]` and
`orc-wiki/SKILL.md` said it needed `scanner` in `config.extra_roles`.
`EXTRA_ROLES_ALL` contained **neither spelling**, and `extra_roles` is validated
by `vSubset`, so a user typing either was refused by name. `roles.includes(...)`
could never be true. `orc extra lanes` printed `/orc-wiki → claude` forever, with
a reason that read like a user's choice. Two spellings of one role and neither
existed: exactly the drift this subsystem lints for everywhere else.

**P2 — `/orc-doc`'s CHECKER resolved against the WRITER's band.**
`docExtraResolve` ended with a hardcoded
`extraResolveEdges(claudeDir, "orc-doc-writer-opus-5-med", "doc-writer")`
whatever `resolved` said. A document set to `checker` therefore resolved opus-5
at **medium** (`[40,80)`) for a role it was not routing, while the checker really
runs `orc-doc-checker-opus-5-low` (`[0,40)`). A route row on `[40,80)` and
nothing on `[0,40)` reported the checker as going foreign when it was not, and
the reverse. The band was the wrong instrument here for a deeper reason too: the
checker's `low` is a **measurement choice, not a cost one** (the /orc-challenge
cold-reader rule), so mapping it onto a cheap band is a category error.

**P4 — `orc extra dispatch` structurally refused every non-scored dispatch.**
It required `Number(slice.score)` in `[0,100]` unconditionally. A doc-writer
slice, a wiki scan-task and a quick entry have no score, so they could not reach
the bridge — the ONE place a request body is composed, the fence enforced, the
spend logged and the journal written. **Whatever the lane tables claimed, no
non-scored dispatch had ever gone foreign.**

**P3 is REPORTED, not fixed.** `analyst`, `planner`, `reviewer`, `verifier`,
`scout` and `test-author` are all accepted by `extra_roles` and nothing can ever
resolve one: every resolution path needs a score and none of those roles has one.
`orc extra role list` prints them as `declared · no slot · nothing resolves this`
rather than leaving an undocumented hole. A reviewer you cannot trust is worse
than no reviewer, so that one needs its own decision.

### 4z.17.3 `EXTRA_SLOTS` — the registry

A table in `bin/cli.js` beside `EXTRA_LANE_SHAPES`, mirrored in
`templates/skills/_shared/extra-dispatch.md` under `## The slot table`,
registered in `bin/verify-contracts.js` against that file, with a golden test
comparing the two **in both directions** (the `EXTRA_LANE_SHAPES` / `DIY_STEPS`
precedent).

| slot | lane | displaces | asked or announced |
|---|---|---|---|
| `quick-executor` | `/orc-quick` | `orc-executor-sonnet-4-6-med` · `orc-executor-opus-5-low` | **asked**, at the dispatch gate |
| `fast-executor` | `/orc-fast` | `orc-executor-sonnet-4-6-high` | F0 preflight |
| `doc-writer` | `/orc-doc` | `orc-doc-writer-opus-5-med` | before the wave, naming the sections |
| `doc-checker` | `/orc-doc` | `orc-doc-checker-opus-5-low` | before the wave |
| `wiki-scanner-deep` | `/orc-wiki` | `orc-wiki-scanner-opus-4-8-high` | per scan-batch, beside the tier |
| `wiki-scanner-light` | `/orc-wiki` | `orc-wiki-scanner-sonnet-5-high` | per scan-batch, beside the tier |

`claude` is an ARRAY because `quick-executor` has two — a menu is what that lane
is. `claude_opus5` is the variant `opus5_only` would have used, `null` where the
agent is already Opus 5. Both wiki slots collapse onto
`orc-wiki-scanner-opus-5-med` while the flag is on, which is why this release
**adds no agent and no pair** (the floor stays 51). Two slots and one Opus 5
agent is not a contradiction: **a slot names the POSITION, not the model.**

### 4z.17.4 Precedence — one sentence, both shapes

> **Extra decides whether a Claude agent runs at all. `opus5_only` and the score
> tables only decide WHICH Claude agent runs where extra did not take it.**

- **scored:** extra route row > `opus5_only` > `rubric_bands_override` > the
  default 8-band table. *(Unchanged.)*
- **slot:** extra slot row > `opus5_only`'s variant of that slot's agent > the
  shipped agent.

`rubric_bands_override` stays visible inside the second level for scored work:
a hand-written table hidden from its own author is worse than a longer printout.

**`opus5_only` is not "inert" under a taken slot — it is NOT CONSULTED for that
slot.** With `doc-writer` routed and `doc-checker` not, it is fully live for the
checker, and `shadowReason` / `configList` / `scoreTableJson` all say so and NAME
the taken positions. A shadowed setting must never be silent, and a *partly*
shadowed one must not be flattened into one word.

### 4z.17.5 `extraResolveSlot` — the second resolver

Same answer shape as `extraResolveFor` (`ok`, `resolved`, `why`, `held_back`,
`announce`, `claude`), so every consumer renders one thing. It **never** calls
`extraAgentBand`, never calls `extraResolveEdges`, and never reads a score.
`claude` is a pinned NAME, so the displaced answer it carries is a fact rather
than an interval — strictly more honest than what the scored half can offer.

Nine hold-backs, each answered by name: unknown slot (exit 2, listing the six) ·
`extra_enabled` false · no slot row (the OVERLAY rule — **absence is not a
hole**) · missing profile · never verified · a cited `risk[]` **in the slice**
with `extra_risk_tasks: off` · a boundary **REFUSE** (which holds in `warn` too) ·
STALE verification, which **still routes** and says so · and an EXPIRED/ABSENT
vault passphrase, which is `orc extra preflight`'s stop rather than this
resolver's.

**Never invent a risk facet.** A wiki scan and a doc section do not have one, and
a slot dispatch with no `risk` field is not a risk-free task — it is a task with
no risk statement. Only `/orc-quick` and `/orc-fast` can legitimately carry one.

`extraResolveEdges` and `extraAgentBand` survive with **exactly one caller**
(`/orc-mini`) and both carry a comment saying so. The `/orc-fast` and `/orc-doc`
callers were DELETED, not repointed, and the now-unused `fixed-role` lane shape
went with them: a shape no row carries is a shape that does not exist.

### 4z.17.6 The bridge, and why nothing downstream moved

The slice carries **exactly one of `score` or `slot`**; both is `bad-slice`,
refused by name. `score` is `null` on a slot dispatch and **is not derived from
anything**. `band` becomes the string **`slot:<slot>`** — the field NAME is
unchanged, so `EXTRA_LINE_RE`, the eight-field dedupe, the ` :: ` tolerance and
`extraStatsScan`'s three-source merge are untouched, and `orc extra stats` gives
each position its own cost row for free.

**Zero new engines, zero new dispatch paths, zero new agents.** The
`declared_files` fence, `extra_max_concurrent`, the credential triangle and
`credential.source`, `extraProbeCompletionsUrl`, the journal header written
before the first byte leaves the machine, the spend log, the resume ladder,
`EXTRA_FAILURES` attribution and the orphan sweep all come along unchanged. One
local rename was needed inside `extraDispatch`: the concurrency slot is now
`capSlot`, because two different things called "slot" in one function is how a
future edit picks the wrong one.

`orc extra preflight` walks the slot rows too. A slot row that would stop wave 1
and does not is the whole v0.52.0 deadline gate leaking through a new door.

### 4z.17.7 The lanes

- **`/orc-doc`** keeps `orc doc extra <slug>` — the document decides WHICH roles,
  the slot row decides WHERE they go. Resolution is now
  `doc.json.extra > the slot row exists > off`; `config.extra_roles` is no longer
  consulted, and a config still naming `doc-writer`/`doc-checker` warns once by
  name and arms nothing. The hardcoded `edges:` field is replaced by
  `targets: { writer, checker }`, each from **its own** slot — P2 fixed by
  construction. `orc doc next` names the model per role BEFORE the wave, and
  `orc doc forecast` prices each half at its own provider's rates, with a model
  ORC cannot price reading as an **em dash** rather than as an Opus number for
  work Opus will not do.
- **`/orc-wiki`** resolves the slot for the tier it just picked and prints the
  target beside the tier it already printed. `orc wiki plan` names every
  scan-task that would run off Claude before any of it is paid for, and **free
  repairs still come first**. The prose lives in the new
  `orc-wiki/references/extra.md` — the spine budget fired at 330/325 and, per its
  own rule, the pointer won.
- **`/orc-fast`** loses its band and gains `fast-executor`; the F0 `extra:` line
  now names the agent it displaced.
- **`/orc-quick`** is `gated-choice`, and its verdict word is `offered`. The slot
  adds a **THIRD OPTION** to a menu the user already reads — never a default
  (rule 1), never sticky (rule 2), re-asked after a failure. `extra_on_failure`
  and `extra_resume` stay INERT there and are announced as inert; `extra_enabled`
  is the one key that LEFT that list, and an un-shadowed setting must not be
  silent either.
- **`/orc-mini` keeps the band**, and the asymmetry is deliberate: mini SCORES
  its tasks and then pins one executor over them, so both edges of that agent's
  band is a question about numbers the run really produced. `/orc-fast` produces
  none.
- **`/orc-ultra` joins the lane table.** It runs the `orc` skill and writes its
  own `run-ultra-<slug>` trace, so its absence was a gap.

### 4z.17.8 Zero config keys, and the four that were refused

Written down so nobody proposes them again:

- **`extra_slots_enabled`** — a second master gate. `extra_enabled` is one, and a
  row's presence is the arming.
- **per-lane on/off keys** (`extra_doc`, `extra_wiki`, …) — a row you can park is
  a row you can delete, and `orc extra role rm` is one keystroke that leaves a
  history entry. `/orc-doc` already has the one per-document switch that
  genuinely needed to exist, because a runbook and a customer-facing PRD are
  different documents.
- **`extra_quick_ask`** — it would answer the one question that lane's gate
  exists to ask.
- **a per-slot model/effort key** — the slot row IS that, validated against
  `models_seen` instead of being a string nobody checked.

`extra_roles` keeps its two doc members for one release as deprecated read+set
values (the `LEGACY_KEYS` precedent): accepted, **warned by name**, pointed at
`orc extra role`, arming nothing. A renamed mechanism must never be a silent
revert.

### 4z.17.9 The panel

`orc ui ▸ Extra ▸ Routing` grows a **second ladder below the bands** — one tab,
two halves, no seventh tab. Every string comes from `orc extra role list --json`;
the panel names no slot meaning, no provider, no model and no agent of its own,
and a test greps the panel and both string tables. An unrouted position **keeps
its row** and is drawn as the Claude agent it falls through to (the OFF-phase
rule). There is **no proportional bar**: a band has a width because it covers a
range of scores, a position covers nothing, and drawing one a width would be the
panel inventing an interval the CLI never computed — so the row reuses `.ex-band`
and DECLARES one fewer column (the `.run-card` / `.ex-tool` lesson). Writes stay
batched on the existing bar, and replacing a position is confirmed with **what it
replaces named**: a count is not consent.

`--fixtures` carries one of every state including the ugly ones — routed+VERIFIED,
routed+STALE, a routed position whose profile lost verification, one whose model
left `models_seen`, two unrouted, and `quick-executor` routed so the "offered,
never applied" wording is designable. A test asserts the count per state.

### 4z.17.10 One thing this release had to fix that was not in the plan

**The test suite's concurrency budget stopped holding, and BOTH halves of the
fix were needed.** (Since **v1.0.0 W0** the number itself lives in the POOLS
table in `bin/test-run.js` — one concurrency per resource class — and
`test/_helpers.js` keeps the REASON and points at it.) `test/_helpers.js` pinned
`--test-concurrency` and explains why:
several files spawn real child processes and one derives scrypt at N=2^17, so at
too high a parallelism a local fake provider misses the 3s rung-1 timeout and the
file fails in a way that looks exactly like a real regression. Two new `extra-*`
files tipped it — two consecutive full runs failed a DIFFERENT five tests each,
every one of them green on its own file.

The first half was not a number. **Neither new file was testing the wire:** every
case in `extra-slots.test.js` is about the RESOLVER, and `verified_at` is the
only thing it reads off a profile, so the profile is now written straight into
the ledger. In `extra-slot-dispatch.test.js` only the two cases that really
dispatch keep a fake provider; the refusals, the unrouted case, the preflight
stop and the doctor findings never reach the wire. Sixteen child processes became
two, and the two files went 21.7s → 11.9s and 14.7s → 6.7s.

The second half was: with the leaner files restored to 8, a full run failed
**twenty-nine** tests — nearly the whole `extra-*` family — and every one of them
passed on its own file. 8 was already marginal on this machine; two more files is
simply what made it visible. The peak is 6, three consecutive full runs are
green, and the comment records the evidence rather than the guess.

**The standing rule the comment now carries:** when you add a file here, ask
which of its cases actually need a child process. The answer is usually "fewer
than all of them", and that is cheaper than everyone else's wall clock.

## 4z.20. The stall — a foreign worker that is alive and doing nothing (v0.56.1)

### 4z.20.0 What broke

An `opencode` dispatch that goes quiet mid-task burned the whole
`extra_timeout_s` budget (900s by default) and then reported `timeout`. Two
things were wrong with that, and only the second one matters.

The small one: fifteen wasted minutes per stall.

The real one: **`timeout` is a statement about ORC's patience, not about what
happened.** It reads as a budget somebody should raise. What the worker actually
left behind was a **position** — a half-changed repository and a session that
had stopped and was waiting for a human to type `continue`. ORC already has the
machinery for a position (`orc extra reconcile` → `orc extra resume-slice` →
`extra_resume`, v0.54.0) and it was never reached, because the failure class the
dispatch reported did not describe a position.

Empirically confirmed against a real provider before anything was written:
`opencode/big-pickle` answered in 4s; `opencode/nemotron-3.5-lightning-free`
produced **zero bytes** and was still running when a 90-second manual timeout cut
it off. Same tool, same flags, same account, same second. Nothing about that is
visible to a wall clock.

### 4z.20.1 `spawnSync` cannot be watched — this is why the engine went async

`runCliEngine` used `spawnSync` with `timeout: wall_ms`. `spawnSync` blocks the
event loop for the entire dispatch, so **nothing in the process could observe the
child while it ran.** A stall was structurally undiscoverable until the child
was already dead. That is the whole reason the wall clock was the only stop:
not a design choice, a consequence.

Engine `cli` now spawns asynchronously (`runCliChild`) and something watches.
Three details that are not incidental:

- **stdout still goes to a file descriptor** — the journal's progress file — so
  the progress measurement is a `stat` and not a buffer held by a parent that
  might die (the v0.54.0 reasoning, unchanged). When there is no journal the
  bytes are collected in-process instead; a journal is best effort by
  construction, and a dispatch that produced no readable output *because ORC
  could not write a log file* would be a far worse failure than the missing log.
- **`taskkill /pid <pid> /T /F` on Windows.** A `.cmd` shim is `cmd.exe` with the
  real tool as a GRANDCHILD. Killing `cmd.exe` leaves the tool running against
  the same repository the next attempt is about to resume into — which would
  make the resume land on a file two writers are holding.
- **The child is spawned into its own process group on POSIX** and the group is
  signalled, for the same reason.

### 4z.20.2 What the stall clock measures — progress, not the wall

`extra_stall_s` (default **180**, `0` disables) is not a second wall clock. It is
reset by **observable progress**, in the only three places progress can appear:

| signal | why it counts |
|---|---|
| new bytes on the worker's stream | it is talking |
| new bytes on its stderr | it is complaining, which is still working |
| a **declared file** changed size or mtime | it just wrote something, whatever its stream is doing |

`declaredFilesFingerprint` supplies the third, and it is the one that earns the
design: a worker can think silently for four minutes and then write a file in one
burst, and a clock that watched only the stream would kill it. Note it fingerprints
`declared_files` ONLY — the same bounded set the journal baseline covers, so the
poll stays cheap on a large repository.

`EXTRA_STALL_POLL_MS` is 5s, floored at `stall_ms / 4`, so a short budget still
gets four samples.

### 4z.20.3 Ordered once: stall < idle < api < wall — and the tie

`extraTimeouts` owns all four. The rule that took a second pass to get right:
**a stall budget that cannot fit under the wall clock stands down entirely.**

`extra_timeout_s: 30` (the floor) leaves no room for a 30s stall budget. Both
timers would fire in the same instant and the report would name whichever won the
race — which is *precisely* the "three timeouts disagreeing about which one fires
first" bug this function was written to prevent. So: `fitted = min(asked, wall −
15s)`, and if that is under the 30s floor the stall clock is `0` and
`stall_off_reason` says why. **The wall clock wins a tie, because it is the budget
the user set.**

This is also load-bearing for the existing test
`engine cli: a wall-clock kill leaves the child's output on disk`, which runs at
`extra_timeout_s: 30` and must keep reporting `timeout`.

### 4z.20.4 `stalled` is RETRYABLE, and that is the point

`EXTRA_FAILURES.stalled` — *"the worker went quiet and stopped changing
anything"*, `retry: true`. Nothing downstream needed changing: `retry: true` is
what routes it through `extraResumeTarget` → `extra` → a continuation slice
carrying the `preexisting[]` table. **That IS ORC's spelling of typing
`continue`.**

**Deliberately NOT added: a stdin nudge.** `opencode run` is a non-interactive
invocation; there is no prompt loop reading stdin, so writing `continue` to it
would be a keystroke nobody reads. It would also be worse than nothing, because
it would look like the problem was handled. The honest equivalent is the resume
that already exists.

Attribution lands on `worker`, correctly — nothing in a stall points at the
network, the endpoint or ORC — so `extraNetworkProbe` is not consulted and no
second cost is spent finding that out.

### 4z.20.5 The timeline rides on every outcome

`timeline` — `first_byte_ms` · `last_progress_ms` · `longest_gap_ms` ·
`quiet_for_ms` · `stall_budget_ms` · `wall_budget_ms` — is on the return whether
the dispatch succeeded, stalled or timed out. **A budget you can only see when it
fires is a budget nobody can set before it does.**

`first_byte_ms: null` is a worker that never said anything, and it is never `0`
(the "unknown is not zero" rule). The baseline sample deliberately does not count
as movement — an early version did, and every dispatch reported a first byte at
0ms, a timeline nobody could read a stall out of.

### 4z.20.6 `orc extra health` — a listed model, a working model, and a model that FINISHES

`orc extra health <profile> [--model <id>]` — `0` answered · `1` stalled or
failed · `2` unknown profile. Engine `cli` only (engine `api` has a per-request
inactivity timeout on its own socket, which `ping --live` already exercises).

It runs the adapter's existing `probeArgv` through **`runCliChild` — the same
watchdog a dispatch uses.** That is the v0.53.3 rule: a green badge must be
earned by the path a wave actually runs, or it certifies something else. What it
adds over `ping --live` is the verdict (`answered` · `stalled` · `timeout` ·
`failed` · `spawn-failed`) and the timeline.

ORC already documented that *a listed model is not a working model*. This
release adds the third fact in that sequence: **a working model is not a model
that finishes.** `nemotron-3.5-lightning-free` is listed, is accepted, opens a
session — and never produces a byte.

The reply is foreign input: capped, shown as text, never followed
(`_shared/untrusted-input.md`), and the CLI-ping cost note is printed.

### 4z.20.7 `extra_fallback_agent` — who picks the task up

`fallback_to` has always carried the band's (or the slot's) own Claude agent.
Right default, and the only one ORC can compute alone: **a fallback that changes
tier is a re-plan nobody asked for.**

What it could not do is let a human choose — and a stall is exactly the moment
that matters, because by the time the wave stops the user often knows something
ORC does not.

| value | behaviour |
|---|---|
| `band` (default) | dispatch `fallback_to.agent`. Pre-v0.56.1, unchanged. |
| `ask` | STOP, print `fallback.options[]`, dispatch what the user picks. |
| any `orc-…` name | pin that agent, and say it overrode the task's own. |

Four rules:

1. **Under `ask` nothing is chosen.** `fallback.agent` is `null`, the trace line
   says `→ pending (extra_fallback_agent=ask)`. A lane that picked the first
   option would answer the question the setting exists to ask, and `/orc-retro`
   would aggregate a decision nobody made.
2. **`extraFallbackAgentOf` is the ONE reader**, and it defers to `fallback_to`
   under `band` — only `pinned` overrides. `fallback_to` keeps its name, its
   position and its meaning, exactly as the payload comment promises.
3. **The menu is computed** and the task's own agent leads it (it is what happens
   if the user presses enter). `EXTRA_FALLBACK_ALTERNATES` is mirrored in the
   contract with a golden test in both directions, and free text is accepted
   because the roster is generated — a closed list would go stale the next time a
   band moves. `vFallbackAgent` requires the `orc-` prefix so a typo is a refusal
   rather than a dispatch to a name nothing answers to.
4. **It changes WHO, never WHAT** — the score, `declared_files` and
   `acceptance[]` are untouched. **INERT in `/orc-quick`**, announced at the
   gate: re-opening that gate IS the ask.

### 4z.20.8 A stop must NAME the model

The trace line read `EXTRA profile/? engine=cli …` on a wall-clock timeout,
because the early-return `fail()` never carried `model_requested`. `orc extra
stats` dedupes on the eight fields that line carries, so a stalled or timed-out
dispatch could not be joined to a price, attributed to a provider, or told apart
from another stall on a different model. Pre-existing hole; fixed here because
the stall path doubles how often it is hit.

### 4z.20.9 Config, and what was refused

Eleven keys became **thirteen**. Both additions come from the same observed
failure. Three were refused and are written down so nobody proposes them again:

- **a stdin nudge** — §4z.20.4.
- **a per-profile stall budget** — the number describes ORC's patience, not a
  provider. A provider does not have a stall rate that ORC can know.
- **a key to disable the timeline** — the spend-log reasoning verbatim: a record
  you can switch off is off on the run you needed it for.

### 4z.20.10 Tests

`test/cli/extra-journal.test.js` gains three cases on the existing `slow`
fixture (one event, then `Atomics.wait`): a quiet worker is `stalled` and
`retry: true` **and stopped well before the 300s wall clock** (without that
timing assertion the test passes on a build where the clock does nothing); the
stall clock stands down and the wall clock wins at `extra_timeout_s: 30`; and an
`ok` dispatch under a live stall clock is untouched by it — the negative case,
which is what proves the clock measures progress and not the wall.
`test/payload.test.js` pins the contract token, the `retry: true` row, the three
progress signals and the alternates in both directions;
`test/cli/extra-routing.test.js` pins both key defaults and that a bad agent name
is refused.

Live-verified in `../orc-eval` against real providers on both engines before the
version was bumped: engine `cli` (opencode) and engine `api` (DeepSeek) each
returned the full contract and wrote the declared file, and the stall path was
driven end to end against a model that genuinely stalls.

---
