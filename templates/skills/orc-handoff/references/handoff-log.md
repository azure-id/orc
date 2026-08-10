# Reference — the change log

Loaded at H5. The file is `orc-handoff/<slug>/handoff-log.md`, at the top of the
project.

## The rules for the file

- **One `.md` per thread, ever.** The folder is named from the FIRST slug and never
  gets a timestamp, so asking about the same thing again re-opens the same thread.
  Same rule as `/orc-quick`'s context doc.
- **Never staged.** ORC does not add it to git. If the user wants it committed they
  commit it.
- **Append only.** Entries are numbered and never renumbered.
- **Do not read the body back.** On re-open, read only the `orc-handoff:toc`
  block — or the whole file when the user asks for it directly.

## Shape

```markdown
# Changes — cart copy

<!-- orc-handoff:toc
1  2026-08-10  web/locales/en.json  cart.empty.title  green  check passed
2  2026-08-10  content/pricing.md   (page body)       amber  manual check pending
-->

## 1 · Empty cart title

- when: 10-08-2026 14:11
- file: web/locales/en.json
- key: cart.empty.title
- grade: green
- was: "Your cart is empty"
- now: "Nothing in here yet"
- check: npm run i18n:check → passed
- undo: git checkout -- web/locales/en.json
- committed: no

## 2 · Pricing page wording

- when: 10-08-2026 14:26
- file: content/pricing.md
- grade: amber
- what changed: the second paragraph
- check: open /pricing and read the page → NOT DONE YET (a person must do this)
- undo: git checkout -- content/pricing.md
- committed: no
```

## The two fields people actually come back for

**`undo`** — because the reason someone re-opens this file is almost always "how do
I put it back". Write the exact command every time.

**`check`** — and it must say what really happened:

- `→ passed` only when a command ran and passed.
- `→ NOT DONE YET (a person must do this)` for every amber change.

**Never write "checked" for an amber change.** An amber change that reads as
verified is the one entry in this file that could mislead somebody badly.

## The toc block

The block between `<!-- orc-handoff:toc` and `-->` is the only part re-read on
re-open. Keep it to one line per entry: number, date, file, key, grade, outcome.
It exists so a long thread never costs a full file read.
