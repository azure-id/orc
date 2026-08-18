# Generation rules — ORC's own, read AFTER the house rules

> Canonical prose. The order in a slice is **house rules first**
> (`house-rules.md`), then everything on this page. That order is the contract.

These ship enabled and apply to every document. All four are **FREE and
deterministic** — hard rule 6 (the free check runs before the paid one) is what
makes them worth having at all: **no model is ever paid to notice a `TODO`.**

Every one is **narrow on purpose**. A broad rule that argues with the author
gets switched off; a narrow rule that is always right gets used. Same reasoning
that keeps `DOC_ANNOTATION_RE` to an exact set.

---

## 5b — No questions, confirmations, or non-document explanation in the body

**The deliverable answers. It does not ask.** Rule 5a already banned ORC's own
annotations; this bans the writer's *"we should confirm this with the team"*.

Free lint rule **`question-in-body`** (**error**). It matches ORC-shaped or
approval-shaped markers — never "is this a question mark", because a document
may legitimately ask its reader a rhetorical one:

- word-boundary tokens: `TBD` · `TODO` · `FIXME` · `XXX` · `???` · `TBA` · `(?)`
- phrases: `to be confirmed` · `to be decided` · `please confirm` ·
  `needs confirmation` · `we need to decide` · `pending confirmation`
- a line that is **only** a question put to the reader as an approver:
  `^(Should|Do|Can|Would|Could) we …?$`

**Two exemptions, both required, or the rule argues with the author:**

1. Fenced code blocks are skipped.
2. A line inside a section whose **outline heading** matches
   `open questions|questions|risks|assumptions` is skipped — a template that
   declares a questions section is allowed to have one.

Everything caught goes to **`orc doc log --kind gap`** → the derived `gaps.md`,
which already exists. No new destination is invented.

## 5c — Missing information is `N/A` plus one short line, never filler

> **What you do not have is `N/A` and at most one short sentence saying what is
> missing. Never write around a hole.**

Two supports:

- **The writer contract.** An `N/A` section still returns the gap, so the user
  sees what is missing rather than reading past it.
- **Free lint rule `na-padded` (warn).** A section body that opens with `N/A`
  and then runs more than a few non-blank lines. A **warning, never an error** —
  the author may have a reason.

## 5c (measured) — Short and straight

Not a prose rule the model has to *feel* — a **measurement**:

- `orc doc lint --json` carries, per section: `lines`, `budget_lines`,
  `over_budget_pct`. A section over **1.5×** its `budget_lines` adds a **warn**
  `over-budget-section` naming the section and both numbers.
- `readability.words_per_section` rides alongside.
- Both are **SIGNALS and block nothing** — the existing `honesty[]` sentences
  still apply and must not be softened.
- The writer slice already carries `budget_lines`; it also carries the bar:
  **under the budget is correct; over it is a finding.**

## 5d — No local-only references — the document is for an online reader

The reader of a PRD or a TSD usually has **no repository, no checkout and no
shell**. A path is a dead end for them.

Free lint rule **`local-reference`**, matched in prose and in link targets,
**outside fenced code blocks**:

- a `path/file.ext:NN` anchor (the `file:line` shape)
- an absolute path: `C:\…`, `/Users/…`, `/home/…`, `/mnt/…`
- a relative-path opener: `./…`, `../…`
- `localhost`, `127.0.0.1`, `0.0.0.0`, a `file://` URL
- a repository path with a code extension (`src/…`, `bin/…`)
- a markdown link whose href is a relative `.md` / `.txt` file

**One config key:**

```
doc_local_refs   off | warn | error      (default: error)
```

Why a key at all: a genuinely internal runbook legitimately names local paths,
and **a lint rule with no switch gets fought instead of used**. Three values,
one key, and the default is the demand.

**Fenced code is exempt** because a code example that *shows* a path is content,
not a reference — the same narrow-rule principle as `DOC_ANNOTATION_RE`.

---

## The template lock — `a lane that writes outside its template`

A **supplied** template (`orc doc init … --template <path>`) is a **P0 cage, not
a suggestion**. A shipped base template stays a floor, which is what
`orc doc templates` has always said.

1. **The slice carries the cage.** `orc doc plan --json` carries
   `template_locked: true` and `allowed_headings[]`, and the writer slice says:
   *"You may not add, rename, merge or drop a heading. What does not fit is a
   gap."*
2. **`orc doc lint` errors `heading-outside-template`** (lock only): an H2+ in a
   section file that is neither the section's own heading nor a declared
   subsection.
3. **`orc doc parts --confirm` REFUSES** a part whose headings drifted, naming
   the heading and **writing nothing** — the `splice` hash-conflict refusal
   shape.
4. **`orc doc audit` reports two classes:** `template-drift` (a section file
   carries a heading the template never had) and `template-moved` (the source
   template file hashes differently than at init — reported, **never**
   auto-synced).
5. `orc doctor` gains nothing. This is a document-level fact, and **Docs** is
   the panel that clears it.

`--template-soft` opts out at init, and the init output says which is in force.
The `user-edited` exception survives unchanged — a human adding a heading by
hand is `user-edited`, which is REPORTED and never a finding.
