# ORC Agents — Roster, Model Mapping & Verification

Single-role, model-specific agents. The orchestrator dispatches BY AGENT NAME —
model is pinned in frontmatter, not requested in prose. No agent is multi-role.

## Executors (score-mapped by the single 6-band table in config.md)

| Score band | Agent | Model | Effort |
|-----------|-------|-------|--------|
| [0,30)   | orc-executor-haiku-4-5       | claude-haiku-4-5  | — (no ladder) |
| [30,40)  | orc-executor-sonnet-4-6-med  | claude-sonnet-4-6 | medium |
| [40,55)  | orc-executor-sonnet-4-6-high | claude-sonnet-4-6 | high |
| [55,65)  | orc-executor-sonnet-5-high   | claude-sonnet-5   | high |
| [65,90)  | orc-executor-opus-5-low      | claude-opus-5     | low |
| [90,100] | orc-executor-opus-5-med      | claude-opus-5     | medium |

Score→executor mapping lives in config.md (one canonical 6-band table;
`rubric_bands` is granularity only, not a preset selector).

**Executors no band names — they still ship.**
`orc-executor-opus-4-7-med`, `orc-executor-opus-4-7-high`,
`orc-executor-opus-4-8-high` and `orc-executor-opus-5-high` are still generated
and still installed. Since v1.0.0 they are reachable only when a user names one
explicitly: `rubric_bands_override`, `orc diy`'s `fixed_executor`, or
`extra_fallback_agent`. They are not deleted because a table change is not a
model change, and an agent's model change is always a RENAME.

## Fixed-role agents

