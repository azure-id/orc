# knowledge.md — Part V — The standalone lanes

**Read: on demand** — read when touching `/orc-quick`, `/orc-grill`, `/orc-route`, `/orc-explain`, `/orc-brainstorm`, `/orc-pact`, `/orc-boundary`, `/orc-handoff`, `/orc-budget`, `/orc-aftermath`, `/orc-export`, `/orc-challenge`, or `/orc-doc`.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4z.4 Quality-of-life pass — sharpen, see, start (v0.42.0)

Three work blocks that change what ORC *feels like* to use, plus a preflight
audit that turned out to be the most valuable part. Nothing here touches the
build pipeline's correctness machinery — wiki, patterns, gotchas, TDD scoping,
traces, contracts and guards are unchanged.

### 4z.4.0 The preflight audit — three phantom-lane defects (found before any feature code)

This release makes traces **load-bearing for the first time**: `orc stats`
derives its whole output from trace filenames plus one `STATS` line, and
`orc resume` / `orc run list` present run state as fact to a user who has lost
the original session. A counting tool built on a drifting log produces
**confident wrong numbers**, which is worse than no numbers — so the payload was
audited against `references/trace-protocol.md` before a line of it was written.

Clean: `npm test` (99/99 at the time), `npm run verify`, the deterministic trace
harness (10/10), and the real corpus in `../orc-eval` — **zero orphan traces on
any post-v0.34.2 run**, one file per run, no dangling `.current`, and
`.txt`/`.jsonl` agreeing on `actor` for all 133 matched events (D-T4 held). The
post-fix sample is 5 runs, so that is a positive signal, not proof.

Three defects found, all the same shape — **a lane the protocol declares that no
entry point can open**:

| # | Defect | Why it mattered |
|---|---|---|
| D1 | `context-combiner` was listed as a single-dispatch **lane** (`combine`) owing its own end-of-run packet. It has no slash command and is only ever dispatched from inside an open `orc-analyze` run. | A lane every counting tool would report as permanently zero. The hook already disagreed — it maps `context-combiner` to a PHASE-EDGE *family*, not a lane. |
| D2 | `references/plan-handoff.md` wrote `.current` **without** the `touch the trace file` half — the exact v0.34.2 split-run signature, on the one entry path that token's file set never covered. | Every plan-input run risked splitting across two files, i.e. counting as two runs. |
| D3 | `/orc-ultra` wrote `run-orc-<slug>`, so lane `ultra` was declared but never opened. | **Every ultra run counted as a plain `/orc` run** — the costliest lane in the product, invisible in any usage report. |

Fixes: `combine` is documented as a PHASE inside the analyze run (and
`context-combiner/SKILL.md` gained hard rule 10 stating it must never bootstrap a
run of its own); plan-handoff gained the `touch` half and is now **registered**
in that contract token; the orc spine writes `run-ultra-<slug>` under
`ultra_mode`.

An existing test asserted `lane "combine" is declared` — it was pinning the
phantom. It now asserts the opposite, and a **new test walks the whole payload**
and fails on any lane in the enum that no skill writes a `run-<lane>-<slug>`
pointer for. That guard is the durable half of this fix.

### 4z.4.1 Sharpen — `_shared/interview.md`, `/orc-grill`, `/orc-explain`

**`_shared/interview.md`** is the new canonical mechanic: a design TREE of open
questions, the **frontier** (every question whose prerequisites are settled)
asked as ONE round, a fixed question shape (`❓ **Q1** — **<title>**` plus a `➡️`
recommendation), and a confirmation gate — an empty frontier does NOT end the
session; only the user saying "yes, we understand each other" does.

The split that does the work: **FACTS are ORC's job** (wiki status → wiki pages →
cached pattern → `orc gotcha list` → a read-only ad-hoc dispatch last — the read
ladder applied to interviewing), **DECISIONS are the user's, and the lane
waits**. Pinned verbatim as a contract token: *a lane that answers its own
interview question has broken this contract.* ORC's own addition is the tagging —
every settled decision is `intent` or `constraint`, and constraints become
`spec_invariants[]` entries appended verbatim to every slice. That is what makes
an interview load-bearing rather than merely a good conversation.

**`/orc-grill`** runs it standalone. One vague sentence is a complete input;
vagueness is the input, not a reason to refuse. Zero new agents — read-only recon
is dispatched ad-hoc by model+effort (the `/orc-quick` precedent). Three exits:
save to `orc-grill/<slug>/grill-context.md` (project root, visible, never
staged), carry into `/orc-analyze`, or drop. Questions conversation cannot settle
are NAMED with their instrument (`mock_example` for taste, `/orc-analyze` for
code claims) rather than ground on. No question cap: some ideas need three
questions and some need fifty.

**The reverse trigger** closes the loop. `orc-analyze` gained *analyzable ⇔ the
input names (a) a subject the repo could plausibly contain … AND (b) at least one
thing that should be true when the work is done* — the mirror of the planner's
`plannable ⇔`, and a contract token. Failing it OFFERS `/orc-grill` (never
forces); the grill's exit 2 auto-consumes back into the same invocation, so the
user retypes nothing. The same signal arriving LATE — a report that is mostly
`ASSUMPTION`/`UNVERIFIED`, compared against coverage the analyst gates already
recompute — gets the same offer instead of a twenty-question relay. Detail:
`orc-analyze/references/thin-input.md`. `intake.md` Step 3.5 now offers grill
BEFORE analyze, because a scan cannot fix a vague intent — it can only re-ask it
at scan prices.

**`/orc-explain`** is deliberately tiny: re-pitch the last message with the
background it assumed and every ORC-only term defined in the project's own words.
The load-bearing word is *wait* — it reports "my understanding failed", not "use
fewer words", and those get very different answers. Its brevity IS the design; a
long skill saying "be clear" makes the model verbose, because the model copies
the length it sees. **It writes no trace** (it can fire many times per session),
a knowingly accepted blind spot stated in `orc stats`' help text.

### 4z.4.2 See — forecast, resume, run list, stats

**`forecast:`** prints the moment the Phase-1 exit gate passes — the earliest
instant every number is real (the plan exists, so waves and scores are
computable) and the last cheap moment to walk away (nothing dispatched, nothing
written). Presentation only, no new probes. Time is a RANGE calibrated from the
measured corpus (`/orc-fast` ≈ 9 min / 3 dispatches · `/orc-mini` ≈ 15 / 3 ·
`/orc` 48–84 / 15–23); a lane with no corpus prints `not measured` rather than a
number that merely looks computed.

**`run_budget_dispatches`** (common tier, default `0` = off) turns that estimate
into a hard stop before wave 1, with the batch pause's discipline — never a hint.
Emits `GATE budget stop|pass`.

**`RESUME.md`** is the write half of resume: `{run_dir}/{slug}/RESUME.md`,
written by ORC ITSELF at every stop — never a dispatched agent, because a
dispatch inside the stop sequence means a stop can now fail because a subagent
did, at the one step whose entire job is not losing work. Always overwritten,
never appended, and **deleted at `FINISH` alongside `.current`**. So *the file
existing IS the "this run is unfinished" flag* — no second consumed/not-consumed
record to drift out of sync. It lives in the run folder, not the project root:
`/orc-quick` and `/orc-grill` put docs at the root because those are deliverables
a human reads later, whereas a resume prompt is transient run state, dead when
the run ends, and must never risk being committed. Its
`Where it stands:  /orc · phase X · wave K of N` line is a pinned shape — the one
line the CLI parses, which is how a listing never opens `checkpoint.json`.

**Three CLI commands**, all built around the same scale constraint (`log_dir` and
`run_dir` are never auto-pruned, so 100+ runs is a normal working directory):
enumerate with readdir+stat only, then read a bounded head/tail of **just the
displayed page**.

- `orc resume [n|slug] [--no-clipboard]` — a numbered picker over waiting runs;
  best-effort clipboard (`clip` / `pbcopy` / `wl-copy` / `xclip`) that is **never
  fatal**; picker on a TTY, plain list when piped (the `orc onboarding`
  convention, so a model or script never hangs on a prompt); exit 0 = something
  waiting, 1 = nothing.
- `orc run list [--all|--limit|--json]` and `orc run show <slug|n>`. Status is
  `waiting` (a RESUME.md is on disk — provable) · `done` · `empty`. It
  deliberately does NOT infer "finished" from `state-of-play.md`: that file is
  written at a STOP, so a run that shipped straight through never has one. An
  early draft labelled every such real run `incomplete` — caught by smoke-testing
  against the real `../orc-eval` corpus, and now pinned by a test.
- `orc stats [--since|--json]` — deterministic, no model, no cost. Lane and date
  are free (the filename is already DATA); depth comes from ONE `STATS lane=…`
  line appended at `FINISH`. Legacy traces with no such line fall back to counting
  `DISPATCH` lines, which are orchestrator-written and present in every lane.
  Never back-fill a `STATS` line into an old trace — the numbers would be
  invented, and the trace is append-only. Honest limits are printed rather than
  buried: `/orc-retro` and `/orc-explain` never trace, a lane-less pre-v0.34.2
  bootstrap prints as `(no lane)` and never as if it were a command, and moving
  `log_dir` resets the numbers.

**`/orc-route`** is plan-ONLY by design. A plan carries tasks, files,
dependencies, facets and scores, so routing from it is arithmetic; routing from a
sentence is guessing, and a guess that looks like a calculation is worse than no
answer. It REUSES `plan-handoff.md`'s plan-input definition rather than writing a
second one — a second definition of "what counts as a plan" is drift the lint
cannot see. Zero agents, deterministic probes only, reads no source file.
Runners-up name what choosing them COSTS you; an impossible lane names its
blocker AND the fix. Risk beats size: a small plan with a cited `risk[]` still
earns the full lane. `/orc-plan`'s **Save & stop** branch — and only that branch
— gained ONE question offering it.

### 4z.4.3 Start — profiles and onboarding

`orc config profile <solo-fast|balanced|paranoid|token-lean>` mirrors the working
`orc diy init --preset` pattern: purely a batch of `orc config set` calls over
existing validated keys, so no key changes meaning and a profile can never
express a state the interactive menu could not. That is the whole safety
argument — a profile is a shortcut, never a second configuration system.
`orc config recommend` probes the repo (test runner, CI, contributors, tracked
files, wiki, monorepo) and suggests ONE. It is read-only and it shows the
evidence, because a recommendation you cannot argue with is one you cannot
correct.

Because `/orc-route` is plan-only, the newcomer's "which of these commands do I
type?" moved to `orc onboarding first-run`, which now ends with a decision list
keyed on what the user HAS, not on lane names.

### 4z.4.4 Guards

3 new skills (26 → **29**, floor raised) and **zero new agents** — the v0.38.0
precedent holds, and it is exactly why none of these lanes carries an
`opus5_only` twin, a `MODEL-MAPPING.md` row or a golden test to maintain. New
contract tokens: `_shared/interview.md`, *a lane that answers its own interview
question*, *analyzable ⇔ the input names*, `RESUME.md` (+`binFiles`), and
`STATS lane=` (+`binFiles`). Spine budget raises, both documented in the BUDGETS
table with their reason: `orc/SKILL.md` 455→462, `orc-analyze/SKILL.md` 201→215.
`test/qol.test.js` adds 13 cases; the suite is now 113.

## 4z.6 `/orc-brainstorm` — the lane for not having an idea yet (v0.45.0)

**The problem it fixes.** ORC had no lane for the first question. `/orc-grill`
sharpens an idea you already have; `/orc-analyze` checks a requirement against
the code. A user with a *problem* and no candidate answer either picked the first
idea they thought of, or spent an analyze run discovering they analyzed the wrong
thing. `/orc-brainstorm` generates the options.

**Grill converges; brainstorm diverges then converges.** The two compose rather
than compete — `/orc-brainstorm → /orc-grill → /orc-analyze → /orc-plan → /orc`.
Brainstorm decides which mountain, grill decides the path up it.

| | `/orc-grill` | `/orc-brainstorm` |
|---|---|---|
| Input | one idea, vaguely stated | a problem, a goal, or a hunch |
| Unit of work | a question | a candidate |
| Who proposes | the user (ORC asks) | ORC (the user judges) |
| Hard rule | never answer your own question | never pick your own favourite |
| Output | a settled idea | a chosen direction **+ the graveyard** |
| Domain | leans code | anything |

Zero new agents (the v0.38.0/v0.42.0 precedent: divergent generation is the
orchestrator's own work; recon is an ad-hoc dispatch by model+effort, so the hook
writes no `SPAWN`/`RETURN` and the agent floor holds at 40). Zero new config keys
— a `brainstorm_lenses` or `brainstorm_min_candidates` key would be a setting
nobody tunes and one more thing `opus5_only` has to announce as shadowed. **Not
restricted to code:** a product name, an onboarding flow or a support-queue
problem are valid inputs, which is why B0 classifies the topic first.

### The five rules that make it a lane rather than a mood

1. **P0 — it stops and asks before writing anything.** When the picture looks
   complete it says WHY it thinks so and asks; "complete" is a proposal, never a
   verdict, and the deliverable is written only on an explicit yes. The ONE
   exemption is the suspend snapshot, which is run state.
2. **The open slot.** Every menu ends with a slot for the user's own words —
   never omitted, never folded into a trailing "…or just tell me", always last so
   the number is stable. This is structural: the whole value of a brainstorm is
   the idea ORC did not think of, and a closed menu is a survey. The user's idea
   enters the pool quoted verbatim and is stress-tested identically.
