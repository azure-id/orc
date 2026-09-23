# Platform v1 — CLI contracts, config registries, wait, in-flight, status line, read gate

**Read: on demand** — read when touching `--json` contracts, `orc lane config`, the wait engine, in-flight detection, the status line hooks, the read gate, or the package rename/upgrade path.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **`--json is not a summary` (v0.49.1).** A read's `--json` is the WHOLE
  computed object, not a summary — **a field the human path prints and the JSON
  omits is drift no lint can see, because both halves live in one function.**
  `wiki status --json` emitted five scalars and a COUNT while its own TTY branch
  printed the per-doc counts, the worst doc's FILENAME and the crosslink boundary
  state, so the panel could not be as detailed as the terminal however it was
  written. It now carries `counts`, `worst`, `per_doc[]`, `blind_spot` as the
  FILE LIST it always was, `orientation`, `crosslink` and `free_repairs` (reused
  VERBATIM from `wiki plan` — a user must never pay for what a free step fixes);
  every legacy key keeps its name, position and meaning, and the exit code stays
  0 in every state. New reads: `orc wiki docs | show <doc> [--body] | coverage`,
  `orc pattern show <lang> [--body]`, `orc gotcha show <id> | list --archived |
  prune --dry-run`. **`orc wiki coverage` is a REPORT and never a gate** — no
  threshold, no config key, nothing branches on it, because a coverage percentage
  that starts nagging becomes a number people game. **`--body` is opt-in**, one
  artifact at a time, rendered as DOM and never as HTML. **`pattern show` invents
  nothing**: with no parseable header it returns `headered: false` and says so,
  and it NEVER derives a date from an mtime (the `/orc-pact` UNCHECKABLE rule).
  Per-doc crosslink tag counts are COVERAGE-RELATIVE via each tag's `anchor`.
  `orc doctor` gains exactly TWO wiki findings, and the restraint is the design:
  `wiki-unregistered` (free to clear) and `wiki-debt` — **STALE only, NEVER
  AGING**, because a doctor that warns about a normal state is a doctor people
  learn to ignore. No `pattern-missing`: that would be ORC nagging for a paid
  scan. Both route to `knowledge` in `FINDING_ROUTE`. **`orc ui ▸ Knowledge` is
  five tabs** (Wiki · Coverage · Code patterns · Memory · Peers, the Crosslink
  two-tab precedent) under a CLI-computed header strip where an uncomputable
  value is an em dash, never a guess; a doc row EXPANDS IN PLACE (the Runs-row
  rule), the prune is preview-then-apply and **names every entry** (a count is
  not consent), and Peers is read-only and never duplicates Crosslink's editor.
  `css/panels/knowledge.css` is new, so it is `<link>`ed in `app.html` AND named
  in `verify-package.js`. See `knowledge.md` §4z.12.9–§4z.12.13.

