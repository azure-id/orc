# Reference — the surface map

Loaded in MAP mode. The file is `orc-handoff/surfaces.md`, at the top of the
project. It is a normal file you can read and commit.

## Shape

One block per file. The heading is the name of the block, so it must not change
once written — other things point at it by id.

```markdown
# Files a non-developer can own

## H-001 · web/locales/en.json · Screen text
- grade: green
- check: npm run i18n:check
- check_kind: command
- revert: git checkout -- web/locales/en.json
- keys: cart.empty.title, cart.empty.cta

## H-002 · content/pricing.md · The pricing page
- grade: amber
- check: open /pricing in the app and read the page
- check_kind: manual
- revert: git checkout -- content/pricing.md
- upgrade: a link checker would make this green

## H-003 · src/config/limits.ts · Looks like settings, is code
- grade: red
- reason: this file decides how much a customer is charged
- ask: a backend developer
```

## The fields

| Field | Required | What it holds |
|---|---|---|
| `grade` | yes | `green`, `amber` or `red` |
| `check` | green + amber | the exact command, or the exact manual step |
| `check_kind` | yes | `command` or `manual` |
| `revert` | green + amber | the exact command that puts the file back |
| `keys` | no | the keys inside the file a person may change |
| `reason` | red | why this is not content, in plain words |
| `ask` | red | who to ask instead |
| `upgrade` | no | what would move this file up a grade |

## How to pick the grade

Ask one question: **if this person makes a mistake, what catches it?**

- A command catches it → **green**. Put the command in `check`.
- Only a person catches it → **amber**. Put the human step in `check`.
- Nothing catches it, or the file changes what the software DOES rather than what
  it SAYS → **red**.

That is the whole rule. Do not grade by folder, by file extension, or by how the
file looks.

## `upgrade` is worth filling in

An amber file with `upgrade: a schema check would make this green` turns a warning
into a small, clear piece of engineering work. Over time that is how a project
grows more green surfaces — which is the real outcome this lane is aiming at.

## One thing to tell people about JSON files

When `orc handoff set` changes a value in a `.json` file, it re-writes the whole
file with normal 2-space (or the file's own) indentation. The values and their
order do not change, but if the file had unusual spacing, **the diff can be
bigger than the one line you changed.**

Say this in the confirmation step for a JSON surface. It is not a problem — the
check still runs and the undo command still works — but somebody looking at the
diff afterwards should not be surprised by it.

## What never goes in the map

- Anything under `.claude/` — that is ORC's own state.
- Secrets, `.env`, keys, tokens. Not even as red.
- Generated files. Editing one is undone by the next build, which looks like the
  edit was ignored.
- A file that only exists in one person's checkout.

## Keep it honest

If a project has **no** green surfaces, say that. A map full of amber is a true
map. A map that calls things green so the lane looks useful is the one failure
mode that could actually hurt somebody.
