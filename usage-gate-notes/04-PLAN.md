# Plan — the usage gate and `/orc-wait`

Target version: **v1.1.0** (new feature, backward compatible → `npm version minor`).

This plan is written in ordinary English, per your instruction. The three
explainer files stay in Simplified Technical English.

> **Status: W1–W5 BUILT.** All five decisions (D1–D5) settled. W6 (panel) and
> W7 (docs + version bump) pending. Nothing is committed.

---

## 1. What ships

| # | Thing | Why |
|---|---|---|
| A | Statusline writes `.claude/orc/usage.json` | nothing saves the numbers today |
| B | `orc usage check --json` | one reader, exit-code contract |
| C | `/orc-wait` — the manual wait, three modes | your eyes beat a 30-minute-old file |
| D | `_shared/wait.md` — the cross-lane contract | one copy, never forked into a spine |
| E | `WAIT_LANE_SHAPES` + `orc wait lanes` | which lanes support what |
| F | `usage_gate` — the automatic trigger | the same engine, decided by the CLI |
| G | `orc ui ▸ Wait` | configure it, see it, cancel it |
| H | README + CHANGELOG cautions | `hard` can lose work |

C is the piece that ships first and proves the engine. F is the same engine
with a computed trigger instead of a typed one.

---

## 2. The one engine, two triggers rule

Do not build two wait mechanisms.

```
        typed: /orc-wait 30 hard          computed: usage_gate at 90%
                     │                              │
                     └──────────┬───────────────────┘
                                ▼
                    the wait engine (_shared/wait.md)
                    1. resolve the mode
                    2. reach the stop point for that mode
                    3. hand back  (stop-resume.md, mode-scaled)
                    4. hop, detached, ≤30 min per hop
                    5. re-check, or continue
```

A typed wait always wins over a computed one. A human decision beats a computed
one — the rule `/orc-boundary` already states.

---

## 3. The three modes

This is the core of the release. Each mode is a different answer to *"how much
are you willing to lose to stop sooner?"*

| Mode | Stops at | Hand-back written | Dispatches | Can lose |
|---|---|---|---|---|
| *(none)* = `safe` | the next **safe point** | full stop sequence | yes (checkpoint) | nothing |
| `soft` | the next **model turn** | full stop sequence, **forced** | yes (checkpoint) | an in-flight return |
| `hard` | the next **model turn** | `RESUME.md` only, best effort | **no** | an in-flight return, the checkpoint, the trace packet |

**Forced** means: if the checkpoint cannot be written, `soft` does not stop. See
D1 below.

### Why `hard` is defensible, not merely reckless

`stop-resume.md` step 2 dispatches a checkpoint subagent and says: *"If the
write fails → DO NOT STOP."* Step 3b says `RESUME.md` is written **by YOU,
never a dispatched agent** — because "a dispatch inside the stop sequence lets a
stop fail because a subagent did."

So `hard` is exactly **the part of the stop sequence that needs no dispatch**:
steps 3b, 5, 6, 7. It is fast *because* it dispatches nothing. That is a
principled definition, not a shortcut.

### What "the next model turn" really means

`hard` cannot interrupt a running dispatch. Claude Code queues your message; it
arrives at the next turn boundary. So the honest promise is:

> `hard` stops at the first moment ORC can act, and does not wait for the
> current wave, phase or gate to finish.

Say this in the skill and in the README. Do not write "immediately".

### D1 — SETTLED: `soft` exists to prevent loss

> *"this is to prevent things got lost — why this is soft — to force write
> resume on supported lane before stopping, then continue, rest is user
> choice."*

`soft` = **force the hand-back, then stop, then hop, then continue.**

The word that matters is **force**. On a lane the registry marks as supported,
`soft` does not merely *try* to write the hand-back before stopping:

1. It writes the full stop sequence — checkpoint, `state-of-play.md`,
   `RESUME.md`.
2. **If the checkpoint write fails, it does not stop.** It reports the failure
   and stays in the run. This is `stop-resume.md` step 2 verbatim: *"Stopping
   without a good checkpoint is the one thing that loses work."*
3. Only then does it hop.