- **A RENAME MOVES THE COMMAND, AND A TOOL CANNOT SHIP ITS OWN RECOVERY FOR A
  BREAK THAT DISABLES THE TOOL (v0.56.0).** The package went from the unscoped
  `orc` to `@azure-id/orc` while keeping the same `bin` name. npm links a bin
  only if the shim is unowned or owned by the installing package, so the old
  global package made the new one unlinkable and **every** source failed with the
  same `EEXIST` **on the command file** — tarball, `github:` spec and registry
  alike. **The error is about a FILE, not a source**, which is why `orc
  upgrade`'s fallback ladder was useless (three network round trips to the same
  wall), why `orc ui`'s upgrade action failed identically, and why copying the
  README's install line by hand also failed. `npm i -g -f` "worked" and was the
  worst outcome: it overwrites the shim and leaves the superseded package
  installed underneath, owning nothing and updated by nothing.
  - **EVICT THE OWNER, DO NOT FORCE OVER THE FILE.** `orc upgrade` gains a
    step 0 that runs **BEFORE any spec is tried** — ordering is the design, not
    an optimisation. `detectLegacyBinOwner()` finds a global package that is not
    `PKG_NAME` and declares an `orc` bin; `evictLegacyBinOwner()` uninstalls it,
    **announced** (the only global npm mutation ORC makes for a user).
    **Detection is by OWNERSHIP, never by directory name**: a directory called
    `orc` holding THIS package is not legacy (a machine that never saw the
    rename land must not have its working install uninstalled), and a package
    declaring no `orc` bin blocks nothing.
  - **`--force` survives, fenced to the one case it fits.** A collision that
    SURVIVES the eviction is an ORPHANED shim — a file no package owns, which is
    exactly what `--force` is for. `isBinShimCollision` requires the `EEXIST`
    code AND a path component that IS the bin name (separators normalised, plus
    the `.cmd`/`.ps1` shims); `orchestrator` and an unrelated deep-tree `EEXIST`
    both fail it. A predicate that fired on any `EEXIST` would reach for
    `--force` on failures it cannot fix.
  - **The registry leads the ladder** (registry → tarball → `github:`): it
    resolves a VERSION, not a branch tip, and the `github:` spec shells out to
    git. `--from`/`ORC_INSTALL_SPEC` still win outright; `last_good_spec` still
    leads. **`freshCliPath()` resolves the SCOPED dir first and VERIFIES
    identity** — it looked only under `<npm root -g>/orc`, which after the
    rename is the LEGACY package, so step 2 re-applied the very templates step 1
    had just superseded. **A directory that exists is not proof of identity.**
  - **`orc doctor` reports `legacy-global-package` by name** — the one finding
    that explains why `orc upgrade` cannot fix anything else in the report — and
    it is **deliberately NOT `--fix`-able**, because `--fix`'s whole blast radius
    is this project's `.claude/`. `fix_command` points at `orc upgrade`;
    `FINDING_ROUTE` sends it to Maintenance, where the upgrade row is.
  - **The README CAUTION is not redundant.** Anyone still on the old package has
    the OLD upgrade code, so the self-healing path cannot reach them — the
    one-time `npm uninstall -g orc && npm i -g @azure-id/orc && orc update` has
    to live where a person can read it without a working `orc`. **Any future
    rename inherits this rule.** See `knowledge.md` §4z.19.

