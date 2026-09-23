# knowledge.md — Part I — What this is & how it ships

**Read: on demand** — read when touching the npm package itself: what ships, the install manifest and prune, the mocked-run catalogue, the documentation split, or the package rename/upgrade path.

> Split out of `knowledge.md`. Section numbering, `§` ids and content are
> unchanged; `knowledge.md` keeps the heading and points here.

## 4q. Shipping-side hardening — install manifest, doctor, tests, guards (v0.29.0)

A pass over the PACKAGE side (not the payload prose). Five interlocking pieces:

1. **Install manifest + orphan prune (`bin/cli.js`).** Every `orc init`/`update`
   writes `.claude/orc/install-manifest.json` = `{ version, files: [...] }`, the
   exact set of paths ORC ships this version (derived from `templates/` +
   generated `hooks/orc-version.json`, via `shippedFootprint()`). On `update`,
   `pruneOrphans()` deletes files that left the payload — but bounded three ways:
   only paths a PREVIOUS manifest proves ORC owned, only within the four payload
   roots (`isPrunable`: skills/commands/agents/hooks), and never on a
   pre-manifest install (no proof of ownership → warn + `detectPreManifestOrphans`
   candidates, delete only with `orc update --prune` or `doctor --fix`'s
   `forcePrune`). This is the root-cause fix for the renamed-agent fork (an old
   `install()` only ever copied). `removeEmptyDirs` cleans up after a prune,
   never touching the four roots.
2. **`orc doctor` (read-only) + `--fix`.** Reports version skew (payload
   `orc-version.json` vs CLI), manifest-vs-footprint orphans/missing, settings
   wiring (effort guard, trace `Task|Agent` matcher, RETURN hook, statusline),
   dangling trace `.current`, stale diy lock. Exit 1 when any issue. `--fix` =
   `install({ overwrite:true, forcePrune:true })` (update + prune + settings
   re-merge).
3. **`test/` — zero-dep `node:test` suite (`npm test`, on prepack).** Drives the
   real CLI + installed hooks in temp dirs (`test/_helpers.js`): where, config
   roundtrip+validator, pattern-status exit codes, doctor healthy/unhealthy,
   prune both paths; trace SPAWN/RETURN (incl. the A2 `tool_name`-on-
   `SubagentStop` regression), non-ORC ignore, garbage→exit 0; effort-guard
   block/allow/non-orc; statusline never-`undefined` + rate-limit segment.
   `engines` bumped `>=16`→`>=18` (node:test needs ≥18).
4. **Encoding/mojibake guard (`bin/verify-package.js`).** Scans
   `package.json`+`bin/**`+`templates/**` for U+FFFD (reference the needle via
   `String.fromCharCode(0xfffd)` — never a literal, or the scanner flags itself)
   and a whitespace-flanked `???` run (mangled dash/quote). Turns the OneDrive
   corruption rule into a deterministic gate (root cause of the A1 defect).
5. **Threshold + named-core hardening (`bin/verify-package.js`).** Count floors
   raised 6/12 → 22/21 (just below the real 23/22); the core non-generated
   agents are in the explicit `required` list so a dropped file is REPORTED by
   name, not merely absorbed by a slack count.

Contract-lint reach (`bin/verify-contracts.js`): a contract may now pin
`binFiles: ["bin/cli.js"]` (presence-only). Single-token CLI mirrors —
`crosslink_fresh_days`, `flow.lock.json`, `FLOW-COMPILED.md`,
`orc-diy.config.yaml`, `orc-crosslink.config.yaml`, `wiki-meta.json`,
`crosslink_provided`, `wiki/crosslink/`, `crosslink/cache/`, `orc wiki sync` —
are now linted on BOTH sides; the remaining unlinted drift is grammar/parser-
shaped (DIY block stitching, `CROSSLINK_KINDS`, score→model preset rows,
wiki-doc parser fields, `countBoundaryRows`, pattern-status exit codes), covered
by `test/` where practical.

Also small guards: the trace hook's `log_dir` reader anchors to column 0 (no
nested-map false match); the effort guard's `/orc-diy compile|status` bypass
anchors to the start of args; the trace hook dispatch requires
`PreToolUse && (Task|Agent)` (was `||`, which would misroute a future
`SubagentStop` carrying `tool_name`).

