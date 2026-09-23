# knowledge.md — Part II — The CLI (`bin/cli.js`)

**Read: on demand** — read when adding or changing a CLI command, a `--json` contract, an exit-code contract, `orc doctor`, or the config/phase/call registries.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4x. `orc doctor --json` + explicit handoff carry-over (v0.38.1)

Two small, independent items. Neither adds a skill, an agent, or a config key.

### `orc doctor --json` (bin/cli.js, `doctor()`)

`doctor()` already computes a list of findings; it just could not hand them to
anything but a human. It now COLLECTS as it prints. Each `warn()` call takes a
**stable machine id** as its first argument and pushes
`{ id, severity, message, fixable, …extras }` onto `findings`.

- **The exit code is unchanged in both renderings** (0 healthy / 1 issues found).
  The flag changes the RENDERING, never the semantics — that is the whole
  contract, and the test asserts both halves.
- With `--json`: exactly ONE object on stdout, nothing else. No banner, no
  colour, no update nudge (`doctor` never called `maybeNudge()`, so there was
  none to suppress). Printing is routed through a `say()` that is a no-op in JSON
  mode, so the two renderings can never diverge in WHAT they report.
- Shape: `ok`, `claude_dir`, `installed_version` (what is on disk, `null` when
  there is no payload), `package_version` (this CLI), `global_install
  {present, version, shadows}`, `findings[]`, `fixable` (would `doctor --fix`
  address at least one finding). **Keys are stable once shipped.**
- Ids: `no-payload`, `version-skew`, `global-skew`, `global-retired-agents`,
  `orphan-candidates`, `orphan`, `missing-files`, `settings-missing`,
  `effort-guard-unwired`, `trace-hook-unwired`, `trace-hook-matcher`,
  `trace-return-unwired`, `statusline-missing`, `trace-pointer-dangling`,
  `diy-stale`.
- `findings` holds **issues only** — a passing check is the absence of a finding,
  and `ok: true` + an empty array is the healthy report.
- The human report truncates path lists to five; the JSON path carries the
  **full** list (`paths[]`). Truncation is a display concern.
