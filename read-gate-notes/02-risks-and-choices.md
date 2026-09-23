# 02 — Risks and open choices

D1–D11. **None are settled.** D1 and D11 are load-bearing: several waves are
undefined until they are answered, and D11 can reshape the whole feature.

---

## D1 — Does `PreToolUse` fire inside a dispatched subagent? *(LOAD-BEARING)*

**Why it decides everything.** `_shared/read-ladder.md` exception 1 says a file
in `declared_files` is read in FULL, first, always, because Claude Code enforces
a path-keyed read-before-write gate and an `Edit` whose `old_string` was
reconstructed from an outline is a corruption bug. If the gate fires inside
executors and cannot tell it is there, **the release corrupts files**.

**What the tree suggests, and why that is not proof.** `orc-trace.js` is built
as though hooks are session-level: `SPAWN` is written from the parent's
`PreToolUse(Task|Agent)`, `RETURN` from `SubagentStop`, and the whole "two or
more in flight" dedupe logic (`orc-trace.js:49-59`) assumes the parent observes
everything. That is an inference from a design, not a verified fact.

**The experiment (W1, deterministic, ~10 minutes).** Wire a temp `PreToolUse`
hook on matcher `Read` that appends pid, cwd and the read path to a file and
always exits 0. Dispatch any read-only agent at a known file. Then:

| Result | Consequence |
|---|---|
| No line from inside the subagent | Session-level. The gate is safe by construction and D5 gets much easier |
| A line appears | The gate MUST detect subagent context. If no field distinguishes it, **the feature is refused** rather than shipped with a corruption path |

**Do not build W2 before this is answered.**

---

## D2 — The threshold

Not 350. See `01-audit.md` section 5. Proposal: W0 measures the main session's
read distribution, and the threshold is set where the measured delegation
overhead crosses the measured saving — then it is **stated with its sample
count**, per the `/orc-budget` honesty rule. A number with no sample count is
not shippable.

Open sub-question: lines or bytes? A 350-line minified file and a 350-line Go
file are not the same read.

---

## D3 — What the block message names

The post's own note: the block message names the alternative. A block that only
refuses teaches people to disable it.

| Option | For | Against |
|---|---|---|
| **(a) Name the ladder step** — read with `offset`/`limit`, or dispatch a reader | Zero new infrastructure. Consistent with "the CLI computes, the model dispatches" | Still relies on the model choosing well after the block |
| (b) Name a new `orc read` command | Deterministic | **The CLI cannot summarise.** It would have to spawn a model, and `orc ui`'s boundary rule is that the CLI never does agentic model work |
| (c) Name a `context-reader` dispatch | Closest to the diagram | Needs D8 first |

**Leaning (a) for the first release**, (c) as a follow-on gated on W0.

---

## D4 — Default mode

`read_gate` with values off, warn, block.

Three precedents pull in different directions, and this must be decided
explicitly:

- **The effort guard ships ON and hard-blocks.** Precedent for `block`.
- **v1.1.0's whole wait family is off/ask by default** — nothing in that family
  may stop a run the user did not ask it to stop. Precedent for `off`.
- **v1.2.0's in-flight guard has NO key at all** — a guard you can switch off is
  off on the run you needed it for. Precedent for no key.

The distinguishing fact: this gate refuses a **read the user or a lane asked
for**, not an ORC dispatch. That is closer to the wait family than to the
in-flight guard. **Proposal: default `warn`**, `block` opt-in — and `warn` must
be a real value, not an absence.

---

## D5 — How the gate honours read-ladder exception 1

A file in the current task's `declared_files` must pass through in full.

If D1 says session-level, the gate never sees an executor's read and this is
mostly moot. If it does see them, the gate needs a source of truth for the
current `declared_files`, and the only honest candidate is the pending sidecar
`orc-trace.js` already writes on every `SPAWN` — the record `orc run inflight`
reads (v1.2.0). **That sidecar was written for a release and a half before
anything read it**; this would be its second reader.

Risk: a slice's `declared_files` is not currently in the sidecar. Adding it is a
change to the trace hook, which is the most safety-critical file in the payload.

---

## D6 — How the gate honours read-ladder exception 2

Output a gate parses — build logs, test output, lint results — is read whole,
because the smoke gate, the TDD gate, the verifier and `/orc-quick`'s build loop
decide red vs green from those exact bytes.

