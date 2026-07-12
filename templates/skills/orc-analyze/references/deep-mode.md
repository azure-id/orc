# Reference — Deep mode (two-pass reconciliation with scouts)

Load only when the user chose DEEP at the Phase A′ gate. Deep requires explicit
consent — it never auto-escalates. Presetting `default_analysis_depth` via
`orc config` only changes which option is the default — the run still confirms.

1. **Pass 1 (scope + scout-plan).** After Phase B, instead of sweeping the repo
   yourself, emit a **scout plan**: a short list of coverage areas, each with
   concrete search queries (e.g. "all call sites of `authToken`", "tests touching
   checkout", "config for rate limits"). Coverage areas MAY include anchored
   adjacent-scope touchpoints (each tied to an in-scope requirement per hard
   rule 3a) so scouts fetch their evidence too — still touchpoint-bounded,
   never all of an adjacent scope. Return the plan to the orchestrator. Do NOT
   do the full reconciliation yet.
2. **Scouts (orchestrator-dispatched).** The orchestrator dispatches ≤`max_scouts`
   (config, default 3) parallel read-only `orc-scout-sonnet-4-6-high` agents, one
   coverage area each. They return **code-evidence bundles** (file:line hits,
   dependents, tests, config).
3. **Pass 2 (reconcile).** The analyst is re-dispatched WITH the bundles. Do the
   full reconciliation using them: **verify every claim** (not just the standard
   floor), evidence-or-mark discipline with quote-anchored refs + `searched:`
   absence notes, and produce the deep-only **Alternatives & risks** section
   (implementation-approach options, trade-offs, blast radius, edge cases). The
   scout plan/areas decided coverage — the orchestrator only dispatched; the
   analyst owns what got scouted and how the evidence is used.
