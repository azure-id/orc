# `orc ui` — the change table

<!-- orc-ui-wiki:meta
source_commit: 5666ba7
covered_files: bin/webui/**, bin/cli.js (the --json surface), test/webui/**
written: 16-08-2026 (v0.48.1, from the finished tree)
updated: 24-08-2026 (v0.53.4 — the reload puts the token back on the URL)
updated: 30-08-2026 (v1.0.0 W16 — the Lanes panel, the rank ladder, the demotion row)
updated: 04-09-2026 (v1.3.0 — the CLI Hook Interface: the board, the preview, the gallery)
updated: 05-09-2026 (v1.4.1 — the hook board: staged ops, the three modals, drag)
updated: 05-09-2026 (v1.4.2 — the hook board: repaint not refetch, the live editor, six slots, the terminal preview)
-->

> **LOCAL ONLY. Never `git add` this file.** It joins the untracked `*-plan.md`
> family. It is not in `CHANGELOG.md`, not in the README, and not in any commit
> message.

**The goal this file exists to hit:** a session that has to change one thing in
`orc ui` should read **this file and at most two source files** — never
`app.js`, never `app.css`, never a full string table. (Those first two no longer
exist; that is the point.)

---

## 1. The one-screen map

```
browser  ──HTTP──▶  serve.js  ──▶  api.js  ──subprocess──▶  node bin/cli.js <cmd> --json
                    │                │
                    │                └─ READS  (GET)   →  argv builder per route
                    │                   WRITES (POST)  →  argv builder per route
                    │
                    ├─ STATIC: built by ONE walk at boot. A request path is a KEY
                    │  LOOKUP in a frozen table, never a path join.
                    ├─ token: per-launch, required on EVERY request, stamped onto
                    │  every href/src as app.html goes out.
                    ├─ Host guard: loopback literals only (DNS-rebinding).
                    └─ CSP: default-src 'none'; script-src 'self'; style-src 'self'
```

**The boundary sentence, and it is the whole design:** *it never runs a lane and
never does agentic model work.* **NARROWED at v0.50.0:** the one model-shaped
thing it can trigger is a CONNECTIVITY PROBE (`orc extra ping`), and even that is
a `bin/cli.js` subprocess like every other action — so the HTTPS call is the
CLI's, not this server's. A probe is a diagnostic, the family `orc doctor` is in;
the panel still composes no request body and still spawns no `claude`. Every byte
it serves or writes comes from `bin/cli.js`. That is why UI/CLI drift is structurally
impossible and why every validator, every `LEGACY_KEYS` alias and every
shadowing announcement comes for free.

---

## 2. The change table — the payload of this document

| I want to change… | Open… |
|---|---|
| what the **Overview** panel shows | `bin/webui/js/panels/overview.js` |
| what **Settings** shows | `js/panels/settings.js` (+ `js/06-edit.js` for staging) |
| what **Lanes** shows | `js/panels/lanes.js` + `css/panels/lanes.css` |
| what **Rules** shows | `js/panels/rules.js` + `css/panels/rules.css` (+ `js/06-edit.js` for the ledger textarea) |
| what **Runs** shows | `js/panels/runs.js` |
| what **Knowledge** shows | `js/panels/knowledge.js` + `css/panels/knowledge.css` |
| what **Stats** shows | `js/panels/stats.js` + `css/panels/stats.css` |
| what **Docs** shows | `js/panels/docs.js` + `css/panels/docs.css` |
| what **Wait** shows | `js/panels/wait.js` + `css/panels/wait.css` |
| what **CLI Hook Interface** shows | `js/panels/hookui.js` + `css/panels/hookui.css` |
| what **Challenge** shows | `js/panels/challenge.js` + `css/panels/challenge.css` |
| what **Promises / Boundary / Self-serve** show | `js/panels/{pact,boundary,handoff}.js` |
| what **Extra** shows | `js/panels/extra.js` + `css/panels/extra.css` |
| what **Test** shows | `js/panels/test.js` + `css/panels/test.css` |
| what **Flow** shows | `js/panels/flow.js` + `css/panels/flow.css` |
| what **Crosslink** shows | `js/panels/crosslink.js` + `css/panels/crosslink.css` |
| what **Learn / Mocked Skill Use** show | `js/panels/{learn,mockrun}.js` |
| what **Experiment / Maintenance** show | `js/panels/{experiment,maintenance}.js` |
| **wording** on any panel (en/id) | `i18n/{en,id}/<panel>.json` — and read `i18n/TERMS.md` first |
| **fixtures** for a panel | `fixtures/<panel>.js` |
| **tests** for a panel | `test/webui/panels.test.js` |
| a **new endpoint** | `api.js` `READS` (GET) or `WRITES` (POST) — **and `bin/cli.js` first** |
| a shared **card / chip / modal / kvList** | `js/02-ui.js` + `css/03-components.css` |
| **any animation**, or reduced-motion | `css/04-motion.css` — **only** here |
| a **width breakpoint that crosses panels** | `css/06-responsive.css` |
| a **colour** | `css/00-tokens.css` — **only** here |
| the **rail / nav order** | `app.html` + `i18n/*/nav.json` |
| the **tour** | `js/90-tour.js` + `css/05-tour.css` |
| **keyboard shortcuts** | `js/91-shortcuts.js` |
| **markdown rendering** | `js/03-md.js` |
| the **update banner / changelog modal** | `js/05-banners.js` + `i18n/*/banner.json` |
| **routing / the panel shell** | `js/04-router.js` |
| **boot order** | `app.html` (the manifest) — and `js/99-boot.js` stays last |
| **a config key in the panel** | **nothing.** It comes free from the CLI |

---

## 3. The load order, and why it is the filename

`app.html` carries **the** asset manifest. The `<link>` order is the cascade
order; the `<script>` order is the evaluation order. The numeric prefix IS that
order, so nobody ever has to reason about dependencies.

```
css/  00-tokens  01-base  02-shell  03-components  panels/overview  05-tour
      panels/{settings,lanes,runs,stats,flow,crosslink,learn,mockrun,experiment,
              maintenance,pact,boundary,handoff,challenge,docs}
      06-responsive        ← after every panel it overrides
      04-motion            ← LAST. See §5.

js/   00-core  01-i18n  02-ui  03-md  04-router  05-banners  06-edit
      panels/{overview,settings,lanes,runs,knowledge,stats,flow,crosslink,learn,
              mockrun,experiment,maintenance,pact,boundary,handoff,challenge,docs}
      90-tour  91-shortcuts  99-boot   ← 99-boot MUST be last
```

**Classic scripts, never `type="module"`.** An ES module `import` carries no
query string, so every import would 401 against the per-launch token unless
static auth were weakened — which is not on the table. Classic scripts also mean
every top-level `function` and `const` lands in ONE shared global scope, which is
why the v0.48.1 split needed no `import`/`export` and changed no call site.

**The only real load-order constraint** is that nothing may READ another file's
binding while it is still in TDZ — i.e. at load time. There are exactly three
top-level statements in the whole set: `"use strict"`, the `TOKEN` guard (which
reads only its own file's const), and `boot()` in the last file.

---

## 4. One card per panel

Every panel: route hash · rail shortcut · endpoints (with the CLI argv behind
them) · its JS · its CSS · its i18n namespace · its fixtures · the state words it
renders verbatim.

| panel | hash | key | endpoints → CLI |
|---|---|---|---|
| Overview | `#/overview` | `1` | `/api/overview` → composed; `/api/doctor` → `doctor` |
| Settings | `#/settings` | `2` | `/api/config` → `config list`; POST `/api/config/set|reset` |
| **Lanes** | `#/lanes` | `l` | **`/api/lanes`** → `lane list`; **`/api/lane/phases`** → `lane phases <lane>`; **`/api/lane/calls`** → `lane calls --all` |
| **Rules** | `#/rules` | `r` | **`/api/rules`** -> `rules`; **`/api/rules/user`**; **`/api/rules/packs`**; **`/api/rules/credits`**; **`/api/rules/lint`** -> `rules lint <path>`; POST **`/api/rules/setAll`** -> `rules set-all --text`. FIVE CARDS: the precedence ladder (always open - it is the thing people get wrong), your ledger in ONE textarea, the 65 read-only rules behind a filter and a per-pack `<details>`, the credit table, and the lint. There is deliberately NO route for the SHIPPED packs: they are read-only, `orc rules set --pack` is refused by name, and a control that exists only to be refused is a control that lies. `--reset` has no route either - throwing away a project's standing rules is a CLI act. State words rendered verbatim: `HARD` / `PURPOSE` / `LOCK` - `P0` / `P1` / `P2`. The 65 rule TEXTS stay English in every locale: they are shipped content that ids point at, and a translated rule is a different rule. JS `js/panels/rules.js` - CSS `css/panels/rules.css` - i18n `rules` - fixtures `fixtures/rules.js` |
| Runs | `#/runs` | `3` | `/api/runs` → `run list`; `/api/run` → `run show`; `/api/aftermath`; POST **`/api/run/{close,reopen}`** |
| **Wait** | `#/wait` | `w` | **`/api/usage`** → `usage check` (0 ok / 1 low / **2 unknown**); **`/api/wait/lanes`** → `wait lanes`; **`/api/wait/status`** → `wait status`; POST **`/api/wait/{unblock,cancel}`** — both UNDO something. There is no `start` and no `block`: a wait lives in a Claude Code session, and a block needs a reason typed in the moment. State words rendered verbatim: `ok` · `low` · `unknown` · `full` · `docset` · `entry` · `cycle` · `snapshot` · `none`. JS `js/panels/wait.js` · CSS `css/panels/wait.css` · i18n `wait` · fixtures `fixtures/wait.js` |
| Knowledge | `#/knowledge` | `4` | `/api/wiki`, `/impact`, `/{plan,debt,usage}`, **`/docs`, `/show`, `/coverage`**, `/api/patterns`, **`/api/pattern/show`**, `/api/gotchas`, **`/archived`, `/api/gotcha/{show,prune/preview}`**; POST `/api/wiki/sync`, `/usage/rebuild`, `/api/gotcha/prune`. v1.7.0 adds the ONE-DOC card: **`/api/wiki/resolve`** -> `wiki resolve <topic>` (0 match / 1 new / 2 ambiguous / 3 no wiki) and **`/api/wiki/refs`** -> `wiki refs --check`, which is `--check` ALWAYS because opening a panel must never write to a repo. AMBIGUOUS renders every candidate and offers NO command until a human picks one. v1.8.0 adds **`/api/graph`** -> `graph status` (0 fresh / 1 none / 2 drifted / 3 off — every code is DATA) and POST **`/api/graph/update`** -> `graph update`, which is FREE (parser only), so it is a button. The enhancement waves add `generation`/`gen_id` to that same answer; the card shows them and adds NO route. v1.8.2 adds **`/api/graph/gain`** -> `graph gain` (0 rows / 1 no ledger / 3 off) on load, and **`/api/graph/gain/measured`** -> `graph gain --measured` on a BUTTON, because it reads Claude Code's transcripts. |
| Stats | `#/stats` | `5` | `/api/stats`, `/api/budget/{forecast,rates,actual}` |
| Docs | `#/docs` | `d` | `/api/doc`, `/one`, `/show`, `/map`, `/lint`, `/plan`, `/section`, `/next`, `/audit`, `/journal`, `/context`, `/parts`, **`/rules`, `/rules/one`, `/forecast`, `/cost`**; POST `/ship`, `/unship`, `/assemble`, `/compile`, `/migrate`, **`/rules/setAll`, `/rules/sync`** |
| Challenge | `#/challenge` | `c` | `/api/challenge`, `/one`, `/show`, `/diff`, `/lint`, **`/roles`, `/council`**; POST `/accept`, `/rebut`, `/report`, **`/premise`, `/opportunity`** |
| Promises | `#/pact` | `p` | `/api/pact` → `pact list` |
| Boundary | `#/boundary` | `b` | `/api/boundary` → `boundary list` |
| Self-serve | `#/handoff` | `h` | `/api/handoff` → `handoff map` |
| Flow | `#/flow` | `6` | `/api/diy` → `diy show`; POST `/api/diy/{set,init}` |
| Crosslink | `#/crosslink` | `7` | `/api/crosslink`; POST `/api/crosslink/{add,remove}`; `/api/fs/list` |
| Learn | `#/learn` | `8` | `/api/learn` → the onboarding module (static content) |
| Mocked Skill Use | `#/mockrun` | `m` | `/api/mockruns`, `/api/mockrun` → `mockrun-catalog.js` |
| Experiment | `#/experiment` | `9` | `/api/experiment`; POST `/api/experiment/launch` |
| Extra ▸ Recovery | `#/extra` | `e` | **`/api/extra/demotion`** → `extra demotion` (0 armed · 1 demoted · 2 no run open); POST **`/api/extra/promote`** → `extra promote <run> --reason` |
| **CLI Hook Interface** | `#/hookui` | `s` | **`/api/statusline/{show,components,presets,preview,explain}`** → `statusline …`; POST **`/api/statusline/{set,move,remove,line,doc,group,expand,clone,apply,reset,compile}`** (`doc` is the DOCUMENT-level writer — colour set, symbols; `line` is per-line). The panel DERIVES NOTHING — component ids, renderer names, glyph sets, ramps, colour tokens, state words, the board's own rules and the per-renderer SAMPLES all arrive from `statusline components --json`, and a test greps the panel and both string tables for every one of them. Its preview renders through the SAME module the hook does (`templates/hooks/orc-statusline-render.js`), so what the panel draws and what the bar prints cannot diverge. JS `js/panels/hookui.js` · CSS `css/panels/hookui.css` · i18n `hookui` · fixtures `fixtures/hookui.js` |
| Maintenance | `#/maintenance` | `0` | `/api/maintenance`, `/api/job`; POST the previewed writes; POST `/api/ui/restart` (v0.53.2) |

**The state words are the CLI's, verbatim.** `HOLDING` / `DRIFTED` /
`UNCHECKABLE` / `BROKEN` · `EXECUTE` / `ESCALATE` / `REFUSE` · `FRESH` / `AGING`
/ `STALE` · `READY` / `STALE` / `UNCONFIGURED` · `planned` / `written` /
`checked` / `user-edited` / `open` / `unconfirmed` · `not-started` / `in-progress` / `complete` /
`shipped` / `shipped-drifted` · **`waiting` / `closed` / `done` / `empty`** ·
**`P0` / `P1` / `P2`** · **`UNREADABLE`** · **`resolved` / `partly-resolved` /
`not-read` / `inert` / `demoted` / `absent`** (the rank states, published by the
CLI as `rank_states` and rendered as a legend so an unfamiliar chip is readable
without leaving the page) · **`armed` / `demoted`** · `HELD` / `CHURN` / `REVERTED` / `TOO_RECENT` /
`SHALLOW` · `ok` / `MISSING` / `SOURCE-DRIFTED` · **`RAN` / `NOT-RUN` /
`NOT-SELECTED`** · **`finding` / `opportunity` / `premise`** · **`adopted` /
`merged` / `rejected` / `out-of-goal`** · **`open` / `taken` / `dropped` /
`dismissed`** · every **lens id** (`judge`, `reader`, `contrarian`, `outsider`,
`executor`, `principles`, `expansionist`) and every **route**
(`brainstorm` / `pact` / `grill` / `none`). Never a friendlier synonym: a
second vocabulary is drift no lint can see.

### 4a. Challenge — the council (v0.49.1)

**The panel names no lens.** `orc challenge roles --json` is the catalogue and
the panel is one of its three renderers — the Flow-stepper rule applied to a
second table. A test greps `js/panels/challenge.js` for every lens display name,
every disposition word and every agent name and fails if it finds one.

In the order a human reads them:

| # | Card | The rule it keeps |
|---|---|---|
| 1 | the goal | unchanged, still first |
| 2 | **Council** | one row per roster lens. A **NOT-RUN row keeps its slot with its reason**, and a **NOT-SELECTED row is muted** with the one line that would add it — filtering either out makes "the contrarian found nothing" and "the contrarian never ran" identical. The council executor's `monday_morning` list renders here, because it is the most legible artifact this lane produces for a non-engineer |
| 3 | **Premise challenges** | when one is open this is the **loudest card on the panel** and it sits ABOVE the findings, because a premise disputes the yardstick every finding below it was measured against. *Dismiss* is a free write and a button; *change the goal* is a copy-able command, because it needs a FILE the panel must not invent |
| 4 | Findings | each gains a **lens chip** and, where present, `also found by: …`. Corroboration is a SIGNAL, never a severity bump |
| 5 | **Opportunities** | its own card, **no severity colour anywhere in it**. An opportunity never blocks and never has one; colouring it like a defect is the exact confusion the class split prevents |
| 6 | Convergence | keeps severity stacking (a bar that works does not gain a second dimension) and gains a **per-lens legend row** underneath |
| 7 | Iteration rail | `council_version` is a **THIRD** version-break trigger, labelled `c2` — an iteration judged by three lenses and one judged by six are not comparable |

There is deliberately **no route for `council --set`**: changing the roster is a
decision with a recorded reason the *lane* takes in conversation — the same
reasoning that keeps `orc doc log` and `orc doc mode` off the panel.

### 4a2. Docs — house rules, the run map, and what it cost (v0.49.2)

Three cards, and none of them decides anything: not a priority, not an order, not
a wave shape, not a number.

| # | Card | The rule it keeps |
|---|---|---|
| 0 | **House rules** — at the TOP of the panel, ABOVE the document list | it is a **project** fact, not a property of one document. **v0.49.5 — the ledger is a TEXT CONFIG, so the control is ONE TEXTAREA**: no priority dropdown, no one-line input, no Add button, no per-rule row, no enable toggle. The textarea holds the whole file (`orc doc rules --json`'s `text`) and Apply writes it back with `orc doc rules set-all` — **one write route**. Writes are still **staged and batched** (`editSet` / `editBar` / **`applyActions`**, the v0.44.1 rule): nothing is written until Apply, the pending edit is NAMED, typing the text back to what it was **clears** the edit, a refused write never aborts the rest. A **migration note** from the retired row store is never silent and says what it did NOT carry over. The **boundary sentence renders always, never on hover**, and it is the CLI's own words. The **file path is shown**, so a user who would rather use their own editor does not go hunting. `--set-file` and `--reset` deliberately have **no route** |
| 6b | **House rules frozen into this document** | the frozen text, plus a drift that **NAMES every priority block that moved** and shows what the project says now — never a "rules changed" chip. Each block renders in a `pre-wrap` box, VERBATIM: the user's own words, wrapped but never re-flowed. **Re-freeze** is a free, confirmed write whose confirmation says out loud that **nothing is re-written** |
| 6c | **The run map** | the wave table, the **stacked four-kind token bar** (cache-read stays visibly its own band), the sample count, and the low-confidence warning — **not optional chrome**. A FREE recompute gets a **button**; the `--naive` floor is a **copy-able command**. A refusal for no history KEEPS ITS SLOT and says why |
| 6d | **What this document cost** | per section, joined across every session. A section nothing joins renders **`—`, never `0`**, and keeps its slot; `unattributed` is printed **including when zero**; the three honesty lines are rendered verbatim |

The token bar is sized by a **CSS custom property** (`--w`), never an inline
width: the panel's CSP is `style-src 'self'` and a style attribute is blocked
outright. Same technique as the challenge convergence bar.

**Which model writes this document** (v0.52.0). `orc doc extra <slug>` is a
per-document switch (`off` · `writer` · `checker` · `both`, default `off`) because a
global `extra_roles` turning Extra on for a throwaway runbook also turns it on
for the PRD you ship — **a document's voice is the deliverable**. The card
renders the CLI's resolution order, its shadowing sentence (a document set to
`both` while `extra_roles` names neither role resolves to **off, and says so**)
and, because this lane pins its agents, the writer's band with **both edges** and
whether they agreed. The row chip appears only when it is not `off`.

### 4a3. Runs — marking a run as done (v0.49.2)

`RESUME.md` existing IS the unfinished flag, so an abandoned run was waiting
forever — and that is what blocked the upgrade preview. The row now offers **Mark
as done**: a confirmation that **names the file that MOVES**, says in as many
words that nothing is deleted, and **requires the reason** (the CLI refuses
without one; the form does not second-guess it). A closed row keeps its slot, its
`closed` chip and the reason it was closed with, and offers **Reopen**. The same
button is inline on the Overview waiting card — **a caution routes to the panel
that can CLEAR it**, and here that panel is the one complaining.

**v0.54.0 — one more line, and only when there is something to say.** A foreign
dispatch that never reported back is money spent and work half-done that nothing
will look at again unless somebody is told, so the Overview draws
`extra_journal.orphans` as a single row that **navigates to Extra ▸ Recovery**.
It declares `.no-caret` and fills the three columns that variant has — the
v0.49.2 card contract, and the reason this card and the Docs list each once
printed a chip over a slug. **It reports and never resumes:** continuing a third
party's unfinished write without asking is the same class of act as routing off
Claude without saying so.

### 4b. Knowledge — five tabs (v0.49.1)

The Crosslink two-tab precedent. One scrolling column was already six cards long
and this release roughly tripled the content.

```
Knowledge   [ Wiki ] [ Coverage ] [ Code patterns ] [ Memory ] [ Peers ]
```

A **header strip** renders above the tabs on every one of them — tier · docs ·
covered % · blind · pending · patterns · repair notes. Every value is
CLI-computed, and **a value the CLI could not compute renders as an em dash,
never as a guess or a zero.**

| tab | what it adds | the rule it keeps |
|---|---|---|
| **Wiki** | the tier card with the **worst doc NAMED**, the per-doc counts as a stacked bar, free repairs ABOVE everything priced, **the doc table**, and the orientation doc's one line | a row **expands in place**, one at a time, detail fetched on first open — the Runs-row rule. There is no detail box below the table |
| **Coverage** | one honestly-qualified number, the uncovered set collapsed to DIRECTORIES and ranked by file count, the structural blind spot as the FILE LIST it always was | one line, always present and **not optional chrome**: coverage is a report, not a target. No threshold exists anywhere |
| **Code patterns** | per language: headings, conventions vs invariants, and **the codifier's flagged conflicts in their own block** | Reveal shows the text injected LITERALLY into every executor slice. An unheadered file says so in one line and no date is derived from an mtime |
| **Memory** | a row that expands into every field the CLI already emits, headroom against `gotchas_max`, and the archive | **preview-then-apply**: Apply stays disabled until a preview was fetched, and **the preview names every entry** — a count is not consent |
| **Peers** | linked repos, their state and freshness words as the CLI computed them | read-only, and it **never duplicates Crosslink's editor** — one boundary, one picture |

**v1.8.0 — the code graph card** sits on the Wiki tab under the one-doc card, and
the header strip gains a `graph` value. Both render `orc graph status --json`
and derive nothing: the state word (`FRESH` · `DRIFTED` · `NONE` · `OFF`) is the
CLI's, the `notes` row shows the config VALUE of `code_graph_notes` untranslated,
and a value the CLI did not send renders as an em dash. `orc graph update` is a
button because it is free. An OFF graph shows the one command that turns it on,
`orc config set code_graph on`, as copy-able text — never a button, because
turning a feature on is the user's decision. The fixture is DRIFTED on purpose.
Since W9 round 2 the JSON also carries `line` and `trace` — the words a lane
copies into the chat and the trace. The card renders neither, but the fixture
carries both, because `fixtures.test.js` compares its keys with the live answer.

**The enhancement waves add two rows and one note, and nothing else.** The card
now shows **Generation** (`meta.generation`, with `gen_id` beside it) — the
number every card, every return and every trace line quotes, so the panel must
show the one that is on disk right now. And it carries a standing note that the
map keeps itself current: a read repairs the files it is about to answer for,
and the installed hook updates the map when a worker finishes. That note is
there for a reason a panel cannot show otherwise — a DRIFTED state with an
update button beside it invites a click that something else may already be about
to make unnecessary. Nothing new is derived and nothing is computed in the
browser; both values come straight from `orc graph status --json`, which is the
rule this whole panel is built on.

**v1.8.2 — the gain strip** sits at the foot of the same card and renders
`orc graph gain --json`, exactly, deriving nothing. It says THREE different
things and never merges them:

- **paid** — the tokens the graph put into a context. Recorded, exact.
- **avoided** — what a read ladder would have cost instead. **An ESTIMATE**, and
  always a RANGE. The word "estimate" is part of the string, never a tooltip,
  and there is no single-number form of this row anywhere in the panel.
- **measured** — behind a button (`/api/graph/gain/measured`), because it reads
  Claude Code's transcripts and takes longer than a panel load should. It prints
  nothing until this project has three runs with the graph ON and three with it
  OFF, and every delta it does print carries its N and the OFF group's own
  spread in the same sentence — a delta smaller than that spread is noise.

An empty ledger is a sentence, never a zero: a project that has never read the
graph and a project that saved nothing are different facts. Both fixtures
(`graphGain`, `graphGainMeasured`) carry the estimate word and the range,
because those are the two things this strip must never lose.

The hook's own counters (`GRAPH-HINT`) are NOT on this card. They belong to a
RUN, not to the map, and the panel that owns a run is Runs — putting them here
would mix two lifetimes on one card. The gain strip's `hints` row is a
different number: it counts what the hints COST across the whole project, which
belongs to the map's ledger, not to any one run.

`css/panels/knowledge.css` is NEW, so it is `<link>`ed in `app.html` **and**
named in `verify-package.js`. The manifest is the load order, and a file the
manifest forgot is a file the test suite never sees.

---

### 4c. Extra — work that runs somewhere else (v0.50.0, connections v0.51.0, the deadline v0.52.0, five tabs + the band ladder v0.53.0, **the spend log v0.53.2**, **recovery v0.54.0**, **the stall v0.56.1**)

`#/extra`, key `e`, above Flow. Thirteen READ routes plus **seven** writes and
**three dedicated POST branches** — more surface than any other panel, because it is the
only one that can send this repo's source code to a third party.

**IT IS TABBED AS OF v0.53.0**, and the table below is now a table of what is on
which tab. Measured on `--fixtures` at 1440px it was **8,786px of unbroken
scroll across nine cards, none of them collapsible** — no first step, no last
step, no way to be *done* with a section. Five tabs on the panel's own
precedent (Knowledge's five, v0.49.1; Crosslink's two, v0.43.7; the shared
`.tabs` / `.tab-pane` in `runs.css`):

| tab | holds | why together |
|---|---|---|
| **Setup** | the boundary paragraph · tools on this machine · your connections | the whole first-run path, in the order you walk it |
| **Routing** | the band ladder · **the POSITIONS ladder** (v0.55.0) · which lane routes foreign | a band is arithmetic; the lane is the decision, and they were two cards you scrolled between. The positions sit UNDER the bands rather than in a seventh tab: they are two answers to one question, and reading them apart from each other is how a doc checker ended up resolving the writer's band for a release |
| **Limits** | the guardrails | rules, not state |
| **Spending** | what it ran and what it cost · rates · **how often each connection finishes** | reading, never writing |
| **Recovery** (v0.54.0) | dispatches that did not finish · delete old records · **the run's DEMOTION state** (v1.0.0 W5) | a POSITION on disk is a different question from a cost — and a run that left its provider is a third one, cleared from the same tab by the same kind of one-command action. **The demotion row KEEPS ITS SLOT when nothing is demoted** (`armed`), because "this run is still routing" and "there is no demotion mechanism" must never look the same |
| **Providers** | the shipped catalog | reference |

Three rules hold it together:

- **The header strip and `extra.findings` are OUTSIDE the tabs**, on every one
  of them. A caution you have to go looking for is a caution nobody reads.
- **`EX_TAB` remembers the open tab across a re-render** — the `KN_TAB` rule. A
  write must never throw you back to Setup.
- **The gate still decides what EXISTS.** With nothing connected, Routing /
  Limits / Spending / Recovery are **not rendered as empty tabs**; Setup is the
  only tab there is, and its own tab carries `.tab-spot` (the Crosslink "nothing
  linked" rule).

| card | reads | rule |
|---|---|---|
| the boundary paragraph | nothing | renders **ALWAYS**, never behind a hover or a fold |
| **the setup gate** (v0.51.0) | `extra list` (`gate`) | `connected` is the **CLI's** answer, the same one `orc config set extra_enabled true` refuses on. While it is false the routing card, the guardrails, the cost report and the full catalogue are **NOT APPENDED** — not hidden, not disabled. Two floors, and the panel says which |
| **tools that live on this machine** (v0.51.0) | `extra tools` + `extra keyhelp` | the panel switches on `state` (`absent` · `outdated` · `unauthenticated` · `ready`) and derives **nothing**. An `absent` box gets **no Connect and no Test control**; `no_install_alternative: null` renders the honest sentence, never an empty slot. **A CONNECTED tool gets no Connect button either** (v0.52.0) — `connected` / `verified` are computed by `orc extra tools`, never joined here, and the verified card carries a chip naming the connection plus **Test**, with "Add another" as a secondary |
| header strip | `extra list` + `extra doctor` | every number is the CLI's; one it could not compute is an em dash |
| your connections | `extra list` + `extra doctor` + `config list` | UNVERIFIED / STALE arrive as doctor findings **keyed by profile** — the panel has no idea what `extra_verify_max_days` means |
| **how to hand over the credential** (v0.53.3) | `extra keyhelp` | three blocks, in the order the CLI hands them over, and the panel names **no variable and no command** of its own. `vault_unlock.cmd` — the route WITH A DEADLINE — renders FIRST; then `env_set`; then `key_env`, which is `ORC_EXTRA_KEY` described as **the key**. `passphrase_env` is now always `null` and the old block is gone: it told users to export their vault passphrase into the variable a dispatch sends in an `Authorization` header |
| **the passphrase deadline** (v0.52.0) | `extra list` (`profile.session`) | four states, all COMPUTED by the CLI: `ACTIVE` · `EXPIRING` · `EXPIRED` · `ABSENT`. **`not saved` KEEPS ITS SLOT** on a vaulted connection — that is the state a run STOPS on, and a missing chip would make it look like nothing was wrong. The strip carries the SOONEST deadline, or an em dash |
| **which lane routes foreign** (v0.52.0, reshaped v0.55.0) | `extra lanes` | a card **directly above** the routing table. The verdict word, the band, both EDGES and whether they agreed are all the CLI's; a lane that never routes **keeps its row**. A `slot` lane has no band and no edges — it renders one line per POSITION with the agent each one displaces, and an unrouted position keeps its line, because the two positions in a lane are two separate decisions. `/orc-quick`'s verdict word is **`offered`**, which is its own: "this lane routes foreign" would be a claim about a decision only the user gets to make, per entry |
| **the POSITIONS ladder** (v0.55.0) | `extra role list` | the four lanes that pin an agent instead of scoring a task. **NO PROPORTIONAL BAR** — a band has a width because it covers a range of scores, a position covers nothing, and drawing one a width would be the panel inventing an interval the CLI never computed; the row reuses `.ex-band` and DECLARES one fewer column (the `.run-card` / `.ex-tool` lesson). An unrouted position **keeps its row** and is drawn as the Claude agent it falls back to. Every string is the CLI's — `meaning`, `why`, `announce_point`, the state words, the displaced agent — and a test greps the panel AND both string tables for a slot id, a provider, a model or an agent name. Writes stay batched on the existing bar, and replacing a position is confirmed **naming what it replaces**: a count is not consent. The six `extra_roles` values nothing resolves are REPORTED underneath, in the CLI's own words |
| **the band ladder** (v0.53.0) | `extra route` | ONE vertical row per band, replacing the horizontal rail **and** the duplicate editable rows below it. An unmapped range **keeps its slot** in Claude's colour with the agent it resolves to; staged and batched; a row repaints itself and expands **in place** (the Runs-row rule), one open at a time |
| the guardrails | `config list` | the SHARED `settingRow` / `controlFor` — a tenth key is still zero steps |
| what it cost | `extra stats` + `extra rates` | `docTokenBar`; a band nothing joins reads `—` and keeps its slot |
| where the numbers came from (v0.53.2) | `extra stats` (`sources`) | three counts, verbatim, plus the two ABSENT counts. The spend log is written by the CLI itself, so the tab no longer depends on a run remembering to narrate its own cost |
| **dispatches that did not finish** (v0.54.0) | `extra journal` + `extra reconcile` | one row per journal, **expanded in place** (the Runs-row rule) with the reconcile fetched on first open. **A FREE action is a button, a PAID one a copy-able command:** `reconcile` costs nothing, so opening the row runs it; `resume-slice` composes a slice for a dispatch that WILL cost money, so it is a command you copy — the panel never runs a lane. **Every state word is the CLI's** (`resumable` · `nothing-to-resume` · `no-journal` · `complete` · `in-flight`) and **neither string table may contain one**: a translated state word is a state that does not exist, and a test greps both tables. A row with nothing to show **KEEPS ITS SLOT**; `in-flight` renders as a REFUSAL naming the pid and the lease, never a dead control; a line count ORC could not compute exactly reads `—`, never `+0 −0` |
| **delete old records** (v0.54.0) | `extra journal prune --dry-run` | preview-then-apply, the apply disabled until a preview was fetched, and it **NAMES EVERY DIRECTORY** — a count is not consent. Why each kept record is KEPT is as much of the answer; a dispatch that never reported back is never a candidate |
| **how often each connection finishes** (v0.54.0) | `extra stats` (`reliability`) | on the Spending tab, beside the cost it belongs with. **No percentage below the sample floor** — the floor is the CLI's number, never one written here — and `unattributed` is drawn including when it is zero. Both new ABSENT counts (`unreadable_journals`, `journals_without_result`) are named rather than absorbed |
| what needs attention | `extra doctor` | the CLI's id and message, verbatim; `fixable: false` says so |

**The install runs in YOUR terminal, and the panel knows nothing about
terminals.** `orc extra install <provider>` is a POST to the real command; the
exact command renders **above** the button (preview-then-apply, unchanged), a
launch that could not happen comes back **exit 0** with the command to paste, and
a test greps this panel for `npm i -g`, `wt.exe`, `osascript` and `sudo` —
every one of them belongs to `bin/cli.js`.

**The model box is a dropdown or a text box, and the CLI decides which.**
`orc extra models --json` returns `entry: "list" | "free-text"` plus a `group`
per row, so `glm-5 (opencode-go)` is composed from data the panel was **handed**
— it never splits a model id itself (a test asserts there is no `.split("/")`).
Beside every list rides the CLI's own caveat: a model that is **LISTED** is not a
model that **WORKS**.

**The paid rung is its own button.** *Send a real message* is separate from
*Test connection* so it can never be pressed by accident, and the two rungs are
quoted separately **before** either — a probe through a local tool costs
thousands of input tokens, not ten. Its result block renders the round trip, the
model requested, the model that answered, the reply (as **DOM text**, capped by
the CLI, labelled foreign input) and the **four token kinds unblended**. A tool
that cannot say which model answered gets the sentence, never a blank; a token
kind it cannot report reads an em dash, never a zero.

**The passphrase modal is the one modal in this app with no exit but Save**
(v0.52.0). `modal({dismissible: false})` drops the Escape handler and the
backdrop click and swallows Escape in the **capture** phase — the `.tour-block`
precedent. It has **exactly one** other button and it is destructive and NAMED
("do not save · disconnect this connection"), never a Cancel: a modal with
genuinely no way out is a trap the first time a write fails, and an escape that
destroys the thing being configured cannot be pressed by accident. The eight
deadlines come from `orc config list --json`'s `options` — **the panel names no
number of its own**, and a test greps for the literals. The deadline is shown as
a **DATE**, live under the picker, because "30 days" is not something a person
can plan around.

**THE LADDER, AND THE SIX THINGS THE RAIL GOT WRONG** (v0.53.0). Each one
structural, and the rail and the row list were the same data twice with only the
list interactive:

1. **The target was truncated** — the single most important fact in the picture
   was the one you could not read.
2. **The widths lied.** `min-width: 128px` fought `var(--w)`, so a 10-point band
   and a 30-point band came out nearly the same width while the `0 … 100` axis
   underneath promised they were to scale.
3. **The last band was off-screen** with no affordance that the rail scrolled.
4. **No legend.** Green against blue carried the whole meaning of the picture
   and was never named anywhere on the page — and green means **the work leaves
   your machine**.
5. **`[0,30)` is developer notation.** The bracket is load-bearing so it stays,
   beside a readable form rather than instead of one.
6. **Two copies of the same data.**

**Moving the proportional bar INSIDE the row is the whole geometric fix.** A
full-width `.ex-band-track` holding a `var(--w)` `.ex-band-bar` needs no floor,
needs no horizontal scroll, and can never clip a name — the `VAULT` /
`ringRadii` lesson in a simpler shape.

**AND THE PLAIN-LANGUAGE LABEL IS THE CLI'S.** Writing "simple work" beside
`[0,30)` in `extra.json` would be the panel deciding what a score means — the
Flow-stepper rule again. `orc extra route --json` gains `range`
("scores 0 to 29") and `meaning` per row plus the `band_meanings` ladder, and
the human path prints them too: **a field one surface prints and the other omits
is drift no lint can see** (v0.49.1).

**A TOOL CARD HAS NO ROW TEMPLATE** (v0.53.0). `.ex-tool` declared
`grid-template-rows: auto auto auto 1fr auto`; **four states carry four
different numbers of children**, so a ready+verified card's "connected as" chip
landed in the `1fr` slack row, stretched (a grid item's default), and a 999px
radius drew a ~250px ellipse. It hit whichever ready card had the **shortest**
content in its row, so it was never about one tool. Flex column now, the footer
pushed by the FREE SPACE, and **a chip states a fact — it is never a layout
element**. Each state also gets **one sentence and one control**, with the
diagnostics behind a native `<details>`; the **probe error stays out front**,
because it is the reason for the state rather than detail about it.

**DESIGN RATIONALE IS NOT USER INSTRUCTION** (v0.53.0). Both string tables were
already complete — the rationale was simply in the way. Six keys split: the key
**keeps its name** and becomes the STE instruction, and a new `…Why` key takes
the reasoning into a collapsed `exWhy()` disclosure. Nothing deleted; the
`…Why` keys join `TERMS.md`'s `prose-keys` fence and the instruction keys leave
it, because **a new key is instruction text unless it is listed**.

**THE TOUR STEP MOVED.** It pointed at `.ex-rail-wrap`, which rendered in every
state because the rail was drawn from the Claude table. Its replacement lives on
the Routing tab, which **does not exist on a first run** — so the step points at
`.ex-boundary` with `.ex-strip` as the fallback. Same rule a fourth time: **a
step must point at something with a SIZE.**

**Five things this panel must never do**, each of which it nearly did:

1. **Name a provider, a model or an agent.** A test greps `js/panels/extra.js`
   AND both string tables for every catalog id and label.
2. **Recompute a state.** The verified COUNT is `counts.verified`, not a
   `filter()` — the first draft recounted the array, in the panel whose whole
   gate that word is.
3. **Guess the other half of a staged un-route.** Handing a band back to Claude
   means `claudeGaps` decides which agent, split at the resolving table's own
   edges. The preview draws an **em dash** and says "recomputed on Apply".
4. **Put a secret anywhere but STDIN.** `/api/extra/ping`, `/api/extra/unlock`
   and `/api/extra/models/test` are dedicated POST branches for exactly that
   reason; `runCli` grew ONE parameter (`input`) and it exists for them.
   `--key <value>` is unbuildable — the CLI refuses it by name.
5. **Offer a control that cannot succeed** (v0.51.0). A Connect button on a tool
   that is not installed, a routing table before anything has answered, a
   dropdown the CLI did not build. Each one teaches somebody to configure
   something that will never fire, and each is worse than an empty card — which
   is why the gated sections are absent rather than disabled.

**Two shared-sheet defects were found from this panel and fixed there, not
here:** `note bad` was written by six panels and styled by none (`.note.bad` /
`.note.warn` now exist in `03-components.css`), and `.seg` never wrapped, so a
nine-choice subset control printed straight over its own description.

**`hidden` loses to an author `display`.** `.field` and `.banner` are flex boxes,
so the UA rule never applies and a form shows the fields it just hid — three at
once, in the first connect modal. Any styled box a panel hides needs an explicit
rule; this one uses `.ex-form-hide[hidden]`.

---

### Spending: three sources, and the panel says which (v0.53.2)

The Spending tab used to read **`0 tasks sent · from 2 traces`** on a machine
that had really run three foreign dispatches, two of them successful with
complete four-kind token vectors. The panel was correct — `orc extra stats` was
returning zero — and the CLI was correct too: it composed a perfect `EXTRA …`
line and handed it to the orchestrator to relay into a trace packet, and the
orchestrator reshaped it once and dropped it once.

The bridge now writes `.claude/orc/extra-spend.jsonl` itself, and
`orc extra stats --json` carries a `sources` object. **The panel renders that
object and computes nothing from it** — the Flow-stepper rule.

| row | reads | rule |
|---|---|---|
| the source line | `stats.sources` | three counts, verbatim: **written down by ORC** · **read from traces** · **recovered from saved returns**. "ORC wrote this down itself" and "a trace happened to mention it" are different levels of confidence in the same total, and a reader who cannot tell them apart cannot tell a broken relay from a lane that never ran |
| the torn-line warning | `sources.unreadable_spend_lines` | an ABSENT count — dispatches that are real and are NOT in the totals below. It is a `.note.bad`, not chrome: a report quietly short by three rows is the exact failure this tab is being fixed for |
| the undated warning | `sources.run_returns_undated_skipped` | the other ABSENT count. A saved return carries no date and none is derived from an mtime, so a date filter leaves it out and says how many |
| the `…Why` disclosure | nothing | rationale prose, in the `prose-keys` fence — the v0.53.0 split |

`--fixtures` carries all of it, ugly states included: rows from all three sources
at once, one torn log line and one undated saved return. **You cannot design the
warning for a short report against a clean one.**

### Maintenance: the panel restarts itself (v0.53.2, the reload fixed v0.53.4)

`orc upgrade` replaces the package the running server was loaded from, and
`STATIC` is a one-time walk at boot — so an upgraded panel kept serving the old
bytes. The version in the rail did not move, a new panel did not appear, and the
remedy was three manual steps nobody was told about.

| step | where | rule |
|---|---|---|
| the warning | `previewAction`, `d.restarts_ui` | said in the confirmation **BEFORE** the apply. A panel that reloads itself with no warning reads as a crash |
| the trigger | `refreshJob`, `job.restart_pending` | the server sets it only when the action is DECLARED as replacing the install **and** the job exited 0. The **client** asks for the restart — the job's output lives in the server's memory, so restarting the instant a command finished would destroy the record of what it did before anyone read it |
| the handover | POST `/api/ui/restart` | a DETACHED successor on **the same port and the same token**, so the URL in the address bar stays valid. A successor on a new address is not a restart, it is a second server |
| the reload | poll `/api/meta`, then **`reloadWithToken()`** | the new process answering is the signal. 30s deadline. **NOT `location.reload()`** (v0.53.4) — `00-core.js` strips `?t=` out of the visible URL at boot, so a plain reload re-requests the stripped address and lands on `This link is missing its session token.` The helper re-attaches the in-memory token and `location.replace()`s that URL; it is the ONLY reload route in the panel, and a test fails on any bare `location.reload()` in `app.js` |
| the failure | `handOverFailed()` | a note plus `orc ui --stop` and `orc ui`. The old panel keeps serving and keeps working — never a broken page |

Which actions restart: **`update` · `prune` · `fix` · `upgrade`**. Never
`update-global` — it re-copies the payload into `~/.claude`, which is not what
this server runs and not what any panel here reads.

**THE BUG THIS PANEL KEEPS RE-LEARNING** (v0.53.4). The handover was right on
the server side and broken end to end for two releases. The server proved the
token survives a restart; the client proved the token does not belong in the
address bar. Nothing tested the sentence those two facts form together, so
**every** `restarts_ui` action ended on the un-authenticated page — and the
user's own recovery (`orc ui --stop`, `orc ui`) minted a NEW token for a server
that was already the new build, which is why nothing about it looked like a
token bug. Two halves of one mechanism, each individually correct.

### 4b. Lanes, the rank ladder, and the demotion row (v1.0.0 W16)

Three additions, one rule between them: **every one renders something the CLI
already computes, and none of them may have a second idea of it.** That is the
Flow-stepper rule (§5) applied three more times, and three tests in
`test/webui/panels.test.js` grep for the literals each panel must not own.

| # | What | The rule it keeps |
|---|---|---|
| 1 | **Settings ▸ Who decides what** | The rank ladder for every CONTESTED family, from `config list --json`'s new `families_resolved`. `families` is the static registry (which ranks exist, in what order); this is what those ranks DID against the config on disk. **The panel never walks the ladder itself** and never names a contested key — a precedence re-implemented in the browser is exactly the drift this panel exists to prevent. The rank that answered is the only one given weight; the terminal floor is drawn italic because it is not a key and must not send anybody looking for it in the file. An **unknown state renders** rather than being dropped |
| 2 | **Settings ▸ per-key lane chips** | `k.lanes[]` — the same list `orc lane config` filters on, and the same list a two-way lint already refuses to let drift. It answers the question a settings screen otherwise leaves you guessing at: *I changed this, so what did I just change?* **An EMPTY list is an ANSWER and keeps its row** — ten keys are permanently empty because they are operating keys of the `orc extra` bridge, and skipping the line would make "no lane reads this" and "we did not render it" identical |
| 3 | **Lanes ▸ Phases** | The shared phases a lane runs, in order, from `lane phases <lane>`. A row names a FILE or a HEADING, never both and never neither. **NO SHARED PHASES is an ANSWER** — five lanes keep their pipeline in their own spine on purpose, and a blank card would make that look like a failed read. `when` is chipped VERBATIM: there is no label map, because a friendlier word for `on-phase` is a state the CLI does not have |
| 4 | **Lanes ▸ Calls** | The whole catalogue from `lane calls --all`, **expanding in place, one row at a time** (the Runs-row rule) — there is no detail box below the list. Exit codes are drawn as fixed tokens rather than folded into prose, because a lane BRANCHES on those numbers |
| 5 | **Extra ▸ Recovery ▸ Demotion** | The counter, **both clocks, never merged**, the evidence, and Promote. The mirror of *a lane that sends work off Claude without saying so* is a lane that quietly STOPS, so **the card renders even when nothing is demoted**. The counter renders **at zero**, and an `off` clock says `off` — a `0` silently disables a clock, so "nothing stalled" and "nothing is counting" must never look the same. Both ABSENT counts are named (v0.53.2) |

**Promote is a human action and a reason is REQUIRED.** The button exists only
while something IS demoted — a disabled button for an action that cannot apply is
what this panel refuses everywhere else. The modal states, before the click, that
**a promote is a watermark and not a mute**: it forgives the evidence it saw and
re-arms, so two more stalls in the same run demote again. The panel's own
empty-reason check saves a round trip and is never a second rule — `orc extra
promote` refuses with exit 2 `reason-required`, and that refusal is what renders
if anything slips past it.

There is deliberately **no Demote button**. Demoting by hand is a diagnostic
somebody reaches for at a terminal, and a button for it would invite muting a
provider instead of fixing it.

**`lane-keys-drifted` routes to Maintenance.** It is an install-footprint
finding, so it takes the documented default rather than an interesting
exception: the thing that clears it is `orc update`, which is an action row
there. It fires when the two halves of an install are out of step — a CLI that
knows a lane reads config keys, sitting on a spine from before that lane had the
contract — which is precisely the state in which a lane falls back to merging
`.claude/orc.config.yaml` itself and gets a shadowed key wrong, silently.

---

## 4b. The CLI Hook Interface — the four rules that are ITS OWN

Everything in §5 applies here too. These four are extra, and each of them is a
consequence of one fact: **you are composing something you cannot see while you
compose it.** The bar lives in a terminal at the bottom of a different window,
so this is the only panel that has to show a RESULT rather than a STATE.

1. **The preview is not an approximation.** `orc statusline preview` renders
   through `templates/hooks/orc-statusline-render.js`, and so does the hook.
   One engine, two callers, byte-identical BY CONSTRUCTION. If you ever find
   yourself writing a renderer in `hookui.js`, stop: that is the second engine
   this design exists to prevent, and the panel becomes confidently wrong the
   moment the two disagree.
2. **The illegal drop is made IMPOSSIBLE**, not allowed and then complained
   about. `lineLegal()` returns `{ok, why}` and the reason travels to the zone,
   the disabled button's tooltip and the live region. A user should never be
   able to do the wrong thing and then be told off for it. The CLI still
   validates — the board is a convenience, never the guarantee.
3. **Every drag has a keyboard equivalent and a menu.** Pointer drag is
   unusable for a real fraction of people. `aria-grabbed` is deprecated and is
   not used; state is announced through the live region `announce()` owns.
4. **A refused component gets NO BUTTON AT ALL**, never a disabled one, and
   keeps its row with the measurement on it. "We decided against this" and "we
   forgot" must not look the same.

A fifth, about the CSS: **`.hk-chip`, `.hk-prow` and `.hk-pick-row` are FLEX
COLUMNS and never declare rows**, because their child count changes with their
state — a part with no description is one row shorter, a refused row carries a
reason. A card whose child count changes with its state must not have a row
template; that is what put a 250px ellipse on `.ex-tool`.

### 4b.1 v1.4.1 — the four things that were wrong, and what replaced them

- **A STAGED CHANGE IS A SEMANTIC OP, NEVER A FINISHED BODY.** `HK_OPS` holds
  `add · remove · move · set · sep · doc`, each against a STABLE REF (`i3`, or
  `new:<n>` for something staged this session). `hkPlan(show, cat)` replays them
  in order and returns BOTH the effective board and the ordered writes,
  **deriving every position at the moment that write will run.** The old palette
  buttons computed a position from the SAVED layout, so three staged adds all
  carried position 1 — and `statusline set` at an occupied position is an EDIT
  by design, so three adds produced one part and the five-slot cap never fired.
  **If you add a control that changes the board, stage an OP.** Building a body
  by hand puts the second idea of the layout back.
- **ONE COMMAND PER SCOPE.** `statusline line <n>` is per-LINE; `statusline doc`
  is the whole layout. The colour set is a document fact and went through
  `line 1 --theme` for a release, so the picker read one value and wrote
  another. `doc --theme` also CLEARS the per-line overrides that would shadow
  the choice.
- **CSSOM, NEVER A `style` ATTRIBUTE.** The page is served under
  `style-src 'self'`, which blocks a parsed style attribute outright — the ANSI
  preview had never had colour, and the only sign was a console error. `push()`
  in `ansiBlock` assigns properties one at a time. This applies to ANY panel
  that wants a computed colour.
- **THE BOARD IS THE ONLY PLACE ANYTHING IS APPLIED.** The list below it is a
  REFERENCE and has no buttons. Add · Change · Move · Remove live on the chip
  and each opens a modal that says what it will do. Drag is the SHORTCUT: the
  drop edge is a `box-shadow` on the chip it lands beside (never an opening
  gap), and `hkCanDrag()` turns it off for real below `06-responsive.css`'s own
  600px breakpoint.
- **Three more things now come from the CLI**, because the panel derives
  nothing: `separators` (the dropdown), `themes_about` (why you would pick one)
  and a per-component `structural` flag (which parts do not eat one of the
  five).

---

### 4b.2 v1.4.2 - the reload that made editing look broken, and the read that was a summary

- **A STAGED EDIT REPAINTS AND NEVER REFETCHES.** `hkOp` used to call a
  `rerender()` that re-entered the router: the panel was thrown away, four
  endpoints were refetched and everything was rebuilt from a skeleton. Three
  consequences, and only the first is cosmetic. (a) Every click visibly reloaded
  the page. (b) **A staged change looked like an applied one** - the picture came
  back different, so nothing was left to say the write had not happened. (c) The
  open editor **went stale**, because it stayed on screen while the panel behind
  it was replaced, so every control showed the value from before the change the
  user had just made. `HK_DATA` caches the last fetch, `HK_SLOT` is the node,
  and `hkPaint()` is the ONE paint - scroll position kept by hand. `hkReload()`
  refetches, and it is called only where the disk actually moved: Apply, a
  preset, the reset, the switch, a board change, a recompile.
  `hkPreviewReload()` is the narrower one for a width or fixture change - four
  endpoints for a picture is three too many. **If you add a control that changes
  the board, call `hkPaint`. A refetch is for a write.**
- **THE OPEN EDITOR IS REGISTERED FOR THAT REPAINT.** `HK_MODAL = {repaint}`,
  re-finding its part by the same stable ref `hkPlan` uses; a part that is gone
  closes the dialog rather than editing something that no longer exists. Because
  it rebuilds on every keystroke, `focusPath`/`restoreFocus` carry the caret and
  the selection across the repaint - **an editor that drops focus after one
  letter is not an editor**. A name stages on `input` as well as `change`, which
  is what made a name typed and then clicked away from race the close.
  `partPicker`, `moveModal` and `removeModal` each null `HK_MODAL` first: they
  take over the shared `#modal-host`, and repainting into a pane the page has
  stopped showing is a paint nobody sees.
- **`--json is not a summary`, ON `statusline show`.** It emitted TWELVE of the
  twenty-four fields a part can carry, so `case`, `prefix`, `suffix`, `glyphs`,
  `format`, `compact`, `min_width`, `precision`, `width`, `min_cols`,
  `max_cols` and `priority` were written to disk by a CLI that has always taken
  them and then **could not be read back by the panel that wrote them**. The
  control reopened blank and the change read as having done nothing. `SL_ITEM_FIELDS`
  is the one list both halves use; `authored` carries the raw item, which is how
  a control can mark a value as the USER'S rather than inherited. An absent LIST
  is `[]` and never `null` - a control that iterates a null throws, and a null
  would read as "unknown" when it means "nothing set".
- **SIX PER LINE, IN ONE PLACE.** `SL_MAX_PER_LINE` in `bin/cli.js` - the
  validator, `max_per_line`, `full` and the human `n/6` all read it. A cap
  spelled out at five call sites is a cap that drifts on the first change.
- **THE PANEL HAD NO COLOURS.** `hookui.css` was written against `--bg-sunken`,
  `--bg-raised`, `--fg` and `--fg-dim`; **none of those tokens exist**
  (`--surface-2`, `--surface-3`, `--text`, `--text-dim` do). Every one of those
  34 declarations was silently dropped, which is why the separator select had no
  background of its own and its open list rendered near-white on near-white. The
  option rule now states BOTH halves plus `color-scheme`: **a native popup is
  drawn by the platform and inherits only the half you leave to chance.** Other
  panels still carry undefined tokens (`--border`, `--surface-1`, `--r-sm`,
  `--r-md`, `--r-2`, `--fs-sm`, `--warn-line`) - same class of bug, not fixed
  here.
- **THE CAP LIVES ON THE LOCK, AND THE COMPILER SAYS WHAT COUNTS.** Raising
  `SL_MAX_PER_LINE` was not enough: the hook re-checks the compiled file at rung
  5 (a hand-edited compiled file is a file nobody validated) and held its own
  `5`, counting EVERY item op. A legal six-part line — and a legal five plus a
  fill — fell silently back to the shipped lines. The cap is on
  `statusline.lock.json` now, the compiler marks a structural op `s: 1`, and
  both hooks read both. **A hook must never hold a number this CLI owns**, and
  it cannot derive this one: a compiled op carries an instance id, never a type.
- **A RENDERER PUBLISHES THE FIELDS IT USES.** Twenty-eight of thirty-five draw
  no label, so the Name box was a control that took your text and did nothing.
  `uses` per renderer + `label_renderers` come from the CLI; `usesOf`/`gated` in
  the panel disable what the current shape ignores and keep the slot with the
  reason. `SL_LABEL_RENDERERS` is golden-tested against the compiler's switch.
  **If you add a control to the editor, gate it.**
- **`hk-quiet`: NOTHING ARRIVES ON A REPAINT.** `hkPaint` replaces every child,
  and `.stack > *` animates each one in — so with no request at all the panel
  still read as reloading. Added from the SECOND paint onward, and by the part
  editor on every rebuild. It removes the ENTRANCES only. It lives in
  `04-motion.css` and must load after the rules it turns off.

- **THE PREVIEW IS A TERMINAL, AND THE COMPARISON IS ON REQUEST.** `termWindow`
  draws the chrome and `rulerRow` the column ruler, so "44 cells" stops being a
  number and becomes a place on the picture. `orc statusline preview` takes
  `--theme` and `--glyphs` as a **render-only** override - the same saved layout
  under a different colour set or symbol set, **writing nothing** - and the
  drawer uses it for the three strippings, four colour sets and seven symbol
  sets. It is CLOSED by default and its rows are fetched on the first open:
  eleven renders nobody asked to see is eleven subprocesses nobody asked to pay
  for. The editor's own sample is labelled for what it is - `previews` is a
  per-renderer sample from the CLI's fixture, so it shows the SHAPE and never
  the words or numbers the part will carry at run time.

### Test (v1.5.0) — the panel for the lane that runs the test

`/orc-test` points at a RUNNING system. That single fact decides everything on
this panel, and it is why it has the tightest action boundary of any panel here.

- **THREE READS, AND ALL THREE ARE READS IN THE STRICT SENSE.** `orc test
  status` (the list), `orc test show <slug>` (the whole computed view) and `orc
  test ui tools`. **None of them re-scans the repository and none of them probes
  the target** — opening a page must never be a measurement, because a
  measurement nobody asked for is traffic nobody authorized. `orc test show` was
  added FOR this panel and is the `--json is not a summary` shape: the surface,
  the case matrix, all ten OWASP rows, the runs and the findings arrive in ONE
  object.
- **`orc test run` IS A COPY-ABLE COMMAND AND WILL NEVER BE A BUTTON.** It is
  free of model tokens, so the usual free/paid line would make it a button — and
  that is the wrong line here. It SENDS REAL TRAFFIC to a real system, and a
  page that can start a scan against a live host is a page that can start one by
  accident. The three writes the panel does make (`surface`, `env`, `report`)
  cost nothing and touch nobody else's machine.
- **THE ENVIRONMENT PROBE IS A BUTTON, ON THE `orc extra ping` PRECEDENT.** Its
  OUTCOME is the state worth designing — `unhealthy` is where ORC stops and
  hands the machine back — so `fixtures.post` answers it with canned data keyed
  by slug, which is what makes `unhealthy`, `absent` and the REMOTE refusal all
  reachable in `--fixtures`.
- **A HEALTH STATE IS NEVER STORED; THE OBSERVATION IS.** `env.state` off `orc
  test show` is always `null`. What the ledger keeps is `last_observed`
  (`{state, at}`) — a fact ABOUT THE PAST, which does not go stale, it only gets
  older. Every surface that renders it says WHEN, and none renders it as the
  state now. That is what lets `orc doctor` say something true about an
  environment without sending a request of its own.
- **THE AUTHORIZATION STATEMENT AND THE DESTRUCTIVE DECISION RENDER ALWAYS**, on
  the target card, verbatim. A statement nobody filled in is a STATE, drawn as
  one — never an empty row and never a cheerful default.
- **TEN OWASP ROWS, ALWAYS.** An `unchecked` row KEEPS ITS SLOT with the reason
  it could not be measured, is drawn quieter than a FOUND row, and is never
  drawn as absent. The panel names no category, no state word and no severity:
  all of it is `orc test show --json`.
- **EVIDENCE IS A PATH, NEVER A BODY.** The panel names where a capture is and
  does not open it. There is deliberately no `--body` read here: a captured
  response body is the most sensitive payload this lane writes to disk, and
  widening a route to stream one through a browser is the one change that would
  turn this panel into a reader of them.
- **A run row EXPANDS IN PLACE**, one at a time, reusing `.run-row` /
  `.run-card` from `panels/runs.css` — so the fold and its reduced-motion
  behaviour stay ONE implementation. The stop chip keeps its slot as an EMPTY
  SPAN when there was no stop, never an em dash: a run that ran to the end and a
  run whose stop was not computed are different facts, and a placeholder must
  assert neither.
- **`.ts-route`, `.ts-case` and `.ts-owasp` all DECLARE their columns** and keep
  the SAME child count in every state, so `06-responsive.css` collapses each one
  explicitly. That is `.ex-tool`'s 250px ellipse, avoided by construction.

Four doctor findings route here, because every command that clears one is on
this panel: `test-env-unhealthy` · `test-run-red` · `test-unchecked-owasp` ·
`test-evidence-unstaged`. The last one is here even though the fix is a line in
`.gitignore` ORC will not write — Test is where the sentence explaining why that
folder must never be staged already lives.


---

## 5. The invariants, and the file that enforces each

| invariant | enforced in |
|---|---|
| the token is required on EVERY request | `serve.js` (`tokenOk`, constant-time) |
| **every `.run-card` variant declares its own column count** — a grid never complains, and a three-child card in a four-column template printed the chip over the slug | `css/panels/runs.css` (`.no-caret`, `.has-extra`), `06-responsive.css`, and a test in `test/webui/panels.test.js` |
| **a 500 carries the CLI's own reason, and a `--json` read never emits a stack** | `bin/cli.js` (the crash envelope), `api.js` (`readFailReason`), `js/00-core.js` (`failure`), `js/02-ui.js` (`failBox`) |
| **`--json is not a summary`** — a read hands back the WHOLE computed object, so a panel can be as detailed as the terminal | `bin/cli.js`, and a test per read in `test/cli/knowledge.test.js`. No lint can see this one: both halves live in one function |
| every asset reference goes out stamped | `serve.js` (the generic regex) + `test/webui/serve.test.js` |
| loopback bind + Host guard, no CORS | `serve.js` (`loopbackHost`, `listen`) |
| a request path is a key lookup, never a path join | `serve.js` (`buildStatic`) |
| server code is never served | `serve.js` (`NEVER_SERVE`, and `fixtures/` is skipped) |
| mutations are POST-only | `serve.js` **and** `api.js` (belt and braces) |
| the lock at `.claude/orc/ui.lock` is never prunable | `bin/cli.js` (`isPrunable` cannot match it) |
| project-scoped: **no `--global` config** | `bin/cli.js` — config does not merge, so a global write would outrank the file every panel edits |
| preview-then-apply; a prune NAMES every file | `js/panels/maintenance.js` |
| the upgrade row shows BOTH URLs: `source` (what installs) and `version read from` (what the number came from) | `js/panels/maintenance.js` — one URL made `up to date` unfalsifiable (v0.53.1) |
| everything rendered is CLI-derived | `test/webui/panels.test.js` (greps for literals the panel must not own) |
| i18n is PANEL PROSE ONLY | `test/webui/i18n.test.js` |
| ONE `prefers-reduced-motion` block | `css/04-motion.css` + `test/webui/render.test.js` |
| colour tokens only on bare `:root` | `css/00-tokens.css` + `test/webui/render.test.js` |
| fixtures carry one of EVERY state | `fixtures/*` + `test/webui/fixtures.test.js` |
| `renderMd`'s paragraph branch consumes its first line unconditionally | `js/03-md.js` — it is the fall-through, so a line every branch declines is an **infinite loop that hangs the panel** |
| `VAULT.W/H` equals `.vault-node`'s CSS box | `js/panels/crosslink.js` ↔ `css/panels/crosslink.css`, asserted |
| the Flow stepper renders `steps[]` and derives nothing | `js/panels/flow.js` |
| a caution routes to the panel that can CLEAR it | `FINDING_ROUTE` in `js/panels/overview.js` |
| **`legacy-global-package` routes to Maintenance** (v0.56.0) — the old unscoped `orc` package owns the `orc` command and blocks EVERY install source, and `orc upgrade` (which evicts it first) is an action row on Maintenance. It is the one doctor finding that explains why the upgrade button cannot fix anything else in the same report | `FINDING_ROUTE` in `js/panels/overview.js` + `overview.item.legacyGlobalPackage.cta` in `i18n/{en,id}/overview.json` |
| **`extra-demoted-run` routes to Extra** (v1.0.0 W5) — a run that DEMOTED a foreign profile after two consecutive stalls (or a 20-minute stale live attempt) is cleared by `orc extra promote <run> --reason`, and Recovery is the Extra tab where every other journal-shaped state already renders. **The panel renders the CLI's own announce line and derives nothing** — not the verdict, not the counter, not the ladder: `orc extra demotion --json` computes all three, and a second idea of when a provider is demoted is exactly the drift this panel exists to make impossible | `FINDING_ROUTE` in `js/panels/overview.js` + `overview.item.extraDemotedRun.cta` in `i18n/{en,id}/overview.json` |
| **`read-gate-unwired` routes to Maintenance, `read-gate-fallback` routes NOWHERE** (v1.6.0) — the first is an INSTALL-FOOTPRINT finding (`read_gate` is armed but `settings.json` has no `Read` matcher, so the gate has never fired) and `orc update` is an action row on Maintenance, so it takes the documented default. The second gets `panel: null` on purpose: the fail-open record ages out on its own after 24h and there is **no button anywhere that clears it**, so a CTA would be a useless one — the `trace-pointer-dangling` call. **Both are reported only while the feature is ARMED**, because a doctor that warns about the default (`read_gate: off`) is a doctor people learn to scroll past | `FINDING_ROUTE` in `js/panels/overview.js` + `overview.item.readGateUnwired.cta` in `i18n/{en,id}/overview.json` |
| **`graph-drifted` routes to Knowledge** (v1.8.0) — a DRIFTED code graph is cleared by `orc graph update`, and that is a button on the Knowledge panel's code graph card, so the finding takes the panel that can CLEAR it rather than the Maintenance default. **Reported only while `code_graph` is on** — the read-gate rule: a doctor that warns about a graph nobody asked for is a doctor people learn to scroll past | `FINDING_ROUTE` in `js/panels/overview.js` + `overview.item.graphDrifted.cta` in `i18n/{en,id}/overview.json` |
| **the rank ladder renders `families_resolved` and never re-derives a precedence** — and `config list --json` carries it because the human branch has always PRINTED the resolution (`resolves on P3 the shipped default`) while the JSON carried only the registry a reader would have to re-run the precedence over. The `--json is not a summary` rule, found once more in the release that named it | `bin/cli.js` (`families_resolved`, resolved with NO lane — inertness is a fact about a lane) + a test in `test/webui/panels.test.js` |
| **the Lanes panel renders `phases[]` and `calls[]` and names neither** — a hardcoded phase, lane or call id in the panel is the Flow-stepper drift with a different table | `js/panels/lanes.js` + `test/webui/panels.test.js` (greps for every phase name it must not own) |
| a FREE action is a button, a PAID one a copy-able command | every panel; `laneCommand()` is the paid form |
| **a modal CONTAINS ITS SCROLL, and the page behind it is locked** — this was every modal in the app, not one panel's: the modal's own scroll CHAINED to `<body>` at either end, and a wheel over the backdrop was never the modal's to begin with | `css/03-components.css` (`overscroll-behavior: contain` on `.modal-host` and `.modal`, `body.modal-open`), `css/01-base.css` (`scrollbar-gutter: stable`, so the page does not reflow), `js/02-ui.js` (one add, one remove, `closeModal` is the single exit) + `test/webui/render.test.js` |
| **a card that is a GRID declares its rows** — `.ex-tool` sized every row to its own content, so two tool cards ended at different heights and every row below the `kv` block sat lower in one than the other. `1fr` is the slack row; **never `subgrid`**, which breaks the moment a card in a different state joins | `css/panels/extra.css` + `test/webui/render.test.js`. The `.run-card` lesson, one level down |
| **NEVER simplify a CLI-computed value** — a state word, an exit reason, a doctor message, a config key, a model id, a path, a band or a command is not prose and is not the panel's to rewrite. **A simplified state word is a state that does not exist**, the same failure as a translated config key. Panel INSTRUCTION text is Simplified Technical English; rationale prose keeps its voice | `bin/webui/i18n/TERMS.md` (the term list, and its `prose-keys` fence is the ONLY opt-out — **the default is STE**) + `test/webui/i18n.test.js` |

---

## 6. How to add a panel — the checklist

1. `app.html` — a `<li>` in the rail (with `data-panel`, `data-idx`,
   `data-i18n`) **and** a `<script>`/`<link>` line in the manifest.
2. `js/panels/<x>.js` — assigns `PANELS.<x> = function (host) {…}`.
3. `css/panels/<x>.css` — only if it needs rules the shared layers do not give
   it. Knowledge has none, and that is fine. If you add one, `<link>` it in
   `app.html` **and** name it in `bin/verify-package.js`, which asserts set
   equality with the directory in both directions.
4. `i18n/en/<x>.json` **and** `i18n/id/<x>.json` — keys written out in full, all
   prefixed `<x>.`; add `"<x>"` to `NAMESPACES` in `js/01-i18n.js`.
5. `api.js` — a `READS` entry (and `WRITES` if it mutates).
6. `bin/cli.js` — the `--json` command behind it. **This comes first in practice:
   the panel can only render what the CLI computes.**
7. `fixtures/<x>.js` + a case in `fixtures/index.js` — **one of every state**.
8. `bin/verify-package.js` — every new file, by name (set equality will catch
   you otherwise, in both directions).
9. `test/webui/panels.test.js` — its invariants.

### 6a. Fixtures can answer a POST now (v0.50.0)

`fixtures/index.js` exports `post(route, body)` beside `get(route, q)`. Almost
every mutation in `--fixtures` still answers "nothing ran", which is the honest
reply in a mode that runs nothing — but the CONNECTION TEST'S OUTCOME is a state
the Extra panel is largely about, and one you cannot design if the wire never
lands. Exactly four routes have canned answers (`extra/add`, `extra/ping`,
`extra/install` and `extra/models/test`),
chosen deterministically from the profile so they agree with what the list
already claims, and a canned answer carries `data` and **not** the `fixture`
flag — the command string is what says it was canned.

Add one only for a state that is otherwise unreachable. A fixture that answers
OK for a write nobody looked at is worse than "nothing ran".

---

## 7. How to add a config key to the panel — **zero steps**

It comes free. `orc config list --json` emits the key, its tier, its
description, its control shape, its current value and whether it is shadowed;
Settings renders that. Do not add a row anywhere in `bin/webui/`.

**v0.56.1 is the proof, and NO panel file changed.** `extra_stall_s` and
`extra_fallback_agent` shipped with a validator, an `options` list and a
description, and both appeared in Settings with the staging bar, the shadow
notices and the per-key reset already working. A panel edit would have been a
second idea of what those keys are.

**v1.0.0 W6 added `state` / `state_reason` / `source` to every key row, and no
panel file changed either.** The CLI now answers a second question about a key —
not "where did this value come from" (`is_overridden`, unchanged) but "does
anything read it at all": `overridden` · `default` · `not-read` (a higher rank
in its family resolved) · `inert` (its master gate is off). The words are
`LANE_RANK_STATES`, the same closed set `orc lane config` already speaks, so
Settings can render a chip whenever W15 wants one — and until then a panel that
shows `default` on a row nothing reads is at worst as honest as it was, never
inventing a state word of its own. **Never translate one:** a state word is
CLI-computed, so it belongs outside the i18n prose fence like every model id and
path.

The same release added `orc extra health <profile>` and gave every engine-`cli`
dispatch return a `timeline`, and **neither got a panel surface on purpose.**
`health` is a PAID probe — the rule that a free action gets a button and a paid
one gets a copy-able command means it does not become a button — and the
timeline belongs beside the dispatch that produced it, which the panel does not
render. Recovery already shows what a stalled dispatch left behind, because a
stall is an ordinary retryable failure the moment it is classified.

---

## 8. Where NOT to look

- **`bin/ui.js`** is the TERMINAL styling kit the CLI prints through. Different
  thing entirely. Each file's header names the other, and a test asserts it.
- **`mock-run/`** is package content read by `bin/mockrun-catalog.js`. It is not
  a panel, and the panel decides nothing about it.
- **`bin/webui/fixtures/`** never runs in production — only under `--fixtures`.
- **`orc-*.md` at the repo root** are plan docs. Untracked, and none of them is
  the source of truth for anything shipped.

---

## 9. Running it

```bash
node bin/cli.js ui --fixtures --no-open
```

Canned data, no project needed, every state reachable. That is the surface to
design against; `--fixtures` exists precisely because you cannot design a STALE
chip on a fresh wiki.
