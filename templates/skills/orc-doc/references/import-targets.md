# Where a Markdown file can actually go

This is the reason the deliverable is Markdown and not `.docx`. The lane prints
a short version of it at handoff; `orc doc targets [--json]` is the machine copy
and is what `orc doc lint --target` enforces.

## The matrix

| Target | Imports `.md`? | How | Watch out for |
|---|---|---|---|
| **Notion** | **Yes, native** | Settings ▸ Import ▸ *Text & Markdown*; a **ZIP of a folder** preserves structure | **Only H1–H3 exist** — H4+ degrades to bold text. 5 MB/file free, 50 MB paid, 5 GB/ZIP. A hidden file (`.DS_Store`) in the ZIP fails the import |
| **Obsidian** | **Yes, native format** | Drop the file or folder into the vault | Nothing. This is its native storage format |
| **Google Docs** | **Yes, native** | *File ▸ Open* an `.md`, or upload to Drive and open with Docs. Import/export is **on by default**; *Tools ▸ Preferences ▸ Enable Markdown* only adds copy/paste-as-markdown | Tables convert, but complex ones flatten |
| **Coda** | **Yes, native** | Type `/import` on the canvas and pick Markdown (or `/markdown`); multi-file is supported | — |
| **Craft** | **Yes** | Import an Obsidian/Markdown folder; it converts files to documents with backlinks and attachments | — |
| **Apple Notes** | **Yes, native** (macOS Tahoe / iOS 26+) | Import the `.md`; it converts the syntax to rich text on the way in | Older OS versions have no support at all |
| **GitHub / GitLab** | **Yes** | It *is* the format | A relative image path must exist in the repository |
| **Docusaurus / MkDocs / Hugo / Jekyll** | **Yes** | Drop it into the content tree | These *want* YAML front matter — the one case where the front-matter default flips |
| **HackMD / Slite / Nuclino / Outline / GitBook** | **Yes** | Per-tool import, or paste | Generally clean for plain Markdown |
| **Confluence** | **No native file import** | A marketplace app (*Markdown Importer & Editor*, *Markdown Importer for Confluence*) or a converter script; the editor itself only understands a few typing shortcuts | Plan for an admin-installed app. This is the one mainstream target that costs a step |
| **Microsoft OneNote** | **No.** Zero native support on every platform | Convert to Word or PDF first, then import that | SharePoint/OneDrive rendering an `.md` **file** is not the same as a OneNote page |

## What the matrix buys the design

It is **load-bearing**, not decoration. `orc doc lint --target` enforces that
target's real limits:

- `--target notion` → heading depth **≤ 3** is an ERROR, not a style note.
- `--target confluence` → warn once, at handoff, that an importer app is needed.
- `--target docusaurus` / `hugo` / `jekyll` → YAML front matter is **required**
  instead of banned.
- `--target generic` (the default) → the intersection of all of them.

**A lint rule that came from a real product limit is worth ten invented ones.**

## Choosing one

D4 asks where the document will end up. If the user does not know, `generic` is
the honest answer and it is the strictest profile — a document that passes it
imports cleanly everywhere in this table except OneNote, which imports nothing.
