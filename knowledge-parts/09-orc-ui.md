# knowledge.md — Part VII — The panel (`orc ui`)

**Read: on demand** — read when touching anything under `bin/webui/`: a panel, the CSS layers, i18n, fixtures, or the asset manifest.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4z.5 `orc ui` — the local control panel (v0.43.0, extended through v0.44.0)

**The boundary IS the design.** `orc ui` is a browser panel for **everything in
ORC that is not ai**: settings, install health, run history, knowledge state,
usage stats and the mock examples runs leave behind. It **never runs a lane,
never spawns `claude`, and never does agentic model work.** Everything it shows
or writes is deterministic CLI output. **NARROWED in v0.50.0 (§4z.15):** the one
model-shaped thing it can trigger is a CONNECTIVITY PROBE — `orc extra ping` —
and even that runs through the CLI in a subprocess like every other action, so
the HTTPS call is the CLI's. A probe is a DIAGNOSTIC, the family `orc doctor` is
in; it is not an API client and the panel still composes no request body. Running lanes needs a conversational loop —
that is a separate release, not a flag away.

Explicitly out of scope for v1, and each for a reason: launching `/orc` or any
lane (needs a conversational loop), agentic API calls of any kind (skills are a
Claude Code harness feature — the raw API cannot run them; v0.50.0's probe is a
diagnostic, not a completion), executing a mock example
(arbitrary shell exec from a browser; show it, don't run it), hand-editing wiki
docs / patterns / gotchas (model-written artifacts — the UI reads them), and
Electron/Tauri packaging (a localhost server is cross-platform for free).

### The constraint that picked the architecture

`bin/cli.js` ends with a bare `})();` — **no `require.main` guard, no
`module.exports`** — and its functions print and `process.exit` directly. They
are terminal routines, not a library. And contract tokens pin behavior to
`binFiles: ["bin/cli.js"]`, so **moving logic into a shared `core.js` would break
the contract lint.** Extraction was never on the table.

So the server SUBPROCESSES the CLI: `node bin/cli.js <cmd> --json`, parsed. That
required finishing `--json` coverage, which is **additive, independently
testable and valuable on its own** — it makes ORC scriptable for anyone. It also
makes UI/CLI drift *structurally impossible*: the UI **is** the CLI. Cost is
~50–100ms per spawn, which is nothing for a single-user localhost panel with a
2.5s read cache (cleared outright by every mutation).

**Writes shell the real command** (`orc config set`, `orc config profile`, `orc
diy set`, `orc wiki sync`, …), so the UI inherits the existing validators, the
`LEGACY_KEYS` aliasing, the shadowing announcements and the `fable5_effort`
frontmatter rewrite for free. **The UI never writes `.claude/orc.config.yaml` or
any `.claude/orc/*.json` itself** — hand-editing would fight the install
manifest and the prune logic.

### Files, and the name that must not collide

```
bin/webui/serve.js     http server: token auth, loopback guard, static, lifecycle
bin/webui/api.js       endpoint table → spawn cli.js --json → parse → respond
bin/webui/fixtures.js  canned states for --fixtures
bin/webui/app.html     the single page shell
bin/webui/app.css      tokens → reset → layout → components → panels
bin/webui/app.js       router, fetch layer, one render function per panel
bin/webui/i18n/en.json the English string table — and the FALLBACK for the rest
bin/webui/i18n/id.json Bahasa Indonesia
```

**The folder is `bin/webui/`, not `bin/ui/`** — `bin/ui.js` already exists and is
the TERMINAL styling kit (colors, glyphs, boxes). Two different things one letter
apart; each file's header names the other, and a test asserts both do. The
user-facing command is still `orc ui`. Every file is named individually in
`bin/verify-package.js`: the panel only works whole, and a publish missing one of
them serves a page that 500s, renders blank, or (dropping `en.json`) renders raw
dotted keys in every language. `package.json` ships `bin/` wholesale, so no
`files` change was needed.

**Zero dependencies, zero build step** — `node:http`, vanilla JS, hand-written
CSS. House rule, not preference, and it is also what makes restyling pleasant.

### Project-scoped, and the trap that makes the banner mandatory

No `--global`, ever — the same "(project-scoped; no --global)" precedent as `orc
diy` / `crosslink` / `wiki` / `pattern` / `gotcha` / `pr`. `--dir` stays because
it points at ONE other project, not because the panel spans several.

But config does **not** merge: `resolveClaudeDir()` returns exactly one
directory, so `~/.claude/orc.config.yaml` and `<project>/.claude/orc.config.yaml`
are independent files. If ORC is installed globally, the skills that actually run
may be the global copy reading the global config — while the UI happily edits the
project one that nothing reads. `orc doctor` already detects this
(`global_install.shadows`), so **every page carries a persistent banner when it
fires.** The UI still never edits global config: it reports the conflict and
points at `orc doctor`. Editing two scopes from one panel is exactly the
ambiguity this decision removes.

### Security — it is a write surface, so it is treated as one

- Bind **127.0.0.1 only** — never `0.0.0.0`.
- A random 32-byte token minted per launch, in the opened URL (`?t=…`), required
  on every `/api` call AND on the page itself; compared in constant time; never
  logged, never echoed in a response. The client strips it from the address bar
  after boot so it cannot leak via a screenshot or a pasted link.
- **The shell's own assets are stamped with the token as it is served (v0.43.1).**
  A `<link>` and a `<script>` carry no query string of their own, so `app.css`
  and `app.js` were requested with NO credential and answered `401` while the
  page beside them was a clean `200` — the panel rendered as unstyled, scriptless
  markup with every button inert. `serve.js` now rewrites both references to
  `app.css?t=…` / `app.js?t=…` on the way out. Do this **here, not with a
  cookie**: a cookie is an ambient credential a cross-origin page could ride on,
  and the whole model is that the token is presented explicitly per request.
  Adding a new asset means adding it to `STATIC` **and** giving it a reference
  the stamping rewrite covers. The regression test is not another auth assertion
  — auth was never the broken part. It **follows the reference chain the browser
  walks**: load the page, then fetch every URL it points at exactly as written,
  adding nothing. A test that fetches an asset with a token the browser does not
  have proves nothing.
- **Host-header check against DNS rebinding.** A rebound request never carries a
  loopback literal, so anything else is refused with 403 before routing.
- **No CORS headers at all** — never an `Access-Control-Allow-*`.
- **Mutations are POST-only**, enforced in the server AND the router, so a
  prefetch, a bookmark or a browser retry can never mutate.
- A strict CSP on the page (`default-src 'none'`, `connect-src 'self'`), which is
  why `app.js` has no inline handlers and builds no `style="…"` attributes.

### Spacing — the container owns the gap (v0.43.2)

The panel bodies originally spaced their children with `.card + .card`. That
selector matches **only two cards in a row**, and the sequences these panels
actually render are a stat `.grid` then a card, a `.tier` then a card, a
`.run-list` then a card — so those boxes touched, with no gap at all. Card
internals had it too (a note against a table, a file list against a `<pre>`).

The rule now: **a container spaces its children; a block type never carries an
outer margin.** `.stack` (flex column + `gap`, `.stack-sm` for the tighter
variant) is on every panel `body`, `section()`'s async slot, both halves of the
Runs split, and each run-detail tab pane. `.card > * + *` does the same job
inside a card. `.card + .card`, `.action + .action`, `.skeleton + .skeleton` and
the outer margins on `.tier` / `.tabs` are gone — inside a gapped parent an
outer margin does not fix a collision, it double-spaces.

Why it is a rule and not a fix: pair-based spacing has to be re-stated for every
new combination of block types, so it is always one new panel away from being
wrong again. Two tests in `test/webui.test.js` hold both ends — the dead
selectors must stay dead, and every panel container must carry `stack`, so a new
panel written `const body = el("div")` fails the suite rather than shipping
flush boxes. The one deliberate exception is `bannerBody`, prose inside the
`.banner` flex row that is meant to read tight; it is named differently so the
contract regex does not claim it.

### The blanket env var that silenced the check (v0.43.5)

`runCli` set `ORC_NO_UPDATE_CHECK=1` on EVERY subprocess. The reason was real —
most commands end with `maybeNudge()`, which prints an "update available" line
to **stdout**, and that line would sit beside the object `--json` promises. But
`version` does not nudge, and for it the check IS the payload: the panel asked
"is there an update" through a subprocess where updates could not be checked,
and got `check_disabled: true` every time.

`version` and `changelog` are exempt; everything else keeps the guard. **The
lesson is about blanket flags**: a global switch applied for one command's
side-effect will eventually hit the command whose purpose is that effect. A test
pins that the flag stays conditional and names both exemptions.

### The changelog modal reads like prose, not like a source file (v0.44.1)

The changelog IS this repo's README, and that file is hard-wrapped at ~78
columns. `.cl-body` rendered it `pre-wrap`, so every authoring line break
survived into a 660px box: paragraphs came out as a ragged stack of short lines
ending nowhere near the right edge, which is what "the modal looks misaligned"
actually was. **The wrapping belongs to the box, not to the source file** —
`reflowMd()` joins a paragraph's lines back into one, keeping blank lines as
paragraph breaks and giving each bullet its own line (a bullet that wrapped in
the source rejoins itself). `pre-wrap` stays, because the real paragraph breaks
still have to show.

Two smaller alignment fixes in the same pass: the entry date is `margin-left:
auto`, so it lands on the same right edge the version starts from; and the update
banner's three children — the NEW pill, the message, "Read →" — sit on ONE centre
line. The pill was `align-self: flex-start` in a row that was `align-items:
center`, which is three items on three different alignments in a 69px-tall row.

### `orc changelog` — read before you upgrade (v0.43.5)

A version number is not a reason to upgrade. `orc changelog [--json]` fetches
the README from **the same branch `orc upgrade` installs from** (`CHANGELOG_URL`
beside `UPDATE_URL`) and returns only entries newer than the installed version.
Same source for "is there something newer" and "what is in it", so the two can
never describe different releases.

- The parser reads the format CLAUDE.md already mandates
  (`### v<semver> — <title> _(<date>)_`, newest first) and is **forgiving by
  design**: unparseable input yields NO entries, never a wrong one and never a
  throw. A test runs it against this repo's real README (70+ entries).
- Four distinct outcomes, rendered differently: `check_disabled` (opted out),
  `fetched: false` (offline/unreachable), no newer entries, and entries.
- **Changelog text is fetched over the network and is never parsed as HTML.**
  `stripMd` removes the inline markers and it is inserted as text; a test
  asserts no `innerHTML` in that path. A markdown renderer here would mean
  owning a sanitiser for remote input.

### Why there is no embedded web terminal (v0.43.5)

Asked for, investigated, and rejected on evidence — recorded so it is not
re-litigated from scratch.

An interactive `claude` session in the browser needs a **PTY**. Spawned with
pipes it detects no TTY, falls back to `--print`, and exits 1:

```
Error: Input must be provided either through stdin or as a prompt argument
when using --print
```

Node has no built-in PTY, so this needs `node-pty` — a **native module compiled
at install time**. ORC declares `dependencies: {}`, ships with no build step,
and installs by copying a payload; a native build that fails on a user's machine
would break the INSTALLER, not merely degrade a panel. That trade is not close.

Note what is NOT the blocker: xterm.js is plain JS and could be vendored, and
the CSP already allows a same-origin WebSocket (`connect-src 'self'`). **The PTY
is the whole problem.** If ORC ever takes a native dependency for another
reason, this becomes possible; until then the Experiment panel hands off to a
real terminal, which needs nothing.

### The tour — per project, skippable, replayable (v0.43.5)

Two shapes from one `spotlight()`:

- **First run**: eight steps, Next/Skip, and it NAVIGATES for you rather than
  telling you where to go. A step whose target never appears is skipped, never
  shown pointing at nothing — panels fetch before they render, so each step
  waits for its selector.
- **Upgrade**: no Next, no Skip. It clears when you click the upgrade row's
  Preview button (`dismissOnClickSelector`) — it ends because you did the thing.

Seen-state is `localStorage`, **keyed by project root**. Deliberately not a
config key: this panel writes config only by shelling the CLI, and "this browser
saw the tour" is not a fact about the project that belongs in a file the team
shares. A new repo therefore gets its own tour. It never runs on fixtures — a
tour of canned data teaches the panel with numbers that are not real.

**Dismissal is never a one-way door**: "Replay the tour" lives in the `?`
dialog. The spotlight is a RING with the scrim thrown outward (`box-shadow`
spread), not an overlay with a cut-out, so the page stays **readable**
underneath — which is what lets a step point at a real control and have you see
what it is pointing at.

**Readable is not the same as clickable, and v0.43.6 separates them.** The tour
shipped fully click-through. That sounds friendlier and is not: clicking the
sidebar mid-tour swapped the panel out from under the popover, so the ring was
left circling an element that no longer existed and the step's text described a
page you were no longer on. A tour you can walk away from without ending is a
tour that silently breaks.

So a guided step is **MODAL**: `.tour-block` (`position: fixed; inset: 0`) sits
at z-index **47** — above the highlighted element, below the popover — and
swallows every click, and a capture-phase `keydown` handler swallows every key
except `Tab` (focus must stay reachable) and `Escape` (which means Skip). The
shortcut handler carries a second lock, `tourActive.blocking`. Next and Skip are
the only live controls, and Next takes focus on show.

Two details that look like nits and are not:

- The blocker is **above** the target, not below it. Lifting the target to 46 is
  what keeps it visible through the scrim; a blocker underneath would leave
  exactly one element clickable — the one whose click navigates away.
- It is a real element with a transparent background, not `pointer-events:
  none` on everything else. It must **receive** the click, not fail to receive
  it, and it paints nothing because the ring's outward shadow is already the
  scrim.

**The upgrade spotlight is the one opt-out** (`interactive: true`): it has no
buttons and ends when you click Preview, so blocking the page would block the
very click that dismisses it. Modality is opt-out precisely because that variant
is the odd one, not the rule.

**A step must point at something with a SIZE.** Experiment's lane list shipped
collapsed to keep the launch button above the fold, and a collapsed section is
zero-height — so step 7 drew a ring around nothing. It ships expanded now, and a
test ties the two together: the panel must not render `collapsed: true` while
the tour targets `.lane-list`.

**The stacking rules are load-bearing, and got this wrong once.** The first
spotlight rendered UNDERNEATH the sidebar, from two compounding causes:

- The wrapper was `position: fixed`, which **always creates a stacking
  context** — so the ring and popover were clamped to the layer's own z-index
  while the highlighted element (46) painted over both. It is now
  `display: contents`: no box, no stacking context, still one node to remove.
- `.tour-target` forced `position: relative`, which **unsticks the sticky
  rail** — step one's own target. It now sets z-index only, and the relative
  fallback is a separate class applied only when the computed position is
  actually `static`.

Paint order, asserted by a test: scrim 45 → highlighted element 46 → popover 48
→ modal 50. A popover that can be buried by the thing it points at is not a
tour.

**And the ladder is only meaningful if nothing else creates a stacking context
first (v0.44.0).** `.panel` (`panel-in`) and every `.stack > *` (`block-in`)
animate `transform`, and an element with a **running** transform animation *is*
a stacking context — so for the ~300ms a panel takes to arrive, the highlighted
element's z-index is trapped inside `.panel` and the ring/popover order is
decided by whether the spotlight landed before or after the animation finished.
A spotlight now adds `body.tour-on`, which freezes both entrance animations for
as long as a step is up; the documented ladder is then the only thing ordering
these layers, at any timing.

**A spotlight must also point at something you can SEE (v0.44.0).** The upgrade
row is the fourth action on Maintenance and sits below the fold on a normal
window, so arriving from the changelog's *"go upgrade"* placed the ring at
y≈760 in a 720px viewport: a popover floating near the bottom of the screen,
pointing at a row that was off it. `spotlight()` now scrolls the target into
view **before** placing anything — and **instantly**, not smoothly: a smooth
scroll needs animation frames to finish, so the ring's position would depend on
frames arriving, and a spotlight that is correct only in a foregrounded,
unthrottled tab is not correct. Two follow-up `place()` calls settle the popover
once its own height is known.

**And the page grows under it, on its own schedule (v0.44.1).** The ring and the
popover are `position: fixed` at coordinates measured ONCE, while this page adds
things above the fold asynchronously: the blue update banner lands after a
network check, `orc doctor`'s banners after that, and on Maintenance the upgrade
row fills in a version chip and a "Check again" button *inside itself*. Every one
of those pushed the target down by tens of pixels and left the ring framing empty
space above the thing it was pointing at.

Two observers, because one is not enough:

- a **ResizeObserver** on `body`, `#banners`, `#panel` and the target — the right
  instrument, since it fires on the height change however it was caused, without
  this file having to enumerate every place that can grow;
- a **MutationObserver** on the whole document, coalesced to one reflow per task.
  A ResizeObserver is delivered from the RENDERING lifecycle, so a throttled tab
  never gets the callback — and a throttled tab is exactly the tab somebody comes
  back to. The MutationObserver runs off the microtask queue and needs no frames.
  Attributes are deliberately not observed: `place()` writes inline styles on the
  ring and popover, and watching those would make it trigger itself forever.

`keepInView()` (a re-scroll when the target has been pushed off the viewport
entirely) is wired to the observers and **not** to the scroll listener — a
spotlight that scrolls back every time you scroll away is one you cannot get out
of.

### A caution must point at the panel that can clear it (v0.43.6)

`orc doctor` reports every problem in one list, and Overview rendered that list
with a single **Open Maintenance** button under it. That is right for the
install-footprint findings — version skew, orphans, missing files, unwired hooks
— because `orc update` / `doctor --fix` really is where those are repaired.

It was wrong for the ones whose fix lives elsewhere, and `diy-stale` is the one
people hit: a stale flow is recompiled with `orc diy compile`, which is a button
on **Flow**. The panel was sending you to a page with no control for the thing
it was complaining about — worse than no button, because it looks authoritative.

Routing is now a table keyed on the finding id the CLI already emits:

```js
FINDING_ROUTE = {
  "diy-stale":              { panel: "flow" },
  "trace-pointer-dangling": { panel: null },   // clears itself; nothing to press
};
DEFAULT_FINDING_ROUTE = { panel: "maintenance" };
```

`panel: null` is as important as the redirect: a dangling trace pointer is
harmless and a fresh run rotates past it, so it says so instead of offering a
button that does nothing. A test pins both routed ids **against `bin/cli.js`**,
so a renamed finding cannot silently fall back to the default route.

### Overview: "Worth doing", and a wiki tier that becomes advice (v0.43.6)

One severity-ordered list of everything wanting a decision — install findings,
runs left waiting, an available update — each row naming the panel that owns its
fix. Under it, the raw `orc doctor` list stays as the EVIDENCE: the exact message
the CLI printed, unedited, so what you read here is what a terminal would show.

The addition that mattered is the wiki. Its tier was rendered as a colour and
nothing else, which assumes you already know what AGING implies:

- **AGING → recommend a refresh.** It is not an error; it is the moment a refresh
  is still cheap. Saying so is the whole point.
- **STALE → say what it costs.** `/orc-fast` falls back to orc-mini until it is
  refreshed.
- **unregistered → offer the free fix.** Registration is derived from the docs,
  so `orc wiki sync` is instant and is never a re-scan.
- **absent → explain what it unlocks**, and no pattern cached gets the same
  treatment.

Every one of those routes to **Knowledge**, and every one says a refresh costs a
model and therefore runs in Claude Code — the panel must never imply it can
refresh a wiki. A test asserts that caveat survives in every language.

The health tiles became links to the panels behind their numbers (`statTile`
renders a `<button>` only when it has somewhere to go — a tile that reacts to
the pointer and then does nothing is worse than one that never moved), and a
fifth tile counts cached code patterns.

### Runs is an accordion, because the list only grows (v0.43.6)

It was a list with a detail card rendered **underneath** it. Click the fourth
run and its checkpoint appeared below run forty: reading what you clicked meant
scrolling past everything you did not, and then scrolling back to click the
next one. The list grows, so the problem grew with it — the shape of a design
that does not survive its own success.

Every row now expands **in place**, with the same `grid-template-rows: 0fr →
1fr` fold the settings tiers use (`height: auto` cannot be transitioned, and
`.run-body-inner` is the real element it collapses against). Three rules:

- **One row open at a time.** Two open rows re-create the scrolling problem in
  miniature, so opening one closes the rest.
- **Detail is fetched on FIRST open and kept** (`entry.loaded`), so re-opening a
  row is instant and costs no spawn.
- **A filtered-out row is closed**, or re-clearing the filter reveals a run you
  no longer have in view.

`showRun(slot, slug)` is gone; `loadRunDetail(pane, slug)` fills the row that
asked. The content is unchanged — the change is WHERE it renders. Plus a status
segment (all / waiting / done / other) and a text filter, both client-side over
an already-fetched list, so filtering never costs a request.

### Learn: a walkthrough has a position in it (v0.43.6)

Eight sections rendered as eight boxes of monospace text is the whole document
dumped on screen: nothing is emphasised, so nothing is read, and finding the
section you wanted meant scrolling through the seven you did not.

A walkthrough is ORDERED and you are somewhere in it, so the layout says so: a
contents rail with per-section state (current / behind you), one section in the
reading pane, prev/next, a progress bar, and a search that filters the RAIL
rather than the page (one hit jumps straight to it). Position is remembered in
`localStorage`, so leaving the panel does not restart the walkthrough.

The content is untouched: still `bin/onboarding-content.js`, the same text the
terminal prints — **one source, two surfaces.** What the panel adds is
typography, applied to plain text and never parsed as markup: an indented line
beginning `orc `/`claude `/`/orc…` becomes a click-to-copy chip, a `→` line
renders as a diagram, a bullet keeps its shape, everything else is prose.

### The folder picker — the server walks, the browser renders (v0.43.6)

A hand-typed crosslink repo path is the one field in this panel whose mistakes
are **invisible**: the CLI accepts an unresolvable path on purpose (it saves a
PENDING edge that resolves when the path appears), so a typo does not fail — it
silently never links, and you find out much later.

A browser cannot fix this on its own. `<input type="file" webkitdirectory>`
returns a folder NAME and nothing above it, which is exactly the part a relative
path needs. So `/api/fs/list` walks the filesystem **server-side** and the page
renders the walk. That also makes it identical on Windows and macOS: only the
server knows the real separator, and it computes the stored relative path itself
(`path.relative(...).split(path.sep).join("/")`) — a Windows path assembled with
`/` in a browser works until it does not.

This is the **third endpoint with no CLI behind it** (after `/api/learn`'s
shipped content and `/api/experiment`'s lane catalog), for the same reason: there
is no `orc` command that lists directories, so there is nothing to shell. The
limits ARE the design, and a test pins each one:

- directory names only — never a file list, never file contents;
- the only per-entry facts are two `existsSync` calls (`.git`, `.claude/wiki`),
  which are what decide whether a folder is worth linking at all;
- dotfolders and `node_modules` hidden, 400-entry cap;
- read-only, GET-only, never in `WRITES`, and no path reaches a shell;
- an unreadable folder returns `{error}` — **an answer, not a 500.** Clicking a
  folder you cannot read is a normal thing to do.

Single click NAVIGATES; **Use this folder** commits the one you are standing in
— one gesture per meaning, so a click never both descends and selects. Linking
the project to itself is refused in the picker (the CLI refuses it too). Typing
a path by hand still works: browsing is an ADDITION, never the gate.

### i18n — panel prose only, and the rule is enforced (v0.43.6)

Two languages (`en`, `id`), switched from a rail button under the theme toggle
or with `l`, remembered in `localStorage` — like the theme, and for the same
reason: **it is a per-browser display preference, not a project fact.** Writing
it to `orc.config.yaml` would put one person's language in a file the whole team
shares, and this panel writes config only by shelling the CLI anyway.

**THE SCOPE RULE, which is the part worth defending:** only the panel's own prose
is translated. Everything that arrives from `bin/cli.js --json` stays exactly as
the CLI wrote it — config keys, their registry descriptions, their values, agent
names, model ids, file paths, commands, `orc doctor` messages, command output,
lane blurbs, profile names, tier words (`FRESH`/`AGING`/`STALE`, `waiting`/
`done`). Those are identifiers and machine text: **a translated config key is a
key that does not exist, and a translated command is a command you cannot type.**
Where a CLI word appears inside our sentence it is interpolated, never rewritten.

Mechanics, all of them chosen to avoid a build step:

- Tables are plain JSON served as STATIC assets from a fixed map in `serve.js`
  (never a path join against a request), token-gated like every other asset.
- `t(key, vars)` substitutes `{name}` placeholders. Lookup falls back
  **table → English → the key itself**, so a gap degrades to English and the
  worst case is untranslated text, never blank text and never a raw dotted key.
- English is loaded **unconditionally** at boot, before any `t()` call, because
  it is the fallback every other language needs.
- `tn(n, key)` picks `key` or `key + "Plural"`. English has one plural form and
  Indonesian has none — that is two keys, not a plural-rules engine.
- **Keys are always written out in full**, never assembled from a fragment
  (`TIER_LABEL_KEY`, and `TOUR_STEPS` carrying `title`/`text` keys rather than a
  step number). A key built from a fragment is a key the coverage check cannot
  see, and that check is the only thing between a rename and a dotted string on
  someone's screen.

Five tests hold the contract: every key the panel asks for exists in English;
every language defines exactly the same keys (a gap is not a crash, it is a
half-translated screen nobody notices); placeholders survive translation; no
string table value is a bare config key from the CLI's own registry, and the
payload fields that must pass through untouched (`k.desc`, `f.message`,
`a.label`, `l.what`, …) are never wrapped in `t()`; and the language switch
never becomes a write route.

Adding a language: drop `bin/webui/i18n/<code>.json`, add a row to `LANGS` in
`app.js` and one to `STATIC` in `serve.js`, and name the file in
`verify-package.js`. The parity test will tell you exactly what is missing.

### Flow: the pipeline is a picture, and the CLI owns its shape (v0.43.7)

A compiled DIY flow is an **ordered sequence of phases**. The panel showed it as
a column of key/value rows, which is the one shape that cannot express a
sequence — you could read all 22 keys and still not know that `pattern` runs
before `scoring`, or that `analyze: off` removes a phase rather than changing
one. Below the gate card there is now a **stepper**: every phase this flow
compiles, left to right, in run order.

**The panel is not allowed to work out that order.** `orc diy show --json` grew
`steps[]`, built by `diySteps(cfg)` from `DIY_STEPS` — a table whose rows are
pinned, one to one and in order, to the `order` array `diyCompile` concatenates
the flow with. The UI renders `steps[]` and nothing else. Deriving the pipeline
from the raw keys in `app.js` would have been fewer moving parts and would have
created a **second idea of what runs when**, which is precisely the drift this
whole panel is built to make impossible. `locked-blocks.md` has no row on
purpose: it is standing rules, not a phase.

Each step carries `block`, `label`, `key`, `value`, `on` and `note`. **`on` is
`value !== "off"`** — one uniform rule, not a per-phase special case — and a
block with no key (`header`, `trace`, `execution`) always runs. `execution`'s
note is the one computed field: `scored`, or the fixed executor's name when
`scoring: off`, because "which executor" is the only thing that phase's row
could usefully say.

**An OFF phase keeps its slot and is drawn RED**, name struck through, and it
still animates. Filtering it out would make *"I switched review off"* and *"this
flow has no review phase"* render identically, and it would make the rail change
width on every key flip — so a picture you were using to compare two flows would
be comparing two different pictures. Off is a decision, and a decision is worth
seeing.

The sweep **loops** (v0.44.0). It shipped one-shot on the reasoning that ambient
motion above a form is a distraction; in use the opposite complaint arrived —
the one element that says *"these run in this order"* said it once, before the
card had finished arriving, and there was no way to see it again short of a
recompile. It now runs a long, mostly-idle cycle (`--sweep`, 4200ms): one pulse
travels the rail in stitch order, then the rail is at rest for the remaining
~88%. That idle stretch is the whole reason a permanent animation is tolerable
here — a pulse that filled its cycle would be a flashing sign above a form.

The entrance and the pulse are **separate animations** on purpose: one animates
geometry (once, `backwards`, so the hover lift is not overridden by a filled
`transform: none`), the other animates colour (forever). An OFF phase pulses in
its own red, so the loop never quietly recolours it back to "running".

**The pulse rides an overlay (`.step::before`), never the step's own border and
background.** A running animation beats a transition on the same property, so an
infinite pulse on `.step { border-color; background }` would have permanently
overridden `button.step:hover` — a permanent animation is not allowed to cost an
interaction. The overlay only ever *adds* colour (transparent at rest), and
`isolation: isolate` on `.step` scopes its `z-index: -1` to that box so it paints
above the step's background and below its text.
`prefers-reduced-motion` **removes both outright** rather than capping the
iteration count — a single 1ms run would still leave the connector segment
collapsed at its final keyframe.

Clicking a phase scrolls to the key that owns it; a keyless phase is a `div`,
not a button, because offering a jump to nothing is worse than offering none.

A golden test (`test/cli.test.js`) fails if a block ever joins the stitch order
without a `DIY_STEPS` row: a phase that runs but is never drawn is invisible in
exactly the way this panel exists to prevent. A second test
(`test/webui.test.js`) fails if `stepperCard` ever names a phase itself, or
filters an off phase out.

### Flow keys are dropdowns, and a flow can be started from a preset (v0.44.0)

**A flow key accepts a closed set, so it renders as one.** Every key on the panel
had a text box and a `set` button — a memory test with a rejection at the end of
it, since `orc diy set` refuses anything outside the key's own enum anyway.
`orc diy show --json`'s `keys[]` grew **`options`**, emitted straight off
`DIY_META` (`null` for free text), and the panel renders a `<select>` from it.
Same rule as `steps[]`: the panel holds **no copy** of what a key accepts,
because a copy of a closed set would eventually offer a value the validator
refuses. `rubric_bands` lists every band, `session_tier` every tier,
`fixed_executor` every executor; only `flow_name` stays a text input, because a
slug is not a closed set.

A value **outside its own option list** — an unset `fixed_executor` is exactly
that — leads the list, is labelled `(unset)`, and is `disabled`. The state has to
be visible; offering it back as a choice would just route to a rejection.

**Presets are the composer's first question, and the panel could not ask it.**
`orc diy` opens by offering full-lane defaults or one of `DIY_PRESETS`
(`lean` · `paranoid` · `solo-fast`). A flow could be tuned key by key from the
panel but never *started* from a known-good shape. `diy show --json` now also
publishes `presets: [{name, changes}]`, and a card sits **directly below the
gate card** (the anchor the Overview's `diy-stale` finding deep-links to), one
row per shape, each naming the keys that preset actually changes and carrying
the exact command before you press it.

Applying one POSTs `/api/diy/preset` → `orc diy init --force` (`--preset <name>`
when a name is given; an **empty name is the wizard's full-lane defaults**, a
real invocation rather than a synthesised one). `--force` is what makes this an
answer on an already-configured project — `orc diy init` refuses to overwrite
without it — and it **replaces** the config rather than merging, so it goes
through a confirmation that names the loss instead of leaving it implied by the
word "force" in the command.

**The one you are already on says so and drops its button (v0.44.1).** Each
preset carries `active`, computed by the CLI: it is in use when **every key it
sets still holds that value**. `flow_name` is excluded from the match on
purpose — it is a label, and renaming `solo-fast` to `solo` must not make the
panel forget which shape the flow came from. The active row keeps its place
(removing it would make *"you are on lean"* and *"lean does not exist"* render
identically) and loses the button, because "use this" on the thing already in
use can only overwrite your config with itself.

### Writes are batched: nothing is written until Apply (v0.44.1)

Every control on Settings and on Flow committed the instant you touched it: one
click → one `orc config set` subprocess → one full re-render of the panel.
Changing five keys was five of those, and each re-render scrolled the list out
from under the person doing it — so a routine "set these, then that" was a fight
with the page.

Edits are **staged** now. `editSet()` is the one mechanism, shared by both
panels; the affected rows mark themselves; `editBar()` is the one commit point.
The rules that make it honest:

- **The pending edits are NAMED, never counted.** "3 changes" is not consent for
  three writes you can no longer see.
- **Re-staging a value back to its original CLEARS the edit**, so Cancel and
  "set it back by hand" never disagree about whether anything is pending.
- **Apply runs the writes one at a time, in staged order** — the same sequence a
  terminal user would type, which matters because settings shadow each other. A
  refused write does **not** abort the rest: the remaining writes are
  independent, and stopping halfway leaves a state nobody chose. Every failure is
  reported by key.
- **Discard is rendered only while dirty.** A permanently visible Cancel beside a
  disabled Apply reads as a broken panel.
- **Reset is a real write, not an undo**: `orc config reset` (no key) on
  Settings, `orc diy init --force` on Flow — the CLI has no "put every flow key
  back to its default" (`orc diy reset` DELETES the config and unconfigures the
  lane, which is a larger thing). Both are confirmed, and Reset discards anything
  staged first, or the pending edits would land straight back on the defaults.
- A per-key reset stages `{kind: "reset"}`, not a value: `orc config reset <key>`
  REMOVES the key from the file, which is not the same write as setting it to its
  default.
- **The bar sticks only while dirty.** A permanently sticky bar is a permanently
  smaller viewport; a bar you have to scroll to find is an Apply that gets
  forgotten.

Because nothing re-renders until Apply, each control now repaints its OWN
selected state — a segmented button that does not follow your click, on a panel
where the click no longer writes anything, would look simply broken. Shadowing,
the overridden dots and the ladder are still whatever the CLI says on the next
read; they are recomputed after Apply, never predicted before it.

### Crosslink: two tabs, and a boundary you can read (v0.43.7)

The graph and every control were one scrolling column, so the diagram was
something you scrolled **past** on the way to the add form rather than the thing
you came for. It is now **Design** and **Settings**.

**Design** is the boundary as a picture: this repo as the hub, every linked repo
on a ring around it, one line per edge, and a pulse travelling that line **in
the direction the dependency runs**. Direction is the entire point of a
crosslink edge, and motion says it faster and less ambiguously than an arrow
glyph, which is easy to read backwards at a glance. Hovering a repo brightens
its edges and steps the rest back — the only thing that makes a busy ring
readable one repo at a time. Clicking a repo opens Settings at its row, because
every question you can ask *about* a repo is answered by a control that lives
there.

Three decisions worth keeping:

- **Computed, not simulated.** Peer `i` sits at a fixed angle for a given node
  count, so the same config draws the same picture on every open. A
  force-directed sim is more fun to poke and makes two openings incomparable —
  and it is a hand-rolled physics loop in a zero-dependency file.
- **The geometry is solved from the box size, in pixels.** This is the one thing
  that shipped wrong and had to be fixed immediately. The first version placed
  fixed-pixel repo boxes on a ring whose radii were **fractions of the
  container** (`ry = 0.34`) — a number with no knowledge of how wide a repo box
  is. At three peers the boxes overlapped and the picture was unreadable.
  Now `VAULT = { W, H, GAP, PAD }` fixes the box, and `ringRadii(n)` derives the
  ellipse from it: two axis-aligned boxes miss each other when
  `|dx| >= W+GAP` **or** `|dy| >= H+GAP`; for neighbours `Δ` apart with midangle
  `m`, `dx = rx·2sin(Δ/2)·|sin m|` and `dy = ry·2sin(Δ/2)·|cos m|`; one of
  `|sin m|`, `|cos m|` is always `>= 1/√2`, so scaling both radii by `√2` lets
  whichever term is doing the work clear its threshold alone. The same `√2` as a
  **floor** handles the hub, which is a box at the centre. Wider angular gaps
  only push boxes further apart, so neighbours are the worst case. `n === 1` is
  special-cased — `sin(π/1)` is 0, and one peer has no neighbour pair.
  **The box size is fixed on purpose**: a card that grew to fit its longest repo
  name could not be spaced by arithmetic at all, only measured. Long names
  ellipsis. The CSS `width`/`height` on `.vault-node` and `VAULT.W`/`VAULT.H`
  are the SAME box — a test asserts it, because widening the card in CSS alone
  silently reintroduces the overlap.
- **The canvas is sized to what was placed, not to the radii.** Positions are
  laid out around an origin and the box is the bounding box plus `PAD`.
  Deriving it as `2·rx + W` pads for a full ellipse the ring may only partly
  use — one peer would sit in a canvas wide enough for six. The SVG viewBox is
  then 1:1 with the canvas, so endpoints go straight in with no measuring pass
  and no `preserveAspectRatio="none"` squashing labels and strokes by the
  aspect ratio. Edges carry `pathLength="1"`, so the draw-in and the pulse are
  written as fractions and never need a length measured.
- **A ring too wide for the panel scrolls.** The graph sits in a `.scroll-x`
  wrapper. Compressing it back to fit is exactly how boxes start overlapping
  again, so width is never traded against separation.
- **The chips repeat the CLI's own state words** (`missing`, `no wiki`,
  `unregistered`, `corrupt`, the tier). The picture and `orc crosslink list`
  must never disagree about a peer.

Links may name this repo as the literal `self` **or** by its real name — the
config accepts both — so the position map holds both keys. An edge naming a repo
that is not in the graph is skipped, never drawn to nowhere.

**With nothing linked, Design says so and spotlights Settings.** An empty
diagram cannot explain itself: the empty state names the tab that fills it and
offers a button that goes there, Settings opens selected, and the spotlight is
dropped the moment a link exists. The old flex-column `graphCard` is gone —
**one boundary, one picture.**

`prefers-reduced-motion` removes the pulse outright rather than capping it: it
is the only infinite animation on the page, and a single 1ms run would freeze a
dash mid-edge instead of leaving a plain line.

### A finding must name a command that clears it (v0.43.4)

`global-retired-agents` recommended `orc update --global`. That can never work,
and the loop it created is worth remembering:

- The reported names were retired BEFORE the manifest now on disk was written,
  so **no manifest ever claimed them**.
- `pruneOrphans` auto-deletes only what a previous manifest proves ORC owned —
  which is correct, and which excludes exactly these files.
- The `detectPreManifestOrphans` sweep DOES catch them, but is gated on
  `--prune`, also correctly: it deletes files nothing proves are ours.

So a plain update re-reported them forever. The advice is now `orc update
--global --prune`, and the finding carries a machine-readable `fix_command`
that the UI banner renders with a copy button. `orc doctor --fix` still does not
clear it — a global install is not this project's to prune. **The rule: when a
finding is gated on a flag, the flag is part of the advice.** A test pins the
`--prune`, and pins that a bare `orc update --global` cannot come back.

### The Experiment panel — the boundary moves one step, and stops (v0.43.4)

`orc ui` still **renders no model output, proxies no session and holds no API
key.** What it gained is a HANDOFF: `/api/experiment/launch` opens a terminal
with `claude` in the project root and forgets about it — the same detached
launch `openBrowser()` has always used. The panel is not an AI client and must
not become one; a test asserts it never polls a job, opens an EventSource or a
WebSocket, because following the session it launched is the step that would
actually cross the line.

Two rails make a launch button safe on a write surface:

- **The lane catalog is server-side** (`LANES` in `api.js`) and the browser
  sends only an id; an unknown id is a 400. No string typed in a browser ever
  reaches a shell.
- **The cwd is `ctx.projectRoot`**, never anything from a request, and the
  binary is a literal in every platform branch.

Fixture mode never launches: the generic fixture POST guard short-circuits
first, and `can_launch: false` disables the button with a reason.

### Crosslink from the UI — the config keeps ONE writer (v0.43.4)

The crosslink config has exactly one writer by contract, and a panel that
assembled that YAML itself would be a second one. So the UI could not gain an
add button until the CLI gained a non-interactive add:

```
orc crosslink add <name> <path> --kinds <a,b> [--direction calls|called-by]
                                [--via <kind>] [--target self|<node>]
orc crosslink kinds            # the catalog, machine-readable
```

`crosslinkAdd` mirrors the interactive prompt's validations **field for field**
— slug shape, taken name, at least one kind, `--via` within the picked kinds,
`--target` resolvable — so the two entry paths cannot diverge in what they
accept. The panel only catches EMPTY fields; every judgment about validity is
the CLI's, surfaced verbatim. The kind picker reads `crosslink kinds` rather
than shipping a copy of the catalog, so it cannot drift from `CROSSLINK_KINDS`.

The topology graph draws self at the centre and each linked repo with the arrow
pointing the way the edge actually points. **Direction is carried by colour as
well as glyph** — an arrow alone is easy to read backwards at a glance.

### The update check — the CLI decides, the panel only shows (v0.43.3)

`orc version --json` already did a real bounded network check against the
install source and returned `{version, latest, update_available, install_spec,
check_disabled}`; the UI simply never called it. It now feeds three consumers —
the Overview version tile, a rail dot present on every panel, and the
Maintenance `upgrade` row (which also offers **Check again**, because "up to
date" is only as old as its last check).

Three rules, all of them the same rule: **the comparison belongs to the CLI.**

- The browser NEVER diffs version strings. `update_available` is the CLI's
  verdict — it owns the semver parse and the 24h cache. A test asserts no
  semver-ish comparison exists in `app.js`.
- **`latest: null` is not "up to date"** — it is "could not tell", and it renders
  as `offline`. Collapsing those two is how a panel confidently tells you that
  you are current while the network is down. `check_disabled` is a third
  distinct state (`ORC_NO_UPDATE_CHECK`).
- **One check per page load**, shared via a promise, not one per consumer. It is
  a network call; three tiles asking separately is three calls. Nothing polls
  for a release on its own — the only re-check is a button.

The tile renders in a pending state and fills in, so a network round-trip never
delays the three tiles beside it. The fixture ships `update_available: true` on
purpose: "up to date" is the state that needs no design.

### "Up to date" has to name what it checked (v0.53.1)

The update check reads `package.json` from `UPDATE_URL`; `orc upgrade` installs
from `TARBALL_SPEC`. Two URLs, normally the same branch — and until now only the
second was ever printed. The Maintenance panel's `source` row shows the install
tarball, so a reader reasonably concludes the version comparison read that ref
too.

That makes a true statement unfalsifiable, which is indistinguishable from a
broken one. A maintainer who cut a release on an unmerged branch sees
`✓ up to date` against a main that is genuinely a version behind, with nothing on
screen separating **"you are current"** from **"the release never reached the ref
this reads"**. The check is right and cannot be shown to be right.

**So the number and the ref it came from travel together, on every surface that
reports the number.** `orc version` prints
`✓ up to date (azure-id/orc@main is at 0.52.0)`, and the offline branch names the
unreachable ref instead of the word "source". `orc version --json` gains
`checked_source` (the URL) and `checked_ref` (the `owner/repo@ref` label) — **not
a new idea, a missing twin**: `orc changelog --json` has always carried its own
`source`, and a field the human path implies while the JSON omits it is the same
`--json is not a summary` drift as v0.49.1. `orc ui` ▸ Maintenance gains a
`version read from` row beside `source`, so two URLs look like two URLs.

`checkSourceLabel()` shortens a `raw.githubusercontent.com` URL to
`owner/repo@ref` and returns anything else **verbatim** — a custom
`ORC_VERSION_URL` is shown as written, never mangled into a label that no longer
describes it.

Nothing about the check changed: same request, same 24h cache, same
`ORC_NO_UPDATE_CHECK`, same comparison, and the panel still never diffs a version
string. The only new thing is that the answer can be checked.

### "Up to date" has to name what it checked (v0.53.1)

The update check reads `package.json` from `UPDATE_URL`; `orc upgrade` installs
from `TARBALL_SPEC`. Two URLs, normally the same branch — and until now only the
second was ever printed. The Maintenance panel's `source` row shows the install
tarball, so a reader reasonably concludes the version comparison read that ref
too.

That makes a true statement unfalsifiable, which is indistinguishable from a
broken one. A maintainer who cut a release on an unmerged branch sees
`✓ up to date` against a main that is genuinely a version behind, with nothing on
screen separating **"you are current"** from **"the release never reached the ref
this reads"**. The check is right and cannot be shown to be right.

**So the number and the ref it came from travel together, on every surface that
reports the number.** `orc version` prints
`✓ up to date (azure-id/orc@main is at 0.52.0)`, and the offline branch names the
unreachable ref instead of the word "source". `orc version --json` gains
`checked_source` (the URL) and `checked_ref` (the `owner/repo@ref` label) — **not
a new idea, a missing twin**: `orc changelog --json` has always carried its own
`source`, and a field the human path implies while the JSON omits it is the same
`--json is not a summary` drift as v0.49.1. `orc ui` ▸ Maintenance gains a
`version read from` row beside `source`, so two URLs look like two URLs.

`checkSourceLabel()` shortens a `raw.githubusercontent.com` URL to
`owner/repo@ref` and returns anything else **verbatim** — a custom
`ORC_VERSION_URL` is shown as written, never mangled into a label that no longer
describes it.

Nothing about the check changed: same request, same 24h cache, same
`ORC_NO_UPDATE_CHECK`, same comparison, and the panel still never diffs a version
string. The only new thing is that the answer can be checked.

### Motion — added freely, but all of it switchable off (v0.43.3)

Staggered block entrance, a busy sweep bar, collapsible settings tiers
(`grid-template-rows: 1fr → 0fr`, which needs a real element child — hence
`.tier-body-inner`; `height: auto` cannot be transitioned), hover/press nudges,
and the rail's update dot.

The `prefers-reduced-motion` block is not tidiness. **`animation-delay: 0ms
!important` is load-bearing**: the stagger fills `backwards`, so a delay that
survives leaves a block sitting at `opacity: 0` for its whole delay — motion
"off" would mean content that never appears. The block also sets `transform:
none` on the hover/press rules, because reduced motion means no movement, not
fast movement. A test pins both.

### Lifecycle — the forgotten server is the real operational risk

A forgotten server squats a port AND holds a valid write token, so both are
handled, belt and braces:

- **`.claude/orc/ui.lock`** — `{pid, port, token, started_ms}`. It sits under
  `.claude/orc/`, which `isPrunable` can never match, so `orc update --prune`
  cannot delete it (a prune that orphaned a live server's lock would leave a
  running write surface with no way left to find or stop it).
- **Idempotent relaunch.** `orc ui` with a live server for THIS project does not
  start a second one — it reads the lock, verifies the pid, and opens the browser
  at the recorded port and token. A lock whose pid is dead is stale: deleted, and
  a fresh server starts.
- **Heartbeat.** The page pings `/api/ping` every 15s and `sendBeacon`s
  `/api/bye` on unload. No heartbeat from any client for **60s** → exit + remove
  the lock. Closing the tab shuts it down within about a minute. The grace only
  applies once a client has been seen, so `--no-open` does not self-terminate.
- **Idle timeout.** No request at all for **30 minutes** → exit. The backstop for
  a client that died without a beacon (sleep, browser crash, killed tab).
  `--idle <min>` adjusts it; `--idle 0` disables it.
- **Port collisions.** Free → bind. Held by anything else → walk 9922…9930. An
  **explicit `--port` never auto-increments**: if you asked for a specific port
  and it is taken, that is an error, not a silent move to somewhere you are not
  looking.
- **`orc ui --stop`** kills the pid and removes the lock. Exit 0 if something was
  stopped, 1 if nothing was running — the `orc resume` / `orc pattern status`
  convention.
- Every shutdown prints its REASON to the terminal it was launched from, so an
  exit is never mysterious.

### Panels

Overview · Settings · Runs · Knowledge · Stats · Flow (DIY) · Crosslink · Learn ·
Maintenance. Each is its own render function against its own endpoint with no
shared mutable state — rewriting one cannot break another.

**Settings is the centrepiece.** Every `CONFIG_META` key, in the registry's own
tier order, rendered from `config list --json` — so a NEW KEY APPEARS
AUTOMATICALLY, and a test asserts the JSON lists every declared key. The control
follows the VALIDATOR, not a hand-kept table: validators carry a `kind` tag
(`enum` → segmented control, `int`/`range` → stepper with `options` as presets,
`path`/`repo`/`model` → text input validated by the CLI's own exit code). Three
things the panel must not get wrong:
- **`rubric_bands_override`** is hand-written and deliberately registry-less —
  shown READ-ONLY with an explanation. `orc config set` refuses it, so offering
  to write it would be lying about what happens next.
- **`opus5_executor_only`** on disk is surfaced as "renamed → `opus5_only`",
  never hidden (`readOverride` resolves it away, so silence would make the file
  and the listing disagree).
- **Behavior-trace logging** is shown as permanently on and not configurable, so
  nobody hunts for the switch. Only `log_dir` is a key.

**Shadowing is the feature.** `opus5_only: true` makes `rubric_bands_override`
and the whole `fable5_*` block inert; the CLI says so in prose, and
`shadowReason()` expresses the SAME rule as data. Flip it on and those rows
desaturate, a lock slides in, and the score→model ladder morphs (FLIP) from the
default 8-band table to the 3-band effort ladder. **The animation teaches the
precedence rule.** The ladder is read from `DIY_SCORE_TABLE` via `--json`, so the
UI adds no SIXTH copy of a table already mirrored in five places — and a test
compares the two.

**Maintenance is in scope and is the safety-critical panel.** The governing
idea: every destructive action already has a read-only preview in the CLI, so the
UI shows the preview and makes you approve it — it never fires blind.
- Preview is a SEPARATE request from apply; apply stays disabled until one has
  been fetched and rendered.
- The exact command is always visible. Close the browser and type it yourself.
- **Prune names EVERY file.** A count is not consent for a deletion.
- **Single-flight lock**: one mutation at a time, the whole UI goes read-only
  while it runs, output streams live (`/api/job` polling), caches clear on
  completion.
- **Never automatic.** No fix-on-load, no background repair, no nag that runs.
- Two guards only a UI can offer: a **waiting-run guard** (updating changes the
  skills a paused run will resume into — the CLI has no idea you are mid-run;
  this does) requiring a second acknowledgement, and a **dirty-tree guard**
  before `orc upgrade`, which reaches the network and replaces the package.

**One action reaches outside the project, and it is boxed off (v0.44.0).**
`orc update --global` is now a Maintenance action carrying `advanced: true`; the
panel collects every advanced action into its own card **below** the upgrade row
and renders nothing when that card is empty. It exists because a stale GLOBAL
install is a failure this panel already **reports** — the persistent banner, and
doctor's `version-skew` finding — and could previously only tell you to go fix
in a terminal. Three rules make it safe:

- Its preview is `orc doctor --global`, i.e. it reads **the same place the apply
  writes**. A preview of the project dressed up as one about `~/.claude` would
  be worse than no preview. (`--global` outranks `--dir` in `resolveClaudeDir`,
  so the `--dir <projectRoot>` every route pins is simply overridden.)
- The confirmation says plainly that every project on the machine sees the
  result, and the row itself carries the same warning before you open it.
- It stays the **only** global reach. Config is still never written globally:
  config does not merge, so a global write would silently outrank the project
  file every other panel here edits. The "project-scoped, no `--global`" rule
  therefore now reads: **no global CONFIG**, one previewed global payload copy.

**Mock examples** get a tab on the run detail, correlated by slug, with two
honesty rules: a run with no mock example shows **"not generated"** (never an
empty state implying one is missing — `mock_example: off`/declined `ask` are
normal), and there is **never a Run button**. A test asserts both.

### Revising it (you will)

The visual design is expected to be reworked by hand, so the build stays hackable
rather than generated: no build step, ONE `:root` token block at the top of
`app.css`, independent panels, and `orc ui --fixtures`.

**`--fixtures` matters more than it sounds.** You cannot design a state you
cannot reach: on a healthy install with a fresh wiki and no paused runs, the
STALE chip, the `waiting` run card, the shadowed-setting lock and the unhealthy
doctor panel are all unreachable. The fixture set therefore carries **one of
every state, including the ugly ones**, and two tests keep it honest — one
asserts the canned shapes still carry every key the live CLI emits (a drifted
fixture is worse than none), the other asserts the ugly states are actually
present.

### Motion

CSS-only, purposeful, quick: 180ms panel slide+fade, a success flash on a
committed setting with the overridden dot animating in, 220ms desaturate + lock
slide for shadowing, a FLIP morph on the ladder, skeleton shimmer instead of
spinners, a slow pulse on a STALE chip (FRESH is static).
**`prefers-reduced-motion: reduce` disables all of it** — non-negotiable, and for
the **two infinite** animations (the vault pulse, and the flow sweep since
v0.44.0) that means REMOVED, not capped: `animation-iteration-count: 1` still
fires them once and leaves a dash frozen mid-edge or a connector collapsed at
its final keyframe. Light and dark are both painted explicitly; wide content
scrolls in its own container so the page body never scrolls horizontally.

**The scrollbar is part of the picture (v0.44.0).** The platform default is an
opaque grey slab with its own track colour, and under the flow stepper it cut a
hard band across the bottom of a card whose entire job is to be read as a
diagram. Every scrolling box now has **no track at all** (the card behind shows
through), a thin rounded thumb in `--line`, and full contrast only on hover.
Both syntaxes ship because neither falls back to the other: Firefox reads
`scrollbar-width`/`scrollbar-color`, WebKit and Chromium read the
`::-webkit-scrollbar-*` pseudo-elements. A test asserts the track is never
painted in a surface colour.

### Tests

`test/webui.test.js` (18 cases): the one-object/exit-code contract per flagged
command, every `CONFIG_META` key present in the JSON, the shadowing round-trip,
the legacy-key surfacing, the ladder-vs-`DIY_SCORE_TABLE` comparison, `orc mock`
both ways, `run show --json`'s trace tail, then the server half — token
rejection, non-loopback Host rejection, GET on a POST endpoint, no CORS headers,
a write that the CLI's validator refuses, `--stop` exit codes, stale-lock
cleanup, explicit-port collision, `--global` refusal — plus the fixture-drift,
ugly-state, no-run-button and name-collision assertions. Suite: 113 → **131**.

Since v0.44.0 it also pins: the transparent scrollbar track, the flow keys'
`options`-driven dropdown (and that the panel names no flow value itself), the
preset card's CLI-owned catalog and its confirmation, the boxed-off global
update with its global preview, and the spotlight's scroll-into-view plus the
entrance-animation freeze.

## 4z.10.2 `bin/webui/` becomes an architecture (v0.48.1)

**The rule.** One file per panel, per CSS layer, per i18n namespace, per fixture
set; **the filename prefix IS the load order**, and `app.html` is the manifest.

**The constraint that decided it:** `serve.js` requires the per-launch token on
every static request, and **an ES module `import` carries no query string**. A
module graph would 401 on every import unless static auth were weakened. So:
classic scripts, explicit order, one `<link>` per stylesheet. Classic scripts
also share one global lexical scope — which is why the split added no
`import`/`export` and changed no call site.

| | Failure prevented | Enforced by |
|---|---|---|
| `STATIC` from a boot-time walk | A new stylesheet nobody added to a hand-written table 401ing, with an unstyled page as the only symptom. | `buildStatic` in `serve.js`. A request path stays a KEY LOOKUP, so traversal is structurally impossible — *stronger* than the old table, not weaker. |
| Generic token stamping | The next `<script>` tag someone adds 401ing silently. | the regex in `serve.js`; `test/webui/serve.test.js` walks every `href`/`src` in `app.html`. |
| `04-motion.css` loads LAST | An equal-specificity panel rule winning on ORDER and switching an animation back on. Several reduced-motion rules are deliberately not `!important`: `.vault-pulse` and `.step-flow` are REMOVED, because a capped infinite animation freezes mid-cycle. | `test/webui/render.test.js` — the media query is in `04-motion.css` and nowhere else, and it is the last `<link>`. |
| Tokens only on bare `:root` | A token redefined inside one theme block being invisible to the other two theme states. | `00-tokens.css`; asserted per panel file. |
| set equality in `verify-package.js` | An unguarded new file, and a phantom entry for a deleted one. | the agent-file pattern, applied to `bin/webui/`. |
| `appJs()` / `appCss()` derive from `app.html` | A file the manifest forgot hiding behind a passing suite — because it is not in the test's string either. | `test/_helpers.js`. |

i18n keys are still written out **in full**; the split is by key PREFIX only,
and a namespace owns its prefixes exclusively (a prefix in two files means "where
does this string live" has two answers). `NAMESPACES` in `js/01-i18n.js` is a
plain array — no index file to fetch and to forget.

**Local, not shipped:** `orc-ui-wiki.md` at the repo root is the change table for
this tree — which file to open for which change. Untracked, like the `*-plan.md`
family.

---

## 4z.33 v1.9.2 — the Code graph tab

Knowledge has SIX tabs. The code graph card left the Wiki tab and became
`knGraphTab` in `js/panels/knowledge.js`, with its styles at the end of
`css/panels/knowledge.css` (the `cg-*` classes). No new file, no new route,
no new fixture: every card reads `/api/graph` and `/api/graph/gain`, which the
panel already fetched.

| card | reads | rule |
|---|---|---|
| state ladder (`cgStateCard`) | `state`, `line` | four states OFF · NONE · FRESH · DRIFTED as UPPER-CASE literals, compared with `String(g.state).toUpperCase()` — a lower-case `"drifted"` literal fails the v046 synonym test. OFF → a copy-able command, NONE/DRIFTED → the free update button, FRESH → nothing |
| pipeline (`cgFlowCard`) | `files`, `symbols`, `notes` | static prose; values only when the state is FRESH or DRIFTED |
| example graph (`cgAnatomyCard`) | nothing | `CG_SAMPLE` is a made-up shop, and the title says so. SVG via `createElementNS`; hover or Tab focus lights a symbol's edges and fills the caption |
| numbers (`cgNumbersCard`) | `files`, `symbols`, `density`, `generation`, `behind` | tiles count up with rAF and REST on the CLI's own string (`cgCount`); `by_lang` in the CLI's order |
| cost bars (`cgGainCard`) | `paid`, `avoided`, `read_set`, `by_command` | paid and avoided on ONE scale; avoided solid to `low`, striped to `high`; a read never asked keeps its slot, muted |
| exact card (`graphCard(…, true)`) | unchanged | `exact` hides the chip/button row and the two notes the other cards already carry |
| glossary (`cgGlossaryCard`) | nothing | four groups |

Motion: three INFINITE animations (`.cg-beacon`, `.cg-link-dot`, `.cg-pulse`)
are removed with `display: none` in the ONE reduced-motion block in
`04-motion.css`; every finite one gets `animation: none`; `cgStill()` skips the
count-up. Bar widths are set through CSSOM (`--w`), never a `style` attribute.

The `graph-drifted` finding route carries `tab: "graph"`; `goRoute()` in
`overview.js` sets `KN_TAB` before it changes the hash.

i18n: `knowledge.cg.*` and `knowledge.tab.graph`, in both tables. No string may
carry a `.claude/` path (v046 test) — the store is described, not named.