| Agent | Model | Effort | Role |
|-------|-------|--------|------|
| orc-system-analyst-opus-5-high | claude-opus-5 | high | doc analysis |
| orc-planner-opus-5-med | claude-opus-5 | medium | planning |
| orc-reviewer-opus-5-med | claude-opus-5 | medium | review |
| orc-verifier-opus-5-med | claude-opus-5 | medium | verify (+ /orc-verify) |
| orc-test-author-opus-5-med | claude-opus-5 | medium | test authoring (opt-in Phase 6.5; writes tests, never runs) |
| orc-analyze-mini-sonnet-5-high | claude-sonnet-5 | high | mini analysis |
| orc-planner-mini-sonnet-5-high | claude-sonnet-5 | high | mini planning |
| orc-scout-sonnet-4-6-high | claude-sonnet-4-6 | high | deep-analysis code scout (read-only) |
| orc-context-combiner-opus-5-high | claude-opus-5 | high | combine 2+ related analyses (full lane) |
| orc-pattern-codifier-sonnet-5-high | claude-sonnet-5 | high | reconcile per-language playbook vs. project files → cached code-pattern (opt-in) |
| orc-retro-sonnet-5-high | claude-sonnet-5 | high | mine behavior traces → calibration report (/orc-retro; read-only) |
| orc-wiki-scanner-opus-4-8-high | claude-opus-4-8 | high | scan ONE wiki coverage area → evidence-anchored doc body + crosslink tags (/orc-wiki only; read-only against the project). The DEEP half of the v0.46.0 tier ladder: first scan · STRUCTURAL · wide delta · a new exported symbol |
| orc-wiki-scanner-sonnet-5-high | claude-sonnet-5 | high | the LIGHT half of the same ladder — an existing doc whose covered files moved by a small, no-new-surface delta. IDENTICAL return contract; it escalates with `needs_context` rather than under-delivering. Never used for a first scan |
| orc-executor-opus-5-med | claude-opus-5 | medium | the `[90,100]` band in BOTH tables |
| orc-executor-opus-5-low | claude-opus-5 | low | the default table's `[65,90)`, `opus5_only`'s `[0,90)`, and the forced mini/fast executor |
| orc-advisor-opus-5-xhigh | claude-opus-5 | xhigh | ultra Phase U0 advisory brief + rubric + clarification questions (read-only; /orc-ultra only) |
| orc-judge-opus-5-xhigh | claude-opus-5 | xhigh | ultra judgment gates — analysis / plan / implementation (read-only; /orc-ultra only) |
| orc-learn-writer-opus-5-low | claude-opus-5 | low | deepen ONE feature → learning-docs/<slug>/ (/orc-learn only; git-ignored output) |
| orc-claude-writer-opus-4-8-high | claude-opus-4-8 | high | scan repo → write/refresh the local CLAUDE.md (/orc-claude only; zero questions) |
| orc-challenge-judge-opus-5-high | claude-opus-5 | high | grade ONE finished artifact against a FROZEN goal + template (/orc-challenge only; read-only). It reports findings and can never declare a pass — `orc challenge record` computes that |
| orc-challenge-advisor-opus-5-med | claude-opus-5 | medium | turn a FAILED verdict into a remediation strategy — root-cause groups, an order with reasons, the decisions that are not defects (/orc-challenge only; read-only, no prose, no diffs) |
| orc-challenge-reader-opus-5-low | claude-opus-5 | low | the COLD READ: answer questions from ONE artifact with `Read` and nothing else (/orc-challenge only). LOW ON PURPOSE — a harder-thinking reader reasons around the gaps D4 exists to find, so a stronger configuration is a worse instrument |
| orc-challenge-contrarian-opus-5-high | claude-opus-5 | high | THE COUNCIL (v0.49.1): start from "this has a fatal flaw" and go find it — load-bearing claim, then unhappy path, then second-order (/orc-challenge only; read-only). HIGH IS THE INSTRUMENT: a shallow contrarian returns the three surface complaints the free lint already caught |
| orc-challenge-outsider-opus-5-low | claude-opus-5 | low | THE COUNCIL: what does this page assume you already know? The TIGHTEST slice in the lane — the artifact and this protocol, `Read` only, no goal, no audience, no template (/orc-challenge only). LOW IS A MEASUREMENT, NOT A COST CHOICE: a harder-thinking outsider reasons its way around an unexplained acronym and reports the document is fine. NOTHING MAY UPGRADE IT |
| orc-challenge-executor-opus-5-med | claude-opus-5 | medium | THE COUNCIL: can this be started on Monday, and where is the first step? Returns D6/D2 findings plus the literal `monday_morning` list — or the point at which writing it becomes impossible (/orc-challenge only; read-only, `Bash` to CHECK a prerequisite, never to change anything). Not an ORC build executor — it writes nothing |
| orc-challenge-principles-opus-5-high | claude-opus-5 | high | THE COUNCIL: the ONLY role allowed to say the frozen goal is wrong. Returns `premise` objects — no severity, never in findings[], never near the pass gate — and its report NEVER reaches the judge (/orc-challenge only; read-only). HIGH because rebuilding a problem statement from the ground up is the deepest reasoning in the lane |
| orc-challenge-expansionist-opus-5-med | claude-opus-5 | medium | THE COUNCIL: the only lens not looking for a defect — what is being undervalued? Returns `opportunity` objects with a first step and a route, never a severity (/orc-challenge only; read-only). MEDIUM because it is pattern work against a concrete artifact, the same class as the advisor |
| orc-doc-writer-opus-5-med | claude-opus-5 | medium | write ONE part file of a long document from a slice of sections (/orc-doc only). It writes to `.work/<id>.md` and NEVER opens document.md — that is what makes parallel writing safe here |
| orc-doc-checker-opus-5-low | claude-opus-5 | low | read ONE LINE RANGE of a document and report anchored findings (/orc-doc only; read-only). LOW ON PURPOSE — the same reasoning that pins the challenge cold reader: a harder-thinking checker reasons its way past a gap a real reader would trip on |
| orc-trace-writer-haiku-4-5 | claude-haiku-4-5 | — (no ladder) | append one phase block of behavior-trace narration from an orchestrator packet (every trace-owning lane; append-only, never reads source) |

## Opus-5-only mode agents (hard-gated; dispatched only when `opus5_only: true`)

`opus5_only` FORCES every dispatched role onto `claude-opus-5`, with effort as
the only cost dial. Each agent below replaces its default with the same slice
and the same return contract. Effort is PINNED per role — no CLI rewrites
these. Full mapping + precedence:
`../skills/_shared/opus5-only.md`.

| Agent | Model | Effort | Replaces |
|-------|-------|--------|----------|
| orc-executor-opus-5-low | claude-opus-5 | low | the `[0,90)` band · orc-mini's and orc-fast's fixed executor |
| orc-executor-opus-5-med | claude-opus-5 | medium | the `[90,100]` band |
| orc-analyze-mini-opus-5-med | claude-opus-5 | medium | orc-analyze-mini-sonnet-5-high |
| orc-planner-mini-opus-5-med | claude-opus-5 | medium | orc-planner-mini-sonnet-5-high |
| orc-scout-opus-5-low | claude-opus-5 | low | orc-scout-sonnet-4-6-high |
| orc-pattern-codifier-opus-5-med | claude-opus-5 | medium | orc-pattern-codifier-sonnet-5-high |
| orc-wiki-scanner-opus-5-med | claude-opus-5 | medium | orc-wiki-scanner-opus-4-8-high |
| orc-claude-writer-opus-5-med | claude-opus-5 | medium | orc-claude-writer-opus-4-8-high |
| orc-retro-opus-5-med | claude-opus-5 | medium | orc-retro-sonnet-5-high |