That is the whole difference from `hard`. `hard` accepts the loss to leave
sooner; `soft` refuses to leave until the work is safe.

So all three modes hop, and they differ only in how much they finish first:

| | finishes the wave | forces the checkpoint | hops |
|---|---|---|---|
| `safe` | ✓ | ✓ | ✓ |
| `soft` | ✗ | ✓ | ✓ |
| `hard` | ✗ | ✗ (RESUME.md only, best effort) | ✓ |

### What happens when the wait ends — "rest is user choice"

ORC does not silently drag a large context forward. When the hops finish:

```
The wait ended.  usage: 5h 9% (4h51m) · context: 34%

  Context is small. I continue here.
  ── Wave 4 of 6 · 2 tasks ───────────────────────────────
```

```
The wait ended.  usage: 5h 9% (4h51m) · context: 81%

  Context is large, and the prompt cache expired during the wait.
  A fresh session is cheaper and cleaner.
    → new session, then:  orc resume rate-limit-api
  Or reply `continue` to go on here.
```

The rule: **auto-continue only while the context is small.** When it is large,
stop and offer both paths — auto-continuing into a bloated context is the exact
cost the wait was supposed to avoid. `stop-resume.md` step 6 already mandates
offering both paths; this only decides when ORC picks for you.

The threshold reuses the reading already in `usage.json`. It gets **no config
key** — see §9.

---

## 3b. `/orc-wait block <reason>` — the user's veto

The counter-command. It says: **for the rest of this run, do not stop me.**

Your example: the window resets in 5 minutes, the running task needs 10, so a
stop would cost more than it saves. You accept the risk. ORC obeys.

### `block` and `cancel` are different, and must never be conflated

| Command | When | What it does |
|---|---|---|
| `/orc-wait block <reason>` | **before** a wait | suppresses every wait for the rest of the run |
| `orc wait cancel` / Ctrl+C | **during** a wait | ends the hops now and continues |
| `/orc-wait unblock` | after a block | the gate is live again |

### Rules

1. **The reason is required.** `/orc-wait block` with no reason is refused by
   name. Precedent: `orc run close --reason`, `orc pact` retirement,
   `orc doc ship --force --reason`. A recorded reason is what makes the risk
   the user's, provably.
2. **Run-scoped. It never writes your config.** The `ultra_mode` precedent —
   forced run-scoped, never persisted. A veto you set once should not silently
   apply to a run you start next month.
3. **It is announced at every gate it suppresses.** A shadowed setting must
   never be silent — this repo's most repeated rule.

   ```
   ── Wave 4 of 6 · 2 tasks ───────────────────────────────
   usage:  5h 96% (4m) · at the gate
   ⚠ blocked by you 12m ago: "window resets in 5m, task needs 10"
     I continue. The risk is yours. `/orc-wait unblock` to restore the gate.
   ```
4. **No auto-expiry.** ORC does not decide that your reason stopped being true.
   But the age is printed every time, so a block set three hours ago cannot
   apply silently.
5. **It survives a resume.** It is run state, in `{run_dir}/{slug}/`. It is
   re-announced on the first gate after the resume.
6. **It blocks the gate, never a typed command.** `/orc-wait 30 hard` still
   waits while a block is active — you typed it, so you meant it. A block
   suppresses what ORC computes, not what you ask for. Same shape as
   `/orc-boundary`: it gates ORC's dispatch, never your instruction.

### CLI half

`orc wait block <slug> --reason "<why>"` · `orc wait unblock <slug>` ·
the state is reported by `orc wait status --json`. The skill never writes the
file — the CLI does, so it can never be behind the disk (the v0.49.5 hand-back
lesson).

---

## 4. Safe points and stop points, per lane

A safe point is a place where the run can stop with no loss. Unsafe points are
the same for every lane:

- between a dispatch and its validated return
- inside the stop sequence itself
- during a file write, a `splice`, or an `orc wiki sync`
- before the smoke gate reports

`safe` waits for the next safe point. `soft` and `hard` do not — which is the
whole point of them, and the whole risk.

### `WAIT_LANE_SHAPES` — the registry

Mirrored in `_shared/wait.md`, golden-tested **both directions**, exactly like
`EXTRA_LANE_SHAPES` (`bin/cli.js:23621`) and `DIY_STEPS`.