3. **Judgment is deferred, then switched back on.** B2 generates against named
   lenses (`references/lenses.md` — SCAMPER, inversion, Six Thinking Hats,
   analogy, constraint-flip, first principles, this-repo precedent) with **no
   candidate annotated with a downside**; every objection is held for B4's
   pre-mortem + black-hat/yellow-hat pair. Floor ≥8 candidates across ≥3 lenses,
   no cap; lens diversity is the bar, not count.
4. **Conservation.** Every B2 candidate lands in exactly one B3 direction or in
   the graveyard **with a reason** (the discipline `context-combiner` proves with
   its coverage matrix). The doc's payload section is "the pick — and why the
   others lost", one paragraph per loser — that is what stops the next session
   re-proposing a rejected idea.
5. **It never picks.** Registered token `a lane that picks its own favourite`,
   deliberately pinned to `_shared/interview.md` as well, so it stays a PAIR with
   `a lane that answers its own interview question`. Same split (facts and
   options are ORC's; decisions are the user's), one convergent and one divergent
   half. B5 tags every settled decision `intent`/`constraint`, and the constraints
   become `spec_invariants[]` downstream — that is what makes a brainstorm
   load-bearing instead of merely pleasant.

### `_shared/lane-suspend.md` — the `RETURN-TO` contract (new)

The requested behaviour was "when the user is missing context grill can supply,
go to grill — **and come back**". That is NOT `FALLBACK-FROM`: a fallback leaves
and does not return, and the receiver finishes the job. Brainstorm has a pool and
a half-drawn frame that must survive the trip, so a second, small shared contract
ships beside the fallback one.

Sender: snapshot to disk first (the P0 exemption), offer — never force, enter with
the block, and **resume at the phase it left**. Receiver: run completely
normally, and add ONE exit option present only under `RETURN-TO`, recommended in
that state. Decisions travel back with their tags intact plus their source lane.

**The gate is TIGHT — all three tests, or a brainstorm degenerates into a grill:**
it is a DECISION not a fact (a fact is ORC's to look up; handing a lookup to grill
launders work this lane owes) · it is a PREREQUISITE (the option SET changes with
the answer) · it is a SUBTREE not one question (one question is asked inline).
Fewer than three → ask inline or park it as a stated assumption and generate
anyway, with every dependent candidate tagged. **The reverse direction ships in
the same release:** grill offers `/orc-brainstorm` when a round comes back "I do
not even know what the options are" — handing the user a lane that generates
options is not answering their question.

**The trace rule this creates, and it is the expensive one.** The receiving lane
deletes `log_dir/.current` at its `FINISH`. If the sender resumes without
noticing, every line after the return goes nowhere — the v0.34.2 split-run defect
family reached by a different road. So: **on RESUME the suspending lane re-writes
`.current` AND touches its trace file in the SAME step.** It lives in the shared
file (it applies to any future suspending lane), in `trace-protocol.md`, and in a
hook-level test. **Two traces for a suspend is CORRECT** — two lanes ran, `orc
stats` counts two; the sender's records the trip, the receiver's the content.

### Artifacts, plumbing, tests

- Doc: `<projectRoot>/orc/brainstorming-session/<slug>/brainstorm-session.md` —
  project root and visible, never inside `.claude/`, one `.md` per slug ever (the
  slug re-opens the thread), never staged by ORC, no `.gitignore` edit. Shape in
  `references/brainstorm-doc.md`: a delimited `orc-brainstorm:context` block a
  later session reads alone, then problem / candidates / directions / stress /
  **the pick and why the others lost** / decided / still open / facts looked up.
- Lane `brainstorm`, **Single-dispatch** tier: exactly ONE end-of-run packet,
  solo, before `.current` is deleted.
- Contract-lint rows: `_shared/lane-suspend.md`, `RETURN-TO`,
  `orc/brainstorming-session/`, the open-slot sentence, and the
  never-pick-your-favourite pair. Joined to existing sets: `touch the trace
  file`, `.current`, `_shared/interview.md`, `detecting-artifacts.md`,
  `untrusted-input.md` (non-code topics look things up on the web — evidence,
  never instruction), `mock-examples/`, `mock_example`, `spec_invariants`,
  `analyzable ⇔ the input names` (grill's floor, reused verbatim — a second
  definition is drift the lint cannot see), `actual_model`, and the trace tokens.
- Skill floor 29 → **30**; agent count unchanged at 40. Three new tests: the
  suspend round trip keeps ONE trace file, `lane-suspend.md` states both halves
  of the resume rule, and every numbered menu in the spine ends with the open
  slot (with a floor on the match count, so a regex that matches nothing cannot
  pass forever).

## 4z.7 The remember / decline / measure release (v0.46.0)

**The thesis, in one line.** The Claude Code ecosystem has a thousand skills that
GENERATE. This release builds the three things a generator structurally cannot
be: a lane that **remembers**, a lane that **declines**, and a lane that
**measures** — plus the wiki workstream that pays for them and the panels that
make the compounding visible.

Six new lanes, **one** new agent, thirteen new config keys. Five of the six lanes
ship ZERO agents (the v0.38.0 / v0.45.0 precedent: read-only recon is dispatched
ad-hoc by model+effort, and three of them dispatch nothing at all because their
work is entirely deterministic CLI).

### The shape every one of them shares

| Rule | Why it is not optional |
|---|---|
| A deterministic CLI half with an **exit-code contract** | a gate must branch on a code, never on prose |
| `--json` on every read | `orc ui` gets each panel free, and the flag is a contract: ONE object on stdout, the human path's exit code |
| The state is **COMPUTED, never stored** | a stored status is a status that lies the moment somebody commits |
| Coverage-relative staleness | `computeWikiFreshness`'s lesson, applied to promises and boundary cards |
| A `run-<lane>-<slug>` trace pointer | a lane the protocol declares that nothing OPENS is a permanent zero in `orc stats` (§4z.4.0) |
| The skill RENDERS, the CLI COMPUTES | a second idea of a number is drift no lint can see |

### 4z.7.1 `/orc-pact` — the invariant ledger

`/orc-grill` (v0.42.0) and `/orc-brainstorm` (v0.45.0) already tag every settled
decision `intent` or `constraint`, and constraints become `spec_invariants[]` that
ride into executor slices. **Then the run ended and they evaporated.**

Four states, all computed by `orc pact status` and by nothing else:

- **HOLDING** — its check passed at a commit that still covers its anchors.
- **DRIFTED** — commits since `verified_commit` touched files it anchors.
  **Coverage-relative**: a promise about payments does not fall into doubt
  because the README changed forty times.
- **UNCHECKABLE** — no cheap check exists. **The honest state, and the point of
  the lane.** It NEVER raises the exit code; a lane that reported it as a failure
  would teach people to give every promise a fake check.
- **BROKEN** — the check ran and failed.

Exit `0` all holding · `1` any drifted · `2` any broken · `3` no ledger.

**Assumptions are not a second ledger.** An assumption is an invariant with
`confidence: low` and `check.kind: manual`.

**Two hard rules.** *Never invent a promise* — every entry carries an `origin`
(a run's `spec_invariants[]`, a grill/brainstorm `constraint`, the user, or an
`orc export import` seed the user confirmed). *Never auto-retire* — retirement is
a user decision with a recorded reason, and a retired entry stays visible struck
through, because a promise that vanished is indistinguishable from one that was
never made.

**`PACT.md` is DERIVED**, written only by `orc pact sync` from the ledger — the
same rule that makes `orc wiki sync` the only writer of `wiki-meta.json` and
`INDEX.md`. It lives at the PROJECT ROOT, never in `.claude/`: a PM has to be able
to read it in a pull request.

**The seam is the payoff.** `pact_gate: warn` (default; there is no `block`) prints
one preflight line, and **at Phase 2 a DRIFTED or BROKEN promise whose anchors
intersect a task's `declared_files` is appended VERBATIM to that task's
`constraints[]`** — the `spec_invariants[]` channel, so no new plumbing. HOLDING
entries are never injected: putting the whole ledger in every slice is how a slice
stops being read. `pact_recheck_on_verify` (default true) re-checks only the
promises the change touched at Phase 6; a flip to BROKEN is a **P1 finding, never
an automatic abort** — the ledger may simply have outgrown the code, and that is
the user's call.

### 4z.7.2 `/orc-boundary` — execute · escalate · refuse

Measured cost of assuming the answer is always yes: agents spend **5×–50×** longer
than human experts, mostly on attempts that were never going to succeed. Boundary
awareness is reported at ~**+20% performance / ~−80% efficiency gap**. Nobody
ships it.

**The contract: a REFUSE always names what would make it a yes.** "No" with no
"unless" is a shrug. **A REFUSE card with no checklist is MALFORMED** and
`orc boundary status` reports it as an error rather than rendering an empty card;
an ESCALATE with nobody named is the same failure from the other side.

The verdict is DERIVED from four questions, each answered from something already
on disk — self-verification (test runner / build / smoke gate), knowledge
(`orc wiki status`, `orc pattern status`, `orc gotcha list`, past traces),
reversibility, and decision-vs-fact (`_shared/interview.md` already draws that
line). The card records WHICH answers drove the verdict, so a verdict is always
arguable.

**Per AREA, not per request** — computed once, consulted in O(1). Cards live at
`.claude/orc/boundary/<area>.md` (filename sanitised `/`→`-`, the `area:` header
kept verbatim — the crosslink-kind lesson from v0.34.5) and go stale the same
coverage-relative way a wiki doc does. **An area with no card is UNKNOWN, never
assumed safe** (exit 3).

Every card also carries **"What an agent MAY do here today"**. Without it a card
reads as a wall, gets ignored, and an ignored card is worse than none because it
looks like coverage.

`boundary_gate: off | warn | block`, default **`warn`**. `block` is the only mode
that changes dispatch: **a REFUSE task is LIFTED OUT of its wave and the wave
proceeds with the rest** — blocking the whole wave punishes the tasks that were
fine, and a gate that costs a wave gets switched off. ESCALATE dispatches normally
and gates ship on the named human, riding the EXISTING pause machinery. **It gates
ORC's own dispatch, never an explicit instruction from the user**, and the printed
block says so.

### 4z.7.3 `/orc-handoff` — the first lane for a non-developer

**The insight nobody shipped: the safety grade is NOT derived from file type. It
is derived from whether a cheap check EXISTS for that surface.** A YAML with a
schema validator is GREEN; the same YAML without one is AMBER. That reframing is
what makes this deterministic rather than a vibe.

🟢 GREEN (a check will catch a mistake) · 🟡 AMBER (the check is a person) ·
🔴 RED (looks like content, is not — never touched).

Two modes: **MAP** writes `orc-handoff/surfaces.md` at the project root, recording
for every surface the grade, the **exact check** and the **exact revert command**;
**DO** is five steps — find, confirm (one message naming the file, the check and
the undo), edit, check, record.

Non-negotiables: **the undo command is printed BEFORE the write** · it never
stages and never commits · it never CREATES a key (a new key is a code change) ·
**an AMBER change is reported as a manual TASK, never as a pass** · the grade is
never re-derived mid-request to make an edit possible · a RED surface is refused
with a reason and a person to ask, and `/orc-quick` is OFFERED, never forced.
`handoff_write: false` makes the project map-only.

**Every file under `templates/skills/orc-handoff/` is simple English for
non-native readers** — the same standing rule as `orc-quick`. Keep it that way.

The seam is one sentence at ship: *"2 of these were changes a PM could have made
alone — `/orc-handoff` next time."* That sentence is the entire discovery path for
the non-dev side of ORC.

### 4z.7.4 `/orc-budget` — the token vector, four ways

Account-level burn tracking is solved. What nothing else answers is: *given THIS
plan — 14 tasks, 4 waves, top score 78 — what will it burn, and what does each
lane burn instead?*

**Tokens are the unit of truth; everything else is DERIVED from the vector, never
stored beside it.** Four kinds, never blended, because they price and behave
completely differently: `input` (1×) · `cache_write` (~1.25×) · **`cache_read`
(~0.1×, and usually the LARGEST count)** · `output` (~5×). A forecast of "407k
tokens" hides that ~80% of it costs a tenth of list; a forecast of "$7.02" hides
that a Max user does not pay it.

Four views (`budget_units`, default `auto` off `budget_plan`): **tokens** (always)
· **usd** (dated table) · **quota** (% of the 5-hour window — *the* unit for most
Claude Code users) · **context**.

**Context risk is the output nobody else has.** A run can hit compaction, which
silently degrades quality and is invisible in every spend tool. The corpus records
the PEAK prompt of every past dispatch, so a task forecast above 90% of its
model's window is reported BEFORE the wave, with three real options.

**The join is the moat.** Claude Code writes a JSONL transcript per session at
`~/.claude/projects/<slug>/` whose every assistant line carries the four token
counts, `model`, `timestamp`, `cwd` and — the field that makes this work —
`isSidechain`. That gives the COST. ORC's traces give the MEANING (task, score,
band, `expect=<model>/<effort>`, requeues, wiki use). Contiguous sidechain lines in
one session on one model group into ONE dispatch; each `DISPATCH` line claims the
nearest unclaimed group in the run's window with a matching model.

> **Two clocks, both honoured as written.** A trace line carries LOCAL wall clock;
> a transcript line carries ISO UTC. Both resolve to the same instant on the same
> machine. Treating one as the other is off by the timezone offset and silently
> attributes nothing — which is exactly what the first implementation did.

Honesty rules, all five: no transcripts → **tokens only** from trace metadata plus
the unavailable notice, never an invented price · **`unattributed` is ALWAYS
printed, including when zero** · cache reads get their own p50/p90 · no dollar
figure without a dated table (>90 days → a staleness warning) and **no quota
figure without a known plan** (`budget_plan` is asked ONCE and stored) · a band
below `budget_min_samples` is printed as low-confidence.

