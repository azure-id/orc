# Mock run — `/orc-pattern`

> Learns how **your** code is actually written, and caches it, so every future
> executor writes code that looks like yours.

---

## 1. What it does

ORC ships a generic best-practice playbook for each language (React, Vue,
Next.js, Angular, Express, NestJS, Django, FastAPI, Go, Postgres, plus a11y and
performance rule packs). On its own, a playbook would fight your codebase.

So the pattern is a **reconciliation** of two things, with two different rules:

| Rule class | Example | Who wins |
|---|---|---|
| **Conventions** — style and shape | folder layout, naming, how you do DI | **Your project wins**, even if the playbook disagrees |
| **Invariants** — correctness and security | no SQL built by string concat, no stack traces in a response, no index as a React key | **Always applied.** A project breaking these is buggy, not different |

The result is cached at `.claude/orc/patterns/<lang>-pattern.md` and copied
**word for word** into every executor slice from then on.

---

## 2. The run

```
> /orc-pattern
```

```
Languages I can see in this repo:
  express   api/          38 files      no cached pattern
  react     web/          52 files      no cached pattern

Learning a pattern reads your most recently changed files with a subagent.
That costs tokens once, and every run after it is cheaper and more accurate.

Codify which?  [both / express / react / none]

> both
```

```
Dispatching orc-pattern-codifier-sonnet-5-high (express) …
returned as: claude-sonnet-5 / high        ✓

PATTERN — express     source: reconciled     14 recent files read

Conventions taken FROM YOUR CODE (the playbook lost these)
  · routes live in api/<area>/routes.ts, handlers in the same folder
  · every handler is `export async function`, never an arrow const
  · errors go through next(err) — you do not try/catch in handlers
  · money is always integer minor units (api/payments/*.ts, 6 files)

Invariants KEPT from the playbook (not negotiable)
  · no SQL string interpolation — you use parameterised queries already ✓
  · no stack trace or raw error in a response body
  · every route that reads :id re-checks ownership

Conflicts I will not guess about (1)
  · api/refunds/ uses try/catch in 3 handlers while api/orders/ uses
    next(err). Most recently modified wins → next(err). Say so if that is
    backwards and I will flip it.

Written: .claude/orc/patterns/express-pattern.md

Dispatching orc-pattern-codifier-sonnet-5-high (react) …
Written: .claude/orc/patterns/react-pattern.md
```

---

## 3. How other lanes see it

```
$ orc pattern status express
express   cached   2026-08-12   (exit 0)

$ orc pattern status svelte
svelte    unknown language key   (exit 2)
          keys come from orc-pattern/references/INDEX.md — it is a framework
          name, never a file extension

$ orc pattern status go
go        not cached   (exit 1)
```

That exit code is how `/orc-fast` decides whether it is allowed to run. It is
a deterministic probe, never a guess and never a file search — the `.claude/`
folder is hidden, so a plain search would say "missing" from the wrong folder.

---

## 4. What to notice

- **ORC does not codify by itself.** It sends a subagent, reads the answer,
  and writes the cache itself.
- **The cache survives updates.** It lives outside `templates/`, so
  `orc update` never touches it.
- **Ambiguity is reported once, not guessed silently.** The try/catch conflict
  above is a real example of that rule.
- **A brand new language folder gets the plain playbook**, marked
  `source: generic` — there is nothing to reconcile yet.

---

## 5. Related

- The lane that requires this: [`/orc-fast`](orc-fast.md)
- Build the other half of the knowledge: [`/orc-wiki`](../templates/skills/orc-wiki/examples/wiki-run-mock.md)
