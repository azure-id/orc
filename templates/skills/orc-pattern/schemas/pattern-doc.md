# Schema — patterns/&lt;lang&gt;-pattern.md (the cached code-pattern)

The reconciled pattern the codifier returns and the caller writes to
`.claude/orc/patterns/<lang>-pattern.md`. One file per language. Reused by every
future ORC run; refreshed only on drift or `--refresh`.

## File shape

```markdown
# <lang>-pattern.md   (pattern_version: <YYYY-MM-DD>-<letter>)
# domain: FE | BE      source: reconciled | generic
# fingerprint: <structural signature for drift detection>

## Conventions (PROJECT WINS — match these exactly)
- <observed convention 1>   e.g. "Routers in app/routers/<resource>.py, one APIRouter/file"
- <observed convention 2>   e.g. "CRUD split into app/crud/<resource>.py"
- <delivery order>          e.g. "module → controller → service → DTO → test"

## Invariants (ALWAYS — BLOCKING; from the generic playbook)
- <invariant 1>   e.g. "async def for all I/O; parameterized queries only"
- <invariant 2>   e.g. "typed 4xx exceptions; never expose secrets/stack-traces"

## Conflicts flagged
- ⚠ <rule>: kept PROJECT (<project_choice>) over playbook (<playbook_choice>) — <why>

## Ambiguities (user should resolve)
- <mixed/mid-migration convention, if any — else "none">

## Validation gate (OPTIONAL — omit if the playbook defines none)
- <check 1>   e.g. "each new endpoint returns the expected status codes (200/201/404/422)"
- <check 2>   e.g. "collection endpoints paginate"
```

## Fields the orchestrator consumes at dispatch

- **Conventions** + **Invariants** → injected LITERALLY into the executor's task
  slice (`pattern` field). Conventions = "match"; Invariants = "blocking".
- **pattern_version** → echoed back by the executor (`pattern_version`) and logged;
  proves which pattern was applied.
- **fingerprint** → checked at pattern-resolve against current files to detect
  drift (cheap structural compare, not a re-scan).
- **Validation gate** → carried in the cache but NOT yet wired into slices or
  verify (planned for a later release). **Measurability rule when it is wired:**
  a gate line is enforceable only if machine-checkable in the target repo
  (status codes, validation present, typed errors); bars needing tooling the
  project lacks (coverage %, latency) are auto-advisory, never ship-gating.

## Rules
- Invariants are never dropped, even when a conflicting convention is kept.
- The Validation-gate section is OPTIONAL: cached pattern files written before it
  existed (or from playbooks that define no gate) remain valid without it —
  never treat its absence as a malformed cache.
- `source: generic` means greenfield (no real samples) — pure playbook, no project
  reconciliation yet; will be reconciled once real code exists (drift → refresh).
- The file is a cache artifact, NOT project code — it lives under `.claude/orc/`
  and is never committed as part of the user's feature work.
