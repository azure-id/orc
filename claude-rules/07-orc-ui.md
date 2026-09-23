# orc ui — the web control panel

**Read: on demand** — read when touching anything under `bin/webui/`, the panel's i18n, or the mocked-run catalogue.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **`orc ui` is a panel for everything that is NOT ai (v0.43.0, narrowed
  v0.50.0).** It never runs a lane and never does agentic model work. The one
  model-shaped thing it can trigger is a CONNECTIVITY PROBE — `orc extra ping` —
  and even that goes through the CLI like everything else, so the HTTPS call is
  the CLI's. A probe is a DIAGNOSTIC, the same family as `orc doctor`; it costs
  either nothing or a fraction of a cent, and the panel says which rung it
  will use and what it costs before the button. That boundary is still the whole
  design: no lane, no `claude` spawn for work, no request body this panel
  composed. The server (`bin/webui/`) SUBPROCESSES `node bin/cli.js <cmd>
  --json` for every read and shells the real command for every write, so UI/CLI
  drift is structurally impossible and every validator, the `LEGACY_KEYS`
  aliasing and the shadowing announcements come for free. It never writes
  `.claude/orc.config.yaml` or any `.claude/orc/*.json` itself. **The folder is
  `bin/webui/`, NOT `bin/ui/`** — `bin/ui.js` is the terminal styling kit; each
  header names the other and a test asserts it. Every file is named in
  `verify-package.js`. **`--json` is a contract**: exactly one object on stdout,
  nothing else, and the exit code the human path would use (several are already
  gates — `pattern status` 0/1/2, `wiki impact` 0/1/2/3, `diy status` 0/1,
  `pr stack status` 0/1); an empty result is an ANSWER, so it still returns its
  object. Project-scoped, **no `--global`** — config does not merge, so a global
  install that can win skill resolution gets a persistent banner (reported here,
  never edited here). It is a WRITE SURFACE: loopback bind, per-launch token,
  Host-header rebinding guard, no CORS, POST-only mutations, and a lock at
  `.claude/orc/ui.lock` (never prunable — `isPrunable` cannot match it) driving
  idempotent relaunch, `--stop` (exit 0/1), a 60s heartbeat and a 30-min idle
  exit. An explicit `--port` NEVER auto-walks. Maintenance is preview-then-apply:
  the apply button stays disabled until a preview was fetched, the exact command
  is always visible, **a prune names every file** (a count is not consent), one
  mutation at a time, and nothing ever runs automatically. `--fixtures` must
  carry ONE OF EVERY STATE including the ugly ones — you cannot design a STALE
  chip on a fresh wiki. Zero deps, zero build step; `prefers-reduced-motion`
  disables all motion. See `knowledge.md` §4z.5.

- **`orc ui` v0.43.6 — four rules the panel now has to keep.** (1) **A caution
  routes to the panel that can CLEAR it**, via `FINDING_ROUTE` keyed on the
  doctor finding id — `diy-stale` goes to Flow (that is where `orc diy compile`
  is), not Maintenance; `panel: null` means no button at all, never a useless
  one. Install-footprint findings still default to Maintenance. (2) **A guided
  tour step is MODAL** — `.tour-block` at z-index 47 (ABOVE the highlighted
  element, below the popover) plus a capture-phase key handler, so Next/Skip are
  the only live controls; the upgrade spotlight is the ONE opt-out
  (`interactive: true`), because blocking it would block the click that
  dismisses it. A step must point at something with a SIZE — never let the
  Experiment lanes ship `collapsed: true` while the tour targets `.lane-list`.
  (3) **Runs expands in place** (one row open at a time, detail fetched on first
  open); there is no detail box below the list, and no `showRun`. (4) **i18n is
  PANEL PROSE ONLY** — `bin/webui/i18n/{en,id}.json`, English is the fallback
  table, keys are written out in full and never assembled from a fragment.
  NEVER translate anything from `bin/cli.js --json`: config keys, their
  descriptions and values, agent names, model ids, paths, commands, doctor
  messages, tier words. A translated config key is a key that does not exist.
  The picker endpoint `/api/fs/list` is a directory LISTER — names only, never a
  file's contents, read-only, and the relative path is computed server-side so
  Windows and macOS agree. See `knowledge.md` §4z.5.

