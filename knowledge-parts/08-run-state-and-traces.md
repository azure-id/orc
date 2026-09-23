# knowledge.md — Part VI — Run state, traces & retro

**Read: on demand** — read when touching behavior traces, the trace hook, phase packets, checkpoints, `RESUME.md`, `orc stats`/`orc run`, or the current project status log.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4b. Behavior-trace logging (PERMANENT — always on)

A persistent trace of a run's own behavior, for improving the skills from real
runs. **Always on — there is no `logging` toggle** (removed in v0.17.2). Every
ORC run traces.

- **Config:** only `log_dir` (default `.claude/orc/logs`) in `config.md` — the
  folder location. There is no on/off key. Separate from the decision log
  (`run/…md`, agent knowledge, deleted on success) — traces are **persistent and
  never auto-deleted**; the folder's top level holds the run `.txt` plus its
  sidecars (`.pending.json`, and since v0.32.0 `.jsonl`), reports live under
  `retro/`.
- **Deterministic bootstrap (v0.17.2 — the fix):** the old design gated the hook
  on `logging:true` AND a `.current` pointer that ONLY the orchestrator LLM
  created at run start. When the model skipped that bookkeeping (common; certain
  after compaction), nothing was ever created — no folder, no `.txt`. Now the
  hook is the deterministic writer: on the first dispatch of an `orc`-prefixed
  agent it `mkdir`s `log_dir` and writes `.current` itself, so a trace exists for
  every run regardless of model memory. `appendLine` also `mkdir`s defensively.
