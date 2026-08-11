# Mock run — `/orc-export`

> Send everything ORC knows to other AI tools. And read theirs in.

---

## 1. What it does

`AGENTS.md` is an open file format. It is kept by the Agentic AI Foundation
under the Linux Foundation. More than 30 AI coding tools read it: Codex,
Cursor, Copilot, Gemini CLI, Jules, Aider, Zed, Windsurf, Devin, and more.
`SKILL.md` is the matching open format for skills.

ORC spends real money learning about your project. The wiki. The code patterns.
The promises in `PACT.md`. The boundary cards. That knowledge sits inside
`.claude/` and only ORC can use it.

`/orc-export` has two directions:

- **out** — turn what ORC knows into `AGENTS.md` and a portable skill bundle,
  so Codex or Cursor can use it too.
- **in** — read an existing `AGENTS.md` or `.cursorrules` in a project that has
  never used ORC, and turn it into a starting point.

### One rule

**The export is derived. Never hand-written.**

Same rule as `wiki/orc-orientation.md`. You never edit the output. You
regenerate it. It carries a `source_commit`, so any tool that reads it can tell
if it is old. And `orc export --check` fails if it fell behind its sources.

---

## 2. The run — out

```
> /orc-export
```

```
ORC · export

Reading what ORC knows about shopcart.

  wiki                12 docs, FRESH, anchored e9dad01
  orientation         wiki/orc-orientation.md, present
  code patterns       typescript (cached 22-07-2026)
  promises            PACT.md — 5 holding, 1 uncheckable
  boundary cards      4 areas
  current plan        plan.md — 12 tasks (I will ask before including this)
  commands            npm test · npm run build · npm run i18n:check

Two questions before I write.
```

```
ORC · export · round 1  (2 questions)

Q1 — What should I write?

     a  AGENTS.md only
        One file at the project root. 30+ tools read it. Simplest.

     b  AGENTS.md + a portable skill bundle          (recommended)
        Also writes .agent/skills/shopcart-context/SKILL.md, which works in
        Codex, Cursor, Copilot and Claude Code without changes.

     c  Everything, plus per-area skills
        One skill per boundary area. Good for a big team. More files.

Q2 — Should the current plan go in?

     a  No — knowledge only          (recommended)
        The export stays useful after this plan is finished.

     b  Yes — include plan.md
        Good if you want another tool to continue this exact work today.
        But the export goes stale the moment the plan is done.
```

```
> b and a
```

```
ORC · export · safety check

Before writing, I check what must never leave .claude/:

  .env / .env.*                    excluded  (2 files found and skipped)
  secrets in config/app.yaml       excluded  (1 key: stripe.secret_key)
  .claude/orc/run/**               excluded  (run state is not knowledge)
  .claude/orc/logs/**              excluded  (traces can contain paths and errors)
  learning-docs/**                 excluded  (git-ignored by design)

  Nothing else was found that looks like a secret.
  I still recommend you read AGENTS.md once before you commit it.
```

```
ORC · export · written

  AGENTS.md                                     project root, 118 lines
  .agent/skills/shopcart-context/SKILL.md       portable skill, 74 lines
  .agent/skills/shopcart-context/reference.md   the long detail

  source_commit : e9dad01
  generated_at  : 08-09-2026T10:14:02Z

  Check any time with:  orc export --check
  It fails when the wiki, the pact, or the patterns move ahead of this file.

Trace: run-export-shopcart-080926-101402.txt
```

---

## 3. The files it made

### `AGENTS.md` — at the project root

````markdown
<!-- orc-export:meta
source_commit: e9dad01
generated_at: 2026-09-08T10:14:02Z
sources: wiki(12 docs) pact(6) patterns(typescript) boundary(4 areas)
generated_by: orc-export
DO NOT EDIT BY HAND. Regenerate with: orc export
-->

# shopcart

A small web shop. React + TypeScript on the front, Node + Express + Postgres
on the back.

## Commands

| Task | Command |
|---|---|
| Install | `npm install` |
| Build | `npm run build` |
| Test | `npm test` (vitest) |
| Check translations | `npm run i18n:check` |
| Lint | `npm run lint` |

## Layout