**It refuses a sentence.** `orc budget forecast` takes a PLAN — the same reason
`/orc-route` is plan-only: a guess that looks computed is worse than no answer.
The score is computed from the plan's own `facets` via the FIXED formula from
`references/effort-and-mode.md`, mirrored in `bin/cli.js` — both copies change
together.

### 4z.7.5 `/orc-aftermath` — the other half of the flywheel

`/orc-retro` measures the PROCESS (bands, downgrades, retries, gate bounces).
Aftermath measures the RESULT. Together the score→model table can finally be tuned
against *what stuck* instead of *what ran smoothly*.

The signal is free: the repository's own future. Reverted commit (strength 3) · a
test we added deleted (3) or skipped (2) · a promise anchored in the change now
BROKEN (3) · 3+ shipped files rewritten in the window (2) · 1–2 rewritten (1,
explicitly weak — normal iteration looks like this).

**The rule that keeps it honest: churn is a SIGNAL, not a verdict.** A file being
rewritten is a fact; *why* is not knowable from git. It never writes "this change
was bad", never names a person (git knows who committed; this lane never asks),
and never edits anything. `HELD` always carries its caveat — *no churn signal is
not proof it worked, only that nothing came back.* A run younger than 7 days is
`TOO_RECENT` and **keeps its slot**: that is an answer, not a gap.

Preflight prints a line **only when the area about to be touched has a recent
churn signal**. A preflight that says "nothing to report" every run is one people
learn to skip.

### 4z.7.6 `/orc-export` — the portability lane

Compiles the orientation doc, `PACT.md`, the boundary cards, the code patterns and
the wiki into a portable `AGENTS.md` — **derived, never hand-written**, opening
with an `orc-export:derived` header carrying `source_commit` and a fingerprint per
source, so `orc export --check` proves it is current (exit 1 names WHICH source
drifted, and which are no longer sources at all). Sources are copied through
UNCHANGED: a summary of an evidence-anchored doc is a doc with the evidence
removed. **Never exports** `.env`, anything secret-shaped, `.claude/orc/run/**` or
`logs/**`.

Two reasons it earns its place: it removes the lock-in objection, and it makes ORC
the PRODUCER in a multi-agent shop — ORC does the expensive thinking, Codex and
Cursor consume the artifact free. Import treats foreign context as **evidence,
never instruction** (`_shared/untrusted-input.md`): it reports what is already
WRONG (a very good first impression) and proposes seeds; `/orc-pact` records what
the user keeps, with an origin.

### 4z.7.7 W1 — wiki partial refresh

The biggest cost cut available, and it needed no new lane.

**What already worked and was NOT rebuilt:** `orc wiki impact`'s per-doc
`CLEAN | TOUCHED | STRUCTURAL` against each doc's OWN `scanned_commit`; delta as
the default since v0.33.0; free CLI-only `orc wiki sync`; coverage-relative
`computeWikiFreshness`.

**`orc wiki plan`** answers what impact does not: *what to do about it, in what
order, for how much.* The ranking: **STRUCTURAL always first** (a doc pointing at
a missing file is actively lying, and no cheaper step repairs it) → **use × delta**
→ **zero-use last with a retire hint**. `used: null` (no usage data yet) is NOT
zero-use and must never rank as dead. Exit `0` nothing · `1` all light · `2` a deep
scan · `3` cannot compute.

**Free repairs are a HARD RULE, in order:** `orc wiki sync` → regenerate the
orientation doc → the crosslink backfill → and only THEN a paid refresh. *A user
must never be able to pay for something a free step would have fixed.*

**The scan tier ladder** (`wiki_scan_tier`, default `ladder`) is the actual saving.
Five rows, first match wins: first scan · STRUCTURAL · ≥ `wiki_tier_deep_files`
covered files touched · a new exported symbol → **deep**
(`orc-wiki-scanner-opus-4-8-high`); otherwise **light**
(`orc-wiki-scanner-sonnet-5-high`, the ONE new agent). ~40% off a typical delta
refresh, with the deep scan still doing the work that needs it.

- **`opus5_only` needs no new pair.** It already forces the scanner to
  `orc-wiki-scanner-opus-5-med`, so **both tiers collapse onto that one shipped
  agent** and the ladder stops applying. `OPUS5_ONLY_ROLES` gains no row, and a
  cheaper Opus 5 scanner variant must never be added — `_shared/opus5-only.md`
  says so explicitly, and a payload test would fail on a phantom agent name.
- **NEVER SILENT.** The resolved tier is printed in `orc wiki plan` and in the
  refresh confirmation. A cheaper model is never a quiet substitution.
- The light scanner **escalates rather than under-delivers**: `needs_context` on a
  new symbol or a missing anchor, re-run deep. Cheap; an invented anchor is
  permanent.

**Targeted refresh** (`/orc-wiki refresh <doc> | --only <glob> | --top N |
--all-touched`) skips Phase 0 branch detection and Phase 1 area planning entirely —
the doc exists, so its coverage area is in its own header. No new pause mechanic.
**`wiki_refresh_budget`** caps scan-tasks as a PLANNED stop (sync has already run,
so the wiki is registered and consistent and the rest is AGING, not broken); it is
a different mechanic from the fixed pause every 5 scan-tasks and **must not be
merged with it**.

**`orc wiki usage`** finally reads back the point-of-use attribution v0.41.0 has
been recording and nothing has read: the `wiki:` continuation on a `DISPATCH` and
the `WIKI-CONSULT` docs list, counted ONCE per run per doc. It lives in
**`.claude/orc/wiki-usage.json` — its own file with its own writer, NEVER in
`wiki-meta.json`**, which is 100% doc-header-derived with `orc wiki sync` as its
only writer (§4j).

**Deliberately NOT in this release:** surgical section refresh. It needs the
wiki-doc header parser to carry a section→file map — one of the GRAMMAR-shaped
drift surfaces the contract lint cannot see — and a partial body rewrite can break
the integrity self-check's anchoring rule. Noted so it is not re-invented.

### 4z.7.8 W2 — the panels

