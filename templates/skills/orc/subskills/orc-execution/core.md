# orc-execution — Core (the input slice)

The INPUT SLICE the orchestrator builds for ONE executor dispatch. The
procedure and the return contract live in ONE place: the executor agent file
(`.claude/agents/orc-executor-*.md`). The caller validates the return against
`../../../_shared/return-validation.md`. The orchestrator never implements.

## Input slice (you receive exactly this; you cannot pull more)

- task_id, description, spec_ref
- declared_files[]        — the files you are expected to touch (incl. tests)
- acceptance[]            — this task's sliced definition-of-done lines (from the
                            plan); self-check your diff against them before returning
- constraints[]           — HARD RULES from the intent-spec, plus the task's
                            `spec_invariants` (analyst do-not-build invariants)
                            appended verbatim at slice assembly; never violate
- pattern                 — the resolved code-pattern for this task's language, or
                            null. When present: {conventions[] you MUST MATCH,
                            invariants[] that are BLOCKING, validation_gate[]
                            (enforceable acceptance checks you must SATISFY —
                            advisory lines are marked and informational),
                            pattern_version}. Agnostic
                            tasks carry invariants only (no conventions, no gate).
- wiki                    — project-wiki grounding for this task, or absent:
                            page CONTENT (full/mini) or page PATHS to read first
                            (fast), plus the freshness tier in force. Precedence
                            is always `code > fresh wiki > stale wiki (hints) >
                            model priors` — on any wiki-vs-code conflict the code
                            wins. You MUST return `wiki_used` naming the pages
                            you actually read, or `none`; see the return
                            contract. Absent on a task the orchestrator grounded
                            without the wiki.
- crosslink               — the cross-repo boundary contract for a call site in
                            this task, or null. Present ONLY when a declared file
                            touches a boundary the orchestrator resolved from
                            `.claude/orc/crosslink/needs.json` + the cached tag
                            contract in `.claude/orc/crosslink/cache/`. It is
                            ADVISORY hints ("cross-repo fresh/aging/stale wiki")
                            labeled with an effective tier + "hints, not
                            verified" — MATCH the field
                            names/types/errors it states, but it never overrides
                            local code and there is nothing to attest (no return
                            field). Absent on any task with no boundary.
- gotchas                 — 0–3 repair-memory entries whose `scope` glob matches
                            this task's declared_files, or absent. Each is one
                            failure THIS PROJECT already hit and fixed
                            {trigger, symptom, cause, fix}. Read them as a
                            "don't re-pay for this" list, not as requirements:
                            they never override `acceptance[]`, `constraints[]`
                            or the pattern's invariants. Absent = no match, which
                            is the normal case — never treat absence as a signal.
                            Canonical: `.claude/skills/_shared/gotchas.md`.
- tdd_spec                — this task's plan-time acceptance tests, or null
                            (TDD off, or every entry scoped out as
                            covered-by-existing / no-behavior / no-runner —
                            null is NOT "untested"). Present = the failing tests
                            a PAIRED TDD task already materialized, which your
                            work must
                            turn GREEN, plus `tdd_loop_max` (the repair cap).
                            Never edit a TDD test to make it pass — a test
                            that looks wrong is a spec bug: return it, don't
                            fix it.
- repro                   — {required: true, kind: test | command, hint} on a
                            DEFECT task, else absent. Present = show the bug is
                            real BEFORE fixing it: `test` when the project has a
                            runner, `command` when it has none. Absent = this is
                            not a defect report; never invent a reproduction
- house_rules             — the standing behavioral card (injected literally,
                            never a pointer): surgical changes, simplicity-first,
                            no unrequested scope, boring-solution preference
- rules_card              — the anti-slop card from `orc rules slice`, injected
                            literally directly under `house_rules`: the project's
                            rules, then ORC's. A project rule beats an ORC rule;
                            `house_rules` beat both on code and behaviour only.
                            Carried → return `rules_applied[]`,
                            `rules_conflicts[]`, `rules_overridden[]`
                            (`../../../_shared/return-validation.md` §5c)
- log_digest              — compacted decisions from prior waves; absorb before working
- worktree_path           — null unless worktrees mode
- model, effort           — informational (already applied by the caller)

A task with no boundary carries no `crosslink`. Malformed returns are treated
as failure by the caller. needs_context is capped at 2 per task — a third means
the slice or plan is wrong and escalates to the user.