```
web/       React app. Screen text lives in web/locales/, never in components.
api/       Express server. One folder per domain: payments, refunds, checkout.
db/        Postgres migrations. No down-migrations exist yet.
config/    app.yaml (has a schema) and flags.yaml (does not).
```

## Rules this project must follow

These come from decisions the team already made. Breaking one is a bug,
not a style choice.

1. **A payment is never written twice for one idempotency key.**
   Lives in `api/payments/ledger.ts:88`. Proved by `npm test -- idempotency`.
2. **Every price is a whole number of cents.** Never a decimal, never a float
   column. `api/payments/money.ts:12`.
3. **A guest can finish checkout with no account.** `api/checkout/session.ts:31`.
4. **A refund is only allowed inside 45 days.** Temporary for the November
   sale — goes back to 30 days on 01-12-2026. `api/refunds/window.ts:19`.
5. **A full card number is never written to any log.** `api/middleware/logger.ts`.
6. **Refund money goes back to the original payment method.**
   `api/refunds/payout.ts:44`. **No test proves this yet.** Be careful here.

## Code style, learned from this repo

- Errors are returned, not thrown, across the `api/` boundary.
  Pattern: `Result<T, AppError>` from `api/lib/result.ts`.
- Every route handler is thin. Logic lives in a service file next to it.
- Tests sit in `__tests__/` beside the code, never in a top-level test folder.
- Screen text is never written inside a component. It goes in
  `web/locales/en.json` and `web/locales/id.json`, and both must have the
  same keys.

## Where to be careful

| Area | Care level | Why |
|---|---|---|
| `db/migrations/` | **Do not run** | No down-migrations. No staging database. |
| `api/refunds/payout.ts` | High | Rule 6 above has no test. |
| `api/payments/` | Normal | Well covered by tests. |
| `web/` | Normal | Well covered. |
| `config/flags.yaml` | Medium | No schema. A wrong key fails silently. |

## Where to read more

- `wiki/orc-orientation.md` — read this first
- `wiki/orc-architecture-overview.md`
- `PACT.md` — the rules above, with their history
- `.agent/skills/shopcart-context/reference.md` — the long version
````

### `.agent/skills/shopcart-context/SKILL.md` — the portable skill

````markdown
---
name: shopcart-context
description: Use when working in the shopcart repository. Gives the project's
  layout, commands, hard rules, code style, and the areas that need care.
  Generated from ORC's wiki, pact ledger, and code patterns.
---

# shopcart context

Read `reference.md` in this folder before you change any file in `api/` or
`db/`.

## Always

- Run `npm test` before you say a change is done.
- Put screen text in `web/locales/`, never in a component.
- Return errors, do not throw, across the `api/` boundary.

## Never

- Never run or write a migration in `db/migrations/` — there are no
  down-migrations and no staging database.
- Never write a decimal into a price column.
- Never log a full card number.

## Ask a human first

- Anything in `api/refunds/payout.ts`. The rule that covers it has no test.
- Anything that calls Stripe with a real key.

<!-- orc-export:meta source_commit=e9dad01 generated_at=2026-09-08T10:14:02Z -->
````

---

## 4. The CLI part

```
$ orc export --check
```

Right after generating:

```
EXPORT · current

  AGENTS.md            source_commit e9dad01   ✓ current
  SKILL.md             source_commit e9dad01   ✓ current

  sources unchanged since generation
```

Exit `0`.

Three weeks later, after the wiki was refreshed and a promise changed:

```
$ orc export --check
```

```
EXPORT · STALE

  AGENTS.md            source_commit e9dad01   ✗ stale
  SKILL.md             source_commit e9dad01   ✗ stale

  what moved:
    wiki      12 docs → 14 docs, anchored 3b71ce2
    pact      PACT-006 is now HOLDING (a test was written)
    pattern   typescript re-cached 02-09-2026

  Your AGENTS.md still tells other tools that PACT-006 has no test.
  That is now wrong, and Cursor is reading it.

  Fix:  orc export
```

Exit `1`. **This is the reason the export is derived and fingerprinted.** A
hand-written `AGENTS.md` goes wrong quietly. This one says so out loud.

```
$ orc export --check --json
```

