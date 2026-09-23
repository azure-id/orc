# W3 — `/orc-quick` (Q1–Q11), measured

Branch `feat/lean-lanes-1.9`. Nothing is committed; the release is ONE commit at
W5. Built against `03-orc-quick-spec.md`, on top of the W2 lines that were
already pulled forward.

## 1. What landed, per spec item

| # | Item | Where |
|---|---|---|
| Q1 | the graph-first dig moved out of the spine | NEW `references/look.md` (107 lines); the spine keeps the call table + the pointer |
| Q2 | recon is the pinned pair, traced and in-flight-visible | landed at W2; W3 added the writes-code marker and the "The suggestion" section |
| Q3 | a defect entry reproduces FIRST | NEW `references/defect.md` (101 lines) · `kind: defect` in Q1 · the `repro` slice line in Q3.1 · the two `REPRO` lines in Q3.2 |
| Q4 | affected tests first, then the suite | Q3.2 (the line was pulled forward at W2; W3 added the runner-takes-no-list rule and the printed shape) |
| Q5 | a blast-radius line in every entry | Q3.2 + `context-doc.md` |
| Q6 | the gate marks `→ suggested`, with its reason | `dispatch-gate.md` "The suggestion" — a four-row table, each row with its reason |
| Q7 | honest timestamps | Q0 step 2 creates `quick-checkpoint.md`; the trace section says the packet is built from it |
| Q8 | `graph_used` checked on every return | Q3.1 |
| Q9 | the lazy `gh` probe | Q0 step 5 |
| Q10 | the ❓/➡️ question shape | Q2a, pointing at `_shared/interview.md` as the canonical primitive |
| Q11 | PR threads get a card each | `gh-mode.md`, a new section before "One gate per thread" |

Also: `README.md` §3/§4/§5/§5b/§10 · `mock-run/orc-quick.md` · `commands/orc-quick.md`.

## 2. The spine

| | Before W3 | After W3 | Budget |
|---|---|---|---|
| `orc-quick/SKILL.md` | 311 (lint) | **325** | **325** |

It is AT the pin, not under it. Getting there took three rounds of moving prose
out rather than shortening it:

- the dig → `references/look.md` (the spine keeps the call table);
- the ❓/➡️ example → `_shared/interview.md`, which already owns that shape;
- the "it is open" and "what this lane is NOT" paragraphs → `README.md` §1–§2,
  which W1 had already written but not yet cut the spine copy for;
- the repair-loop bullets, the `VERIFY` example block and the ledger example →
  one line each.

Nothing was deleted to fit. Everything that left the spine is stated ONCE in the
file that owns it, and the spine keeps the trigger + the contract token + the
pointer, which is the rule the budget exists to enforce.

## 3. Three things the spec did not predict

**1. `references/look.md` may not name `orc graph impact`.** The spec's §2 table
listed `impact` for a blast-radius question. The lint DERIVES a lane's call set
by scanning the lane's whole skill folder for `orc <noun> <verb>` — references
included — so naming it would have added `graph-impact` to orc-quick's
catalogue, which `test/cli/graph-lanes.test.js` asserts is NOT there (quick has
no planner and no declared-file set before the gate). The blast-radius dig uses
`ctx <symbol> --depth 2` and `orc graph coverage` instead, exactly as the W2
spine already did. The recon AGENT still calls `impact` — an agent file is not
in `templates/skills/`, so it is not scanned.

**2. `orc graph gain` had to be catalogued in this wave.** Quick's Q3.4 and
mini's Phase M both name it, and the lint's rule 2 refuses a call two lanes name
that the catalogue does not hold. The new `graph-gain` row carries the three
`never`s that matter: never restate the line as a saving, never drop the word
"estimate" or the range, never block a run.

**3. Quick LEFT the `graph-notes-pending` row.** Q3.4 now runs
`orc graph update --notes-pending --files <actual_files>` — one call that
answers the update and the pending batch — so quick no longer names
`orc graph notes pending`, and the stored `lanes[]` had to drop it or the lint
reports drift by name. Quick did not lose the notes; it stopped paying for a
second call to ask for them. (W4 did the same for mini.)

## 4. One accident, and what it cost

`bin/verify-contracts.js` was reverted with `git checkout --` while trying to
undo a bad scripted edit. That file was UNCOMMITTED, so the revert took W2's
registrations with it — the `repro.required: true` row, the `REPRO` row and the
quick budget pin.

It was fully rebuilt, because the lint is self-describing: it names every
unregistered copy, so `node bin/verify-contracts.js` → register → repeat
reconstructs the table from the payload. The two v1.9.0 rows and the pin were
re-written by hand with their comments. The contract count is back at **208**,
the same number W2 recorded.

**The lesson for W5:** on this tree an uncommitted file has no second copy.
Prefer a scripted edit that is verified before it is written, or a copy in the
scratchpad first.

**A second, quieter accident from the same tooling.** `bin/cli.js` is stored
with **CRLF** line endings; every other file this release touches is LF. A
scripted edit that read the file as text and wrote it back rewrote all 45,500
lines to LF — `git diff --stat` showed 90,980 changed lines for two real edits.
It was converted back and the diff is 76/16 again. **Read and write `bin/cli.js`
as BYTES**, or check `git diff --stat` after every edit to it. W5 touches it
again for the version bump.

There is no `.gitattributes` in this repo, so nothing normalises this for you.

## 5. Tests

`test/cli/graph-lanes.test.js` gains five:

1. **each lean lane's detail lives in its own reference** — the three new files
   exist, each spine points at them, and `complexity.md` still carries all four
   thresholds with their numbers.
2. **a defect reproduces red before it is fixed** — `kind: defect` and
   `REPRO red` in the spine; `repro: none`, the no-fake rule and the
   who-writes-it rule in `defect.md`.
3. **the gate suggestion is a recommendation** — the section exists, the
   nothing-runs-until-you-answer line survives, and the marker is stated as not
   a pre-selection.
4. **the gain line is catalogued for exactly the lanes that print it** — two
   lanes, canonical file, free, and both `never`s present.
5. **mini passes wiki POINTERS** (W4's half, asserted here beside the rest).

## 6. Gates

- `npm run verify` — green (40 skills · 51 agents · **208** contracts).
- Spine 325 / 325 — at the pin.
- `npm test` — **1110 passed · 0 failed · 1113 tests · 74 files** (W2 baseline
  1105 / 1108). Both waves were measured together at the pause; see
  `W4-mini.md` §6.