Files touched: `bin/cli.js`, `bin/verify-package.js`, `bin/verify-contracts.js`,
`package.json`, `templates/hooks/{orc-trace,orc-effort-guard}.js`, `test/**`,
`PUSH-CHECKLIST.md`.

### 4q.1 Install integrity — run state out of the blast radius (v0.34.1)

Eval 21 proved mechanically what §4q's ownership logic never covered: the
manifest bounds the PRUNE, but not the installer's own rm-then-copy. `install()`
did `fs.rmSync(dest, {recursive:true})` on every skill dir before copying, and
run state lived INSIDE one of them — so `orc update`, and the advertised repair
path `orc doctor --fix`, deleted every checkpoint. Unrecoverably: the run dir is
gitignored by ORC's own instructions, so there is no second copy.

1. **Run root moved `.claude/skills/orc/run/` → `.claude/orc/run/`** (config key
   `run_dir`, default `.claude/orc/run`, project-relative like `log_dir`). It
   now sits with the other update-surviving artifacts — a path `isPrunable()`
   can never match. `migrateRunState()` runs FIRST in `install()`, before any
   skill dir is touched, moving legacy children once (never clobbering state
   already at the new path) and printing one line; `ensureRunDir()` plants the
   `.gitignore` marker there. `templates/skills/orc/run/.gitignore` left the
   payload, so the manifest prune removes the legacy marker on update. The path
   is prose in six lanes — it is now a registered contract token
   (`.claude/orc/run`, +`binFiles: ["bin/cli.js"]`).
2. **The skill copy is non-destructive** — no recursive `rmSync` of a
   user-writable tree at all; dirs are overwritten child-by-child and removal of
   a file that LEFT the payload stays the manifest prune's job (the only
   deletion path with proof of ownership). Defense in depth: (1) fixes the case
   we know about, (2) the case a future feature writes into a skill folder.
3. **`pruneOrphans` no longer early-returns on a manifest.** Never DELETING an
   unowned file is correct; suppressing the candidate REPORT was not — after the
   first manifested install, `detectPreManifestOrphans` was unreachable and
   `orc update --prune`'s documented purpose with it. Now: always report,
   delete only under `--prune`/`forcePrune`.
4. **`orc doctor` sees GLOBAL skew** (new check 1b). A `~/.claude` payload at a
   different version can win skill resolution over the project's — evals 08/09
   graded the wrong payload this way — and retired agent names still in
   `~/.claude/agents/` resolve a stale definition instead of failing loudly.
   Both WARN, naming `orc update --global`; a project-scoped doctor never
   deletes from a global install.
5. **Five phantom config keys registered** in `CONFIG_META`: `retro_repo`
   (new `vRepo` owner/repo validator), `wiki_fresh_max`, `wiki_aging_max`,
   `wiki_refresh_ask_tasks`, `wiki_refresh_ask_files` — all documented and read
   at runtime while `orc config` had never heard of them. `retro_repo`'s
   contract now pins `binFiles`, and a test asserts every key documented in
   `config.md` resolves through the registry, which closes the whole class.
6. **`verify-package.js` guards all 30 agent files** (7 were covered by nothing:
   both `*-mini-*`, all five `fable-5`), and the count floor moved 29 → 30 so it
   stops granting a file of slack. A set-equality test (`required[]` ∪ generated
   == disk) makes an unguarded agent file impossible to add.

Test note: `test/_helpers.js` now pins `HOME`/`USERPROFILE` to a temp dir, so
the new global-skew check cannot read the developer's real `~/.claude` and make
a suite result machine-dependent.

---

## 5. The payload (`templates/`) — what ORC actually does

The product installed into `.claude/`. Summary of the system (detail in
`ORC-HANDOVER.md`):

**Philosophy (non-negotiables):**
- The orchestrator **never implements** — it always dispatches scored subagents,
  even for one-line tasks. It runs Opus 4.8 high and only coordinates.
- **Disk is truth, conversation is a cache** — eager checkpointing → clean resume
  after any pause, including a fresh session via paste-block.
