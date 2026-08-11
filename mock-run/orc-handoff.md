# Mock run — `/orc-handoff`

> The lane for people who do not read code.

This whole lane is written in **very easy English**, because the people who use
it may not be native English readers. Same rule as `/orc-quick`.

---

## 1. What it does

Budi is a product manager. He wants to change one sentence on the checkout
page. It takes a developer 90 seconds. But Budi has to ask, wait, and it takes
three days.

There are 128 skills in the world made for product managers and designers.
Every single one of them writes a **document**. Not one lets Budi change the
sentence.

`/orc-handoff` does two things:

- **MAP** — makes a list of things you can safely change yourself.
- **DO** — changes one of them for you, then checks it, then shows you how to
  undo it.

### The idea nobody else had

Most tools decide "is this safe?" by looking at the **file type**. A `.json`
file is called safe. A `.ts` file is called not safe.

That is wrong.

ORC decides by asking: **is there a cheap check that will catch my mistake?**

| Grade | Meaning |
|---|---|
| 🟢 **GREEN** | Change it. If you make a mistake, a check will catch it right away. |
| 🟡 **AMBER** | Change it, but the check is done by a human. ORC tells you what to look at. |
| 🔴 **RED** | It looks like text, but it is not. ORC will not change it. |

So `config/app.yaml` is **GREEN** because it has a schema file next to it.
And `config/flags.yaml` is **AMBER** because it does not. Same file type.
Different grade. The check is what matters.

---

## 2. The run — MAP mode

Budi opens the project for the first time.

```
> /orc-handoff
```

```
ORC · handoff

Hello. I will look at this project and find the things you can change by
yourself, with no developer.

This takes about 40 seconds. I will not change anything.
```

```
ORC · handoff · your list

I found 6 kinds of things you can change. Here they are.

🟢 GREEN — safe. A check will catch your mistake.

  1  The text on the screen (English)
     where : web/locales/en.json
     what  : 412 sentences and words
     check : a program checks that English and Indonesian have the same keys
     undo  : git checkout web/locales/en.json

  2  The text on the screen (Indonesian)
     where : web/locales/id.json
     what  : 412 sentences and words
     check : same as above
     undo  : git checkout web/locales/id.json

  3  App settings
     where : config/app.yaml
     what  : 23 settings
     check : config/app.schema.json says what is allowed. A wrong value is
             rejected before the app starts.
     undo  : git checkout config/app.yaml

  4  Help pages
     where : docs/*.md
     what  : 14 pages
     check : a link checker runs on every push
     undo  : git checkout docs/

🟡 AMBER — you can change it, but a person must look.

  5  Feature switches (on / off)
     where : config/flags.yaml
     what  : 9 switches
     why amber : there is no schema file. If you type a wrong name, nothing
                 will tell you. The switch just quietly does nothing.
     check : after the change, open the app and look at the feature yourself
     undo  : git checkout config/flags.yaml

🔴 RED — looks like text. It is not. I will not change these.

  6  Email templates
     where : api/emails/*.tsx
     why red : these look like text but they are code. They have logic inside,
               like "if the order is late, show this line". Changing one word
               in the wrong place stops all emails from sending.
     who to ask : Rina

     Also RED: web/components/*.tsx — the text is mixed with code here.
     The GREEN way to change that text is item 1 and 2 above.

I wrote this list to: orc-handoff/surfaces.md

Now tell me what you want to change. Use normal words.
For example: "change the empty cart message".
```

---

## 3. The run — DO mode

```
> the message when the cart is empty is too cold. make it friendlier.
```

```
ORC · handoff · find

I found it.

  Where  : web/locales/en.json     → key: cart.empty.title
  Grade  : 🟢 GREEN
  Now it says:
      "No items."

  There is also an Indonesian version:
  web/locales/id.json → cart.empty.title
      "Tidak ada barang."

  If you change one, you should change both. I will remind you.

What should the new English text be?
Or tell me the feeling you want and I will write 3 options.
```

```
> give me 3 options
```