Three new (**Promises**, **Boundary**, **Self-serve**), five extended (Knowledge,
Stats' new **Cost** tab, Runs, Maintenance, Overview).

**The line, made visible rather than hidden: a FREE action gets a button, a PAID
action gets a copy-able command.** `orc pact check` runs the ledger's own cheap
proofs, `orc handoff set` edits one graded surface, `orc export` compiles files
already on disk — all deterministic, all buttons. Reconciling a promise, deciding
a verdict, refreshing a wiki page: commands, with the reason printed beside them
(`.lane-cmd`). A test greps the WRITES table to make sure no lane name ever
appears in it.

Panel rules that carried over unchanged and now have new places to break:

- **The CLI's state words are the ONLY state words** — `HOLDING`/`DRIFTED`/
  `UNCHECKABLE`/`BROKEN`, `EXECUTE`/`ESCALATE`/`REFUSE`, `STRUCTURAL`/`TOUCHED`
  are rendered verbatim. A friendlier synonym is a second vocabulary.
- **Never derive a list the CLI already emits** — the wiki-plan order, the tier,
  the estimate and the price are rendered, never computed (the Flow-stepper rule).
- **A row keeps its slot.** A `used 0/20` doc renders muted with a retire hint; a
  `TOO_RECENT` run keeps its chip. Filtering either makes "measured and unused"
  identical to "does not exist".
- **A REFUSE with no checklist renders an ERROR**, not an empty card.
- **A RED surface gets NO BUTTON AT ALL** — not a disabled one. A disabled button
  invites a support question; a reason and a person to ask answers it.
- **The stacked cost bar exists so cache-read stays visibly separate.** A
  single-value bar would re-hide exactly what the four-part vector exposes.
- **The low-confidence warning is not optional chrome.** An honest range rendered
  as a confident bar is a lie the panel invented.
- i18n is **panel prose only**; a command may appear inside translated prose but
  must be byte-identical in both tables.

**Promises is where the compounding becomes visible.** The `Also flagged by:` line
— boundary and aftermath agreeing with the ledger about the same area — is the
strongest signal ORC can produce and is invisible in a terminal, where you see one
lane at a time.

### 4z.7.9 What must NOT change

- `orc wiki sync` stays the only writer of `wiki-meta.json` + `INDEX.md`, 100%
  derived from doc headers. Usage has its own file.
- `meta.scan_commit` stays the OLDEST doc's anchor, and NOTHING reads it as a tier.
- Freshness edges come from `wiki_fresh_max` / `wiki_aging_max`; a hardcoded 10/30
  is a bug. `computeWikiFreshness` stays the ONE engine.
- Crosslink publish stays per-scan-task; a STRUCTURAL blind spot still degrades one
  step and never past AGING; the fixed pause every 5 scan-tasks is not configurable.
- `PACT.md` and `AGENTS.md` are DERIVED and never hand-written.
- A pact state, a boundary verdict and a wiki tier are computed by the CLI and by
  nothing else.
- `pact_gate` never blocks a run; `/orc-budget` never blocks a run.

## 4z.9. `/orc-challenge` — the lane that refuses to produce (v0.47.0)

**The problem.** Every lane ORC has, and nearly every skill in the ecosystem,
*produces*. There is no shortage of things that will write your TSD. There is
nothing that will tell you the one you already wrote is not finished — and then
refuse to finish it for you.

The refusal is the whole design. **A session that just wrote the fix will grade
its own homework, and it will always pass.** Not because it is dishonest:
because it knows what it meant, so it reads its own text through the intent that
produced it. The only way to measure whether a document survives without its
author in the room is to take the author out of the room.

> **ORC judges, the user fixes, ORC re-judges — and ORC never fixes what it
> judged.**

**a lane that fixes what it judged** has broken that contract. It registers as the
third member of an existing pair, and the pattern is the same every time — facts
and findings are ORC's, the work and the decision are the user's:

| Lane | Token | Broken by |
|---|---|---|
| `_shared/interview.md` (v0.42.0) | `a lane that answers its own interview question` | ORC deciding for the user |
| `/orc-brainstorm` (v0.45.0) | `a lane that picks its own favourite` | ORC choosing between its own options |
| `/orc-challenge` (v0.47.0) | `a lane that fixes what it judged` | ORC grading its own repair |

### 4z.9.1 Rule 0 — a finding is only a finding relative to a goal

The failure this prevents is subtle and expensive. The same TSD is *finished* for
"a backend team implements this without asking me anything" and nowhere near done
for "our offshore team must read it cold". A lane that assumes the goal attacks
the wrong thing **with total confidence**, and every one of its findings is
*defensible* — which is worse than being obviously wrong, because there is no
signal telling the user to stop. They fix three iterations of things that did not
matter and conclude the tool is noisy.

So: **the user states the goal and supplies the context; ORC ASKS when either is
thin, and NEVER fills the gap itself.** `a lane that guesses the user's goal has
broken this contract` is registered as its own token, in `_shared/interview.md`,
`orc-challenge/SKILL.md` and `references/intake.md`.

Two mechanisms make it structural rather than aspirational:

1. **`orc challenge init` has no default for `--goal`, `--audience` or
   `--done-means`.** A run that tried to skip the intake round fails at the CLI,
   naming the missing flag. Prose can be forgotten; an exit code cannot.
2. **Every finding must name which goal element it `serves`.** `orc challenge
   record` DROPS one that cannot. That is the mechanism that stops a judge with a
   large context window from reviewing the entire universe — and it is the
   reason the `--out-of-scope` answer is worth asking for once.

The goal is prose the user wrote *in this session*, and rule 3 forbids handing
the judge prose from this session. The resolution is the same one the template
uses: **freeze it to disk** (`goals.md`) and pass a PATH. Every iteration's judge
then reads the identical goal from the identical file, forever. Changing it
mid-cycle is a `regoal` event, prior iterations keep their stamp, and the panel
draws a version break — a review history against a moving goal is not a history.

### 4z.9.2 Three agents, three INSTRUMENTS

The interesting one is the reader, and the interesting thing about it is that it
is deliberately weak.

| Agent | Effort | Tools | Why |
|---|---|---|---|
| `orc-challenge-judge-opus-5-high` | high | `Read, Glob, Grep, Bash` | D2 (does the low-level design exist) is the only dimension no computer can reach |
| `orc-challenge-advisor-opus-5-med` | medium | same, read-only | grouping twelve findings into three root causes is pattern work |
| `orc-challenge-reader-opus-5-low` | **low** | **`Read` only** | see below |

**To judge "can a reader without context follow this?" the reader must BE without
context.** The grounded judge has read the repository — it can no longer simulate
ignorance and will unconsciously fill every gap the document leaves. So D4 is
measured by a separate dispatch that receives the artifact and nothing else, and
is asked to *answer questions from it* rather than to review it.

**`low` effort is a MEASUREMENT choice, not a cost one.** Low effort does not
reason around a gap: it reports what the document actually says rather than what
a determined reader could reconstruct. **A stronger, harder-thinking reader is a
WORSE instrument** — it papers over exactly the gaps D4 exists to find. Nothing
may ever "upgrade" it.

Its tools are `Read` and nothing else — not `Glob`, not `Grep`, not `Bash`. **The
instrument is defined by what it cannot reach.** Its return is not prose: it is a
scored questionnaire (`answered_from_artifact` / `answered_by_guessing` /
`unanswerable`), and `8/12` is what "someone new can follow this" looks like as a
number. It is given the **audience line but not the goal**: "a reader without
context" is meaningless until you say which reader, but telling it what the
document is *trying to achieve* hands it the answers it is supposed to have to
find, and D4 measures exactly the gap between the two.

All three are already `claude-opus-5`, so `opus5_only` is a no-op for the lane —
zero pairs, no rename churn. **Unaffected, not exempt.**

### 4z.9.3 PASS is arithmetic, and the CLI does it

`PASS` = zero open findings at or above `challenge_pass_severity`, after accepted
exceptions are subtracted, and every selected dimension reported a result.
`orc challenge record` computes it; the judge cannot.

This is not ceremony. **A judge that CAN pass something can be talked into
passing something.** A judge that can only find, or fail to find, cannot. The
second half is structural too: `record` REJECTS an iteration in which a selected
dimension reported nothing, so "every dimension reported" is guaranteed before
the severity question is even asked, and PASS collapses to pure arithmetic.

**The state is recomputed live in BOTH directions.** The stored `passed` on an
iteration is that verdict's own history (what the convergence chart draws) and
never changes; the STATE reads the open set. So accepting a finding clears the
block the moment it is recorded — otherwise the escape valve does not escape
until one more paid iteration has run — and raising `challenge_pass_severity`
un-passes a cycle immediately, instead of a stored verdict outranking the bar the
user just set.

### 4z.9.4 Conservation, and the two ways out

Borrowed from `context-combiner`, applied to findings: every carried finding gets
exactly ONE outcome (`resolved` · `still-open` · `superseded` · `withdrawn` ·
`accepted`) and a reason, and coverage below 100% is rejected **by name**. A
silently dropped finding is indistinguishable from a fixed one, and that is the
classic way a review cycle appears to converge.

An id is PERMANENT. `F-003` means the same thing in iteration 7 as in iteration 1,
or the history is worthless.

`record` is a GATE, not a store. It rejects, by name: coverage < 100 (with the
missing ids), an unknown carry id, a reasonless `withdrawn`, an uncited
`superseded`, an **ignored rebuttal**, a **silent dimension**, a bad severity, an
unknown dimension, and a verdict body that is not on disk.

Two escape valves, because a loop with no exit is a trap:

- **`accept`** — a known gap. It stops blocking and stays visible forever with
  the reason. Never automatic (the `/orc-pact` retirement rule). "Good enough,
  and here is why" is a legitimate ending; recording it beats quietly lowering
  the bar.
- **`rebut`** — the judge is wrong. The next judge must answer explicitly,
  `withdrawn` with an admission or `upheld` with NEW evidence. Without it, one
  wrong finding loops forever and the user's only move is to give up.

### 4z.9.5 Convergence, not a cap

Every other loop in ORC has a hard cap — TDD 3, drift recovery 2, quick repair 3
— and every one of those runs inside a single session and costs tokens per turn.
**Here each turn is a separate human sitting down to work.** A cap that refused on
iteration 6 would be refusing to review a hard document.

So it measures: `stalled` after `challenge_stall_after` (default 3) iterations
with no net reduction, printed ONCE with three honest options (narrow the rubric,
accept the gaps, keep going) and again only if the count RISES. There is no
config key for a cap, and there must never be one.

### 4z.9.6 The resume never asks where the fix went

`revision_mode` is declared at intake, frozen into `goals.md`, and restated in a
`Where to put the revised version` block in every fix brief. Asking the resumed
session for it would be rule 0's failure mode in miniature — a lane making the
user re-supply context ORC wrote down itself.

`orc challenge diff` resolves the expectation FIRST, then reports per-finding
`touched`/`untouched` — **coverage-relative**, the `computeWikiFreshness` lesson
applied to findings. It is a **hint for the human and never an input to the
judge**: untouched does not mean unfixed (the fix may be elsewhere) and touched
does not mean fixed. Rule 11: the judge re-reads.

When the declared path is not there, `MISSING-REVISION` **lists candidates and
never adopts one.** Picking the closest-looking file would be ORC guessing what
the user did, and **a judge pointed at the wrong file produces a page of
confident, useless findings.** The escape (`orc challenge expect --set`) is a
recorded command, because a plan the user cannot deviate from is a plan they will
deviate from silently.

Two implementation notes that were real defects while writing it: the candidate
scan uses `git status --porcelain`, not `git diff`, because a brand-new `-v2.md`
is UNTRACKED and a diff against HEAD cannot see the one file the user actually
wrote; and git collapses an untracked tree to `orc/`, so a directory entry is
excluded as well as the full trail path.

### 4z.9.7 `orc challenge lint` — everything a computer can decide

Structure (against the frozen template) plus prose, all deterministic, all free.
Its real payoff is that `lint.json` rides in the judge's slice, so the judge never
spends tokens counting sentences — it spends them on D2.

Three things it learned the hard way:

1. **Sentences are measured over PARAGRAPHS, not lines.** A hard-wrapped 43-word
   sentence is still a 43-word sentence; splitting at the newline is how a length
   check silently passes every wrapped document. The first version reported a p90
   of 15 words on a file whose worst sentence was 43.
2. **Depth 2–3 only for the template comparison.** The H1 is the document's
   TITLE; comparing it made "TSD — Payments" an invented section and "TSD
   Template" a missing one, on every single document.
3. **A CONTAINER heading is skipped by the empty-ceremony check** (its next
   heading is deeper, so its children carry the body). Otherwise the check fires
   on the title of every well-structured document.

Two honesty rules are printed by the command itself: it is a **SIGNAL, not a
verdict** (the `/orc-aftermath` rule — the lint never blocks; it feeds the judge,
who decides), and it is **English-specific and heuristic**.

### 4z.9.8 What must NOT change

- **No `challenge_same_session` escape hatch.** Weakening the premise with a
  config key is how the premise dies. The stop IS the product.
- **No loop cap, and no config key for one.**
- **No model or effort key** — that is the pinned agents' job, and the reader's
  `low` is a measurement, not a budget.
- **No `block` mode on `challenge_gate`** — the `/orc-pact` precedent: the payoff
  is knowing, not gating.
- `challenge.json` keeps exactly one writer, and it is never a model.
- The judge slice stays PATHS AND IDS. A summary is where the bias enters.
- The judge never declares a pass; `NOT-CHECKED` never loses its reason; a
  candidate revision is never adopted; nothing is ever staged or committed.
- **The `code` kind keeps using the cached code-pattern as its template.** That
  file already reconciles the project's real conventions and already separates
  conventions (deferential) from invariants (enforced) — which is exactly the
  D1/D2 split. Never substitute a generic style guide.

---

## 4z.10. `/orc-doc` — the lane that writes the long document (v0.48.0)

### The problem

Writing a long document with an agent fails in three specific ways, and all
three are context-window problems wearing a costume:

1. **The orchestrator reads the document it is writing.** A 900-line TSD is
   ~30k tokens. Read it three times across a session and the session is over.
2. **Every edit re-reads and re-writes the whole file.** Changing one paragraph
   in section 9 should not cost the other 14 sections.
3. **The context dies with the session.** You come back on Monday, the model
   knows nothing, and you paste the same brief for the fourth time.

### The two contracts (registered tokens)

> **The orchestrator never reads the document body.** It knows the document only
> through the CLI's derived section map and through what the agents it
> dispatched report back. **`a lane that reads its own document`** has broken it.

> **The context is gathered once and frozen.** A resumed session reads
> `context.md` from disk; it never re-interviews the user for what session 1
> already settled. **`a lane that re-asks a frozen question`** has broken it.

They are registered as a PAIR because they fail together: a lane that reads the
body has no reason to freeze the context, and a lane that re-interviews has
already lost the reason not to read the body. Third registered token:
`orc/orc-doc/`, with `binFiles: ["bin/cli.js"]` (the `DOC_DIR` literal).

### What the CLI owns, and what a skill may never recompute

| CLI owns (computed) | Skill owns (prose) |
|---|---|
| the section map + every absolute line number | `context.md`, `RESUME.md`, `changelog.md` |
| the per-section hashes and the state derived from them | the questions and the wording |
| the batching and the parallel cap | which agent gets dispatched |
| the lint findings and the readability signals | the judgment findings |
| the completion state and every exit code | — |

**A skill that recomputes one of these has forked it** — the
`computeWikiFreshness` / Flow-stepper rule. Line arithmetic in particular is the
one job a language model is guaranteed to get wrong, and the whole token saving
depends on the numbers being right.

### The section map — derived, never stored

`orc doc map <slug> --json` per section: `id` · `heading` · `level` · `start` ·
`end` · `lines` · `hash` · `state` · `required` · `findings` · `renamed_from`.

- **`id` comes from the OUTLINE, never from the file's own ordinal.** `docScan`
  can only number what it sees, and a skipped optional section shifts every
  ordinal after it — a purely positional id would rename half the document the
  first time somebody dropped a section nobody asked for. `docReconcile` re-keys
  by heading slug (pass 1), then repairs renames (pass 2).
- **`hash`** = SHA-256 of the section's exact text, doing three jobs: drift
  detection (did the user edit it?), conflict detection (did it change between
  extract and splice?), skip detection (an unchanged section needs no re-check).
  *The hash is what turns a re-check from a full pass into a diff.*
- **`state`** ∈ `planned | written | checked | user-edited | open` — COMPUTED by
  comparing the live hash to the one `doc.json` recorded, never stored as a
  claim. The word list is mirrored in `references/chunking.md`; a word list is
  not a single token, so a golden test compares the two.
- **Renames are repaired, not lost.** An unmatched section between two matched
  neighbours takes the one unconsumed outline entry between them. **Exactly one
  candidate, or nothing is repaired**: a guessed identity is worse than a lost
  one, because it silently attaches a section's history to the wrong text. `map`
  is the one command that persists this — it is a repair, not a claim, and
  nothing else runs after a hand edit.

### The batching (`orc doc plan --role write|check|edit`)

1. **Never split a section across two agents** — half a section is half an idea.
2. **≤ `doc_max_parallel`, and the HARD CAP IS 4.** A larger value is clamped and
   the clamp is DATA (`clamped: {from, to}`), so the terminal and the panel both
   say it. More parallel writers is more chances for the outline to drift, and
   the assemble wave is what has to reconcile it.
3. **≤ `doc_max_lines_per_agent`** (default 400).
4. Sections that reference each other share an `affinity` and land in the same
   slice wherever the budget allows — cross-agent consistency is expensive to
   check and free to prevent.
5. A single section over the cap is a **planning smell**: it is returned in
   `oversized[]`, alone in its slice, and offered as a split at the outline gate.

**An empty result is an ANSWER**: the same object shape, empty `waves[]`, exit 1.

### extract → edit → splice

`splice` replaces **bottom-up** (highest `start` first), so a length change never
shifts a range that has not been spliced yet — this is why the model never does
line arithmetic. It **REFUSES** any part whose recorded hash no longer matches
the file on disk, reporting the conflict by section NAME and writing nothing: a
human's wording is not recoverable from this lane's side once it is gone. Repair
is capped at 2 rounds, then an honest report (`_shared/drift-recovery.md` shape).

**A `user-edited` section is never rewritten without an instruction naming it.**
A finding inside one is reported and the fix offered, never applied.

### The portability profile

`orc doc lint` is FREE and deterministic, and **free checks run before paid ones,
always** — its findings ride in the checker's slice so no model is ever paid to
count sentences, and the checker never re-reports one. Every rule came from a
real product limit (`references/import-targets.md`, `orc doc targets`):

- `--target notion` → heading depth ≤ 3 is an **error** (Notion has three levels).
- `--target docusaurus|hugo|jekyll` → YAML front matter is **required**; every
  other target treats it as an error.
- `--target confluence` → warn once, at handoff: it needs an importer app.
- `--target generic` (default) → the intersection of all of them.
- A **hard-wrapped paragraph is an error everywhere** — one paragraph is one
  line. It is the single most common import-mangling bug, and it is reported
  once per paragraph, not once per wrapped line.

Two honesty lines print on every run: a readability signal is a SIGNAL, not a
verdict, and it is English-specific and heuristic.

### The gates (order is part of the contract)

D1 context (**P0 — nothing is created until it is answered**; a slug folder with
no context is indistinguishable from an abandoned run) → D2 supporting documents
(asking is mandatory, "none" is a complete answer, and **the orchestrator reads
none of them** — one `role: digest` dispatch per file returns anchored claims
plus `not_covered[]`) → D3 template (headings only; a supplied one REPLACES the
shipped one, never a merge; **a structure is never guessed out of prose**) → D4
purpose (one batched `_shared/interview.md` round; every field has a recommended
default and accepting one counts as answering) → D5 outline, confirmed before a
word is written.

D1 can OFFER `_shared/lane-suspend.md` (`RETURN-TO`) to `/orc-brainstorm` when
the user has not decided yet. It offers; it never forces.

### The two agents

Both already `claude-opus-5`, so **`opus5_only` is a no-op — the lane is
*unaffected*, not exempt** (the `/orc-challenge` precedent), and neither needs a
twin.

- **`orc-doc-writer-opus-5-med`** — writes ONE part file from a slice, or
  digests one supporting document. It never opens `document.md`; that is what
  makes parallel writing safe here. Its `start`/`end` are **part-local**: asking
  an agent for an absolute line number in a file it cannot see is exactly how
  that number gets invented.
- **`orc-doc-checker-opus-5-low`** — `Read` and nothing else, one line range,
  `Read(file_path, offset, limit)`. **`low` is a measurement choice, not a cost
  one**: a harder-thinking checker reasons its way past a gap a real reader would
  trip on, the same reasoning that pins `/orc-challenge`'s cold reader at `low`.
  Nothing may ever upgrade it.

### Trace + resume

Lane token `doc`, **Iterative tier** — one packet per completed cycle, verb `DOC`
with `cycle=N sections=K/M`. `.current` + `touch the trace file` in the SAME step,
and again on every resume. `RESUME.md` is written by ORC ITSELF, never by a
dispatched agent, and keeps the `Where it stands:` shape `orc doc list` /
`orc resume` / `orc run list` parse.

### The panel

`orc ui` ▸ **Docs**. The RIBBON is the picture: one segment per section, width
`lines × PX` with a floor, coloured by state — geometry solved from the box size
(the `VAULT`/`ringRadii` lesson), the canvas is the bounding box of what was
placed, and a long document SCROLLS rather than being squeezed. Entrance and
pulse are SEPARATE animations, and `prefers-reduced-motion` REMOVES all of them
(a capped `scaleY` leaves a segment drawn at 40% height, misreporting the line
count it is drawn from). A findings marker is **static** — a blinking error is a
reduced-motion hazard and reads as an urgency the panel has no right to imply.

Free actions are buttons (`lint`, `map`, `status`, `assemble`); a write wave, a
check wave and a repair are copy-able commands with no route at all. There is
exactly ONE route that returns any of the document's prose —
`/api/doc/section`, one section, only on an explicit Reveal click, rendered as
DOM through `renderMd` and never as HTML.

### Deliberately absent

- **No pid lock.** The HASH is the guard: `splice` refuses when a section moved,
  which is stronger than a lock and keeps one idea of the protection instead of
  two.
- **No `orc doc export`** and no per-document filename — `document.md` is fixed,
  which keeps every tool in the chain simple.
- **No commit and no staging, ever.** It prints the `git add` command.
- **No self-grading.** It offers `/orc-challenge` and runs nothing — the same
  separation `/orc-challenge`'s own contract enforces from the other side.

---

## 4z.10.1 `/orc-doc` gains a score, a finish line and a memory (v0.48.1)

**The rule.** The pipeline is CLI-computed, delivery is a recorded decision whose
STATE is computed, and the journal never invents a row.

**What each half prevents, and what enforces it:**

| | Failure prevented | Enforced by |
|---|---|---|
| **`orc doc next`** | A session that improvises the phase order — the remembered-not-dispatched protocol that already cost this repo the v0.32.0 narration rewrite twice. | `docNextAction` in `bin/cli.js`; exit 0/1/2, `paid`, `blocked_by`. Golden test: every command it can emit is a real subcommand, every phase it reports is in `SKILL.md`. |
| **`orc doc ship`** | A finished document and a delivered one looking identical in a listing forever. | `docShipCmd`. `--where` has NO DEFAULT (the `orc challenge init --goal` rule); `--force` needs `--reason`, recorded verbatim; `unship` needs a reason and keeps `ship_history[]`. |
| **`shipped-drifted`** | A whole-file "something changed" that cannot tell you what to re-read. | `docShipDrift` diffs the recorded per-section hashes — coverage-relative, **S1** and the `computeWikiFreshness` shape. Exits **1**: a document that moved after delivery is work. |
| **`orc doc audit`** | Drift that only a human re-reading the folder would ever notice. | `docAuditFindings`, nine classes, each with a `fix` and a `FINDING_ROUTE` panel. A `user-edited` section is REPORTED and never a finding — flagging it teaches people to stop editing their own document. `orc doctor` gains `doc-drifted`. |
| **`orc doc journal`** | A reconstruction that reads like a fact. | `docJournalRows` merges four sources with per-row `origin`; a cycle nobody logged renders AS A GAP. The **not knowing is an answer** rule, same as pact's UNCHECKABLE. |
| **`orc doc context`** | Nobody knowing a supporting document moved under a frozen brief. | `docContextSources`; `ok` / `MISSING` / `SOURCE-DRIFTED` per file. A **warning, never an error** — a frozen context is *supposed* to be old. |

**Three things that must NOT change:**

1. **`doc.json` still has exactly ONE writer.** `orc doc log` appends through
   `docWrite`; it writes no file itself. A test asserts both halves.
2. **`docWhereLine`'s PREFIX is byte-stable.** `orc doc list` parses it, which is
   how a listing never opens `doc.json`. The ship state is a SUFFIX.
3. **`orc doc read` is for the HUMAN.** Hard rule 0 is not softened by a command
   that prints prose — the rule table says so, and it is a registered contract
   token so the sentence cannot quietly vanish.

**Deliberately absent:** a config key for any of it. Shipping is a decision, and
a key that let it happen automatically would be the one thing this design is
against.

## 4z.11 `/orc-doc` — the document becomes a FOLDER (v0.49.0)

**Read §4z.10 and §4z.10.1 first.** This section amends them: the two headline
contracts (*a lane that reads its own document*, *a lane that re-asks a frozen
question*) are unchanged and still govern. What changed is where the truth lives
and what a wave is.

### The framing that matters

Three quarters of the plan for this release **already existed** on disk:
`orc doc plan --role write` already emitted one part file per section, ids were
already `NN-slug` derived from the outline, `docScan` already cut on `## ` alone
(fence-aware), the orchestrator already never read the body — and
`orc doc assemble` was **already pure Node, zero model tokens**.

So the honest framing is: **compiling was never the expensive part.** The release
is a re-pointing, not a rewrite, and anyone who reads the changelog as "compiling
got cheaper" has misread it.

### The seven defects it actually fixes

| # | Defect | Consequence |
|---|---|---|
| D-1 | `.work/` was scratch, `document.md` was truth | Every later change was `extract` → edit → `splice` **through the monolith**. The section files existed and were dead |
| D-2 | `assemble` refused while any required part was missing | You paid for all 25 slices before you could look at anything. **The single biggest token leak in the lane** — not compiling, not reading: the inability to review after wave 1 |
| D-3 | A slice covering two sections wrote ONE file, named after the first | `docAssembleCmd` looked a file up **per outline id**, so the second section's file never existed. Required → assemble refuses forever; optional → it silently vanished. **A live bug** |
| D-4 | The deliverable carried ORC's bookkeeping | `> **Open:**` / `> **Assumption:**` written INTO the document by contract, and `docStateOfSection` **sniffed the body text** for one |
| D-5 | `RESUME.md` lived in the doc folder | `listRuns()` enumerates `.claude/orc/run/` and **nothing else**, so the v0.42.0 contract *"RESUME.md existing IS the run-unfinished flag"* never fired for this lane |
| D-6 | The template wrote `## Where it stands:` | `parseStands` is `/^Where it stands:…/m` — line-anchored. The `## ` prefix meant **no match, ever**. The one line the whole listing contract depends on was unparseable |
| D-7 | That line carried no `phase` and no `wave` | Precisely the two facts a person returning after a usage-limit reset needs |

### The layout

```
orc/orc-doc/<slug>/
├── doc.json          version: 2
├── context.md · context-sources.md · outline.md · changelog.md
├── gaps.md        ◄── DERIVED: every Open / Assumption, OUT of the document
├── sections/      ◄── THE SOURCE OF TRUTH
│   ├── 00-front.md            anything above the first `## `
│   ├── 01-document-info.md
│   └── 04-detailed-design/    a big section, stored as sub-parts
│       ├── 00-head.md · 01-data-model.md · 02-api-surface.md
├── document.md    ◄── THE BUILD ARTIFACT
└── .work/         ◄── legacy, drained, non-authoritative

.claude/orc/run/<slug>/RESUME.md   ◄── the ONLY place `orc resume` looks
```

**The join key is the FILENAME.** HTML comment markers (`<!-- orc-doc:section
03-goals -->`) were rejected hard: an HTML comment is a *lint error* in this lane
and mangles on a Notion / Google Docs import, and the deliverable's cleanliness is
the lane's entire product. **A marker that buys nothing costs the import** — and
it buys nothing, because the filename already carries the id and `docScan`
recovers it from the `## ` heading.

**Order comes from `doc.json.outline`, never from the filename number.** Sorting
by filename would silently reorder the document the first time an outline entry
was inserted, and it contradicts the existing rule *a section's id comes from the
OUTLINE, never from the file's own ordinal*.

### Compile — and why `source_hashes` is the whole mechanism

`docCompileCmd` is Node in the same process: `outline.length` reads, one write,
one `docScan`. A standalone `.sh` was considered and rejected — this repo is
zero-dependency Node and ships on Windows, and a bash compile step would be the
only POSIX-only thing in the package.

`compiled.source_hashes = { id → hash of that section's assembled source }`.
**`document.md` is stale ⇔ some section hashes differently today than that
recorded.** Pure disk comparison, coverage-relative, no stored status word — the
`computeWikiFreshness` / `shipped-drifted` rule applied to a build artifact. It
is what lets `orc doc ship` refuse and *name the sections*.

**Round-trip property, which is a test:** `split` then `compile` reproduces
`document.md` byte for byte. `00-front.md` is what makes it hold — it carries the
H1, and compile emits its own `# <title>` **only when the front file has none**.

### `unconfirmed`, and why a wave is a stop

**Progress is durable by construction.** In v0.48.1 the write loop lived in the
orchestrator's head and nothing on disk said which waves were done. In v2
`sections/<id>.md` existing IS the record — there is no checkpoint file to invent
and none to drift.

What had to be ADDED is the **declaration**, in this exact order:

1. Validate the wave's returns → `orc doc parts <slug> --confirm <ids>` records
   each hash.
2. `orc doc parts --json` — the CLI recomputes what is done.
3. **ORC ITSELF writes `RESUME.md`**, FIRST among the outputs. Never a dispatched
   agent: *a dispatch inside a stop sequence lets a stop fail because a subagent
   did* (v0.42.0). If the session is about to die, this is the file that has to
   exist.
4. Print the hand-back block — every path written, plus the resume line.
5. Dispatch the trace packet — **last**, because it is the only step that needs a
   subagent and therefore the only one that can fail.

**A part is `written` only when its hash came from a validated return.** A file
present with no recorded hash is `unconfirmed` — exactly what a usage-limit kill
leaves — and it is re-written, never shipped. `docWaveState` derives `K of N` by
counting waves whose sections are all hash-confirmed; the wave list is persisted
by `plan` as `doc.json.plan.waves`.

### The clean-deliverable reversal

Hard rule 5's **mechanism** is reversed; its **principle** is untouched. ORC still
never invents a fact — it just no longer writes its uncertainty into your
document.

Four enforcement points, and none is a silent rewrite:

1. **The writer never emits one** — uncertainty goes in the return's `gaps[]`.
2. **`orc doc lint` errors on `annotation-in-body`,** matching an EXACT set
   (`DOC_ANNOTATION_RE`, defined once and shared with compile and audit) and
   nothing else. A user's own line beginning "Note:" is content. **A narrow rule
   that is always right beats a broad one that argues with the author.** A bare
   `<!-- … -->` is deliberately NOT in the set — `html-comment` already reports
   it, and one line must never collect two findings for the same fact.
3. **`compile` REPORTS, never silently strips.** Rule 4 outranks tidiness: we
   cannot tell whose line it is. `--strip-annotations` is the explicit opt-in.
4. **State no longer sniffs the body.** The `> **Open:` test is gated on
   `version < 2`; in v2 existence and hashes decide, which was always strictly
   more reliable than a text match.

`open` stays in `DOC_STATES` (a v1 doc can still hold one, and the panel's state
map is set-equality-tested), but nothing in v2 ever produces it.

Where a gap goes: **`orc doc log --kind gap`**, and `gaps.md` is DERIVED from the
journal. It is NOT a second ledger — `doc.json` still has exactly one writer.

### Sub-parts — a section too big for one file

It splits **underneath**, and the reader never knows. Forcing it to become several
`##` sections would change the deliverable to solve ORC's storage problem, which
is backwards.

The sub-headings come from **nowhere new**: `docScan` already collected every
heading level and merely filtered to `level === 2`. Honour level 3 and a template
that already has `###` under a `##` carries its own sub-structure for free.

Five refuse-and-name rules make it safe: exactly one `##` per section
(`00-head.md`, or compile emits the outline heading); a child starting with `##`
is a REFUSAL named by file (demoting restructures, promoting splits — neither is
ours to choose); a child must start at `###` or deeper; order is
`outline[i].subsections[]`, never `readdir`; blank-line normalisation runs ONCE at
the very end.

**One helper, every consumer.** `docSectionSource(p, outlineEntry)` resolves
flat-or-nested in one place — compile, `parts`, the staleness check, `extract` and
the check-dispatch all call it. A second idea of "what a section's source is" is
exactly the drift this lane exists to prevent.

**Invisible above and below:** `docScan` on the compiled document still cuts on
`##` only, so `map`, `lint`, `ship`, `audit` and the whole line-range model are
completely unchanged. **No new config key** — `doc_max_lines_per_agent` is already
the threshold.

### Migration, and what it refuses

`docMigrateV2` runs on the first `orc doc <anything> <slug>` where `version < 2` —
never on `list` (a listing must not mutate), and never on `extract` or `splice`
(a v1 document with a pending extract has to reach its own hash-conflict refusal,
preserved verbatim, before anything moves).

| v1 state | What migration does |
|---|---|
| `document.md` exists | `split` into `sections/`. **NOT deleted** — it becomes the artifact, and `source_hashes` is seeded so it starts *fresh*, not stale |
| a recorded `.work/` extract | The newer edit, so it **wins** for that id |
| `.work/*.md`, no `document.md` | **Moved** |
| a section that is only an `Open` stub | No file created → `planned`. The stub does not survive |
| `RESUME.md` in the doc folder | **Moved** to `{run_dir}/{slug}/`, `## ` prefix stripped |
| no `##` at all | **REFUSED.** `version` stays 1, nothing is written — a guessed structure is worse than none (the `docInit` `no-headings` precedent) |

Recorded in `doc.json.migrations[]` and **never in the journal**: `orc doc log`
records what the *user* said, and a migration is a machine fact (hard rule 12).

`assemble` / `extract` / `splice` survive as thin aliases for one release, exit
codes preserved — `orc doc next` output gets copied into notes and scripts.

### What is deliberately absent

- **No comment markers in the deliverable.** They buy nothing the filename does
  not already give, and they break the import.
- **No shell/`.sh` compile step.** A POSIX-only build step in a zero-dependency,
  Windows-supported Node package, to do in a subprocess what the CLI already does
  in-process for free.
- **No config key for sub-parts or for the wave checkpoint.**
  `doc_max_lines_per_agent` is already the split threshold and a wave is already
  a wave. A key here would be a second idea of a number that already exists.
- **No route for `orc doc mode` in the panel.** It is a user decision the skill
  asks — the `orc doc log` precedent.

---

## 4z.12 The Challenge Council + the Knowledge deepening (v0.49.1)

One release, two workstreams, one bump. They ship together because they are the
same defect seen twice: **ORC computes far more than it shows.**
`computeWikiFreshness` builds a per-doc table that `--json` threw away;
`challenge record` computes per-dimension, per-severity, per-iteration detail
that the panel rendered as one chip. Both halves are *stop discarding what you
already computed* — and only one of them also adds new thinking.

> **Version note.** By the P0 rule (0.0.1 small, 0.1.0 big) this is a 0.1.0: five
> new agents, a new ledger version, a new CLI family and a rebuilt panel. The
> instruction for this release was an explicit 0.0.1, so the target is v0.49.1
> and this note is the only place the tension is recorded.

---

# PART A — THE COUNCIL

### 4z.12.1 The contract, and why it is the fourth of a family

`/orc-challenge` had **one grounded opinion** (the judge) and **one blind one**
(the cold reader), and both looked at the artifact the same way: *does this
document do what a document is supposed to do?* Five ways of looking were
missing, and each one fails differently:

| Role | It asks | It fails when |
|---|---|---|
| The Contrarian | where is the fatal flaw? | it assumes the artifact is fine and stops looking |
| The First Principles Thinker | are we even solving the right problem? | it accepts the framing it was handed |
| The Expansionist | what is being undervalued here? | it only counts what is wrong |
| The Outsider | what does this assume I already know? | it is an expert and cannot un-know things |
| The Executor | what do you actually do on Monday morning? | it grades the theory and never the first step |

The idea is the **LLM Council** pattern (five archetypes, parallel convening,
peer review, chairman synthesis). That is a **decision** framework; this lane
grades a **finished artifact**, so the adaptation is not a port. Three places it
must diverge: the output classes (§4z.12.3), conservation of INPUT (§4z.12.4),
and the two pieces it deliberately does NOT take (§4z.12.8).

> **A lens raises; only the judge resolves. ORC proposes the council; the user
> picks it.**
>
> **a lane that picks its own council has broken this contract.**

Registered as the fourth member of a family, and the split is identical every
time — the facts are ORC's to look up, the decision is the user's to take:

| Lane | Token |
|---|---|
| `_shared/interview.md` (v0.42.0) | `a lane that answers its own interview question` |
| `/orc-brainstorm` (v0.45.0) | `a lane that picks its own favourite` |
| `/orc-challenge` (v0.47.0) | `a lane that fixes what it judged` |
| `/orc-doc` (v0.48.0) | `a lane that reads its own document` |
| **`/orc-challenge` council (v0.49.1)** | **`a lane that picks its own council`** |

A council chosen by ORC is ORC deciding **which kinds of criticism the user is
allowed to hear** — a bigger decision than any single finding in the run.
Canonical prose: `templates/skills/orc-challenge/references/council.md`.

### 4z.12.2 The roster, and why effort is a MEASUREMENT

Seven lenses. One always runs, six are selectable, the user selects.

| Lens | Agent | Effort | Class | Ids | Blocks |
|---|---|---|---|---|---|
| `judge` | `orc-challenge-judge-opus-5-high` | high | finding | `F-` | yes |
| `reader` | `orc-challenge-reader-opus-5-low` | low | finding | `R-` | yes |
| `contrarian` | `orc-challenge-contrarian-opus-5-high` | high | finding | `C-` | yes |
| `outsider` | `orc-challenge-outsider-opus-5-low` | low | finding | `O-` | yes |
| `executor` | `orc-challenge-executor-opus-5-med` | medium | finding | `E-` | yes |
| `principles` | `orc-challenge-principles-opus-5-high` | high | **premise** | `Q-` | **never** |
| `expansionist` | `orc-challenge-expansionist-opus-5-med` | medium | **opportunity** | `X-` | **never** |

**Effort here is a measurement choice, not a cost choice** — the sentence that
already governs the cold reader and the `/orc-doc` checker, and it now governs
two more roles. `outsider` is `low` for the same reason `reader` is: a
harder-thinking outsider reasons its way *around* an unexplained acronym and
reports the document is fine, which is exactly the gap the instrument exists to
find. **Nothing may ever upgrade it.** `contrarian` is `high` because at low
effort it returns the three surface complaints the free lint already caught.
That is why there is **no model or effort config key**: a key that lets
`outsider: low` be tuned is a key that lets the instrument be broken.

All seven are `claude-opus-5`, so **`opus5_only` is a no-op for this lane — it is
unaffected, not exempt** — and the agent floor moves by exactly five with **no
paired variants** (the v0.47.0 precedent). Agent count 46 → 51.

**The reader / outsider seam is STRUCTURAL, not stylistic**, and it is the one
place this release could have produced a duplicate instrument. The reader is
told the AUDIENCE, generates the questions the artifact *promised to answer*, and
returns a SCORE (`8/12`, the D4 number). The outsider is told **nothing**,
generates no questionnaire, and returns **no score** — a second comprehension
number would leave a user asking which one is real. They are dispatched with no
knowledge of each other, and where they agree, that is the strongest
comprehension evidence the lane can produce: `corroborated_by: [reader,
outsider]`, and **never an automatic severity bump** (the `/orc-aftermath` rule
— churn is a signal, not a verdict).

### 4z.12.3 Three output classes — the honest split

Two of the six cannot produce a finding **without lying**, and forcing them to
would have been the single worst decision available.

**The expansionist.** A finding must carry `serves` and `record` DROPS one
without it (rule 0, structural). Its brief is *"what upside is everyone
missing?"*, which by construction is **not** in the stated goal — so a `serves`
field would make it either invent a goal element or be silently dropped by the
CLI. It returns `opportunity`: no severity, never in `findings[]`, never near the
pass gate. Conserved (`--take`/`--drop`, both requiring a reason) and ROUTED
(`brainstorm | pact | grill | none`). **This lane never builds one.**

**The first-principles thinker.** Its most valuable output is *"you are asking
the wrong question entirely"* — and in this lane the question is the **frozen
goal**. A finding is measured against the goal; a premise challenge disputes the
**yardstick**. Those cannot be the same object. Exactly two resolutions exist and
**both are a HUMAN's**: adopt (`orc challenge goals --set`, a `regoal` that bumps
`goals.version`) or dismiss with a mandatory reason that stays in the report
forever. **The judge NEVER sees the premise report** — handing a judge a document
arguing the frozen goal is wrong biases every finding it produces afterwards.

