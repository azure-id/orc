# The token architecture — sections, parts, compile

This file is the point of the lane.

> **The orchestrator never reads the document body.**
> **a lane that reads its own document** has broken this contract.

## The one sentence that changed in v0.49.0

**`sections/` is the source of truth. `document.md` is a build artifact.**

Before this, `document.md` was the truth and the part files were scratch. So
every later change was *extract* (copy a section OUT of the monolith) → edit →
*splice* (write it back IN). The section files existed and were dead, and a
resumed session, an update and a re-check all routed through the 10,000-line
file.

Now a section lives in its own file, which is the source of truth, and the
document is rebuilt from those files on demand. **`orc doc compile` costs zero
model tokens** — it is Node code in the same process, and it always was free.
Anyone who tells you this release made compiling cheaper is selling something.
What it bought is **early review, a resumable wave, no round trip, and bounded
reads**.

## What the orchestrator may hold

| It DOES hold | It NEVER holds |
|---|---|
| `context.md` (small, written by itself) | the body of `document.md` |
| `outline.md` (headings only) | the body of any supporting document |
| `orc doc parts --json` (one row per section: file, state, hash) | the body of any section file |
| `orc doc map --json` (heading + line range + hash + state per section) | the raw template file |
| `orc doc lint --json` (findings with line numbers) | anything an agent read to produce its return |
| each agent's **structured return** (≤ ~40 lines) | |

If the orchestrator ever needs a fact from inside the document, **it dispatches
for it.** Reading is delegated, always.

## What lands on disk

```
orc/orc-doc/<slug>/
├── doc.json              CLI-owned state (version 2). Never hand-edited
├── context.md            the FROZEN brief. Written ONCE, quoted verbatim
├── context-sources.md    the digest of the D2 documents (anchored)
├── outline.md            DERIVED by the CLI from doc.json
├── gaps.md               DERIVED — every Open / Assumption, OUT of the document
├── changelog.md          one entry per cycle: what changed, and who asked
├── sections/          ◄── THE SOURCE OF TRUTH
│   ├── 00-front.md          anything above the first `## ` (front matter, an H1)
│   ├── 01-document-info.md
│   ├── 02-summary.md
│   └── 04-detailed-design/  ◄── a big section, stored as sub-parts
│       ├── 00-head.md           the `## ` heading + any intro prose
│       ├── 01-data-model.md     `### Data model`
│       └── 02-api-surface.md    `### API surface`
└── document.md        ◄── THE BUILD ARTIFACT. Rebuilt, never edited by ORC

.claude/orc/run/<slug>/
└── RESUME.md          ◄── the registered v0.42.0 home, and the ONLY place
                           `orc resume` and `orc run list` look
```

`sections/<NN>-<slug>.md` starts with its own `## Heading` and contains nothing
else. **Directly readable, directly editable, directly diffable in a PR.**

**The join key is the FILENAME.** No markers inside the files: an HTML comment
is a *lint error* in this lane and mangles on a Notion or Google Docs import,
and the deliverable's cleanliness is this lane's entire product. A marker that
buys nothing costs the import.

**Order comes from `doc.json.outline`, never from the filename number.** The
number is a *mirror* of the outline index, kept in sync by the CLI — which is
why `orc doc outline --set` renames the files on disk in the same step. This is
the existing rule one level up: *a section's id comes from the OUTLINE, never
from the file's own ordinal.*

## The section map — derived, never stored

```
$ orc doc map prd-checkout-refund-130826 --json
{
  "file": "orc/orc-doc/prd-checkout-refund-130826/document.md",
  "lines": 487,
  "sections": [
    { "id": "01-document-info", "heading": "Document info", "level": 2,
      "start": 5, "end": 18, "lines": 14, "hash": "a91f…", "state": "written" },
    { "id": "02-summary", "heading": "Summary", "level": 2,
      "start": 19, "end": 31, "lines": 13, "hash": "4c02…", "state": "user-edited" }
  ]
}
```