| Lane | Checkpoint | Safe point | `soft` | `hard` |
|---|---|---|---|---|
| `/orc` | full | wave / phase edge | ✓ | ✓ |
| `/orc-ultra` | full | wave / judge gate | ✓ | ✓ |
| `/orc-mini` | full | after the executor returns | ✓ | ✓ |
| `/orc-fast` | full | after the executor returns | ✓ | ✓ |
| `/orc-diy` | full | compiled phase edge | ✓ | ✓ |
| `/orc-doc` | full (`doc.json` + `RESUME.md`) | wave edge | ✓ | ✓ |
| `/orc-wiki` | full | scan-task boundary | ✓ | ✓ |
| `/orc-quick` | entry | after an entry closes | ✓ | ✓ |
| `/orc-challenge` | cycle | after a cycle records | ✓ | ✓ |
| `/orc-brainstorm` | snapshot (exists) | phase edge | ✓ | ✓ |
| `/orc-grill` | snapshot (exists) | round edge | ✓ | ✓ |
| `/orc-poly` | doc set | per-repo plan write | ✓ | ✓ |
| `/orc-analyze` | full | after the analyst returns | ✓ | ✓ |
| `/orc-learn` | none | single dispatch | ✓ | ✓ |
| `/orc-plan`, `/orc-verify`, `/orc-pattern`, `/orc-claude` | none | single dispatch | ✓ | ✓ |
| `/orc-explain`, `/orc-route`, `/orc-boundary`, `/orc-budget`, `/orc-aftermath`, `/orc-export`, `/orc-retro`, `/orc-pact` | none | n/a — read-only, seconds long | plain wait | plain wait |

**Checkpoint: `none` is an answer, not a gap.** A single-dispatch lane has
nothing to checkpoint. `/orc-wait` there is a plain wait, and the message says
so. A row that reads "none" must never render like a missing row — the
`orc extra` slot-table rule.

**`orc wait lanes` prints all rows always**, including the ones that cannot
checkpoint.

---

## 5. The context question

You asked that `/orc-wait` act as a quick stop and resume so the context does
not bloat.

`stop-resume.md` step 6 already does this. It tells the user both paths and
recommends the fresh session when the conversation is long. Reuse it verbatim.

**One addition.** The statusline payload also carries
`context_window.used_percentage` (`orc-statusline.js:66`). Save it into the same
`usage.json`. Then the wait can make an informed recommendation instead of a
generic one:

```
The wait ended.  usage: 5h 9% · context: 81%

  Your context is large. A fresh session is cheaper here.
    → open a new session, then:  orc resume rate-limit-api
  Or reply `continue` to go on in this session.
```

**Honest limit, and it goes in the README:** ORC cannot clear its own context.
`/clear` is a user action. After a wait longer than one hour the prompt cache
has expired anyway, so a fresh session costs no more than continuing — and
carries far less. The wait is therefore the *natural* place to offer the swap,
but it can only offer it.

---

## 6. The hop loop

Unchanged from `01-how-it-runs.md`, and shared by all three modes:

```
1. Write the hand-back (mode-scaled — see §3).
2. remaining = the requested time, or resets_at - now
3. hop = min(30 min, remaining)
4. Run a DETACHED command that waits hop seconds.   ← 0 tokens, no model
5. On wake: run `orc usage check --json`.
6. Exit 0, or the requested time elapsed → continue. Else go to 3.
7. Maximum 5 hops. Then stop with the hand-back and say why.
```

Hop ≤30 min is deliberate: each wake-up is session activity, which makes the
statusline run again, which makes the next reading fresh.

**Cancel:** Ctrl+C. Also `orc wait cancel` writes a flag that the next hop
reads — that is how `orc ui` can cancel a wait it cannot see.

---

## 7. CLI surface

