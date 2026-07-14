---
name: orc-execution
description: >
  Executor worker for ORC — the single-task implementer. Given one task slice
  (task_id, declared_files, constraints, spec_ref, log_digest), it implements
  EXACTLY that task within its declared files, honors every hard-rule constraint,
  creates/updates tests, emits milestone progress pings, and returns a strict
  contract (status done|failed|partial|needs_context, actual_files, log_entries,
  and claimed-vs-actual model/effort so the caller can catch a silent tier
  downgrade). Dispatched once per task in an execution wave, on the scored model
  pinned by its executor agent. Distinct from the review/verify/test-author
  workers — this one writes the implementation. ALWAYS a spawned subagent; the
  orchestrator never implements. Not for direct user invocation.
---

# orc-execution

One entry point: the orchestrator spawns a subagent via the Task tool,
prepending `subagent.md` framing + the input slice, which points to `core.md`.
`core.md` is the AUTHORITATIVE spec (full input slice, procedure, and return
contract); the summary below orients — on any conflict, `core.md` wins.

## What the worker does (summary)

1. Absorb `log_digest` (prior DECISIONs/INTERFACEs/ANSWERs bind you); read `spec_ref`.
2. Implement EXACTLY the task in the slice, touching only `declared_files[]`,
   honoring every `constraints[]` hard rule AND the standing `house_rules` card
   (surgical changes, simplicity-first, no unrequested scope, never claim
   unobserved results, honest partial over false done); create/update
   tests for what you build.
3. Run the proof: build/test for your changes, capturing `evidence`
   {command, exit_code, tail} VERBATIM (no runner → `no_runner_detected: true`);
   self-check the diff against the slice's `acceptance[]` + `constraints[]` —
   anything unsatisfied goes in `unmet[]` (non-empty = partial/failed, never done).
4. Emit milestone pings ({percent, files_written[], notes}) as you go.
5. Stay in your slice — need outside context? emit `needs_context`, don't fetch it.

## Return shape (summary — full contract in `core.md`)

`{ task_id, actual_model, actual_effort, status: done|failed|partial|needs_context,
actual_files[], evidence, no_runner_detected, unmet[], log_entries[],
failure_reason, progress, context_request,
pattern_version, invariants_checked }`

When the slice carries a `pattern`, MATCH its conventions, satisfy every BLOCKING
invariant AND every enforceable `validation_gate[]` line (advisory gate lines are
informational); echo the `pattern_version` and set `invariants_checked: true` only after
re-checking your diff. A pattern task that returns false/absent here is malformed.

**Crosslink injection (orchestrator-side, advisory).** At slice assembly, if a
task's declared files include a call site that matches an entry in
`.claude/orc/crosslink/needs.json`, prepend the cached tag contract (from
`.claude/orc/crosslink/cache/`) to the slice as `crosslink`, labeled with its
effective cross-repo tier + "hints, not verified". The executor MATCHES the
stated field names/types but never lets it override local code — it is advisory,
so there is NO return field and nothing to attest (unlike `pattern`). A task with
no boundary carries no `crosslink`.
On a UI task, if the environment ships a `frontend-design` skill, read and apply
it (skip silently when absent).

**Validation checkpoint before returning:** `status=failed` REQUIRES a
`failure_reason`; `needs_context` REQUIRES a `context_request` (capped at 2/task);
`actual_model` is quoted VERBATIM from your system prompt, never inferred;
`status=done` REQUIRES `evidence` when a runner exists (else
`no_runner_detected: true`) and an EMPTY `unmet[]`. A
malformed return is treated as failure by the caller.
