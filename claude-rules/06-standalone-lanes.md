# The standalone lanes (quick, brainstorm, grill, pact, boundary, handoff, budget, aftermath, export, challenge, doc, test)

**Read: on demand** — read when touching one of these lanes.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **`/orc-quick` is a STANDALONE lane that nothing overrides (v0.38.0).** The
  first ORC lane that LOOPS: three steps per request (`Q1 LOOK` silent →
  `Q2 ASK` one turn → `Q3 DO`) plus a once-per-session silent preflight — fewer
  than `/orc` (8), `/orc-mini` (5) or `/orc-fast` (6), because clarification and
  the agent choice share ONE user turn. **Open-ended by design:** no closed
  request taxonomy — a fix, a context dig, a defect hunt, a dep bump, or PR
  review comments all route the same way (read-only vs writing → gated dispatch
  → validated return → numbered doc entry). Too big → an OFFER of `/orc-mini`,
  never a forced fallback. **The dispatch gate is the lane's entire premise:** it
  asks WHICH AGENT before EVERY dispatch (recon, executor, reviewer), never
  defaults, never sticks. The ONE inheritance is build-repair rounds 1–2 within
  an entry; round 3 re-gates. **`opus5_only`, `fable5_*` and
  `rubric_bands_override` are INERT here** — the one exception to `opus5_only`'s
  flat precedence, registered in BOTH shared contracts, and announced at the gate
  (a shadowed setting must never be silent). **No smoke gate:** a red build loops
  (cap 3, then reports the ERROR TREND and asks), red tests block the commit
  offer but NEVER loop (a failing test is sometimes the test being wrong), no
  test suite means no check at all. **Read-only recon is a PINNED PAIR
  (v1.9.0)** — `orc-recon-sonnet-4-6-med` and `orc-recon-opus-5-low`, one return
  contract, traced by the hook, visible to `orc run inflight`, countable by
  `/orc-retro`. `other — name a model` stays as the escape hatch and names a
  MODEL only (the Agent tool has no per-call effort knob, so the old effort
  option was a setting that did not exist); an `other` dispatch is still untraced
  by the hook, and only THAT row keeps `*(ad-hoc, untraced-by-hook)*`. Recon and
  review stay on Claude and recon is NOT an `orc extra role` position — a wrong
  edit fails a build, a wrong answer is believed. Traces use a new
  **Iterative** tier: one packet per completed entry, built from
  `quick-checkpoint.md` so every event carries the time it happened. Output is
  `orc-quick/<slug>/quick-context.md` — project root, ONE `.md` per thread ever,
  folder named from the FIRST slug (no timestamp, so the same slug reopens the
  thread), **never staged**, and the skill NEVER reads its body — only the
  delimited `orc-quick:toc` block on reopen, or when the user asks. `gh` is
  read+push only (never comment/resolve/review/merge); it never reverts, it
  prints the git command. **Every file under
  `templates/skills/orc-quick/` is written in simple English for non-native
  readers** — keep it that way. See `knowledge.md` §4w.

- **v1.9.0 — quick looks before it leaps, and a defect goes red first.** Four
  things changed and each has one owner. (1) **The dig asks the GRAPH first**
  (`references/look.md`): `ctx` when the request names a file or a symbol,
  `map --focus` when it names none, `ctx --depth 2` + `coverage` for a
  blast-radius question. **It may never name `orc graph impact`** — the contract
  lint derives a lane's call set by scanning its WHOLE skill folder, and quick
  has no `graph-impact` row on purpose (no planner, no declared-file set before
  the gate); the recon AGENT calls it instead, and an agent file is not scanned.
  (2) **A defect reproduces RED first** (`references/defect.md`): the slice
  carries `repro.required`, the EXECUTOR writes the reproduction — never the
  orchestrator — and `REPRO red|green` reaches the trace. `repro: none` with a
  reason is an honest return; the entry says **not reproduced** and repeats it at
  the commit offer, and it is never faked. A `done` whose `before` was green or
  whose `after` is still red is MALFORMED. (3) **Affected tests before the
  suite**, from `orc graph changes`, then a one-line blast radius where `risk`
  never appears without its `why`. (4) **The gate may print `→ suggested` with
  its reason** ("The suggestion" in `references/dispatch-gate.md`: 8+ callers, a
  visible risk class, or >3 files) — a recommendation, never a pre-selection,
  and every menu still ends with `Your choice — nothing runs until you answer.`
  Also: the `gh` probe is LAZY (first PR request, not every preflight), Q3 runs
  ONE `orc graph update --notes-pending` instead of two calls (so quick LEFT the
  `graph-notes-pending` catalogue row), and `orc graph gain` prints one line at
  the close. The spine has a budget for the first time: **325**, and it is AT
  it — anything new moves into `references/`.