- **Bound scope before parallelizing** — intake sign-off + doc analysis first.
- **Pinned, inspectable models** — named subagents with the model in frontmatter.

**Skills** (`templates/skills/`):
- `orc/` — full orchestrator. Thin **spine** (`SKILL.md`) + progressive
  disclosure: `config.md`, `schemas/` (intent-spec, planning-output, checkpoint),
  `references/` (intake, effort-and-mode, wave-grouping, log-protocol,
  stop-and-resume), `subskills/` (orc-execution, orc-review-verify,
  orc-checkpoint, orc-pr, orc-planner, orc-planner-mini), plus `examples/`,
  `README.md`, and a `run/` dir (gitignored at install; run artifacts land here).
- `orc-mini/` — fast path; one Sonnet-5-high subagent; skips full review/verify/
  summary. Lighter intake (Q1–Q4, soft sign-off), no scoring table (one-line
  complexity read), no dispatch-style/batch-pause asks. Runs a **build+test smoke
  gate** after execution (blocks ship on red, auto-fix once) and an **opt-in
  test-authoring ask** before ship. Orchestrator stays Opus 4.8 high; logging is
  permanent (always traces).
- `orc-verify/` — standalone git-diff verification (read-only).
- `orc-wiki/` — persistent project knowledge base builder (+ schemas, references).
- `orc-analyze/` — System Analyst. **Doc-optional** (a doc OR a bare requirement):
  report-prose + report-audit + report-requirement templates, requirement-spec
  schema. Evidence-or-mark anti-hallucination, recommended-option challenges, and
  an opt-in **deep** mode (two-pass with parallel scouts, verify-every-claim,
  alternatives + risks).
- `orc-analyze-mini/` — fast-lane analyst (doc-optional + evidence + recommended
  options; always single-pass, no deep/scouts).

**Commands** (`templates/commands/`): `orc`, `orc-ultra`, `orc-mini`,
`orc-analyze`, `orc-plan`, `orc-verify`, `orc-wiki`, `orc-pattern`,
`orc-retro`. (Config is the `orc config` **CLI**, not a slash command —
deterministic file I/O, zero model tokens.)

**Agents** (`templates/agents/`) — 19 single-role, model-pinned subagents +
`MODEL-MAPPING.md`:
- Executors (score-mapped, 8 generated): `orc-executor-{haiku-4-5,
  sonnet-4-6-med, sonnet-4-6-high, sonnet-5-high, opus-4-7-med, opus-4-7-high,
  opus-4-8-high, opus-5-high}` (§4u).
- Fixed-role: `orc-system-analyst-opus-5-high`, `orc-planner-opus-5-med`,
  `orc-reviewer-opus-5-med`, `orc-verifier-opus-5-med`,
  `orc-analyze-mini-sonnet-5-high`, `orc-planner-mini-sonnet-5-high`,
  `orc-scout-sonnet-4-6-high` (deep-analysis read-only code scout).
- Ultra-only (read-only, xhigh effort): `orc-advisor-opus-5-xhigh`,
  `orc-judge-opus-5-xhigh` (§4e).

**Pipeline phases** (orchestrator spine): 0 Intake → 1 Planning → 2 Effort/scoring
→ 3 Execution (conflict-free waves, cap `max_wave_tasks`=3) → 4 Integration →
5 Review → 6 Verify → 7 Summary → 8 Ship.

**Model IDs** use the Platform dateless format: `claude-sonnet-4-6`,
`claude-sonnet-5`, `claude-opus-4-7`, `claude-opus-4-8`.

---

## 8. Open items (from handover §9)

1. **Environment verifications (only possible inside Claude Code):**
   - `/agents` — confirm the CLI accepts full model IDs (`claude-opus-4-8`, …)
     and the `effort:` frontmatter field; adjust if it wants short aliases or
     dated IDs.
   - `/doctor` — check for load errors / duplicate names.
   - Confirm slash commands are read from `.claude/commands/`.
   - Main session on Opus for the model ladder to work.
2. **Maintenance drift (by design, now mostly automated):** the 6 executor
   files are GENERATED from one template (§4l — edit `agents-src/`, run
   `npm run build:agents`); cross-lane contract prose has one canonical copy
   in `templates/skills/_shared/`. Analyst/planner procedures still exist in
   both full and mini agents — edit those copies together; the contract lint
   catches a skipped copy.
