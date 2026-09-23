# Plan — the read gate

Target version: **v1.6.0** (new feature, backward compatible → `npm version minor`).

Written in ordinary English. The user-facing half — `templates/hooks/README.md`
— stays in Simplified Technical English, per the standing rule for that file.

> **Status: NOTHING BUILT.** D1–D11 all open. **W0 can refuse the release**, and
> that is a designed outcome, not a failure mode.

---

## 1. What ships

| # | Thing | Why |
|---|---|---|
| A | **W0 measurement** — what oversized main-session reads actually cost here | CLAUDE.md: measure the target first, and name the class from the count |
| B | **W1 scope proof** — does `PreToolUse` fire inside a subagent | D1 is load-bearing; W2 is undefined without it |
| C | `templates/hooks/orc-read-gate.js` — `PreToolUse` on `Read` | The one layer that can say no |
| D | `read_gate` config key (off / warn / block) | D4 |
| E | `orc doctor` finding + `FINDING_ROUTE` entry | A fallback that records itself |
| F | `templates/hooks/README.md` section | The user's half, in STE |
| G | README + CHANGELOG + `knowledge.md` + `CLAUDE.md` | The P0 documentation rules |

**Deliberately NOT in this release**, with the reasons recorded so nobody
proposes them again in three months:

| Not shipping | Why |
|---|---|
| `check-bash-read` (cat/head/tail/less/more) | D7 — same hook, several times the false-positive surface, and no data yet |
| The `350` constant | D2 — their number is derived from a 10–30 s round trip; ours is measured in minutes |
| A `context-reader` `EXTRA_SLOTS` row | D8 — gated on W0. If oversized reads are rare it is infrastructure for nothing |
| A worker file with a temperature | ORC's equivalent control is the effort ladder, already a measurement choice per role |
| Any new boundary on "reasoning" | ORC computes those (`/orc-boundary`, `extra_risk_tasks`); the diagram draws them by hand |

---

## 2. The one rule this release exists to fix

ORC's read discipline is written down three times and enforced zero times.

```
   today                              after
   ─────                              ─────
   read-ladder.md   ─┐                read-ladder.md   ─┐
   orc-quick  L21    ├─ prose the      orc-quick  L21    ├─ prose
   orc-doc    L66   ─┘  model must     orc-doc    L66   ─┘
                        remember              │
                                              ▼
                                       orc-read-gate.js
                                       PreToolUse(Read)
                                       exit 2 = refuse,
                                       and NAME the alternative
```

This is the sixth time this repo has moved a fact out of a model's memory:
v0.32.0 narration, v0.49.5 hand-back, v0.53.2 spend log, v0.54.0 journal,
v1.1.0 wait — and now the read ladder.

---

## 3. The waves

Every wave ends in a STOP: `npm run verify` + the **full** `npm test` →
findings → report → **wait**. Every wave declares its class (E / D / C).

### W0 — MEASURE, and be willing to stop *(class: pending)*

**This wave can end the release.**

Build a throwaway probe (`read-gate-notes/.probe.js`, never committed) that
reads what already exists:

- `.claude/orc/usage-session.json` — the per-session four-kind ledger the
  v1.2.0 statusline writes
- `orc usage report` (`bin/cli.js:39298`)
- the traces under `log_dir`

and answers three questions:

1. What share of main-session **input + cache-write** tokens is attributable to
   reads the ladder would call step 4?
2. What is the line/byte distribution of those reads?
3. What did a delegated read actually cost, in wall time, in the traces we have?

**Output:** `findings/W0-read-cost.md`, with a sample count on every number and
`unattributed` printed even when zero.

**The refusal condition, stated in advance so it cannot be argued away later:**
if oversized main-session reads are not a material share of main-session
tokens, **the release does not ship**. `findings/W0-read-cost.md` is written,
the audit is kept, and this folder is closed. That is a successful W0.

---

### W1 — THE SCOPE PROOF *(class: C)*

Answer **D1**. The experiment is in `02-risks-and-choices.md`. Roughly ten
minutes and one dispatch.

**Output:** `findings/W1-hook-scope.md`, and D1 is marked SETTLED with the
evidence, not with an inference from `orc-trace.js`'s design.

**Gate:** if hooks fire inside subagents and no field distinguishes that
context, **the release is refused** (R1). Do not design around it.

---

### W2 — the hook *(class: C)*

`templates/hooks/orc-read-gate.js`. Copy the effort guard's shape — stdin JSON,
exit 0 allow, exit 2 block with the reason on stderr.

**The decision order inside the hook, and it is the design:**

| # | Check | Result |
|---|---|---|
| 0 | Anything throws, anywhere | **ALLOW.** Fail-open, always (D9, R6) |
| 1 | `read_gate` is `off` | allow |
| 2 | No open run (`log_dir/.current` absent) | allow — D11 |
| 3 | `offset` or `limit` present in `tool_input` | allow — this is ladder step 3, the diagram's own "targeted read passes through" |
| 4 | Under the threshold | allow — D2 |
| 5 | Path is gate-parsed output | allow — ladder exception 2, R2 |
| 6 | Path is in the in-flight slice's `declared_files` | allow — ladder exception 1, R1 |
| 7 | `read_gate` is `warn` | allow, and say so |
| 8 | otherwise | **exit 2**, naming the alternative (D3) |