Open: identified by path pattern, by extension, or by an allowlist? A pattern
list is a second source of truth about what a gate reads. **A wrong answer here
turns a red build green by truncation**, which is worse than any token saving.

---

## D7 — `check-bash-read` (cat / head / tail / less / more)

**Proposal: OUT of this release.** Under auto mode ORC reads through Bash
constantly, and the exception-2 carve-out becomes a command-and-path allowlist
rather than one `tool_input` field. Same hook, several times the false-positive
surface, and no data yet. Revisit once the `Read` gate has produced numbers.

---

## D8 — A `context-reader` slot in `EXTRA_SLOTS`

All seven current slots (`quick-executor`, `fast-executor`, `doc-writer`,
`doc-checker`, `test-designer`, `wiki-scanner-deep`, `wiki-scanner-light`) are
write-or-scan positions. A read-on-behalf-of-the-orchestrator position is the
missing shape, and it is the one where a foreign worker is cheapest and least
risky: it returns bullets and touches nothing.

Against, and it is not weak: **`orc extra dispatch` already exists with a
journal, a spend log, a credential triangle, a fence and a resume path.** A
reader slot inherits all of it — but it also inherits "a lane that sends work
off Claude without saying so", so it must announce, which costs a user line on
every delegated read. **Gate this on W0.** If oversized reads are rare, a slot
is infrastructure for nothing.

---

## D9 — Fail-open, and how a fallback records itself

The gate FAILS OPEN. Non-negotiable: a read gate that throws and blocks has
broken the tool. Precedent: `orc-statusline.js` is fail-silent,
`orc-effort-guard.js`'s version check is fail-silent, and v1.3.0's six-rung
statusline gate ladder is **all fallbacks, each of which records itself**.

Open: does a fail-open record itself, and does `orc doctor` turn it into a
sentence? v1.3.0 does exactly that, **and only while the feature is armed**.
Proposal: copy that shape.

---

## D10 — Does a block leave a trace line?

CLAUDE.md, twice: a resume that leaves no line cannot be counted; a demotion
that leaves no line cannot be counted. A block that leaves no line cannot be
counted either, and W0's whole point is that this feature must be measurable
after it ships, not only before.

Against: the trace is per-RUN and a read can happen with no run open — which is
D11.

---

## D11 — The gate cannot tell whose read it is *(LOAD-BEARING)*

`PreToolUse` on `Read` fires on **every** read in the session, including when no
ORC lane is running and the user is simply working.

**The effort guard never has this problem**: it matches `Skill`, so it fires
exactly when `/orc` is invoked and never touches non-ORC work. A read gate has
no equivalent — a read is a read.

This is the strongest objection to the whole feature. Three answers, all with a
cost:

| Answer | Cost |
|---|---|
| Gate only while `log_dir/.current` names an open run | Honest and cheap — the pointer already exists. But it is silent in `/orc-quick`'s Q1 LOOK before a run opens, and silent entirely outside ORC |
| Gate always | ORC takes over the user's whole session. **Out of character for this repo** — every lane is opt-in, and `/orc-boundary`'s rule is that a gate constrains ORC's dispatch, never an explicit user instruction |
| Gate always, in `warn` only | Defensible, and it makes D4 nearly decide itself |

**Leaning: gate while a run is open, in `warn`, and say so plainly** — including
saying that it is silent outside a run. An honest limit stated is this repo's
convention (v1.2.0: it cannot see an ad-hoc dispatch, and says so).

---

## Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | The gate blocks a pre-`Edit` full read and an executor corrupts a file | **Critical** | D1 first, then D5. Refuse the release rather than ship a corruption path |
| R2 | The gate truncates gate-parsed output and a red build reads green | **Critical** | D6. Exception 2 is not a preference |
| R3 | W0 shows the target is small and the release is infrastructure for nothing | High | W0 may REFUSE. That is a success, and the finding gets written down |
| R4 | The threshold is copied from the post rather than measured | High | D2. The overheads differ by orders of magnitude |
| R5 | The gate fires outside ORC and the user disables it | High | D11 |
| R6 | A hook throw blocks reads session-wide | High | D9, fail-open, plus a test asserting a throwing gate still allows |
| R7 | Putting `declared_files` in the sidecar means editing the trace hook | Medium | D5. The most safety-critical file in the payload — its own wave, its own gate |