- **CONFIG, PHASES AND CALLS ARE REGISTRIES, AND A LANE ASKS ONE COMMAND
  (v1.0.0).** The three pillars are one shape — something this repo already
  built for `orc extra`, generalised. Canonical prose:
  `templates/skills/_shared/config-precedence.md`, `_shared/phases/README.md`,
  `_shared/read-ladder.md`. See `knowledge.md` §4z.21.
  - **`orc lane config <lane> [--json]` is the ONE resolver.** It answers with
    every shadow and inertness ALREADY WORDED, so a lane never merges
    `.claude/orc.config.yaml` itself and never re-derives a precedence.
    **A rank below a resolved rank is NOT READ AT ALL.** `CONFIG_FAMILIES.ranks[]`
    is the model, so a new forcing mode is a ROW and never a branch.
  - **SIX RANK STATES, and they are the CLI's:** `resolved` · `partly-resolved` ·
    `not-read` · `inert` · `demoted` · `absent`. **`absent` and `not-read` are
    DIFFERENT FACTS** — one rank was consulted and declined, the other was never
    looked at — and rendering them alike erases the difference between "your
    setting did nothing" and "your setting was never read".
  - **TEN KEYS HAVE A PERMANENTLY EMPTY `lanes[]` AND THAT IS AN ANSWER.** They
    are operating keys of the `orc extra` BRIDGE — a lane calls `orc extra
    dispatch` and the CLI reads `extra_timeout_s`. The set is a NAMED allowlist
    (`SEED_EMPTY` in `bin/verify-contracts.js`), so a key joining it is a
    deliberate line in a diff. Do not read it as a to-do.
  - **A MANIFEST NAMES A FILE, A LAYER AND AT MOST A HEADING — never a line
    number** (`/orc-doc` rule 2). A `## Phases` row names a FILE **or** a
    HEADING, never both and never neither; a two-way lint catches a missing row
    AND a phase-shaped heading nobody declared.
  - **FIVE LANES STAY `own_phases: in-spine` ON PURPOSE** — orc-mini, orc-grill,
    orc-handoff, orc-aftermath, orc-export. Their pipeline lives in a fenced code
    block where only some phases have a heading, so a heading-derived manifest
    would declare half a pipeline. Converting them is a DECISION, not a
    mechanical edit.
  - **MEASURE THE TARGET FIRST, AND NAME THE CLASS FROM THE COUNT.** E = fewer
    lines · D = the same lines loaded less often · C = correctness at a small
    cost in lines. **v1.0.0 grew the payload** (208 files/26,507 lines → 291
    files/33,204) and most waves measured C, not E — that is recorded, not
    softened. Two planned deletions were measured and REFUSED:
    `orc-diy/references/blocks/` (270 relocate · **178 stay** · 0 delete — five
    blocks have no counterpart, and 233 lines are `diy:when` composition prose no
    shared phase contains) and the phase-prose move for **20 of 21 lanes** (they
    loop; relocating buys a round trip per phase for the same bytes). **A folder
    is only DELETABLE if something else already says what it says.**
  - **`orc doctor`'s `lane-keys-drifted`** asserts on disk what
    `bin/verify-contracts.js` asserts in the source tree, BOTH directions. It
    fires when a CLI that knows a lane reads keys sits on a spine from before
    that lane had the contract — exactly when a lane falls back to resolving
    config itself and gets a shadowed key wrong, silently. Routed to Maintenance
    (an install-footprint finding takes the documented default).
  - **THE PANEL RENDERS `families_resolved`, `phases[]` AND `calls[]`, AND
    DERIVES NONE OF THEM** — the Flow-stepper rule, three more times, each with a
    test that greps for the literals the panel must not own. `families_resolved`
    is resolved **project-wide with NO lane**, because inertness is a fact about
    a lane. An empty `lanes[]` KEEPS ITS ROW; a lane with no shared phase SAYS
    SO; the demotion card renders even when nothing is demoted, and its counter
    renders at zero. **`config list --json` gained it because the human branch
    always PRINTED the resolution while the JSON carried only the registry** —
    `--json is not a summary`, found once more in the release that named it.
  - **A FLAKE IS RECORDED, NEVER RETRIED AWAY.** `extraProbeMs()` is the ONE seam
    over every PROBE budget (3000/8000/20000/60000), on the
    `ORC_TEST_BUDGET_FLOOR_MS` precedent; unset it is byte-identical and nothing
    in ORC ever sets it. **The cap was never the lever** — `net` is pinned at 2
    by the POOLS table whatever `ORC_TEST_GLOBAL_CONCURRENCY` says. **And three
    green runs are the gate, NOT PROOF:** the same box is green with the seam
    off, so an idle run cannot tell a fixed flake from a quiet afternoon. A
    FOURTH wall clock — `test/cli/extra-journal.test.js:428`, a 12 s absolute
    assertion guarding a ratio — is known, unfixed and deliberately not nudged.