| Command | Exit codes | Notes |
|---|---|---|
| `orc usage check [--json]` | 0 ok · 1 low · 2 unknown | the one reader |
| `orc wait lanes [--json]` | 0 | renders `WAIT_LANE_SHAPES` |
| `orc wait status [--json]` | 0 active · 1 none | reads the wait state file |
| `orc wait cancel` | 0 · 1 nothing to cancel | ends an ACTIVE wait |
| `orc wait block <slug> --reason "<why>"` | 0 · 1 no reason · 2 no run | the veto; reason required |
| `orc wait unblock <slug>` | 0 · 1 not blocked | restores the gate |
| `orc wait plan <spec> [--json]` | 0 · 1 unparsable · 2 no reading | turns `30`/`2h`/`until 18:41`/`reset` into hops |

`orc wait plan` exists so the skill never does the arithmetic. Same reason
`orc doc next` exists: a pipeline the model recomputes is a pipeline that
drifts.

**`--json is not a summary`** — every one of these returns the whole computed
object, including the fields the human branch prints.

---

## 8. `orc ui ▸ Wait`

The panel **renders what the CLI computes and derives nothing** — the
Flow-stepper rule, with a test that greps the panel for literals it must not
own.

| Card | Source | Action |
|---|---|---|
| Current window | `orc usage check --json` | none (read-only) |
| Active wait | `orc wait status --json` | **Cancel** (free → a button) |
| Block | `orc wait status --json` | **Unblock**; shows the reason + its age |
| Lane support | `orc wait lanes --json` | none |
| Settings | `orc config list --json` | staged edits, Apply (v0.44.1 rules) |

A block **cannot be created from the panel** — it needs a reason typed in the
moment, and the panel never runs a lane. The panel shows it and removes it.
A run with no block **keeps its slot** and reads "not blocked".

**The honest limit, stated on the card:** `orc ui` never runs a lane. It
**cannot start a wait** — a wait lives in your Claude Code session. The panel
configures the defaults, shows an active wait, and cancels one.

New file `bin/webui/css/panels/wait.css` → `<link>` in `app.html` **and** named
in `verify-package.js` (set equality, both directions). Panel prose is STE per
`i18n/TERMS.md`; never translate a state word, a config key or a command.

---

## 9. Config keys

Three new, on top of the two from the gate feature.

**Every default is OFF. ORC never stops you until you ask it to.**

| Key | Values | Default | Family |
|---|---|---|---|
| `usage_gate` | `off` `warn` `stop` `wait` | **`off`** | usage |
| `usage_stop_pct` | 1–50 | `10` | usage |
| `wait_default_mode` | `ask` `safe` `soft` `hard` | **`ask`** | wait |
| `wait_hop_minutes` | 5 · 10 · 15 · 30 (closed set) | `30` | wait |
| `wait_max_hops` | 1–12 | `5` | wait |

### Why `off` and `ask`, not `warn` and `safe`

`usage_gate: off` means the automatic half does nothing until you enable it. On
a fresh install ORC behaves exactly as it does today. The whole gate is opt-in.

`wait_default_mode: ask` means a typed `/orc-wait 30` with no keyword **asks
which mode**, in one turn:

```
> /orc-wait 30

  Which mode?
    1. safe — finish wave 3 first, then wait. Loses nothing.
    2. soft — stop at the next turn. Forces the checkpoint first.
    3. hard — stop at the next turn. No checkpoint. Can lose wave 3.
```

There is no shipped stop behaviour you did not choose. Precedent:
`pattern_findings: ask` and `mock_example: ask` are both existing ORC defaults,
and `orc challenge init --council` has no default and refuses by name.

Set `wait_default_mode` to a mode to skip the question. `/orc-wait 30 hard`
never asks — a named mode always wins.

**`usage_stop_pct` is the "minimum left" setting you asked for.** It is inert
while `usage_gate: off`, and `orc config set` names it as inert — a shadowed
key must never be silent.

All five need a row in `CONFIG_FAMILIES` so `orc lane config` can answer for
them, and a `lanes[]` list (not empty — these are read by lanes, unlike the
`orc extra` bridge keys).

**Refused, and written down so nobody proposes them again:**

- `wait_enabled` — a second master gate; `usage_gate: off` already is one.
- `wait_allow_hard` — you asked for `hard`; a key to disable it is a key that
  is off on the run you needed it for.
