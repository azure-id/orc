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

## Where a `> **Open:**` line belongs

A required section with no material gets a visible line:

```markdown
> **Open:** the fraud limit has not been decided. Needed before the rollout
> section can commit to a date.
```

That is the document being honest. It is never a lint finding and never a
checker finding — inventing filler to avoid it is.

The same shape, for something you had to assume in order to write the sentence:

```markdown
> **Assumption:** refunds settle within one banking day. Not stated in anything
> I was given.
```

## Severity

`orc doc lint` returns `error` and `warn`:

- **`error`** — the document will be visibly wrong in the target. It blocks the
  handoff line ("this is ready to import").
- **`warn`** — a readability or portability signal. It is reported, never
  blocking. A signal is not a verdict.