3. **Rubric width vs model count:** as of v0.30.0 there is ONE 8-band
   score→model table (haiku → opus-5 since v0.34.0), used regardless of
   `rubric_bands` (granularity only now — no more narrow/wide preset). See §4r/§4u.
4. **First real runs** not yet exercised end-to-end (watch scoring table, correct
   agent dispatch, wave cap, checkpoints/pauses, control returning to orc after
   planning).

---

## 4z.8. Mocked runs + the documentation split (v0.46.1)

**The problem.** The README was 928 lines and answered "what is ORC" four
times, while answering "what does a lane actually look like when it runs" never.
Six lanes had a shipped `examples/*-mock.md` written for the MODEL (dense, glyph
notation); the other twenty-three had nothing a newcomer could read. The only way
to find out what `/orc-pact` looked like was to spend tokens running it.

### The catalogue is derived, not listed

`bin/mockrun-catalog.js` enumerates two sources into ONE ordered catalogue:

| Source | Kind | Written for |
|---|---|---|
| `mock-run/*.md` | `walkthrough` | a person — easy English, one shared fake project (`shopcart`) |
| `templates/skills/*/examples/*.md` | `annotated` | the model — dense, and already shipped into `.claude/` |

Everything about an entry is DERIVED: `title` from the file's own `# ` heading,
`summary` from the `> ` blockquote under it, `lane` from whether
`templates/commands/<name>.md` really exists (so `/orc-pact` is a lane and
`a-normal-day` is not), `path`/`bytes`/`lines` from disk. **The one hand-written
table is `GROUP_OF`** — reading order is editorial and no filename encodes it.
A doc with no group still appears, under `other`; a test fails if any SHIPPED doc
lands there, so the fallback protects a maintainer without hiding a mistake.

Consumers:

- **`orc mock-run list | show <slug>`** — package content, so it takes no
  `--dir`/`--global` (it accepts and ignores them, because `orc ui` appends
  `--dir` to every read). Exit 1 on an unknown slug, `--json` on both.
- **`orc ui` ▸ Mocked Skill Use** — a rail plus a gallery/document pane. It is
  served straight from the module rather than by spawning the CLI: the
  `/api/learn` precedent, and for the same reason (static content shipped in this
  package; a subprocess would be ceremony with a cost). Fixture mode serves the
  REAL catalogue — a canned copy could only ever be a staler version of a file
  sitting next to it.

**`orc mock-run` is NOT `orc mock`.** The latter lists the runnable
`mock-examples/<slug>/` folders a green verify left in the USER's project. Two
commands, two meanings; collapsing them would make a package doc look like
something a run produced.

### The panel's rules (all inherited, none new)

- It renders the catalogue and decides NOTHING about it — the Flow-stepper rule.
  A test greps the panel for any hardcoded doc slug or group title.
- Markdown becomes DOM nodes; `innerHTML` never appears. "It is our own file" is
  not a reason to parse it as markup.
- Only panel prose is translated (`nav.mockrun`, `mockrun.*` in en + id). Titles,
  summaries, group titles, lane names and paths come from the module and are
  printed as written.
- A lane is rendered as a COMMAND, not a chip — a chip uppercases, and
  `/ORC-GRILL` is not a command that exists.
- A relative `.md` link inside the catalogue becomes a button that opens that
  doc; an unresolvable link renders as plain text, never as a dead link.

**The renderer's one hard rule: the paragraph branch consumes its first line
unconditionally.** It is the fall-through, so any line every other branch
declines (a stray `| … |` row with no divider under it — the shape that actually
did it) leaves the cursor where it was and hangs the panel in an infinite loop.
A test drives `renderMd` over every shipped document plus that exact malformed
input.

### The documentation split

| File | Holds |
|---|---|
| `README.md` | the pitch, the lanes, the panel, and ONLY the newest changelog entry |
| `CHANGELOG.md` | the full history — **and what `orc changelog` now fetches** |
| `guides/configuration.md` | every config key, the profiles, the two other config families |
| `guides/model-selection.md` | the score→model tables, `opus5_only`, the tier guard |
| `mock-run/INDEX.md` | the map of every mocked run |

