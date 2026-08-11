# The example project used in every mock

Every file in this folder tells a story about the **same fake project**, so the
stories connect. Nothing here is real. No code was run. But every screen, every
file and every number is written the way the real lane would write it.

---

## `shopcart` — a small web shop

```
shopcart/
  web/            React + TypeScript  (the part users see)
    locales/      en.json, id.json    (all the text on the screen)
  api/            Node + Express      (the server)
    payments/     the money code
    refunds/
  db/
    migrations/   Postgres migration files
  config/
    app.yaml      has a schema file next to it
    flags.yaml    has NO schema file
  package.json    "test": "vitest run"
```

Two people work on it:

- **Rina** — a developer. She writes both `web/` and `api/`.
- **Budi** — a product manager. He does not read code.

---

## How to read a mock

Most files have the same parts:

1. **What it does** — in easy English.
2. **The run** — the full screen: what you type, what ORC says back.
3. **What it wrote** — the real content of the files it made.
4. **What to notice** — the two or three things that are easy to miss.

Lines that start with `>` are what **you** type. Everything else is ORC talking.

---

## One rule that is true in every mock

**ORC never guesses and calls it a fact.**

When ORC does not know something, it says so with a word you can see:
`UNCHECKABLE`, `insufficient history`, `AMBER`, `no card`, `STALE`. It never
fills a gap with a nice-sounding sentence.

That is the part worth watching for. Most tools always give you an answer. ORC
will sometimes tell you it does not have one — and that is the useful part.
