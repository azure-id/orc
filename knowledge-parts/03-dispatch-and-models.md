# knowledge.md — Part III — Dispatch & models

**Read: on demand** — read when touching agent files, the score->model bands, `opus5_only`, the effort/tier guard, or `MODEL-MAPPING.md`.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4a. The tier guard (effort hard-block + model warn)

Enforces the "run ORC on Opus 4.8 high" rule as far as Claude Code allows.
Verified against the hooks/statusline docs: `effort.level` (and `$CLAUDE_EFFORT`)
is exposed to blocking hooks, but the **model id is not** — "Only `SessionStart`
hooks can receive a `model` field, and it is not guaranteed to be present." So
effort can be hard-blocked; model tier can only be warned.

- **`templates/hooks/orc-effort-guard.js`** — a `PreToolUse` hook. Fires when the
  `Skill` tool runs; if the skill is exactly `orc` (the full orchestrator) and
  `effort.level` is below `high`, it exits **2** (blocks the call, message relayed
  to the user). **v0.30.0:** the bar is `high` OR STRONGER (`high`/`xhigh`/`max`
  all pass — an xhigh/max session was wrongly blocked before) via an
  effort-ladder helper (`low < medium < high < xhigh < max`), and **Fable 5 also
  clears at `medium`** — read from the session-model bridge (§4a below), fail-open
  (missing/stale bridge → medium stays blocked). **v0.34.0: Opus 5 joins that
  medium allowance** (`isMediumOkModel` matches `(opus|fable)[\s._-]?5\b`, so
  Opus 4.8/4.7 are unaffected). Non-`orc` skills, non-`Skill`
  tools, and unparseable payloads pass. On the `/orc` path it also surfaces a
  newer-version nudge via `orc-update-lib.js`. The DIY branch derives the required
  effort from the compiled `session_tier` slug's suffix (that effort OR stronger),
  covering the full grid (§4h/C.5).
- **`templates/hooks/orc-statusline.js`** — a `statusLine` command. Reads
  `model.id` + `effort.level` and renders a **three-tier verdict (v0.30.0, the
  "ORC-ready" acceptance matrix):** `✅ ORC-ready` (Opus 4.8 high, the baseline),
  `🚀 ORC-boosted` (Opus 4.8 xhigh/max, or Opus 5 / Fable 5 medium…max — v0.34.0),
  `⛔ ORC WILL DEGRADE` (anything below — wrong model or sub-baseline effort). Only
  a POSITIVELY-known bad tier degrades; an unknown model/effort stays lenient (the
  guard enforces effort). It also writes the **session-model bridge**
  (`.claude/orc/session-model.json` = `{model_id, effort, written_at}`, fail-
  silent) that the effort guard reads to grant the Opus 5 / Fable 5 medium allowance — the
  guard can't see the model id, only effort. Appends the live context %, and on
  Claude Code ≥ v2.1.80 the subscription-usage segment `5h N% (reset) ↔ wk N%`
  from `rate_limits.{five_hour,seven_day}.used_percentage` (thresholds `⚠`≥75% /
  `⛔`≥90%; ≥90% folds into DEGRADE). Display-only. Also appends a `⬆ orc X` update
  hint from the cache.

  **v1.2.1 — the two lines in full.** Line 1 became
  `{icon} ORC v{version} - {model}/{effort} · context (N%) · 5h … ↔ wk … · ucs N%
  · wiki: … · diy:… · orc N.N.N available`: the verdict WORD is replaced by the
  installed version and the ICON carries the verdict, but the ⛔ branch still
  names every reason (a warning with no reason is an emoji), and a version it
  cannot read renders plain `ORC`, never `ORC vnull`. `sess +X%` became `ucs N%`
  and now KEEPS ITS SLOT at zero.
  Line 2 became `{glyph} status: {lane} · {phase} · agents N (M running) ·
  orc-extra: on|off · Dur Nm · MTok NNNK · {branch}` — `lanes:` is REPLACED by
  `status:` (the running lane is its first word; `orc stats` / `orc run list`
  keep the history). Three rules hold it up:
  - **The CLI computes, the hook renders.** `orc init`/`update` stamps
    `hooks/orc-lane-rails.json` from `LANE_PHASES` / `LANE_OWN_PHASES` /
    `LANE_TRACE` (`laneRailsManifest()` in `bin/cli.js`; read it with
    `orc lane rails [--json]`). A hook cannot shell out on a per-keystroke
    surface, and a phase table hardcoded in the hook would be a second source of
    truth no lint could see — so it is a REGISTERED contract token plus three
    goldens (label+kind for every phase; the lane set BOTH directions; the
    families asserted against `orc-trace.js`'s own `roleFamily()` by SOURCE
    TEXT, the `OPUS5_BANDS` technique).
  - **A phase the disk cannot prove is HIDDEN.** Four rungs: `.current` names
    the active run (never "the newest file" — wrong during a lane suspend, when
    two traces are live) → a narrated verb THIS LANE'S RAIL PUBLISHES refines
    the edge, but only when later in the file → the hook's `PHASE-EDGE <family>`
    is the deterministic floor → nothing, or a newest line older than 10
    minutes, hides it. **The cost is stated:** a phase that dispatches nothing
    AND narrates nothing is invisible (`/orc-quick` Q1 LOOK, Q2 ASK, every
    ask-the-user gate). Covering those would mean a phase marker written by 24
    spines — the remembered-not-dispatched bet lost five times already — and a
    stale phase word gets believed.
  - **The animation is a LIVENESS TELL, not a progress bar.** Eight one-cell
    motif kinds (`look ask plan do check ship wait generic`), each with an ASCII
    twin; an unnamed phase gets `generic`, never a guess. A statusline is a PULL
    surface, so the frame comes off the wall clock: it moves while you type and
    FREEZES when idle. `ORC_STATUSLINE_MOTION=0` REMOVES motion (a frozen frame
    of a cycling animation is a bug that looks like a hang — the panel's v0.44.0
    lesson); `ORC_STATUSLINE_ASCII=1` swaps the glyph set.

  `MTok` is MAIN TOKEN: this session's own turns, all four kinds summed, read
  INCREMENTALLY from `transcript_path` (offset in the ledger; reset on shrink or
  path change). Claude Code records NO token usage for a dispatched subagent, so
  an hour of executors adds almost nothing — `orc usage report` / `/orc-budget`
  stay the truth for a run's cost. Unreadable renders `—`, **never `0`**. The
  four-kind sum is a deliberate exception to *four kinds never blended*, allowed
  only because this is one cell and not a report: any subset would be a
  weighting ORC invented. The branch comes off `.git/HEAD` (incl. the `gitdir:`
  pointer file) with NO subprocess. Everything rides in v1.2.0's ONE 5s scan;
  `ORC_STATUSLINE_SCAN_MS` stays the only seam. NO config key — a hook has no
  lane and so cannot resolve config anyway.

  The user-facing explanation of every segment, including what each ABSENT
  segment means, is `templates/hooks/README.md`, written in Simplified Technical
  English and shipped into `.claude/hooks/`.

  **v1.3.0 — the render budget, measured.** Claude Code debounces at 300 ms and
  **cancels the in-flight script** when a new update arrives, so a slow render is
  not a slow status line — it is NO status line. Measured on Windows: a bare
  `node` that reads stdin and writes one byte is **~285 ms**, and the whole
  status line is **~305 ms**. So everything ORC does here costs about **20 ms**,
  and there is roughly **15 ms of headroom**. Every segment is measured against
  that number, not against 300.

  Two things followed from it, and neither changed a byte of the output:
  - **The wiki distance moved INSIDE the throttled scan.** `git rev-list --count`
    is 53 ms and was running on EVERY render — 3.5× the headroom, per keystroke,
    in any project with a wiki, which pushed the render past the cancel line. The
    ledger now caches the RAW commit count and a boolean; the word (`fresh` /
    `AGING` / `STALE`) is still computed on every read, because a stored status
    word goes stale (the `computeWikiFreshness` rule). **A FAILED probe is cached
    too** — the first cut of the fix let a throwing `execSync` abort the block
    before the ledger was stamped, which reproduced the very bug being fixed.
  - **ONE ledger: one read, one write.** Three blocks wanted
    `usage-session.json` — the rate-limit tracker, `ucs`, and the line-2 scan —
    and each opened it while two wrote it. `ledger()` memoises it per process and
    `ledgerFlush()` writes it ONCE, **after** the output is composed: a render
    that throws half way through still prints, and a ledger that cannot be
    written never takes the status line down with it. `scanStale()` is now the
    one place that decides what stale means. A test pins the source to exactly
    one `"usage-session.json"` literal.

  **The rendered bytes are FROZEN** — `test/statusline-baseline.test.js` and
  `test/goldens/statusline-baseline.txt`, nine named states, every glyph and
  separator and the three-space indent. Only the installed version and the reset
  clock are normalised, because neither is a property of the status line.
  Regenerate with `ORC_UPDATE_GOLDENS=1` **in the same commit** as the behaviour
  change. This is what makes the CLI Hook Interface's "default is OFF, and off is
  byte-identical" a test rather than an intention.