> **The three finding lenses feed the judge. The two non-finding lenses feed the
> user.** That sentence is the whole architecture.

### 4z.12.4 Council conservation — the gate that makes this safe

The obvious failure of adding five reviewers is that **the judge quietly ignores
four of them** and the run looks identical while costing five times more.

> **Every id the council raised must appear in the judge's return with exactly
> ONE disposition and a reason. `council_coverage_pct` must be 100.**

That is `conservation.md` applied to **input** instead of to carry-forward, and
the CLI enforces it without reading a word of prose: the orchestrator writes a
machine JSON beside every council report, and **`orc challenge record` reads
`iteration-NN/council/*.json` ITSELF** and derives the id set. The judge cannot
shrink it by omission, because the set was never the judge's to report.

The disposition set is closed — `adopted | merged | rejected | out-of-goal` —
`merged` needs a resolvable `merged_into`, and `rejected`/`out-of-goal` both need
a reason (and `out-of-goal` is **reported**, never silently dropped).

**`adopted` keeps the raiser's id.** `C-004` stays `C-004` in the verdict, in the
report, in iteration 9. An id is permanent, and this is what lets the panel say
*"the contrarian raised four of the six blockers"* — which is how a user finds
out whether a lens is worth its money.

**Across a changed roster:** rule 11 already had the judge re-reading a carried
finding **from the artifact on disk**, never from an account of what changed — so
it never needed the original raiser. **The judge resolves every carried finding,
whatever prefix it carries**, which makes the roster freely variable between
iterations at zero cost to conservation, and it is why lenses may only *raise*.

