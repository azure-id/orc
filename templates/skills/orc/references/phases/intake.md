# Phase — Intake   (id: `intake`)

> **`/orc` phase file.** Moved out of `orc/SKILL.md` at v1.0.0 W12. The spine is
> loaded IN FULL when the skill activates; this is loaded when the phase fires,
> and most runs skip most phases. ONE consumer today, so it stays in this lane —
> `../../../_shared/phases/README.md`'s rule: a file with one consumer stays home.
> When a second lane reads it (W13 `orc-diy`, W14 `orc-mini`/`orc-fast`) it moves
> to `_shared/phases/` and gains a `composed` or `trim` layer beside this one.
> `orc lane phases orc --json` names the file and the layers.

<!-- orc:layer full -->

## Intake (load ../../../_shared/phases/intake.md)

**Plan-input trigger (check FIRST — load `../../../_shared/phases/plan-handoff.md`):** if the
run input IS a plan (pasted planning-output, a `plan-{name}.md` path, or an
`orc/planner/{name}/` checkpoint), follow that reference: bootstrap the trace,
schema-validate, apply the `plan_head` staleness valve, RE-RUN the full Phase 1
exit gate here (the deterministic catch for phantom-file drift), relay
`open_questions[]`, then continue at Phase 2. A plan input never skips Phase 2/3
nor executes task-by-task ad hoc.

**Analyst auto-trigger:** on a document (PDF path, pasted doc, audit sheet)
OR an ambiguous/underspecified requirement, FIRST dispatch the System Analyst
(doc-optional — with no doc the request itself is the source). Offer
standard/deep (`config.default_analysis_depth` presets it; mention `orc
config set default_analysis_depth deep`); deep → you dispatch the scouts. On
return run the analyst-return gates (analyst-gates.md); on build, continue at
Phase 1 with the Requirement Planner.

Emit `PHASE intake start` FIRST, then create `run/{run-slug}/` (slug from the
intent). Then: rough-size →
question tier (2/4/6) → ONE batched question round → draft the intent-spec
(`../../schemas/intent-spec.md`) → **repo cross-check** (intake Step 3.5:
Glob/Grep-confirm everything the spec names, or tag `UNVERIFIED`; tags become
ONE batched sign-off question; >3 tags → recommend `orc-analyze`) → sign-off
preference (gate/soft; DEFAULT GATE) → show spec → approval or edits. **No
planning until approved (gate mode) and no unresolved `UNVERIFIED` tags
either way.** On approval, emit `PHASE intake end`.

The intent-spec's definition-of-done becomes Phase 6's acceptance criteria;
its constraints become hard rules in every slice — at slice-assembly each
task's `spec_invariants[]` is appended VERBATIM to that slice's
`constraints[]`. Offer the opt-in **Test Authoring** (Phase 6.5; default
`config.generate_tests`) in the sign-off round.

<!-- /orc:layer -->