- **`templates/hooks/orc-statusline-render.js`** — THE RENDER ENGINE (v1.3.0),
  and the reason the CLI Hook Interface's preview can be trusted. **ONE ENGINE,
  TWO CALLERS:** the hook requires it as a sibling out of `.claude/hooks/`, and
  `bin/cli.js` requires it out of `templates/hooks/` for `orc statusline
  preview`. Byte-identity between the panel and the bar is therefore
  STRUCTURAL, not careful. It holds **no catalogue, no theme, no inheritance and
  no config knowledge** — a `BINDINGS` table is the entire extent of what it
  knows about the world, and a second catalogue on this side of the wall would
  be the Flow-stepper failure on a third surface. A test asserts it names none
  of the CLI's resolver.

- **§4z.24 — the CLI Hook Interface (v1.3.0).** The status line becomes
  user-composed: three lines, 1–6 components each, 128 components, 35
  renderers. **DEFAULT OFF, and off is BYTE-IDENTICAL** (the frozen golden
  above is that claim's proof).
  - **THE CLI COMPILES, THE HOOK RENDERS.** `statusline-layout.json` is
    AUTHORED (sparse, one writer, **never read by the hook — not as a fallback,
    not on a cache miss, not ever**); `statusline-compiled.json` is DERIVED
    (flat, total, every SGR precomputed, tables INDEXED not inlined);
    `statusline.lock.json` is the staleness proof and carries `catalog_hash`,
    so an upgrade that changes a component invalidates every compiled layout on
    the machine. The `orc diy` shape on a second surface. Compile is AUTOMATIC
    after every mutating command — there is no "you forgot to compile" state.
  - **THE DENSE-PREFIX INVARIANT** (a registered contract token): *a line may
    hold a component only if every line above it holds at least one.* Enforced
    in ONE validator that collects EVERY error before returning — a validator
    that stops at the first problem makes a user fix a five-error layout five
    times. Structural failures are REFUSALS and write nothing.
  - **THE READ PLANNER.** The lock records the bindings, therefore the
    providers, therefore what is read: a layout naming no wiki component
    performs ZERO wiki reads. Measured cold: 346.7ms built-in → 298.2ms
    composed, which crosses Claude Code's 300ms cancel line. **The provider is
    derived from the BINDING, not the cost** — `branch` and `wiki` are both
    `scan` and are two reads on two clocks. Per-provider TTLs; the ONE seam
    (`ORC_STATUSLINE_SCAN_MS`) still overrides all of them.
  - **EIGHT REFUSALS, each with the measurement**, and three of them are the
    interesting half: `wiki-coverage`, `wiki-worst` and `wiki-blindspot` were
    reading fields `wiki-meta.json` does not have. It holds `docs[]` with a
    filename and a commit and nothing else — coverage needs `git ls-files`, and
    the other two need a `git rev-list` PER DOCUMENT because freshness is
    coverage-relative. **The contract lint caught it**, and reading a field that
    is not there would have rendered a confident number nobody measured.
  - **R1–R4 are TESTED, not aspired to.** Every shipped glyph single-cell (no
    fullwidth form, bare emoji or combining mark); `NO_COLOR` emits zero escape
    bytes for every preset; `ORC_STATUSLINE_ASCII=1` emits no byte above ASCII
    for every preset; no two states of a component render the same bytes
    without colour — which is why a bare `dot` is REFUSED and `shape` is the
    honest version of it. `blink` is refused outright.
  - **THE HOOK'S SIX-RUNG GATE LADDER**, every rung a FALLBACK and none a
    throw, and **each records itself** in `statusline-state.json`: a status line
    that quietly went back to the default and never said why is a bug the user
    cannot report. `orc doctor` turns that recording into a sentence, and only
    while the feature is ARMED.
  - **A GROUP** holds 2–4 and counts as ONE slot (the limit is about how much a
    line SAYS); it never nests and never spans two lines. **EXPAND** is its
    inverse and is how a composite becomes editable; an expand that would
    overflow a line is REFUSED with the count named.
  - **THE PANEL DERIVES NOTHING** — no component id, renderer, glyph set, ramp,
    colour token or state word, and a test greps it and both string tables. The
    shape picker is a GALLERY drawn with the component's real value, not a
    dropdown of words. A REFUSED row gets NO BUTTON AT ALL, never a disabled
    one. The illegal drop is made IMPOSSIBLE with the reason on the zone.
  - **`statusline_custom`** (default `off`) joins `SEED_EMPTY`: it is an
    operating key of a HOOK, and a hook has no lane. That is an answer.
  - **Deliberately absent:** an expression language (a predicate on this surface
    is a debugger we would then own), a shell-command component (the single
    worst idea available on a surface that redraws three times a second), a
    colour-scheme config key (the layout carries its colours), and Nerd Font
    glyphs (undetectable font, tofu without it).

- **§4z.25 — the SECOND board, and the number that was missing (v1.4.0).**
  Claude Code's `subagentStatusLine` renders a row per subagent in the agent
  panel. `templates/hooks/orc-subagent-line.js` draws it, and **reuses the
  compiler, the IR, every renderer, the glyph sets, the colour model, the
  validator and the gate ladder** — `SL_BOARDS` is a TABLE (a component set,
  three filenames, a config key), not a fork, and a test asserts there is
  exactly ONE `slCompile` and that the new hook grew no renderer of its own.
  - **A COMPONENT BELONGS TO ONE BOARD** (`board: "status" | "subagent"`) and
    the other refuses it BY NAME with the board it belongs to. One catalogue
    with a column, never two lists somebody keeps in step.
  - **A subagent row is ONE LINE by construction** — Claude Code renders one per
    task — so the three-line board and the dense-prefix rule do not apply, and
    the board table says so rather than the validator special-casing it.
  - **THE MEASUREMENT v1.2.0 SAID WAS UNAVAILABLE.** That release verified the
    TRANSCRIPT records no token usage for a dispatched subagent, and that half
    stands. The AGENT PANEL carries `tokenCount` per task plus the resolved
    `model` and `effort`, so the hook writes what it was handed into
    `.claude/orc/subagent-usage.json` and `orc usage report` reads it.
    - **IT IS A FLOOR** (`floor: true`, stored not inferred; `tokens_floor` and
      `tokens_source: "agent-panel-floor"` in the report). The hook sees a task
      only while it is in the panel: one that started and finished between two
      renders is never seen, and a count read just before an agent finished is
      short by whatever came after. `not-seen` means exactly that and **never
      `0`** — a floor reported as a total is the same lie as a zero for an
      unknown.
    - **THE RECORD RUNS WITH THE BOARD OFF.** It is not part of the display
      feature; it is a measurement handed over either way, which is why
      `orc init` wires `subagentStatusLine` regardless (non-destructively — a
      user's own is never clobbered).
    - **A count can only go UP**, so a lower reading is a stale one and never
      overwrites a higher one. Session-scoped like every other bridge here.
    - The model and effort are **OBSERVED** — a THIRD reading beside the
      name-derived expectation and the agent's own self-report, and the only
      one nobody had to be trusted for.
  - **`subagent_line_custom`** (default `off`) joins `SEED_EMPTY` for the same
    reason `statusline_custom` does: a hook has no lane. Off is Claude Code's
    own row, unchanged; every gate rung falls back to it, because that is a real
    answer and a blank is not. An empty render is never emitted — an empty
    `content` HIDES a task, which is almost never what anybody meant.

- **§4z.26 — the board you can actually use (v1.4.1).** Four defects in
  `orc ui` ▸ CLI Hook Interface, and the revamp they asked for.
  - **A STAGED CHANGE IS A SEMANTIC OP, NOT A FINISHED HTTP BODY.** Every
    `+ line N` button in the old palette computed its write's POSITION from the
    SAVED layout rather than the layout being staged, so three staged adds all
    carried position 1 — and `orc statusline set <line> <pos>` at an occupied
    position is an EDIT by design. The second write changed the first part's
    type and the third changed it again: three adds produced ONE part, and the
    five-slot cap counted the same stale layout and never fired.
    `hkPlan(show, cat)` now replays `HK_OPS` — `add · remove · move · set ·
    sep · doc`, each against a STABLE REF — and returns BOTH the effective
    board and the ordered writes, deriving every position at the moment that
    write will run. **One function, because a second idea of where a part will
    land is the Flow-stepper failure inside a single panel:** the board drew one
    arrangement and the writes made another, silently. The cap, the
    dense-prefix rule and every refusal read that effective board.
  - **ONE COMMAND PER SCOPE.** The colour-set picker shelled `statusline line 1
    --theme` (ONE line's override) while `show --json` reported `layout.theme`,
    so the button never moved and a third of the bar changed — half working,
    which is worse than not working. `orc statusline doc [--theme] [--glyphs]
    [--ansi] [--align-columns]` is the document-level writer, and it CLEARS the
    per-line overrides that would otherwise shadow the choice: a setting
    silently shadowed is the failure it exists to fix.
  - **THE PREVIEW HAD NEVER HAD COLOUR.** `orc ui` serves under
    `style-src 'self'`, which blocks a parsed `style` ATTRIBUTE outright, so
    every SGR colour `ansiBlock` computed was discarded by the browser with the
    reason only in a console nobody had open. `sgrStyle` returns an OBJECT and
    the properties are assigned through CSSOM, which is not a parse and is not
    blocked. Loosening the policy to `unsafe-inline` for a preview is not a
    trade worth making.
  - **THE BOARD IS THE ONLY PLACE ANYTHING IS APPLIED.** The palette's three
    `+ line N` buttons are gone and it is a REFERENCE — what each part shows,
    nothing else — because the act of building the bar belongs next to the bar.
    Add · Change · Move · Remove are buttons ON THE CHIP, each opening a modal
    that says what it will do; ONE part picker (search box, one click) serves
    both a new slot and a swap. **Drag is the shortcut, never the mechanism:**
    the drop edge is marked on the chip it will land beside rather than opening
    a gap that shoves every other chip while the pointer is deciding, every move
    also has a button and a keyboard equivalent, and drag is off FOR REAL below
    600px (`hkCanDrag()` matches `06-responsive.css`'s own breakpoint — a chip
    that still says `draggable` while its handle is hidden is a promise the page
    cannot keep).
  - **THE PANEL STILL DERIVES NOTHING**, so three things had to come from the
    CLI: `separators` (twelve; the separator is a dropdown now, and a value the
    layout already carries that is outside the set keeps its slot, leads the
    list and is DISABLED — the `fixed_executor` rule), `themes_about` (WHY you
    would pick a colour set), and a per-component `structural` flag (which parts
    do not eat one of the five — the panel cannot know that without a second
    idea of the catalogue).
  - **EVERY AMBIGUOUS THING NOW CARRIES ITS SENTENCE**: a description on every
    chip, picker row and reference row; an explanation under every control name
    in the editor; and the `80 / 120 / 160` buttons say they are TERMINAL WIDTHS
    IN CHARACTER CELLS. **A refusal is never a shrug** — "line 3 is full, it
    already holds 5 parts" and "put something on line 2 first" are two facts and
    stay two sentences, and a line that cannot take a part says so ONCE rather
    than on six identical disabled slots.
  - **Motion lives in `04-motion.css` and nowhere else** (the standing rule): a
    chip arrives, a chip you just staged pulses THREE times so you can find it,
    a picker row slides in as the list narrows under your typing. Every one is
    FINITE, so the reduced-motion cap leaves each at rest rather than frozen
    part-way — and the drop marker, the refusal and the staged edge are borders,
    never motion.
  - **The preview draws the SAVED layout and says so while anything is staged.**
    It renders through the hook's own engine, which reads the file; a preview of
    unsaved edits would need a second engine, which is the one thing this design
    refuses. It is also the honest answer to "I pressed Apply and nothing
    happened" — something did, and that is where it shows up.

- **§4z.27 — the reload that made editing look broken (v1.4.2).** Four more
  defects in `orc ui` ▸ CLI Hook Interface. Three of them were the SAME defect
  wearing three faces, which is why the fix is one idea rather than four
  patches.
  - **A STAGED EDIT REPAINTS AND NEVER REFETCHES.** `hkOp` called a `rerender()`
    that re-entered the router: the panel was destroyed, four endpoints were
    refetched, and everything was rebuilt from a skeleton. The visible reload is
    the least of it. **A staged change looked like an APPLIED one** — the
    picture came back different, so nothing was left to say the write had not
    happened — and **the open editor went stale**, because it stayed on screen
    while the panel behind it was replaced, so every control showed the value
    from BEFORE the change the user had just made: you picked a shape and
    nothing moved. `HK_DATA` is the last fetch, `HK_SLOT` is the node, and
    `hkPaint()` is the ONE paint, keeping the scroll position by hand.
    `hkReload()` refetches and is called ONLY where the disk actually moved
    (Apply · a preset · the reset · the switch · a board change · a recompile);
    `hkPreviewReload()` is the narrower one for a width or fixture change,
    because four endpoints for a picture is three too many. **A control that
    changes the board calls `hkPaint`; a refetch is for a write.**
  - **THE OPEN EDITOR IS REGISTERED FOR THAT REPAINT.** `HK_MODAL = {repaint}`,
    re-finding its part by the same STABLE REF `hkPlan` replays against; a part
    that has gone closes the dialog rather than editing something that no longer
    exists. Because it now rebuilds on every keystroke,
    `focusPath`/`restoreFocus` carry the caret and the selection across the
    repaint — **an editor that drops focus after one letter is not an editor** —
    and a name stages on `input` as well as `change`, which is what made a name
    typed and then clicked away from race the close and sometimes never stage.
    `partPicker`, `moveModal` and `removeModal` each null `HK_MODAL` first: they
    take over the shared `#modal-host`, and a repaint into a pane the page has
    stopped showing is a paint nobody sees.
  - **`--json is not a summary` (v0.49.1), ON `statusline show`.** It emitted
    TWELVE of the twenty-four fields a chip can carry, so `case`, `prefix`,
    `suffix`, `glyphs`, `format`, `compact`, `min_width`, `precision`, `width`,
    `min_cols`, `max_cols` and `priority` were accepted by the CLI, written
    correctly to disk, and then **invisible to the panel that wrote them**: the
    control reopened blank and the change read as having done nothing at all.
    That is the same failure shape the rule already names — both halves live in
    one function, so no lint can see it. `SL_ITEM_FIELDS` is the ONE list both
    ends use, and `authored` carries the raw item so a control can mark a value
    as the USER'S rather than inherited from the catalogue or the colour set. An
    absent LIST is `[]` and never `null`: a control that iterates a null throws,
    and a null would read as "unknown" where it means "nothing set".
  - **SIX PER LINE, AND THE CAP MOVED IN ONE PLACE.** `SL_MAX_PER_LINE` in
    `bin/cli.js` feeds the validator, `max_per_line`, `full` and the human
    `n/6`. A slot cap spelled out at five call sites is a cap that drifts on the
    first change. The limit is about READING rather than rendering — a line is
    scanned at a glance — and a structural part (spacer · divider · fill) still
    does not count, because it is not a thing the line SAYS.
  - **THE DROPDOWN NOBODY COULD READ WAS A PANEL WITH NO COLOURS.**
    `hookui.css` had been written against `--bg-sunken`, `--bg-raised`, `--fg`
    and `--fg-dim`, and **none of those tokens exist** — the real names are
    `--surface-2`, `--surface-3`, `--text`, `--text-dim`. All 34 declarations
    were silently dropped by the browser, which is why the separator select had
    no background of its own and its open list rendered near-white on
    near-white. **A native `<select>` popup is drawn by the platform and
    inherits only the half you leave to chance**, so the option rule states BOTH
    halves plus `color-scheme`. Other panels still carry undefined tokens
    (`--border`, `--surface-1`, `--r-sm`, `--r-md`, `--r-2`, `--fs-sm`,
    `--warn-line`) — same class, not fixed here.
  - **THE PREVIEW IS DRAWN AS A TERMINAL, AND THE COMPARISON IS ON REQUEST.**
    A status line in a bare grey box is a string; the same string inside a
    window of the stated width with a **column ruler** under it is a picture of
    the thing, and "44 cells" stops being a number and becomes a place on it.
    The bytes are unchanged — still `orc-statusline-render.js`, the hook's own
    engine. `orc statusline preview` gains `--theme` and `--glyphs` as a
    **RENDER-ONLY** override (the same saved layout under a different colour set
    or symbol set, applied to a COPY, **writing nothing**), and one drawer —
    *See it in other setups* — holds the three strippings, all four colour sets
    and all seven symbol sets. **Picking a colour set from its name is a guess;
    picking it from its picture is a decision.** The drawer is CLOSED by default
    and its rows are fetched on the FIRST OPEN: eleven renders nobody asked to
    see is eleven subprocesses nobody asked to pay for.
  - **THE CAP WAS IN THREE PLACES, AND THE HOOK WAS THE LAST.** Raising
    `SL_MAX_PER_LINE` in the validator left the hook's own rung-5 shape guard
    holding a hardcoded `5`, so a legal six-part line fell straight through to
    the shipped two lines with the reason recorded only in
    `statusline-state.json`. It also counted EVERY item op, which the validator
    never has, so a legal five plus a fill fell back too — and always had. A
    hook cannot call this CLI (a status line re-renders on every keystroke), so
    the cap rides on the LOCK (already gated on `orc_version` at rung 3, so a
    stale copy cannot outlive its build) and the compiler marks each structural
    item `s: 1` — the hook cannot work that out for itself, because **a compiled
    op carries an INSTANCE id and never a component type.** `orc-subagent-line.js`
    reads both too. One cap, one counting rule, three readers.
  - **A NAME YOU TYPED SOMETIMES WENT NOWHERE, AND THAT WAS TRUE AND UNSAID.**
    SEVEN of the thirty-five renderers draw a label — `plain`, `label-value`,
    `bracket`, `angle`, `badge`, `pill`, `stack` — and the other twenty-eight
    ignore it entirely. That is the DESIGN: a bar with a word in front of it is
    a different renderer. But the Name box was offered on all thirty-five, took
    the text, and the CLI wrote it to disk correctly where nothing ever read it
    back onto the bar. Same for the format controls on a bar, which lowers a
    width and a ramp and no format at all. Each renderer now publishes `uses` —
    the item fields it actually consumes, split the compiler's own way (only a
    `text`/`link` renderer lowers the FORMAT, where `case`, `prefix`, `suffix`,
    `format`, `compact`, `min_width`, `precision` and `truncate` all ride) — and
    the editor DISABLES what this shape ignores, **keeping the slot** with the
    reason and `label_renderers` naming the shapes that do. `SL_LABEL_RENDERERS`
    is a mirror of the compiler's switch, and a golden test reads that switch
    and fails on a disagreement — the `DIY_STEPS` shape.
  - **AND IT STILL BLINKED, WITH THE NETWORK TAB EMPTY.** Removing the refetch
    was half of it. `hkPaint` still replaces every child of a `.stack`, and
    `.stack > *` fades and slides each one in on a 30ms stagger, so a staged
    change still read as the page reloading — on every keystroke. `hk-quiet`
    removes the ENTRANCES from the second paint onward, and the part editor adds
    it before every rebuild. The transitions further up `04-motion.css` are
    untouched: they are about the pointer rather than about arriving. It lives
    in `04-motion.css` (the standing rule) and must load AFTER the entrances it
    switches off, which is asserted.
  - **The editor's sample is labelled for what it is.** `previews` is a
    per-renderer sample the CLI drew from its own fixture, so it shows the SHAPE
    a part will take and never the words or numbers it will carry at run time.
    It used to claim it was drawn with your changes in it, and it was not.

- **§4z.28 — the lane that RUNS the test (v1.5.0).** Every other testing surface
  in ORC WRITES tests. `/orc-test` points at a running system, sends real
  requests, writes down what came back, and stops. The split is the whole
  design: **the CLI executes and measures; the model designs and interprets.** A
  model never sends a request, and the CLI never decides what a response means.
  That is what makes the report worth reading — a number in it was measured by a
  program, and a sentence in it was written by a model that only ever saw
  evidence on disk. Canonical prose: `templates/skills/_shared/live-target.md`.
  - **THREE REGISTERED CONTRACT TOKENS, AND THEY FAIL TOGETHER**, which is why
    they are registered as a triple:
    **`a lane that reports a result it did not observe`** (three verdicts, and
    `unknown` is the honest one) ·
    **`a lane that sends traffic to a target nobody authorized`** (the target is
    frozen at `init`, a REMOTE one requires a written statement, and every
    request is fenced to one origin) ·
    **`a lane that fixes the system under test`** (it reports and hands back). A
    lane that will edit the system has already stopped needing permission to
    reach it, and one that reports what it did not observe has nothing left that
    a target's authorization was protecting.
  - **THE FREE PASS RUNS FIRST AND ALWAYS.** `orc test surface` reads the
    repository and the target's own spec document for zero model tokens, and the
    **code-vs-live diff is a first-class output derived from the two SPECS and
    from nothing else** — no route is ever probed to produce it. A route that
    answers at the target and is in no file here is OWASP API9, found for free.
    With no live spec the diff is `null` **with a reason**: an empty array there
    would read as "no shadow APIs", which is a claim nobody measured. `live:
    null` on a route means "we did not look", which is a different fact from "it
    is not there" — and only one of them is a finding.
  - **THE CASE MATRIX DERIVES ITSELF; ONLY THE GAPS COST ANYTHING.** The tiers
    come out of the schema for free. A `gap` is what a schema CANNOT know — what
    a valid email looks like in this business, which order two calls happen in —
    and that is the only part the designer agent is paid for.
    `test_case_budget` is a **PLANNED stop, not an interrupt** (the
    `wiki_refresh_budget` shape): the matrix is combinatorial, and a run that
    silently expands to four thousand cases against a staging box is a denial of
    service you wrote yourself. On reaching it the CLI **names what it did not
    expand**.
  - **THE SECURITY TIER IS A CLOSED SET.** Ten rows, the OWASP API Top 10
    (2023), never extended ad hoc — and **all ten render in every state**. A
    category ORC could not measure reports `UNCHECKABLE`, **keeps its slot**,
    carries its OWN reason, never becomes a pass, and **never raises the exit
    code**. Reporting an unmeasured category as clean is the single most
    damaging thing a security report can do, because somebody then ships on it.
    It **DETECTS and never exploits**: every probe demonstrates the CONDITION
    and stops there, because confirming an exploit is a human's decision on a
    human's authority. `full` adds the mutating probes and is **CLIPPED to
    `safe` with the clip ANNOUNCED** without `--destructive allow` and a
    recorded reason. Every cap is ORC's own, and `orc test security` reports the
    tier the cases were **DERIVED at** — a setting that has moved since is
    NAMED, not applied.
  - **THE RUNNER IS THE ONLY PLACE IN ORC THAT SENDS A REQUEST TO A SYSTEM IT
    DID NOT START**, and everything in it exists so ORC's own run is never the
    incident. **The ladder has a stop**: a red happy path makes the edge cases
    meaningless and the security tier noise, so it stops, reports and hands
    back — and every case below the stop is `unknown` WITH THE REASON, never
    left at a previous verdict, which would report a stale pass. **The pace is
    the target's**, and the CLI paces rather than suggesting. **A 429 is a
    RESULT** — it means rate limiting works, so ORC records it and backs off:
    pushing through is how a staging scan becomes a lockout. Failed auth is
    capped per identity, because account lockout would end the run and somebody's
    afternoon. **The origin fence** drops a request that would leave the frozen
    origin without sending it. **Redaction is STRUCTURAL** — every credential is
    replaced BEFORE the bytes reach disk, not in a review step afterwards, and
    ORC does not do the "last six characters" convention: a report is meant to be
    readable in a PR, and a tail is still a secret.
  - **A FINDING CITES EVIDENCE THAT RESOLVES ON DISK, OR IT IS DROPPED BY NAME
    AND COUNTED.** A model that describes a vulnerability it cannot point at does
    not get to put it in the report. **Severity is ORC's**; the interpreter's own
    word is kept as `claimed_severity` and printed beside ORC's when they
    disagree, which is what makes a disagreement visible instead of invisible. A
    CVSS vector is offered only on an OBSERVED finding — a candidate pending
    verification does not get a score. **A flake is recorded, never retried
    away**: there is no retry count in the runner, and the instability IS the
    finding.
  - **A HEALTH STATE IS NEVER STORED; THE OBSERVATION IS.** `orc test env`
    computes the state fresh on every read (the `computeWikiFreshness` rule), so
    `orc test show` reports `env.state: null` always. What the ledger keeps is
    `env.last_observed` — `{state, at}` — a fact about the PAST, which does not
    go stale, it only gets older. **Every surface that renders it says WHEN**, and
    none renders it as the state now. That is what lets `orc doctor` say
    something true about an environment without sending a request of its own.
  - **`orc test show` IS A READ IN THE STRICT SENSE** — it re-scans nothing,
    probes nothing and writes nothing — and it is the whole computed view
    (`--json is not a summary`). It exists because the panel needed one: opening
    a page must never be a measurement, since **a measurement nobody asked for is
    traffic nobody authorized**.
  - **THE FRONT-END HALF DRIVES PLAYWRIGHT AS A SCRIPT, NOT AS AN AGENT LOOP.** A
    step an LLM took is not a step you can re-run. A journey is a script on disk
    and an ordinary `kind: "ui"` case row the BE runner never touches;
    `retries: 0` in the generated config; a replayed run produces NO results at
    all; the storage state is written only after the DECLARED assertion passes,
    and a failed login is itself the FIRST finding. **ORC NAMES the install
    command and never runs it** — it does not install into somebody else's
    project — and `no_install_alternative: null` MEANS there is none, not that
    ORC forgot to look. On a REMOTE target a failing `data-testid` is a **BUILD
    MISMATCH before it is a defect**.
  - **`orc ui` ▸ Test has the tightest action boundary of any panel.** Five tabs
    rendering the CLI and deriving nothing. **A free action gets a button**
    (`surface`, `env`, `report`); **`orc test run` gets a copy-able command and
    will never be a button** — it costs zero model tokens, so the usual free/paid
    line would make it one, and the TRAFFIC line makes it a command instead: a
    page that can start a scan against a live host is a page that can start one
    by accident. The panel renders an evidence **PATH and never a BODY**, and
    there is no route that could stream one.
  - **FIVE CONFIG KEYS, AND FIVE REFUSED.** `test_gate` (`warn`, no `block` —
    the payoff is knowing) · `test_security_tier` · `test_max_rps` ·
    `test_case_budget` · `test_ui_driver`. Refused, with the reasons written down
    in `_shared/live-target.md` so nobody proposes them again: `test_auto_fix`
    (the lane's premise, inverted), `test_destructive` (a permission must be per
    run, for that target, with a recorded reason), `test_target_url` (a stored
    default target is how a scan reaches the wrong host), `test_retries` (a flake
    is recorded, never retried away) and `test_skip_auth_probe` (a switch on a
    check is a switch that turns off the check people most need).
  - **TWO AGENTS, AND BOTH ARE INSTRUMENTS.** The designer is `high` because the
    cheap answer is the list the CLI already derived for free. The interpreter is
    **`low` and nothing may ever upgrade it** (the `/orc-challenge` cold-reader
    reasoning), its slice is SEALED to evidence paths and case rows, and it has
    **no `orc extra` slot at all** — captured response bodies are the most
    sensitive payload ORC composes, and `declared_files` fences FILES, not a
    request body.
  - **`orc doctor` gains four findings, all read off the LEDGER** —
    `test-env-unhealthy` · `test-run-red` · `test-unchecked-owasp` ·
    `test-evidence-unstaged` — because a read-only report that probes somebody's
    staging box because they opened it is the second contract token, broken by
    the report about it. `test-unchecked-owasp` is RESTRAINED to a run with a
    REPORT on disk: an unchecked row is the NORMAL state of a run in progress,
    and a doctor that warns about a normal state is a doctor people learn to
    ignore (the `wiki-debt` rule). All four route to the Test panel.
  - **THE RUN FOLDER IS NEVER STAGED.** `orc/orc-test/<slug>/` holds real
    response bodies from a real system — the most sensitive thing ORC writes to
    disk — and **ORC does not edit your `.gitignore`**, so the only thing it can
    do is say so, which `orc doctor` does using git's own answer rather than a
    second `.gitignore` parser.
  - **A defect found while writing the tests, and it was not in this lane.**
    `api.js` fixed the 64 KiB Windows-loopback cliff for JSON in an earlier
    release; the STATIC path kept a comment reading *"No asset is over 64 KiB
    today"* which had been FALSE for two releases — `js/panels/extra.js` is
    138 KB and `js/panels/hookui.js` is 76 KB, and both went out uncompressed.
    The visible symptom was an intermittent ECONNRESET in the asset-walk test;
    the invisible one is a real browser receiving a panel script that stops
    mid-function. `encodeBody()` is now ONE implementation in `api.js` that
    both paths call. **A stale comment can guard a live bug for longer than the
    bug would have survived on its own.**

- **`templates/hooks/orc-trace.js`** — a `PreToolUse` (matcher `Task|Agent` —
  v0.23.0; newer Claude Code dispatches subagents via the `Agent` tool, and a
  Task-only matcher silently kills SPAWN) + `SubagentStop` hook, the
  deterministic BACKBONE of behavior-trace logging (§4b).
  Always on (logging is permanent). On the first `orc`-prefixed agent dispatch it
  bootstraps `log_dir` + the `.current` run-pointer itself, then appends
  `SPAWN <agent>` / `RETURN` skeleton lines to the pointed `.txt` — so a trace is
  guaranteed every run. The pointer is a lease, not a lifetime (v0.23.0): a
  trace idle >6h is a FINISHED run — the next dispatch rotates to a fresh
  `.txt`, and a RETURN is written only while `RETURN`-count < `SPAWN`-count in
  the live file (stray SubagentStops from other sessions can never bleed in).
  Never traces non-ORC Tasks (the SPAWN gate matches only
  agent names starting with `orc`). Intentionally blind to the dispatched model
  (hooks can't see it); the
  claimed-vs-actual model check is the orchestrator's job from each agent's
  `actual_model` return. Always exits 0 (tracing never blocks a run).
- **`templates/hooks/orc-update-lib.js`** — shared update-check helper both hooks
  require. Compares the installed version (stamped at install into
  `.claude/hooks/orc-version.json`) against the latest (source's main
  `package.json`, cached 24h in `~/.orc-update-check.json`). The PreToolUse guard
  refreshes the cache + emits a `systemMessage` nudge when `/orc` is invoked; the
  statusline reads the cache only. Zero model tokens; fail-silent; opt out with
  `ORC_NO_UPDATE_CHECK=1`. (Mirrors the CLI's own update-check — documented drift.)
- **SKILL.md preflight gate** — a soft self-check: the orchestrator STOPs at
  startup if it can tell it is not Opus 4.8 (covers the model dimension a hook
  can't).

**Installer merge (`installGuards` in `cli.js`) is non-destructive:** copies the
hook scripts to `.claude/hooks/`; adds the `PreToolUse` guard once (idempotent —
refreshes its path on `update`, never duplicates, preserves unrelated hooks);
sets `statusLine` ONLY if the user has none (else skips and prints the snippet);
wires the trace hook into `PreToolUse` (matcher `Task|Agent`) + `SubagentStop`
idempotently (dedup by `command.includes("orc-trace")`; `update` also repairs a
stale pre-v0.23.0 `Task`-only matcher); refuses to touch a
`settings.json` that isn't valid JSON. Commands use an absolute path with forward
slashes (`node "<...>/orc-effort-guard.js"`) to stay cross-platform and dodge
shell/env-var quoting.

## 4r. Quality-of-life pass — tier awareness, single scoring table, Fable 5 override, config coverage, onboarding (v0.30.0)

One release across the guards, scoring, config, DIY, and CLI. See §4a for the
guard/statusline changes.

**Session-tier acceptance matrix (the "ORC-ready" rule):**
| Model | Allowed efforts | Verdict |
|-------|-----------------|---------|
| claude-opus-4-8 | high | ✅ ORC-ready (baseline) |
| claude-opus-4-8 | xhigh, max | 🚀 ORC-boosted |
| claude-opus-5 | medium, high, xhigh, max | 🚀 ORC-boosted (v0.34.0) |
| claude-fable-5 | medium, high, xhigh, max | 🚀 ORC-boosted |
| anything else / below | — | ⛔ ORC WILL DEGRADE |

Effort ladder everywhere: `low < medium < high < xhigh < max`. The guard grants
the Opus 5 / Fable 5 `medium` via the session-model bridge (statusline-written,
guard-read, fail-open); the statusline verdict is model+effort with leniency on
unknowns.

1. **Single 8-band score→model table.** The narrow/wide presets are REMOVED —
   one canonical table in `config.md`, used regardless of `rubric_bands`
   (granularity only now). Bands: `haiku-4-5` [0,30) · `sonnet-4-6-med` [30,40) ·
   `sonnet-4-6-high` [40,55) · `sonnet-5-high` [55,65) · `opus-4-7-med` [65,70) ·
   `opus-4-7-high` [70,80) · `opus-4-8-med` [80,85) · `opus-4-8-high` [85,100]
   (**the top two bands were replaced in v0.34.0** — see §4u).
   **Two NEW generated executors** (`orc-executor-haiku-4-5` — no effort ladder,
   the generator omits the `effort:` frontmatter line; `orc-executor-opus-4-8-med`,
   itself retired in v0.34.0) bring the roster to 8. `build-agents.js` uses `{{EFFORT_FM}}`/`{{EFFORT_DESC}}`
   placeholders so `effort: null` renders an effort-less agent. The rubric now
   DEMANDS a visible `base + adjusters = final` and a cited adjuster for any
   [55,70) score (anti-inflation — stops the reflexive 60), plus mid-band worked
   anchors (35/45/58) and haiku-band guidance. `KNOWN_MODELS` + the DIY roster
   gain `claude-haiku-4-5` and `claude-fable-5`; the count floor is ≥28 (real 29).
2. **Fable 5 role override (HARD-GATED).** Config keys `fable5_enabled` (false),
   `fable5_effort` (medium|high|xhigh|max), `fable5_roles` (subset of
   `analyze, plan, advisor, judge, review`, CSV → flow-array). Nothing changes
   unless `fable5_enabled: true`. Then each listed role dispatches its pinned
   `orc-<role>-fable-5` agent (full-body copies of the counterparts, model
   `claude-fable-5`) INSTEAD of the default — advisor/judge are ultra-lane only.
   The canonical dispatch rule is `_shared/fable5-override.md` (lint token
   `fable5-override.md`). **Effort is written by the CLI:** `orc config set
   fable5_effort X` rewrites the `effort:` frontmatter of the installed
   `orc-*-fable-5.md` copies (`applyFable5Effort`) — the skill never edits agents.
   Enabled with empty roles = no effect (CLI warns). The 5 fable agents are
   registered in every contract their counterparts carry.
3. **Config that really works (C.3).** A **config-key coverage lint** in
   `verify-contracts.js`: every `CONFIG_META` key in `cli.js` must be referenced
   under `templates/skills/**` (no decorative keys), and every `config.<key>` a
   skill references must be a real CLI key (file extensions + `rubric_bands_override`
   allowlisted). A Phase-1 **`CONFIG` trace verb** emits the resolved values the
   run consumes (incl. `fable5_*`) so `/orc-retro` can audit config honoring.
4. **DIY full session-tier grid (C.5).** `session_tier` expands from 3 slugs to
   `sonnet-4-6-{med,high}` · `opus-4-7-{med,high}` · `opus-4-8-{med,high,xhigh,max}`
   · `fable-5-{med,high,xhigh,max}` (v0.34.0 adds `opus-5-{med,high,xhigh,max}`).
   `DIY_TIERS`/`DIY_EXECUTORS` re-ranked (haiku 1 … opus-4-8 5, opus-5 6,
   fable-5 7 — v0.34.0; effort med 1 … max 4). The DIY score presets
   collapse to the single 8-band `DIY_SCORE_TABLE`, still clipped to the tier at
   compile. The guard derives the effort from the slug (that effort or stronger);
   the statusline keys the model-half warning by the slug's model part.
5. **`orc upgrade` tarball-first + remember-what-worked (A.2).** Order is
   last-good-spec (cached in `~/.orc-update-check.json`) → tarball (straight
   HTTPS) → `github:` (shells out to git, fails on restricted git). `--from` /
   `ORC_INSTALL_SPEC` still win outright. Probes run with captured stdio — npm's
   error wall shows only if EVERY spec fails; the winner is remembered.
6. **`orc onboarding` + `bin/ui.js` (D).** A new command — the full in-terminal
   walkthrough (8 sections in `bin/onboarding-content.js`: overview, install,
   first-run, lanes, config, knowledge, upgrade, troubleshooting): a numbered menu
   on a TTY, prints everything when piped (a model can read it in one shot);
   `orc onboarding <topic>` jumps straight in. Wired from `orc init`/`update` +
   `orc help`. `bin/ui.js` is a zero-dep terminal UI kit — color ONLY on a TTY
   with `NO_COLOR` unset (piped output stays byte-identical, so tests + machine
   callers are unaffected), ASCII glyph fallback for legacy consoles, aligned
   kv/box/header helpers — applied to `doctor`, `config`, and onboarding.

Also: the two historical Tessl-named changelog titles were reworded and the
Tessl review section/badge removed (README + one knowledge.md line). The
SKILL.md spine budget was deliberately raised 350→360 for the scoring/CONFIG/
fable pointer additions.

Files touched: `bin/{cli,build-agents,verify-package,verify-contracts,ui,
onboarding-content}.js`, `agents-src/executor.template.md`, `templates/agents/**`
(2 new executors + 5 fable agents + MODEL-MAPPING), `templates/hooks/{orc-effort-
guard,orc-statusline}.js`, `templates/skills/orc/{SKILL.md,config.md,references/
effort-and-mode.md,references/trace-protocol.md,references/ultra-mode.md}`,
`templates/skills/_shared/fable5-override.md`, `templates/skills/orc-diy/**`,
`package.json`, `README.md`, `test/**`.

---

## 4v. `opus5_only` — one forcing Opus-5 dispatch mode (v0.35.0 → widened v0.36.0)

Shipped in v0.35.0 as `opus5_executor_only` (the executor table alone) and
widened in v0.36.0 to EVERY dispatched role. **Default `false`; nothing changes
until set.** The v0.35.0 design notes below still describe the executor half
verbatim — read §4v.1 for what v0.36.0 changed on top of them.

**What it is.** One boolean config key that replaces the 8-band mixed-model
executor table with three Opus 5 bands where EFFORT is the cost dial:
`[0,40)` low · `[40,80)` medium · `[80,100]` high. Two new GENERATED executors
(`orc-executor-opus-5-{low,med}` — the existing `-high` serves the top band in
both tables); `opus-5` + `low` was already proven shippable by
`orc-learn-writer-opus-5-low`, so no new effort semantics are introduced.

**The band edges.** The request said *"0–30 low, 40–80 medium, 80–100 high"*,
which leaves 30–40 unassigned and gives 80 to two bands. Every existing row is
half-open with a single closed top, so the faithful contiguous reading is
`[0,40)` / `[40,80)` / `[80,100]` — which moves today's `[30,40)` band
(sonnet-4-6-med) into LOW rather than medium. A test asserts contiguity and the
six edge scores, because a half-open table is exactly where this goes wrong.

**Resolution — highest wins:** `rubric_bands_override` (hand-written rows; the
user's explicit table always wins, and it is deliberately registry-less — not a
phantom key) → `opus5_executor_only` → the default 8-band table. Implemented as
a NAMED PRESET resolving to the same shape the override already produces, not a
second parallel mechanism, so every downstream consumer (scoring display, `SCORE`
trace, preflight) already handles it and the two can never disagree about what
"the resolved table" means.

**Four interactions pinned, because each is a place the preset could silently
contradict an existing rule:**
1. **The risk floor still applies** — it raises the SCORE, then the resolved
   table maps it. A floored task lands `opus-5-med`, not `opus-4-7-high`.
2. **Ultra's tier floor raises EFFORT, not model** — with every band already
   Opus 5 there is nothing to raise model-wise, so `[0,40)` goes low → medium.
   Today's floor text reasons entirely in model names and was undefined here.
3. **`fable5_roles` never covers executors** (analyze/plan/advisor/judge/review),
   so the two features are orthogonal.
4. **Scope is the lanes that SCORE** — full orc + ultra. orc-mini/orc-fast
   dispatch fixed executors and never score; forcing Opus 5 into orc-fast would
   contradict that lane's reason to exist. orc-diy's table is compile-owned and
   reads only `orc-diy.config.yaml` — making it read `orc.config.yaml` would
   break the lane's central invariant, so a DIY equivalent belongs as a flow key.

**Risk, stated plainly: universal downgrade exposure.** One band in eight needs
an Opus 5 session today; with this on, all of them do, and a hook cannot block on
model. The set-time notice (rationale + resolved table + the tier requirement) is
the only place a user reliably learns this, which is why it prints rather than
living in a `desc` only `config list` shows.

**The efficiency claim is external and not yet testable here** — the trace corpus
holds no cost or latency data. That is why `CONFIG` always records
`opus5_executor_only` and the preflight/scoring table name the resolved ladder:
it makes `/orc-retro` able to segment per-band outcomes BY scoring mode and
eventually measure the claim on real runs.

Agent count 31 → 33 (three plans in this batch moved it: the 7 newly-guarded
files, the wiki scanner, and these two executors — the floor is reconciled once,
here, as the last to land).

### 4v.1 Widened to every role, and made FORCING (v0.36.0)

v0.35.0's key was executor-only, which left the honest oddity that a run could
be "Opus-5-only" while its analyst, scouts, wiki scanner and pattern codifier
ran on three other model classes. v0.36.0 makes the key mean what its name
says.

**Renamed `opus5_executor_only` → `opus5_only`,** with the old name resolved as
a deprecated alias (`LEGACY_KEYS` in `bin/cli.js`, applied on read AND on set).
A renamed key is a silent revert if you skip this: the old line survives in
`orc.config.yaml`, nothing reads it, and the user's setting quietly stops
applying. The alias is deliberately NOT in `CONFIG_META` — the config-key
coverage lint requires every CONFIG_META key to be referenced under
`templates/skills/`, and a retired name is referenced nowhere by design.

**Nine fixed roles now flip** (the effort is pinned per role — unlike
`fable5_effort`, no CLI rewrites these):

| Role | Default | Forced |
|------|---------|--------|
| mini executor | `orc-executor-sonnet-5-high` | `orc-executor-opus-5-low` |
| fast executor | `orc-executor-sonnet-4-6-high` | `orc-executor-opus-5-low` |
| mini analyze | `orc-analyze-mini-sonnet-5-high` | `orc-analyze-mini-opus-5-med` |
| mini plan | `orc-planner-mini-sonnet-5-high` | `orc-planner-mini-opus-5-med` |
| scout | `orc-scout-sonnet-4-6-high` | `orc-scout-opus-5-low` |
| pattern codify | `orc-pattern-codifier-sonnet-5-high` | `orc-pattern-codifier-opus-5-med` |
| wiki scan | `orc-wiki-scanner-opus-4-8-high` | `orc-wiki-scanner-opus-5-med` |
| claude write | `orc-claude-writer-opus-4-8-high` | `orc-claude-writer-opus-5-med` |
| retro mine | `orc-retro-sonnet-5-high` | `orc-retro-opus-5-med` |

**Both halves of every pair SHIP (7 new agent files, count 33 → 40).** The mode
is a runtime toggle and an agent's model change is always a RENAME (traces
derive `expect=<model>/<effort>` from the agent NAME), so there is no way to
express this as an in-place edit — the same reason the `fable-5` variants exist
as files. A test asserts each variant's name, `model:` and `effort:` agree with
each other.

**Precedence inverted, on purpose.** v0.35.0 had `rubric_bands_override` win
over the preset. v0.36.0's key FORCES: while on it outranks BOTH a hand-written
`rubric_bands_override` and the entire `fable5_*` block. A forcing switch that
something else can quietly beat is not a forcing switch — but a setting the run
then ignores must be SAID, so `orc config set` reports every shadowed key, and
`orc config list` marks the Fable 5 tier and a hand-written table `INERT`.

**Two exclusions, both deliberate:**
1. `orc-trace-writer-haiku-4-5` stays Haiku. It transcribes a packet it is
   handed — no reasoning, no source reads. Paying Opus 5 rates for a
   transcription buys nothing.
2. **orc-diy is untouched.** Its executors come from `flow.lock.json`, which only
   `orc diy compile` writes; making that lane read `orc.config.yaml` would break
   its central invariant (shape is compiled, never configured in-session).

**Where the cost actually lands.** Two multipliers dominate and are called out
at their dispatch sites, not just in aggregate: **scouts** fan out up to
`max_scouts` in parallel per deep analysis, and the **wiki scanner** runs one
dispatch per scan-task across a whole repo. Everything else in the table is a
single dispatch per run.

**One premise this breaks:** orc-fast's "the orchestrator runs fine at Sonnet
medium" is true only while the mode is OFF. The effort guard is unchanged — it
still matches the exact skill name `orc`, and orc-fast is never added to it —
but the lane's MODEL premise moves, so the claim is now stated conditionally in
`orc-fast/SKILL.md`.

**Contract + lint.** The canonical prose is
`templates/skills/_shared/opus5-only.md` (lint token `opus5-only.md`, pinned
into all 15 consuming files); the key itself is a second entry with
`binFiles: ["bin/cli.js"]`, so a rename on either side fails. Documented drift
the token lint cannot see: the role table exists in BOTH `OPUS5_ONLY_ROLES`
(cli.js, for the set-time notice) and the shared contract (what a run reads) —
a golden test compares them row by row.

---

## 4u. Opus 5 — top scoring band, core role agents, medium-effort session tier (v0.34.0)

Claude Opus 5 lands on all THREE halves of the tier system: the score→model
ceiling, the fixed-role agents, and the session-tier guard.

1. **Score→model table: a new ceiling, and the [80,90) band consolidates.** The
   canonical 8-band table (`skills/orc/config.md`, mirrored in
   `MODEL-MAPPING.md`, `references/effort-and-mode.md`, `build-agents.js`
   VARIANTS, and `DIY_SCORE_TABLE` in `cli.js` — all five change together) now
   ends `… opus-4-7-high [70,80) · opus-4-8-high [80,90) · opus-5-high [90,100]`.
   `orc-executor-opus-4-8-med` is RETIRED (its [80,85) band folded up into Opus
   4.8 **high**) and `orc-executor-opus-5-high` (claude-opus-5, high) is
   generated in its place — the roster stays at 8 executors / 30 agent files.
   The retired file is pruned by `orc update` through the install manifest (§4q);
   the contract-lint file sets in `verify-contracts.js` swap the same name.
2. **Core fixed roles re-pinned to `claude-opus-5` — and RENAMED.** The agent
   NAME is the contract (traces derive `expect=<model>/<effort>` from it), so a
   model change is always a rename. Effort is per-role, chosen for the job:

   | Role | Was | Now |
   |------|-----|-----|
   | System Analyst | `orc-system-analyst-opus-4-8-high` | `orc-system-analyst-opus-5-high` |
   | Planner | `orc-planner-opus-4-8-med` | `orc-planner-opus-5-med` |
   | Reviewer | `orc-reviewer-opus-4-8-high` | `orc-reviewer-opus-5-med` |
   | Verifier | `orc-verifier-opus-4-8-high` | `orc-verifier-opus-5-med` |
   | Test Author | `orc-test-author-opus-4-8-high` | `orc-test-author-opus-5-med` |
   | Context Combiner | `orc-context-combiner-opus-4-8-high` | `orc-context-combiner-opus-5-high` |
   | Learn Writer | `orc-learn-writer-opus-4-8-high` | `orc-learn-writer-opus-5-low` |
   | Ultra Advisor | `orc-advisor-opus-4-8-max` | `orc-advisor-opus-5-xhigh` |
   | Ultra Judge | `orc-judge-opus-4-8-max` | `orc-judge-opus-5-xhigh` |

   UNCHANGED: mini analyst/planner (Sonnet 5 high), scout (Sonnet 4.6 high),
   pattern codifier + retro miner (Sonnet 5 high), trace writer (Haiku 4.5),
   `orc-claude-writer-opus-4-8-high`. Renames ripple through
   `verify-package.js`'s named list, every `verify-contracts.js` file set, the
   fixed-role tables (`config.md`, `MODEL-MAPPING.md`), `fable5-override.md`'s
   Replaces column, each lane's prose + mock traces (`expect=opus-5/low` in
   orc-learn), and the hook tests; old filenames are pruned by `orc update`.
   `diyValidate`'s reviewer/verifier tier warning moved from `model < 5` to
   `model < 6`.
3. **Session tier: Opus 5 clears `/orc` from medium up.** `orc-effort-guard.js`
   generalizes Fable 5's allowance to `isMediumOkModel` —
   `(opus|fable)[\s._-]?5\b` — so Opus 5 and Fable 5 both pass at medium…max
   while Opus 4.8/4.7 still need `high`+. Same mechanics as before: the model id
   comes from the statusline's session-model bridge, fail-open (missing/stale →
   medium stays blocked), and the block message reads "Opus 4.8 at high effort
   (Opus 5 / Fable 5 also clear at medium+)". The statusline verdict follows
   (Opus 5 medium…max = `🚀 ORC-boosted`, below medium = DEGRADE), the DIY tier
   grid gains `opus-5-{med,high,xhigh,max}`, and `KNOWN_MODELS` gains
   `claude-opus-5`.

**The cost-tier rule still binds and is deliberately visible.** A subagent can
never outrank the main session, so the [90,100] band AND every Opus-5 role agent
only actually run Opus 5 on an Opus 5 session — on Opus 4.8 they silently fall
back and the tier-honesty rule (`actual_model` on every return) reports the
downgrade. This is the practical reason to run the main session on Opus 5 now:
before v0.34.0 an Opus 4.8 session matched every pinned role exactly; it no
longer does. DIY makes the same
truth deterministic at COMPILE time: `agentFitsTier` clips the top row to
`orc-executor-opus-4-8-high` under an opus-4-8 `session_tier`. Ranks are now
haiku 1 … opus-4-8 5, **opus-5 6, fable-5 7** (fable-5 stays above every
executor, so a fable-5 tier still clips nothing).

Tests: guard — opus-5 bridge at medium allows, opus-4-8 bridge at medium still
blocks; statusline — opus-5 medium/max boosted, low degrades, opus-4-7 never
matches the opus-5 regex; CLI — opus-4-8 tier clips the top band, opus-5 tier
keeps it.

Files: `templates/hooks/{orc-effort-guard.js,orc-statusline.js}`,
`bin/{build-agents.js,cli.js,verify-contracts.js,verify-package.js,onboarding-content.js}`,
`templates/agents/` (9 role renames + `orc-executor-opus-5-high.md` − 
`orc-executor-opus-4-8-med.md`, `MODEL-MAPPING.md`, the 5 fable-5 variants),
`templates/skills/` (orc spine/config/effort-and-mode/ultra-mode/planner +
review-verify + testgen subskills, orc-analyze, orc-verify, orc-learn,
orc-mini, orc-diy, context-combiner, `_shared/fable5-override.md`, mocks),
`templates/commands/{orc-verify,orc-ultra}.md`, `test/{cli,hooks}.test.js`,
`README.md`, `package.json`.

---

### 4w `/orc-quick` — the standalone quick lane (v0.38.0)

**What it is.** The first ORC lane that **loops**. Every other lane is one-shot:
run → ship → done. orc-quick stays resident: you ask, it answers, and the next
request becomes entry 2 in the same document. It is a **standalone
orchestrator** — not reachable from the `/orc` pipeline, sharing no phase
numbering with it, and immune to every dispatch-forcing config key.

**Three steps per request.** `Q0` preflight (once per session, silent) then
`Q1 LOOK` (silent) → `Q2 ASK` (one user turn) → `Q3 DO`. Against `/orc` (8),
`/orc-mini` (5), `/orc-fast` (6). The compression that buys it: **clarification
and the dispatch gate are the SAME user turn.** A normal request is: look → ask
once → do → record.

**Open-ended by design.** There is no closed request taxonomy — the documented
examples are worked examples, not a list to match against. A code change, a fast
context dig, a defect hunt, a dependency bump, a "is this safe to run" question,
or resolving PR review comments all route identically: classify read-only vs
writing → choose what to dispatch → **gate it** → dispatch → validate the return
→ append a numbered doc entry. There is no unsupported request; only one that is
too big, which **offers** `/orc-mini` (never forces it, unlike orc-fast).

**Context discipline: locate, don't understand.** The orchestrator reads to FIND
files (inline, capped at 12) and dispatches anything requiring comprehension.
That is what keeps the main session small — the stated purpose of a lane that
dispatches subagents.

**The dispatch gate is the lane's entire premise.** It asks WHICH AGENT before
EVERY dispatch — recon, executor, and reviewer alike. Never a default, never
sticky, never carried across entries. Pre-supplying the answer in the prompt
SATISFIES it (echoed in one line); nothing else does. The only inheritance is
build-repair rounds 1–2 within one entry, and round 3 re-gates so the user can
escalate before the loop gives up.

| Dispatch kind | Offered | Hook-traced | Downgrade check |
|---|---|---|---|
| writes code | `orc-executor-sonnet-4-6-med` · `orc-executor-opus-5-low` | ✅ | ✅ |
| read-only recon | **`orc-recon-sonnet-4-6-med` · `orc-recon-opus-5-low`** (v1.9.0) · or `other — name a model` | ✅ · ✅ · ❌ | ✅ |
| review | `orc-reviewer-opus-5-med` · or ad-hoc | ✅ / ❌ | ✅ |

**Nothing overrides it.** `opus5_only`, `fable5_enabled`/`fable5_roles`, and
`rubric_bands_override` are all INERT. This is the **one exception to
`opus5_only`'s otherwise flat precedence** — a forcing mode that collapsed the
menu to a single option would silently delete the gate, which is the whole lane.
The carve-out is registered in BOTH `_shared/opus5-only.md` and
`_shared/fable5-override.md`, and the lane ANNOUNCES it at the gate
(`orc-quick ignores opus5_only — both options are live`), because a shadowed
setting must never be silent in either direction.

**No smoke gate — two asymmetric rules.** Build and tests run once,
automatically, after every code-writing dispatch (including each repair round);
a read-only entry runs neither, and a missing build/test tool is skipped
silently and never invented.
- **Build RED → repair loop**, cap 3. Rounds 1–2 inherit the executor; round 3
  re-gates. Still red → ask, showing the **error trend** (`14 → 6 → 4 → 2`), not
  just "still red" — the trend is what makes "3 more rounds" a rational choice
  rather than a gamble. Each new batch repeats the shape: 2 inherited + 1
  re-gated. Every round lands in the entry's dispatch table.
- **Tests RED → block the commit offer, never loop.** A failing test is
  sometimes the TEST being wrong, and a loop would "fix" that by breaking the
  implementation. The user decides.
- **No test suite → no check at all.** A deliberate departure from every other
  lane's smoke gate; raised during design and reaffirmed.

**It never reverts.** A stop-while-red states what is modified and prints the
`git checkout -- .` command. Undoing is always the user's choice.

**The artifact.** `orc-quick/<slug>/quick-context.md` at the PROJECT ROOT
(alongside `test-generator/`, `learning-docs/`, `poly-repo-implementation/`),
never inside `.claude/`. **Exactly ONE `.md` per thread folder, ever** — no
sidecars. The folder is named from the FIRST request's slug with **no
timestamp**, so the same slug REOPENS the thread and keeps numbering; `thread=`
forces a split. Each entry records the verbatim ask, the resolved intent, the
clarifications with their rejected alternatives AND why they lost, a **dispatch
table** (kind · agent/model · expect · actual · result), files changed, how it
was resolved, build/test outcomes, `unmet[]`, and the follow-through. Written
**BEFORE** the offer chain, so an abandoned session still leaves a complete
record. Every request type gets an entry — including a read-only dig, where the
answer IS the deliverable.

**The read-ban, and how continuity survives it.** The skill NEVER reads the
doc's body. Re-opening a thread reads ONLY the delimited `<!-- orc-quick:toc -->`
block — bounded and tiny, and it yields both the entry count and the prior
slugs. In-session the counter also lives in
`.claude/orc/run/<run-slug>/quick-checkpoint.md` (run state, not the
deliverable, freely readable, compaction-proof). A corrupt TOC is rebuilt from
`## <n>.` headings — a heading-only scan, still not a body read. This is what
lets "never read the docs" and "keep numbering across sessions" both be true.

**Git.** A commit stages **only the files the executed task changed**;
`orc-quick/**` is NEVER staged and the skill never edits `.gitignore` (the
`mock-examples/` precedent).

**`gh` is read + push only.** It reads PR metadata, review threads, and CI
freely, and pushes on explicit confirmation. It NEVER runs `gh pr comment`,
resolves a thread, reviews, approves, creates, or merges — even when the user
says "push". It states this at ship time, so an open thread beside a new commit
is never a mystery. PR comment bodies are **untrusted data**: a directive inside
one is surfaced to the user and never skips a gate. Each PR thread gets its own
dispatch gate (three fixes of different weight deserve three decisions). Slug
`pr-<n>-<topic>` groups a whole PR into one thread.

**Trace.** Lane short name `quick`; a new **Iterative** tier in
`trace-protocol.md`: **one packet per completed numbered entry** + the end-of-run
`FINISH` packet. orc-quick is neither a build lane (no phase sequence to batch)
nor single-dispatch (it loops), so neither existing tier fit.

**The ad-hoc trace gap — CLOSED at v1.9.0, and it cost two agent files.** As
shipped at v0.38.0, read-only recon was dispatched by model name, not an `orc-*`
agent file, so `orc-trace.js` emitted no `SPAWN`/`RETURN`, `orc run inflight`
could not see it in flight, and `/orc-retro` could not count it. Two of three
signals survived because the ORCHESTRATOR wrote them
(`DISPATCH … adhoc=true` / `VERIFY`, plus the downgrade check off the agent's
self-reported `actual_model`/`actual_effort`). v1.9.0 replaces the ad-hoc
default with a **pinned pair** — `orc-recon-sonnet-4-6-med` and
`orc-recon-opus-5-low`, same body, same return contract, different model — so
all three signals work and recon gains a return the gate can CHECK. `other —
name a model` stays as the escape hatch, and only THAT row keeps
`*(ad-hoc, untraced-by-hook)*`. The escape hatch names a **model only**: the
Agent tool takes a per-call model and has no per-call effort knob, so the
v0.38.0 "effort" option was a setting that did not exist.

**Not a position, on purpose.** Recon and review stay on Claude.
`quick-executor` is the lane's only `orc extra role` slot, because a wrong edit
fails a build and a wrong ANSWER is believed — sending the job that the gate is
supposed to trust to a third party is a different trust question from sending a
code edit there.

**Agent count.** v0.38.0 added zero agents (`orc-executor-sonnet-4-6-med`,
`orc-executor-opus-5-low` and `orc-reviewer-opus-5-med` all shipped already) and
took the skill floor 25 → 26 with the agent floor unchanged at 40. v1.9.0 adds
the recon pair and takes the agent floor 48 → 50.

**Wording rule.** Every file under `templates/skills/orc-quick/` is written in
**simple English for non-native readers** — short sentences, common words, no
jargon beyond ORC's own terms. This applies to the skill payload only, not to
`knowledge.md`, `CLAUDE.md`, or the root `README.md`.

**v1.9.0 — what quick learned.** Four changes, each with one owner file.

1. **The dig asks the GRAPH first** (`references/look.md`). `ctx` when the
   request names a file or a symbol; `map --focus` when it names none;
   `ctx --depth 2` + `coverage` for a blast-radius question; Grep only for what
   the graph does not know. **It may never name `orc graph impact`** —
   `bin/verify-contracts.js` derives a lane's call set by scanning its WHOLE
   skill folder for `orc <noun> <verb>`, and quick deliberately has no
   `graph-impact` row (no planner, no declared-file set before the gate). The
   recon AGENT calls `impact`; an agent file is not scanned.
2. **A defect reproduces RED first** (`references/defect.md`). Q1 sorts a
   reported-wrong behaviour as `kind: defect`; the slice carries
   `repro.required: true`, a `kind` (test when there is a runner, else command)
   and a `hint` with the exact input and the `file:line` from the dig. **The
   EXECUTOR writes the reproduction, in the same slice as the fix** — one
   written by the orchestrator is a sketch the executor has to trust. The trace
   gains `REPRO red|green :: <cmd> exit=<n>`, a NEW verb rather than a reused
   `TDD-RED`, because a reproduction is not a `tdd_spec` and `/orc-retro` should
   count them apart. `repro: none` with a reason is an HONEST return: the entry
   says **not reproduced** and the commit offer repeats it. `status: done` with
   a green `before` or a red `after` is MALFORMED
   (`_shared/return-validation.md` §5d).
3. **Affected tests before the suite.** `orc graph changes`, filtered to the
   return's `actual_files`, names the tests that reach the change (a `ROUTE`
   test included); those run first when the runner takes a file list. The same
   answer prints a one-line blast radius, and a `risk` word never appears
   without its `why`.
4. **The gate may RECOMMEND** (`references/dispatch-gate.md`, "The suggestion").
   A line may carry `→ suggested` with its reason from the dig — 8+ confident
   callers, a visible risk class (auth · money · migration · security ·
   concurrency · data-integrity, the same six the planner floors to 70), or more
   than 3 files changing. It is never a pre-selection; every menu ends with
   `Your choice — nothing runs until you answer.`

Also at v1.9.0: the `gh` probe is LAZY (first PR request, not every preflight);
each PR thread gets its own `ctx` card; the trace packet is built from
`quick-checkpoint.md` so every event carries the time it happened; Q3 runs ONE
`orc graph update --notes-pending` instead of two calls, so quick **left** the
`graph-notes-pending` catalogue row and **gained** `graph-map`,
`graph-coverage`, `graph-changes` and `graph-gain`; and the description went
619 → 326 chars against a new 350-char test. The spine gained its FIRST budget,
**325**, and sits at it — anything new moves into `references/`.

Files: `templates/skills/orc-quick/{SKILL.md,README.md,references/{context-doc,
dispatch-gate,gh-mode,look,defect}.md}`, `templates/commands/orc-quick.md`,
`templates/agents/orc-recon-{sonnet-4-6-med,opus-5-low}.md`,
`templates/skills/_shared/{opus5-only,fable5-override,README}.md`,
`templates/skills/orc/references/trace-protocol.md`,
`templates/agents/MODEL-MAPPING.md`,
`bin/{verify-package.js,verify-contracts.js,onboarding-content.js}`,
`README.md`, `CLAUDE.md`, `package.json`.

---

## 4z.33 v1.9.2 — Opus 5 → Opus 5.5 (`claude-opus-5-5`)

Every agent that shipped `model: claude-opus-5` ships `model: claude-opus-5-5`,
the executor VARIANTS in `bin/build-agents.js` included, and the prose "Opus 5"
became "Opus 5.5" across `templates/`, `bin/`, `test/`, `guides/` and
`mock-run/`. The schema `model:` literals follow the producer
(`opus-5-5-high`), because a payload test pins them to it.

NOT renamed, on purpose: the agent NAMES (`*-opus-5-*`), the `opus5_only` key
and its "Opus 5-only" mode name, and history entries. A name change would break
every `rubric_bands_override`, `fixed_executor` and installed file.

`KNOWN_MODELS` lists BOTH ids, so a config naming `claude-opus-5` still
validates. `bin/pricing.json` keeps the `claude-opus-5` row (old traces still
price) and adds `claude-opus-5-5`: $4 input · $5 cache write · $0.20 cache read
· $20 output per MTok (Claude pricing page, 23-09-2026). `orc budget` prices
against `claude-opus-5-5`. Both hooks match the family with
`/(opus|fable)[\s._-]?5\b/`, which matches `claude-opus-5-5` too — no hook change.