**PASS is computed exactly as before.** An adopted council finding is an ordinary
finding from that moment on; `challengeBlocking()`, `challengeOpen()`,
`challengeCounts()` and `challengeStateOf()` are untouched. **The pass gate
learns nothing about the council**, which is what keeps rule 2 true.

Every gate rejects BY NAME, all exit 2: `council-unset` · `unknown-lens` ·
`bad-prefix` · `duplicate-id` · `lens-silent` · `council-coverage` (naming the
missing ids) · `bad-disposition` · `class-mismatch` · `unknown-corroborator`.

### 4z.12.5 The roster is FROZEN, and `council: null` is a real state

Ledger `version: 2`, additive — every v1 key keeps its name, meaning and
position. `council` (frozen), `council_version`, `opportunities`, `premises`, a
`council[]` participation array and `council_coverage_pct` per iteration, and
`lens` **required on every finding** (a v1 iteration read back gets `judge`, so
the per-lens legend never gains a blank column).

**There is no `challenge_council` config key.** A global default roster would
silently answer the one question this release exists to ask. The roster is a
per-cycle decision changed only by a recorded `recouncil` event, which bumps
`council_version` exactly like `goals.version` and `template.version` — and the
iteration rail draws a **third** version break for it (labelled `c2`), because
comparing an iteration judged by three lenses to one judged by six is not a
comparison.

A cycle opened before v0.49.1 reads back with `council: null`, and `record`
refuses the next iteration by name (`council-unset`) until the roster is
answered. **A silent default would be ORC picking the council.** `orc challenge
council <slug>` exits 1 for that state: **UNSET is an ANSWER, not an error.**

### 4z.12.6 Dispatch discipline and rule 15

Every lens is dispatched **BY NAME** — an unnamed dispatch cannot enforce the pin
and is invisible to the trace hook (the v0.34.5 wiki-scanner lesson) — and a
by-name dispatch gets `SPAWN`/`RETURN` for free, which is how `/orc-retro` can
finally answer *"is the contrarian earning its dispatch?"*

**Hard cap: 3 in flight**, announced when it bites, **no config key**. Six
simultaneous returns is six `return-validation.md` blocks in one orchestrator
context, and this lane's orchestrator has a document to hold too.

**Rule 15 — a selected role is never silently absent.** A roster lens needs
either a report on disk or an explicit `{ "lens": …, "ran": false, "reason": … }`.
Silence is rejected by name. That is rule 6 (`NOT-CHECKED` is never silent)
extended from dimensions to roles, and the trace carries it too:

```
CHALLENGE iter=2 findings=P0:1/P1:3/P2:6 coverage=100% council=4/5 raised=C:6,O:3,E:2 adopted=9 verdict=FAIL
```

`council=4/5` is *ran / roster*, so a NOT-RUN lens is visible in the trace, in
`orc stats` and to `/orc-retro` — not only in the panel. The raise counts are in
CATALOGUE order, never raise order: two identical rosters must never render as
two different lists.

### 4z.12.7 The panel

**It derives nothing.** It does not name a lens, does not know which class
blocks, does not compute a disposition and does not decide the roster
suggestion — it draws `orc challenge roles --json` and `orc challenge show
--json`. A test greps `panels/challenge.js` for every lens display name, every
disposition word and every agent name and fails if it finds one (the `diy`
`steps[]` precedent).

In the order a human reads: the goal card · **the Council card** (a NOT-RUN row
KEEPS ITS SLOT with its reason; a NOT-SELECTED row is muted with the one line
that would add it; the executor's `monday_morning` list sits here, because it is
the most legible artifact this lane produces for a non-engineer) · **premise
challenges**, the loudest card on the panel when one is open and ABOVE the
findings · the findings, each with a lens chip and an `also found by` chip ·
**opportunities**, visually distinct with **no severity colour anywhere in the
card** · the convergence chart, keeping severity stacking and gaining a per-lens
legend row underneath.

There is deliberately **no route for `council --set`** — changing the roster is a
decision with a recorded reason the *lane* takes in conversation (the `orc doc
log` / `orc doc mode` reasoning), and adopting a premise needs a goals FILE the
panel must not invent.

### 4z.12.8 What is deliberately absent