`CHANGELOG_URL` in `bin/cli.js` moved from `main/README.md` to
`main/CHANGELOG.md`, and `test/webui.test.js` parses that file instead. This was
not cosmetic: `orc changelog` prints "entries newer than yours", and a README
carrying one entry would have answered a user ten releases behind with one line.
**A release now writes its entry twice** — the full body in `CHANGELOG.md`, a
short summary in the README.

Moving the source exposed a parser seam. `parseChangelog` ended an entry at the
next `###`, so the newest release reached the upgrade modal with
`## Earlier releases` and the rule above it glued on. **An entry now stops at the
next level-2 heading too** — a `##` is document furniture, never part of a
release. Two tests pin the rest of that path:

1. no entry body may contain a `##` heading or end on a horizontal rule, and
2. **CHANGELOG.md's newest entry must equal `package.json`'s version.** That
   pairing IS the upgrade mechanism: `orc upgrade` fires off the version gate,
   and a release shipped without its entry tells everyone who takes it that
   there is nothing new.

`mock-run/media/` holds the `orc ui` video placeholder. It ships empty with a
README naming the two files (`orc-ui-demo.mp4`, `orc-ui-demo-poster.png`), the
exact markdown line to paste, and the GitHub-specific note that a `<video>` tag
with a repo-relative `src` does not play inline (the working route is the
`user-attachments` URL an issue comment generates).

`package.json` `files[]` gained `mock-run/` and `CHANGELOG.md`;
`bin/verify-package.js` names `bin/mockrun-catalog.js` and `mock-run/INDEX.md`,
so a publish that drops the folder fails loudly instead of shipping an empty
panel.

---

## 4z.19. THE BIN-SHIM COLLISION — a rename that took every upgrade path with it (v0.56.0)

### 4z.19.1 The thesis, in one line

**The package's NAME is part of its install contract, and changing it while
keeping the same `bin` name makes every existing install a blocker.** v0.55.1
published ORC to npm as `@azure-id/orc`; it had been the unscoped `orc`. Both
declare `"bin": { "orc": "bin/cli.js" }`. npm links a bin only when the shim is
unowned or owned by the package doing the linking, so the old package sitting in
the global prefix made the new one unlinkable.

### 4z.19.2 What it actually looked like

Every source failed, identically:

```text
npm error code EEXIST
npm error path C:\Users\<u>\AppData\Roaming\npm\orc
npm error EEXIST: file already exists
npm error File exists: C:\Users\<u>\AppData\Roaming\npm\orc
npm error Remove the existing file and try again, or run npm
npm error with --force to overwrite files recklessly.
```

Read the path: it is the **command file**, not a package directory and not a
tarball. **The error is about a FILE, not a source.** That single fact explains
the whole shape of the outage:

- `orc upgrade`'s fallback ladder existed to survive a bad SOURCE. It walked the
  tarball, then the `github:` spec, spent a network round trip on each, and
  arrived at the identical `EEXIST` — then printed npm's wall as if the last
  source were at fault.
- `orc ui ▸ Maintenance ▸ upgrade` shells the same command, so it failed the
  same way.
- Copying the README's install line by hand failed too. Nothing the user could
  type from the documentation worked.
- `npm i -g -f <spec>` "worked", which is the worst outcome: `--force`
  overwrites the shim and leaves the superseded package installed underneath,
  owning nothing, updated by nothing, and invisible in every report.

### 4z.19.3 The fix — evict the OWNER, do not force over the file

`orc upgrade` gains a **step 0** that runs BEFORE any spec is tried:

1. `detectLegacyBinOwner()` walks `LEGACY_BIN_OWNERS` (currently `["orc"]`)
   under `npm root -g` and returns the first package that (a) is not
   `PKG_NAME` and (b) declares an `orc` key in its `bin`.
2. `evictLegacyBinOwner()` runs `npm uninstall -g <name>`, announced.
3. The normal spec ladder then installs cleanly, no `--force` anywhere.

**Ordering is the design, not an optimisation.** The collision fails every
source identically, so trying the ladder first can only spend three network
round trips arriving at the same error. It is also the only global npm mutation
ORC makes on a user's behalf, which is why it is printed before it happens.