- **`orc ui` v0.43.7 — every picture is CLI-derived, and OFF is a state, not a
  filter.** (1) **The Flow stepper renders `orc diy show --json`'s `steps[]` and
  nothing else.** That array is built by `diySteps(cfg)` from `DIY_STEPS`, whose
  rows are pinned one-to-one and in order to the `order` array `diyCompile`
  stitches with — a golden test in `test/cli.test.js` fails if a block joins the
  stitch order without a step. NEVER derive the phase list or its order from the
  raw keys in `app.js`: a second idea of the pipeline is exactly the drift this
  panel exists to make impossible. `on` is the uniform rule `value !== "off"`;
  a keyless block (`header`, `trace`, `execution`) always runs;
  `locked-blocks.md` has no row (standing rules, not a phase). (2) **An OFF
  phase keeps its slot and is drawn RED, struck through, still animated** —
  filtering it out makes "I switched review off" and "this flow has no review
  phase" identical, and makes the rail change width on every key flip. The sweep
  LOOPS as of v0.44.0 (see below) — the one-shot rule this line used to state is
  retired. (3) **Crosslink is two tabs: Design and Settings.**
  Design is COMPUTED, never a physics sim (the same config must draw the same
  picture every open). **The ring geometry is SOLVED FROM THE BOX SIZE** —
  `VAULT = {W,H,GAP,PAD}` + `ringRadii(n)`; a radius expressed as a FRACTION of
  the container knows nothing about how wide a repo box is and overlapped at
  three peers. The CSS `width`/`height` on `.vault-node` and `VAULT.W`/`VAULT.H`
  must stay the SAME box (a test asserts it, and re-runs the real `ringRadii`
  over n=1..16 checking no pair overlaps); the box is FIXED-size on purpose
  (a box that grows to its longest repo name cannot be spaced by arithmetic).
  The canvas is the bounding box of what was PLACED, never `2·rx + W`; a ring
  too wide for the panel SCROLLS and is never squeezed back. No stretched
  `preserveAspectRatio="none"` viewBox (it squashes every label and stroke).
  Links may name this repo as the literal `self` OR by its name so
  the position map holds both, and the chips repeat the CLI's own state words.
  With nothing linked, Settings opens selected and its tab is spotlighted; the
  old `graphCard` ring is GONE — one boundary, one picture. `.vault-pulse` is
  one of the page's two infinite animations and `prefers-reduced-motion` must
  REMOVE it (capping it freezes a dash mid-edge). See `knowledge.md` §4z.5.

