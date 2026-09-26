# The review slice — the ONE shape every lane uses

> **On demand.** Read this file ONLY when a review dispatch is about to be built
> (`/orc` Phase 5 and its composed DIY layer, `orc-review-verify/core.md`, the
> `/orc-quick` review offer, the `/orc-mini` risk-high option, the `/orc-pr-driver`
> per-layer gate, `/orc-ultra` gate 3). One slice, so a review in quick is the
> same review as in `/orc`. The procedure and the return live in the agent file
> (`.claude/agents/orc-reviewer-opus-5-med.md`), never here.

Slice fields: changed_files[] · diff_ranges[] · acceptance_criteria[] · constraints[] · code_pattern · invariants[] · validation_gate[] · fe_rules[] · security_checklist[] · graph_changes · tool_findings[] · gotcha_card · rules_card · previous_findings[] · mode

## §1 R1 — the free check (before ANY review dispatch)

The free check always runs before the paid one. On the changed files only:

1. Run the project's OWN lint and type check. Take the commands from
   `wiki-meta.json` `commands`; else the `package.json` scripts named `lint` /
   `typecheck`; else the `pyproject` / `Makefile` targets of those names; else
   `sonar-scanner` when the project already has it. **Never invent a command.
   Never install tooling.** No command found → `tool_findings[]` is empty; say so
   in one line.
2. Run `orc rules lint --diff` (free, zero tokens).
3. Keep only the output lines that land on a changed file → `tool_findings[]`
   (`{tool, location, message}`). **The reviewer must not re-report them.**

`/orc-ultra` gate 3 reuses this step (it does not run a second copy); a fix wave
that changed files re-runs it first.

## §2 The fields

| Field | Source |
|---|---|
| `changed_files[]`, `diff_ranges[]` | git — `diff_ranges` are the changed line ranges per file (R2) |
| `acceptance_criteria[]`, `constraints[]` | the plan / the quick entry |
| `code_pattern`, `invariants[]`, `validation_gate[]` | the pattern cache (or null / empty) |
| `fe_rules[]`, `security_checklist[]` | FE diffs / `mode: security` only, else empty |
| `graph_changes` | `orc graph changes --if-enabled --json` — **keeps its rows: no `--brief` here** |
| `tool_findings[]` | §1 |
| `gotcha_card` | `orc gotcha card --files <changed csv> --lane <lane> --json` → `text` |
| `rules_card` | `orc rules slice --lane <lane> --json` → `text` (a lane with no rules → null) |
| `previous_findings[]` | the checkpoint, on a re-review ONLY (R9), each with its outcome |
| `mode` | `review` · `disprove` · `security` |

- **`graph_changes`** (`code-graph.md` §7): the symbols THIS diff's hunks overlap,
  each with its callers, its tests and a risk word that carries its own reason.
  The reviewer is handed `symbols[].caller_files` and reads them.
It replaces a whole-file `orc graph impact` here: a file card reports every symbol in
a touched file, and a symbol nobody edited is not a finding. An unchanged caller of
a changed signature is a finding candidate, anchored like any other.
- **`gotcha_card` is ALWAYS built** when anything matches — no switch removes it
  (`gotcha_card_budget` is only its size). Exit 1 (no match) → null, the normal
  case. Its header counts what the budget dropped; never cut it silently.
  Before the card, run `orc gotcha sync --json` (it is due at most once per
  `gotcha_sync_hours`); exit 2 (a CLI that has no `sync`) or any failure → go on.
- **`mode: disprove`** carries only the P0/P1 findings to test and their files.

## §3 After the return — the after-filter (R10)

The reviewer reports EVERY finding. Then, before the ladder acts:

1. Pipe the findings to `orc gotcha filter --findings - --json`. It drops P2/P3
   that a `suppress` gotcha names, folds P3 above 5 into `+N similar`, and applies
   the category noise budget. **It never removes a P0 or P1.** Keep its `kept`;
   list its `removed[]` (each with the `by` id) in the run summary — a count is
   not consent.
2. `pre_existing: true` findings (on a line outside `diff_ranges`) go to their own
   bucket. They never gate.
3. A P0/P1 with no `scenario`, or with `confidence: low`, becomes P2.
4. Findings that share a `group` are ONE fix: the P0 fix, the P1 ask and the P2
   batch are made per group (R7).

5. At review close, record one observation per finding and emit the
   `FINDING-OUTCOME` line — `gotchas.md` §10 "Review close" (`/orc` Phase 7,
   `/orc-mini` after its risk option, `/orc-quick` after the review offer).

**Superpowers path** (DE-13): after the Superpowers review skill returns, run
this §3 on its findings too, outcomes included — never a second reviewer dispatch.