```
ORC · handoff · options

  1  "Your cart is empty"
     Simple. Neutral. Safe.

  2  "Nothing here yet — let's find something you like"
     Friendly. Longer. Might be too long on a small phone screen.

  3  "Your cart is waiting"
     Warm and short. A little vague.

  4  Something else — write it yourself

I do not pick for you. You know your customers.
```

```
> 1
```

```
ORC · handoff · confirm

Before I change anything, read this.

  File      : web/locales/en.json
  Key       : cart.empty.title
  Old text  : "No items."
  New text  : "Your cart is empty"

  The check I will run after   : npm run i18n:check
  How to undo this, any time   : git checkout web/locales/en.json

  I will NOT commit. I will NOT push. You decide that later.

  Type yes to continue. Type no to stop.
```

```
> yes
```

```
ORC · handoff · done

  ✓ Changed web/locales/en.json
  ✓ Ran the check: npm run i18n:check
      Result: passed. English and Indonesian still match.

  One thing is left.
  The Indonesian text still says "Tidak ada barang."
  Do you want to change it too?

    1  Yes — I will write it and you confirm
    2  No — leave it for now
    3  Ask Rina to do it
```

```
> 1
```

```
ORC · handoff · Indonesian

  Suggested : "Keranjang Anda kosong"
  This means "Your cart is empty" in a polite form.

  I am not a translator and I am not sure about your tone. Please read it.

  Type yes to use it, or write your own.
```

```
> yes
```

```
ORC · handoff · finished

  ✓ web/locales/en.json   cart.empty.title
  ✓ web/locales/id.json   cart.empty.title
  ✓ npm run i18n:check    passed

  Saved to your log: orc-handoff/empty-cart/handoff-log.md  (entry #1)

  Nothing is committed. Nothing is pushed.
  When you are happy, run this yourself, or ask Rina:

      git add web/locales/en.json web/locales/id.json
      git commit -m "copy: friendlier empty cart message"

  To undo everything from this session:

      git checkout web/locales/en.json web/locales/id.json

Trace: run-handoff-empty-cart-100826-102215.txt
```

### And when Budi asks for something RED

```
> change the "your order is late" email to say sorry twice
```

```
ORC · handoff · stop

  Where  : api/emails/OrderLate.tsx
  Grade  : 🔴 RED

  I will not change this one.

  Why: this file looks like an email, but it is a program. The sentence you
  want to change sits inside a rule that says
  "only show this line if the order is more than 2 days late".
  If I move the words, the rule can break, and then no order emails go out
  at all.

  What you can do instead:

    1  Ask Rina. Show her this: api/emails/OrderLate.tsx line 34
    2  Use /orc-quick — it can do this with a developer watching
    3  Write the exact new email text here and I will save it as a note
       for Rina, so she only has to paste it

  I am not saying no forever. I am saying not by me, not alone.
```

**Note:** this is an **offer**, not a forced change of lane. Same rule as
`/orc-quick`. Budi chooses.

---

## 4. The files it made

### `orc-handoff/surfaces.md` — the map

````markdown
# What you can change yourself — shopcart

Made by `/orc-handoff` on 10-08-2026 at commit `c273793`.
This list gets old. Run `/orc-handoff` again after a big change.

## 🟢 GREEN — 4 places

| What | Where | Check that protects you |
|---|---|---|
| Screen text (English) | `web/locales/en.json` | `npm run i18n:check` |
| Screen text (Indonesian) | `web/locales/id.json` | `npm run i18n:check` |
| App settings | `config/app.yaml` | `config/app.schema.json` |
| Help pages | `docs/*.md` | link checker in CI |

## 🟡 AMBER — 1 place

| What | Where | Why amber | Check by hand |
|---|---|---|---|
| Feature switches | `config/flags.yaml` | no schema file | open the app and look |

**To make this GREEN:** ask a developer to add `config/flags.schema.json`.
It is a small job. Then ORC will move it to GREEN automatically.

## 🔴 RED — 2 places

| What | Where | Why not safe |
|---|---|---|
| Email templates | `api/emails/*.tsx` | text is mixed with rules |
| Screen components | `web/components/*.tsx` | text is mixed with code — use the locale files instead |
````

### `orc-handoff/empty-cart/handoff-log.md` — the diary

````markdown
# Handoff log — empty-cart

