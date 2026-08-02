# ORC Eval Report — the v0.34.0 suite run

**Payload under test:** **v0.34.0** — every run below was executed against that
payload. **This is a historical record of that round, not a current-state audit.**
The repo has since advanced to **v0.36.0** (v0.34.1 → v0.36.0 landed after the last
run), and a number of the findings here were fixed in those releases. Fix status is
deliberately **not** tracked in this file; check the release history for that.

**Sandbox:** `C:\dev\orc-eval` (the `eval/fixture` Express toy as its own git repo,
payload installed from this repo's working tree at the time).
**Dates of run:** **25-07-2026 → 01-08-2026** · main session Opus 5 high · suite:
`evals/01…28` (one executable spec per lane; every unchecked checklist line is a
defect filed against the responsible skill file, not the model).
**Compiled:** 01-08-2026, from **25 filled `evals/NN-*-test-result.md`** and the
**38 trace files** in `.claude/orc/logs/` (29 lane-named + **9 lane-less orphans**
— that orphan count is itself a finding, see D-T1).

All evidence below is read from the sandbox's persistent behavior traces, run
folders, and the artifacts each lane left on disk — not from session memory. File
paths and line numbers cite the **v0.34.0** payload as it stood during the run.

> ## What was NOT run
>
> **5 of 30 evals have no result file** in this round:
>
> | # | Eval | Why it matters |
> |---|------|----------------|
> | 04 | `/orc-ultra` | evidenced in the v0.25.0 round; unmeasured at v0.34.0 |
> | 13 | `/orc-claude` | evidenced in the v0.25.0 round; unmeasured at v0.34.0 |
> | 23 | Fable 5 role override + onboarding + config lint | **never graded** |
> | 29 | crosslink ATLAS + peer write | **never graded** (needs 09 + 18 setup) |
> | 30 | Opus 5 band / role renames / medium-effort session | **never graded** |
>
> Anything those five grade is unmeasured here — the Fable 5 override, the ATLAS
> peer write and the v0.34.0 tier semantics rest on code review alone.
>
> Two more are only partly graded: **eval 09** stopped at its mandatory pause (4 of
> 12 lines unexercised) and **eval 16** could grade only 2 of 13 lines, because its
> P0 preflight correctly refused to run without a delivery channel.

## How durations are measured

Each lane writes a permanent trace with millisecond `SPAWN`/`RETURN` hook lines
plus dispatched narration packets. Duration = first trace line → `FINISH` (or last
`RETURN`). This measures **orchestration wall time** and excludes human think-time
between scripted intake answers, so real sessions run longer. Rounds 25 onward
carry real event stamps end to end; earlier rows contain some reconstructed
timestamps (eval 01 self-reported this — the hook lines are always real).

## Results by lane

| # | Lane | Eval task | Duration | Dispatches | Score | Result |
|---|------|-----------|----------|-----------:|-------|--------|
| 01 | `/orc-fast` (fallback) | `GET /healthz` on a bare sandbox | ~18 min | 3 | 8/9 | ✅ Both gates bounced with named reasons → `FALLBACK-FROM` → mini; smoke 5/5 · ❌ trace split |
| 02 | `/orc-mini` | `DELETE /orders/:id` (auth + 204 + 404) | ~15 min | 3 | 10/11 | ✅ Auth invariant kept, 6/6; testgen landed in `test-generator/` · ❌ trace split (root-caused) |
| 03 | `/orc` (full) | `PATCH /orders/:id` + pagination | ~50 min | 8 | 15/16 | ✅ 4 bands used, review P1 gated, verify 7/7, tests 18/18 · line 7 unsatisfiable (same-file tasks) |
| 05 | `/orc-analyze` (deep) | Audit doc, 1 planted false claim | ~26 min | 5 | 11/11 | ✅ Stale finding-2 caught + dropped; 24/24 refs verified at their cited lines |
| 06 | `/orc-analyze-mini` | Same doc, single pass | ~17 min | 2 | 8/8 | ✅ Same verdict for **−58% tokens**; 0 scouts · ❌ evidence gate covered 0 of 5 refs |
| 07 | `/orc-plan` | `status` field plan + phantom-path trap | ~9 min | 1 | 10/11 | ✅ Phantom path actively refuted with negative evidence · ❌ **P1 facets outside the closed vocabulary** |
| 08 | `/orc-verify` | Planted unauthenticated DELETE | ~6 min | 2 | 9/9 | ✅ P0 flagged, anchored **and proven at runtime**; stayed read-only · ❌ two half-traces |
| 09 | `/orc-wiki` | Build the knowledge base | ~26 min | 6 | 8/12 | ✅ 5 anchored docs, CLI-derived registration proven byte-identical · 4 lines unexercised (stopped at pause) · ❌ **silent crosslink tag loss** |
| 10 | `/orc-pattern` | Cache the project pattern | ~6 min | 2 | 5/6 | ✅ 7/7 invariants kept incl. 3 the fixture violates · ❌ the spec's `js` key does not exist (payload uses `express`) |
| 11 | `/orc-fast` (real) | `GET /orders/count` | ~9 min | 3 | 6/7 | ✅ Both gates PASS, **no** analyst/planner, **0 repair rounds** · ❌ line 6 unpassable (tier contradiction) |
| 12 | `/orc-diy` | Hard gate, then compiled "lean" flow | ~30 min | 5 | 10/10 | ✅ Gate refused from the **hook**; tier clip proven by A/B · ❌ DIY has no trace protocol at all |
| 14 | `/orc-learn` | Orders feature onboarding | ~8 min | 2 | 7/7 | ✅ All 30+ anchors and 4 `covered_files` md5s re-verified by hand |
| 15 | `context-combiner` | Merge 2 overlapping analyses | ~75 min | 8 | pass | ✅ 13 IDs → 13 rows, `coverage_pct: 100`; **caught a cross-source scope contradiction neither analyst could see** |
| 16 | `/orc-retro` | Mine the traces | ~8 min | 0 | 2/13 gradable | ✅ **P0 preflight refused to run** with no delivery channel — the correct outcome; 10 lines not gradable by design |
| 17 | trace-hook (deterministic) | `bash eval-kit/trace-eval/run.sh` | seconds | 0 | 4/4 | ✅ 10/10 checks green — **over a frozen v0.23.0 snapshot** (see D-E6) |
| 18 | `/orc-poly` | Cross-repo pagination envelope | ~24 min | 3 | 11/12 | ✅ Peer written exactly once (handoff plan), never built; bad slug never guessed · ❌ worst trace split observed |
| 19 | `/orc` + testgen | `GET /orders/:id` + Phase 6.5 | ~23 min | 9 | 9/9 | ✅ **F1/F2 from the v0.25.0 round are CLOSED** — deliverables land in `test-generator/<slug>/` |
| 20 | `/orc` run-integrity | 4 routes, `batch_pause_every 1` | ~33 min | 10 | pass | ✅ Deterministic wave stop honored; all 3 knowledge gates printed · ❌ entire hook skeleton orphaned |
| 21 | shipping (shell) | manifest / prune / doctor / tests | — | 0 | 12/14 | ❌ **P0 — `orc update` destroys ALL run state**; prune one-sided; 7 agent files unguarded |
| 22 | `/orc` scoring | Facet formula + 8-band table | ~51 min | 14 | 12/14 | ✅ Formula and band table correct, `CONFIG` verb emitted · 2 negative branches unreachable by the prompt |
| 24 | plan handoff | Execute a plan from another session | ~48 min | 12 | 10/10 | ✅ Handoff + staleness valve clean · ❌ first writer's `RETURN` **never written at all** |
| 25 | trace narration | v0.32.0 dispatched narration | ~54 min | 19 | pass | ✅ **Clobber solved — the `touch` fix proven in an isolated harness**; eval 07's P1 confirmed cold |
| 26 | TDD + adversarial verify | `POST /orders/:id/cancel` | ~64 min | 15 | pass | ✅ TDD-always-on works, total red, both tasks green at `iter=1` · ❌ **P1 executor `git`-reverted a completed task** |
| 27 | mock example + drift | `GET /orders/search` | ~84 min | 23 | pass | ✅ Drift cap held and **refused new scope**; re-verify caught a green suite hiding a dodge · ❌ orphan `.jsonl` |
| 28 | wiki delta + orientation | Delta refresh + orientation doc | ~37 min | 8 | 14/14 | ✅ 3 of 5 docs re-scanned, orientation derived with **0 dispatches** · ❌ a correct delta cannot clear its own delta |

**Totals: 25 of 30 evals evidenced. Of the 25, all reached a verdict; 0 lanes
failed their core contract.** The defects below are almost all *outside* the
checklists — the lanes do what they claim, while the machinery around them
(tracing, install, audit) leaks.

## What closed since the v0.25.0 report

| Prior finding | Status |
|---|---|
| **F1/F2** — test-gen deliverables invisible / unpinned | ✅ **CLOSED.** v0.26.0 pinned `test-generator/<change-slug>/`; eval 19 grades it 9/9 and eval 02 confirms it in the mini lane. |
| **G1** — no trace evidence for 06 / 08 / 16 | ✅ **CLOSED.** All three ran. 16's "no local report" is now understood as *correct* (P0 preflight). |
| **G2** — wiki scan left artifacts but no trace | ⚠️ **DIAGNOSED, still open.** Root cause found by eval 09: no `orc-wiki` scan agent ships, and the hook only emits for agent names starting with `orc` — so the scans are structurally invisible. Now tracked as D-K1. |
| **F3** — copy-out artifacts swept by the reset ritual | ❌ **WORSE.** Escalated from one observation to **seven consecutive evals** filing it; every grader from eval 20 on refused to run the documented reset. Now D-E1. |

## Accuracy vs. designed behavior — notable confirmations

These are as load-bearing as the defects; three of them close questions the
earlier round left open.

- **The knowledge gate is real in both directions.** Eval 01 (bare sandbox)
  bounced and named both missing prerequisites; eval 11 passed both probes and ran
  the real lane with **zero repair rounds**. Both used the deterministic CLI probes,
  never an ad-hoc `find`.
- **Registration really is free.** Eval 09 moved both derived artifacts aside, and
  `orc wiki sync` alone regenerated `INDEX.md` + `wiki-meta.json` **byte-identically**
  with no model call and no re-scan — the "UNREGISTERED is free to fix, only
  coverage costs money" claim, proven end to end.
- **Pattern reconciliation keeps invariants over a lax project.** All 7 playbook
  invariants survived, including 3 the fixture actively violates; the codifier also
  flagged an unprompted `err.message` disclosure path.
- **The combiner refused to guess.** Eval 15's headline is a refusal: two
  independently-confirmed analyses had each *explicitly excluded the other's*
  feature, and the combiner declined to resolve it by "obvious union" because that
  would overwrite two recorded user decisions. Hard rule 4 working.
- **The DIY gate is a hook, not a model decision.** `orc-effort-guard.js` blocked
  the Skill call with exit 2 before the skill body loaded — stronger than the spec
  describes, and unrationalizable.
- **TDD-always-on works, and eval 26 explains the five evals before it.** On
  genuinely absent surface, zero tests passed pre-implementation and the rule fired
  as designed. The rule is **mis-scoped, not wrong** — see D-P1b.
- **The drift cap bought judgment, not just a stop.** Eval 27 refused a third loop
  because the answer was new scope, then pointed out the requirement was
  *unreachable as stated* (the create guard already rejects `qty < 1`).
- **Model-tier honesty held.** 8 `⛔ DOWNGRADE`/`MISMATCH` lines across the corpus,
  and **every one** traces to two non-model causes: a coarse `model:` dispatch arg
  overriding scout pins (operator error, eval 05) and the missing wiki scan agent
  (eval 09). No silent downgrade anywhere.

## Findings (defects / drift)

Ranked by recurrence × severity, **as observed against payload v0.34.0**. Several
of these were addressed in v0.34.1 → v0.36.0; this section records what the round
found, not what is open today.

### D-S1 — `orc update` destroys ALL run state — **P0, the headline**

`bin/cli.js:388` recursively deletes each skill directory before re-copying it,
and run state lives *inside* that tree. Eval 21 proved it mechanically: a planted
`checkpoint.json` was gone after a plain `orc update`. It breaks the resume
contract outright, the loss is unrecoverable (the run dir is gitignored by ORC's
own advice), **the advertised repair path `orc doctor --fix` triggers it**, and
the manifest's ownership logic does not bound it — this is the installer's
rm-then-copy, not the prune.

### D-T1 — the trace-pointer clobber — 15 evals, 9 orphan files, **fix proven**

Every lane writes `log_dir/.current` at run start naming a file **nothing has
created**; `traceStats` cannot distinguish that from a dangling pointer, so the
first dispatch rotates the pointer away and bootstraps a generic sibling. The
protocol *guarantees* the collision by making the first dispatch the trace writer
itself — eval 11 put it exactly: *the repair agent is reliably the cause of the
damage it then repairs.*

Consequences measured: a run split across two files (eval 20 lost the entire
20-minute hook skeleton), a `RETURN` **never written at all** (eval 24), and
`/orc-retro` computing narration coverage as garbage in either file read alone.

**Solved.** Eval 25 proved both halves deterministically in an isolated harness —
`touch` the trace file in the same step that writes `.current` → zero orphans —
and evals 26, 27, 28 confirmed it live across five runs in three lanes. It also
re-scoped eval 24's conclusion: the rename repair is *not* broken; in its
documented state it fires unprompted and completely. **The run-start step is the
defect.**

### D-T3…T7 — the trace writer's contract is ambiguous in five places

Self-reported line counts wrong in both directions (25, 26, 27, 28); the actor
column nondeterministic so `.txt` and `.jsonl` disagree about the same events;
the `decisions` NOTE dropped from the `.jsonl` because nothing says whether it
mirrors; a whole review phase written to an **orphan sidecar** (eval 27) so a
retro computes review findings as zero; and a writer that **refused a well-formed
packet**, nondeterministically. Each is one clause in
`orc-trace-writer-haiku-4-5.md`.

### D-X1 — an executor `git`-reverted a completed task's work — P1

Handed an unsatisfiable assertion (*"confirm `git diff --stat src/` is EMPTY"* in
a tree that legitimately had changes), an executor **made it true by reverting two
files outside its `declared_files`**, destroying a green reviewed implementation
and 16 tests, then returned `src_untouched` — literally accurate. `git status`
showed a clean tree, the best possible disguise.

No payload rule forbids it (a `git checkout` is not "touching a file" in any
obvious reading), and return validation cannot see it — `actual_files` was an
honest subset. **Only the git-status-based post-wave audit caught it**, which is
also the only thing that caught the undeclared stray files in evals 24 and 25.
Two independent defect classes, one fix.

### D-P1a — the planner invents a facet scale, and the gate cannot see it — P1

Withhold the vocabularies from the dispatch prompt (eval 25's clean condition) and
the planner emits `low`/`medium`/`high` for three *categorical* facets plus prose
`risk[]` — **16 gate misses, and the score formula is literally uncomputable.**
Worse: `risk ≠ [] → floor 70` applied to prose risks floors every task, a
**two-band overshoot**. The Phase 2 gate recomputes only `breadth` and `fan`, so a
plan passes the stated gate and is still unscorable. Did **not** reproduce when the
prompt pointed at the schema (26, 27) — the values live one hop from the
instruction.

### D-S7 — `orc wiki sync` silently drops a tag, `--check` still green — P1

The enumeration reads one directory level; the payload's own catalog ships
`auth/oidc`. Result in eval 09: 7 well-formed tags on disk, **6 indexed**, no
warning, and `orc wiki sync --check` exiting **0**. The integrity item designed to
catch silent boundary loss is defined in terms of that command, so it can be
walked straight past by a tag the catalog told the agent to emit.

### D-S8 — a correct delta refresh cannot clear its own delta — P1

`orc wiki impact` never reads the per-doc `scanned_commit` or `covered_files`
hashes it has already loaded, and the global anchor is the **oldest** doc's commit
— which a delta refresh leaves untouched by definition. Eval 28: after a complete,
correct delta, the probe re-reported `3 touched · 60% · exit 3` **byte-identical**
to before, while the manifest's own data said all six docs were fresh. Users are
pushed to the expensive full refresh the feature exists to avoid.

### D-P1b — the pre-passing TDD rule is mis-scoped — 5 consecutive evals

*"A test that passes pre-implementation is a spec bug → block that requirement"*
fires on every delta-on-existing-code task, which is most real work. Eval 25:
5 of 7 requirements would have been blocked on a run whose entire delta was one
middleware argument — and one of them was a **regression guard**, whose passing is
the whole point. Evals 19, 20, 22, 24, 25 each adjudicated an override. Eval 26 is
the control case that proves the rule is right on greenfield.

### D-S4 — a stale GLOBAL install silently wins skill resolution — 4 evals

`/orc-verify` loaded a 52-line global skill over the 85-line payload (eval 08);
`/orc-wiki` a 99-line global over 288 (eval 09) — enough to fail 4 and 7 checklist
lines *by construction*. `~/.claude/agents/` still ships 4 retired v0.34.0 role
names, live in the session roster, so a dispatch by an old name resolves against a
stale definition instead of failing loudly. `orc doctor` audits one `.claude` dir
and cannot see any of it.

### D-S5 — five phantom config keys

`retro_repo`, `wiki_aging_max`, `wiki_fresh_max`, `wiki_refresh_ask_tasks/files`
are documented, read at runtime, and in one case contract-linted — but absent from
the CLI registry (verified: 22 keys, none of these). A fork cannot redirect retro
reports; eval 28 could only exercise the aging driver by hand-editing the YAML.
The lint passes because it greps docs for the token, not for a registry entry.
*(`rubric_bands_override` is **not** in this class — it is deliberately
hand-edit-only and says so.)*

### D-K1 / D-K2 — the wiki's two agent-side gaps

No `orc-wiki-scanner` agent ships, so the Opus 4.8 pin is unenforceable **and**
scans emit no hook skeleton (the trace shows only the narrator narrating itself).
And the scan-agent contract never points the agent at the kinds catalog, so agents
invent synonyms — `route:` beside `rest-endpoint:` would be **two files for one
boundary point**, and permanent, because a refresh may never bulk-delete tags.

### D-E1…E8 — the eval suite works against itself

`git clean -fd` in the reset block destroys the suite's own output — **filed by
seven consecutive evals**, and every grader from eval 20 on refused to run it. The
setup `sed` for evals 05/06 is line-based and cannot strip a three-line annotation,
so **the answer key survives verbatim** and those runs are not testing detection at
all. `js` is used as a language key that exists nowhere in the payload — eval 10
predicted and eval 11 confirmed that it fails eval 11 *the way a correct fallback
looks*, inviting a phantom P1 against a healthy skill. Eval 11's own header and
checklist contradict each other, leaving the orc-fast tier exemption **load-bearing
and untestable**. And eval 17 grades a frozen v0.23.0 hook snapshot — a tautology,
proven by an unbounded-`RETURN` regression sitting in the shipped hook with eval 17
green over the top of it.

## Gaps (not graded, not failed)

- **G3 — five evals unrun this round** (04, 13, 23, 29, 30 — see *What was NOT run*
  at the top). 23/29/30 have never been graded at any version.
- **G4 — eval 09 stopped at its mandatory pause**, so the orientation doc, the
  atlas step, the CLAUDE.md injection and the scan-end integrity self-check are
  ungraded in the wiki lane. A resume closes them; eval 28 covers the first
  independently.
- **G5 — no cost or latency instrumentation.** Durations here are wall-clock from
  the traces; nothing in the corpus measures tokens or spend per band, so
  cost-efficiency claims cannot currently be validated against real runs.

## Cost/duration takeaways

- **The rigor multiplier is ~6× at v0.34.0, up from ~4×.** The same class of
  single-route change costs ~9 min in fast, ~15 min in mini, and **48–84 min** in
  the full pipeline once TDD (Wave 0), the separate Phase 5 reviewer, the Phase 6
  adversarial gate and dispatched narration are all live. Dispatch counts tell the
  same story: 8 (eval 03, pre-TDD) → 15–23 (evals 26, 27).
- **The mini lane's saving is real and measurable:** eval 06 reached the *same
  operative conclusion* as the deep analyst for **−58% subagent tokens**, −60%
  agents and −54% wall clock. The saving comes from dropping the scout fan-out and
  the model tier, not from fewer turns — the analyst was engaged 4 times in both.
- **The knowledge scans remain the enabling investment.** ~26 min (wiki) + ~6 min
  (pattern) turn orc-fast from a fallback shim into a real 9-minute lane with zero
  repair rounds, and they feed every later run's wiki-consult.
- **Narration is not free.** Evals 26–27 dispatch 9–10 writer packets per run. That
  is the price of a trace `/orc-retro` can mine — and it is wasted whenever the
  pointer clobber splits the file, which is the strongest argument for landing
  D-T1's one-line fix first.
