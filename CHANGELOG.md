# Changelog

All notable changes to ORC, newest first.

The **latest release** is also summarised in the [README](README.md#changelog).
This file is the full history, and it is the file `orc changelog` reads — that
command prints only the entries **newer than the version you have installed**.

Format: `### v<version> — <title> _(<date>)_`.

---

### v0.49.1 — the challenge council, and a `--json` that stops throwing things away _(2026-08-18)_

One release, two workstreams, and **zero new skills**. They ship together because
they are the same defect seen twice: **ORC computes far more than it shows.**
`computeWikiFreshness` builds a per-doc table that `--json` threw away;
`challenge record` computes per-dimension, per-severity, per-iteration detail
that the panel rendered as one chip. Both halves are "stop discarding what you
already computed" — and only one of them also adds new thinking.

---

## Part A — the challenge council

### Five more ways of looking, and none of them is ORC's to choose

`/orc-challenge` had one grounded opinion (the judge) and one blind one (the cold
reader), and both read the artifact the same way: *does this document do what a
document is supposed to do?* Five ways of looking were missing, and each one is
missed for a different reason:

| Role | It asks | It fails when |
|---|---|---|
| **The Contrarian** | where is the fatal flaw? | it assumes the artifact is fine and stops looking |
| **The First Principles Thinker** | are we even solving the right problem? | it accepts the framing it was handed |
| **The Expansionist** | what is being undervalued here? | it only counts what is wrong |
| **The Outsider** | what does this assume I already know? | it is an expert and cannot un-know things |
| **The Executor** | what do you actually do on Monday morning? | it grades the theory and never the first step |

> **A lens raises; only the judge resolves. ORC proposes the council; the user
> picks it.**

**`a lane that picks its own council` has broken this contract** — registered as
the fourth member of the family with `a lane that answers its own interview
question`, `a lane that picks its own favourite` and `a lane that fixes what it
judged`. A council chosen by ORC is ORC deciding **which kinds of criticism the
user is allowed to hear**, which is a bigger decision than any single finding in
the run. So `orc challenge init --council` has **no default** and refuses by
name, exactly like `--goal` since v0.47.0:

```
❌ --council is required and has no default. ORC SUGGESTS a roster (from the kind
   and the goal); the user PICKS it. […] Suggested for --kind tsd:
   reader,contrarian,executor.
   (a lane that picks its own council has broken this contract)
```

`none` is a first-class answer and reproduces the v0.47.0 review exactly. The
cost is stated in **dispatches**, never in dollars — `/orc-budget`'s rule: no
dollar figure without a dated price table.

### Two of them cannot produce a finding without lying

This is the most important decision in the release.

**The expansionist.** A finding must carry `serves` — the goal element it
advances — and `record` DROPS one without it. Its entire brief is *"what upside
is everyone missing?"*, which by construction is **not** in the stated goal.
Given a `serves` field it would either invent a goal element or be silently
dropped. So it returns an **opportunity**: no severity, never in `findings[]`,
never near the pass gate, always with a `first_step` and a route
(`brainstorm | pact | grill | none`). It is conserved — `--take` or `--drop`,
both requiring a reason — and **this lane never builds one**.

**The first-principles thinker.** Its most valuable output is *"you are asking
the wrong question entirely"*, and in this lane the question is the **frozen
goal**. A finding is measured against the goal; a premise challenge disputes the
**yardstick**. Those cannot be the same object. It returns a **premise**, and
exactly two resolutions exist, both a human's: adopt it (`orc challenge goals
--set`, a `regoal` that bumps `goals.version`) or dismiss it with a mandatory
reason that stays in the report forever. **The judge never sees that report** —
handing a judge a document arguing the frozen goal is wrong would bend every
finding it produced afterwards.

> The three finding lenses feed **the judge**. The two non-finding lenses feed
> **the user**. That sentence is the whole architecture.

### The gate that makes five extra reviewers safe

The obvious failure of adding five reviewers is that the judge quietly ignores
four of them and the run looks identical while costing five times more.

> **Every id the council raised must appear in the judge's return with exactly
> ONE disposition and a reason. `council_coverage_pct` must be 100.**

That is conservation applied to **input** instead of to carry-forward, and the
CLI enforces it without reading a word of prose: the orchestrator writes a
machine JSON beside every council report, and **`orc challenge record` reads that
directory itself**. The judge cannot shrink the set by omission, because the set
was never the judge's to report.

```
❌ malformed verdict — council coverage is below 100% — every id the council
   raised needs exactly ONE disposition (adopted | merged | rejected |
   out-of-goal). Missing: O-003
```

**An adopted finding keeps the raiser's id.** `C-004` stays `C-004` in the
verdict, in the report, in iteration 9 — which is what lets the panel say *"the
contrarian raised four of the six blockers this iteration"*, and how a user finds
out within two rounds whether a lens is worth its money.

**PASS is computed exactly as before.** An adopted council finding is an ordinary
finding from that moment on; `challengeBlocking()`, `challengeOpen()`,
`challengeCounts()` and `challengeStateOf()` are untouched. The pass gate learns
nothing about the council.

### A selected role is never silently absent

Rule 6 (`NOT-CHECKED` is never silent), extended from dimensions to roles. A
roster lens returns either a report or an explicit `{ "lens": …, "ran": false,
"reason": … }`, and silence is rejected by name:

```
❌ malformed verdict — executor is on the roster but returned neither a report
   nor an explicit { "lens": "executor", "ran": false, "reason": "…" }.
   A selected role is never silently absent.
```

The trace carries it too, so `orc stats` and `/orc-retro` see a NOT-RUN lens and
not only the panel:

```
CHALLENGE iter=2 findings=P0:1/P1:3/P2:6 coverage=100% council=4/5 raised=C:6,O:3,E:2 adopted=9 verdict=FAIL
```

### Effort is a measurement, not a cost choice

`outsider` is `low` for the same reason the cold reader is: a harder-thinking
outsider reasons its way *around* an unexplained acronym and reports the document
is fine, which is exactly the gap the instrument exists to find. **Nothing may
ever upgrade it.** `contrarian` is `high` because at low effort it returns the
three surface complaints the free lint already caught for nothing.

That is why there is **no model or effort config key**: a key that lets
`outsider: low` be tuned is a key that lets the instrument be broken.

All seven lenses are `claude-opus-5`, so **`opus5_only` is a no-op for this lane —
it is unaffected, not exempt** — and the agent count moves 46 → 51 with no paired
variants.

### The reader / outsider seam

These two are the closest pair in ORC and the one place this release could have
shipped a duplicate instrument. The distinction is structural:

| | `reader` | `outsider` |
|---|---|---|
| Told the audience | **yes** | **no** |
| What it generates | 8–15 questions the artifact *promised* to answer | nothing — it reacts to what is on the page |
| What it returns | a **scored** questionnaire (`8/12`) | an **unscored** ranked list of assumed knowledge |
| The measurement | *can this be answered from the page?* | *what does this page assume you already know?* |

They are dispatched with no knowledge of each other. Where they agree, that is
recorded as `corroborated_by` — the strongest comprehension evidence the lane can
produce, and **never an automatic severity bump**.

### The roster is frozen, and `council: null` is a real state

Ledger `version: 2`, additive: every v1 key keeps its name, meaning and position.
The roster is a per-cycle **frozen** decision changed only by a recorded
`recouncil` event, which bumps `council_version` exactly like `goals.version` —
and the iteration rail draws a **third** version break for it, because comparing
an iteration judged by three lenses to one judged by six is not a comparison.

**There is no `challenge_council` config key.** A global default roster would
silently answer the one question this release exists to ask. A cycle opened
before v0.49.1 reads back with `council: null` and `record` refuses the next
iteration by name until it is answered — `orc challenge council <slug>` exits 1
for that state, because **UNSET is an answer, not an error**.

### New commands

| Command | Does |
|---|---|
| `orc challenge roles [--kind k] [--json]` | the lens catalogue. Static — it works with no cycle at all |
| `orc challenge council <slug> [--json]` | the frozen roster + per-iteration participation (0 set · 1 unset · 3 unknown) |
| `orc challenge council <slug> --set <csv\|all\|none> --reason "…"` | a recorded `recouncil` |
| `orc challenge note <slug> --from <json>` | opportunities and premises ONLY — it refuses a `findings[]` key by name |
| `orc challenge premise <slug> <id> --dismiss --reason "…"` | |
| `orc challenge opportunity <slug> <id> --take\|--drop --reason "…"` | |

### The panel

It **derives nothing**: it does not name a lens, does not know which class
blocks, does not compute a disposition and does not decide the suggestion. A test
greps the panel for every lens display name, every disposition word and every
agent name and fails if it finds one.

New: a **Council card** directly under the goal (a NOT-RUN row keeps its slot
with its reason; a NOT-SELECTED row is muted with the line that would add it; the
council executor's `monday_morning` list sits here, because it is the most
legible thing this lane produces for a non-engineer); a **premise card** that is
the loudest thing on the panel when one is open and sits *above* the findings; an
**opportunities card** with no severity colour anywhere in it; a lens chip and an
`also found by` chip on every finding; and a per-lens legend under the
convergence chart.

There is deliberately **no route for `council --set`** — changing the roster is a
decision with a recorded reason the *lane* takes in conversation.

### Deliberately absent

- **An anonymised peer-review round.** It doubles the dispatch count, and the
  judge's adoption pass already reconciles the lenses. The payoff — *"two
  advisors independently hit the same thing"* — is `corroborated_by[]` at zero
  extra cost.
- **A chairman agent.** ORC already has one: the advisor groups findings by root
  cause and orders the fix. Rule 5 still holds — no advisor on PASS.
- **A `challenge_council` key, any model or effort key, a `block` mode on a
  council output, a loop cap, and auto-severity from corroboration.**

---

## Part B — the knowledge deepening

### `--json is not a summary`

> A read's `--json` is the WHOLE computed object, not a summary. **A field the
> human path prints and the JSON omits is drift — and it is drift no lint can
> see, because both halves live in one function.**

`wikiStatus()` computes `computeWikiFreshness(...)` and the terminal branch
printed the per-doc FRESH/AGING/STALE counts, **the worst doc's filename** (the
thing actually pinning the tier), the top five stale docs with their own
distances, and the crosslink boundary state. The `--json` branch emitted five
scalars and `blind` **as a count**. The panel therefore *could not* be as
detailed as the terminal, no matter how it was written.

`wiki status --json` now carries `counts`, `worst`, `per_doc[]`, `blind_spot` as
the **file list it always was**, `orientation`, `crosslink`, and `free_repairs`
reused verbatim from `wiki plan` — a user must never be able to pay for what a
free step fixes. **Every legacy key keeps its name, position and meaning** (`orc
doctor`, the overview tile and `_shared/detecting-artifacts.md` all read them)
and the exit code stays 0 in every state.

### You can finally see what the wiki contains

`orc wiki` had six subcommands and **not one of them listed the docs**. A user
could learn the wiki was STALE with 14 docs and 47 commits of drift, and could
not learn what any of those 14 docs was about.

| Command | Returns | Exit |
|---|---|---|
| `orc wiki docs [--json]` | the doc table: tier, its OWN distance, covers, usage, tags, retire hint | 0 · 1 none · 3 unregistered |
| `orc wiki show <doc> [--body]` | one doc + its tags + the free repairs that apply to IT | 0 · 2 unreadable · 3 unknown |
| `orc wiki coverage [--json]` | % of tracked files covered by ≥1 doc, uncovered set by DIRECTORY | 0 full · 1 gaps |
| `orc pattern show <lang> [--body]` | headings, conventions vs invariants, flagged conflicts | 0 · 1 absent · 2 unknown key |
| `orc gotcha show <id>` | one entry, EVERY field | 0 · 3 unknown |
| `orc gotcha list --archived` | the archive | 0 · 1 none |
| `orc gotcha prune --dry-run` | exactly what eviction would archive, and why | 0 none · 1 would prune |

**`orc wiki coverage` is a REPORT and never a gate.** No threshold, no config
key, nothing branches on it — a repo that deliberately documents four subsystems
out of forty is not broken, and a coverage percentage that starts nagging becomes
a number people game. The uncovered set is collapsed to directories and ranked by
file count, because *"240 uncovered files, all in `vendor/`"* and *"12 uncovered
files, all in `src/payments/`"* are opposite situations.

**`--body` is opt-in** on both `wiki show` and `pattern show`: prose is returned
only on an explicit request, exactly one artifact at a time, rendered as DOM and
never as HTML.

**`orc pattern show` invents nothing.** The codifier may not write a parseable
header today; with none it returns `headered: false` plus the headings it could
parse, and says so in one line. It **never** derives a "codified at" from the
file's mtime — the `/orc-pact` UNCHECKABLE rule.

### Two doctor findings, and the restraint is the design

| id | Warns when | Fix |
|---|---|---|
| `wiki-unregistered` | the wiki is unregistered, drifted or corrupt | `orc wiki sync` — free, instant, and until it is done nothing can read the wiki at all |
| `wiki-debt` | tier is **STALE** and `wiki plan` has pending rows | `/orc-wiki refresh --top 2` |

**`wiki-debt` fires on STALE and never on AGING.** Aging is a normal state every
living repo passes through, and a doctor that warns about it is a doctor people
learn to ignore. Deliberately not added: `pattern-missing` — a project with no
cached pattern is not misconfigured, and warning about it would be ORC nagging
for a paid scan.

Both route to the Knowledge panel: *a caution routes to the panel that can CLEAR
it*, and `orc wiki sync` is a button there.

### `orc ui ▸ Knowledge` — five tabs

```
Knowledge   [ Wiki ] [ Coverage ] [ Code patterns ] [ Memory ] [ Peers ]
```

A header strip renders above them all — tier · docs · covered % · blind ·
pending · patterns · repair notes — and **a value the CLI could not compute
renders as an em dash, never as a guess.**

- **Wiki** — the tier card with the **worst doc named** (a hash is not something
  anybody can go and refresh), the per-doc counts as a stacked bar, free repairs
  above everything priced, and **the doc table**. A row expands in place, one at
  a time, detail fetched on first open.
- **Coverage** — one honestly-qualified number, the uncovered set by directory,
  the structural blind spot as the file list it always was, and one line that is
  not optional chrome: coverage is a report, not a target.
- **Code patterns** — per language, with **the conflicts the codifier flagged in
  their own block**: they are the most decision-shaped thing in the file and were
  invisible outside it. Reveal shows the text that is injected literally into
  every executor slice; a user who cannot read it cannot trust it.
- **Memory** — every field the CLI already emitted, headroom against
  `gotchas_max`, and a **preview-then-apply prune that names every entry** (a
  count is not consent). The archive is reachable and labelled recoverable.
- **Peers** — compact, read-only, every word the CLI's. It links to Crosslink and
  never duplicates its editor: one boundary, one picture.

### Guards

Five new agent files named explicitly in `verify-package.js` (floor 46 → 51,
skills unchanged at 38); five new contract-lint entries; a golden test comparing
`CHALLENGE_LENS_META` to `council.md`'s roster table; and one test per new read,
because `--json is not a summary` is drift no lint can catch.

`css/panels/knowledge.css` is a new file, so it is `<link>`ed in `app.html` **and**
named in `verify-package.js` — the manifest is the load order, and a file the
manifest forgot is a file the test suite never sees.

---

### v0.49.0 — the document is a folder, and the file is a build artifact _(2026-08-17)_

`/orc-doc` only. No other lane changes, and **zero new agents**.

Three quarters of what this release is about already existed: `orc doc plan`
already wrote one part file per section, the ids were already number-then-name,
the split already cut on `## ` alone, and `orc doc assemble` was already pure
Node — **zero model tokens, and it always was**. Anyone who tells you this
release made compiling cheaper is selling something.

What was wrong was the direction of the arrow.

#### `sections/` is the source of truth

`.work/` was scratch and `document.md` was the truth, so after the first
assemble every later change was *extract* (copy a section OUT of the monolith) →
edit → *splice* (write it back IN). The section files existed and were dead. A
resumed session, an update and a re-check all routed through the 10,000-line
file.

Now each section lives in `sections/<NN>-<slug>.md` — a real, visible folder you
can open, edit and read in a pull request — and **`document.md` is a build
artifact** that `orc doc compile` rebuilds from those files, for free, when you
ask. `orc doc split` goes the other way and recovers the sections from a
document a human reshaped by hand; **`split` then `compile` reproduces the file
byte for byte**, and there is a test.

The join key is the **filename**. No comment markers inside the files: an HTML
comment is a lint error in this lane and mangles on a Notion or Google Docs
import, and the deliverable's cleanliness is the lane's entire product. A marker
that buys nothing costs the import.

#### You can look before you buy the rest

`orc doc compile --partial` writes exactly the sections that exist and **names
the rest outside the document** — nothing is ever stubbed into the deliverable.
Paired with the new `doc_write_mode` (`ask` · `partial` · `all`, asked once per
run and stored), `orc doc plan --role write` returns **wave 1 only**, with
`more_waves: N`. You read what it wrote, and waves 2..N are bought only if wave 1
was right. That is the single biggest saving in the lane, and it has nothing to
do with the compile.

#### A wave is a stop you can walk away from

The write loop used to live in the orchestrator's head, and `/orc-doc`'s
`RESUME.md` sat in the document folder — where `orc resume` and `orc run list`
never look — carrying a `## Where it stands:` line that the line-anchored parser
**could never match**, and no phase and no wave even if it had.

All four are fixed. `RESUME.md` moves to `{run_dir}/{slug}/`, the line is at
column 0 and gains a `· phase D6 · wave 2 of 7` suffix (the byte-stable prefix is
untouched), and a test feeds the shipped template to the real `parseStands`. The
section files on disk ARE the progress, so `K of N` is **computed** by counting
waves whose sections are all hash-confirmed. A part on disk that no validated
return ever confirmed is `unconfirmed` — exactly what a usage limit leaves — and
it is re-written, never shipped.

#### The deliverable carries content only

`> **Open:**` and `> **Assumption:**` lines are no longer written into your
document, and the section state no longer sniffs the body text for them. This
does not relax "never invent a fact"; it moves where the honesty is written down.
A gap goes to `orc doc log --kind gap` and lands in a derived `gaps.md`, and is
raised with you.

`orc doc lint` gains `annotation-in-body` as an **error**, matching an exact,
narrow set of ORC's own markers and nothing else — a line of yours beginning
"Note:" is content and is never flagged. `compile` **reports** every match and
never silently strips one: we cannot tell whose line it is.

#### A live bug, fixed by construction

A slice covering two sections wrote **one** file, named after the first, while
`assemble` looked one up per outline id. The second section's file never existed:
if it was required, assemble refused forever; if it was optional, it silently
vanished from the deliverable. **One file per section** now, per slice entry, with
a regression test.

#### A section too big for one file

It splits **underneath** — `sections/04-detailed-design/{00-head,01-data-model,…}.md`
— cut on its own `### ` headings, which `docScan` already collected and merely
filtered out. The reader never knows: the compiled document has exactly one `## `
for it, and `orc doc map`, `lint`, `ship` and `audit` are completely unchanged.
Five refuse-and-name rules make the nesting safe, and a changed sub-part is
detected on its own, so a re-check inside a 900-line section reads ~150 lines.

**No new config key** for it: `doc_max_lines_per_agent` is already the threshold.

#### The rest

- **`doc_max_parallel` hard cap is now 2** (default 2, was 4/4). A larger value
  is clamped and the clamp is announced.
- **`orc doc parts`** is the new wave-boundary read, and the one that works
  before a single compile has ever run. `--confirm <ids>` is how a validated
  return becomes a recorded hash.
- **`orc doc ship` refuses on a stale `document.md`**, naming the sections —
  coverage-relative, one step earlier than `shipped-drifted`.
- **`orc doc audit`** gains `part-missing`, `part-orphan`, `part-misnumbered`,
  `part-unconfirmed`, `subpart-bad-level`, `document-stale`,
  `annotation-in-body`, `legacy-work` and `resume-misplaced`.
- **`orc doc outline --set` renames the files on disk** when a renumber moves
  them, in the same step.
- **A checker now reads ONE bounded part file**, so there is no line arithmetic
  anywhere in the check loop.
- The Docs panel gains a **Section files** card with nested sub-part rows, a wave
  strip, a compile button and a migrate button. It derives nothing new: the CLI's
  state words, verbatim.

#### Nothing is lost on the way

`doc.json` goes to `version: 2` and a v1 document migrates the first time you
touch it — lazy, free, idempotent, non-destructive. `document.md` is **never
deleted** (it becomes the build artifact, and starts life fresh rather than
stale), a pending extract wins as the newer edit, an `> **Open:**` stub does not
survive, `RESUME.md` is moved and its prefix stripped, and an **unparseable**
document is REFUSED with `version` left at 1 — a guessed structure is worse than
none. `assemble`, `extract` and `splice` survive as thin aliases for one release,
with their exit codes preserved.

---

### v0.48.1 — one file per thing, and a document that can be finished _(2026-08-16)_

Two halves, deliberately kept separate so that **any** behaviour difference
observed after this release is attributable to the second one and to nothing
else.

#### The panel is an architecture now

`bin/webui/` was four monoliths: a 6 500-line `app.js`, a 2 500-line
stylesheet, a 1 700-line fixture module and two 800-key string tables. Any
change to one panel meant paging through all of it to find three places.

It is now ~60 named files — one per panel, one per CSS layer, one per i18n
namespace, one per fixture set — and the **filename is the load order**, so a
future session never has to reason about dependencies.

- **Classic scripts, not ES modules,** and the constraint that decided it:
  `serve.js` requires the per-launch token on every static request, and **an
  `import` carries no query string**. A module graph would 401 on every import
  unless static auth were weakened, which was not on the table. Classic scripts
  also share one global lexical scope, so the split added no `import`/`export`
  and changed no call site.
- **`serve.js` builds its static map from a one-time walk at boot.** A request
  path is still a KEY LOOKUP in a frozen table, never a path join — directory
  traversal stays structurally impossible. Server-side code (`serve.js`,
  `api.js`, `fixtures/`) is never served.
- **Token stamping is generic.** Naming two files was fine when there were two;
  with ~55 the pattern has to be the rule, or the next `<script>` tag someone
  adds 401s silently. A test parses `app.html` and asserts every reference comes
  back stamped **and** resolves.
- **`06-responsive.css` and `04-motion.css` load last, and that is
  load-bearing.** Several reduced-motion rules are deliberately not
  `!important` — `.vault-pulse` and `.step-flow` are removed with
  `display: none`, because capping an infinite animation to one iteration
  freezes it mid-cycle — so an equal-specificity rule loading afterwards would
  win on order and switch the animation back on.
- **`verify-package.js` names every file AND asserts set equality** with the
  directory, in both directions: the agent-file pattern, applied to the panel.
- The test suite is split to match (`test/cli/`, `test/lanes/`, `test/webui/`),
  using an `appJs()` / `appCss()` helper that concatenates exactly what
  `app.html` loads — so a file the manifest forgot cannot hide behind a passing
  suite.

**No behaviour changed.** All 274 tests pass, all 17 panels render in both
themes and both languages with zero console errors, and the guided tour runs end
to end.

#### `/orc-doc` has a finish line

- **`orc doc next`** turns the pipeline from something the orchestrator
  REMEMBERS into something the CLI COMPUTES — the Flow-stepper shape, and for
  the same reason: D6–D9 was prose a session had to hold in its head across a
  resume that might be months later in a fresh context. Exit **0** = an action
  is available (`command`, plus `paid` so a caller knows button vs copy-able
  command), **1** = waiting on a human decision, **named** in `blocked_by`,
  **2** = unknown slug.
- **`orc doc ship` records delivery as a DECISION** (`/orc-pact`'s rule) while
  the resulting state stays **COMPUTED** (`/orc-challenge`'s rule). `--where`
  has **no default** — "shipped" with nowhere to point at is not a fact, it is a
  feeling — and shipping an incomplete document needs `--force --reason`,
  recorded verbatim. `unship` needs a reason and keeps the old record in
  `ship_history[]`.
- **`shipped-drifted` names the sections that moved,** by diffing the recorded
  per-section hashes against the live map. Coverage-relative, the
  `computeWikiFreshness` lesson applied to a document: a whole-file "something
  changed" cannot tell you what to re-read. It exits **1**, because the document
  moved after it was delivered and that is work.
- **`orc doc audit`** reports every drift class from disk — an extract never
  spliced back, an extract whose section moved under it, a heading a hand edit
  deleted or added, a target that no longer matches the file, a reference file
  that moved, a cycle count that disagrees with itself — each with a fix command
  and the panel that can clear it. A hand-edited section is **reported and never
  counted as a finding**: flagging it would teach people to stop editing their
  own document. `orc doctor` gains a `doc-drifted` finding routed to Docs.

#### And it remembers what you asked for

This was a **data** gap, not a rendering one. `created_at` existed and
`orc doc show --json` never emitted it; `context.md` and `context-sources.md`
were files the CLI never opened; and what the user actually ASKED FOR, in order,
across every session, lived nowhere at all.

- **`orc doc log` / `journal`** record and serve it. The journal merges four
  sources into one chronological array with the provenance of every row attached
  — `recorded` (the user's own words, verbatim), `derived` (a cycle, a ship
  record), `observed` (a section that turned `user-edited`) — and **it never
  invents an entry**: a cycle that ran with nothing logged renders as an explicit
  gap, never a plausible reconstruction from file mtimes. The `/orc-pact`
  UNCHECKABLE rule: not knowing is an answer, and faking it teaches people to
  distrust the rows that are real.
- **`orc doc context`** returns the frozen brief — the verbatim request first,
  because that is the memory-regain payload — plus the D2 reference table with a
  live state per file: `ok`, `MISSING`, `SOURCE-DRIFTED`. A source is stale
  only when THAT FILE moved, never because the repository did, and it is a
  **warning, never an error**: a frozen context is *supposed* to be old.
- **`orc doc read`** is a reader for the HUMAN — and the rule table says out
  loud that the orchestrator never runs it, registered as a contract token so
  the sentence cannot quietly disappear.
- **The Docs panel is rebuilt around this: MEMORY FIRST, state second.** The
  header strip, the brief, the reference files and the journal come before the
  ribbon — because a user coming back after three weeks did not come back to ask
  what state the document is in.

#### One more way in

D4 and D5 gain a `RETURN-TO` suspend into **`/orc-grill`** — gated on all
three of the `_shared/lane-suspend.md` tests (a DECISION not a fact, a
PREREQUISITE that changes the option set, a SUBTREE with more than one question
hanging off it), or it asks inline. The snapshot is **run state, never the
deliverable**, so hard rule 10 still holds; and on resume the lane re-writes
`.current` and touches the trace file in the same step, because `/orc-grill`
deleted the pointer at its own `FINISH`. Two traces for one document is
correct — two lanes ran.

---

### v0.48.0 — a document long enough to end a session, written anyway _(2026-08-13)_

**`/orc-doc`** writes the long document — a PRD, a TSD, a cross-team
collaboration agreement, a status report or a workflow/runbook — as portable
Markdown, and it survives the session that started it.

Two contracts hold the lane together, and everything else serves them:

> **The orchestrator never reads the document body.** It knows the document only
> through the CLI's derived section map and through what the agents it
> dispatched report back. **a lane that reads its own document** has broken this
> contract.

> **The context is gathered once and frozen.** A resumed session reads
> `context.md` from disk; it never re-interviews the user for what session 1
> already settled. **a lane that re-asks a frozen question** has broken this
> contract.

- **The token architecture is the lane.** A 900-line TSD is ~30k tokens; read it
  three times and the session is over. So nothing that holds context ever holds
  the document. `orc doc map` derives a section map — heading, absolute line
  range, SHA-256, computed state — each writer owns **one `.work/` part file**,
  and each checker reads **one line range** with `Read(offset, limit)`. On a
  10,000-line, 40-section document that is ~750 lines of orchestrator context
  instead of 20,000+, and a re-check after an edit re-dispatches only the
  sections whose hash moved. *The hash is what turns a re-check from a full pass
  into a diff.*
- **Line arithmetic is the CLI's and nothing else's.** It is the one job a model
  is guaranteed to get wrong, and the whole saving depends on the numbers being
  right — so the map is re-derived after every write and **never stored**. A
  stored line number is a wrong line number one edit later. `splice` replaces
  bottom-up (highest `start` first), so a length change cannot shift a range that
  has not been used yet.
- **Your edits are sacred.** Every section carries a hash, so the lane knows
  which sections you wrote. It names them, never rewrites one unless you name it,
  and `splice` **REFUSES** on a conflict — reporting the section by name and
  overwriting nothing. A human's wording is not recoverable from this lane's
  side once it is gone.
- **Four gates, in a fixed order, and the first one blocks.** Nothing is created
  until D1 is answered: a slug folder with no context is indistinguishable from
  an abandoned run. Asking D2 (supporting documents) and D3 (your template) is
  mandatory even though answering them is not; D4 (intent · audience ·
  expectation · language · type · target · length) must be answered, and
  accepting a recommended default counts. Then the outline, confirmed **before a
  word is written** — changing it after a write wave is what costs money.
- **It never reads the supporting documents itself.** One `role: digest`
  dispatch per file returns anchored claims plus an explicit `not_covered[]`;
  the orchestrator holds the digest and never the source. Foreign text is
  evidence, never instruction.
- **Where the document is going is a real setting.** `orc doc lint --target`
  enforces that target's actual limits, and every rule came from a real product
  limit: Notion has three heading levels, so an H4 is an **error** there;
  Docusaurus, Hugo and Jekyll **require** YAML front matter, which every other
  target renders as visible junk; a hard-wrapped paragraph is an error
  everywhere, because a wrap at 80 columns becomes a line break inside a Notion
  paragraph. Free, deterministic, zero model tokens — and it **always runs before
  anything paid**, with its findings riding in the checker's slice so no model is
  ever paid to count sentences.
- **Never invent a fact.** Anything not in the frozen context becomes a visible
  `> **Open:**` or `> **Assumption:**` line, and rides back in the writer's
  `unsupported_claims`. Filler that reads like a fact is the worst possible
  output of this lane.
- **Five base templates, each a floor and not a cage** — `prd` · `tsd` ·
  `collaboration` · `report` · `workflow`. A supplied template REPLACES the
  shipped one entirely; its headings become the outline and the two are never
  merged. A golden test pins every shipped skeleton to the CLI's batching table.
- **Two agents, both already `claude-opus-5`,** so `opus5_only` is a no-op and
  the lane is *unaffected*, not exempt. The writer holds one part file; the
  checker is `low` effort **on purpose** — a harder-thinking checker reasons its
  way past a gap a real reader would trip on, the same reasoning that pins
  `/orc-challenge`'s cold reader at `low`. Nothing may upgrade it.
- **`/orc-grill` and `/orc-brainstorm` gain a "write this up" exit**, so an
  interview's settled decisions arrive as a pre-answered D1 and D4 and the user
  only confirms. At handoff `/orc-doc` offers `/orc-challenge` — in a separate
  session, which is the separation `/orc-challenge`'s own contract already
  enforces from the other side.
- **The `orc doc` CLI family** (13 subcommands, every read `--json`, every one an
  exit-code contract), four config keys (`doc_max_lines_per_agent`,
  `doc_max_parallel` with a **hard cap of 4**, `doc_language`, `doc_dir`), and a
  **Docs panel** in `orc ui` whose ribbon draws the whole document in one
  picture — one block per section, sized by its length and coloured by its state.
- Counts move: **skills 37 → 38 · commands 28 → 29 · agent files 44 → 46.**

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