- a per-lane on/off key — a lane you can park is a lane you can delete.
- a key for "auto-resume in a fresh session" — ORC cannot clear its own context.
- `wait_context_threshold` (the §3 auto-continue rule) — a number you tune to
  stop ORC asking is a number you set once to never be asked again, and then
  the bloated-context resume you were avoiding happens silently. It stays a
  fixed rule with a printed reason.

---

## 10. Trace

`/orc-wait` is **not a lane**. It opens no run, so it gets no
`run-wait-<slug>` pointer and no row in the lane enum. `/orc-explain` is the
precedent (a stated blind spot in `orc stats --help`, not an oversight).

It writes one CLI-composed line into the trace that is **already open**:

```
WAIT   mode=hard requested=30m start=18:44 end=19:14 hops=1/4 trigger=user
WAIT   block reason="window resets in 5m, task needs 10" by=user
WAIT   unblock
```

A block that leaves no line cannot be counted. `/orc-retro` must be able to see
that a run continued through a gate on the user's authority, and why.

Nothing when no run is active. `/orc-retro` can then see how long a run waited
and in which mode — and a `hard` wait that lost a return is visible afterwards.

**CLI-composed, never relayed through the model.** This repo has lost that bet
five times (v0.32.0 narration, v0.49.5 hand-back, v0.53.2 spend log, v0.54.0
journal, v1.0.0 W5 demotion). A wait that leaves no line cannot be counted.

---

## 11. The contract token

Register in `bin/verify-contracts.js`:

> **`a lane that waits without a hand-back`**

Eighth member of the family with `a lane that answers its own interview
question`, `a lane that picks its own favourite`, `a lane that fixes what it
judged`, `a lane that picks its own council`, `a lane that reads its own
document`, `a lane that sends work off Claude without saying so`, and `a lane
that re-does work the worktree already contains`.

Canonical prose: `templates/skills/_shared/wait.md`. Lane spines keep the token
and a pointer — never a forked copy.

---

## 12. Documentation (P0 rules in `CLAUDE.md`)

| File | Change |
|---|---|
| `README.md` | version + date, newest entry only, **the caution box** |
| `CHANGELOG.md` | the full entry |
| `knowledge.md` | new section §4z.22 |
| `CLAUDE.md` | the hard-rule bullet |
| `orc-ui-wiki.md` | the Wait panel |
| `guides/` | the long form, if the README entry runs long |

### The caution, for README and CHANGELOG

> **⚠ `/orc-wait … hard` can lose work.**
>
> `hard` stops at the first moment ORC can act. It does not wait for the
> current wave, phase or gate to finish, and it dispatches nothing — so it
> writes `RESUME.md` and skips the checkpoint.
>
> What you can lose: a dispatch that was in flight (its file writes may still
> land, but its return is never validated), the checkpoint, and the phase's
> trace packet.
>
> Use `hard` when losing the current wave is cheaper than losing the window.
> Use `soft` when you can spend a few seconds. Use no keyword at all — the
> default — when you can wait for the wave to end.
>
> **A wait longer than one hour ends the prompt cache.** The first turn after
> it reads your whole context again, at full input price, exactly when your
> quota is lowest. When the context is large, resume in a fresh session — ORC
> cannot clear its own context, it can only offer the swap.
>
> **`/orc-wait block <reason>` moves the risk to you, on purpose.** It
> suppresses every computed stop for the rest of the run. If the window empties
> mid-wave, the wave stops in the middle and you keep the pieces. Your reason is
> recorded in the trace, and the block is re-printed with its age at every gate
> it suppresses. `/orc-wait unblock` restores the gate.
>
> **Nothing here is on by default.** `usage_gate` ships `off` and
> `wait_default_mode` ships `ask`. A fresh install behaves exactly as it does
> today. You choose every stop.

---

## 13. Tests (`test/`, zero-dep `node:test`)