- **Tool-name + rotation fix (v0.23.0 — the "only RETURN lines, merged across
  days" bug).** Two independent failures compounded: (1) the installed
  `PreToolUse` matcher was `Task`, but newer Claude Code dispatches subagents
  via the `Agent` tool — so the SPAWN branch (and its bootstrap/rotation) never
  fired; (2) `.current` was never expired, and the RETURN branch required only
  that a pointer EXIST — so every `SubagentStop` from every later session
  (ORC or not) appended `RETURN` into the same stale file for days. Fix: the
  matcher is `Task|Agent` (and `orc update` repairs a stale Task-only matcher
  in place); the hook treats a trace idle >6h (`STALE_MS`) as a finished run —
  the next ORC dispatch rotates to a fresh `.txt` — and a RETURN is written
  only while the live file has fewer hook `RETURN` lines than `SPAWN` lines,
  so an unmatched stop can never bleed in.
- **Universal (v0.7.0):** EVERY entry point traces, not just `/orc` — orc,
  orc-mini, orc-wiki, and standalone `/orc-analyze`(+mini), `/orc-plan`,
  `/orc-pattern`, `/orc-verify`, `/orc-claude` each write the run-pointer +
  markers for their own phase set (a lane running inside a bigger run never
  opens a second trace). Before v0.7.0, orc-wiki never wrote `.current`, so a
  wiki run with `logging: true` produced no `.txt` at all — that was the bug;
  orc-claude carried the SAME latent bug (its trace step was an orphaned
  paragraph the "dispatch and stop" flow skipped, and it claimed `PHASE`/`GATE`
  markers for phases that run inside its writer sub-agent) until the trace step
  was woven into its dispatch procedure and trimmed to the single-dispatch
  marker set (`DISPATCH`/`VERIFY`/`FINISH` + the hook's `SPAWN`/`RETURN`).
- **Three layers.** (1) The `orc-trace.js` hook writes the compaction-proof
  `SPAWN`/`RETURN`/`PHASE-EDGE` skeleton. (2) The rich markers reach the file
  through the orchestrator's phase PACKET → the pinned `orc-trace-writer-haiku-4-5`
  (v0.32.0; before that the orchestrator appended them itself — see the revamp
  bullet below): `PHASE`,
  `WIKI-CONSULT` (v0.17.3 — records the wiki peek: freshness tier + which pages
  grounded the run; full/ultra + mini at planning, fast at slice-build; lanes
  that don't read the wiki emit nothing), `CROSSLINK` (v0.28.0 — cross-repo
  peer-knowledge state at the consult point: `cached` \| `configured-no-cache`
  \| `none`, plus per-task `CROSSLINK inject`), `SCORE`, `DISPATCH`, `VERIFY`,
  `QUESTION`, `FINDING`, `VERDICT`, `OUTCOME`, `GATE`, `FINISH`. (3) Each
  subagent returns `actual_model` + `actual_effort`.
- **Model source of truth (why layer 3 exists).** A hook cannot read a subagent's
  model id — it lives only in the subagent's injected system prompt ("The exact
  model ID is …"), while `$CLAUDE_EFFORT` is in the env. So each agent's return
  contract quotes that line verbatim (never guesses; `unknown` if absent) as
  `actual_model` and reports `$CLAUDE_EFFORT` as `actual_effort`. The orchestrator
  compares these against the expected (agent name → `config.md` table) and emits
  `VERIFY … ✅ MATCH` or `⛔ DOWNGRADE` — catching the "subagent capped to the main
  tier" bug. This was verified empirically: a pinned Sonnet 4.6 executor spawned
  from an Opus 4.8 session correctly self-reported `claude-sonnet-4-6`.
- **Run-pointer handshake:** the orchestrator writes `log_dir/.current` (the trace
  filename) at run start and deletes it at run end; the hook keys off it, and
  bootstraps it if the orchestrator didn't. The checkpoint carries
  `logging_enabled` + `trace_path` so a resumed run re-anchors.
- **Write cadence (v0.19.0 — the "trace only got one line" fix).** The hook
  bootstrap (v0.17.2) guaranteed a `.txt` exists; it did NOT guarantee the rich
  markers land in it. No lane stated WHEN to write them, so the orchestrator
  treated the trace as an end-of-run summary — and by `FINISH` the run's context
  was compacted, so the file held the skeleton plus (at best) one line. The trace
  is now contractually a **running record**: append each marker at the moment its
  event happens, BEFORE announcing that step to the user (phase entry, dispatch,
  return validation, task close, verdict, run end). Batching at the end is also a
  false record — the timestamps ARE the run's timeline. The enforceable self-check
  is the lint token `zero new trace lines is a protocol violation`, stated inline
  in all 8 trace-owning lanes (orc, orc-mini, orc-fast, orc-analyze, orc-wiki,
  orc-verify, orc-claude + `references/trace-protocol.md`) — a phase that ends
  unlogged must append the missing lines immediately, in the events' real order.
- **Inline imperatives on the full lane (v0.28.0 — the "full-lane trace is still
  SPAWN/RETURN-only" fix).** The v0.19.0 cadence contract made the trace a
  running record, but on the FULL lane the emit instruction lived only in each
  phase's `· Trace:` header annotation — a summary, not a work step — so the
  orchestrator still produced only the hook skeleton. `/orc-fast` never had this
  problem because it restates the emit as a numbered step INSIDE every phase
  body. The fix replicates that: every Phase 0–8 body in `orc/SKILL.md` now
  carries its own inline `emit <VERB> …` step (folded into existing step
  sentences), and `references/trace-protocol.md` states the inline-imperative
  rule explicitly ("the `· Trace:` header tag is only a summary; the instruction
  is the inline emit step"). The consolidated Behavior-trace block was compressed
  to point at the inline steps rather than re-enumerate the cadence (the
  duplication the inline steps now own). Spine budget raised 335→350 (§4k).
- **The trace revamp — narration is DISPATCHED, not remembered (v0.32.0).** A
  real 8-task `/orc` run produced a trace with ONLY `hook SPAWN/RETURN` lines
  despite BOTH prior fixes. v0.19.0 (cadence contract) and v0.28.0 (inline emit
  steps) failed the same way: rich narration depended on the model remembering to
  append lines, and under real load (long runs, compaction, parallel waves) it
  never does. The one behavior the trace proves ORC performs reliably is
  **dispatching agents** — every SPAWN/RETURN in the failed trace exists because
  a dispatch is an ACTION, not a memory. So the pen moved onto that behavior:
  - **The writer.** `orc-trace-writer-haiku-4-5` (pinned Haiku, tools
    `Read, Bash, Glob`) appends ONE phase block per dispatch — whole block in a
    single `>>` heredoc so concurrent hook lines never interleave mid-block — and
    mirrors it to the `.jsonl`. It writes ONLY what the packet holds (absent
    field = omitted, never guessed), never reads project source, and returns
    `{lines_written, jsonl_written, renamed, trace_path, actual_model,
    actual_effort}`.
  - **Phase packet.** `phase`, `run_meta {lane, slug, trace_path}` (first packet
    only), `events[] {ts, verb, tail}` from the CLOSED verb set, and the free-text
    `decisions` field — the WHY layer (scoring rationale, user answers verbatim,
    what was rejected) that no earlier trace ever captured. **Timestamps are the
    events' real times, never "now"** — a late block with true stamps is a late
    record; one stamped at write time is a FALSE record.
  - **Pairing rule (the anti-forget mechanism).** Phase N's writer dispatch is
    issued in the SAME tool block as phase N+1's first dispatch, so logging
    piggybacks on the action the model reliably performs. Phases with no next
    dispatch (FINISH, aborts, pure-question phases) dispatch solo; the FIRST
    packet is solo + synchronous (rename safety), the LAST returns before
    `.current` is deleted.
  - **Scope — three tiers, every trace-owning lane narrates.** Build lanes
    (`orc`/ultra, mini, fast) send per-phase packets (full ≈7–9, mini batches to
    3, fast to 2); `orc-wiki` sends one per scan-batch boundary + one at end;
    every SINGLE-DISPATCH lane (`orc-claude`, `orc-plan`, `orc-analyze`+mini,
    `orc-pattern`, `orc-verify`, `orc-learn`, `orc-poly`, combiner) owes exactly
    ONE end-of-run packet. That obligation is defined ONCE in `trace-protocol.md`
    (which every trace-owning lane already loads) rather than re-enumerated in
    each micro-lane spine — which is why those lanes are deliberately NOT in the
    writer contract's token set. `/orc-retro` remains the sole exception (hard
    rule 4: it mines traces, it writes none) and the hook now ENFORCES that.
  - **Rich filenames.** `run-<lane>-<slug>-<DDMMYY>-<HHMMSS>.txt` — lane and
    subject readable without opening the file (retro aggregates per lane for
    free), `HHMMSS` so same-day runs never collide. Deterministic-with-repair:
    if the lane forgot the pointer, the hook bootstraps its generic
    `run-<DDMMYY>-<HHMMSS>.txt` and the FIRST writer dispatch renames the `.txt`
    + sidecars and rewrites `.current`.
  - **JSONL companion.** The `.txt` stays canonical and human-skimmable; the
    writer mirrors each event to `<trace>.jsonl` so retro mines structure instead
    of regexing free tail text (falls back to `.txt` for older traces; hook lines
    are `.txt`-only, so both are read and merged by timestamp).
  - Spine budgets raised 385→392 (orc), 260→264 (wiki), 195→197 (mini),
    170→171 (fast) — documented in `verify-contracts.js` (§4k).
- **Hook attribution hardening + phase inference (v0.32.0).** The same trace
  proved the DETERMINISTIC layer was not clean either:
  1. **Double RETURN.** A `SubagentStop` without `agent_type` FIFO-popped another
     agent's pending record; the real `agent_type` stop then found nothing and
     wrote a second, desc-less RETURN. Now an `agent_type` stop with no matching
     record while OTHER records are in flight is a DUPLICATE and is dropped. (An
     EMPTY sidecar is not a duplicate signal — that still degrades to a bare
     RETURN, the documented missing-sidecar behavior.)
  2. **Missing RETURN.** That blind pop STARVED the agent whose record it stole
     (`T5` never got a RETURN, and `returns >= spawns` never noticed because the
     totals balanced). Now an `agent_type`-less stop consumes a record only when
     exactly ONE is in flight; with ≥2 it writes `RETURN ~agent :: unattributed`
     and consumes NOTHING. Such lines are excluded from the `returns` count too —
     otherwise the restraint would starve the very RETURN it declined to steal.
  3. **Retro self-pollution.** `orc-retro-*` matched the `/^orc/` gate, so the
     miner bootstrapped a trace for the lane whose hard rule 4 forbids it. It is
     now on an explicit hook ignore-list (no bootstrap, no SPAWN, no RETURN).
  4. **`PHASE-EDGE` (zero-model-dependence phase inference).** ORC agent names
     encode their role, so on a SPAWN whose role family differs from the previous
     one the hook writes `PHASE-EDGE <family> :: first=<agent>` (families:
     analyst/scout→analysis, planner→planning, executor→execution,
     reviewer→review, verifier→verify, test-author→testgen, advisor/judge→
     ultra-gate; the trace writer never opens an edge). The failed trace, replayed
     under this change alone, segments into planning → execution → review →
     verify with zero orchestrator cooperation — and retro computes **narration
     coverage** (edges with a writer SPAWN between them vs without), the
     deterministic detector for the exact failure that motivated the revamp.
  All of it stays fail-silent, always exit 0 — "tracing never affects a run" is
  untouched. Covered by `test/hooks.test.js` (dedupe, approx restraint, retro
  exclusion, edge emission + suppression, rename-repair).
- **The pointer clobber, and the writer contract (v0.34.2 — 15 graded runs, 9
  lane-less stray trace files, the corpus's largest defect family).** Every fix
  above assumed the pointer handshake itself was sound. It was not:
  `traceStats()` returns null BOTH for "pointer written two seconds ago, the
  lane has not created the file yet" and for "dangling pointer, run long over",
  and the hook rotated on both — so a lane's own run-start step reliably SPLIT
  its run into a generic bootstrap file (hook skeleton, zero narration) plus a
  rich file (all narration, zero hook lines), each looking correct alone. The
  v0.32.0 protocol GUARANTEED the collision by making the first dispatch of a
  build lane the trace writer, at which instant the rich `.txt` provably does
  not exist. Two independent fixes, neither relying on the other:
  1. **Lane side:** run start writes `.current` **and `touch`es the trace file
     in the same step** — one filesystem call that makes the hook's existence
     check true by construction. New lint token `touch the trace file`, pinned
     to every lane that writes a pointer, so a lane added later cannot omit it.
  2. **Hook side:** when the pointed-at file is missing, the POINTER's own mtime
     decides — fresh (< `STALE_MS`) → honor the registered name and create the
     file under it, leaving `.current` alone; only a genuinely idle pointer
     rotates. This also restores the FIRST writer's `RETURN`, which the rotation
     dropped as unmatched (the pointer was back on a `spawns=0` file), leaving
     an unconsumable `.pending.json` on every run.
  Same release, the rest of the trace contract:
  - **Rename repair is decided against DISK** — repair when `.current`
    disagrees with the packet's `run_meta.trace_path` (a rich packet name beside
    a generic pointer IS the clobber signature), not "when the pointer is
    missing", a state the hook never actually leaves. Six evals show writers
    correctly DECLINING to repair because they honestly evaluated a mis-stated
    rule. The repair is a **MOVE**, never a fresh create beside the bootstrap.
  - **Counts are measured, not intended** — `lines_written`/`jsonl_written` come
    from `wc -l` before/after the append. They were wrong in both directions on
    4 runs, and the writer's own contract calls a mismatched count malformed, so
    a validating orchestrator would requeue good packets.
  - **The actor column is per-EVENT** (three docs pulled three ways; the `.txt`
    and `.jsonl` disagreed about the same events). `writer` means the writer
    speaking for itself — its `NOTE` — never a blanket stamp.
  - **The `decisions` NOTE mirrors to `.jsonl`** — stated explicitly, because
    writers split on the reading and retro lost the whole WHY layer for a third
    of a run's phases.
  - **`jsonl_path = trace_path + ".jsonl"`, appended, never `splitext`** — one
    writer stripped the `.txt` and put an entire review phase (its `FINDING`
    line included) into an invisible sidecar. The writer must also REFUSE to
    create a `.jsonl` that does not exist when `run_meta` is absent, and must
    never ask the dispatcher for `trace_path` (it is first-packet-only by
    design; `.current` is the fallback).
  - **`GATE` gains `facet` and `schema`**; the shared-band sibling-consistency
    determination goes in `decisions`, never as an invented verb (three
    consecutive evals reached for names that did not exist). `PHASE ship` now
    opens and closes, so strict phase pairing holds through `FINISH`.
  - **Lanes `diy` and `combine` exist.** `orc-diy` had NO trace protocol at all
    — the only lane skill that never referenced `trace-protocol.md` — so the one
    lane that clips the band table was the calibration blind spot. Fixed
    structurally: `references/blocks/trace.md` is stitched UNCONDITIONALLY by
    `orc diy compile`, so every composed flow carries it (cadence: one packet
    per ENABLED phase group, minimum 2). `context-combiner` gains the `combine`
    lane name and a hook role-family entry.
  - **Unbounded RETURN (T12).** An `unattributed` line claims no record, so it
    is excluded from `returns` and `returns >= spawns` could never stop it —
    every stop past the first wrote another, forever. Now bounded by the records
    actually in flight. The eval-17 harness graded a FROZEN v0.23.0 snapshot, so
    it was green over this live regression; it now refreshes its copy from the
    shipped payload on every run (10/10 against the live hook).
  - **Doc'd caveat:** CONTINUING an agent fires no hook pair, so the skeleton is
    a FLOOR on dispatch volume, never a census — read narration coverage with it.
- **Maintenance drift:** the `actual_model`/`actual_effort` return fields are
  duplicated across all executor + role + mini agent files and the
  `orc-execution` / `orc-review-verify` subskill contracts. Keep them identical.
  The cadence token spans the 8 lanes above plus the writer agent — pinned in
  `verify-contracts.js`, along with the v0.32.0 tokens
  `orc-trace-writer-haiku-4-5`, `PHASE-EDGE`, and the filename grammar
  `run-<lane>-<slug>-`. The v0.28.0 `` `CROSSLINK `` trace verb is pinned to
  `orc/SKILL.md` + `trace-protocol.md` + `wiki-consult.md`.

## 4p. Run integrity — rich full-lane traces, deterministic wave stop, visible knowledge gates (v0.28.0)

**The problem.** A real `/orc` run (7 tasks, 2 waves) produced a trace with only
the hook's `SPAWN`/`RETURN` skeleton, never paused between waves, and never told
the user anything about wiki/pattern/crosslink state. Three independent holes,
all confirmed against the payload — the full lane was silently under-instrumented
while the fast lane was not.

1. **Full-lane inline trace imperatives** — see §4b's v0.28.0 bullet. The emit
   instruction moved from a header annotation into each phase body as a real
   step, matching orc-fast.

2. **Deterministic wave stop.** `batch_pause_every` (default 2) used to be a
   *modulo cadence enforced by orchestrator judgment* at Phase 3. With 2 waves
   and `every 2`, the only boundary landed after the LAST wave — so nothing ever
   paused. It is now a **hard, deterministic gate**: after wave W, if
   `W % N == 0` AND a later wave remains, the STOP SEQUENCE is MANDATORY (never
   dispatch wave W+1 past an unacknowledged boundary; emits
   `GATE wave-boundary :: wave=W of K → STOP`). Phase 2 intake now shows the
   COMPUTED schedule and lets the user confirm it ("pause after every wave /
   every 2nd / run through → will pause after waves [list]"), so a 2-wave plan
   plainly offers "pause after wave 1". The answer is persisted as
   `pause_schedule` in the checkpoint (new field) and recomputed into each wave's
   `is_batch_pause`, so a resumed session enforces the same boundaries. Token
   pressure / user request remain judgment; the batch boundary is not. Canonical:
   `references/stop-and-resume.md` + `references/wave-grouping.md`.

3. **Visible knowledge gates (Phase-1 preflight).** The wiki tier, resolved code
   pattern, and crosslink state used to be silent on the happy path (FRESH wiki,
   cache hit, no ask). Each now prints exactly ONE user-visible line at Phase 1,
   gathered into a compact **preflight block** (`references/preflight-report.md`):
   - **wiki:** every tier prints, `absent` included (`wiki-consult.md` Step 1) —
     no tier is silent.
   - **pattern:** cache hit / codifying / agnostic each print one line
     (`pattern-gate.md`) — visibility only, still no ask, no cost on a hit.
   - **crosslink:** full orc consumes ONLY the pre-built
     `.claude/orc/crosslink/needs.json` + `cache/` (§4i) — it NEVER reads
     `orc-crosslink.config.yaml` at run time and NEVER reads peer source. So the
     report distinguishes `cached` (contracts will be injected) from
     `configured-no-cache` (config present, cache not built → explicit warning
     that peer wikis are NOT being read this run → run `/orc-wiki` to resolve).
     A new closed trace verb `` `CROSSLINK `` records the state + per-task
     injections.

**Budget.** All of the above adds spine prose to `orc/SKILL.md`, which was AT its
335-line budget. The now-redundant trace-cadence enumeration (the inline steps
own it) and duplicated fixed-role/config prose were compressed, and the budget
was deliberately raised **335→350** (§4k) in the same commit.

**Contracts registered** (`bin/verify-contracts.js`): the new `` `CROSSLINK ``
verb pinned to `orc/SKILL.md` + `references/trace-protocol.md` +
`references/wiki-consult.md`; the raised `orc/SKILL.md` budget; plus the new
copies of already-registered tokens the reports introduced (`` `GATE `` in
`stop-and-resume.md`, `orc-crosslink.config.yaml` + `crosslink/cache/` in
`wiki-consult.md`). No schema token was touched — `pause_schedule` is a plain
field addition to `checkpoint.md`/`planning-output.md`.

Files touched: `orc/SKILL.md`, `references/{trace-protocol,wiki-consult,
pattern-gate,stop-and-resume,wave-grouping,preflight-report}.md`, `config.md`,
`schemas/{planning-output,checkpoint}.md`, `bin/verify-contracts.js`.

---

## 4s. Execution-integrity revamp — plan handoff, attributable traces, facet scoring (v0.31.0)

Driven by a real cross-session run trace: a plan produced in session A, executed
in session B, that contained ONLY hook skeleton lines (`SPAWN`/`RETURN`) and
drifted (a declared file that never existed). Five problem areas; the verifier is
deliberately UNTOUCHED (it performed well). Root cause: there was **no defined
entry path for "execute a plan from another session"** — the executing session
improvised off-spine, so no rich markers fired, no waves formed, and the Phase 1
grounding gate (which ran at *planning* time in session A) was never re-run.

1. **Plan-handoff entry contract** (`references/plan-handoff.md`, lint token
   `plan-handoff.md`). When the run input IS a plan — pasted planning-output, a
   `plan-{name}.md` path, or an `orc/planner/{name}/` checkpoint — Phase 0 checks
   this FIRST (also wired into `intake.md` + the `orc.md` command). The mandatory
   sequence: bootstrap the trace (this IS a run), schema-validate against
   `planning-output.md` (malformed → re-plan via orc-planner, never improvise a
   field), apply the **`plan_head` staleness valve** (new schema field — HEAD at
   plan time, the mirror of a spec's `git_head`; `≠ current HEAD` or absent makes
   the grounding re-check compulsory), **RE-RUN the full Phase 1 exit gate in the
   executing session** (the deterministic catch for the phantom-file drift), relay
   `open_questions[]`, then run the NORMAL Phase 2–8. A plan input never skips
   Phase 2/3 nor executes task-by-task ad hoc. NOT a re-plan, NOT a scope
   re-litigation, NOT the poly-spec split-and-STOP path.
2. **Attributable RETURN trace (hook, deterministic).** `orc-trace.js` now pushes
   a pending record on each SPAWN into a `<trace>.pending.json` sidecar
   (`[{agent, desc, ts}]`, best-effort — a missing/corrupt sidecar degrades to a
   bare RETURN, never throws). On SubagentStop it resolves the finishing agent
   from `data.agent_type` (or FIFO-pops the oldest pending record and marks it
   `~` on older Claude Code that omits it), emits
   `RETURN <agent> :: <desc> dur=<m>m<s>s`, and appends ` model=<id>` when the
   return's `actual_model` is visible in `last_assistant_message` — so the
   downgrade check is deterministic even without the orchestrator's VERIFY line. A
   non-ORC `agent_type` is dropped, mirroring the SPAWN gate; rotation deletes the
   old sidecar. Still hook-written SKELETON, not an orchestrator obligation. Six
   new `test/hooks.test.js` cases cover it.
3. **Waves always exist (Part C).** Wave computation runs for EVERY run with ≥2
   tasks, sequential included — dispatch style controls only **intra-wave
   concurrency** (`wave-grouping.md`, `effort-and-mode.md`, `stop-and-resume.md`,
   `config.md`, SKILL Phase 2/3). Sequential fires a wave's tasks one at a time;
   the wave-boundary batch pause binds to wave numbers identically in both styles,
   so a sequential run no longer degenerates to per-task stops. The wave plan
   (wave → tasks → pause marks) is shown BEFORE wave 1 in both styles.
4. **Facet-scored rubric (Part D — replaces base+adjusters).** The PLANNER (who
   read every declared file) emits per-task `facets` — `breadth` (=
   `len(declared_files)`), `novelty`, `logic`, `test_surface`, cited `risk[]`,
   `uncertainty` — and the ORCHESTRATOR computes the score with a **fixed
   published formula** (the ONLY scoring text, in `effort-and-mode.md`):
   `B(breadth)+N(novelty)+L(logic)+T(test_surface)+5·min(fan_in,3)+3·min(fan_out,3)+U(uncertainty)`,
   clamp 0..100, `risk≠[] → floor 70` (DERIVED from a cited facet). The
   orchestrator **re-validates** breadth + fan_in/fan_out from the plan and
   bounces an uncited risk (grounding mechanics). Consistency rule: sibling tasks
   differing in ≤1 facet share a band or cite the differing facet. **EVERY
   dispatch is scored** — review-fix/verify-fix/P2-batch/requeue run the same
   formula, inherit the original task's risk floor, and never dispatch below the
   finding-task's band (`SCORE task=fix-<n> …`). The `SCORE` trace verb gains a
   `facets=<vector>` tail for `/orc-retro`. Lint token `facets` pins the schema +
   formula + spine + trace verb + all three planner agents. The 8-band
   score→model table (`config.md`) is UNCHANGED — the mapping was never the
   problem, the input number was.
5. **Planner clarity + step-back (Part E).** Plans return `plan_confidence:
   high|medium|low` and `open_questions[]` (`{question, proposed_default,
   blocking}`) — every ambiguity becomes an entry, never a silent reading. The
   orchestrator relays them after the exit gate (blocking answered before Phase 2;
   non-blocking show defaults for tacit approval); `plan_confidence: low` OR >3
   blocking questions → recommend stepping back to `orc-analyze` (user may
   override). Facets are filled during grounding (zero extra passes). Mirrored in
   the mini planner.

SKILL.md spine budget raised **360→385** (documented in `verify-contracts.js`
BUDGETS) for the four spine-wired parts. Files touched:
`templates/hooks/orc-trace.js`, `test/hooks.test.js`,
`templates/skills/orc/{SKILL.md,references/{plan-handoff.md (new),intake.md,
trace-protocol.md,effort-and-mode.md,wave-grouping.md,stop-and-resume.md},
config.md,schemas/planning-output.md,subskills/orc-planner{,-mini}/SKILL.md,
examples/full-run-mock.md,README.md}`, `templates/commands/orc.md`,
`templates/agents/orc-planner-{opus-4-8-med,fable-5,mini-sonnet-5-high}.md`,
`templates/agents/orc-retro-sonnet-5-high.md`, `templates/skills/orc-retro/SKILL.md`,
`bin/verify-contracts.js`, `package.json`.

### 4s.2 Making facets scorable, and scoping the TDD rules to reality (v0.34.4)

Part D shipped the formula but not its enforcement, and the TDD anchor shipped a
rule tuned for greenfield surface only.

1. **The facet gate was blind to the vocabulary it depends on.** It recomputed
   `breadth` + `fan_*` and checked that each `risk` had a `cite` — it validated
   the two facets it COULD recompute and TRUSTED the four it could not. A planner
   that never opened the schema invented a `low|medium|high` scale and produced a
   plan that passed the stated gate and was **arithmetically unscorable** (there
   is no `N("low")`), with 16 gate misses. The second failure path is worse than
   a bounce: an orchestrator applying `risk ≠ [] → floor 70` to seven bare prose
   risk strings floors EVERY task — a ~15-line constants module that belongs in
   `[30,40)` dispatches `orc-executor-opus-4-7-high`, a two-band overshoot caused
   by a field's SHAPE rather than by the work. Fix: the Phase 2 gate adds an
   **enum-membership check** (`novelty`/`logic`/`test_surface`/`uncertainty` and
   every `risk[].class`) — a set lookup, as deterministic as the grounding Glob.
   It is intermittent for a diagnosable reason: runs that pointed the dispatch at
   `schemas/planning-output.md` did NOT reproduce it, so the defect is *the
   values live one hop away from the instruction* — hence the vocabularies are
   now INLINE in all three planner agents' own step. Ship both together: the gate
   alone converts a silent scoring error into a bounce loop.
2. **A vocabulary bounce is a FIELD-SHAPE bounce**, and the gate says so — hand
   back the miss list with *do not re-plan*; the planner corrects only the
   `facets` blocks. (The observed good behavior also DROPPED three risk entries
   on the correction pass — test seeding and dependency discipline are
   implementation hazards, not risk CLASSES — which kept that task at 48 instead
   of floored to 70. Accept that judgment.)
3. **`tdd_spec` entries carry a `kind`** (`new-surface` | `regression-guard`).
   The old rule — *a test that passes pre-implementation is a spec bug* — is
   correct on greenfield surface and WRONG on delta work, and five consecutive
   runs had to override it: one materialized 7 tests of which 5 passed before any
   implementation, because both `:id` routes and both 404 branches already
   shipped and only the guard was missing. Applied literally it blocks 5 of 7
   requirements on a run whose entire delta is one middleware argument — and a
   regression guard's PASSING is the whole point. The control case (genuinely
   absent surface, 0 pre-passing) proves the rule right where it applies. The
   PLANNER authors the kind because it is the only party that knows which is
   which; a residual case is adjudicated with the user and recorded in the
   packet's `decisions`.
4. **Orchestrator-SYNTHESIZED tasks get one general scoring rule**
   (`wave-grouping.md`), not two local fixes. Wave 0 and the mock example appear
   in no `tasks[]`, so the party that did NOT read the code was inventing their
   facet vector — "judgment wearing arithmetic's clothes, the exact thing the
   facet redesign was built to eliminate". Their vector is DERIVED: `breadth` =
   file count, `novelty: mechanical`, `logic: none`, `test_surface` per the task,
   `risk: []` unless it inherits a cited one. Plus the open second-order
   question, now answered: **Wave 0 does not inherit the tested tasks' risk
   floor** — it transcribes planner-authored skeletons, writes no production
   code, and its output is asserted red before anything is believed.
5. **`drift-recovery.md` names its actor** (the example is DISPATCHED — orc hard
   rule 1 is absolute) and says WHY the old example must go: after a patch the
   previous `EXAMPLE.md` documents the SUPERSEDED contract as fact (one asserted
   "case-insensitive substring matching" citing a `String.includes()` that had
   become `.startsWith()`), so leaving it re-seeds the drift the loop exists to
   remove — and re-showing it burns a capped loop on our own artifact.
6. **Two small holes that cost two evals each.** `/orc-plan` is now IN the lane
   TDD-policy table (a saved plan's only consumers are TDD-always build lanes,
   so a plan without `tdd_spec` is unusable by the lane that runs it), and
   `preflight-report.md` defines the **TDD line** — both branches, not only the
   exemption `SKILL.md` mentions. That block is "presentation only", so the
   mandated exemption line had no defined producer at all; the planner, asked
   directly, said "it is not defined — I invented it."
7. **The tdd_spec / test-task collision** bounces at the Phase 1 exit gate: a
   `tdd_spec` target file inside a `new-tests` task's `declared_files` means Wave
   0 materializes that task's work before its wave opens. Not load-bearing (one
   run's planner anticipated it unprompted), but cheap and deterministic.

Grammar-shaped guards now live in `test/payload.test.js`: the closed vocabularies
parsed from the canonical table with a formula term asserted for every member,
the membership gate, inline vocabularies in all three planners, both `kind`
branches, the synthesized-task rule referenced from both sites, and a
set-equality check between the preflight template's keys and its line rules.

### 4s.1 The slice boundary is the WORKTREE, not the editor (v0.34.3)

A graded run produced the worst possible artifact: an executor dispatched with
`declared_files: [tests/summary.test.js]` and an instruction to confirm
`git diff --stat src/` was EMPTY **made that true by reverting** two files it
never wrote — destroying a completed, green, reviewed task — then returned
`src_untouched: "(no output …)"`, which was literally true. The suite fell 19 →
3 tests and `git status` showed a CLEAN tree, the most convincing disguise
destroyed work can have.

Why this was a payload defect, not one bad dispatch:

- **No rule forbade it.** "Surgical changes only — touch nothing orthogonal"
  does not read as "never run `git checkout`": a destructive git command is not
  a change to a *file*, it is a change to the whole worktree. Every executor
  ships with `Bash`.
- **Return validation could not catch it.** All five §-sections passed:
  `actual_files` was an honest SUBSET of `declared_files`. The executor genuinely
  *wrote* only its declared file — it *reverted* two others, and "reverted" had
  no field.
- **The audit compared a declaration to a SELF-REPORT.** A write nobody reports
  is invisible to it. Two milder instances (a 4.3K `test_output.txt` and a
  0-byte mangled-path file, both left at the repo root, both committable) passed
  the same audit correctly on the data it was given.

Four changes, all live-confirmed (11 executor dispatches, zero recurrence):

1. **House-rules card, rule 7** — `git checkout/restore/reset/stash/clean` are
   forbidden in a slice, AND an impossible assertion is `unmet`, never something
   to make true. The second clause carries as much weight as the first: the
   failure was treating an unsatisfiable instruction as satisfiable. The card is
   injected literally, so one line reaches all 8 executor bands + mini + fast.
   Card budget is 10 lines; this is the 7th.
2. **The post-wave audit reads DISK** (`wave-grouping.md`) — `git status --short`
   captured before the wave and diffed after every return. An undeclared changed
   path GATES the wave close (a report would be decorative), and **a file that
   became LESS modified is as much a violation as one that became more
   modified** — the only signature that catches a revert. This one change found
   all three defects in the class; nothing else did.
3. **`_shared/return-validation.md` §6 (canonical cross-lane copy)** — worktree
   delta as a validation step: `actual_files` is a CLAIM, the worktree is the
   EVIDENCE. orc / mini / fast / diy carry the pointer, never a forked copy.
4. **`agents-src/executor.template.md`** — the bound is on files you "create,
   edit OR OTHERWISE CHANGE THE STATE OF", naming git reverts explicitly.
   Regenerated into all 8 executors (`npm run build:agents`; verify fails on a
   hand-edit).

Guarded in `test/`: card markers intact, ≤10 lines, rule 7 present with both
clauses, and every generated executor carrying the new wording.

---

## 7. State / status

- Naming migration **complete**: everything ships as `orc` (the old
  `r0thchestrator` working name survives only as a historical note in
  `ORC-HANDOVER.md`).
- Package is feature-complete per the handover §8: full spine, all subskills,
  schemas, references, config, mini/verify/wiki/analyze/pattern/context-combiner
  skills, 16 agents, 6 commands, integrity guard.
- **v0.2.0 added:** orc-analyze v2 (doc-optional requirement-vs-code analysis,
  evidence-or-mark anti-hallucination, recommended-option challenges, opt-in deep
  mode with parallel scouts; new agent `orc-scout-sonnet-4-6-high`) and config as
  a first-class concern (`max_scouts`, `default_analysis_depth`).
- **v0.2.1:** config editing moved OUT of the model into the **`orc config` CLI**
  (interactive menu + `list`/`set`/`reset`/`path`), deterministic and zero-token;
  the `/orc-config` skill+command were removed. Also `orc upgrade` (fetch latest +
  apply, with an NVM-safe tarball fallback). The `orc config` defaults are mirrored
  in `cli.js` (documented drift vs config.md).
- **v0.3.x–v0.5.x (see README changelog for the full ladder):** behavior-trace
  logging (§4b, opt-in `logging`), Test Authoring Phase 6.5 (§4c, opt-in
  `generate_tests`), code-pattern findings (§4d, `pattern_findings`, the
  `orc-pattern` skill + codifier agent + 6 per-language playbooks),
  context-combiner skill + agent, external-review-driven description rewrites,
  statusline dated-model-id fix.
- **v0.6.0:** review/verify findings now use a **P0–P3 severity ladder** with
  distinct handling per level (P0 auto-fix no-ask · P1 ask-then-fix · P2
  optional fix-batch · P3 counted) replacing binary blocking|nit — trace marker
  is now `FINDING p0= p1= p2= p3=`, old checkpoints map blocking→p1/nits→p3.
  A standing **house-rules card** (`orc/references/house-rules.md`) injected
  literally into every executor slice (full + mini lanes). All **9 playbooks
  deepened** with real worked-example code (marked shape-reference, project
  wins) + measurable-only **Validation gates** — and the gate is **wired
  end-to-end**: codifier returns `validation_gate[]` → cached (optional
  pattern-doc section; old caches stay valid) → injected in the `pattern` slice
  (executors satisfy it) → reviewer re-checks it → verifier folds it into
  acceptance criteria (unmet enforceable line = P0); enforceable-vs-advisory is
  decided ONCE at reconciliation (measurability rule). **Three new languages**:
  `be-django`, `be-express`, `fe-angular` (+ INDEX precedence rules). **FE rule
  packs** `fe-a11y.md` + `fe-perf.md` (capped 15 rules each, impact-ordered,
  file:line, P1–P3 never auto-P0) passed to the reviewer as `fe_rules[]` on FE
  runs; executors read the environment's `frontend-design` skill on UI tasks
  when present. **Opt-in Phase 5.5 security pass** (config `security_review:
  off|ask|on`, default off) — fires only on runs with a task scored ≥ 70 (the
  existing risk floor), reuses the reviewer in `phase=security` with
  `orc/references/security-checklist.md` (12 OWASP/STRIDE items), wraps Semgrep
  if installed. cli.js CONFIG_META now mirrors `pattern_findings`,
  `security_review`, `orc_wiki_pattern_findings` (the first two were a missed
  mirror from v0.5.0 — fixed).
- **v0.7.0 (2026-07-12) — "evidence everywhere":** the analyst's
  evidence-or-mark discipline extended to every role via the pattern
  *instruction → contract → attestation → independent spot-check*. (1)
  **Planner grounding:** per-file `grounding[]` attestation
  (`{path, disposition: exists|new, evidence}`) + per-task `acceptance[]`;
  orchestrator Globs every `exists` path at Phase 1 exit, bounces misses (one
  retry). (2) **Executor evidence:** returns gain `evidence`
  {command, exit_code, tail — verbatim} + `no_runner_detected` + `unmet[]`
  (non-empty ⇒ never `done`); house-rules card +2 lines (never claim
  unobserved; honest partial). (3) **Findings evidence:** P0–P2 findings
  require `file:line` + verbatim `quote`, else AUTO-P3; orchestrator
  quote-spot-checks before any P0 auto-fix/P1 ask; verifier returns
  per-criterion `criteria[]` with evidence. (4) **`bin/verify-contracts.js`**
  drift lint wired into verify/prepack. (5) **Trace fixes:** orc-wiki wrote NO
  trace `.txt` with `logging: true` (never wrote `.current`) — fixed; trace
  protocol declared universal across every entry point (orc, mini, wiki, and
  standalone analyze/analyze-mini/plan/pattern/verify), each owning
  run-pointer + markers; nested lanes never open a second trace. New drift
  surfaces registered in the lint (executor evidence: 6 executors +
  orc-execution ×2 + orc/SKILL.md; grounding: 2 planner agents + 2 planner
  subskills + schema + orc/SKILL.md; AUTO-P3: reviewer/verifier agents +
  orc-review-verify ×2 + orc-verify).
- **v0.8.0 (2026-07-12) — "close the loop":** (1) **Grounded intake** — new
  Step 3.5 repo cross-check in `intake.md`: every file/module/behavior the
  draft intent-spec names is Glob/Grep-confirmed or tagged `UNVERIFIED`
  (proportional to tier; tags = ONE batched sign-off question; >3 tags →
  recommend `orc-analyze`; zero unresolved tags before planning). orc-mini
  runs the names-only depth. (2) **Scoring anchors** — six worked scoring
  examples in `effort-and-mode.md` (analogize, never vibe; >20-pt divergence
  from the nearest analog needs re-derivation or an override reason).
  (3) **`OUTCOME` trace marker** at every task close (`retries/requeues/
  needs_context/unmet` per band; mini uses `band=mini`) — the calibration raw
  material. (4) **New `orc-retro` sibling skill + `/orc-retro` +
  `orc-retro-sonnet-5-high` agent** (17 subagents / 18 files, 8 commands):
  mines traces into a per-band calibration report in `log_dir/retro/`;
  read-only/report-only, evidence-line-backed, n<3 labeled weak, writes no
  trace of its own. (5) **Eval harness** under git-ignored `eval/`: Express
  fixture + 3 scenario checklists (clean parallel run · analyst-vs-planted
  false doc claim · planner phantom path) to grade each payload bump — closes
  open item §8.4's "never exercised end-to-end" with a repeatable procedure.
- **v0.8.1 (2026-07-12) — "retro delivers upstream":** `/orc-retro` now
  hard-gates on a delivery channel BEFORE doing anything — authed gh CLI
  (`gh --version` + `gh auth status`) or a GitHub MCP server; neither → the
  retro refuses to run entirely (no mining, no local report). After the local
  copy in `log_dir/retro/`, the report is filed to **`retro_repo`** (new
  config key, default `azure-id/orc`) as a PR — branch `retro/<DDMMYY>`,
  report at `retro/incoming/`, shallow-clone when run outside the ORC repo —
  with an issue fallback on missing push/PR access; the run ends by showing
  the created URL and never claims unobserved delivery. Report format
  `orc-retro/v1`: YAML frontmatter mirroring the return contract verbatim
  (AI-readable) + short human sections. `retro_repo` is the 11th linted
  contract (config.md + orc-retro SKILL.md + command).
- **v0.9.0 (2026-07-12) — "trust-but-verify the analyst→planner chain":** the
  two upstream roles (System Analyst + Requirement Planner, both lanes) get
  the instruction → contract → attestation → spot-check treatment. (1)
  **Quote-anchored analyst evidence:** every code claim is
  `file:line — "verbatim snippet"` (no quote → auto-UNVERIFIED); absence
  claims (missing/buildable) carry `searched:` (the concrete globs/greps); the
  orchestrator spot-checks evidence on analyst return (Glob `files[]` +
  Grep-verify quotes on exists/conflict) and bounces misses — plus a
  report↔spec **derivation lint** (R# ids/statuses/context anchors must
  match) and a refusal on open UNVERIFIED / missing `scope_closed`. Specs are
  stamped `git_head`+`dirty`; a HEAD mismatch at plan time re-runs the
  evidence check (staleness valve). (2) **Coverage-gated planning:** tasks
  carry `requirements[]` (R#/DoD ids) + source-cited `acceptance[]` +
  `spec_invariants[]` (verbatim do-not-build lines appended to the executor
  slice's `constraints[]` at assembly); the planner returns a `coverage` echo
  the Phase 1 exit gate recomputes — orphan requirements bounce; cycle +
  same-file collision checks joined the gate. (3) **Anchors replace
  adjectives:** analyst standard-mode coverage floor (files[]-emitting rows,
  exists/conflict, scope-named claims); blocking-vs-advisory challenge triage
  (advisory batched, everything recorded); planner sizing anchors (1–5 files /
  one area / deviation-with-reason); "plannable" floor + valve on `/orc-plan`;
  numeric mini escalation thresholds (analyst: >10 pages / >12 reqs / >3
  conflicts / >5 stale rows; planner: >8 tasks / 3-deep chains / >2
  serializations); `handoff_ready` is a 5-point checklist. (4) **Leaner
  analyst skill:** rule 3a stated once; deep-mode + Phase F branching
  extracted to `orc-analyze/references/{deep-mode,branching}.md`; mini
  frontmatters gained natural triggers. (5) **`GATE` trace verb**
  (grounding/coverage/graph/evidence/derivation, pass|bounce) + retro mining
  of per-gate bounce rates; eval scenarios 04 (coverage orphan) + 05 (mini
  lane floors). Contract lint grew to 16 contracts (`searched:`, `git_head`,
  `orphan`, `spec_invariants`, backtick-`GATE`); orc-mini registered as a
  `disposition` consumer.
- **v0.10.0 (2026-07-12) — "the ultra lane":** new `/orc-ultra` command (the
  `orc` skill with `ultra_mode: true` forced run-scoped — no separate spine;
  deltas in `orc/references/ultra-mode.md`), new sibling skills
  **`orc-advisor`** + **`orc-judge`** (no own commands) and agents
  **`orc-advisor-opus-5-xhigh`** / **`orc-judge-opus-5-xhigh`** (19 subagents
  / 20 files, 9 commands). Phase U0 advisory brief + rubric + batched
  clarification round + assumption ledger; three judgment gates
  (analysis / plan / implementation) with structured verdicts, anchored
  consequence-cited blocking findings (auto-downgrade otherwise; security
  never downgrades), 2-loop caps with a convergence rule, and an ESCALATE
  menu; deterministic anti-miss core (traceability matrix, blast-radius map,
  project-own static analysis fed to gate 3); forced overrides (deep analyze,
  pattern/testgen/security on) + executor tier floor; `ADVISE`/`JUDGE` trace
  verbs + `judgment` GATE name; checkpoint `ultra` block. Contract lint grew
  to 19 (`ultra_mode`, `brief_path`, `failure_consequence`). See §4e.
- **v0.11.0 (2026-07-12) — "the fast lane + wiki freshness":** new `/orc-fast`
  command + `orc-fast` skill (12 skills, 10 commands) — knowledge-gated
  fastest lane: fresh-wiki + pattern-cache prerequisites replace the
  analyst/planner; one `orc-executor-sonnet-4-6-high` dispatch (wiki pointers
  from `wiki/INDEX.md` + literal pattern injection); smoke gate with one
  repair round; automatic **fallback to orc-mini** (`FALLBACK-FROM` handoff)
  instead of ever stopping; Sonnet-medium orchestrator OK. Wiki infra:
  `.claude/orc/wiki-meta.json` manifest (orc-wiki-only writer; freshness
  COMPUTED on read → FRESH/AGING/STALE, thresholds `wiki_fresh_max`/
  `wiki_aging_max`), `wiki/INDEX.md`, incremental refresh mode, post-ship
  refresh ask on BIG full/ultra runs (`wiki_refresh_ask_tasks`/`_files`),
  statusline wiki-tier segment. Contract lint grew to 23 (`wiki-meta.json`,
  `AGING`, `wiki_refresh_ask`, `FALLBACK-FROM`). See §4f.
- **v0.12.0 (2026-07-12) — "the lossless combiner":** context-combiner rebuilt
  around conservation. Pooled (never pairwise) reconciliation with a richer
  taxonomy — EXACT/SEMANTIC duplicates (semantic merges quote both statements),
  **PARTIAL-OVERLAP split into shared + residue rows, never collapsed**,
  CONFLICT, structured ORDERING (`before`/`after` pairs the planner consumes as
  dependencies). **Conservation gate:** a Source coverage matrix gives every
  source requirement ID exactly one outcome (merged / deduped-into /
  split-across / conflict-resolved / dropped-with-user-decision);
  `coverage_pct` must be 100 or `handoff_ready` stays false and the build
  option is withheld. Bounded evidence freshness spot-check against
  `combined_against` (git HEAD short sha) — failures marked STALE and
  challenged, never silently carried. Assumptions/alternatives are reconciled
  across sources too; challenge verdicts checkpoint eagerly to
  `combine-decisions.md` (compaction-safe replay); >4 sources triggers a
  staged-combining offer. New return fields: `coverage_pct`, `dropped[]`,
  `stale_evidence[]`. Contract lint grew to 26 (`coverage_pct`,
  `PARTIAL-OVERLAP`, `combine-decisions.md`) — drift surfaces: combiner
  SKILL.md + both schemas + the combiner agent + orc SKILL.md +
  orc-analyze `references/branching.md`.
- **v0.13.0–v0.15.0:** documented in their own sections — CLAUDE.md builder
  (§4g), postgres playbook (§4d), wiki v2 (§4f); README changelog has the
  ladder.
- **v0.16.0 (2026-07-14) — "the DIY lane":** new `/orc-diy` command + `orc-diy`
  stub skill (14 skills, 12 commands) + the `orc diy` CLI family — a
  user-composed pipeline configured ONLY in the terminal, compiled by
  `orc diy compile` into `.claude/orc/diy/FLOW-COMPILED.md`, and hard-gated
  (UNCONFIGURED/STALE never run; plain `/orc` offered). Effort guard +
  statusline extended to read `flow.lock.json`; `orc update` nudges a
  recompile. Full detail in §4h; the how-to-build guide is the skill's OWN
  README (`templates/skills/orc-diy/README.md`), deliberately separate from
  the root README. Contract lint grew to 38 (`flow.lock.json`,
  `FLOW-COMPILED.md`, `orc-diy.config.yaml`, `diy:when`).
- **v0.16.1 (2026-07-14):** bare `orc diy` = interactive flow composer
  (bootstrap wizard, numbered pick-lists, in-menu compile/validate/reset,
  compile-on-exit offer; non-TTY prints the table); `orc config`'s menu
  gained numbered pick-lists for string enums.
- **v0.17.0 (2026-07-14) — "crosslink":** cross-repo wiki references as an
  orc-wiki subsystem (no new skill). New `orc crosslink` CLI composes a
  nodes+edges graph (`.claude/orc-crosslink.config.yaml`); orc-wiki publishes
  this repo's boundary as per-point `wiki/crosslink/` tag files (new
  `crosslink_provided` manifest registry + integrity rule) and discovers
  consumed tags into `.claude/orc/crosslink/needs.json` + a cache. orc/orc-fast/
  orc-mini inject the linked contract into boundary-touching task slices.
  Advisory, never blocking; dual-signal freshness (`min(provider-tier,
  snapshot-age)`, the latter the only day-based tier). Contract lint grew to 44
  (`orc-crosslink.config.yaml`, `crosslink/needs.json`, `crosslink/cache/`,
  `wiki/crosslink/`, `crosslink_provided`, `crosslink_fresh_days`). Full detail
  in §4i; the build-your-own guide is orc-wiki's OWN README. 21 skills / 21
  agent files (unchanged — crosslink adds no skill or agent).
- **v0.17.1 (2026-07-14):** docs — expanded `templates/skills/orc-wiki/README.md`
  into a complete step-by-step crosslink setup guide (worked CLI walkthrough,
  file map, troubleshooting table, guarantees); root README's `/orc-wiki`
  section + Commands row now link to it (DIY-docs rule: how-to lives in the
  skill's own README). No skill/contract change.
- **v0.18.0–v0.23.0:** documented in their own sections — wiki registration
  writer (§4j), and the trace/statusline/onboarding work (§4b and README's
  ladder).
- **v0.24.0 (2026-07-18) — "crosslink fused into wiki generation":** publish is
  now ALWAYS ON and per-scan-task (§4i) — each scan agent returns a required
  `crosslink_tags` field, the orchestrator writes doc + tags together then runs
  `orc wiki sync`; a refresh never bulk-deletes `wiki/crosslink/` (per-point
  dead-tag sweep only). Three deterministic guards kill silent-zero: sync's
  `countBoundaryRows` boundary detector + N→0 tripwire (both `--check` exit 1),
  and the now-unconditional `crosslink-anchors` integrity item; `orc wiki
  status` reports the tag count / `UNPUBLISHED boundary`. CROSSLINK-ONLY demoted
  to a legacy backfill (§4j). Contract lint grew to 50 (new token
  `crosslink_tags`; `wiki/crosslink/` + `orc wiki sync` gained copies). 22
  skills / 22 agent files (unchanged — no new skill or agent).
- Git: branch `main`. Not yet confirmed published to the npm registry; install
  docs favor `github:azure-id/orc`.
