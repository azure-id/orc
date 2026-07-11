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
| `fastapi` | BE | `fastapi` in pyproject/requirements | `be-fastapi.md` |
| `nestjs`  | BE | `@nestjs/core` in package.json, `*.module.ts` | `be-nestjs.md` |
| `go`      | BE | `go.mod` present, `.go` files | `be-go.md` |

Precedence: a Next.js project matches `nextjs`, not `react`, even though React is
present (the more specific framework wins). A repo can match several keys
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
this index. Candidate next: `angular`, `svelte`, `django`, `spring-boot`,
`graphql`, `express`, `rust`.

## Agnostic fallback (no playbook match, or user declined)

If a task's language has no playbook here, or the user declined codification, the
executor uses the **language-agnostic** path: enforce the universal invariants
(no secrets/stack-traces exposed, parameterized queries, validated input, no
hardcoded credentials) and imitate the neighboring files it already reads. No
codifier, no cache.