| Test | Asserts |
|---|---|
| statusline writes `usage.json` | shape, raw numbers, no state word |
| statusline stays silent on a write failure | the line still renders |
| `usage check` exit codes | 0 / 1 / 2, and >30 min reads `unknown` |
| `usage check` never blocks on `unknown` | exit 2 is not exit 1 |
| `wait plan` parses every spec | `30`, `90m`, `2h`, `until 18:41`, `reset` |
| `wait plan` refuses `reset` with no reading | exit 2, names the fix |
| `wait block` refuses with no reason | exit 1, names the flag |
| a block suppresses a computed gate | and does **not** suppress a typed `/orc-wait` |
| a block is announced with its age | never silent, at every gate |
| every default is off | `usage_gate: off`, `wait_default_mode: ask` |
| hop arithmetic | last hop is the remainder, not a full hop |
| `WAIT_LANE_SHAPES` golden | matches `_shared/wait.md`, both directions |
| every lane in the registry exists | a row naming no command fails |
| panel-literal grep | the panel owns no mode, lane or state word |
| `verify-package.js` set equality | `wait.css` is named and present |
| contract lint | the new token is registered with its exact file set |

---

## 14. Implementation waves

Each wave ships and is useful alone.

| Wave | Content | Depends on |
|---|---|---|
| **W1** | `_shared/wait.md`, `WAIT_LANE_SHAPES`, `orc wait lanes`, `orc wait plan`, the contract token | — |
| **W2** | `/orc-wait` skill + command, three modes, the hop loop, the trace line | W1 |
| **W3** | Lane wiring: **every row of the registry, one release** — the token + a pointer into ~20 spines | W1, W2 |
| **W4** | Statusline `usage.json` write (+ `context_window`), `orc usage check` | — |
| **W5** | `usage_gate` — the automatic trigger on the W2 engine | W2, W4 |
| **W6** | `orc ui ▸ Wait` + `wait.css` + i18n | W1–W5 |
| **W7** | README, CHANGELOG, knowledge.md, CLAUDE.md, orc-ui-wiki.md, version bump | all |

W1+W2 alone give you a working `/orc-wait` with no reading and no config. That
is the smallest useful release, and I recommend cutting there if the rest slips.

---

## 15. Risks specific to this release

| # | Risk | Protection |
|---|---|---|
| 1 | `hard` leaves a half-written file from an abandoned dispatch | `RESUME.md` records what was in flight; the resume checks the worktree before re-dispatching — the v0.54.0 rule, `a lane that re-does work the worktree already contains` |
| 2 | Users read "hard" as "instant" and think it failed | Answer at once; print when the wait starts and in which mode |
| 3 | W3 touches ~20 spines in one release; one gets a forked copy | The contract lint fails on an unregistered copy — that is what it is for. This is the single largest risk in the release, and it is the reason you chose one release: a half-rolled-out wait is a wait whose behaviour depends on which lane you are in |
| 4 | The payload grows again (v1.0.0 already grew it: 208→291 files, 26,507→33,204 lines) | Measure before and after and **name the class from the count** — this wave is C (correctness at a small cost in lines), not E. A pointer per spine, never prose |
| 5 | `soft` and `safe` feel the same on a fast lane | On a single-dispatch lane they *are* the same; say so in `orc wait lanes` |
| 6 | The wait is cancelled but the run does not know | `orc wait cancel` writes a flag the next hop reads; the hand-back is already on disk |

---

## 16. Decisions taken

| # | Decision | Answer |
|---|---|---|
| D1 | `soft` semantics | Force the hand-back, stop, hop, continue. A failed checkpoint means it does **not** stop. §3. |
| D2 | Rollout | **Every lane in one release.** W3 covers all ~20 registry rows. |
| D3 | Auto-continue after a wait | Only while the context is small; otherwise stop and offer both paths. No config key. §3. |
| D4 | `/orc-wait block <reason>` | Ships. Reason required, run-scoped, announced with its age, no auto-expiry. Blocks a computed gate, never a typed command. §3b. |
| D5 | Defaults | **All off.** `usage_gate: off`, `wait_default_mode: ask`. A fresh install behaves exactly as today. §9. |

Nothing is blocking. The plan is ready to execute on your word.

> **Reminder:** this folder is a working-process document. `CLAUDE.md` forbids
> committing one. `usage-gate-notes/` is untracked — leave it out of git.

---

## W1 — DONE ()

