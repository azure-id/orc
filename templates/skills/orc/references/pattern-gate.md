# Reference — Code-Pattern Gate (orchestrator side)

How the full lane resolves, injects, and enforces per-language code-patterns so
executors MATCH the existing codebase instead of writing generic-template code.
The engine (playbooks, codifier slice, reconcile rules) is the sibling skill
`../../orc-pattern/SKILL.md`; this file is the orchestrator's gate + wiring.
Load at Phase 2 (tagging) and Phase 3 (resolve gate + slice injection).

Principle: **conventions defer to the project; security/correctness invariants
are always enforced.**

## Phase 2 — Tag each task while scoring

From its `declared_files` extensions + repo deps (see
`../../orc-pattern/references/INDEX.md`):
`{domain: FE|BE|null, lang: react|nextjs|vue|fastapi|nestjs|go|…|null}`.
Tasks with no FE/BE language need no pattern.

**Postgres secondary tag:** on a Postgres project (`pg`/`psycopg`/`asyncpg`/
`pgx`/`lib/pq`/`Npgsql`/Prisma `postgresql`/`postgrex` in deps), add
`db: postgres` to any task whose `declared_files` touch the data-access layer
(repositories/dao/models/queries, `*.sql`, ORM entities/migrations). `db`
co-applies WITH the framework `lang`, never instead of it — it pulls the
cross-cutting `postgres` playbook into the same resolve gate.

## Phase 3 — Resolve gate (once, before the first wave)

For each distinct tagged language (including `postgres` when any task is
`db`-tagged), resolve against the cache `.claude/orc/patterns/<lang>-pattern.md`
— test existence with the deterministic probe `orc pattern status <lang>`
(exit 0 = cached; see `../../_shared/detecting-artifacts.md`), never an ad-hoc
`find`, so a codified pattern is never missed:

Every resolved language prints exactly ONE user-visible line (no cost, no ask —
visibility only, so the user always knows which house style is in force):

- **Cache hit, no drift** → no ask, no cost, but print
  `pattern: <lang>-pattern.md applied (cached)`.
- **Cache miss** → apply config `pattern_findings` (default `ask`):
  - `ask` → ONE P0 prompt batched across ALL missing languages ("Learn
    conventions for {…} via orc-pattern, or proceed language-agnostic?");
  - `on` → codify without asking; print `pattern: <lang> — codifying (cache miss)`;
  - `off` → agnostic; print `pattern: <lang> — running language-agnostic (no cached pattern)`.
- **On learn/`on`** → dispatch `orc-pattern-codifier-sonnet-5-high` per missing
  language (slice per `../../orc-pattern/SKILL.md` Phase 1); YOU write the
  returned pattern to the cache.
- **Agnostic fallback** (declined / `off` / no playbook for the language): no
  codifier, no scan — the executor enforces the universal invariants and
  imitates the neighbor files it already reads. ~Zero added cost.

Hold the resolved pattern per language in run state (survives
checkpoint/resume) — it is injected at dispatch and reused at Phase 5/6.

## Slice injection (anti-skip layer 1)

Inject the resolved conventions + blocking invariants + the enforceable
`validation_gate[]` lines LITERALLY into each FE/BE task's slice as `pattern` —
never a file pointer. Agnostic tasks get the universal invariants only.

For a `db:postgres`-tagged task, ALSO merge the resolved `postgres` pattern's
Conventions + Invariants + gate lines into the SAME `pattern` block (appended
to the framework pattern, or standalone if the task has no framework lang) —
query invariants (bound params only, pooled connections, transactional
multi-writes) ride the same anti-skip path. Record the postgres
`pattern_version` in run state/log too.

## Return validation (anti-skip layer 2)

A task that was given a `pattern` must return `invariants_checked: true` + a
`pattern_version` matching what you injected — the single attestation covers a
merged block. Missing/false attestation = malformed return (requeue). Record
the applied `pattern_version` in the trace.

## Review/verify re-check (anti-skip layer 3)

- **Phase 5 (review):** pass the resolved pattern as `code_pattern` AND its
  blocking `invariants[]` + `validation_gate[]` lines for the re-check — don't
  re-ask the user. An invariant violation or unmet gate line is P0.
- **Phase 6 (verify):** pass the `validation_gate[]` lines in the slice — each
  line is an acceptance criterion; an unmet line is P0.