One file per thread. New entries go at the bottom.

<!-- orc-handoff:toc -->
| # | Date | What | Grade | Check | Result |
|---|---|---|---|---|---|
| 1 | 10-08-2026 | Empty cart message, EN + ID | 🟢 GREEN | `npm run i18n:check` | passed |
<!-- /orc-handoff:toc -->

---

## Entry 1 — 10-08-2026 10:22

**You asked:** the message when the cart is empty is too cold, make it
friendlier.

**Changed:**
- `web/locales/en.json` → `cart.empty.title`
  - from `"No items."`
  - to `"Your cart is empty"`
- `web/locales/id.json` → `cart.empty.title`
  - from `"Tidak ada barang."`
  - to `"Keranjang Anda kosong"`

**Check:** `npm run i18n:check` — passed.

**Undo:** `git checkout web/locales/en.json web/locales/id.json`

**Committed:** no. You do this part.
````

---

## 5. The CLI part

```
$ orc handoff surfaces
```

```
HANDOFF · shopcart

  GREEN  4    web/locales/en.json · web/locales/id.json
              config/app.yaml · docs/

  AMBER  1    config/flags.yaml        (no schema — add one to make it GREEN)

  RED    2    api/emails/ · web/components/

  map anchored at c273793 · you are at c273793 · map is current
```

Exit code `0`. Same idea as everywhere else:
`0` map is fresh · `1` map is stale · `3` no map yet.

```
$ orc handoff surfaces --json
```

```json
{
  "map_present": true,
  "generated_commit": "c273793",
  "head_commit": "c273793",
  "stale": false,
  "surfaces": [
    {
      "id": "i18n-en",
      "label": "Screen text (English)",
      "path": "web/locales/en.json",
      "grade": "green",
      "check": { "kind": "command", "ref": "npm run i18n:check" },
      "undo": "git checkout web/locales/en.json",
      "items": 412
    },
    {
      "id": "flags",
      "label": "Feature switches",
      "path": "config/flags.yaml",
      "grade": "amber",
      "why": "no schema file",
      "check": { "kind": "manual", "ref": "open the app and look at the feature" },
      "upgrade_to_green": "add config/flags.schema.json"
    },
    {
      "id": "emails",
      "label": "Email templates",
      "path": "api/emails/*.tsx",
      "grade": "red",
      "why": "text is mixed with rules",
      "ask": "a developer"
    }
  ],
  "counts": { "green": 4, "amber": 1, "red": 2 },
  "exit": 0
}
```

Because it speaks `--json`, `orc ui` can draw this as a panel with no extra
work. A PM could do the whole thing in the browser, with no terminal.

---

## 6. Inside a normal `/orc` run

At **ship**, one extra line. This is the growth engine.

```
Ship

  Shipped 11 tasks. 4 files changed.

  Note: 2 of these were GREEN surfaces.
    web/locales/en.json
    web/locales/id.json

  Next time, a product manager can change those with /orc-handoff.
  No developer needed, no run needed.
```

That single sentence teaches the team that the lane exists, at the exact
moment it is useful.

`/orc-boundary` also feeds it. If an area is RED in handoff, it is at least
ESCALATE in boundary. Two lanes, one truth.

---

## 7. Why this is good for ORC

**It doubles who ORC is for.** Today every ORC lane needs someone who reads
code. This one does not. A PM, a designer, a support person, a content writer —
all of them can use ORC on day one.

**It is the only one of its kind.** 128 skills exist for designers and PMs.
They all make documents. None of them touch the repository. ORC would be first
to actually let a non-developer change something and be safe.

**The safety story is real, not marketing.** The grade comes from whether a
check exists. That is a fact on disk, not an opinion. And AMBER has a clear
upgrade path — "add a schema file and this becomes GREEN" — so the lane makes
the repo better over time, not just safer today.

**It is cheap.** One read-only scan to build the map. After that, a change is
one small edit and one command. No planner, no waves, no scoring. This is the
lowest-cost lane ORC would have.

**It grows the pact ledger too.** A GREEN surface is, in a way, a promise:
"this file can be changed without breaking the build." When someone downgrades
it, ORC notices.