**Detection is by OWNERSHIP, never by directory name.** Two guards:

- `if (m.name === PKG_NAME) continue;` — a directory called `orc` that holds
  THIS package is not legacy. A machine that never saw the rename land must not
  have its working install uninstalled out from under it.
- `hasOwnProperty.call(bins, "orc")` — a package that declares no `orc` bin
  blocks nothing and is never touched.

### 4z.19.4 `--force`, scoped to the one case it is right for

A collision that SURVIVES the eviction means there was nothing to uninstall — an
**orphaned shim**, a file npm left behind with no package owning it. `--force`
overwrites a file that belongs to nobody, which is exactly what it is for. So
the retry is kept, and fenced: `isBinShimCollision(output)` requires the
`EEXIST` code AND a path component that IS the bin name (after normalising
separators, plus the `.cmd` / `.ps1` Windows shims). `orchestrator` does not
match; an `EEXIST` on some dependency deeper in the tree does not match. **A
predicate that reaches for `--force` on any `EEXIST` would reach for it on
failures it cannot fix.**

### 4z.19.5 Two more bugs the rename had already planted

- **The spec ladder led with a branch tip.** The npm REGISTRY is now first, then
  the tarball, then the `github:` spec. The registry resolves a VERSION; the
  tarball resolves whatever `main` happens to be; the `github:` spec shells out
  to git and fails under restricted git / NVM, so it stays last. `--from` and
  `ORC_INSTALL_SPEC` still win outright, and the remembered `last_good_spec`
  still leads.
- **`freshCliPath()` resolved the LEGACY package.** It looked only at
  `<npm root -g>/orc/bin/cli.js`. After the rename that path is the OLD package,
  so on a machine mid-rename step 2 ran the very cli step 1 had just superseded
  and re-applied the OLD templates — a silent no-op upgrade. It now tries
  `[PKG_NAME, ...LEGACY_BIN_OWNERS]` in order and accepts a hit only if the
  manifest there says `PKG_NAME`: **a directory that exists is not proof of
  identity.**

### 4z.19.6 `orc doctor` gains `legacy-global-package`

It is the one finding that explains why `orc upgrade` cannot fix anything else
in the same report, so it prints the old package's name and version, the current
package name, and both the automatic and manual routes.

**It is deliberately NOT `--fix`-able.** `orc doctor --fix` is update + prune +
settings re-merge, and its entire blast radius is this project's `.claude/`.
Evicting a global npm package is neither project-scoped nor something to do
without saying so — so `fix_command` points at `orc upgrade`, which does it
announced. `FINDING_ROUTE` sends it to **Maintenance**, where the `upgrade`
action row lives (a caution routes to the panel that can CLEAR it, v0.43.6).

### 4z.19.7 Why the README needed a CAUTION anyway

**The fix cannot reach the people who need it.** A user still on the old
unscoped package does not have this code — their `orc upgrade` is the OLD
upgrade, and it still fails. The self-healing path only works from v0.56.0
forward, so the one-time manual escape has to live somewhere a person can read
without a working `orc`:

```bash
npm uninstall -g orc
npm i -g @azure-id/orc
orc update
```

That is the standing lesson for any future rename: **a tool cannot ship its own
recovery for a break that disables the tool.** The README, and only the README,
is reachable in that state.

### 4z.19.8 Tests

`test/cli/upgrade.test.js` — source-level and pure-function on purpose, because
the real behaviour depends on the machine's global npm state, which a test must
never mutate and can never assume. Nine cases pin: `PKG_NAME` equals
`package.json`'s `name` and `NPM_SPEC` IS `PKG_NAME` (not a second spelling);
`LEGACY_BIN_OWNERS` names `orc` and excludes the scoped name (evicting ourselves
would uninstall the tool); the registry precedes the tarball precedes the
`github:` spec; the eviction precedes the spec loop; `isBinShimCollision`
accepts the real Windows wall, the posix form and both shims, and rejects
`orchestrator`, an unrelated `EEXIST`, an empty string and `null`; the two
ownership guards; `freshCliPath`'s scoped-first order and identity check; and
that the doctor finding is not `fixable: true`.

---
