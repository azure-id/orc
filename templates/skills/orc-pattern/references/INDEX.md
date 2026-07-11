# Playbook index — language detection → generic playbook

Maps a detected language to its generic best-practice playbook. Load ONLY the
playbook(s) for the language(s) actually in play — never all of them (keeps the
codifier token-cheap).

## Detection map

| Language key | Domain | Detect from | Playbook |
|--------------|--------|-------------|----------|
| `react`   | FE | `react` in package.json, `.jsx/.tsx` w/o `next` | `fe-react.md` |
| `nextjs`  | FE | `next` in package.json, `app/` or `pages/` | `fe-nextjs.md` |
| `vue`     | FE | `vue` in package.json, `.vue` files | `fe-vue.md` |
| `angular` | FE | `@angular/core` in package.json, `angular.json` | `fe-angular.md` |
| `fastapi` | BE | `fastapi` in pyproject/requirements | `be-fastapi.md` |
| `django`  | BE | `django` in pyproject/requirements, `manage.py` | `be-django.md` |
| `nestjs`  | BE | `@nestjs/core` in package.json, `*.module.ts` | `be-nestjs.md` |
| `express` | BE | `express` in package.json w/o `@nestjs/core` | `be-express.md` |
| `go`      | BE | `go.mod` present, `.go` files | `be-go.md` |

Precedence: a Next.js project matches `nextjs`, not `react`, even though React is
present (the more specific framework wins). Same rule for `nestjs` over
`express` (Nest sits on Express) and `fastapi`/`django` over generic Python. A repo can match several keys
(monorepo: `react` FE + `fastapi` BE) → codify each independently, one cache file
each.

## Playbook anatomy (every file follows this — harvested from the source repo)

1. **Activation triggers** — the vocabulary that signals this language/framework.
2. **Conventions** (style/shape) — PROJECT-OVERRIDABLE. The codifier replaces
   these with the project's observed conventions when they differ.
3. **Invariants** (security/correctness) — ALWAYS-ON, BLOCKING. The codifier keeps
   these regardless of house style.
4. **Validation gate** — concrete, runnable checks (build/type/lint/status-codes).
5. **Worked-example shape** — the minimal-complete pattern to imitate.
6. **Delivery order** — the order to emit files/artifacts.

## Extending

Add a language by dropping a new `<domain>-<lang>.md` here (same anatomy) and a row
in the detection map above. No code changes — the codifier and orchestrator read
this index. Candidate next: `svelte`, `spring-boot`, `rails`, `graphql`, `rust`,
`react-native`.

Note: `orc-wiki` with `orc_wiki_pattern_findings: true` codifies EVERY detected
language — each added playbook is another codifier run in that mode.

## FE rule packs (not detection rows — reviewer re-check on FE slices)

- `fe-a11y.md` — impact-ordered accessibility rules (capped ~15).
- `fe-perf.md` — impact-ordered performance rules (capped ~15).

Loaded by the ORCHESTRATOR at Phase 5 when the run touched FE tasks, and passed
to the reviewer as `fe_rules[]` (file:line findings, classified P1–P3 by impact
— never automatic P0). Not consumed by the codifier; independent of the
per-language cache.

## Agnostic fallback (no playbook match, or user declined)

If a task's language has no playbook here, or the user declined codification, the
executor uses the **language-agnostic** path: enforce the universal invariants
(no secrets/stack-traces exposed, parameterized queries, validated input, no
hardcoded credentials) and imitate the neighboring files it already reads. No
codifier, no cache.