- **`id`** = ordinal + slugified heading. Stable across every rewrite of the
  BODY, which is what a re-check needs.
- **`hash`** = SHA-256 of the section's exact text, and it does three jobs:
  **drift detection** (did the user edit it?), **conflict detection** (did it
  change between two sessions?), and **skip detection** (a section whose hash
  has not moved does not need re-checking). *The hash is what turns a re-check
  from a full pass into a diff.*
- **`state`** ∈ `planned | written | checked | user-edited | open | unconfirmed`.
  COMPUTED from the disk every time — never stored as a claim.
- **Renames are repaired, not lost.** A heading whose text changed but whose
  position and neighbours match is the same section with a new `id`; `doc.json`
  is updated and the history follows it. A heading that appears with no such
  match is new.

Because the map is re-derived after every single write, **no line number in this
system is ever stale.** That is what makes range-based reading safe.

### `unconfirmed` — the state a usage limit leaves behind

A part is `written` only when its hash was recorded from a **validated return**
(`orc doc parts <slug> --confirm <ids>`, run at the wave's stop sequence). **A
file present with no recorded hash is `unconfirmed`:** a writer killed mid-flight
leaves a truncated file, and detection is already paid for. `orc doc parts`
reports it, `orc doc next` offers to re-write it, and `compile` includes it only
under `--partial` with the state named. **A half-written section never silently
becomes the deliverable.**

## Dispatch #0 — digesting the supporting documents

The one place a lot of foreign text has to be read, and it is read by a
dispatched writer:

- one dispatch per supporting document, ≤ `doc_max_parallel` in parallel;
- each returns a **digest, not the content**: the claims that bear on the D1
  context, each anchored `path:line`, plus an explicit `not_covered[]`;
- the orchestrator concatenates the digests into `context-sources.md` and holds
  only that;
- a document longer than `doc_max_lines_per_agent` is split the same way
  everything else is, digested in parts, and the parts concatenated.

## The write wave — the CLI computes the batching

```
$ orc doc plan prd-checkout-refund-130826 --role write --json
{ "write_mode": "partial", "more_waves": 6,
  "waves": [ { "n": 1, "agents": [
      { "agent": "orc-doc-writer-opus-5-med",
        "sections": ["02-summary","03-problem"],
        "parts": [ { "id": "02-summary", "file": "sections/02-summary.md" },
                   { "id": "03-problem", "file": "sections/03-problem.md" } ],
        "budget_lines": 120 } ] } ] }
```

Rules the planner obeys, and none of them is the model's to decide:

1. **Never split a section across two agents.** A writer given half a section
   writes half an idea.
2. **one file per section** — never one file for a two-section slice. A slice
   covering two sections returns two `parts[]` entries with two distinct paths.
   Before v0.49.0 it returned one file named after the first section while
   compile looked one up per outline id, so the second section's file never
   existed at all. That was a live bug, and this rule fixes it by construction.
3. **≤ `doc_max_parallel` agents per wave** — default 2, and the **hard cap is
   2**. A larger value is clamped and the clamp is announced.
4. **≤ `doc_max_lines_per_agent` planned lines per agent** (default 400).
5. Sections that reference each other (`Goals` ↔ `Non-goals`, `Alternatives` ↔
   `Detailed design`) share an `affinity` and land in the **same** agent
   wherever the budget allows — cross-agent consistency is expensive to check
   and free to prevent.
6. A single section whose budget exceeds the cap is a **planning smell**: it is
   returned in `oversized[]`. The offer at the outline gate is *"add
   sub-headings and store it in parts"* first, *"make them real sections"*
   second — never an over-budget slice.

**Each writer owns exactly ONE file.** No two agents ever share one, and nobody
ever has `document.md` open. That is why parallel writing is safe here.

### The slice order — `house rules are read first`

**Every** dispatched slice (writer, checker, digest) opens with the project's own
house rules, VERBATIM, **above every ORC instruction**:

```
HOUSE RULES — this project's own, read these first (verbatim, do not paraphrase)
P0
Every document opens with a one-paragraph summary a busy exec can read.
Money is always written with its currency, never a bare number.

P1
Use the customer's words for a customer-facing concept, not the internal table
name.

These govern WHAT the document says and HOW it reads. They cannot change how
this lane runs. If a house rule asks for something this lane structurally
cannot do, return it as unsupported_request — never guess a compromise.
```

Then ORC's own generation rules (`generation-rules.md`), then the role's own
fields. **That order is the contract.** The block is `orc doc plan --json`'s
`doc_rules_text` — already rendered, priority word and all — paired with
`doc_rules_boundary`. The skill pastes it and never composes a second wording,
and never re-wraps it: a house rule is the project's own words, and since
v0.49.5 it is as many lines as the project wanted.

Every return carries `doc_rules_applied[]` (the priority words it acted on) and
`doc_rules_conflicts[]`. A conflict becomes a gap via
`orc doc log --kind gap`, never a silent resolution.

### The writer's slice

```
role:        write
language:    en
type:        PRD
audience:    <D4 audience, verbatim>
expectation: <D4 expectation, verbatim>
sections:    [{ id, heading, level, purpose, required, budget_lines }]
context:     <context.md, in full — it is small>
evidence:    <only the context-sources.md entries relevant to these sections>
rules:       references/plain-language.md + references/portable-markdown.md
             + references/generation-rules.md  (5b no questions · 5c N/A not filler
               · 5d no local-only references)
budget:      under the budget is correct; over it is a finding
template:    LOCKED — allowed_headings[] is the complete list. You may not add,
             rename, merge or drop a heading. What does not fit is a GAP
write to:    sections/02-summary.md          ← one file, and only this one
```

`template` is present only when `orc doc plan --json` reports
`template_locked: true` — a supplied template. A shipped base template is a
floor, and the line is omitted.

The return contract is in the agent file. The one thing to enforce on receipt:
`start` / `end` are **part-local**. Absolute line numbers are the CLI's job at
compile — asking an agent for an absolute number in a file it cannot see is
exactly how that number gets invented.

## Partial writing — the biggest saving in the lane

`doc_write_mode` is `ask | partial | all`, default `ask`. It is asked **once per
run and stored** (`orc doc mode <slug> --set partial`), never decided per wave by
the orchestrator — that is remembered-not-dispatched protocol, the failure this
repo has already paid for twice.

In `partial`, `orc doc plan --role write` returns **wave 1 only**, with
`more_waves: N`. The rest cannot be bought by accident. You read what wave 1
wrote, and you redirect before waves 2..N are paid for.

## Compile — free, on demand, deterministic

```
orc doc compile <slug> [--partial] [--strip-annotations] [--json]
```

1. `front` = `sections/00-front.md`, verbatim and first, if it exists.
2. `# <title>` — **unless** the front file already carries an H1.
3. Every outline entry whose source resolves, **in outline order**.
4. Blank-line normalisation runs **ONCE, at the very end**, so a nested join is
   never normalised twice.

`--partial` writes what exists. **A missing section is simply ABSENT — never
stubbed with a note.** The omission is reported loudly OUTSIDE the document: in
compile's own output, in `status`, in `next` and in `audit`.

### The deliverable carries content only

No `> **Open:**`, no `> **Assumption:**`, no note callout, no HTML comment — not
in `document.md`, and not in any file under `sections/`. This does not relax the
never-invent-a-fact rule; it moves where the honesty is written down. A gap goes
to `orc doc log --kind gap` and lands in `gaps.md`; a settled choice goes to
`--kind decision` and lands in the journal.

`orc doc lint`'s **`annotation-in-body`** is an ERROR and matches an EXACT,
narrow set — `> **Open:**`, `> **Assumption:**`, `> **Note (ORC):**`, an
`orc-doc:` fence — and nothing else. A user's own line beginning "Note:" is
content. `compile` **REPORTS** every match in `annotations[]` and never silently
strips one: rule 4 outranks tidiness, because we cannot tell whose line it is.
`--strip-annotations` is the explicit opt-in.

**Determinism:** the same sources always produce the same file, byte for byte.
Nothing in the compile reads a clock, a config that could change, or the
filesystem order — `readdir` is never the order, the outline is.

### `source_hashes` — why nothing has to be remembered

`compile` records `compiled.source_hashes = { id → hash of that section's
assembled source }`. **`document.md` is stale ⇔ some section hashes differently
today than that recorded.** Pure disk comparison, coverage-relative, no stored
status word — the `computeWikiFreshness` / `shipped-drifted` rule applied to a
build artifact. It is why `orc doc ship` can refuse on a stale document and
*name the sections*.

## The reverse direction: `orc doc split` (also free)

```
orc doc split <slug>                              document.md → sections/
orc doc split <slug> --section <id> --by-heading   one section → sub-parts
```

`docScan` already returns every `##` section with its exact text and
`docReconcile` already re-keys those to outline ids, so decomposing a monolith
costs nothing. This is what the migration uses, and it is also what recovers a
document a human reshaped by hand in an editor.

**Round-trip property:** `split` then `compile` reproduces `document.md`
byte-for-byte for any document the CLI itself produced. There is a test.

## A section too big for one file — sub-parts

One head section with a lot of text splits **underneath**, and the reader never
knows. Forcing it to become several `##` sections would change the document a
reader sees in order to solve ORC's storage problem, which is backwards.

Where the sub-headings come from — and this is the elegant part: **nowhere new.**
`docScan` already collects every heading level; it merely filtered to level 2.
So a user template that already has `###` under a `##` carries its own
sub-structure for free. Three sources, all deterministic, all zero-token:

1. `orc doc init --template <path>` — the `###` under each `##` become `subsections[]`
2. `orc doc outline <slug> --set <file>` — same parse
3. `orc doc split <slug> --section <id> --by-heading`

**When it splits.** A section is stored as sub-parts when it has `subsections[]`
**and** its budget exceeds `doc_max_lines_per_agent`, or when asked explicitly.
**No new config key** — `doc_max_lines_per_agent` is already the threshold.

### The five rules that make nesting safe

Every one is a **refuse-and-name**, never a silent fix:

1. **Exactly one `##` per section.** `00-head.md` carries it; if that file is
   absent, compile emits the outline's own heading.
2. **A child that starts with `##` is a REFUSAL, named by file.** Demoting it to
   `###` would restructure the deliverable; promoting it would split one section
   into two. Neither is ours to choose.
3. **A child must start at `###` or deeper.** Anything else is a refusal, named.
4. **Order is `outline[i].subsections[]`** — never `readdir`, never the filename
   number.
5. **Blank-line normalisation runs ONCE, at the very end.**

**One helper, every consumer.** `docSectionSource` returns a section's files and
its assembled text, and resolves flat-or-nested in one place. Compile, `parts`,
the staleness check, `extract` and the check-dispatch all call it. A second idea
of "what a section's source is" is exactly the drift this lane exists to prevent.

**Invisible above and below.** `docScan` on the compiled document still cuts on
`##` only, so `map`, `lint`, `ship` and `audit` are completely unchanged — a
split section is one section with one range. And the reader gets an ordinary
document.

**Sub-part hashes** live in `doc.json.sections[id].parts`, so a single changed
sub-part is detectable and **only that sub-part is re-checked**.

## Lint → map → check

1. **`orc doc lint <slug> --target <t> --json`** — **free**. Every mechanical
   portability rule plus the readability signals. Exit 0 clean · 1 findings ·
   2 no document. **Free checks run before paid ones. Always.**
2. **`orc doc map <slug> --json`** — the fresh absolute line numbers.
3. **`orc doc plan <slug> --role check --json`** — the checker batches.

### The checker's slice

```
role:      check
read ONLY: sections/04-goals-and-metrics.md               ← Read(file_path), offset 1
sections:  ["04-scope"]
purpose:   <what this section is supposed to do, from outline.md>
audience:  <D4 audience>
expectation: <D4 expectation>
language:  en
already reported by lint: [{line: 13, rule: "long-sentence", …}]
rules:     references/generation-rules.md   (5b · 5c · 5d, and the template lock)
```

**One bounded part file per checker, so there is no line arithmetic anywhere in
the check loop**, and no two checkers ever share a file. A checker never opens a
second file and is never given the whole document. Findings the lint already
reported are never re-reported — paying a model to repeat a free check is the
mistake this ordering exists to prevent.

`severity` reuses the house ladder: **P0/P1 block the handoff, P2/P3 are
advisory** and are shown to the user as optional.

### The dispatch tail NAMES ITS SECTIONS

Every `DISPATCH` line this lane writes carries the sections it was for:

```
DISPATCH orc-doc-writer-opus-5-med :: doc write sections=03-scope,04-risks part=sections/03-scope.md expect=claude-opus-5/medium
DISPATCH orc-doc-checker-opus-5-low :: doc check sections=03-scope expect=claude-opus-5/low
DISPATCH orc-doc-writer-opus-5-med :: doc digest source=<path> expect=claude-opus-5/medium
```

That is what makes `orc doc cost`'s **per-section** attribution honest instead of
a guess. A slice covering two sections splits its cost evenly between them, said
out loud; a dispatch nothing can join reads `—`, never `0`.

## The edit round

Open `sections/<id>.md`, edit it in place, `orc doc compile`. **No extract, no
splice, no monolith touched.** For a section stored as sub-parts, the writer
opens the one ~150-line sub-part rather than the whole 900 lines.

**Before each edit dispatch, print one line per finding, in the shape
`sections/<id>.md · line <n> · <rule>`:**

```
sections/03-scope.md · line 42 · long-sentence
sections/03-goals/02-metrics.md · line 12 · local-reference
```

The numbers are **PART-LOCAL** — the part file is what the writer opens — and
they come from `orc doc lint <slug> --section <id> --json` and from the
`findings[]` anchors on each `plan --role edit` part. **After the round, print
each file touched and the line count it moved by.** The compiled `document.md`
line number is deliberately never carried: it is stale the moment anything is
written, which is what rule 2 exists for.

**Repair is capped at 2 rounds.** After that the lane reports what is still
open, honestly, and stops — the same cap-and-report shape as
`../../_shared/drift-recovery.md`.

## The user's edits are sacred

A `user-edited` section is **never** rewritten without an explicit instruction
naming it. If a finding lands inside one, the finding is *reported* and the fix
is *offered*, never applied.

## Worked example — a 10,000-line document

| | |
|---|---|
| Document | 10,000 lines, 40 sections, ~250 lines each |
| `doc_max_lines_per_agent` | 400 |
| `doc_max_parallel` | 2 |
| Batches | 40 sections → 25 agent slices (1–2 sections each) |
| Waves | ⌈25 / 2⌉ = **13 waves**, parallel within each |
| In `partial` | **wave 1 is bought, then the lane STOPS.** Waves 2–13 are only paid for if wave 1 was right |
| Orchestrator context spent | 25 returns × ~30 lines ≈ **750 lines**, plus the map |
| Naive alternative | 10,000 lines read at least twice ≈ **20,000+ lines** |

Where the saving actually is:

| Flow | before v0.49.0 | now |
|---|---|---|
| First pass | 25 slices, **all bought before anything is viewable** | wave 1 → you read it → redirect or continue |
| The session dies mid-run | the write loop lived in the orchestrator's head, and `orc resume` could not even see the run | **the section files on disk ARE the progress**; `RESUME.md` is rewritten every wave and `orc resume` finds it |
| Update 2 sections, fresh session | `map` (40 rows) → `extract` ×2 → `splice` (rewrites the 10k file) | `parts` (40 rows) → open two files, edit in place |
| Update inside a 900-line section | the writer opens all 900 lines | it opens the one ~150-line sub-part |
| Re-check after that edit | a RANGE of a document whose line numbers moved | **one bounded part file, offset 1** |
| Resume months later | needs `document.md` to exist | `status` + `parts` — works before a single compile has ever run |
| Compile | free | free. It always was |

At 40 sections the lane also raises the split offer at the outline gate: a
document this size is usually several documents.

## Edge cases

| Situation | What happens |
|---|---|
| The supplied template is enormous or unparseable | Parse headings only. None found → say so, show the shipped outline, ask which to use. Never guess a structure out of prose |
| The user reshapes `document.md` by hand | `orc doc split` recovers it: rename repair handles a changed heading, and anything ambiguous is a refusal that names the section |
| `document.md` deleted, `sections/` intact | Nothing is lost. `orc doc compile` rebuilds it, free |
| `sections/` deleted, `document.md` intact | `orc doc split` recovers every section from it |
| A wave partially fails | Each section file is independent. Re-dispatch the failed slices only; a file with no validated return is `unconfirmed` and is named |
| A wave is killed by a usage limit | The files already written stay. `RESUME.md` names where it stopped, `orc resume` finds it, and the next session starts at wave K+1 and re-reads nothing |
| Two sessions on one slug | The **hash is the guard**, not a lock file: a section whose hash moved is `user-edited`, and nothing rewrites one without an instruction naming it |

## Backward compatibility — v1 → v2

`doc.json.version` goes 1 → 2. The migration is **lazy, free, idempotent and
non-destructive**, and it runs on the first `orc doc <anything> <slug>` — never
on `list`, because a listing must not mutate.

- `document.md` is **split into `sections/` and NEVER deleted** — it becomes the
  build artifact, and `compiled.source_hashes` is seeded from the sections just
  written, so it starts life *fresh*, not stale.
- A recorded `.work/` extract is the newer edit, so **it wins** for that id.
- Part files with no `document.md` (a run killed mid-write) are **moved**.
- A section body that is nothing but a `> **Open:**` stub **does not survive**:
  it becomes `planned`, so the pipeline offers to write it.
- `RESUME.md` is **moved** to `{run_dir}/{slug}/` and its heading prefix is
  stripped, so the line finally parses.
- An **unparseable** document (no `##` at all) is a **REFUSAL**: `version` stays
  1, nothing is written. A guessed structure is worse than none.

`assemble`, `extract` and `splice` survive as thin aliases for one release —
`orc doc next` output gets copied into notes and scripts, and a v1 document
mid-flight still emits them.

---

## The pipeline is CLI-computed, not remembered (v0.48.1)

Everything above describes what each phase DOES. What decides **which phase is
next** is `orc doc next <slug> --json`, and this lane renders it rather than
reasoning about it.

```json
{ "ok": true, "slug": "…", "phase": "D7",
  "action": "lint",
  "command": "orc doc lint acme-prd --json",
  "why": "3 sections changed since the last compile; the free check runs before the paid one",
  "paid": false,
  "blocked_by": null,
  "alternatives": ["orc doc map acme-prd --json"] }
```

Exit **0** = an action is available · **1** = waiting on a human decision, named
in `blocked_by` · **2** = unknown slug. The same convention as
`orc pattern status` and `orc diy status`.

`paid` is what lets a caller obey the W2 rule — **a free action gets a button, a
paid action gets a copy-able command** — without holding a second idea of which
steps cost money.

**The wave-review gate is just another `blocked_by`**, which is why partial mode
needs no new prose: after each wave `next` exits 1 and names the human decision.

Never run a command `next` did not name, and never invent the next step. A
session that improvises the order is exactly the drift this command exists to
prevent, and it is the drift that is invisible until months later, in a fresh
context, on a resumed run.

## Reading a section, and who is allowed to

`orc doc read <slug> [--section <id>|--toc]` prints the table of contents, or ONE
section straight from its own file.

**The orchestrator never runs `orc doc read`.** It is a command for the HUMAN,
the same way `orc challenge report` is. Hard rule 0 is not softened by a command
that happens to print prose: reading the document is still delegated, always, to
a checker that receives one bounded part file and nothing else.
