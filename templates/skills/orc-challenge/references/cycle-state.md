# Cycle state — computed, never stored

Nothing below is written to disk. `orc challenge status` derives all of it from
`challenge.json` plus the artifact shas on disk plus `git`. **The skill never
computes a state itself** — the same rule `../../_shared/detecting-artifacts.md`
sets for the wiki tier, and the same rule `/orc-pact` keeps for a promise.

| State | Computed when |
|---|---|
| `AWAITING-JUDGE` | the cycle exists and no iteration has been recorded |
| `AWAITING-FIX` | the last verdict FAILED and no artifact sha has changed since |
| `AWAITING-RECHECK` | the last verdict FAILED and at least one artifact sha HAS changed — the user did work, a new iteration is warranted |
| `PASSED` | no open finding is at or above the blocking severity, and nothing has changed since |
| `STALE-PASS` | passed, but an artifact changed afterwards. **Honest, not a failure** — the `UNCHECKABLE` precedent from `/orc-pact` |
| `MISSING-REVISION` | the last verdict FAILED and the **declared** revision path does not exist. Candidates are listed, never adopted |
| `TAMPERED` | a stored `verdict_file_sha` no longer matches disk. Reported, never silently re-graded |

`TAMPERED` is checked FIRST and raises the exit code to 2. A cycle whose evidence
moved under it is not "passed" and is not "awaiting" anything — it needs a human
to say what happened.

## Two flags, not two states

A state that means two things is a state that lies. These ride alongside:

- **`stalled: true`** — findings at or above the blocking severity have not net
  decreased across `challenge_stall_after` iterations (default 3).
- **`no_template: true`** — D1 is `NOT-CHECKED`.

## Why PASS is recomputed on read

The stored `passed` on an iteration is that VERDICT'S OWN HISTORY — it is what
the convergence chart draws, and it never changes. The STATE is recomputed live,
because `orc challenge accept` is a decision that takes effect the moment it is
recorded. If it did not, the escape valve would not escape until one more paid
iteration had run.

## Exit codes

| Command | Codes |
|---|---|
| `challenge list` | 0 all passed · 1 ≥1 in-flight · 3 no cycles |
| `challenge status <slug>` | 0 PASSED · 1 open blocking findings · 2 a P0 is open, or TAMPERED · 3 unknown slug |
| `challenge show <slug>` | 0 · 3 unknown |
| `challenge diff <slug>` | 0 unchanged · 1 changed · 2 `MISSING-REVISION` · 3 unknown |
| `challenge expect <slug>` | 0 · 2 refused (outside the repo, or inside the review trail) · 3 unknown |
| `challenge lint <path>` | 0 clean · 1 findings · 2 unreadable |
| `challenge outline <path>` | 0 · 2 unreadable |
| `challenge record` | 0 recorded · 2 malformed · 3 unknown slug |
| `challenge roles` | 0 (static — works with no cycle, no project, no git) |
| `challenge council <slug>` | 0 roster set · 1 roster UNSET · 3 unknown slug |
| `challenge council --set` | 0 · 2 no reason, or an unknown lens · 3 unknown slug |
| `challenge note` | 0 · 2 malformed (incl. a `findings[]` key) · 3 unknown slug |
| `challenge premise <slug> <id> --dismiss` | 0 · 2 no reason · 3 unknown id |
| `challenge opportunity <slug> <id> --take\|--drop` | 0 · 2 no reason, or neither/both flags · 3 unknown id |
| `challenge accept` / `rebut` | 0 · 2 no reason · 3 unknown id |
| `challenge template` / `goals` | 0 · 2 refused (no reason, or no such file) · 3 unknown |
| `challenge report` | 0 · 3 unknown |
| `challenge init` | 0 · 2 exists, or a required flag is missing (`--goal`, `--audience`, `--done-means`, **`--council`**), or no template decision |

## Per-finding freshness is COVERAGE-RELATIVE

The `computeWikiFreshness` lesson, applied to findings. On resume, for each
carried finding, the CLI asks: **did the lines this finding anchors actually
change?**

```
$ orc challenge diff tsd-payments

expected revision:  docs/tsd-payments-v2.md   FOUND   (3f9a… → b71c…, +48 −12)
carried findings:   12   ·  9 touched  ·  3 untouched   ← F-003 F-009 F-011
```

**It is a hint for the human, not an input to the judge.** Untouched does not
mean unfixed (the fix may be elsewhere), and touched does not mean fixed. Hard
rule 11: the judge re-reads.

## `MISSING-REVISION` lists, it does not adopt