Shipped: `templates/skills/_shared/wait.md` (canonical prose, contract token
`a lane that waits without a hand-back`) · `WAIT_LANE_SHAPES` + `orc wait lanes`
+ `orc wait plan` in `bin/cli.js` · two rows in `bin/verify-contracts.js` (the
token, and the code-vs-prose table token) · `wait.md` registered into the
`RESUME.md`, `RETURN-TO` and `FALLBACK-FROM` file sets · `test/cli/wait.test.js`
(17 tests) · `orc help`.

Two bugs the tests caught before they shipped:

1. `positionals()` did not skip `--hop` / `--max-hops` VALUES, so
   `orc wait plan 5h --max-hops 3` parsed the spec as `"5h 3"` = 5h3m. The
   documented `EXTRA_VALUE_FLAGS` failure, one release later.
2. `padEnd` on an ANSI-coloured string mis-aligned every row of `wait lanes`.

Deferred to a later wave by design: `wait_hop_minutes` / `wait_max_hops` are
READ here (with `--hop` / `--max-hops` overriding) but not yet registered as
config keys — they land with the rest of the key set. `readUsageBridge()` is the
reader half; the statusline WRITER is W4, so `wait plan reset` correctly exits 2
(`no-reading`) until then.

---

## W2–W5 — DONE

**W2 — the lane.** `templates/commands/orc-wait.md` + `templates/skills/orc-wait/SKILL.md`
(six steps W1–W6, three modes, the veto). CLI: `orc wait status|block|unblock|cancel`
over `{run_dir}/{slug}/wait.json` — ONE writer, the CLI, so the state can never
be behind the disk. `WAIT` trace lines are written BY THE CLI into the trace
already open, best effort. Rows added to `LANES` and to `LANE_INERT` (this lane
dispatches nothing, so every dispatch family is inert and says why).

**W3 — every lane, one release.** 24 spines carry the token + a 4-line pointer,
GENERATED from `WAIT_LANE_SHAPES` so a spine cannot disagree with the registry.
`/orc-ultra` and `/orc-plan` have no spine — both are covered by
`skills/orc/SKILL.md`. Two tests guard it: every declared lane is wired and its
values match the CLI, and no block exceeds four lines (prose creeping into a
spine is what the budget exists to stop).

**W4 — the bridge.** `orc-statusline.js` writes `.claude/orc/usage.json`: raw
numbers only, plus `context_used_percentage`, fail-silent. `orc usage check`
is the ONE reader — 0 ok / 1 low / 2 unknown, worst-window-decides,
`unknown` never stops a run.

**W5 — the keys.** Five, in a new `wait` config family, **every default off or
ask**. `wait_hop_minutes` / `wait_max_hops` joined the `SEED_EMPTY` allowlist —
a lane runs `orc wait plan` and the CLI reads them, the same shape as the extra
bridge's keys. The computed gate is documented in `_shared/wait.md`; the
mandatory `usage:` preflight line is in `_shared/phases/preflight.md` — one
copy, not 24.

### Verification

`npm run verify` green (39 skills, 46 agents, 177 contracts).
`test/cli/wait.test.js` — 39 tests, all passing. Full suite 707/708.

Four suite failures were REAL and are fixed: five new keys moved the config
count 72 → 77 in `config.test.js` (x2), `lane.test.js` and the
`config-keys.json` golden. The one remaining failure is
`extra-resume.test.js:55` — the `net`-pool fake provider timing out at 90s. It
passes in isolation (13/13) and my changes do not touch that path, but it is
recorded here rather than retried away.

### Deviations from the plan

- The spine block was cut from 18 lines to 4 after `orc-mini` and `orc-analyze`
  blew their spine budgets. The lint was right: a pointer, not prose.
- `RESUME.md` is deliberately NOT named in the spine blocks. Saying "the
  hand-back" instead keeps 24 spines out of that contract's file set, which
  would have coupled every lane to an unrelated change.
- `orc wait cancel` is built; the hop loop that reads its flag is the skill's,
  so the flag is written and read by W2's SKILL.md rather than by the CLI.

### Left for W6–W7

W6 `orc ui ▸ Wait` + `wait.css` + i18n. W7 README/CHANGELOG/knowledge.md/
CLAUDE.md/orc-ui-wiki.md + `npm version minor`. Nothing is committed.