**Tests, in `test/hooks.test.js`**, and these are the wave's gate:

- a throwing gate still allows (R6)
- an `offset`/`limit` read always passes
- a `declared_files` read always passes in full (R1)
- gate-parsed output always passes whole (R2)
- with no open run, nothing is ever blocked (D11)
- `warn` never exits 2
- `off` is **byte-identical to not having the hook** — the v1.3.0 baseline rule

---

### W3 — wiring, the manifest, and the key *(class: C)*

Four integration points, all located in `01-audit.md` section 4:

1. **Settings merge** — `bin/cli.js:270–290`. Copy the effort-guard block
   verbatim: add once, refresh the path on update, never duplicate, never
   clobber. Matcher `Read`.
2. **The shipped-file manifest** — `bin/verify-package.js:470–483` names every
   hook and asserts set equality in both directions. A new hook file that is not
   named there fails `npm run verify`.
3. **`read_gate` in `CONFIG_META`** — `statusline_custom` (`bin/cli.js:1293`) is
   the shape to copy: a `tier`, an `answers[]` family entry, a validator, an
   `options[]`, and a `desc` that says what OFF means.
4. **`SEED_EMPTY`** — `bin/verify-contracts.js:3717`. `read_gate` belongs on
   that allowlist with an empty `lanes[]`, **and the comment must say why**:
   a hook has no lane and cannot resolve config, exactly as `statusline_custom`
   and `wait_hop_minutes` cannot. An empty `lanes[]` here is an ANSWER, not a
   to-do.

**Gate:** `npm run verify` prints both `ORC package OK` and `ORC contracts OK`.

---

### W4 — `orc doctor` and the record *(class: C)*

- `read-gate-unwired` — the hook file is present and `read_gate` is armed, but
  `.claude/settings.json` has no `Read` matcher. `fix_command` is `orc update`.
- A fail-open **records itself**, and `orc doctor` turns that into a sentence —
  **only while the feature is armed** (the v1.3.0 rule; a doctor that warns
  about a normal state is a doctor people learn to ignore).
- `FINDING_ROUTE` entry. An install-footprint finding takes the documented
  default and routes to **Maintenance**.
- **D10** is settled in this wave: either a block emits a trace verb, or the
  reason it cannot is written down. A block that leaves no line cannot be
  counted.

---

### W5 — the follow-on, and only if W0 earned it *(class: pending)*

Gated on `findings/W0-read-cost.md`. **Do not start this wave to make the
release feel complete.**

- **D8** — a `context-reader` row in `EXTRA_SLOTS`, so a delegated read can go
  to a cheap or foreign worker. It inherits the journal, the spend log, the
  credential triangle, the fence and the resume path for free, and it inherits
  the announcement obligation too.
- **D3 option (c)** — the block message names that dispatch instead of naming
  the ladder step.

If W0 did not earn it, write that down in `findings/W5-refused.md` and move on.

---

### W6 — documentation and the version bump *(class: C)*

The P0 rules in `CLAUDE.md`, all of them, in one commit:

| File | What |
|---|---|
| `templates/hooks/README.md` | The user's half — what the gate does, what it never does, and **every state in which it is silent**. Simplified Technical English |
| `README.md` | Latest version + date; newest changelog entry only |
| `CHANGELOG.md` | The full entry (this is what `orc changelog` fetches) |
| `knowledge.md` | The new section, and a pointer from the read-ladder discussion |
| `CLAUDE.md` | One rule block, in the house voice, naming the enforcement and the honest limits |
| `orc-ui-wiki.md` | **Only if a panel surface changes.** This release has none — record that it was checked |
| `package.json` | `npm version minor` → 1.6.0, then `npm publish` |

**Commit hygiene:** `templates/**`, `bin/**`, `package.json`, `CLAUDE.md`,
`knowledge.md`, `README.md`, `CHANGELOG.md`. **Never** `read-gate-notes/`.

---

## 4. What "done" means

The release is done when all five are true:

1. `npm run verify` prints `ORC package OK` **and** `ORC contracts OK`.
2. The full `npm test` is green, and any flake is **recorded, never retried
   away**.
3. `read_gate: off` is byte-identical to not having the hook — asserted by a
   test, not by intention.
4. Every honest limit is written where a user reads it: the gate is silent
   outside an open run, silent on a targeted read, silent under the threshold,
   and silent on both ladder exceptions.
5. `findings/` carries a measured number for the thing this release claims to
   improve — **or** a written refusal saying there was not one.

---

## 5. The sentence this release is trying to earn

> ORC's read discipline is enforced by a hook that can refuse, fails open, is
> silent outside a run, and names the cheaper path every time it says no.

If a wave cannot be traced back to that sentence, it is out of scope.