- Not fixable by `doctor --fix` (so `fixable: false` on the finding):
  `global-skew` / `global-retired-agents` (need `--global` — a global install is
  not this project's to prune), `diy-stale` (needs `orc diy compile`),
  `trace-pointer-dangling` (harmless by construction).
- **`--json --fix` is REFUSED** (stderr + exit 1). A mutation and a
  machine-readable read-only report are two different commands; silently handing
  a script the human output is the failure mode worth one branch to prevent.

### Handoff carry-over tables

`_shared/fallback-handoff.md` (`FALLBACK-FROM`, orc-fast → orc-mini) and
`_shared/drift-recovery.md` (`DRIFT-FROM`, the mock-example recovery round) each
gained a three-column table: **carries over · the receiver RE-DERIVES · on
conflict**.

The middle column is the point. Both handoffs already said what to attach;
neither said what the receiver must NOT inherit as fact. Now: the verbatim
request, the reason the handoff fired, and whatever the user already confirmed
carry over — while the knowledge gate, the plan, the scoring, the waves, the
build/test result and **every file claim the sender made** are re-derived. HOST
code (and, for drift, the current worktree) beats any inherited claim. An
inherited claim is a HINT with a known author, never evidence.

This is the existing precedence rule (`code > fresh wiki > stale wiki (hints) >
model priors`) applied across a handoff boundary. No new token, so no lint row.

Files: `bin/cli.js`, `templates/skills/_shared/{fallback-handoff,
drift-recovery}.md`, `test/cli.test.js`, `README.md`, `package.json`.

---

## 4z.21. v1.0.0 — config, phases and calls stop being prose

**The thesis, in one line:** ORC told you for eleven releases that *reading more
is not understanding more*, and then made every lane re-read the same config
prose, the same phase procedure and the same call description. v1.0.0 applies
its own rule to its own payload.

**It did not make the payload smaller, and that is recorded here rather than
softened.** 208 files / 26,507 lines became **291 files / 33,204 lines**. Of
sixteen waves, four measured as the class they were declared (E — fewer lines)
and most measured **C — correctness, at a small cost in lines**. Pointers plus a
manifest cost more bytes than duplication did. What changed is that there is now
ONE place to fix each of these, and a lint that fails when a copy grows back.

### 4z.21.1 Pillar 1 — config is a rank-ordered registry

Every lane used to restate the config it reads and re-derive the precedence
around it. `orc/SKILL.md` declared 8 keys while the `/orc` directory referenced
32 — the per-lane key list already existed and was already 75% wrong.

- **`orc lane config <lane> [--json]` is the ONE resolver.** It answers what a
  lane's config resolved to with every shadow and inertness ALREADY WORDED. A
  lane never merges `.claude/orc.config.yaml` itself and never re-derives a
  precedence. **A rank below a resolved rank is NOT READ AT ALL.**
- **`CONFIG_FAMILIES.ranks[]` is the model**, so a new forcing mode is a ROW and
  not a branch. `shadowReason()` derives from it instead of carrying one
  hardcoded rule.
- **Six rank states, and they are the CLI's** — `resolved`, `partly-resolved`,
  `not-read`, `inert`, `demoted`, `absent`. `absent` and `not-read` are
  DIFFERENT FACTS: one rank was consulted and declined, the other was never
  looked at. Rendering them alike erases the difference between *your setting
  did nothing* and *your setting was never read*.
- **A two-way lint**, six assertions, none satisfiable by mentioning a word in a
  paragraph. A key no lane reads is an error; so is a lane naming a key the CLI
  cannot write. **Ten keys are permanently empty and sit on a NAMED allowlist**
  (`SEED_EMPTY` in `bin/verify-contracts.js`) — they are operating keys of the
  `orc extra` BRIDGE, which a lane calls but never names. That set is a
  documented boundary, not a to-do.
- `_shared/config-precedence.md` is the canonical prose; `orc/config.md` went
  389 → 137 lines and keeps the score table.
- The `fable5_*` role override is **removed**; the retired-key mechanism reports
  all three by name rather than ignoring them.

### 4z.21.2 Pillar 2 — one canonical phase, and manifests over it

`_shared/phases/` holds one copy per phase; each lane spine is a MANIFEST over
that library. `orc/SKILL.md` went 526 → 238 lines.

- **`orc lane phases <lane> [--json]`** answers which shared phases a lane runs,
  in order, which layers to read, and when.
- **A row names a FILE or a HEADING — never both, never neither**, and never a
  LINE NUMBER (`/orc-doc` rule 2: a stored line number is a wrong line number one
  edit later). The two-way lint catches both a missing row and a phase-shaped
  heading nobody declared.
- **The class-D move was MEASURED AND REFUSED for 20 of 21 lanes** (W14). Those
  lanes loop, everything genuinely shared had already left, and relocating their
  own wording would buy a round trip per phase for the same bytes. Only
  `orc-wiki` qualified and moved (spine 332 → 171, five phase files).
- **FIVE LANES STAY `own_phases: in-spine` ON PURPOSE** — orc-mini, orc-grill,
  orc-handoff, orc-aftermath, orc-export. Their pipeline lives in a fenced code
  block where only some phases have a `##` heading, so a heading-derived manifest
  would declare half a pipeline. Converting them is a DECISION about whether a
  code-block row becomes a heading, not a mechanical edit.
- **`orc-diy/references/blocks/` was NOT deleted.** The plan said 448 lines would
  go; counted, **270 relocate · 178 stay · 0 delete**. Five blocks have no
  counterpart anywhere in the payload, and 233 of the 448 lines are
  `<!-- diy:when -->` composition prose describing what a phase becomes under
  each config value — which no shared phase file contains, because `/orc` has no
  such choice to express. Stitching the library's `full` layer instead would put
  `/orc`'s review procedure into a compiled flow that has review switched OFF.

### 4z.21.3 Pillar 3 — one call catalogue

Eleven CLI invocations were re-described 14–59 times each, every copy re-wording
its own exit codes. **`orc lane calls [--all] [--json]`** is the one catalogue:
the command, what it answers, its exit codes, its cost, when to call it, **what a
lane must do when the answer is empty**, and what it must never do. Every lane
that makes a catalogued call carries a `## Calls` pointer and nothing more.
`_shared/read-ladder.md` now covers reading **ORC's own payload**, so a manifest
of pointers does not become more round trips than the prose it replaced.

### 4z.21.4 The three behaviour changes

1. **The score→model table is SIX bands and ends `opus-5-low [65,90)` ·
   `opus-5-med [90,100]`.** Two bands in six now need an Opus 5 main session
   where one in eight did. `opus5_only` is TWO bands, `[0,90)` low · `[90,100]`
   medium, sharing that round-90 edge. Fifteen files carry a band or a retired
   executor name and the wave that changes the table changes all of them in ONE
   commit — see `CLAUDE.md`, which is authoritative on that list.
2. **The stall demotion** (§4z.20 is the stall itself). Two consecutive `stalled`
   dispatches on one profile in one run — or one live attempt quiet for
   `extra_demote_stale_min` minutes — drop that profile to the bottom of its
   families for the rest of the run. **TWO CLOCKS, NEVER MERGED**, each with its
   own key and its own `0`, and either `0` disables that clock and says so. It
   **writes no new measurement**: every fact comes from `EXTRA_FAILURES.stalled`,
   the `timeline` and the CLI-written journal, the verdict is recomputed FROM
   DISK on every read, and the only thing stored is the HUMAN half — a promote or
   a hand demotion with its reason, in `{run_dir}/{slug}/extra-demotion.json`,
   deleted with the run. It never writes your config, never auto-promotes, and
   never changes WHAT runs. **A promote is a WATERMARK, not a mute.**
3. **D29 — `orc diy init` defaults `session_tier` to `opus-5-high`.** The old
   `opus-4-8-high` could not outrank the top TWO bands after change 1, so a
   wizard-built flow arrived with a third of its ladder collapsed onto one agent
   before the user chose anything. The clip is correct and announced; it is now
   something you opt into by naming a lower tier. **Existing configs are
   untouched** — a default is not a migration.

### 4z.21.5 The panel renders it and decides none of it

- **Settings ▸ "Who decides what"** — the rank ladder per contested family, from
  `config list --json`'s new `families_resolved`. `families` is the static
  registry; this is what those ranks DID against the config on disk. It is
  resolved **project-wide with NO lane**, because inertness is a fact about a
  lane and claiming it here would claim a lane's answer for the whole project.
  The panel never walks the ladder and never names a contested key.
- **Per-key `lanes[]` chips.** An EMPTY list is an ANSWER and keeps its row
  (§4z.21.1's ten bridge keys) — skipping it makes *no lane reads this* and *we
  did not render it* identical.
- **A Lanes panel**, two tabs: Phases and Calls. A lane with no shared phase SAYS
  SO; `when` is chipped verbatim with no label map; calls expand in place, one at
  a time (the Runs-row rule).
- **Extra ▸ Recovery ▸ the demotion row** — the counter (at zero too), both
  clocks, the evidence, and **Promote, which REQUIRES a reason**. The card
  renders even when nothing is demoted: the mirror of *a lane that sends work off
  Claude without saying so* is a lane that quietly STOPS. There is deliberately
  **no Demote button** — demoting by hand is a terminal diagnostic, and a button
  would invite muting a provider instead of fixing it.
- **`orc doctor` gains `lane-keys-drifted`**, routed to Maintenance. It asserts
  on disk what `bin/verify-contracts.js` asserts in the source tree, in both
  directions, and it fires in the state that matters: a CLI that knows a lane
  reads keys sitting on a spine from before that lane had the contract — which is
  exactly when a lane falls back to resolving config itself and gets a shadowed
  key wrong, silently.

### 4z.21.6 The test harness, and the flake

`npm test` went 596 → **669** tests and from one global concurrency to **POOLS BY
RESOURCE CLASS** (`pure` 14 · `spawn` 4 · `net` 2 · `heavy` 1) overlapping under
one global cap.

**The flake that cost four waves their gate, diagnosed:** every `extra` test arms
its fixture with a real `orc extra ping`, and rung 1 of that ping is a hardcoded
3-second wall clock in PRODUCT code with no test seam. On a loaded box a loopback
answer misses it, the ping falls THROUGH to rung 2's 20 s exactly as designed, and
an assertion about which rung answered fails at ~23 s — on a different file every
run, green in isolation, with nothing printing the word "timeout".

- **`extraProbeMs()` is the ONE seam over every probe budget** (3000 / 8000 /
  20000 / 60000), on the `ORC_TEST_BUDGET_FLOOR_MS` precedent. Unset it returns
  its argument and shipped behaviour is byte-identical; nothing in ORC ever sets
  it. `test/_helpers.js` hands every child 60000 — the largest budget any probe
  already asks for — and a shell value still WINS, so the forcing direction stays
  reproducible by anyone.
- **The cap was never the lever.** The scheduler admits a job only when
  `running < GLOBAL` **and** `inPool < POOLS[pool].concurrency`, and `net` is
  pinned at 2 whatever the global cap says. Lowering the cap only serialises the
  run into two lanes that are more often two loopback files, for longer. W14's
  cap-2 diagnostic measured 612.8 s; 1,225 / 2 = 612.5.
- **THE HONEST CAVEAT, and it travels with the gate:** three consecutive green
  full runs are the plan's bar, **not proof**. The same box is green with the
  seam OFF (measured: 383.7 s vs 373.6 s of net-pool work, both arms green), so
  an idle run cannot distinguish a fixed flake from a quiet afternoon. Under
  deliberate load the seam-off arm failed and the seam-on arm did not, but the
  one failure was `test/cli/extra-journal.test.js:428` — a 12-second ABSOLUTE
  assertion guarding what its own comment calls a ratio, which neither seam
  governs. That is a **fourth wall clock**, test-side, unseamed, and it is
  recorded rather than nudged: moving a threshold on the evidence of one loaded
  run is the shape of retrying a flake away (plan §5 rule 14).
- **`--json is not a summary` binds `bin/test-run.js` too.** Its `failures[]`
  carries `pool`, `ms`, `started_s` and `tests[]` (name, duration, location, the
  assertion) — the gap that cost W14 the answer, because four runs recorded four
  different failure sets and could not say which tests failed or how long they
  took.

---

## 4z.22. v1.1.0 — the wait, and a window ORC can finally see

The statusline had the numbers all along. `rate_limits.{five_hour,seven_day}`
reaches ONLY that process, which renders a string and exits — so nothing else in
ORC could ever see how full a window was. A lane started a wave blind, and the
wave stopped in the middle.

### 4z.22.1 One engine, two triggers

`/orc-wait 30 hard` (typed) and `usage_gate` (computed) are the SAME engine.
Never build two. **A typed wait always wins over a computed one**, and a block
suppresses only the computed half — `/orc-boundary`'s rule: a gate constrains
ORC's own dispatch, never an explicit instruction.

### 4z.22.2 A wait is a STOP

Registered token: **`a lane that waits without a hand-back`** — the eighth member
of the family with `a lane that answers its own interview question`, `a lane
that picks its own favourite`, `a lane that fixes what it judged`, `a lane that
picks its own council`, `a lane that reads its own document`, `a lane that sends
work off Claude without saying so` and `a lane that re-does work the worktree
already contains`. Canonical prose: `templates/skills/_shared/wait.md`.

The hand-back is written BEFORE the wait, in every mode, because the thing that
resumes the run may not be this session: the wake-up is a Claude Code behaviour
ORC cannot promise, and a terminal can be closed.

### 4z.22.3 The three modes differ in ONE thing

How much finishes first. `safe` waits for a safe point. `soft` stops at the next
model turn but **FORCES** the checkpoint — if that write fails it does not stop
(`stop-resume.md` step 2, unchanged). `hard` is **the dispatch-free stop**: it
writes only what ORC can write with its own hand (step 3b), which is exactly why
it is fast and exactly why it can lose an in-flight return.

**"the next model turn" is the honest promise.** A typed message arrives at a
turn boundary, so `hard` cannot interrupt a dispatch already in flight. Never
write "immediately" — a user who reads that and watches a wave finish believes
the command failed.

### 4z.22.4 Nothing runs during a wait

A DETACHED command sleeps; no model runs and no tokens are spent. An agent
dispatched to wait would run on the same account and consume the very window the
wait exists to protect. **Hops are short (≤30 min) on purpose:** each wake-up is
session activity, and session activity is the only thing that makes the
statusline write a fresh reading. One long sleep wakes into a reading as stale as
the sleep was long.

### 4z.22.5 UNKNOWN IS NOT LOW

`orc usage check` — 0 ok · 1 low · **2 unknown** — is the ONE reader of
`.claude/orc/usage.json`. Exit 2 never stops a run, in any mode: older Claude
Code sends no headers, and a long dispatch leaves the reading stale by its own
length. A gate that blocks on a missing number is a gate people switch off. The
bridge stores RAW numbers plus `context_used_percentage` and **never a computed
word** — the `computeWikiFreshness` rule, applied to a reading.

**THE WORST WINDOW DECIDES.** A 7-day window at 96% is not a green light because
the 5-hour one is at 20%.

### 4z.22.6 After the wait, ORC does not drag a large context forward

Context small → continue here. Context large → STOP and offer both paths,
recommending the fresh session. A wait over one hour has already expired the
prompt cache, so continuing re-reads the whole context at full input price
exactly when quota is lowest. **ORC cannot clear its own context** — `/clear` is
the user's action; the wait offers the swap and never performs it.

### 4z.22.7 The block is the user's veto, and it is recorded

`orc wait block <slug> --reason "<why>"`. The reason is **REQUIRED** (the
run-close / doc-ship rule); it is run-scoped and **never written to config**; it
is re-announced with its AGE at every gate it suppresses, because there is no
auto-expiry — ORC does not decide a user's reason stopped being true.
`orc wait cancel` is a DIFFERENT command: block is before, cancel is during.

### 4z.22.8 The registry, and the rollout

`WAIT_LANE_SHAPES` in `bin/cli.js` mirrors the `## Which lanes support a wait`
table, golden-tested BOTH DIRECTIONS — the `EXTRA_LANE_SHAPES` / `DIY_STEPS`
precedent. **`checkpoint: "none"` is an ANSWER, not a gap:** a single-dispatch
lane has nothing to checkpoint, so all three modes collapse there and the row
says so rather than being omitted. All 24 spines were wired in ONE release, each
carrying the token plus a 4-line pointer GENERATED from the registry — a wait
whose behaviour depends on which lane you are in is worse than no wait.

### 4z.22.9 Everything is off by default

`usage_gate: off` · `usage_stop_pct: 10` · `wait_default_mode: ask` ·
`wait_hop_minutes: 30` · `wait_max_hops: 5`. A fresh install behaves exactly as
before. `ask` is a real value, not an absence: a typed `/orc-wait 30` asks which
mode with the cost of each spelled out, so there is no stop behaviour the user
did not choose (`pattern_findings: ask` / `mock_example: ask` precedent).
`wait_hop_minutes` and `wait_max_hops` join `SEED_EMPTY` — a lane runs
`orc wait plan` and the CLI reads them, the same shape as the extra bridge keys.

`orc-wait` is also in `LANE_INERT`: **this lane dispatches nothing**, so every
family that answers "which model runs this" is inert with a reason. A setting
that does nothing must never be reported as live.

### 4z.22.10 The panel shows a wait; it can never start one

`orc ui ▸ Wait` renders `orc usage check` and `orc wait …` and derives nothing —
not the state word, not the worst window, not a checkpoint kind. Its two
mutations are `unblock` and `cancel`, and **both undo something**. A block cannot
be created from the panel: it needs a reason typed in the moment, and a reason
typed into a settings page days later is not the record that makes the risk the
user's. `wait.css` is a FLEX column, never a declared grid — the card's child
count changes with its state (`unknown` has no bars), which is the `.ex-tool`
250px-ellipse lesson.

## 4z.23. v1.2.0 — a retry that cloned the agent, and a window you can watch empty

Two halves, and the first one is the most expensive bug this repo has shipped.

### 4z.23.1 A Task error does not kill the agent behind it

**The finding, from a real graded run.** `/orc-quick` in a user's project,
trace `run-quick-rmt-recipient-approval-030926-191813.txt`:

```
20:25:32 SPAWN  Fix approval flow defects
20:29:51 SPAWN  Fix approval flow defects retry     <- +4m19s, the first is still running
20:48:50 SPAWN  Fix approval flow defects retry 2   <- +23m, both are still running
21:15:52 RETURN Fix approval flow defects          dur=50m19s
22:25:13 RETURN Fix approval flow defects retry    dur=115m22s
22:29:43 RETURN Fix approval flow defects retry 2  dur=100m53s
```

Every duration is exact against its own SPAWN. **266 minutes of Opus 5 agent
time for ONE authorised dispatch**, three agents editing the same files inside a
2h04m window. The healthy dispatches in that same trace are 17m8s, 5m20s and
3m19s; nothing else in four traces exceeds 17 minutes.

**The mechanism.** Claude Code's Task tool can fail, time out or be cut off
mid-turn while the subagent it started keeps running — and keeps writing files.
Every retry rule in the payload ended in "re-dispatch" and none of them checked
whether the previous attempt was still alive:

- `orc-quick/SKILL.md` — *"A broken return = a failure. Re-dispatch once."*
- `_shared/return-validation.md` — *"never repair a return yourself; re-dispatch."*

ORC already KNEW this failure mode and had written it down for a different path:
`orc-wait/SKILL.md` says *"⚠ hard: wave 3 had 2 dispatches in flight. Their file
writes may still land."* It was never applied to retries. The trace hook went
further and NORMALISED the condition — a whole subsystem for ">=2 agents in
flight", FIFO-popping pending records and emitting `RETURN ~agent ::
unattributed` — treating concurrent duplicates as a formatting problem rather
than an incident. Two of those lines are in the trace above.

**Why it compounds.** The likely trigger is a usage limit interrupting the turn
mid-dispatch. ORC classified the interruption as a failure, re-dispatched into a
live agent, then paid twice and hit the limit sooner. Supporting evidence: that
trace carries **zero orchestrator-written lines** — no `GATE`, `ENTRY`,
`DISPATCH`, `VERIFY`, `SMOKE`, `FINISH` — while the healthy run in the same
folder has all of them. A run that never completed a narration packet is a run
that was repeatedly interrupted.

**The fix.** `orc run inflight` (`runInflightCmd` in `bin/cli.js`) is the ONE
reader of the pending sidecar `orc-trace.js` has written on every `SPAWN` since
v0.34.2. The record existed for a release and a half; nothing read it.

- `0` clear · `1` in-flight · `2` unknown. Registered token
  **`a lane that re-dispatches over a live attempt`** — ninth in the family with
  `a lane that waits without a hand-back` and the rest.
- Canonical prose is `_shared/return-validation.md` **§0**, placed ABOVE every
  existing rule because every one of them ends in "re-dispatch".
- **Exit 2 REFUSES, and it is the one place in ORC where an absent reading
  blocks.** `orc usage check` exit 2 never stops a run; UNCHECKABLE never raises
  a pact's exit code; a STRUCTURAL wiki blind spot never passes AGING. The
  default inverts here because the errors are not the same size: a
  wrongly-refused dispatch costs one question, a wrongly-issued one costs a
  second Opus agent for an hour. **Refusing on unknown is the cheap error.**
- **An interrupted turn is UNKNOWN, never FAILED.** A usage limit, an API error,
  a dropped connection or a `Ctrl+C` between a dispatch and its return says
  nothing about the agent.
- **Unknown is not zero.** A missing sidecar, an unreadable one, records older
  than six hours, or a sidecar that disagrees with the trace's own SPAWN/RETURN
  balance all read `unknown` — never `clear`. Only a readable EMPTY sidecar whose
  balance agrees earns exit 0.
- **"Dispatch anyway" is always offered and is never the default.** An
  unreadable sidecar must never trap a run, and the user may always overrule.
- **The honest limit is stated rather than papered over:** it cannot see an
  AD-HOC dispatch (`/orc-quick` recon, dispatched by model+effort rather than a
  pinned `orc-*` agent) — the hook writes no `SPAWN` for one, so no record
  exists. Read-only and short, so the exposure is small, but a lane must never
  read `clear` as proof one finished.

Wired into `_shared/phases/execution.md` plus the six spines that re-dispatch
(`orc`, `orc-doc`, `orc-wiki`, `orc-quick`, `orc-mini`, `orc-fast`), catalogued
as `run-inflight` in `LANE_CALLS`, both tokens registered in
`bin/verify-contracts.js`. `orc-mini`'s spine budget moved 250 → 253 — the
`orc-poly` precedent (a budget moves when a contract genuinely has to land in a
spine). Tests: `test/cli/run-inflight.test.js`, which replays the real trace.

### 4z.23.2 The window you can watch empty

`usage.json` (v1.1.0 W4) is a SNAPSHOT. It cannot answer the question a user
actually asks mid-run — *how much has THIS session eaten* — which they could
otherwise only answer by remembering what the number was an hour ago.

- **`orc usage report`** (`usageReportCmd`) — 5-hour, 7-day, context, the
  session's own consumption, and the top consumers of the open run. Same
  0/1/2 convention as `orc usage check`.
- **The statusline keeps a per-session ledger**, `.claude/orc/usage-session.json`,
  beside the snapshot: raw numbers only, never a computed word, fail-silent —
  the same contract as the session-model and usage bridges above it.
- **A window RESET mid-session is not a refund.** What was consumed before the
  reset is banked into `accumulated` and the baseline moves, so the running
  total keeps counting across the boundary (10 → 55, reset, 4 → 12 reads 53%).
  A new `session_id` re-baselines to zero.
- **Never overclaim.** The rendered line is *"This session has consumed X% of the
  5-hour window and is still counting"*, and it always carries the caveat that
  the window is per ACCOUNT — a second terminal, a cloud session or anyone else
  on the same key moves it too.
- **A stale reading is SHOWN with its age but still reads `unknown`.** A gate
  rightly discards it; a report that hides it teaches people the number is
  missing when it is merely old.

**The measurement limit, and it decides the whole shape of the command.** Claude
Code records **NO token usage for a dispatched subagent** — `isSidechain` is
never set and no sidechain message carries a usage block, verified across every
transcript on two machines. So a per-executor TOKEN figure cannot be measured.
Rows therefore rank by **measured WALL TIME**, taken from the trace hook's own
`SPAWN`/`RETURN` lines, and every Claude row reports `tokens: null` plus the
reason — **never `0`, which would tell the reader the work was free**. Only
`orc extra` foreign workers report real four-kind vectors, and those rows say
so. Inventing the rest would be the same class of bug as §4z.23.1. This is the
`measured is not unknown` / `unknown is not zero` pair (v0.53.0, v0.53.2)
applied to a third surface.

An open dispatch from the pending sidecar is counted as a consumer and marked
`RUNNING` — it is real spend happening now, and it is exactly what §4z.23.1
exists to catch. `RETURN ~agent :: unattributed` is a >=2-in-flight bookkeeping
artefact and is never counted as a dispatch.

Tests: `test/cli/usage-report.test.js`, including the ledger driven through the
real installed hook.

**The statusline gained a second line** — `agents N (M running) · orc-extra:
on/off · lanes: … · Xm` — plus a `sess +X%` segment on the first. Three rules
make it honest and cheap: dispatches are attributed by the trace's OWN line
timestamps rather than the file's mtime (a run already in flight when the
session started otherwise gets counted twice, and mtime cannot tell two sessions
apart); a lane is named only if it actually dispatched this session; and the
scan is THROTTLED to 5s with its answer cached in the ledger, because a
statusline re-renders on every keystroke. Trace stamps have SECOND resolution
while `started_at` has milliseconds, so the session boundary is floored to the
second the trace can actually express — otherwise a dispatch in the same second
as the session start is silently dropped. `running` is never hidden: an agent
still in flight is exactly what §4z.23.1 exists to surface. Tests:
`test/cli/statusline-session.test.js`, including the no-`rate_limits` case
(older Claude Code sends no usage headers, and the session line must not depend
on them).

**A FLAKE IS RECORDED, NEVER RETRIED AWAY** (the v1.0.0 rule, applied to itself).
The first full-suite run after this line landed came back 735/2; the next came
back 737/0. The only wall-clock dependence in the suite was the new tests
SLEEPING past the 5s scan window, which is a race on a loaded machine.
`ORC_STATUSLINE_SCAN_MS` is now the ONE seam over that budget — the
`ORC_TEST_PROBE_MS` / `ORC_TEST_BUDGET_FLOOR_MS` precedent, unset it is
byte-identical to a hardcoded 5000, and nothing in ORC ever sets it. The tests
set it to `0` to measure BEHAVIOUR and to `999999999` to prove the THROTTLE, so
neither direction sleeps. **A test that proves a throttle by waiting for it is a
test that fails on a busy afternoon.**

### 4z.23.3 What this release deliberately did NOT add

- **No config key for the in-flight guard.** A guard you can switch off is off
  on the run you needed it for — the `extra_resume` / spend-log reasoning.
- **No `orc ui` panel yet.** The CLI half is the foundation and ships first; the
  panel renders it and decides none of it (the Flow-stepper rule).
- **No token estimate for a Claude subagent.** See above. A fake measurement
  would be worse than none.

---