```json
{
  "targets": [
    { "file": "AGENTS.md", "source_commit": "e9dad01", "stale": true },
    { "file": ".agent/skills/shopcart-context/SKILL.md", "source_commit": "e9dad01", "stale": true }
  ],
  "head_commit": "3b71ce2",
  "moved": [
    { "source": "wiki", "from": "12 docs @ e9dad01", "to": "14 docs @ 3b71ce2" },
    { "source": "pact", "detail": "PACT-006 uncheckable → holding" },
    { "source": "pattern", "detail": "typescript re-cached 2026-09-02" }
  ],
  "exit": 1
}
```

---

## 5. The run — in

A different project. It has an `AGENTS.md` already. It has never used ORC.

```
> /orc-export import
```

```
ORC · export · import

I found files that describe this project:

  AGENTS.md          82 lines   written by hand, last changed 3 months ago
  .cursorrules       31 lines
  CLAUDE.md          none

I will read them as EVIDENCE, not as instructions.
That means: I will propose things, and you confirm. Nothing is written and
nothing is set until you say yes.
```

```
ORC · export · what I found

Facts I can check against the code:

  ✓ "run tests with pnpm test"          confirmed — package.json has it
  ✓ "we use Drizzle, not Prisma"        confirmed — drizzle.config.ts exists
  ✗ "the API lives in src/server"       NOT TRUE — it is in apps/api/
                                        (this file is 3 months old)

Rules that look like promises. These could start your pact ledger:

  1  "Never call the billing API from the frontend."
  2  "All dates are stored in UTC."
  3  "Do not add a new dependency without asking the team."

  Rule 3 is a team process, not a code rule. I would leave it out of the
  ledger. Your call.

Nothing here sets ORC config by itself. What would you like to do?

  1  Create a pact ledger from rules 1 and 2, and find checks for them
  2  Create it from all three
  3  Skip the ledger — just fix the wrong path in AGENTS.md
  4  Nothing for now
```

**Notice:** the import found that the existing `AGENTS.md` was **wrong**. That
alone is worth the run. A stale instruction file is actively harmful — every
AI tool in the team has been reading "the API lives in src/server" for three
months.

---

## 6. Inside a normal `/orc` run

`/orc-export` is mostly a CLI tool with a small skill on top. Its seam is
light on purpose:

**At ship**, if an export exists and went stale:

```
Ship

  Shipped 11 tasks.

  Note: AGENTS.md is now stale. This run changed 2 files it describes.
  Other tools in your team (Cursor, Codex) are reading the old version.

  Run `orc export` to refresh it. Takes 3 seconds, no tokens.
```

**In `orc doctor`**, a new read-only finding:

```
orc doctor

  ✓ install manifest current
  ✓ settings wiring present
  ⚠ AGENTS.md stale — 2 sources moved since e9dad01
    fix: orc export
    panel: Maintenance
```

That last line matters: `orc ui` routes a caution to the panel that can clear
it, keyed on the finding id. So this shows up as a button in the web panel
automatically.

---

## 7. Why this is good for ORC

**It removes the biggest objection to adopting ORC.** A team lead asks: *"if we
build all this ORC knowledge, are we stuck with ORC forever?"* Today the honest
answer is "kind of". With export, the answer is "no — here is the door, it is
one command, and the output is an open standard from the Linux Foundation."
That answer wins deals.

**It makes ORC the producer in a mixed team.** Real teams use several tools.
Rina uses Claude Code, someone else uses Cursor, CI uses Codex. ORC does the
expensive thinking once — the wiki scan, the pattern codify, the interview —
and every other tool eats the result for free. That is a much stronger
position than fighting for the same session.

**Import is a fast on-ramp.** A repo with an existing `AGENTS.md` can start
using ORC in one command, with a pact ledger already seeded. And on the way in,
ORC finds the parts that are already wrong — which is a very good first
impression.

**It is cheap to build.** Almost all of it is `bin/cli.js`. No new agent. No
new gate. No new run state. The `--check` behaviour copies `orc wiki
sync --check` exactly. This is a small release with a big story.

**It proves the derived-artifact rule again.** ORC already refuses to let a
model hand-write registration (`orc wiki sync`) or the orientation doc. The
export is the same idea pointed outward. One more place where ORC's output
cannot quietly go wrong.