The nine roles already on `claude-opus-5` — analyst, planner, reviewer,
verifier, test-author, combiner, learn-writer, advisor, judge — dispatch
unchanged under this mode. **Never forced:** `orc-trace-writer-haiku-4-5` (it
transcribes a packet, no reasoning) and orc-diy (its table is compile-owned).

Mini execution reuses orc-executor-sonnet-5-high. Fast-lane (orc-fast)
execution reuses orc-executor-sonnet-4-6-high — no dedicated agent. Under
`opus5_only` both reuse orc-executor-opus-5-low.

## orc-quick — the user picks, and no config can override it

`/orc-quick` has NO dedicated agent and NO score table. It asks the USER which
agent to spawn before EVERY dispatch, and reuses shipped agents:

| Dispatch kind | Offered | Hook-traced |
|---|---|---|
| writes code | orc-executor-sonnet-4-6-med · orc-executor-opus-5-low | yes |
| read-only recon | an **ad-hoc model + effort** (e.g. claude-sonnet-4-6 / medium) — no agent file | no |
| review | orc-reviewer-opus-5-med · or ad-hoc | yes / no |

The only dispatch it does not re-ask is build-repair rounds 1–2, which reuse the
executor the user already chose for that entry; round 3 asks again.

**`opus5_only` and `rubric_bands_override` are both INERT in this lane** — they would silently collapse the user's choice. It is
the one exception to `opus5_only`'s otherwise flat precedence. See
`skills/_shared/opus5-only.md` and `skills/orc-quick/references/dispatch-gate.md`.

Ad-hoc recon is dispatched by model name, not by an `orc-*` agent file, so the
trace hook emits no SPAWN/RETURN for it. The lane still writes its own
`DISPATCH … adhoc=true` / `VERIFY` lines and still runs the downgrade check from
the agent's self-reported `actual_model`; only `/orc-retro` aggregation misses it.

The scout is dispatched only in the System Analyst's DEEP mode: the orchestrator
fans out ≤`config.max_scouts` (default 3) parallel scouts, one per coverage area
from the analyst's scout plan, and feeds their evidence bundles back to the
analyst for pass 2. Scouts are read-only and never analyze/plan/edit.

The orchestrator (main session) is NOT an agent file.

## ⚠ VERIFY IN YOUR ENVIRONMENT

Model IDs use the Platform/API dateless format (confirmed at
platform.claude.com/docs/en/about-claude/models/model-ids-and-versions):
claude-haiku-4-5, claude-sonnet-4-6, claude-sonnet-5, claude-opus-4-7,
claude-opus-4-8 and claude-opus-5 (the top executor band + the core fixed
roles).

1. **Run `/agents`** to confirm Claude Code accepts these full IDs in agent
   frontmatter — in particular `claude-haiku-4-5` and `claude-opus-5`. If it
   wants short aliases (opus/sonnet/haiku) or dated IDs, adjust
   each `model:` field. The full IDs are valid at the API level but Claude Code
   may normalize differently.
2. **Confirm `effort:` is a valid CLI frontmatter field.** If the CLI ignores
   it, effort must be conveyed in the dispatched prompt instead.
3. **Run `/doctor`** for duplicate-name or load errors after any edit.

## ⚠ COST-TIER FALLBACK (the original "wrong model" bug)

A subagent's model cannot exceed the MAIN session's cost tier — request pricier
and it silently falls back to the main model. **Run your main Claude Code
session on Opus** or every opus-* agent downgrades to Sonnet. As of v0.34.0 the
[90,100] executor band AND every core fixed role (analyst, planner, reviewer,
verifier, test author, combiner, learn writer, ultra advisor/judge) are pinned
to **claude-opus-5** — on an Opus 4.8 session they all land on Opus 4.8. Verify by
expanding a subagent's tool-call in the transcript to see the model it ran.

## How dispatch works

- Score a task → config preset maps score to an executor agent → dispatch that
  agent BY NAME with the task slice.
- Fixed roles dispatch their named agent directly (analyst/planner/reviewer/
  verifier, mini variants).
- Every agent is single-role and self-contained (embedded procedure), so a
  dispatched agent needs no external skill-loading to function.