- **A WAIT IS A STOP, AND NOTHING RUNS DURING ONE (v1.1.0).** The statusline had
  `rate_limits` all along and threw it away, so a lane started a wave blind.
  Canonical prose: `templates/skills/_shared/wait.md`; registered token
  **`a lane that waits without a hand-back`** — eighth in the family with
  `a lane that fixes what it judged` and the rest. See `knowledge.md` §4z.22.
  - **ONE ENGINE, TWO TRIGGERS.** `/orc-wait 30 hard` (typed) and `usage_gate`
    (computed) are the same engine; never build two. A TYPED wait always wins,
    and a block suppresses only the COMPUTED half — `/orc-boundary`'s rule that
    a gate constrains ORC's dispatch, never an explicit instruction.
  - **THE HAND-BACK IS WRITTEN BEFORE THE WAIT, IN EVERY MODE.** The wake-up is
    a Claude Code behaviour ORC cannot promise. The three modes differ in ONE
    thing — how much finishes first: `safe` waits for a safe point; `soft`
    **FORCES** the checkpoint and **does not stop if that write fails**
    (`stop-resume.md` step 2); `hard` is **the dispatch-free stop**, writing only
    what ORC's own hand can (step 3b), which is why it is fast and why it can
    lose an in-flight return. **"the next model turn" is the honest promise** —
    never write "immediately".
  - **NOTHING RUNS DURING A WAIT.** A DETACHED command sleeps; zero tokens, no
    model. An agent dispatched to wait would spend the very window being waited
    for. Hops are ≤30 min ON PURPOSE: each wake-up is session activity, and that
    is the only thing that makes the statusline write a fresh reading.
  - **UNKNOWN IS NOT LOW.** `orc usage check` is the ONE reader of
    `.claude/orc/usage.json` — 0 ok · 1 low · **2 unknown**, and exit 2 never
    stops a run in any mode. The bridge stores RAW numbers and never a computed
    word (the `computeWikiFreshness` rule). **THE WORST WINDOW DECIDES.**
  - **`WAIT_LANE_SHAPES` is the registry**, mirrored in `wait.md` and
    golden-tested BOTH DIRECTIONS. **`checkpoint: "none"` is an ANSWER** — all
    three modes collapse on a single-dispatch lane and the row SAYS so. All 24
    spines were wired in ONE release from that registry: a wait whose behaviour
    depends on which lane you are in is worse than no wait.
  - **EVERYTHING IS OFF BY DEFAULT.** `usage_gate: off` · `wait_default_mode:
    ask` — `ask` is a real value, not an absence, so there is no stop behaviour
    the user did not choose. `wait_hop_minutes`/`wait_max_hops` join
    `SEED_EMPTY`. `orc-wait` is in `LANE_INERT`: **it dispatches nothing**, so
    every model family is inert with a reason.
  - **THE BLOCK IS RECORDED, NEVER SILENT.** `--reason` REQUIRED, run-scoped,
    never written to config, re-announced WITH ITS AGE at every gate it
    suppresses (no auto-expiry — ORC does not decide a reason stopped being
    true). `orc wait cancel` is DIFFERENT: block is before, cancel is during.
  - **THE PANEL CAN NEVER START A WAIT.** `orc ui ▸ Wait` renders and derives
    nothing; its only two mutations UNDO something. A block cannot be created
    there — a reason typed into a settings page days later is not the record
    that makes the risk the user's.