```
expected revision:  docs/tsd-payments-v2.md   MISSING

Candidates changed since iteration 1 (git):
  1  docs/tsd-payments-v2.draft.md      +51 −12
  2  docs/tsd-payments.md               +4  −0

Which of these is the revision — or is the work not done yet?
Record it:  orc challenge expect tsd-payments --set <path>
```

Picking the closest-looking file would be ORC guessing what the user did, and **a
judge pointed at the wrong file produces a page of confident, useless findings.**
The choice is recorded, so the next iteration knows too.

## `challenge.json`

THE LEDGER. Written ONLY by `orc challenge` — never by a model, the same rule
`wiki-meta.json` lives under. What is NOT stored: `state`, `passed` (as a cycle
fact), `stalled`. All computed.

```jsonc
{
  "version": 1,
  "slug": "tsd-payments",
  "kind": "tsd",
  "created_at": "12-08-2026 14:02:11",
  "artifacts": [
    { "path": "docs/tsd-payments.md", "sha": "b71c…", "seen_at_commit": "9fa41c2" }
  ],
  "template": { "source": "docs/templates/tsd.md", "frozen": "template.md",
                "sha": "0c8e…", "version": 1 },
  "goals": {
    "frozen": "goals.md", "sha": "5d20…", "version": 1,
    "goal": "a backend team implements this without asking me anything",
    "audience": "backend engineers, 2 of 5 non-native English readers",
    "done_means": "no open interface question and no TBD in §3–§7",
    "out_of_scope": ["the mobile client"],
    "context_refs": ["JIRA-4412"]
  },
  "revision": { "mode": "new-file", "pattern": "docs/tsd-payments-v{n}.md" },
  "dimensions": ["D1","D2","D3","D4","D5","D6"],
  "accepted": {}, "rebuttals": {}, "events": [],
  "iterations": [
    { "n": 1, "graded_against": 1, "graded_against_goal": 1,
      "artifact_shas": { "docs/tsd-payments.md": "3f9a…" },
      "lint": { "findings": 14 }, "reader": { "score": "8/12" },
      "verdict_file": "iteration-01/verdict.md", "verdict_file_sha": "aa19…",
      "dimensions": [ { "id": "D1", "status": "CHECKED", "findings": 2 } ],
      "findings": [
        { "id": "F-003", "dimension": "D2", "severity": "P0",
          "anchor": "docs/tsd-payments.md:118", "serves": "done_means",
          "carried": false, "outcome": null }
      ],
      "coverage_pct": 100, "blocking": 4, "passed": false, "advised": true }
  ]
}
```

## The state word list

`AWAITING-JUDGE · AWAITING-FIX · AWAITING-RECHECK · PASSED · STALE-PASS ·
MISSING-REVISION · TAMPERED`

Mirrored in `bin/cli.js`'s `CHALLENGE_STATES` and `challengeStateOf()` —
documented drift the token lint cannot see (a word list is not a single token),
covered by a golden test instead. Change both together.

## Ledger v2 (v0.49.1) — additive, and `council: null` is a real state

Every v1 key keeps its name, its meaning and its position. Added:

```jsonc
{
  "version": 2,
  "council": ["reader","contrarian","executor"],   // FROZEN; null on a migrated v1 cycle
  "council_version": 1,
  "opportunities": { "X-002": { "raised_at": 2, "status": "open", "route": "brainstorm", "…": "…" } },
  "premises":      { "Q-001": { "raised_at": 2, "disputes": "goal", "status": "open", "…": "…" } },
  "iterations": [
    { "n": 2,
      "graded_against_council": 1,
      "council": [
        { "lens": "contrarian", "ran": true,  "raised": 6, "adopted": 4, "rejected": 1, "merged": 1, "out_of_goal": 0 },
        { "lens": "outsider",   "ran": false, "reason": "usage limit reached mid-batch" }
      ],
      "council_coverage_pct": 100,
      "findings": [
        { "id": "C-004", "lens": "contrarian", "disposition": "adopted",
          "corroborated_by": ["outsider"], "dimension": "D2", "severity": "P0", "…": "…" }
      ]
    }
  ]
}
```

- **`lens` is required on every finding.** A v1 iteration read back gets `judge`,
  so the per-lens legend never gains a blank column.
- **`council: null` is not "no council".** It means the roster was never
  answered, and `orc challenge record` **refuses the next iteration by name**
  (`council-unset`) until it is. A silent default would be ORC picking the
  council — rule 12.
- **`council_version`** increments on a recorded `recouncil` event, exactly like
  `goals.version` and `template.version`, and the iteration rail draws a THIRD
  version break for it: comparing an iteration judged by three lenses to one
  judged by six is not a comparison.
