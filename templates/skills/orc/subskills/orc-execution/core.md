# orc-execution — Core (mode-neutral)

A procedure specification: inputs, steps, outputs. Executed by a spawned
subagent; the orchestrator never runs this itself.

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
                            `.claude/orc/crosslink/needs.json` + cache. It is
                            ADVISORY hints ("cross-repo fresh/aging/stale wiki")
                            labeled with an effective tier — MATCH the field
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
- house_rules             — the standing behavioral card (injected literally,
                            never a pointer): surgical changes, simplicity-first,
                            no unrequested scope, boring-solution preference
- log_digest              — compacted decisions from prior waves; absorb before working
- worktree_path           — null unless worktrees mode
- model, effort           — informational (already applied by the caller)

## Procedure

1. Absorb log_digest — prior DECISIONs/INTERFACEs/ANSWERs bind you.
2. Read spec_ref if provided.
2a. **Read on the ladder** (`../../../_shared/read-ladder.md`): locate
   (Grep/Glob) → outline → the ±40 lines around the anchor → full. Stop at the
   step that answers the question; two full reads with no answer is
   `needs_context`, not a third. TWO EXCEPTIONS — every `declared_files` path is
   a FULL read before you edit it (an `old_string` rebuilt from an outline is a
   corruption bug), and build/test output is always read whole.
3. Perform the task within `worktree_path` (or the current tree if null).
   Obey every `house_rules` line. Follow every constraint. If `pattern` is present, MATCH its conventions,
   satisfy every BLOCKING invariant, and satisfy every enforceable
   `validation_gate[]` line (re-read your diff to confirm before returning;
   advisory gate lines are informational — never add tooling to meet one);
   if `pattern` is null but carries invariants (agnostic), still satisfy them and
   imitate the neighboring files you read. Create/update tests for what you build.
   **UI task + a `frontend-design` skill present in the environment** (check
   `.claude/skills/frontend-design/` or the plugin dir): read its SKILL.md and
   apply its guidance to the UI work — skip silently when absent.
4. **Run the proof, capture the evidence:** if the project has a runnable build
   or test setup, run it for your changes and capture {command, exit_code, the
   last ~5 output lines} — QUOTED VERBATIM, never paraphrased, never predicted.
   No runner → set `no_runner_detected: true` instead. Never claim green you
   did not observe. With a `tdd_spec`: run ITS tests too — implement → test →
   repair up to `tdd_loop_max` iterations; still red at the cap → stop and
   return `tdd_state: red` honestly (the failing tests listed in unmet[]).
5. **Self-check before returning:** re-read your diff against every
   `acceptance[]` line and every `constraints[]` rule. Anything you could not
   satisfy goes in `unmet[]` — and a non-empty `unmet[]` means status `partial`
   (or `failed`), never `done`. An honest partial beats a false done.
6. **Milestone pings:** after each declared file completed or logical subtask
   done, emit a brief progress ping: {percent, files_written[], notes}. These
   bound what a mid-wave stop can save — do not skip them.
7. Stay within your task. Discovering needed context outside your slice →
   emit the needs_context return (below). Do NOT fetch it yourself.

## Return contract (emit EXACTLY this structure; the caller validates)

- task_id
- actual_model            — the model id quoted VERBATIM from your system prompt
                            ("The exact model ID is …"); NEVER inferred from priors;
                            `unknown` if no such line exists. Lets the caller catch
                            a silent tier downgrade (claimed-vs-actual model check)
- actual_effort           — the value of $CLAUDE_EFFORT (read via Bash at start)
- status: done | failed | partial | needs_context
- actual_files[]          — every file you truly touched (audited vs declared)
- evidence                — {command, exit_code, tail} of the build/test you ran,
                            quoted VERBATIM (like actual_model — never invented).
                            REQUIRED when status=done and the project has a
                            runnable build/test; null when it has none
- no_runner_detected      — true ONLY when the project exposes no runnable
                            build/test (explains a null evidence); else absent
- unmet[]                 — acceptance[]/constraints[] lines you could NOT
                            satisfy. MUST be empty when status=done — a
                            non-empty unmet[] forces partial/failed
- log_entries[]           — cross-cutting decisions for the decision log,
                            tagged DECISION | CONSTRAINT | INTERFACE
- failure_reason          — REQUIRED when status=failed (the why); else null
- progress                — {percent, files_written[], notes} when partial; else null
- context_request         — REQUIRED when status=needs_context: what you need
                            and why (e.g. "needs T1's type enum interface");
                            else null
- pattern_version         — the `pattern.pattern_version` you applied; null if no
                            pattern was supplied
- invariants_checked      — true ONLY if you verified every BLOCKING invariant in
                            `pattern` against your diff; false/null if no invariants
                            were supplied. A pattern task returning false/absent here
                            is a malformed return
- tdd_state               — green | red | null. REQUIRED when the slice carried a
                            `tdd_spec`: green ONLY after its tests pass (run quoted
                            in `evidence`); red = cap hit/unresolved (failing tests
                            in unmet[]); null only without a tdd_spec. status=done
                            with red is malformed
- gotcha_recorded         — REQUIRED when this return CLOSES a repair loop (you
                            drove a tdd_spec test red → green): the entry body
                            {trigger, symptom, cause, fix, scope}, or `none` + a
                            one-line reason. Absent on a repair-closing return is
                            malformed; not required when nothing was repaired. A
                            loop that hit `tdd_loop_max` and STOPPED returns
                            `none` — an unsolved failure is not a gotcha. You
                            RETURN it; the caller writes the file

Malformed returns are treated as failure by the caller. needs_context is
capped at 2 per task — a third means the slice or plan is wrong and escalates
to the user.