- **`orc ui` v0.44.0 — the panel never asks you to type what the CLI already
  knows.** (1) **A flow key with a closed set is a DROPDOWN, built from `orc diy
  show --json`'s `options`** (emitted straight off `DIY_META`; `null` = free
  text, which is only `flow_name`). The panel must NEVER name a flow value
  itself — same rule as `steps[]`, and a test greps for the literals. A value
  outside its own set (an unset `fixed_executor`) leads the list, is labelled
  `(unset)` and is `disabled`: the state must be visible, never re-offerable.
  (2) **Presets are the composer's first question**, published as `presets[]`
  and rendered in a card DIRECTLY BELOW the `#diy-gate` card. Applying one
  shells `orc diy init --force` (`--preset <name>`, or no flag at all for the
  wizard's full-lane defaults) — that REPLACES the config, so it is always
  confirmed and the loss is named. (3) **The stepper sweep LOOPS** on a long
  mostly-idle cycle (`--sweep`), with the entrance and the pulse as SEPARATE
  animations (geometry once + `backwards`, colour forever); an OFF phase pulses
  in its own red. `prefers-reduced-motion` REMOVES both the step pulse and
  `.step-flow` outright — capping the iteration count leaves a connector frozen
  mid-collapse. Every scrolling box has a TRANSPARENT track (both the Firefox
  properties and the WebKit pseudo-elements — neither falls back to the other).
  (4) **`orc update --global` is the ONE action that reaches outside the
  project**, flagged `advanced: true` into its own box below the upgrade row,
  previewed with `orc doctor --global` (the same place the apply writes), and
  warned about in the confirmation. "Project-scoped, no `--global`" now means
  **no global CONFIG** — config does not merge, so a global config write would
  silently outrank the file every other panel edits. (5) **A spotlight scrolls
  its target into view first, INSTANTLY** (a smooth scroll needs frames, and a
  spotlight that is correct only in a foregrounded tab is not correct), and adds
  `body.tour-on` to FREEZE `panel-in`/`block-in` while a step is up — a running
  transform animation is a stacking context, which was deciding the ring/popover
  ladder by timing instead of by the documented z-index order. See
  `knowledge.md` §4z.5.

- **`orc ui` v0.44.1 — writes are BATCHED, and the spotlight survives the page
  growing under it.** (1) **Nothing is written until Apply**, on Settings AND on
  Flow: `editSet()` stages, `editBar()` commits. The pending edits are NAMED
  (a count is not a change list); re-staging a value back to its original CLEARS
  the edit; Apply runs the writes ONE AT A TIME in staged order and a refused
  write NEVER aborts the rest (every failure reported by key); **Discard renders
  only while dirty**; the bar sticks only while dirty. Reset is a real write, not
  an undo — `orc config reset` on Settings, `orc diy init --force` on Flow
  (`orc diy reset` DELETES the config, so it is NOT the reset button) — confirmed,
  and it discards staged edits first. A per-key reset stages `{kind:"reset"}`,
  never a value: `orc config reset <key>` REMOVES the key. Because nothing
  re-renders until Apply, every control repaints its OWN selected state.
  (2) **A preset carries `active` from the CLI**, and the match EXCLUDES
  `flow_name` — renaming `solo-fast` to `solo` must not lose the shape. The
  active row keeps its slot and drops its button. (3) **A spotlight re-places on
  ANY layout change**, via a ResizeObserver AND a MutationObserver: the observer
  is the right instrument but is delivered from the rendering lifecycle, so a
  throttled tab never gets it — never rely on RO alone here. Never observe
  ATTRIBUTES (`place()` writes inline styles and would trigger itself), and never
  wire `keepInView()` to the scroll listener (a spotlight you cannot scroll away
  from). (4) **The changelog body is REFLOWED before render** — it is this
  README, hard-wrapped at 78 columns, and `pre-wrap` shipped those wraps straight
  into a 660px box. See `knowledge.md` §4z.5.

- **W2 — the panels: a FREE action gets a button, a PAID action gets a copy-able
  command.** That line is now visible in the UI rather than hidden. The CLI's state
  words are the ONLY state words (never a friendlier synonym); the panel never
  derives an order, a tier, an estimate or a price the CLI already emits; a
  `used 0/20` row and a `TOO_RECENT` chip KEEP THEIR SLOT; the stacked cost bar
  exists so cache-read stays visibly separate; the low-confidence warning is not
  optional chrome. `--fixtures` carries one of every state including the ugly ones,
  and a test asserts the count per state so a new state cannot ship without one.

- **The mocked runs are a DERIVED catalogue, and the README is now three files.**
  `mock-run/*.md` (reader-facing walkthroughs, easy English) plus every
  `templates/skills/*/examples/*.md` (the dense annotated ones) are enumerated by
  `bin/mockrun-catalog.js` — title from the file's own `# ` heading, lane from
  whether `templates/commands/<name>.md` exists, summary from the `> ` line. Add a
  file, it appears in `orc mock-run`, in `orc ui` ▸ **Mocked Skill Use**, and
  nowhere needs a list edited — EXCEPT `GROUP_OF` (reading order is editorial and
  cannot be derived); a doc with no group lands in `other`, and a test fails on any
  shipped doc that does. The panel renders that catalogue and decides NOTHING about
  it (the Flow-stepper rule), renders markdown as DOM and never as HTML, and
  translates only its own prose. `renderMd`'s paragraph branch MUST consume its
  first line unconditionally — it is the fall-through, so a line every branch
  declines is an infinite loop that hangs the panel. **`orc mock-run` is NOT
  `orc mock`** (the latter lists `mock-examples/<slug>/` in the user's project).
  README history moved to `CHANGELOG.md`, which is now what `CHANGELOG_URL` fetches
  and what `test/webui.test.js` parses; the README keeps ONLY the newest entry, so
  a release adds its entry to BOTH (full body in CHANGELOG.md, short summary in the
  README). Detail that would bloat the README lives in `guides/`.

- **`bin/webui/` is ~60 files, and the manifest is `app.html` (v0.48.1).** One
  file per panel, per CSS layer, per i18n namespace, per fixture set; **the
  filename prefix IS the load order** and for CSS that is the cascade order.
  **Classic scripts, never ES modules** — an `import` carries no query string and
  every static request needs the per-launch token; weakening static auth is not
  on the table. `serve.js` builds `STATIC` from a ONE-TIME walk at boot (a
  request path stays a KEY LOOKUP, so traversal is structurally impossible) and
  stamps EVERY `href`/`src` generically — naming two files was fine when there
  were two. **`06-responsive.css` and `04-motion.css` load LAST**: several
  reduced-motion rules are deliberately not `!important` (`.vault-pulse` and
  `.step-flow` are removed with `display: none`, because a capped infinite
  animation freezes mid-cycle), so an equal-specificity panel rule loading later
  would win on order. THE ONE `prefers-reduced-motion` block lives in
  `04-motion.css` and nowhere else. Every colour token is defined once, on bare
  `:root`, in `00-tokens.css`. `verify-package.js` names every file AND asserts
  SET EQUALITY with the directory in both directions. i18n keys are still written
  out IN FULL — the split is by key PREFIX only, and a namespace owns its
  prefixes exclusively. Tests read the panel through `appJs()`/`appCss()`, which
  concatenate exactly what `app.html` loads, so a file the manifest forgot cannot
  hide behind a passing suite.

- **THE HOOK BOARD APPLIES WHAT IT DRAWS, AND EVERY POSITION IS DERIVED WHEN ITS
  WRITE RUNS (v1.4.1).** `orc ui` ▸ CLI Hook Interface had four defects, and the
  first was arithmetic rather than taste: the palette's `+ line N` buttons
  computed each write's POSITION from the SAVED layout instead of the one being
  staged, so three staged adds all carried position 1 — and
  `orc statusline set <line> <pos>` at an occupied position is an EDIT by
  design. Three adds produced ONE part, and the five-slot cap counted the same
  stale layout and never fired. A staged change is now a SEMANTIC OP against a
  stable ref (`add · remove · move · set · sep · doc`), and **`hkPlan` replays
  them in order to produce BOTH the board you see AND the writes that make it**
  — one function, because a second idea of where a part will land is the
  Flow-stepper failure inside a single panel. See `knowledge.md` §4z.26.
  - **ONE COMMAND PER SCOPE.** The colour-set picker shelled
    `statusline line 1 --theme` (ONE line's override) while `show --json`
    reported `layout.theme` — the button never moved and a third of the bar
    changed. **`orc statusline doc [--theme] [--glyphs] [--ansi]
    [--align-columns]`** is the document-level writer and CLEARS the per-line
    overrides that would shadow the choice: a setting silently shadowed is the
    failure it exists to fix.
  - **CSSOM, NEVER A `style` ATTRIBUTE.** `orc ui` serves under
    `style-src 'self'`, which blocks a parsed style attribute outright, so the
    ANSI preview had **never had colour** and the only sign was a console error.
    Assigning properties is not a parse and is not blocked; `unsafe-inline` for
    a preview is not a trade worth making. The rule holds for any panel.
  - **THE BOARD IS THE ONLY PLACE ANYTHING IS APPLIED.** The list below it is a
    REFERENCE with no buttons — what each part shows, nothing else. Add ·
    Change · Move · Remove are buttons ON THE CHIP, each opening a modal that
    says what it will do, and ONE part picker (search box, one click) serves
    both a new slot and a swap. **Drag is the shortcut, never the mechanism:**
    the drop edge is marked on the chip it lands beside rather than opening a
    gap, every move also has a button and a keyboard equivalent, and
    `hkCanDrag()` turns drag off FOR REAL below `06-responsive.css`'s own 600px
    breakpoint.
  - **The panel still derives nothing**, so three things moved to the CLI:
    `separators` (twelve — the separator is a dropdown, and a value outside the
    set keeps its slot, leads the list and is DISABLED, the `fixed_executor`
    rule), `themes_about` (WHY you would pick a colour set), and a per-component
    `structural` flag (which parts do not eat one of the five).
  - **Every ambiguous thing carries its sentence**: a description on every chip,
    picker row and reference row; an explanation under every control name; and
    the `80 / 120 / 160` buttons say they are TERMINAL WIDTHS IN CHARACTER
    CELLS. A refusal is never a shrug — "line 3 is full" and "put something on
    line 2 first" stay two sentences, and a line that cannot take a part says so
    ONCE, not on six identical disabled slots. Motion stays in `04-motion.css`
    and nowhere else, and every animation is FINITE so the reduced-motion cap
    leaves it at rest rather than frozen part-way.

- **A STAGED EDIT REPAINTS, AND EVERY FIELD MUST BE READABLE BACK (v1.4.2).**
  Three of the four defects in `orc ui` ▸ CLI Hook Interface were the SAME
  defect. `hkOp` re-entered the router, so a staged change refetched four
  endpoints and rebuilt the panel from a skeleton — which made **a staged change
  look like an applied one** and left the open editor showing values from BEFORE
  the change the user had just made. `hkPaint()` is the ONE paint (from
  `HK_DATA`, scroll kept by hand); `hkReload()` refetches ONLY where the disk
  moved. **A control that changes the board calls `hkPaint`; a refetch is for a
  write.** The open editor is registered for that repaint (`HK_MODAL`), re-finds
  its part by the stable ref, and `focusPath`/`restoreFocus` carry the caret —
  an editor that drops focus after one letter is not an editor. **`--json is not
  a summary`, found again on `statusline show`:** it emitted twelve of the
  twenty-four item fields, so `case`, `prefix`, `min_cols`, `precision` and
  seven more were written correctly and were then invisible to the panel that
  wrote them. `SL_ITEM_FIELDS` is the one list both ends read, `authored`
  carries the raw item so a control can mark a value as the USER'S, and an
  absent LIST is `[]` and never `null`. **`SL_MAX_PER_LINE` is SIX and lives in
  ONE place** (validator · `max_per_line` · `full` · the human `n/6`); a
  structural part still does not count. **`hookui.css` had been written against
  four CSS tokens that do not exist** (`--bg-sunken`, `--bg-raised`, `--fg`,
  `--fg-dim` → `--surface-2`, `--surface-3`, `--text`, `--text-dim`), so 34
  declarations were silently dropped and the separator's open list rendered
  near-white on near-white — **a native `<select>` popup is drawn by the
  platform and inherits only the half you leave to chance**, so state both plus
  `color-scheme`. The preview is drawn as a **terminal** with a column ruler,
  and `orc statusline preview --theme|--glyphs` is a **RENDER-ONLY** override
  (applied to a copy, writing nothing) feeding one drawer that shows the same
  bar under every colour set and symbol set — CLOSED by default, fetched on
  first open, because eleven renders nobody asked to see is eleven subprocesses
  nobody asked to pay for.
  **The cap lives in ONE place and the HOOK reads it from the lock:** rung 5 held
  its own `5` and counted every item op, so a legal six-part line — and a legal
  five plus a fill — fell silently back to the shipped lines; the compiler marks
  a structural op `s: 1` because **a compiled op carries an instance id, never a
  type**, and a hook must never hold a number this CLI owns. **A renderer
  publishes the item fields it USES:** twenty-eight of thirty-five draw no
  label, so the Name box took your text and did nothing — `uses` +
  `label_renderers` are the CLI's, `SL_LABEL_RENDERERS` is golden-tested against
  the compiler's switch, and the editor DISABLES what the shape ignores while
  keeping the slot and the reason. **`hk-quiet`: nothing ARRIVES on a repaint** —
  `hkPaint` replaces every child and `.stack > *` animated each one in, so with
  the network tab empty the panel still read as reloading; entrances are off
  from the second paint onward and in the editor on every rebuild, transitions
  untouched, declared in `04-motion.css` after the rules it turns off.
  See `knowledge.md` §4z.27.

