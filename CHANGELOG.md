# Changelog

All notable changes to ORC, newest first.

The **latest release** is also summarised in the [README](README.md#changelog).
This file is the full history, and it is the file `orc changelog` reads — that
command prints only the entries **newer than the version you have installed**.

Format: `### v<version> — <title> _(<date>)_`.

---

### v0.47.0 — the lane that refuses to produce _(2026-08-12)_

**Every other lane in ORC — and nearly every other skill in the ecosystem —
produces. This one refuses to.** `/orc-challenge` grades a finished artifact,
writes down what is wrong, and then stops and makes the user go away and fix it
somewhere else. The stopping is not friction: **the separation is the measuring
instrument.**

**The one-sentence contract: ORC judges, the user fixes, ORC re-judges — and ORC
never fixes what it judged.** A session that just wrote the fix will grade its
own homework and it will always pass. That registers as the third member of an
existing pair — `a lane that answers its own interview question` (v0.42.0),
`a lane that picks its own favourite` (v0.45.0), and now **`a lane that fixes
what it judged`**. Same split every time: facts and findings are ORC's, the work
and the decision are the user's.

**Rule 0 precedes every other rule: it never guesses the goal.** A finding is
only a finding relative to a goal — the same TSD is *finished* for one purpose
and nowhere near done for another. A lane that assumes will attack the wrong
thing with total confidence, and every one of its findings will be *defensible*,
which is worse than being obviously wrong: the user spends three iterations
fixing what did not matter. So intake ASKS, in ONE round, for the goal, the
audience, what "done" means, the template, and where the fixed version will go —
and freezes them to `goals.md`. **`orc challenge init` has no default for
`--goal`, `--audience` or `--done-means`**, so a run that tried to skip the round
fails at the CLI by name instead of inventing a purpose. Every finding must name
which goal element it `serves`; one that cannot is **dropped**, which is the
mechanism that stops a large context window from reviewing the entire universe.

**Three agents, and they are three different INSTRUMENTS, not three tiers.**

- **`orc-challenge-reader-opus-5-low`** — the cold read. Tools: `Read` and
  nothing else. It is given the artifact and the audience line, never the goal,
  and it answers questions FROM the artifact rather than reviewing it. Returns a
  scored questionnaire (`8/12`). **`low` effort is a measurement choice, not a
  cost one:** a harder-thinking reader reasons around exactly the gaps this
  exists to find, so a stronger configuration is a WORSE instrument.
- **`orc-challenge-judge-opus-5-high`** — grades against the frozen template and
  goal. Its slice is **SEALED**: paths and finding ids only, never prose from the
  session, never a diff summary, never "the user says they fixed #4". A fix is a
  claim; a verdict is evidence. **It cannot declare a pass** — `orc challenge
  record` computes that, which removes leniency as a possibility.
- **`orc-challenge-advisor-opus-5-med`** — dispatched only on a FAIL (advice on a
  passed artifact is invented work and it costs money). Twelve findings are
  usually three causes: it groups them by root cause, orders them with the
  dependency reason, and flags the ones that are really unmade DECISIONS. No
  prose, no diffs — handing over wording is fixing by another name.

All three are already `claude-opus-5`, so `opus5_only` is a no-op here: zero new
pairs, no rename churn. The lane is **unaffected, not exempt**.

**`orc challenge lint` — the deterministic engine, and it costs zero model
tokens.** Structure against the frozen template (missing / out-of-order /
invented / empty-ceremony sections, table column drift, untagged code fences,
links and `file:line` anchors that do not resolve) plus prose (acronyms used
before they are defined, sentences over 25 words with a p50/p90 distribution, a
passive-voice percentage, curated idioms and phrasal verbs, ambiguous
quantifiers, bare-pronoun openers, placeholder markers, a Flesch–Kincaid
estimate). **Sentences are measured over PARAGRAPHS, not lines** — a hard-wrapped
43-word sentence is still a 43-word sentence, and splitting at the newline is how
a length check silently passes every wrapped document. Two honesty rules are
printed by the command itself: it is a SIGNAL, not a verdict, and it is
English-specific and heuristic. Its real payoff is that `lint.json` rides in the
judge's slice, so the judge never spends tokens counting. It is useful with no
cycle, no model and no ORC run at all: `orc challenge lint README.md`.

**Conservation — nothing evaporates.** Every finding from iteration N−1 appears
in N with exactly ONE outcome (`resolved` · `still-open` · `superseded` ·
`withdrawn` · `accepted`) and a reason; below 100% coverage the verdict is
malformed and `record` rejects it **naming the missing ids**. A silently dropped
finding is indistinguishable from a fixed one, and that is the classic way a
review cycle appears to converge. `record` also rejects an unknown carry id, a
reasonless withdrawal, an uncited supersede, an **ignored rebuttal**, and a
**silent dimension** — `NOT-CHECKED` with a reason is allowed, silence is not.

**Two escape valves, because a loop with no exit is a trap.** `orc challenge
accept <slug> <id> "reason"` — the finding stops blocking immediately and stays
visible forever in the report with the reason; never automatic (the `/orc-pact`
retirement rule). `orc challenge rebut <slug> <id> "reason"` — the next judge
must answer it explicitly, `withdrawn` with an admission or `upheld` with new
evidence, and a verdict that ignores it is rejected. Without it, one wrong
finding loops forever and the user's only move is to give up.

**Convergence, not a cap.** There is deliberately no loop cap and no config key
for one: every other loop in ORC runs inside a single session and costs tokens
per turn, but here each turn is a separate human sitting down to work, and a cap
that refused on iteration 6 would be refusing to review a hard document. It
reports `stalled` instead — once, with three honest options.

**Seven states, all COMPUTED, none stored** — `AWAITING-JUDGE`, `AWAITING-FIX`,
`AWAITING-RECHECK`, `PASSED`, `STALE-PASS` (honest, not a failure — the
`UNCHECKABLE` precedent), `MISSING-REVISION`, and `TAMPERED` (a verdict file
changed after it was recorded: reported, never silently re-graded). Two flags
ride alongside rather than becoming states of their own, because a state that
means two things is a state that lies: `stalled` and `no_template`.

**The resumed session never asks where the fix went.** `revision_mode` is
declared at intake and restated in a `Where to put the revised version` block in
every fix brief; `orc challenge diff` resolves the expectation first and then
reports which carried findings the change actually TOUCHED —
coverage-relative, the `computeWikiFreshness` lesson applied to findings, and a
hint for the human that is **never an input to the judge**. When the declared
path is not there, `MISSING-REVISION` **lists candidates and never adopts one**:
picking the closest-looking file would point the judge at the wrong artifact and
produce a page of confident, useless findings. The escape (`orc challenge expect
--set`) is a recorded command.

**The CLI half: 12 subcommands, every read with an exit-code contract and
`--json`.** `list` (0/1/3) · `status` (0/1/2/3) · `show` · `diff` (0/1/2/3) ·
`expect` · `lint` (0/1/2) · `outline` · `record` (the GATE, not a store) ·
`accept` · `rebut` · `template`/`goals` (re-freezing is a recorded event that
needs a reason, and prior iterations keep their stamp) · `report` (derives
`CHALLENGE.md`, plus the final report on a pass). `challenge.json` has exactly
one writer, and it is never a model.

**The `orc ui` Challenge panel** renders it and decides nothing about it: the
goal block above everything, the state chip with its ONE next action inline, an
iteration timeline whose **geometry is solved from the box size** (with a dashed
version break wherever a goal or template was re-frozen), the convergence chart
stacked by severity, a dimension strip where `NOT-CHECKED` keeps its slot and
carries its reason, the cold reader's score, and the findings with their accept /
rebut buttons. **A free action gets a button, a paid action gets a copy-able
command** — running an iteration has no write route at all. `--fixtures` carries
one of every state including the ugly ones, and a test asserts it.

**Four config keys**, all `common`: `challenge_pass_severity` (default `p1`),
`challenge_stall_after` (3), `challenge_reader` (`on`; `off` makes D4 report
`NOT-CHECKED` with that reason, never silently), and `challenge_gate` (`warn`;
there is deliberately no `block` — the `/orc-pact` precedent). Deliberately NOT
added: a same-session escape hatch (that is how the premise dies), any model or
effort key, and any loop cap.

**Seams:** `/orc` prints one preflight line when it is about to build from a
document that has not passed its own review; `/orc-analyze` prints the cycle
state at Phase A (the two compose in one order — challenge it, then analyze it);
`/orc-pact` gains the finding-that-is-really-a-decision harvest; intake's "I
don't know yet" suspends into `/orc-grill` and comes back; `/orc-export` can
carry a PASSED cycle as portable evidence.

**Trace:** lane `challenge`, **Iterative tier** (one packet per completed
iteration), and a new `CHALLENGE iter=…` verb whose line the CLI assembles so
nothing composes a second wording for the same number. Several trace files for
one cycle is CORRECT — several sessions ran.

### v0.46.1 — see a lane run before you pay for one _(2026-08-12)_

**The docs answered "what is ORC" four times and never answered "what does a
lane look like when it runs".** Rides on top of v0.46.0, below.

**`mock-run/` — one written walkthrough per lane.** What you type, what ORC
prints back, what lands on disk, in easy English, all on one shared example
project. Nothing was executed to make them: they exist so nobody has to spend
tokens to find out what a command does. Start at `mock-run/INDEX.md`.

**`orc mock-run list | show <slug>`** reads the same catalogue from the
terminal, and **`orc ui` grows a Mocked Skill Use panel** — every walkthrough,
grouped, searchable, with a reading pane. The catalogue is DERIVED from the
files on disk (title from the heading, lane from whether the command really
exists), so adding a walkthrough needs no list edited anywhere; the panel
renders it and decides nothing about it, exactly like the Flow stepper.

**The README is 928 lines shorter and current.** It was still describing an
older payload — the six v0.46.0 lanes were missing from the panel list, the
config table showed 11 of 52 keys, and the eval section quoted a round from four
releases ago. History moved here to `CHANGELOG.md`, which is now what `orc
changelog` fetches: a README carrying one entry would have answered a user ten
releases behind with a single line. The detail that used to bloat it lives in
`guides/configuration.md` and `guides/model-selection.md`.

**Two real bugs found while building it.** The panel's markdown renderer looped
forever on a malformed table row (the paragraph branch is the fall-through, so a
line every branch declined never advanced the cursor), and an upgrade modal
showed the newest release with `## Earlier releases` glued to the end of it —
an entry now stops at the next section heading, not just at the next release.

---

### v0.46.0 — a lane that remembers, a lane that declines, and a lane that measures _(2026-08-10)_

**The ecosystem has a thousand skills that GENERATE.** This release builds the
three things a generator structurally cannot be, plus the wiki work that pays for
them and the panels that make them visible. Six new lanes, one new agent, and the
biggest cost cut available to ORC so far.

**`/orc-pact` — the lane that remembers.** `/orc-grill` and `/orc-brainstorm`
already settle constraints, and a plan already carries them into every executor
slice. Then the run ends and they evaporate. The pact is a ledger that outlives
the run, with four states that are **computed on read, never stored**: HOLDING,
**DRIFTED** (commits since it was verified touched the files it anchors —
coverage-relative, so a promise about payments does not fall into doubt because
the README changed), **UNCHECKABLE** (nothing cheap proves it — the honest state,
and it never counts against you), and BROKEN. It never invents a promise: every
entry records where it came from. It never retires one for you. And the payoff is
automatic — at planning time, a drifted promise whose files your plan is about to
touch is injected into the planner as a constraint, so last month's decision
constrains this month's work. `PACT.md` is a committed, PM-readable file at your
project root, rendered by the CLI from the ledger so the two can never disagree.

**`/orc-boundary` — the lane that declines.** Every skill you can install assumes
the answer to *"should the agent do this?"* is yes; agents spend 5×–50× longer
than human experts on a task, and most of the excess goes into attempts that were
never going to succeed. Three verdicts per area — EXECUTE, ESCALATE, REFUSE — each
derived from four questions answered from things already on disk: can it verify
itself, does it know this area, is the change reversible, is this a decision
rather than a fact. **A REFUSE always names what would make it a yes** — "no" with
no "unless" is a shrug, so a refusal with no checklist is treated as a malformed
card. It gates ORC's own dispatch, never you: `boundary_gate: block` lifts a
refused task out of its wave and **the wave still runs the rest**.

**`/orc-handoff` — the first ORC lane for someone who does not read code.** The
insight nobody shipped: the safety grade does not come from the file type, it
comes from **whether a cheap check exists**. A settings file with a validator is
green; the same file without one is amber. It maps every surface a PM or designer
can own, and changing one is five steps with the **undo command shown before the
write**, the check run afterwards and reported in plain words, and a red surface
never touched at all. Every file in that lane is written in simple English.

**`/orc-budget` — what a run costs, in the unit you are billed in.** Not a dollar
figure: on Pro or Max you burn a 5-hour window, not an invoice. The forecast's
core object is a **token vector** — fresh input, cache write, cache read, output,
never blended, because cache reads are usually the largest count and a tenth of
the price. The same vector renders four ways: tokens, dollars from a dated price
table, percent of your window, and **context risk** — a task forecast above 90% of
its model's window is reported before the wave, which no spend tool can do. The
numbers come from joining Claude Code's own session transcripts (the cost) to
ORC's traces (the meaning); neither is enough alone. It needs a PLAN, not a
sentence, and with no history it says so rather than inventing a number.

**`/orc-aftermath` — did what we shipped hold up.** The missing half of the
flywheel: `/orc-retro` measures the process, this measures the result, both from
the repository's own future — files rewritten soon after, a test we added deleted
or skipped, the commit reverted, a promise that was holding now broken. No vendor,
no telemetry. **Churn is a signal, not a verdict**: it reports the signal and its
strength, never "this change was bad", and never a person's name.

**`/orc-export` — so ORC is not a trap.** One command compiles the wiki, the code
patterns, `PACT.md` and the boundary cards into a portable `AGENTS.md` — derived,
fingerprinted, `--check`able against its sources, never hand-written. It removes
the lock-in objection and makes ORC the *producer* in a multi-agent shop. Import
reads an existing `AGENTS.md` or `.cursorrules` as **evidence, never instruction**,
and tells you which parts are already wrong.

**The wiki finally stops costing a full scan.** Three free CLI commands: `orc wiki
plan` ranks and prices the pending work — STRUCTURAL first (a page pointing at a
missing file is actively lying), then by **use × delta**, with pages nobody reads
sinking to the bottom with a retire hint; `orc wiki debt` is the one-line habit;
and `orc wiki usage` finally reads back the point-of-use attribution v0.41.0 has
been recording and never reading. A **targeted refresh** (`/orc-wiki refresh
--top 2`) skips branch detection and area planning entirely, and a new **scan tier
ladder** sends a small, no-new-surface delta to a light scanner instead of the most
expensive agent in the payload — about 40% off a typical delta refresh, with the
deep scan still doing the work that needs it. The tier is always printed: a cheaper
model is never a quiet substitution. And free repairs are now a hard rule — you can
never pay for something `orc wiki sync` would have fixed.

**`orc ui` grows three panels and extends five.** Promises, Boundary and
Self-serve, plus a new **Cost** tab whose stacked bar exists precisely so the
cache-read share stays visible. The panel keeps every rule it had: it never runs a
lane, never invents a state word, never computes an order the CLI already emits —
**a free action gets a button, a paid action gets a copy-able command**, and that
line is now visible rather than hidden. Promises is where the compounding finally
shows: an *"Also flagged by"* line when the boundary and the aftermath agree with
the ledger about the same area, which you can never see in a terminal one lane at
a time.

---

## Earlier releases

### v0.45.0 — `/orc-brainstorm`: for when you do not have the idea yet _(2026-08-10)_

### v0.44.1 — apply when you say so, and a spotlight that survives a banner _(2026-08-09)_

### v0.44.0 — the panel stops making you type what it already knows _(2026-08-09)_

### v0.43.7 — the flow you can see, and a boundary you can read _(2026-08-09)_

### v0.43.6 — `orc ui` in two languages, and panels that point at the right page _(2026-08-08)_

### v0.43.5 — the update check works, and the UI teaches itself _(2026-08-08)_

### v0.43.4 — a warning that finally clears, an Experiment panel, crosslink from the UI _(2026-08-08)_

### v0.43.3 — `orc ui`: it tells you about updates, and 36 keys stop being a wall _(2026-08-08)_

### v0.43.2 — `orc ui`: boxes stop colliding, because the container owns the gap _(2026-08-08)_

### v0.43.1 — the panel's stylesheet and script actually reach the browser _(2026-08-08)_

### v0.43.0 — `orc ui`: a control panel for everything that is not ai _(2026-08-08)_

### v0.42.0 — Say what you mean, see what it costs, find your way back _(2026-08-08)_

### v0.41.0 — A wiki that can tell you it is fresh, and TDD only where it can fail _(2026-08-06)_

### v0.40.0 — Gotchas: repair memory that outlives the run _(2026-08-06)_

### v0.39.0 — The read ladder, and foreign input that is evidence rather than instruction _(2026-08-06)_

### v0.38.1 — `orc doctor --json` + handoff carry-over that says what is re-derived _(2026-08-06)_

### v0.38.0 — `/orc-quick`: the quick lane, and the gate no config can collapse _(2026-08-05)_

### v0.37.0 — Stacked pull requests: a measured ship gate + two standalone lanes _(2026-08-03)_

### v0.36.0 — `opus5_only`: one model for every role, not just executors _(2026-08-02)_

### v0.35.0 — `opus5_executor_only`: one model, effort as the cost dial _(2026-08-02)_

### v0.34.8 — `orc pattern status` rejects a language key the payload has never heard of _(2026-08-01)_

### v0.34.7 — DIY: a usable status contract, and compile docs that match the compiler _(2026-08-01)_

### v0.34.6 — Analyze: the evidence gate now covers the rows a good analysis produces _(2026-08-01)_

### v0.34.5 — Wiki: stop losing tags silently, let a delta clear its own delta _(2026-08-01)_

### v0.34.4 — Planner: scorable facets, and TDD rules scoped to reality _(2026-08-01)_

### v0.34.3 — Slice boundary: the worktree, not the editor _(2026-08-01)_

### v0.34.2 — Trace subsystem: the pointer clobber, and a writer contract that holds _(2026-08-01)_

### v0.34.1 — Install integrity: run state survives `orc update` _(2026-08-01)_

### v0.34.0 — Opus 5: top scoring band, every core role, medium-effort session tier _(2026-07-25)_

### v0.33.0 — Knowledge deepening + verification revamp _(2026-07-25)_

### v0.32.0 — Trace revamp: narration is dispatched, not remembered _(2026-07-24)_

### v0.31.0 — Execution-integrity revamp: plan handoff, attributable traces, facet scoring _(2026-07-23)_

### v0.30.0 — Scoring revamp, Fable 5 role override, tier-aware guards, `orc onboarding` _(2026-07-23)_

### v0.29.0 — Drift-prevention hardening: install manifest + prune, `orc doctor`, a real test suite _(2026-07-22)_

### v0.28.1 — Defect fixes: package encoding, trace event routing, count/doc drift _(2026-07-22)_

### v0.28.0 — Run integrity: rich full-lane traces, deterministic wave stop, visible knowledge gates _(2026-07-21)_

### v0.27.0 — `/orc-poly`: plan one change across two-or-more repos without drift _(2026-07-20)_

### v0.26.0 — Test-gen output pinned to a visible `test-generator/<change-slug>/` deliverable _(2026-07-19)_

### v0.25.1 — Eval report: the full 17-lane suite graded against the v0.25.0 payload _(2026-07-18)_

### v0.25.0 — Deterministic artifact detection: a generated wiki/pattern is never missed _(2026-07-18)_

### v0.24.0 — Crosslink fused into wiki generation: always-on, per-scan-task, never wiped _(2026-07-18)_

### v0.23.0 — Trace fix: SPAWN restored on the `Agent` tool, stale runs rotate to fresh files _(2026-07-18)_

### v0.22.0 — `/orc-learn`: per-feature onboarding docs — learning.md + knowledge.md, wiki-deep, git-ignored _(2026-07-17)_

### v0.21.0 — Statusline shows live subscription usage: 5h ↔ weekly, official numbers _(2026-07-16)_

### v0.20.0 — One source of truth: generated executor agents + shared cross-lane contracts _(2026-07-16)_

### v0.19.0 — Thin spines: skill compaction, budget lint, and a trace that logs every phase _(2026-07-16)_

### v0.18.0 — `orc wiki sync`: the wiki registers itself — a paused scan is no longer an invisible wiki _(2026-07-15)_

### v0.17.3 — Trace the wiki consult: Phase 1 now logs whether the run grounded in the wiki (and if it was stale) _(2026-07-14)_

### v0.17.2 — Behavior-trace logging is permanent + the trace folder is now created deterministically _(2026-07-14)_

### v0.17.1 — Complete cross-repo crosslink setup guide in the orc-wiki README _(2026-07-14)_

### v0.17.0 — `orc crosslink`: cross-repo wiki references — advisory boundary contracts _(2026-07-14)_

### v0.16.1 — Interactive `orc diy` composer + numbered picks in `orc config` _(2026-07-14)_

### v0.16.0 — `/orc-diy`: build your own lane — CLI-composed flow, compiled, hard-gated _(2026-07-14)_

### v0.15.0 — Wiki v2: evidence-anchored docs · per-file staleness registry · integrity gate _(2026-07-14)_

### v0.14.0 — Postgres data-access playbook: cross-cutting query grounding _(2026-07-13)_

### v0.13.0 — `/orc-claude`: local CLAUDE.md builder — fenced sections, fingerprint refresh, zero questions _(2026-07-12)_

### v0.12.0 — Lossless context-combiner: conservation gate · overlap taxonomy · evidence freshness _(2026-07-12)_

### v0.11.0 — `/orc-fast`: knowledge-gated speed lane + wiki freshness infrastructure _(2026-07-12)_

### v0.10.1 — README: a fuller "Why ORC exists" _(2026-07-12)_

### v0.10.0 — `/orc-ultra`: max-effort advisor + three judgment gates for ultra-complex work _(2026-07-12)_

### v0.9.0 — Trust-but-verify the analyst→planner chain: quote-anchored evidence · coverage gate · anchored judgment _(2026-07-12)_

### v0.8.1 — /orc-retro delivers upstream: PR/issue to the ORC repo, channel-gated _(2026-07-12)_

### v0.8.0 — Close the loop: grounded intake · scoring anchors · OUTCOME marker · /orc-retro trace miner · eval harness _(2026-07-12)_

### v0.7.0 — Evidence everywhere: grounded plans · verbatim proof · anchored findings · contract lint · trace fixes _(2026-07-12)_

### v0.6.0 — P0–P3 ladder · house rules · deep playbooks + wired gates · 3 new languages · FE rule packs · security pass _(2026-07-11)_

### v0.5.1 — Statusline false-degrade fix _(2026-07-11)_

### v0.5.0 — Code-pattern findings: executors match your house style, invariants always enforced

### v0.4.5 — Rewrite weak worker descriptions (the real score lever)

### v0.4.4 — Act on external review: raise sub-70 workers, fix cross-spine paths

### v0.4.3 — `orc-analyze`: trim description under the 1024-char skill-spec limit

### v0.4.2 — External-review pass: worked examples + sharper mini-analyst activation

### v0.4.1 — `orc-mini`: faster, safer fast-lane — smoke gate, opt-in tests, trimmed ceremony

### v0.4.0 — Opt-in Phase 6.5 Test Authoring (writes test cases, never runs them)

### v0.3.0 — Opt-in behavior-trace logging + claimed-vs-actual model verification

### v0.2.4 — `orc-analyze`: gather anchored adjacent-scope context (non-actionable)

### v0.2.3 — Context Combiner: merge 2+ related analyses into one combined spec

### v0.2.2 — Config: enforce per-key override-first resolution

### v0.2.1 — Move config editing into the `orc config` CLI (zero-token); drop `/orc-config`

### v0.2.0 — Doc-optional evidence-backed analyst + deep mode
