# The quick context doc — shape and rules

This is the file orc-quick writes after every request. It is written for a
HUMAN to read later, in this session or a different one.

## Where it goes

```
<projectRoot>/orc-quick/<slug>/quick-context.md
```

- `<slug>` is the slug of the **first** request in the thread. No date in the
  folder name.
- **One file per folder. Never make a second `.md` file.** No `review.md`, no
  `diff.md`, no per-request files.
- It sits at the project root, next to folders like `test-generator/` and
  `learning-docs/` — never inside `.claude/`.

## Rules

1. **Write it BEFORE the offers** (test / review / commit). If the user walks
   away, the entry is still complete.
2. **Every request gets an entry** — even a read-only dig. There, the answer IS
   the result.
3. **Never read the body of this file.** Only two exceptions:
   - the TOC block, when you re-open a thread;
   - the user asks you to read it.
4. **Never commit it.** It is not staged, ever. Do not edit `.gitignore`.
5. One entry can hold **several dispatches**. A dig that turns into a fix is ONE
   entry with two rows in its table.

## The TOC block

The top of the file has a short list between markers:

```markdown
<!-- orc-quick:toc -->
1. Change json payload A → B                05-08-2026 14:23:10  ✅ committed a1b2c3d
2. How does tenant scoping work?            05-08-2026 15:47:02  ℹ answered
3. Why does /orders 500? — found & fixed    10-08-2026 09:15:44  ✅ committed 7f2e1a9
<!-- /orc-quick:toc -->
```

**Why the markers matter.** When you open a thread again, you need to know the
next number. You read ONLY this block — it is small and cheap. You do not read
the entries below it. That is how "never read the doc" and "keep counting" can
both be true.

Inside one session, the count is also kept in
`.claude/orc/run/<run-slug>/quick-checkpoint.md`. That file is run state, not
the deliverable, so you may read it freely.

**If the TOC is broken or missing:** rebuild it by scanning ONLY the lines that
start with `## <number>.`. Do not read the text under them. Then write the block
back between the markers. Never start a second thread because of a broken TOC.

## Entry shape

Use as many of these as apply. Leave out what does not fit.

```markdown
## <n>. <short title>
**asked** DD-MM-YYYY HH:MM:SS
> the user's request, word for word

**kind** code-change | context-dig | investigate → code-change | pr-comments | …
**resolved intent** one or two sentences: what you actually decided to do.

**clarified**
- <question> → **Y**: <what won> · X was <what the user first said> ·
  Z was <the other idea, and why it lost>

**knowledge** wiki FRESH · docs=<paths> · pattern express@v3

**dispatches**
| # | kind | agent / model | expect | actual | result |
|---|---|---|---|---|---|
| 1 | recon | `orc-recon-sonnet-4-6-med` | sonnet-4-6/medium | sonnet-4-6/medium ✅ | what it found |
| 2 | executor | `orc-executor-sonnet-4-6-med` | sonnet-4-6/medium | sonnet-4-6/medium ✅ | 3 files |

Only an **other** dispatch keeps the `*(ad-hoc, untraced-by-hook)*` mark. A
dispatch of either pinned recon agent is a normal row with the agent's name.

**files changed** path · path · path

**repro** red → green · `npm test -- tests/orders.search.test.js` (before: exit 1 · after: exit 0)
**blast radius** 3 symbols · callers 7 in 4 files · tests reach 2 · risk high: searchByItemPrefix (exported, fan-in 4, no test reaches it)
**tests** reached 12 passed · suite 41 passed
**graph** gen 42 · cards 2 · <the `orc graph gain` line, word for word>

**how it was resolved** a short, plain explanation of the fix and WHY this way.
Say what you did not do, and why. This is the most useful part later.

**build** GREEN · **tests** 41 passed
**unmet** things you did not do, on purpose or not

**follow-through** tests · review result · commit hash · pushed or not
```

For PR work, also add:

```markdown
**pr** #142 "title" · branch · url

**threads taken** 2 of 3
| # | reviewer | anchor | comment |
|---|---|---|---|
| 1 | @dana | src/routes/export.js:34 | the comment text |

**github writes** NONE — no reply, no resolve, no review.
```

These four lines are optional and go in that order, after `**files changed**`.
Leave out the ones that do not apply:

- **`repro`** — only on a defect entry. `repro: none` writes
  `**repro** not reproduced — <the reason>` instead. Never leave it out to keep
  the entry tidy: an unreproduced fix is the thing the reader most needs to know.
- **`blast radius`** — a `risk` word NEVER appears without its `why`. Nothing in
  the graph → `none indexed (<n> files not in the graph)`.
- **`graph`** — the gain line is an estimate with a range. Copy it; never turn
  it into a saving.

## A read-only entry

A dig has no files, no build and no tests. It still gets a full entry:

- **`how it was resolved`** holds the recon `answer`.
- **`unmet`** holds the recon `unresolved[]`.
- A blast-radius dig lists the four caller classes apart — `direct`, `route`
  (reached through a URL), `via_alias`, `inherited` — and, when any list rests
  on the graph alone, the sentence the agent returned, word for word:
  *A card lists every caller that NAMES the symbol. A card's silence is not
  proof of absence.*

## Writing style for entries

Write for a person who comes back in three weeks and forgot everything.

- Use plain words. Short sentences.
- Always name real files and line numbers.
- Say **why** you chose one option and not the other. A rejected idea with its
  reason saves the next person from trying it again.
- Record what you did NOT do. "Backfill not done — user asked to leave it" is
  more useful than silence.