- **A TASK ERROR DOES NOT KILL THE AGENT BEHIND IT (v1.2.0).** Claude Code's
  Task tool can fail, time out or be cut off mid-turn while the subagent it
  started keeps running — and keeps writing files. Every retry rule in the
  payload ended in "re-dispatch" and none checked. One graded `/orc-quick` entry
  put THREE `orc-executor-opus-5-low` agents on the SAME task — 50m19s +
  115m22s + 100m53s, **266 minutes of Opus 5 for one authorised dispatch**, all
  editing the same files inside a 2h04m window, against a healthy 17m8s in that
  same trace. **`a lane that re-dispatches over a live attempt` has broken this
  contract** — ninth in the family with `a lane that waits without a hand-back`.
  Canonical prose: `templates/skills/_shared/return-validation.md` **§0**, placed
  ABOVE every existing rule because every one of them ends in "re-dispatch".
  See `knowledge.md` §4z.23.
  - **`orc run inflight` is the ONE reader** of the pending sidecar
    `orc-trace.js` has written on every `SPAWN` since v0.34.2 — a record that
    existed for a release and a half while nothing read it. `0` clear · `1`
    in-flight · `2` unknown. ORC already KNEW this failure mode and had written
    it down for a different path (`orc-wait/SKILL.md`: *"their file writes may
    still land"*); the trace hook went further and NORMALISED it, with a whole
    subsystem for ">=2 in flight" that treats concurrent duplicates as a
    formatting problem rather than an incident.
  - **EXIT 2 REFUSES, and it is the ONE place in ORC where an absent reading
    blocks.** `orc usage check` exit 2 never stops a run; UNCHECKABLE never
    raises a pact's exit code. The default inverts here because the errors are
    not the same size: a wrongly-refused dispatch costs one question, a
    wrongly-issued one costs a second Opus agent for an hour. **An interrupted
    turn is UNKNOWN, never FAILED** — classifying it as a failure is what made
    the incident compound. **Unknown is not zero:** a missing or unreadable
    sidecar, records older than 6h, or a sidecar that disagrees with the trace's
    SPAWN/RETURN balance all read `unknown`, never `clear`. **"Dispatch anyway"
    is always offered and never the default.** The honest limit is STATED: it
    cannot see an AD-HOC dispatch (no `SPAWN` is written for one), so `clear` is
    never proof an ad-hoc read finished.
  - **`orc usage report` — the window you can watch empty.** `usage.json` is a
    SNAPSHOT and cannot say how much THIS session ate. The statusline now keeps
    a per-session ledger (`.claude/orc/usage-session.json`) beside it — raw
    numbers only, never a computed word, fail-silent. **A window RESET mid-session
    is not a refund:** what was spent before it is banked and the count continues.
    Never overclaim — the window is per ACCOUNT, and the caveat ships with the
    line. **Claude Code records NO token usage for a dispatched subagent**
    (`isSidechain` is never set, verified across every transcript on two
    machines), so rows rank by **measured WALL TIME** and every Claude row reports
    `tokens: null` plus the reason — **never `0`, which would say the work was
    free**. Only `orc extra` workers report real four-kind vectors. A fake
    measurement would be worse than none.
  - **The statusline is TWO lines now** — `agents N (M running) · orc-extra:
    on/off · lanes: … · Xm`, plus `sess +X%` on the first. Dispatches are
    attributed by the trace's OWN line timestamps, never the file's mtime (mtime
    cannot tell two sessions apart), with the session boundary FLOORED TO THE
    SECOND the trace can express. A lane is named only if it dispatched;
    `lanes: none yet` KEEPS ITS SLOT. `running` is never hidden. The scan is
    THROTTLED to 5s and cached in the ledger — a statusline re-renders on every
    keystroke, so anything unthrottled there is a per-keystroke disk scan.
    **`ORC_STATUSLINE_SCAN_MS` is the ONE seam over that budget** (the
    `ORC_TEST_PROBE_MS` precedent): unset it is byte-identical to a hardcoded
    5000 and nothing in ORC ever sets it. The tests use `0` to measure behaviour
    and `999999999` to prove the throttle — **a test that proves a throttle by
    SLEEPING past it is a race on a loaded machine**, and this one was observed
    flaking 735/2 before it was seamed.
  - **Deliberately absent:** a config key for the guard (a guard you can switch
    off is off on the run you needed it for) and any token estimate for a Claude
    subagent. The `orc ui` panel is NOT in this release — the CLI half ships
    first, and the panel renders it and decides none of it.

- **THE STATUS LINE SAYS WHAT ORC IS DOING, AND HIDES WHAT IT CANNOT PROVE
  (v1.2.1).** Line 2 leads with `status: <lane> · <phase>` and an animated
  one-cell mark; `lanes:` is REPLACED by it. **The CLI computes and the hook
  renders** — `orc init`/`update` stamps `hooks/orc-lane-rails.json` from
  `LANE_PHASES`/`LANE_OWN_PHASES`/`LANE_TRACE` (`orc lane rails [--json]`), a
  registered contract token plus three goldens, because a phase table hardcoded
  in a hook is a second source of truth no lint could see (the Flow-stepper rule
  on a second surface). **Four rungs, and the floor is hook-written:** `.current`
  names the run (never "the newest file" — wrong during a suspend) → a narrated
  verb the lane's OWN RAIL publishes may refine the edge, never invent one →
  `PHASE-EDGE <family>` → nothing, or a newest line older than 10 minutes, hides
  it. **A phase that dispatches nothing AND narrates nothing is INVISIBLE**
  (`/orc-quick` Q1 LOOK, Q2 ASK, every ask-the-user gate) and that is the
  accepted cost: covering it needs a marker written by 24 spines, which is the
  remembered-not-dispatched bet lost five times, and **a stale phase word gets
  believed**. The animation is a **LIVENESS TELL on a PULL surface** — the frame
  comes off the wall clock and freezes when idle; `ORC_STATUSLINE_MOTION=0`
  REMOVES motion rather than slowing it, `ORC_STATUSLINE_ASCII=1` swaps the
  glyph set, every motif is ONE CELL and an unnamed phase gets `generic`, never
  a guess. **`MTok` is MAIN TOKEN** — this session's own turns, four kinds
  summed (a deliberate exception to *never blended*, allowed only because it is
  one cell and not a report), read INCREMENTALLY; Claude Code records no tokens
  for a dispatched subagent, so it is the conversation's cost and not the run's,
  and an unreadable transcript renders `—`, **never `0`**. On line 1 the verdict
  WORD becomes the version while the ICON keeps the verdict — **the ⛔ branch
  still names every reason** — `ctx` becomes `context (N%)`, and `ucs` (ex
  `sess +X%`) KEEPS ITS SLOT at zero. The branch comes off `.git/HEAD` with NO
  subprocess. **Zero config keys** (a hook has no lane, so it cannot resolve
  config) and **zero new throttles** — everything rides in v1.2.0's one 5s scan.
  `templates/hooks/README.md` explains every segment, and every ABSENT segment,
  in Simplified Technical English. Not an `orc ui` surface: nothing in
  `bin/webui/` moved. See `knowledge.md` §4b / the `orc-statusline.js` entry.

- **THE STATUS LINE IS USER-COMPOSED, AND THE CLI COMPILES WHAT THE HOOK
  RENDERS (v1.3.0).** Three lines, 1–6 components each, 128 components, 35
  renderers, composed in `orc ui` ▸ **CLI Hook Interface**. **DEFAULT OFF, and
  OFF IS BYTE-IDENTICAL** — nine states frozen in
  `test/goldens/statusline-baseline.txt`, which is a test, not an intention.
  Canonical prose: `templates/hooks/README.md` (the user's half) and
  `knowledge.md` §4z.24.
  - **`statusline-layout.json` is AUTHORED and THE HOOK NEVER READS IT** — not
    as a fallback, not on a cache miss, not ever. `statusline-compiled.json` is
    DERIVED (flat, total, every SGR precomputed, tables INDEXED);
    `statusline.lock.json` carries `catalog_hash`, so an upgrade that changes a
    component invalidates every compiled layout on the machine. The `orc diy`
    shape on a second surface, and compile is AUTOMATIC after every mutating
    command.
  - **THE BUDGET IS ~15 MILLISECONDS, NOT 300.** Claude Code debounces at 300ms
    and CANCELS a script still running, and a bare `node` start on Windows is
    **285ms** of that. Every component is measured against the remainder, which
    is why `refused` is used more than the plan implied and why the compile step
    is mandatory rather than architectural taste.
  - **`templates/hooks/orc-statusline-render.js` is ONE ENGINE WITH TWO
    CALLERS** — the hook as a sibling, `bin/cli.js` from `templates/hooks/` for
    `orc statusline preview`. Preview ≡ bar is STRUCTURAL. It holds no
    catalogue, no theme, no inheritance and no config knowledge; a `BINDINGS`
    table is the whole extent of what it knows.
  - **THE DENSE-PREFIX INVARIANT** is a registered contract token: *a line may
    hold a component only if every line above it holds at least one.* ONE
    validator, collecting EVERY error before returning; a structural failure is
    a REFUSAL that writes nothing. The panel makes the illegal drop IMPOSSIBLE
    with the reason on the zone — the CLI is still the guarantee.
  - **A PROVIDER NOTHING BINDS IS NOT READ**, and the provider is derived from
    the BINDING, not the cost. Measured cold: 346.7ms built-in → 298.2ms
    composed, which crosses the cancel line. Per-provider TTLs;
    `ORC_STATUSLINE_SCAN_MS` remains the ONE seam over all of them.
  - **UNKNOWN IS NOT ZERO** — an em dash, never `0`, which would say the thing
    was free. **Three wiki components are REFUSED because `wiki-meta.json` does
    not hold what they would need**: coverage needs `git ls-files`, and the
    worst doc and the blind spot need a `git rev-list` PER DOCUMENT, because
    freshness is coverage-relative. The contract lint caught that, and a field
    read that is not there is a confident number nobody measured.
  - **R1–R4 ARE TESTED.** Single-cell glyphs only; `NO_COLOR` emits zero escape
    bytes; `ORC_STATUSLINE_ASCII=1` emits no byte above ASCII; no two states of
    one component render the same bytes without colour — which is why a bare
    `dot` is REFUSED and `shape` is the honest version. `blink` is refused
    outright, and **there is no font-size control because a terminal owns its
    font** (the control is `emphasis`, plus more cells).
  - **THE HOOK CANNOT REFUSE**, so its six-rung gate ladder is all FALLBACKS and
    each RECORDS ITSELF; `orc doctor` turns that into a sentence, and only while
    the feature is armed. An ORPHANED component after an upgrade is REPORTED,
    never auto-repaired.
  - **`statusline_custom`** (default `off`) joins `SEED_EMPTY` — an operating
    key of a HOOK, and a hook has no lane. **Deliberately absent:** an
    expression language, a shell-command component, a colour-scheme key, and
    Nerd Font glyphs.

- **ONE COMPILER, TWO BOARDS — AND THE NUMBER v1.2.0 SAID WAS MISSING
  (v1.4.0).** Claude Code's `subagentStatusLine` renders a row per subagent, and
  `templates/hooks/orc-subagent-line.js` draws it by **reusing the compiler, the
  IR, every renderer, the glyph sets, the colour model, the validator and the
  gate ladder.** `SL_BOARDS` is a TABLE — a component set, three filenames, a
  config key — never a fork, and a test asserts exactly ONE `slCompile` and that
  the hook grew no renderer of its own. A component declares its `board`, and
  the other one **refuses it BY NAME**: one catalogue with a column, never two
  lists somebody keeps in step. A subagent row is **ONE LINE by construction**,
  so the dense-prefix rule does not apply there.
  - **THE MEASUREMENT.** v1.2.0 verified the TRANSCRIPT records no token usage
    for a dispatched subagent — that half stands. The AGENT PANEL carries
    `tokenCount` per task with the resolved `model` and `effort`, so the hook
    writes what it was handed and `orc usage report` reads it.
  - **IT IS A FLOOR, AND IT IS LABELLED ONE EVERYWHERE.** The hook sees a task
    only while it is in the panel, so an agent that started and finished between
    two renders is never seen and a count read just before one finished is
    short. `not-seen` means exactly that and **never `0`** — a floor reported as
    a total is the same lie as a zero for an unknown.
  - **THE RECORD RUNS WITH THE BOARD OFF**, which is why `orc init` wires
    `subagentStatusLine` regardless (non-destructively). It is not part of the
    display feature; it is a measurement handed over either way, and discarding
    it because a display setting is off would be the wrong trade.
  - **A count can only go UP** (a lower reading is stale), the record is
    session-scoped, and the model/effort are **OBSERVED** — the third reading
    beside the name-derived expectation and the agent's self-report, and the
    only one nobody had to be trusted for.
  - `subagent_line_custom` (default `off`) joins `SEED_EMPTY`. Every gate rung
    falls back to **Claude Code's own row** — a real answer, unlike a blank —
    and an empty render is never emitted, because an empty `content` HIDES a
    task.

- **THE READ LADDER STOPS BEING ADVICE, AND IT SHIPS OFF (v1.6.0).**
  `_shared/read-ladder.md` said the orchestrator reads to LOCATE and dispatches
  to UNDERSTAND; `/orc-doc` hard rule 0 and `/orc-quick` line 21 said it again.
  **Nothing checked any of it** — the sixth time this repo has found a fact
  living in a model's memory (v0.32.0 narration · v0.49.5 hand-back · v0.53.2
  spend log · v0.54.0 journal · v1.1.0 wait · v1.2.0 in-flight).
  `templates/hooks/orc-read-gate.js` is the layer that can refuse: `read_gate`
  (`off`|`warn`|`block`, **default off**) and `read_gate_max_lines` (**1000**),
  both on `SEED_EMPTY` with an empty `lanes[]` because a hook has no lane and
  cannot resolve config. **`off` is byte-identical to not having the hook**, and
  a test asserts it. Canonical prose: `templates/hooks/README.md`. See
  `knowledge.md` §4z.24.
  - **MEASURE THE TARGET FIRST, AND BE WILLING TO STOP.** W0 measured 239
    transcripts (22,510 main-session turns) BEFORE anything was built and
    **REFUSED the release**: reads ≥350 lines are **0.39% of `cache_write`** and
    **0.99% price-weighted at a bound assuming no compaction**; blocking EVERY
    full read ever recorded would move **1.95%**. p50 is **85 lines**, p90 288,
    and **46% of reads already use `offset`/`limit` unprompted** — *the prose
    was working.* That is why it ships OFF, and it is the one place this release
    parts company with its five predecessors: those moved a mechanism because
    memory was failing. **The release shipped on an explicit override of an
    ECONOMIC refusal — recorded, not smoothed over.** W1's refusal condition was
    a CORRUPTION path and was never on the table.
  - **THE THRESHOLD IS OURS. 350 IS SOMEBODY ELSE'S MACHINE.** Their constant
    came from a 10–30 s round trip; a `Task` dispatch here measures **p50 76 s /
    p90 188 s** (n=125) and one real read-only dispatch cost **13,276 tokens to
    read a FOUR-LINE file**. At **55.2 chars/line** (n=316) break-even is
    **~962–1024 lines**. Below it, delegating a read costs more than the read —
    a number needs a sample count, `/orc-budget`'s rule applied to a borrowed
    constant.
  - **`agent_id` IS THE ONLY DISCRIMINATOR, AND IT WAS MEASURED.**
    **`PreToolUse` DOES fire inside a dispatched subagent** — the session-level
    inference from `orc-trace.js`'s design was WRONG — and **`session_id` and
    `transcript_path` are IDENTICAL in both contexts.** A gate written against
    either blocks the full read an executor must do before an `Edit`, and a
    reconstructed `old_string` is a file-corruption bug. Test for the PRESENCE
    of `agent_id`; **never for the absence of another key** (`effort` also
    vanishes, and an absent key asserts nothing). Rung 0.5 — present ⇒ ALLOW —
    **eliminated R1, made D5 moot and kept `orc-trace.js` untouched.** The
    validity control matters as much as the result: a main-session read had to
    fire FIRST, or a negative would only have proved hooks had not reloaded.
  - **EVERY SILENT STATE IS A DECISION, because a false ALLOW costs tokens and a
    false BLOCK costs correctness.** Silent on: any subagent read · `off` ·
    outside an open run · a targeted `offset`/`limit` read · under the threshold
    · build logs, test results and `.jsonl` (**a truncated red build reads
    GREEN** — exception 2 is deliberately generous) · and **any error at all,
    because a read gate that throws and blocks a read has broken the tool.**
    Rung 2 is an HONEST LIMIT stated wherever the gate is described: it
    constrains ORC's own reading, never the user's session (`/orc-boundary`).
    **A block always NAMES the cheaper path** — a gate that only refuses is one
    people switch off.
  - **A GATE DECISION THAT LEAVES NO LINE CANNOT BE COUNTED.** One `READ-GATE`
    line per `warn` and per `block`, none on an allow (a line per passed read is
    noise in the file `/orc-retro` mines). Affordable for a STRUCTURAL reason:
    the gate only acts while a run is open, so a trace always exists.
    `orc doctor` gains `read-gate-unwired` (→ Maintenance) and
    `read-gate-fallback` (`panel: null` — it ages out and there is no button,
    the `trace-pointer-dangling` call), **both only while ARMED.**
  - **Deliberately absent:** a `Bash` gate — the measurement found **7,139
    read-shaped Bash calls against 581 `Read` calls**, so the matcher covers
    ~7.5% of the real surface and widening it means a command-and-path allowlist
    with several times the false-positive surface (a separate feature with its
    own measurement) · a `context-reader` `EXTRA_SLOTS` row (**five** addressable
    reads across 239 sessions — D8's own words, *infrastructure for nothing*) ·
    a config key for the subagent carve-out (a correctness rule, not a
    preference) · and the constant `350`.

