# Portable Markdown — the rules `document.md` is held to

Enforced two ways: **`orc doc lint`** (free, deterministic, mechanical) and the
checker (judgment). Every rule below came from a real product limit, not from
taste — see `import-targets.md` for where each one comes from.

| Rule | Why |
|---|---|
| ATX headings only, exactly one H1, no skipped levels | Every importer's outline builder depends on it. A setext (underlined) heading is invisible to most of them |
| **Max depth H3** under `--target notion` (and under `generic`) | Notion has three heading levels. An H4 silently becomes bold text |
| **No hard-wrapped paragraphs — one paragraph, one line** | A hard wrap at 80 columns becomes a line break INSIDE a Notion or Docs paragraph. This is the single most common import-mangling bug |
| No raw HTML, no HTML comments in the deliverable | Some importers render them as literal text |
| Simple pipe tables only — no nesting, no colspan, no ragged rows | Everything else survives an import; these do not |
| ` ``` ` fences only, with a language tag | `~~~` and indented code blocks convert unreliably |
| No `[[wikilinks]]`, no footnotes, no definition lists | Obsidian-only / Pandoc-only syntax |
| Task lists `- [ ]` are allowed | Notion, GitHub and Docs all handle them |
| Images: a relative path **and** alt text, plus a one-line text description beside it | Images do not travel through most imports. The description is what survives |
| **YAML front matter OFF by default**, ON for `--target docusaurus` / `hugo` / `jekyll` | Notion and Docs render it as visible junk at the top of the page; a static-site generator will not render the page without it |
| No emoji in headings (the body is fine) | Some importers slug headings and mangle the anchors |

## The one that is worth repeating

**One paragraph is one line.** Not "prefer long lines" — one line. A writer that
hard-wraps at 80 columns produces a document that reads perfectly in a terminal
and arrives in Notion as a column of broken fragments. `orc doc lint` reports
it once per paragraph, as an ERROR.

## Where a gap goes, and why it is not in the document

**The deliverable carries content only.** No `> **Open:**`, no
`> **Assumption:**`, no note callout, no HTML comment — not in `document.md`, and
not in any file under `sections/`.

This does **not** relax the never-invent-a-fact rule; it changes only where the
honesty is written down. ORC still refuses to make something up. What is not in
`context.md` or `context-sources.md` is **not written at all**:

| what it is | where it goes |
|---|---|
| nobody has decided this yet | `orc doc log <slug> --kind gap --sections <id> --text "the fraud limit has not been decided"` → `gaps.md`, and it is raised with the user |
| I had to assume it to write the sentence | the same, and it is raised with the user |
| which option we chose, and why | `orc doc log <slug> --kind decision --text "…"` → the journal |
| the template's `<!-- purpose: … -->` lines | stripped at compile — they are instructions for the writer |

**Why the reversal.** A PRD that arrives in Notion with three `> **Open:**`
blockquotes in it is a PRD the reader has to filter. The gap is real and worth
recording; it just is not part of what the reader came for. And a *stub* section
that is nothing but an Open line is worse than an absent one — under
`orc doc compile --partial` a missing section is simply **absent**, and named
loudly outside the document.

**It is enforced in four places**, and none of them is a silent rewrite:

1. **The writer never emits one** — uncertainty goes in its return's `gaps[]`.
2. **`orc doc lint`'s `annotation-in-body` is an ERROR.** The rule matches an
   EXACT, narrow set — `> **Open:**`, `> **Assumption:**`, `> **Note (ORC):**`,
   an `orc-doc:` fence — and **nothing else**. A user's own line beginning
   "Note:" is content and is never flagged. A narrow rule that is always right
   beats a broad one that argues with the author.
3. **`compile` REPORTS them and never silently strips.** They come back in
   `annotations[]` with a line and a fix. We cannot tell whose line it is, and a
   silent strip can delete a real sentence. The one exception is the explicit
   `orc doc compile --strip-annotations`.
4. **The section state no longer sniffs the body.** Existence and hashes decide
   it, which was always strictly more reliable than a text match.

## Severity

`orc doc lint` returns `error` and `warn`:

- **`error`** — the document will be visibly wrong in the target. It blocks the
  handoff line ("this is ready to import").
- **`warn`** — a readability or portability signal. It is reported, never
  blocking. A signal is not a verdict.
