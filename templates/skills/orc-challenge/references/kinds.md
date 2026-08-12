# Artifact kinds

The kind picks a **default dimension set** and a **default template hint**. It
never invents a template.

| Kind | Typical artifact | Default dimensions | Default template hint |
|---|---|---|---|
| `tsd` | Technical Solution/Spec Document | D1 D2 D3 D4 D5 D6 | user-supplied — asked for, never guessed |
| `prd` | Product requirement doc | D1 D3 D4 D5 D6 D7 | user-supplied |
| `adr` | Architecture Decision Record | D1 D2 D3 D7 | user-supplied, or the repo's existing ADRs |
| `api-contract` | OpenAPI / proto / GraphQL SDL | D1 D2 D3 D6 | the repo's existing contract files |
| `readme` | README / onboarding doc | D1 D3 D4 D5 | user-supplied |
| `runbook` | Ops runbook | D1 D3 D4 D6 | user-supplied |
| `plan` | An ORC plan or a written implementation plan | D1 D2 D3 D6 D7 | `_shared/stack-plan.md`-style structure |
| `code` | A module, a package, a PR-sized change | D2 D3 D4 D6 | **`.claude/orc/patterns/<lang>-pattern.md`** |
| `mixed` | A folder of several of the above | per artifact | per artifact |

**A default is a PROPOSAL.** Deriving a dimension set from a kind is a fact, so
ORC may propose it; accepting it is a decision, so the user confirms it at
intake. Never apply one silently.

## `code` — the template problem is already solved

For `kind: code` the cached code-pattern IS the template. It is a file ORC
already generates (`/orc-pattern`), it already reconciles the project's real
conventions against a per-language playbook, and it already distinguishes
CONVENTIONS (which defer to the project) from INVARIANTS (which are always
enforced). Probe for it the deterministic way — `orc pattern status <lang>`,
exit 0 cached / 1 absent / 2 unknown language key
(`../../_shared/detecting-artifacts.md`) — and if it is absent, say so and offer
`/orc-pattern`. Never substitute a generic style guide.

**The cold reader's question changes shape but not nature:** *"can a new engineer
understand this module without asking anyone?"* Same instrument, different
artifact.

## `mixed` — a folder

Several artifacts, one cycle, one PASS. The cycle is ATOMIC: a TSD split over
three files passes as one document, because a reader reads it as one document.
Each artifact gets its own sha in the ledger, so `orc challenge diff` still tells
you which one moved.

Use `--revision directory` so the fixer has one declared place to write.