- **An anonymised peer-review round** (the reference's step 3). It doubles the
  dispatch count, and the judge's adoption pass already reconciles the lenses.
  The payoff — *"two advisors independently hit the same thing"* — is captured as
  `corroborated_by[]` at zero extra cost.
- **A chairman agent** (the reference's step 4). ORC already has one:
  `orc-challenge-advisor-opus-5-med` groups findings by root cause and orders the
  fix. Its slice grows to cover council-origin findings, and rule 5 holds —
  **no advisor on PASS.**
- **A `challenge_council` config key**, and **any model or effort key for a
  lens.**
- **A `block` mode on any council output.** Opportunities and premises never
  gate; the finding lenses gate through the EXISTING severity bar and nothing
  else.
- **A loop cap.** Unchanged from v0.47.0: each turn is a separate human, so
  `stalled` measures instead.
- **Auto-severity from corroboration.**

---

# PART B — THE KNOWLEDGE DEEPENING

### 4z.12.9 `--json is not a summary`

Five findings, each read off the code rather than felt:

1. **`orc wiki status --json` was a lossy subset of its own printout.**
   `wikiStatus()` computes `computeWikiFreshness(...)` and the TTY branch prints
   the per-doc FRESH/AGING/STALE counts, **the worst doc's filename** (the thing
   actually pinning the tier), the top five stale docs with their own distances,
   and the crosslink boundary state. The `--json` branch emitted five scalars and
   `blind` **as a count**. The panel therefore *could not* be as detailed as the
   terminal, no matter how it was written.
2. **There was no way to see what the wiki CONTAINS.** Six subcommands and not
   one of them listed the docs.
3. **A cached code-pattern was a filename and an mtime** — for the file injected
   LITERALLY into every executor slice.
4. **The gotcha panel dropped `fields`**, which `gotchaStatus` had always emitted.
5. **`orc doctor` had no wiki finding at all**, so the one caution a user could
   clear for ZERO tokens never appeared on Overview, where every other one does.

> **A read's `--json` is the WHOLE computed object, not a summary. A field the
> human path prints and the JSON omits is drift — and it is drift no lint can
> see, because both halves live in one function.**

Registered as a contract token (`--json is not a summary`) with
`binFiles: ["bin/cli.js"]`, plus a real test per read.

### 4z.12.10 The reads that now exist

`wiki status --json` gains `counts`, `worst` (the doc pinning the tier, BY NAME —
a hash is not a thing anybody can go and refresh), `per_doc[]`, `blind_spot` as
the **FILE LIST it always was**, `orientation`, `crosslink`, and `free_repairs`
reused **verbatim** from `wiki plan` (a user must never be able to pay for what a
free step fixes). **Every legacy key keeps its name, position and meaning** —
`orc doctor`, the overview tile and `_shared/detecting-artifacts.md` all read
them — and exit stays **0 in every state**, because `state`/`tier` are the branch
and overloading the code would collide with the existence contract.

| Command | Returns | Exit |
|---|---|---|
| `orc wiki docs [--json]` | the registered doc table: tier, its OWN distance, covers, usage, tags, retire hint | 0 · 1 none · 3 unregistered |
| `orc wiki show <doc> [--body]` | one doc + its tags + the free repairs that apply to IT | 0 · 2 unreadable · 3 unknown |
| `orc wiki coverage [--json]` | % of tracked files covered by >=1 doc, and the uncovered set by DIRECTORY | 0 full · 1 gaps |
| `orc pattern show <lang> [--body]` | headings, conventions vs invariants, flagged conflicts | 0 · 1 absent · **2 unknown key** |
| `orc gotcha show <id>` | one entry, EVERY field | 0 · 3 unknown |
| `orc gotcha list --archived` | the archive, same shape | 0 · 1 none |
| `orc gotcha prune --dry-run` | exactly which entries eviction would archive, and why | 0 none · 1 would prune |

Two rules on the new reads. **`orc wiki coverage` is a REPORT and never a gate:**
no threshold, no config key, nothing branches on it. A repo that deliberately
documents four subsystems out of forty is not broken, and a coverage percentage
that starts nagging becomes a number people game. **`--body` is opt-in** on both
`wiki show` and `pattern show` — the `/api/doc/section` precedent: prose is
returned only on an explicit request, exactly one artifact at a time, rendered
through `renderMd` **as DOM, never as HTML**.

**Per-doc crosslink tag counts are COVERAGE-RELATIVE.** A tag carries no
"source doc" field, so a tag belongs to the doc(s) covering the file its `anchor`
names — the same `docCovers` relation used everywhere else. A tag with no
resolvable anchor belongs to no doc and is counted in `crosslink.provided` only.
Nothing is guessed.

**`orc pattern show` reports what is on disk and invents nothing.** The codifier
may not write a parseable header today; with none it returns `headered: false`
plus the headings it could parse and says so in one line. **It never derives a
"codified at" from the file's mtime** — the `/orc-pact` UNCHECKABLE rule and the
`/orc-doc` journal rule (*a cycle nobody logged renders AS A GAP, never a
reconstruction from mtimes*). Teaching the codifier to write a header is out of
scope and belongs in the release that touches `/orc-pattern`.

### 4z.12.11 Two doctor findings, and the restraint IS the design

| id | Warns when | Fix |
|---|---|---|
| `wiki-unregistered` | `wiki status` is `unregistered`, `drifted` or `corrupt` | `orc wiki sync` — FREE, instant, and until it is done nothing can read the wiki at all |
| `wiki-debt` | tier is `STALE` **and** `wiki plan` has pending rows | `/orc-wiki refresh --top 2` |

**`wiki-debt` fires on STALE and NEVER on AGING.** Aging is a normal state every
living repo passes through, and a doctor that warns about it is a doctor people
learn to ignore. Deliberately **not** added: `pattern-missing` — a project with
no cached pattern is not misconfigured, and warning would be ORC nagging for a
paid scan. Both route to `knowledge` in `FINDING_ROUTE` (v0.43.6: *a caution
routes to the panel that can CLEAR it* — `orc wiki sync` is a button there).

### 4z.12.12 `orc ui` ▸ Knowledge — five tabs

The Crosslink two-tab precedent. The single scroll was already six cards long and
this release roughly triples the content.

```
Knowledge   [ Wiki ] [ Coverage ] [ Code patterns ] [ Memory ] [ Peers ]
```

A **header strip** renders above the tabs on every one of them — tier · docs ·
covered % · blind · pending · patterns · repair notes. Every value is
CLI-computed, and **a value the CLI could not compute renders as an em dash,
never as a guess.**

- **Wiki** — the tier card with the **worst doc NAMED**, the per-doc counts as a
  stacked bar, the free-repair box ABOVE everything priced, and **the doc table**
  (the headline addition). A row **expands in place**, one at a time, detail
  fetched on first open — the Runs-row rule, and there is no detail box below the
  table. The orientation doc gets one line: present, or missing with its free
  regeneration command.
- **Coverage** — one number, honestly qualified; the uncovered set collapsed to
  DIRECTORIES and ranked by file count (*"the 240 uncovered files are all in
  `vendor/`"* and *"the 12 uncovered files are all in `src/payments/`"* are
  opposite situations); the structural blind spot as the file list it always was.
  One line, always present and **not optional chrome**: coverage is a report, not
  a target.
- **Code patterns** — per language, and **the conflicts the codifier flagged get
  their own block**: they are the most decision-shaped thing in the file (*the
  project does X, the invariant says Y*) and were invisible outside it. Reveal
  shows the body — the text injected literally into every executor slice; a user
  who cannot read it cannot trust it. Known-but-uncached languages are listed
  with a **copy-able command** (paid, so never a button).
- **Memory** — the table, plus a row that expands into every field the CLI
  already emits; headroom against `gotchas_max`; and a **preview-then-apply
  prune** whose Apply stays disabled until a preview was fetched and whose
  preview **names every entry** — *a count is not consent* (v0.43.0). The archive
  is reachable and labelled recoverable: eviction is an ARCHIVE, never a delete.
- **Peers** — compact, read-only, every word the CLI's. It links to Crosslink and
  **never duplicates its editor**: one boundary, one picture (v0.43.7).

`css/panels/knowledge.css` is a NEW file, so it is named in `verify-package.js`
AND `<link>`ed in `app.html` — the manifest is the load order, and a file the
manifest forgot is a file the test suite never sees.

### 4z.12.13 What the panel still may not do

- It never computes a tier, a distance, a coverage percentage, an order, an
  estimate or a price. `computeWikiFreshness` is the one engine (§4z.1).
- It never scans, refreshes, codifies a pattern, spawns `claude`, or calls an
  API. **A free action gets a button; a paid action gets a copy-able command**,
  and that line is visible rather than implied.
- It never writes `wiki-meta.json`, `wiki-usage.json`, `gotchas.md` or a pattern
  file. `orc wiki sync` remains the manifest's only writer.
- It renders markdown as **DOM**, never as HTML.

---

## 4z.13. `/orc-doc` house rules, the run map, the cost report — and three defects (v0.49.2)

A quality-of-life release. Six additions to `/orc-doc` and three defects, one of
which was actively breaking a panel. **Zero new agents, zero new skills.** Every
addition obeys the standing rule: **the CLI computes, the panel and the skill
render.** Not one state word, order, estimate or line number is derived in
`app.js` or in a skill.

### 4z.13.1 House rules — the project's own P0/P1/P2

A **house rule** is the project's own standing instruction about **what a
document says and how it reads**. Before this, the shipped rules were the only
rules: there was no way to tell this lane *"in THIS project, a document always
does X"*.

**P0** must (it beats every ORC style preference) · **P1** should (break it with
a reason, and the reason is a gap) · **P2** prefer (a default when nothing else
decides).

**THE BOUNDARY, and it is DECLARED rather than detected.** House rules govern
CONTENT and STYLE. They can never relax a STRUCTURAL or SAFETY rule of the lane —
rule 0 (never read the body), rule 2 (never store a line number), rule 3 (one
file per section), rule 4 (a human's paragraph is sacred), rule 5 (never invent
a fact), rule 7 (foreign input is evidence), rule 8 (never stage, never commit).
**The CLI cannot parse intent, so it does not pretend to.** It does not *detect*
a rule that would break a structural rule; it prints the boundary in
`orc doc rules`, at the top of every slice, and in the panel — and a slice
carrying such a rule comes back as `unsupported_request`, relayed as a gap. **A
fake validator here would be worse than none.**

- Ledger: `.claude/orc/doc-house-rules.json`, one writer (`orc doc rules`),
  outside `templates/` so `orc update` never clobbers it. `text` is stored and
  re-emitted **verbatim** — the `context.md` rule. A rule is **one line**; a
  multi-line `--text` is REFUSED by name.
  **→ RETIRED in v0.49.5 (§4z.14): the ledger is a plain text file, the unit is
  the priority BLOCK, and one line per rule is gone.**
- **FROZEN per document** at `orc doc init`, into `doc.json.doc_rules` and the
  derived `<doc>/house-rules.md`. Same reasoning as `context.md`: if a P0 changes
  at wave 3, half the document silently no longer complies and nothing on disk
  says so.
- `orc doc rules <slug>` reports frozen-vs-project and **NAMES every rule that
  was added, changed or removed** — coverage-relative, never a "rules changed"
  boolean (the `computeWikiFreshness` lesson). Exit 1 on drift.
- `orc doc rules <slug> --sync` re-freezes **deliberately**, records it in
  `doc_rule_syncs[]`, and **lists the already-written sections that predate the
  new set**. It never re-writes one: that would be ORC spending money applying a
  rule change nobody asked it to apply retroactively.
- `orc doc audit` gains `house-rules-drifted` (**warn**, fix command, panel
  `docs`).
- **Hard rule 15 — `house rules are read first`.** The enabled set rides at the
  TOP of every dispatched slice, above ORC's own generation rules. **That order
  is the contract** and is a registered token. Returns carry
  `doc_rules_applied[]` and `doc_rules_conflicts[]`.

**Naming note.** ORC already had a `house_rules` identifier — the standing
behavioural card injected into every EXECUTOR slice
(`skills/orc/references/house-rules.md`). Two identifiers spelled the same in
two slice types is exactly the ambiguity the contract lint exists to catch, so
the `/orc-doc` JSON keys are `doc_rules*`. The user-facing name and the command
(`orc doc rules`) stay as they read.

Deliberately absent: **no config key for the rules** (they are an artifact with
a ledger, not a scalar — a key could hold exactly one of them), **no automatic
detection** of a structural-break rule, and **no re-write on a sync**.

### 4z.13.2 The four generation rules — ORC's own, read second

All four are **FREE and deterministic**. Rule 6 (the free check runs before the
paid one) is what makes them worth having: **no model is ever paid to notice a
`TODO`.** Every one is NARROW on purpose — a broad rule that argues with the
author gets switched off; a narrow rule that is always right gets used.

- **5b `question-in-body` (error).** The deliverable ANSWERS; it does not ask.
  Word-boundary tokens (`TBD` `TODO` `FIXME` `XXX` `???` `TBA` `(?)`), a set of
  confirmation phrases, and a line that is *only* a question put to the reader as
  an approver. **Two exemptions, both required, or the rule argues with the
  author:** fenced code is skipped, and so is a section whose OUTLINE heading
  declares it (`open questions|questions|risks|assumptions`). Everything caught
  goes to `orc doc log --kind gap` — no new destination is invented.
- **5c `na-padded` (warn).** What you do not have is `N/A` plus at most one short
  line. A WARN, never an error: the author may have a reason.
- **5c, measured.** `orc doc lint --json` carries per section `lines`,
  `budget_lines`, `over_budget_pct`, plus `readability.words_per_section`. Over
  **1.5×** its budget adds `over-budget-section` (warn). Both are SIGNALS and
  block nothing; the existing `honesty[]` sentences are not softened.
- **5d `local-reference`.** The reader of a PRD has no repository. A `file:line`
  anchor, an absolute path, a `./relative` opener, `localhost`, a `file://` URL,
  a repo path, a relative `.md` link. **Config `doc_local_refs`
  (`off|warn|error`, default `error`)** — a genuinely internal runbook
  legitimately names local paths, and **a lint rule with no switch gets fought
  instead of used**. Fenced code is always exempt: a code example that SHOWS a
  path is content.

### 4z.13.3 The template lock — a supplied template is a P0 cage

`--template` set the OUTLINE and then nothing stopped a writer adding a heading
it never had. It now **locks by default**; `--template-soft` opts out and the
init line says which is in force. A **shipped** base template stays a floor —
that sentence in `orc doc templates` now applies to the base templates only.

*a lane that writes outside its template* has broken the contract. Four
enforcement points, all free: the slice carries `template_locked` +
`allowed_headings[]`; `orc doc lint` errors `heading-outside-template`;
**`orc doc parts --confirm` REFUSES and writes NOTHING** (the `splice`
hash-conflict refusal shape); `orc doc audit` reports `template-drift` and
`template-moved` (the template FILE changed — reported, never auto-synced). The
`user-edited` exception survives: a human adding a heading by hand is REPORTED
and never a finding.

### 4z.13.4 The run map — once, before the first paid wave

`orc doc forecast <slug>` computes from **`orc doc plan --role write` over ALL
waves** (never the `partial` truncation — the user is being told what the WHOLE
document costs) × the same rate model `orc budget` uses. **The batcher is now a
FUNCTION** (`docPlanShape`) that `plan`, `forecast` and `next` all call: a
forecast computed by a second idea of the wave shape would describe a run the run
will not follow — the Flow-stepper rule.

Every honesty rule of `/orc-budget` is **inherited, not re-invented**: four token
kinds never blended, a range with a sample count, **no history → it REFUSES**
(plus the `--naive` price-table floor), no dollars without a dated price table,
no quota without a known plan, `unattributed` always reported.

**Once, and never on resume.** `doc.json.forecast` records it, so `orc doc next`
names it exactly once (`paid: false`) and a resumed session in a fresh context
does not re-show it. A changed outline or write mode **invalidates** it — a
forecast for a different shape is not a forecast. **A REFUSAL IS STILL AN ANSWER
AND IS STILL SHOWN ONCE**: without that, `forecast` is a step the lane can never
get past.

### 4z.13.5 What a document cost — across every session it spanned

`orc budget actual` works per RUN. A document spans several runs — that is the
design — so nobody could answer "what did this document cost". `orc doc cost`
reuses `listTraces` → `readTraceMeta` → `readCorpus` → `joinRun` →
`priceVector` unchanged, over **every** trace whose slug matches.

Per-section attribution is only honest because the doc lane's **DISPATCH tail
names its sections**: `doc write sections=03-scope,04-risks part=…`. A slice
covering two sections **splits its cost evenly**, said out loud in `honesty[]`.
**A section with no joinable dispatch reports `joined: false` and `tokens: null`
— NEVER zero**, and reads as `—` (the `/orc-pact` UNCHECKABLE rule: an unknown
reported as a number is worse than an unknown reported as unknown).
`unattributed` is always present, including when zero. Exit 0 joined / 1 partly
/ 3 no trace.

### 4z.13.6 Revision reporting — which line, which file

`orc doc lint <slug> --section <id>` lints the SECTION FILE and returns
**part-local** line numbers plus `file: "sections/<id>.md"`. **A part is not a
document**: the front-matter and single-H1 rules are whole-file rules and are
suppressed, or they would fire on every section file and bury what a revision
round can act on.

`orc doc plan --role edit --json` items gain `findings[]` per part —
`{rule, severity, file, line, sub_file, what, quote}` — and D8 prints one line
per finding (`sections/<id>.md · line <n> · <rule>`, a registered token). The
compiled `document.md` line number is deliberately NOT carried: it is stale the
moment anything is written, which is what rule 2 exists for.

### 4z.13.7 The three defects

**The card contract.** `.run-card` is a four-column grid — caret · chip · mid ·
age — and the Overview built a card with **three children and no caret**, so the
chip landed in the 16px caret column and printed over an 88px-wide slug, which
wrapped one word per line. **A grid never complains.** The fix is that every
variant now DECLARES its column count: `.no-caret` for a row that navigates
rather than expands, `.has-extra` for an optional second chip. The Docs list had
the identical collision from its "you edited it" chip — found while verifying the
first fix, and fixed the same way. `06-responsive.css` collapses every variant
explicitly, and under 600px the card stacks. The age column existed and rendered
empty; `run list --json` always knew the number.

**A run could never be marked done.** `RESUME.md` existing IS the unfinished flag
(v0.42.0) and ORC deletes it at `FINISH` — so a run the user ABANDONED was
waiting forever: `orc resume` kept offering it, the Overview kept counting it,
and `api.js`'s maintenance route kept it in `waiting_runs`, which is what put the
red "N run(s) are still waiting" block on the upgrade preview and **blocked the
upgrade with no way out**.

`orc run close <slug> --reason "<why>"` **MOVES** `RESUME.md` →
`RESUME.closed.md` and writes `closed.json`. **It deletes nothing.**
`orc run reopen` puts it back. The new computed status is **`closed`** — and
deliberately NOT `done`: the disk cannot prove the run finished, only that a
human said they were finished with it, and a listing may only claim what the disk
proves. **A reason is REQUIRED** (the `/orc-pact` retirement rule). Everything
else falls out of ONE boolean: `orc resume` skips it, `run list` shows the row
WITH its reason and everything it knew, the maintenance preview unblocks, and the
Overview count falls. **No other subsystem reads `waiting`, so this cannot leak.**

**`orc ui ▸ Challenge` 500s.** Two distinct crash classes: a truncated ledger (a
session killed mid-write) made `readCycle` return `null` and `challengeList` read
`.cyc` off it; a ledger with no `goals` key read `.goal` off `undefined`. Both
exited with a Node stack and NOTHING parseable on stdout. **One bad cycle took
the whole list down**, hiding every healthy cycle with it. Four layers:

1. `readCycle` defaults what it already promised to default — `goals` and `kind`.
   A missing goal renders as nothing; it is never invented, and `record` still
   refuses without a frozen goal.
2. `challengeList` degrades a broken cycle into a **ROW** with state
   **`UNREADABLE`** and the parse error. It is a LIST-level state: it never
   reaches the pass gate and never claims a verdict. `challengeCode` /
   `challengeStateOf` are untouched.
3. **A `--json` read must never emit a stack.** The top-level dispatch is wrapped:
   a throw under `--json` becomes
   `{ok: false, reason: "crashed", command, error, stack, hint}` with a distinct
   exit code. **Every `--json` route inherits it** — this is the general fix.
4. `api.js` stops swallowing the reason: a 500 body gains an `error` built from
   the CLI's own output, and `failBox()` renders both the message and the
   transcript. A 500 with no message is what the user actually saw.

### 4z.13.8 What v0.49.2 deliberately did NOT do

- **No `done` run state.** Only `closed` — see above.
- **No auto-close of stale runs.** A promise is retired by a human with a reason;
  a run is closed the same way.
- **No blended token number anywhere** — four kinds, always, in the forecast and
  in the cost report.
- **No new agent, no new skill, no new lane.** Every dispatch uses the two
  `/orc-doc` agents that already ship.


---

## 4z.14. `/orc-doc`: house rules as a text config, and a hand-back that writes itself (v0.49.5)

Two fixes, one shape: **stop making a person work around the tool.**

### 4z.14.1 A house rule is PROSE, not a row

v0.49.2 modelled a house rule as a **row**: one line, one id (`H-001`), a
priority chosen from a dropdown, an `enabled` flag, added one at a time through
`orc doc rules add`. Every one of those was a decision made for the CLI's
convenience, not the user's:

- **The one-line rule existed to keep argv a plain string.** A multi-line
  `--text` was REFUSED by name with the hint *"add it as two rules"*. But nobody's
  real P0 is one line, and two rules stapled together is not what a person means
  when they write a paragraph — it is what the tool needed them to type.
- **The priority dropdown existed because a row needed a column.** In the panel
  it became a `<select>` per row, plus a second one beside the Add box.
- **`enabled` existed because there was no other way to remove a rule
  temporarily.** In a text file, you delete the line.

So the ledger is `.claude/orc/doc-house-rules.md`: a preamble the user owns,
then `## P0`, `## P1`, `## P2`, and **as much text under each heading as they
want**. The unit is the **block**. It is handed to every writer VERBATIM.

```
.claude/orc/doc-house-rules.md      the ledger — plain text, hand-editable,
                                    ONE programmatic writer (`orc doc rules`)
.claude/orc/doc-house-rules.json    the retired row store — read once, migrated
                                    forward, and NEVER deleted
<doc>/house-rules.md                the frozen text for one document — DERIVED
```

**The parser is deliberately forgiving about the only structure it has.** A
priority heading is any line that says `P0`/`P1`/`P2` and nothing else — with or
without `#`s, with or without a colon — because a config a human types by hand
must not fail on a plausible spelling. Everything **above** the first heading is
the user's own note: preserved verbatim on every write, and never dispatched.
Everything **inside** a block is theirs too — indentation, bullets and blank
lines survive; only the blank lines the headings introduce are trimmed.

**Migration is lazy, free, idempotent and non-destructive** (the v0.49.0 rule).
The first read with no `.md` converts the JSON, leaves that file exactly where it
was, and **never resurrects a rule the user had DISABLED** — those are left
behind and COUNTED in the output. Silently switching someone's rule back on is
the one migration outcome nobody can audit.

**The row commands are REFUSED BY NAME**, not quietly dropped: `remove`,
`enable`, `disable` and `move` exit 2 with `reason: "retired"` and the command
that replaced them. A command that used to work and now does nothing is worse
than one that says what happened to it.

The CLI:

```
orc doc rules [--json]                             # the ledger + the file path
orc doc rules set   --priority P0 --text "…"       # replace ONE block. Multi-line is the point
orc doc rules add   --priority P0 --text "…"       # append to a block
orc doc rules clear --priority P0                  # empty ONE block
orc doc rules set-all --text "…"                   # the WHOLE file — what `orc ui` writes
orc doc rules --set-file <path> | --reset
orc doc rules <slug> [--json] [--sync]             # frozen vs project, and the re-freeze
```

Everything else about house rules is UNCHANGED and deliberately so: the frozen
set per document, `--sync` naming the sections that predate it and re-writing
none, `house-rules-drifted` in the audit, hard rule 15
(`house rules are read first`), and the DECLARED boundary. **Drift is now
per-priority** — `drift.changed[] = {priority, from, to}` — which is still
coverage-relative and still names both texts.

**The slice carries `doc_rules_text`**, rendered by the CLI: the priority word,
then the block, with an empty priority omitted. The skill pastes it and **never
re-wraps it** — a house rule is the project's own words, and it is now as many
lines as the project wanted.

**The panel is one textarea.** No dropdown, no Add button, no per-rule row, no
`enabled` toggle. One write route (`/api/doc/rules/setAll` →
`orc doc rules set-all`), and the v0.44.1 staging rules hold unchanged: nothing
is written until Apply, the pending edit is NAMED, typing the text back to what
it was CLEARS the edit, Discard renders only while dirty. The per-priority
commands stay a CLI convenience; `--set-file` and `--reset` still have no route.

### 4z.14.2 `RESUME.md` is written by the CLI, on every state change

v0.49.0 made the hand-back a hard rule of the stop sequence: *ORC ITSELF writes
`RESUME.md` FIRST*. That is the right ORDER and the wrong MECHANISM — it is
**remembered-not-dispatched protocol**, the bet this repo has already lost twice
(§4b, the v0.32.0 narration lesson). The hand-back you are TOLD to write at every
stop is the one that goes missing on the run that mattered: the one a usage limit
killed mid-wave.

`doc.json` has **exactly one writer** (`docWrite`), so the hand-back hangs off
that. Every state change refreshes `RESUME.md`, which means:

- it **exists from `orc doc init` onward**, before a single section is written;
- it is **never behind the disk**, because nothing can change the state without
  going through the function that rewrites it;
- it is still written by **ORC itself and never by a dispatched agent** — an
  `orc doc` call is the lane's own hand, so rule 13 holds exactly.

Three guards make the hook safe:

1. **A re-entrancy flag.** `docMapView(persist)` and the builder both reach
   `docWrite`; without the guard a hand-back that rewrote itself would hang.
2. **A CLOSED run is never re-opened.** `orc run close` MOVES the pointer aside
   (v0.49.2); if `closed.json` is present, nothing is written back. A human
   saying they are finished with a run is not a state ORC may undo.
3. **Best effort, always.** A hand-back that cannot be written must never take
   the command that triggered it down with it.

`orc doc resume-file <slug> [--json]` writes it on demand and prints the two
things a reader needs: where the file is, and the line to paste. The
`Where it stands:` line comes from the same `docWhereLine` that `orc doc status`
uses — **one generator, not two** — and stays at **column 0**, because
`parseStands` is line-anchored (§4z.11).

**Hard rule 16 — `every question points at RESUME.md`.** Before ORC asks the user
anything — a gate, a wave stop, a revision round, an offer — it runs
`orc doc resume-file` and ends the message with the file's path and the line to
paste. A user who has to remember where they were is a user who does not come
back. Because the CLI rewrites the file anyway, this is a POINTER and never a
rebuild the model has to compose.

The page is written for someone who does **not read code**: what this document
is, where the files are, what is not written yet, what happens next, and the one
line to paste. Nothing in it needs interpreting.

### 4z.14.3 What v0.49.5 deliberately did NOT do

- **No config key for house rules.** They are a file, not a scalar — unchanged
  from v0.49.2, and now obviously so.
- **No deletion of the old row store.** It is left on disk forever. A migration
  that deletes is a migration nobody can check.
- **No auto-rewrite of sections after a rule change.** Still `--sync`, still
  names them, still re-writes nothing.
- **No `RESUME.md` for a closed run**, and no re-opening one.
- **No new agent, no new skill, no new config key.**

---