- **`/orc-brainstorm` diverges before it converges, and it NEVER picks
  (v0.45.0).** The lane for not having an idea yet — a problem, a goal, or a
  hunch, code or not. `/orc-grill` converges one idea you have; brainstorm
  GENERATES the candidates and the user judges. Its contract is the mirror of the
  interview's: **`a lane that picks its own favourite`** has broken it, registered
  as a PAIR with `a lane that answers its own interview question` (both pinned to
  `_shared/interview.md`). Five rules hold it together: **P0 — it stops and asks
  before writing anything** ("complete" is a proposal, never a verdict; the ONE
  exempt write is the suspend snapshot, which is run state) · **the open slot** —
  every menu ends with a slot for the user's own words, always LAST, and that
  idea enters the pool quoted verbatim and is stressed identically · **judgment
  is deferred** — B2 generates against `references/lenses.md` with NO downsides
  annotated (floor ≥8 candidates across ≥3 lenses, no cap, diversity is the bar),
  all objections held for B4 · **conservation** — every candidate lands in a
  direction or in the graveyard WITH a reason, and the doc's payload is "the pick
  and why the others lost" · **B5 tags every decision** `intent`/`constraint`, so
  constraints become `spec_invariants[]`. Doc:
  `orc/brainstorming-session/<slug>/brainstorm-session.md` — project root, one
  `.md` per slug ever, never staged. Zero new agents (recon is ad-hoc by
  model+effort), zero new config keys. Exit 2 reuses grill's `analyzable ⇔`
  sentence VERBATIM — never a second definition. See `knowledge.md` §4z.6.

- **`_shared/lane-suspend.md` (`RETURN-TO`) is leave-and-COME-BACK (v0.45.0).**
  The opposite shape to `_shared/fallback-handoff.md` (`FALLBACK-FROM`), which
  leaves for good and lets the receiver finish. The sender snapshots first,
  OFFERS (never forces), and resumes at the phase it left; the receiver runs
  completely normally and adds ONE exit option present only under the marker.
  The gate is TIGHT — a DECISION (not a fact ORC owes itself), a PREREQUISITE
  (the option SET changes), and a SUBTREE (not one question); fewer than three
  and it asks inline. It ships in three directions: brainstorm↔grill,
  doc→brainstorm (D1, no chosen direction), doc→grill (D4/D5, a contested
  decision).
  **The trace rule is the expensive half:** the receiver deletes `.current` at
  its `FINISH`, so **on RESUME the suspending lane re-writes `.current` AND
  `touch the trace file` in the SAME step** — the v0.34.2 split-run family by a
  different road. Two traces for a suspend is CORRECT: two lanes ran.

- **Six lanes, and every one of them RENDERS what the CLI COMPUTES (v0.46.0).**
  The release thesis: the ecosystem has a thousand skills that GENERATE, so build
  the three things a generator structurally cannot be — a lane that REMEMBERS
  (`/orc-pact`), a lane that DECLINES (`/orc-boundary`), a lane that MEASURES
  (`/orc-budget` forwards, `/orc-aftermath` backwards) — plus `/orc-handoff` (the
  first lane for someone who does not read code) and `/orc-export` (so ORC is not
  a trap). Five of the six ship **ZERO agents** (recon is ad-hoc by model+effort,
  and three dispatch nothing at all); the ONE new agent is W1's light wiki
  scanner. **A state is COMPUTED by the CLI and by nothing else** — a pact state,
  a boundary verdict, a wiki tier, a cost estimate. A skill that recomputes one
  has forked it. Every lane has an exit-code contract, `--json`, and a
  `run-<lane>-<slug>` trace pointer (a declared lane nothing OPENS is a permanent
  zero in `orc stats`, v0.42.0). See `knowledge.md` §4z.7.

- **`/orc-pact`: never invent a promise, never auto-retire one, never store a
  state.** Every entry carries an `origin`; retirement is a user decision with a
  recorded reason. DRIFTED is COVERAGE-RELATIVE (only the anchored files count) —
  the `computeWikiFreshness` lesson. **UNCHECKABLE is the honest state and never
  raises the exit code**; reporting it as a failure would teach people to give
  every promise a fake check. Assumptions are NOT a second ledger (a low-confidence
  manual-check invariant). `PACT.md` is DERIVED, written only by `orc pact sync`,
  and lives at the PROJECT ROOT so a PM can read it in a PR. `pact_gate` (default
  `warn`) has **no `block`** — the payoff is the Phase-2 injection of a DRIFTED
  promise into the planner's `constraints[]`, not a gate.

- **`/orc-boundary`: a REFUSE always names what would make it a yes.** A REFUSE
  with no checklist — or an ESCALATE with nobody named — is MALFORMED and reported
  as an error, never rendered as an empty card. The verdict is DERIVED from four
  questions answered from disk (self-verify · knows-the-area · reversible ·
  decision-not-fact) and the card records which answers drove it. Cards are per
  AREA, stale coverage-relatively, and **an area with no card is UNKNOWN, never
  assumed safe**. `boundary_gate: block` **lifts the ONE refused task out of its
  wave and the wave still runs the rest**. It gates ORC's own dispatch, NEVER an
  explicit user instruction — say so wherever a verdict prints.

