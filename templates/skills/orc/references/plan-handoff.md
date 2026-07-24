# Reference — Plan Handoff (executing a plan from another session)

The entry contract for the case ORC had no defined path for: **the run input
IS a plan**, not a request. A plan was produced in one session (or saved to a
file) and handed to a fresh session to build. Load `references/plan-handoff.md`
at Phase 0 the moment you recognise a plan input; it turns a pasted plan into a
real ORC run instead of an ad-hoc task-by-task improvisation.

## Trigger — the input IS a plan

Recognise a plan input when the run starts from any of:

- **pasted planning-output** — a YAML/markdown block matching
  `schemas/planning-output.md` (has a `tasks:` list with `declared_files`,
  `depends_on`, `grounding[]`);
- **a `plan-{name}.md` path** the user points at;
- **an `orc/planner/{name}/` checkpoint** (the planner's "Save & stop" artifact).

A plain-language feature request is NOT a plan input — that is ordinary Phase 0
intake. When in doubt (a prose paragraph with no task structure), treat it as a
request and run intake normally.

## Why this exists (the failure it prevents)

A plan built in session A and executed in session B used to improvise: no spine
load, no trace protocol (the hook bootstrapped a generic `run-*.txt`), no Phase
1 exit gate re-run, no Phase 2 scoring or pause schedule, no Phase 3 wave
grouping. The result was a bare SPAWN/RETURN trace, per-task ad-hoc pauses, and
**phantom-file drift** — the plan declared a file that never (or no longer)
existed, invisible because the plan's grounding Glob ran at *planning* time in
the other session and nothing re-ran it here.

## Mandatory sequence (never execute a plan task-by-task ad hoc)

Do these IN ORDER before any dispatch. Skipping any step is a protocol
violation.

1. **This IS a run — bootstrap it.** Load the spine (`orc/SKILL.md`) and
   `references/trace-protocol.md`; create `log_dir`, write `log_dir/.current` =
   `run-orc-<slug>-<DDMMYY>-<HHMMSS>.txt`, store `trace_path` in the checkpoint.
   Record `PHASE intake start` into this phase's packet.
2. **Schema-validate against `schemas/planning-output.md`.** Every task needs
   `declared_files`, `grounding[]`, `depends_on`, `requirements[]`,
   `acceptance[]`, `owns_area`, `spec_ref`, and the `facets` block (Part D). A
   malformed plan → show exactly what field is missing and offer a re-plan via
   `orc-planner` (dispatch it with the miss list). **Never improvise a missing
   field** — a guessed `declared_files` or an invented `facets` vector defeats
   the point of consuming a plan.
3. **Staleness valve (`plan_head`).** The plan carries `plan_head` — HEAD at
   plan time (the mirror of a requirement-spec's `git_head`). If `plan_head` ≠
   current HEAD, OR the field is absent (a pre-v0.31.0 plan), the grounding
   spot-check in step 4 is **compulsory** and its misses are surfaced, not
   waved through. Matching heads still run the gate — they only lower the
   suspicion.
4. **Re-run the FULL Phase 1 exit gate in THIS session** (deterministic — the
   checks live in `analyst-gates.md`; emit `GATE` lines): Glob every
   `disposition: exists` path, recompute coverage (no `orphan` requirements),
   cycle detection over `depends_on`, same-file collision over `declared_files`.
   This is the deterministic catch for phantom-file drift — a declared path that
   no longer (or never) existed bounces **before** any dispatch. On a miss,
   offer a targeted re-ground (one `orc-planner` re-dispatch with the miss list)
   or a user correction; never dispatch past an unresolved miss.
5. **Relay unresolved `open_questions[]`** (Part E) in ONE batch before
   proceeding: blocking questions must be answered; non-blocking show their
   `proposed_default` for tacit approval. A `plan_confidence: low` plan →
   recommend stepping back to `orc-analyze` (the user may override).
6. **Then the NORMAL pipeline.** Emit `PHASE planning end`, then run Phase 2
   (facet scoring + dispatch-style recommendation + the batch-pause schedule
   question) → Phase 3 (wave grouping — waves are computed regardless of
   dispatch style, see `wave-grouping.md`) → review → verify → ship. **A plan
   input never skips Phase 2/3.** The plan supplied the tasks; the orchestrator
   still owns scoring, waves, and pauses.

## Not this

- **Not** a re-plan. If the plan validates and grounds clean, DO NOT re-run the
  planner — the plan is authoritative; you are scoring and scheduling it.
- **Not** a scope re-litigation. Scope was settled where the plan (or its
  upstream spec) was produced. The gate checks structural integrity, not intent.
- **Not** a poly-spec path. A poly-spec (`orc-poly:spec`) is split-and-STOP at
  Phase 1 (see SKILL.md) — that is a different input than a per-repo
  planning-output handed here to build.