- **`/orc-handoff`: the grade comes from whether a CHECK exists, not from the file
  type.** That reframing is what makes it deterministic instead of a vibe. The undo
  command is shown BEFORE the write; an AMBER change returns a manual TASK and is
  never reported as verified; a RED surface is never touched and gets no button at
  all (not a disabled one); it never stages, never commits, and never CREATES a key.
  **Every file under `templates/skills/orc-handoff/` is simple English for
  non-native readers** — same standing rule as `orc-quick`. Keep it that way.

- **`/orc-budget`: tokens are the unit of truth and there are FOUR of them.**
  `input` · `cache_write` · **`cache_read` (usually the largest count, ~0.1× the
  price)** · `output`, never blended; usd and quota are DERIVED from the vector,
  never stored beside it. A forecast is a RANGE WITH A SAMPLE COUNT. No dollar
  figure without a dated price table (>90 days warns), **no quota figure without a
  known plan** (`budget_plan` asked once, stored — a wrong guess as a percentage is
  worse than no percentage), and `unattributed` is ALWAYS printed including when
  zero. It takes a PLAN, not a sentence (`/orc-route`'s rule). The join —
  transcripts for the COST, ORC traces for the MEANING — is the moat; the two
  clocks (trace = LOCAL, transcript = UTC) must both be honoured as written.
  The facet→score formula is MIRRORED in `bin/cli.js`; change both copies together.

- **`/orc-aftermath`: churn is a SIGNAL, not a verdict.** It never says a change
  was bad, never names a person, never edits anything. `HELD` always carries its
  caveat (no churn is not proof it worked). A run under 7 days is `TOO_RECENT` and
  KEEPS ITS SLOT — an answer, not a gap. Its preflight line fires ONLY on a real
  churn signal in the area about to be touched.

- **`/orc-challenge` REFUSES TO PRODUCE, and that refusal is the whole design
  (v0.47.0).** It grades a FINISHED artifact, writes down what is wrong, and
  STOPS — the user fixes it in a different session and comes back. **ORC judges,
  the user fixes, ORC re-judges — and `a lane that fixes what it judged` has
  broken the contract**, because a session that just wrote the fix grades its own
  homework and always passes. Registered as a TRIPLE with `a lane that answers
  its own interview question` and `a lane that picks its own favourite`.
  **Rule 0 precedes every other rule: `a lane that guesses the user's goal` has
  broken it too** — a finding is only a finding relative to a goal, and a
  *defensible* finding about the wrong thing is worse than an obviously wrong
  one. Made STRUCTURAL: `orc challenge init` has NO default for `--goal`,
  `--audience` or `--done-means` (it refuses, naming the flag), the answers are
  frozen to `goals.md`, and every finding must name which element it `serves` —
  one that cannot is DROPPED by `orc challenge record`. **PASS is computed, never
  declared** (the judge can only find, or fail to find), the state is recomputed
  live in BOTH directions (an `accept` clears a block immediately; raising
  `challenge_pass_severity` un-passes a cycle), and `challenge.json` has exactly
  one writer. **The judge slice is SEALED** — paths and finding ids only, never
  prose from this session (`references/sealed-slice.md`). **Three agents, three
  INSTRUMENTS, all already `claude-opus-5` (so `opus5_only` is a no-op — the lane
  is unaffected, not exempt):** judge `high`, advisor `med` (FAIL only), and the
  cold reader `low` with `Read` and NOTHING else — **`low` is a measurement
  choice, not a cost one; a harder-thinking reader reasons around exactly the
  gaps D4 exists to find, so nothing may ever "upgrade" it.** Conservation is the
  `context-combiner` gate applied to findings (coverage 100 or rejected BY NAME);
  `accept` and `rebut` are the two escape valves and neither is ever automatic.
  **No loop cap and no config key for one** — each turn is a separate human, so
  `stalled` measures instead. `MISSING-REVISION` **lists candidates and never
  adopts one** (a judge pointed at the wrong file writes a page of confident,
  useless findings), and the resumed session never asks where the fix went.
  Deliberately absent: a `challenge_same_session` escape hatch, any model/effort
  key, and a `block` mode on `challenge_gate`. Lane token `challenge`, Iterative
  trace tier, verb `CHALLENGE iter=…` copied VERBATIM from the CLI's
  `trace_line`. See `knowledge.md` §4z.9.

- **`/orc-doc` NEVER READS THE DOCUMENT BODY, and that is the whole design
  (v0.48.0).** The orchestrator knows the document only through the CLI's
  derived section map and through what the agents it dispatched report back —
  **`a lane that reads its own document` has broken this contract**, registered
  as a PAIR with **`a lane that re-asks a frozen question`** (the context is
  gathered once and FROZEN to `context.md`, quoted verbatim; a resumed session
  reads it and never re-interviews). They fail together: a lane that reads the
  body has no reason to freeze the context. **Line arithmetic is the CLI's and
  nothing else's** — `orc doc map` is the only source, re-derived after every
  write and NEVER stored (a stored line number is a wrong line number one edit
  later; the `computeWikiFreshness` / Flow-stepper rule). A section's `id` comes
  from the OUTLINE, never from the file's own ordinal — a skipped optional
  section shifts every ordinal after it, and a positional id would rename half
  the document. **Never split a section across two agents; `doc_max_parallel`
  has a HARD CAP OF 4 and a larger value is clamped with the clamp announced;**
  writers own one `.work/` part file each and checkers get one line RANGE, so no
  two agents ever share a file. `splice` replaces BOTTOM-UP and **REFUSES on a
  hash conflict, naming the section and writing nothing** — a `user-edited`
  section is never rewritten without an instruction naming it, because a human's
  wording is not recoverable from this lane's side. **The free check always runs
  before the paid one** (`orc doc lint` costs zero tokens and its findings ride
  in the checker's slice, so no model is ever paid to count sentences), and every
  lint rule comes from a REAL PRODUCT LIMIT (H≤3 under Notion, front matter
  required under Docusaurus and banned elsewhere, a hard wrap an error
  everywhere). Nothing is created before D1 is answered. **Both agents are
  already `claude-opus-5`, so `opus5_only` is a no-op — the lane is unaffected,
  not exempt** — and the checker's `low` is a MEASUREMENT choice, not a cost one
  (the `/orc-challenge` cold-reader reasoning): nothing may upgrade it. Lane
  token `doc`, Iterative trace tier, verb `DOC cycle=N sections=K/M`. It never
  edits source, never stages, never commits, and it never grades its own output
  — it OFFERS `/orc-challenge`, in a separate session. See `knowledge.md`
  §4z.10.

- **`/orc-doc` has a SCORE, a FINISH LINE and a MEMORY (v0.48.1).** (1) **The
  pipeline is CLI-computed, not remembered:** `orc doc next` names the next legal
  action and the skill renders it — the Flow-stepper shape, because D6–D9 as
  prose is exactly the remembered-not-dispatched protocol the v0.32.0 narration
  lesson already cost this repo twice. Exit 0 = an action (`paid` decides button
  vs copy-able command) · 1 = a HUMAN decides, NAMED in `blocked_by`, never a
  generic "waiting" · 2 = unknown slug. **Never run a command `next` did not
  name.** (2) **Shipping is RECORDED as a decision** (`/orc-pact`) and the state
  is **COMPUTED** (`/orc-challenge`): `--where` has NO DEFAULT, `--force`
  requires `--reason` recorded verbatim, `unship` requires a reason and keeps
  `ship_history[]`. **`shipped-drifted` NAMES the sections that moved** —
  coverage-relative, the `computeWikiFreshness` lesson — and exits 1, because a
  document that moved after delivery is work. `docWhereLine`'s parsed PREFIX is
  byte-stable; the ship state is a SUFFIX. (3) **`orc doc audit`** reports every
  drift class from disk with a fix command and a `FINDING_ROUTE` panel each;
  a `user-edited` section is REPORTED and never a finding (flagging it teaches
  people to stop editing their own document), and `orc doctor` gains
  `doc-drifted` → Docs. (4) **The journal NEVER invents an entry** — a cycle
  nobody logged renders AS A GAP, never a reconstruction from mtimes (`/orc-pact`
  UNCHECKABLE). `orc doc log` appends through `docWrite`, so `doc.json` still has
  EXACTLY ONE WRITER, and the skill calls it at D1 with the user's words
  VERBATIM. (5) **`orc doc read` is for the HUMAN** — the rule table says the
  orchestrator never runs it, registered as a token so the sentence cannot
  vanish; rule 0 is not softened by a command that prints prose. (6) The Docs
  panel is **memory first, state second**: a user back after three weeks did not
  come back to ask what state the document is in. (7) D4/D5 offer a `RETURN-TO`
  suspend into `/orc-grill` on all three lane-suspend tests; the snapshot is RUN
  STATE (`{run_dir}/{slug}/`), never the deliverable, so rule 10 holds — and on
  resume the lane re-writes `.current` AND `touch the trace file` in the SAME
  step, because grill deleted the pointer at its own FINISH. Two traces for one
  document is CORRECT.

- **`/orc-doc`: the document is a FOLDER, and the file is a BUILD ARTIFACT
  (v0.49.0).** (0) **Compiling was never the expensive part** — `orc doc
  assemble` was already pure Node at zero model tokens, and so is `orc doc
  compile`. The release is a RE-POINTING: `sections/<NN>-<slug>.md` is the source
  of truth, `document.md` is rebuilt from it on demand, and the extract → edit →
  splice round trip through the monolith is gone. `orc doc split` recovers the
  sections from a hand-reshaped document, and **`split` → `compile` is
  byte-for-byte** (a test). **The join key is the FILENAME** — comment markers
  were rejected hard: an HTML comment is a lint error here and mangles on import,
  and it buys nothing the filename does not already give. **Order is always
  `doc.json.outline`, never the filename number** (the number is a mirror the CLI
  renames on renumber). (1) **`compiled.source_hashes` is the whole staleness
  mechanism** — `document.md` is stale ⇔ a section's source hashes differently
  today; coverage-relative, never a stored status word, the
  `computeWikiFreshness` lesson applied to a build artifact, and it is why `ship`
  refuses and NAMES the sections. (2) **`doc_write_mode` (`ask`|`partial`|`all`)
  is asked ONCE and stored** — never decided per wave, which is
  remembered-not-dispatched protocol. In `partial`, `plan --role write` returns
  **wave 1 only** with `more_waves: N`; `compile --partial` writes what exists and
  **NAMES the rest outside the document — never a stub**. That, not the compile,
  is the saving. (3) **A wave is a STOP, in this order:** validate returns →
  `parts --confirm` → **ORC ITSELF writes `RESUME.md` FIRST** → print the paths →
  dispatch the trace packet LAST (the only step that needs a subagent).
  `RESUME.md` moves to `{run_dir}/{slug}/` — the ONLY place `listRuns()` looks —
  its line is at **column 0** (`## ` made the line-anchored `parseStands`
  unmatchable, forever) and gains a `· phase … · wave K of N` SUFFIX; the
  byte-stable prefix is untouched. `K of N` is COMPUTED from hash-confirmed
  waves. **A file with no validated return is `unconfirmed`** — what a usage
  limit leaves — and is re-written, never shipped. (4) **The deliverable carries
  content only.** Rule 5's mechanism reverses, its principle does not: a gap goes
  to `orc doc log --kind gap` → the derived `gaps.md`, never into the document.
  `DOC_ANNOTATION_RE` is defined ONCE and shared by lint/compile/audit; the set is
  EXACT (a user's "Note:" is content, and a bare `<!-- -->` stays `html-comment`
  so no line collects two findings); **compile REPORTS and never silently
  strips** (`--strip-annotations` is the opt-in). State no longer sniffs the body.
  (5) **ONE FILE PER SECTION** — a two-section slice used to write one file named
  after the first while assemble looked one up per outline id, so the second
  section's file never existed. A live bug, fixed by construction, with a
  regression test. (6) **Sub-parts split UNDERNEATH** (`sections/<id>/00-head.md`
  + `NN-<sub>.md`), invisible to the reader and to `docScan`; five
  refuse-and-name rules, order from `subsections[]` never `readdir`, and
  **`docSectionSource` is the ONE resolver every consumer calls**. **No new config
  key** — `doc_max_lines_per_agent` is already the threshold. (7)
  `doc_max_parallel` hard cap **4 → 2**. (8) **Migration is lazy, free,
  idempotent, non-destructive:** `document.md` is NEVER deleted, a pending extract
  wins, an `Open` stub does not survive, and an **unparseable document is
  REFUSED** with `version` left at 1. Recorded in `migrations[]`, **never in the
  journal** (rule 12). `assemble`/`extract`/`splice` are thin aliases for one
  release — and `splice`/`extract` are excluded from the lazy migration so a v1
  hash-conflict refusal is still reachable. See `knowledge.md` §4z.11.

- **`/orc-challenge` gets a COUNCIL, and ORC never picks it (v0.49.1).** Five
  more instruments beside the judge and the advisor — contrarian, outsider,
  council executor, first-principles thinker, expansionist — and a P0 hard ask
  that makes the USER choose which run. **`a lane that picks its own council`
  has broken this contract**, registered as the FOURTH member of the family with
  `a lane that answers its own interview question`, `a lane that picks its own
  favourite` and `a lane that fixes what it judged`: a council chosen by ORC is
  ORC deciding which kinds of criticism the user is allowed to hear.
  `orc challenge init --council` has NO default and refuses by name; `none`
  reproduces v0.47.0 exactly. Four rules hold it together. (1) **`A lens raises;
  only the judge resolves`** — the pass gate learns NOTHING about the council, so
  an adopted council finding is an ordinary finding from that moment on and
  `challengeBlocking()`/`challengeOpen()`/`challengeStateOf()` are untouched.
  (2) **Two lenses NEVER touch the pass gate**: the expansionist returns
  `opportunity` (no `serves` is possible — its whole brief is what is NOT in the
  goal) and the first-principles thinker returns `premise` (it disputes the
  YARDSTICK, and **the judge never sees that report**); both are recorded by
  `orc challenge note`, never by `record`, which refuses a `findings[]` key by
  name. (3) **`council_coverage_pct` must be 100**, derived by `record` from
  `iteration-NN/council/*.json` ON DISK — the judge cannot shrink the set by
  omission — with a closed disposition set (`adopted | merged | rejected |
  out-of-goal`) and **an adopted finding KEEPS THE RAISER'S ID** forever, which
  is how a user finds out whether a lens earns its dispatch. (4) **Rule 15 — a
  selected role is never silently absent**: a roster lens returns a report or an
  explicit `ran: false` + reason, and `council=<ran>/<roster>` rides in the trace
  line so `orc stats` and `/orc-retro` see a NOT-RUN lens too. **Effort is a
  MEASUREMENT, not a cost choice** — `outsider: low` and `contrarian: high` are
  instruments, which is why there is no model/effort key, no `challenge_council`
  key (a global default would silently answer the one question this exists to
  ask), no peer-review round, no chairman agent (the advisor already is one), no
  `block` mode and no auto-severity from corroboration. All seven lenses are
  `claude-opus-5`, so **`opus5_only` is a no-op — the lane is unaffected, not
  exempt** — and the agent floor moves 46 → 51 with no paired variants. Ledger
  `version: 2` is additive; a v1 cycle reads `council: null` and `record` refuses
  by name until the roster is answered. Canonical prose:
  `templates/skills/orc-challenge/references/council.md`. See `knowledge.md`
  §4z.12.

- **`/orc-doc` house rules, the template lock, and the `closed` run state
  (v0.49.2).** (1) **A house rule is the PROJECT's own standing instruction about
  what a document SAYS and how it READS** — a P0/P1/P2 ledger at
  `.claude/orc/doc-house-rules.json` (one writer, `orc doc rules`; outside
  `templates/`, so `orc update` never clobbers it), stored and re-emitted
  VERBATIM, one line per rule (a multi-line `--text` is REFUSED by name).
  **The one-line rule and the whole row store are RETIRED in v0.49.5 — see
  below.**
  **Hard rule 15 — `house rules are read first`:** the enabled set rides at the
  TOP of every dispatched slice, ABOVE ORC's own generation rules, and that order
  is the contract. **THE BOUNDARY IS DECLARED, NOT DETECTED** — house rules can
  never relax a structural or safety rule (never read the body, never store a
  line number, one file per section, a human's paragraph is sacred, never invent
  a fact, never stage, never commit), and **the CLI cannot parse intent so it
  does not pretend to**: a slice carrying such a rule returns
  `unsupported_request`, relayed as a gap. **A fake validator would be worse than
  none.** The set is FROZEN per document at `init` (the `context.md` reasoning);
  `orc doc rules <slug>` NAMES every rule that moved, coverage-relative;
  `--sync` re-freezes deliberately and **lists the sections that predate the
  change without re-writing one**. NOTE THE NAMING: ORC already has a
  `house_rules` identifier — the executor standing card — so the /orc-doc JSON
  keys are `doc_rules*`. Canonical prose:
  `templates/skills/orc-doc/references/house-rules.md`.
  (2) **Four FREE generation rules**, read second, canonical in
  `references/generation-rules.md`: `question-in-body` (error; exempt inside
  fenced code AND inside a section the OUTLINE declares as open questions/risks/
  assumptions), `na-padded` (warn), `over-budget-section` at 1.5× (a SIGNAL,
  never a gate), and `local-reference` — config `doc_local_refs`
  (`off|warn|error`, default `error`), because **a lint rule with no switch gets
  fought instead of used**; fenced code is always exempt.
  (3) **A SUPPLIED `--template` is a P0 CAGE by default** (`--template-soft` opts
  out; a shipped base template stays a floor). **`a lane that writes outside its
  template`** is the registered token: the slice carries `allowed_headings[]`,
  the lint errors, **`orc doc parts --confirm` REFUSES and writes NOTHING** (the
  splice-conflict shape), and the audit reports `template-drift` +
  `template-moved` (reported, NEVER auto-synced).
  (4) **`orc doc forecast` is the run map, named ONCE by `orc doc next` before
  the first paid wave.** The batcher is a FUNCTION (`docPlanShape`) that `plan`,
  `forecast` and `next` all call — a second idea of the wave shape would describe
  a run that will not happen. Every `/orc-budget` honesty rule is INHERITED: four
  token kinds never blended, a range with a sample count, **no history → it
  REFUSES** (`--naive` is the price-table floor), no dollars without a dated
  table, no quota without a known plan, `unattributed` always. **A REFUSAL IS
  STILL SHOWN ONCE** or the lane can never get past the step; a changed outline
  or write mode invalidates it.
  (5) **`orc doc cost` joins EVERY trace whose slug matches** — a document spans
  several runs, which is the design. Per-section attribution is honest only
  because the doc lane's DISPATCH tail NAMES ITS SECTIONS
  (`doc write sections=…`); a two-section slice splits evenly, said out loud, and
  **a section nothing joins reports `tokens: null` and reads `—`, NEVER 0**.
  (6) **`orc doc lint --section <id>` returns PART-LOCAL lines**, and a PART IS
  NOT A DOCUMENT (the front-matter and single-H1 rules are suppressed).
  `plan --role edit` items carry `findings[]` with `file` + `line`, and D8 prints
  `sections/<id>.md · line <n>` (registered token). The compiled `document.md`
  line number is deliberately never carried — rule 2.
  (7) **`.run-card` is a GRID, and a grid never complains.** Every variant now
  DECLARES its column count: `.no-caret` for a row that navigates rather than
  expands, `.has-extra` for an optional second chip. The Overview built a
  three-child card against a four-column template and the chip printed over the
  slug; the Docs list had the identical collision from its "you edited it" chip.
  `06-responsive.css` collapses every variant explicitly.
  (8) **`orc run close <slug> --reason "<why>"` MOVES `RESUME.md` aside and
  DELETES NOTHING**; `orc run reopen` puts it back. The computed status is
  **`closed`, deliberately NOT `done`** — the disk cannot prove a run finished,
  only that a human said they were finished with it, and a listing may only claim
  what the disk proves. **A reason is REQUIRED** (the `/orc-pact` retirement
  rule). It falls out of ONE boolean, so `orc resume`, the Overview count and the
  maintenance preview's `waiting_runs` all follow — and **no other subsystem
  reads `waiting`, so it cannot leak.** No auto-close, ever.
  (9) **A `--json` read must never emit a stack.** The top-level dispatch is
  wrapped: a throw under `--json` becomes
  `{ok:false, reason:"crashed", command, error, hint}` with its own exit code,
  and every `--json` route inherits it. `challengeList` degrades an unparseable
  ledger into a ROW (`UNREADABLE` — a LIST-level state that never reaches the
  pass gate), and `readCycle` defaults `goals`/`kind` so a missing goal renders
  as nothing and is never invented. `api.js` puts the CLI's own reason in the 500
  body and `failBox()` renders it. See `knowledge.md` §4z.13.

- **A house rule is PROSE, and the hand-back writes itself (v0.49.5).**
  (1) **THE HOUSE-RULE LEDGER IS A PLAIN TEXT CONFIG, NOT A ROW STORE.**
  `.claude/orc/doc-house-rules.md` — a preamble the user owns, then `## P0`,
  `## P1`, `## P2`, and AS MUCH TEXT UNDER EACH HEADING AS THEY WANT, handed to
  every writer VERBATIM. The unit is the BLOCK. v0.49.2's row shape — one line,
  an `H-001` id, a priority dropdown, an `enabled` flag, added one at a time —
  was every decision made for the CLI's argv rather than for the user: **nobody's
  real P0 fits on one line**, and being told to file it as two rules is the tool
  asking a person to work around it. The parser is deliberately forgiving about
  the only structure it has (`P0`, `## P0`, `P0:` all start a block); the
  preamble and everything inside a block survive verbatim. **Migration is lazy,
  free, idempotent and NON-DESTRUCTIVE** — the `.json` is read once and NEVER
  deleted, and a DISABLED rule is never resurrected (it is left behind and
  COUNTED). `remove|enable|disable|move` are **REFUSED BY NAME** (`reason:
  "retired"`), never quietly dropped. New: `set|add|clear --priority P0 --text
  "…"` (multi-line is the point), `set-all --text "…"` (the panel's ONE write
  route), `--set-file`, `--reset`. Drift is PER-PRIORITY
  (`changed[] = {priority, from, to}`) — still coverage-relative, still names both
  texts. The slice carries the CLI-rendered `doc_rules_text` and the skill
  **never re-wraps it**. **The panel is ONE TEXTAREA** — no dropdown, no Add
  button, no per-rule row — with the v0.44.1 staging rules unchanged and the file
  path shown for anyone who would rather use their own editor. Everything else
  holds: hard rule 15, the FROZEN set per document, `--sync` naming the sections
  that predate it and re-writing none, `house-rules-drifted` in the audit, and
  the DECLARED (never detected) boundary.
  (2) **`RESUME.md` IS WRITTEN BY THE CLI, ON EVERY STATE CHANGE.** v0.49.0 made
  it a rule of the stop sequence; that is the right ORDER and the wrong
  MECHANISM — remembered-not-dispatched protocol, the bet this repo has already
  lost twice (the v0.32.0 narration lesson). `doc.json` has exactly ONE writer,
  so the hand-back hangs off `docWrite`: it exists from `orc doc init` onward and
  can never be behind the disk. Still ORC's own hand and never a dispatched agent
  (rule 13 holds). Three guards: a **re-entrancy flag** (`docMapView(persist)`
  reaches `docWrite`), **a CLOSED run is never re-opened** (`closed.json`
  present → nothing written; v0.49.2's rule), and **best effort always** (a
  hand-back that cannot be written never takes its command down). `orc doc
  resume-file <slug>` writes it on demand; the `Where it stands:` line comes from
  the same `docWhereLine` as `orc doc status` — ONE generator — and stays at
  COLUMN 0. **Hard rule 16 — `every question points at RESUME.md`:** before ORC
  asks the user anything it runs `resume-file` and ends the message with the
  path and the line to paste. The page is written for someone who does NOT read
  code. See `knowledge.md` §4z.14.

- **`/orc-test` RUNS the test, and it never touches the system it is testing
  (v1.5.0).** Every other testing surface in ORC WRITES tests; this one points at
  a running system, sends real requests, writes down what came back, and stops.
  **The CLI executes and measures; the model designs and interprets** — a model
  never sends a request, and the CLI never decides what a response means. Three
  registered contract tokens, registered as a TRIPLE because they fail together:
  **`a lane that reports a result it did not observe`** · **`a lane that sends
  traffic to a target nobody authorized`** · **`a lane that fixes the system
  under test`**. Canonical prose: `templates/skills/_shared/live-target.md`. See
  `knowledge.md` §4z.28.
  - **THREE VERDICTS, AND `unknown` IS THE HONEST ONE.** A case nobody ran is
    never a pass; a case the ladder never reached is `unknown` WITH THE REASON,
    never left at a previous verdict. `unknown` NEVER raises the exit code — a
    run that exits red because it could not observe something teaches people to
    stop believing the exit code.
  - **THE TARGET IS FROZEN AT `init` AND NOTHING HERE HAS A DEFAULT IT COULD
    GUESS.** A REMOTE target REQUIRES `--authorized "<who>"`, recorded VERBATIM
    and never verified by ORC — the sentence saying so travels with it. Every
    request is fenced to one ORIGIN: a resolved URL outside it is NOT SENT,
    recorded and dropped, and no redirect is ever followed.
  - **THE FREE PASS RUNS FIRST AND ALWAYS.** `orc test surface` costs zero model
    tokens, and the **code-vs-live diff is derived from the two SPECS and from
    nothing else** — no route is ever probed to produce it. With no live spec the
    diff is `null` WITH A REASON: an empty array would read as "no shadow APIs",
    which is a claim nobody measured. `live: null` is "we did not look", a
    different fact from "it is not there".
  - **THE OWASP SET IS CLOSED — ten rows, 2023, never extended ad hoc — and ALL
    TEN RENDER IN EVERY STATE.** `UNCHECKABLE` keeps its slot, carries its OWN
    reason, never becomes a pass and never raises the exit code. It DETECTS and
    never exploits. `full` is CLIPPED to `safe` with the clip ANNOUNCED without
    `--destructive allow` and a recorded reason; `orc test security` reports the
    tier the cases were DERIVED at and NAMES a setting that has moved since.
  - **THE RUNNER IS THE ONLY PLACE IN ORC THAT SENDS A REQUEST TO A SYSTEM IT DID
    NOT START.** A red happy path STOPS the ladder. The pace is the target's and
    the CLI applies it. **A 429 is a RESULT** — record it and back off; pushing
    through is how a staging scan becomes a lockout. Failed auth is capped per
    identity. **Redaction is STRUCTURAL** — before the bytes reach disk, never in
    a review step, and never the "last six characters" convention.
  - **A FINDING CITES EVIDENCE THAT RESOLVES ON DISK OR IS DROPPED BY NAME AND
    COUNTED.** Severity is ORC's; the model's is `claimed_severity`, printed
    beside it when they disagree. A CVSS vector only on an OBSERVED finding. **A
    flake is recorded, never retried away** — there is no retry count.
  - **A HEALTH STATE IS NEVER STORED; THE OBSERVATION IS.** `orc test show`
    reports `env.state: null` always and carries `env.last_observed` —
    `{state, at}`, a fact about the PAST. Every surface renders it WITH ITS WHEN
    and none renders it as the state now. That is what lets `orc doctor` say
    something true without sending a request of its own.
  - **`orc test show` IS A READ IN THE STRICT SENSE** — re-scans nothing, probes
    nothing, writes nothing — and is the whole computed view (`--json is not a
    summary`). It exists for the panel: **opening a page must never be a
    measurement**.
  - **`orc ui` ▸ Test renders and derives nothing.** Five tabs. A FREE action is a
    button (`surface`, `env`, `report`); **`orc test run` is a copy-able command
    and will NEVER be a button** — it costs zero model tokens, so the free/paid
    line would make it one, and the TRAFFIC line makes it a command. Evidence is
    a PATH, never a BODY, and no route could stream one.
  - **FIVE CONFIG KEYS AND FIVE REFUSED.** `test_gate` (warn, no `block`) ·
    `test_security_tier` · `test_max_rps` · `test_case_budget` ·
    `test_ui_driver`. Refused with the reasons written down in
    `_shared/live-target.md`: `test_auto_fix`, `test_destructive`,
    `test_target_url`, `test_retries`, `test_skip_auth_probe`.
  - **TWO AGENTS, BOTH INSTRUMENTS.** The designer is `high`; the interpreter is
    **`low` and nothing may ever upgrade it**, its slice is SEALED to evidence
    paths and case rows, and it has **no `orc extra` slot** — captured response
    bodies are the most sensitive payload ORC composes, and `declared_files`
    fences FILES, not a request body.
  - **THE RUN FOLDER IS NEVER STAGED.** `orc/orc-test/<slug>/` holds real
    response bodies from a real system, and **ORC does not edit your
    `.gitignore`** — `orc doctor` says so instead, using git's own answer.
  - **`orc ui` COMPRESSES ITS STATIC FILES TOO (v1.5.0).** `encodeBody()` in
    `api.js` is ONE implementation and `serve.js` calls it: the 64 KiB
    Windows-loopback cliff is a property of the SOCKET, not of the content type.
    The static path had been guarded by a comment reading "No asset is over
    64 KiB today" that was false for two releases — `js/panels/extra.js` is
    138 KB. **A stale comment can guard a live bug for longer than the bug would
    have survived alone.**

