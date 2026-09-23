# Trim — the descriptions, the command files, the spines

Written 19-09-2026 in Simplified Technical English. This is W1 of `02-PLAN.md`.
It runs BEFORE the additions in `03` and `04`, so the additions land in a spine
that already fits.

## 1. Descriptions

### 1.1 The rules (from `01-research.md` §5.1)

- Every skill's description loads into every session. 33 skills → 22,496 chars
  today (~5,600 tokens per session).
- Cap: 1,024 chars (Agent Skills spec); Claude Code truncates the listing at
  1,536 with `when_to_use`.
- Third person. What it does AND when to use it. Put the key use case first.
  Concrete trigger phrases. No mechanics, no internal names, no "the
  orchestrator never …".
- Keep every trigger phrase that exists today, word for word.

### 1.2 `orc-quick` — 619 chars → the new text

**Now (619 chars):**
> Standalone quick lane — ask for anything, get it done in few steps. Use for "/orc-quick", "quick fix X", "quickly find out how Y works", "fix the review comments on PR N". Not only for code: a fast context dig, a defect hunt, a dependency bump, or a PR comment all run the same way. Three steps per request: look (silent) → ask once → do. It ALWAYS asks you which agent to dispatch. Every request is saved as a numbered entry in orc-quick/<slug>/quick-context.md so you can read it later or in another session. Standalone: no config can change how it dispatches. The orchestrator never does the work itself — it spawns.

**New (326 chars, measured 19-09-2026; target ≤ 330):**
```yaml
description: >
  Quick lane for one small job: a fix, a bug hunt, a dependency bump, a
  "how does X work" answer, or PR review comments. Use for "/orc-quick",
  "quick fix X", "quickly find out how Y works", "fix the review comments
  on PR N". It looks, asks once (questions plus which agent to dispatch),
  does the job, and saves a numbered entry.
```

(A first draft with "at a time", "here" and "the review comments on a PR"
measured 355 — over the target. Every trigger phrase survived the cut.)

What left and why: "Standalone", "no config can change", "never does the work
itself" are contracts, not triggers — they live in the spine. The file path is
in `context-doc.md`. "Three steps" is in the command file.

### 1.3 `orc-mini` — 493 chars → the new text

**Now (493 chars):**
> Lightweight ORC for fast implementation. Use for "use orc-mini to implement X" or "/orc-mini". Same intake → intent-spec → planning → dispatch → smoke-gate → ship spine as the full orchestrator, but SKIPS full code review, verification, and the summary phase. Dispatches ONE Sonnet 5 high-effort subagent for implementation, then runs a build+test smoke gate (blocks ship on red) and offers opt-in test authoring. Switchable to full flow mid-run. The orchestrator never implements — it spawns.

**New (294 chars, measured 19-09-2026; target ≤ 300):**
```yaml
description: >
  Lightweight build lane: light intake, a mini planner, ONE Sonnet 5
  executor, a build+test smoke gate, ship. Use for "/orc-mini", "use
  orc-mini to implement X", or a small change that needs a plan but not a
  full review. Skips review, verify and summary; can switch to the full
  /orc flow mid-run.
```

### 1.4 Measure, then pin

W1 measures both with the same script W0 used (strip `\r`, join the folded
block, count). Record the counts in `findings/W1-trim.md`. A new payload test
holds every skill at ≤ 1,024 and these two at ≤ 350 (headroom for a trigger
phrase added later).

### 1.5 Rejected: `when_to_use`

Same 1,536 cap, appended to the description in the listing, so it saves
nothing. One field travels through `orc export`'s SKILL bundle; two would need
the exporter to learn a field. The trigger phrases fit in `description`.

## 2. Command files

### 2.1 `templates/commands/orc-quick.md` — 1,667 bytes → ~600

```markdown
---
description: Quick lane — look, ask once (questions + which agent), do. One numbered entry per request
---

Use the **orc-quick** skill. Three steps per request, one user turn:

1. **LOOK** (silent) — the graph first, then the files; PR comments if it is PR work.
2. **ASK** (one turn) — up to 3 grounded questions **plus** the dispatch gate. It
   always asks which agent. A suggestion is marked; nothing runs until you answer.
3. **DO** — dispatch, check the return, run the tests that reach the change then
   the suite, write the numbered entry, then offer tests / review / commit.

A bug report is reproduced red before it is fixed. Too big → an **offer** of
`/orc-mini`. `gh` is read + push only. Another request becomes entry 2, 3, 4 …
in the same doc.

Request (or `pr <n>`, `thread=<name>`): $ARGUMENTS
```

### 2.2 `templates/commands/orc-mini.md` — 587 bytes → ~450

```markdown
---
description: Lightweight orchestrator — one Sonnet 5 executor, a smoke gate; skips review/verify/summary
---

Use the **orc-mini** skill: light intake (Q1–Q4, soft sign-off), a mini planner,
ONE Sonnet 5 high executor, then the build+test **smoke gate** (blocks ship on
red) and the opt-in test-authoring ask. The complexity line prints its evidence
and offers the full flow when the change is wider than one area.

Request: $ARGUMENTS
```

## 3. Spine trim maps

Rule: a fact lives in one file; the spine keeps the trigger, the contract
tokens, the phase order and the pointer (knowledge §4k). Every removed passage
is already in a reference, or moves there in the same edit.

### 3.1 `orc-quick/SKILL.md` — 379 lines

| Section (today) | Action | Est. lines |
|---|---|---|
| "It is open — almost any request works" (list + rule) | keep the rule paragraph; cut the six-item list to one line (the README §1 has it) | −6 |
| "It is fewer steps than every other lane" (table) | one sentence: "Three steps per request, one user turn. Fewer than any other lane." | −10 |
| "What this lane is NOT" | one line + pointer to `README.md` §2 | −8 |
| "Nothing can override this lane" + the `## Config` second paragraph | ONE block under `## Config`: the inert list (the payload test needs `These config keys **do nothing here**` and the four key names), the `extra_enabled` "third option" sentence, the announce-at-the-gate line; pointer to `dispatch-gate.md` rule 4 | −8 |
| Q0 step 3 "Knowledge probes" | keep the two probes and "helpful extras" in 4 lines; the framework-key note stays (it prevents exit 2) | −3 |
| Q1 "The dig" | replaced by the graph-first block (`03` §2) + pointer to `references/look.md` | −4 net |
| Q2 b. the gate table | the two-line rule ("ask before every dispatch; the menu is in `dispatch-gate.md`") + the kinds in one line; the table stays in `dispatch-gate.md` | −10 |
| Q3 3.2 the repair-loop example block | keep the four rules (rounds 1–2 reuse, 3 asks, trend after 3, tests never loop); cut the 8-line example (it is in `dispatch-gate.md` and README §7) | −10 |
| Q3 3.4 stop-while-red example | one line + the two commands | −5 |
| "The doc it writes" | three lines + pointer (`context-doc.md` has the shape) | −6 |
| "Rules this lane always keeps" | keep | 0 |
| Behavior trace / Config / Rules / Calls / Waiting | keep (pinned tokens live here) | 0 |
| **Additions from `03`** | Q0 lazy `gh` + record (+3) · Q1 graph block (+9) · Q2 marker + recon lines (+6) · Q3 `graph_used`/`repro` check (+3) · affected-first + blast radius (+8) · update/notes/gain order (+4) · trace verbs (+2) | +35 |
| **Result** | 379 − 70 + 35 | **≈ 344** |

344 is over the 320 target in `02-PLAN.md` §2. Two more cuts bring it under:
the "## It is open" section collapses into the opening paragraph (−6), and the
Q1 "PR work (read only)" paragraph moves to `gh-mode.md` with a one-line
pointer (−6). If W3 still lands above 320, the pin is set at the achieved size
+ 5 with its comment, never above 335 — a spine that grows past its own
references has moved prose the wrong way.

**Pin:** `{ file: "skills/orc-quick/SKILL.md", maxLines: 325 }` with the
comment: *"v1.9.0: first pin. 379 → <achieved> after the dedupe (repair loop,
gate table, inert list, doc shape each stated once) and the graph-first look."*

### 3.2 `orc-mini/SKILL.md` — 268 lines, budget 270

| Section (today) | Action | Est. lines |
|---|---|---|
| "Differences from the full orchestrator" items 4–6 | tighten to one line each; item 6 ("everything else is identical") one line | −4 |
| "Mini flow (the phase set)" block | keep — it IS the phase order | 0 |
| "Postgres query grounding" paragraph | two lines (the probe, the HIT/MISS rule) | −4 |
| "Gotchas" paragraph | keep the trigger line + `.claude/orc/gotchas.md` + pointer to `gotchas.md` §10 | −2 |
| "Phase X — Mock example" | two lines + pointer to `drift-recovery.md` (keep `mock-examples/<change-slug>/`, the `ask` MANDATORY-offer rule, `DRIFT loop=<n>`) | −5 |
| "Phase T — Test-authoring ask" | three lines (keep `test-generator/<change-slug>/`, the never-runs rule, the path validation) | −4 |
| "Fallback intake" + "Switching to full flow" | one paragraph each of two lines (keep `FALLBACK-FROM`) | −4 |
| "Analyst & planner (mini lane)" | keep the gate list (tokens: `git_head`, `disposition`, `spec_invariants`); cut the second sentence of the first paragraph | −2 |
| "Wiki consult" | rewrite as the pointers rule (`04` §3) — same length; keep `orc-reference-api-surface`, `crosslink/needs.json`, `WIKI-CONSULT`, `AGING`, `wiki-meta.json`, `code > fresh wiki` | 0 |
| "Shared artifacts" + "What mini still enforces" | merge to four lines | −3 |
| **Additions from `04`** | Phase 0 map + ctx cross-check (+3) · `graph_facts` (+3) · exit gate batch (+2) · complexity line + thresholds pointer (+6) · Phase M affected-first + blast radius + changes option (+7) · `none` recorded (+2) | +23 |
| **Result** | 268 − 28 + 23 | **≈ 263** |

Fits 270 with 7 lines of headroom. If the achieved number is above 270, raise
to **280** with the comment: *"v1.9.0: deliberate raise 270→280 — the evidence
complexity line and the smoke gate's affected-tests step. Both are decisions
the spine makes before any reference loads."*

## 4. The pinned tokens (must survive every edit)

From `bin/verify-contracts.js`, 19-09-2026. A missing one fails
`npm run verify` by name.

Derived by walking `bin/verify-contracts.js` and attributing each
`"skills/<lane>/SKILL.md"` entry to the nearest preceding `token:` line; the
lint was green (192 contracts) on the same tree. Re-derive at W0 with the same
walk — the table moves with every release.

**`skills/orc-quick/SKILL.md` (25):**
`.current` · `P0|P1|P2|P3` · `WIKI-CONSULT` · `` `GATE `` ·
`a lane that re-dispatches over a live attempt` ·
`a lane that waits without a hand-back` · `actual_model` · `code > fresh wiki`
· `code-graph.md` · `detecting-artifacts.md` · `house_rules` ·
`invariants_checked` · `opus5-only.md` · `opus5_only` · `orc extra role` ·
`orc lane calls` · `orc lane config` · `orc run inflight` ·
`orc-graph-noter-sonnet-4-6-med` · `rules_card` · `touch the trace file` ·
`unmet[]` · `wiki-meta.json` · `zero new trace lines is a protocol violation`
· (`orc lane phases` rides in the `## Phases` pointer, checked by the manifest
test rather than a token row)

**`skills/orc-mini/SKILL.md` (42):**
`.claude/orc/gotchas.md` · `.claude/orc/run` · `.current` · `AGING` ·
`DRIFT-FROM` · `FALLBACK-FROM` · `SUBSTITUTION` · `TDD-RED` · `WIKI-CONSULT` ·
`` `GATE `` · `a lane that re-dispatches over a live attempt` ·
`a lane that waits without a hand-back` · `code > fresh wiki` · `code-graph.md`
· `crosslink/needs.json` · `detecting-artifacts.md` · `disposition` ·
`drift-recovery.md` · `facets` · `git_head` · `gotcha_recorded` · `graph_used`
· `house_rules` · `mock-examples/` · `mock_example` · `opus5-only.md` ·
`opus5_only` · `orc extra reconcile` · `orc lane calls` · `orc lane config` ·
`orc run inflight` · `orc-reference-api-surface` · `orphan` · `rules_card` ·
`spec_invariants` · `tdd_loop_max` · `tdd_spec` · `test-generator/` ·
`touch the trace file` · `unmet[]` · `wiki-meta.json` ·
`zero new trace lines is a protocol violation`

Every token above appears in its spine today. A trim keeps each one at least
once, in a sentence that still means what the contract means. The `05` §3
tables were written against this list: no removed passage is the only holder
of a token.

**Phrases pinned by tests** (regex or substring, `test/payload.test.js`,
`test/cli/graph-lanes.test.js`, `test/cli/lane.test.js`):
- quick: `These config keys **do nothing here**` · `extra_resume` ·
  `extra_on_failure` · `opus5_only` · `rubric_bands_override` · `third option`
  · `` this lane still reads `log_dir` and\s+nothing else `` ·
  `orc graph status --if-enabled --heal --json` · `code-graph.md` ·
  `house_rules` + `rules_card` · the four `## Q0 …## Q3` headings.
- mini: every TDD disposition name (`new-surface`, `behavior-change`,
  `covered-by-existing`, `no-behavior`, `no-runner`) · `risk[]` · no `stacked_pr`
  · `orc extra reconcile` + `RESUMED, never re-done` · never the sentence
  `a lane that re-does work the worktree already contains` (canonical prose
  stays in `_shared`) · `orc graph status --if-enabled --heal --json` ·
  `code-graph.md` · `house_rules` + `rules_card`.
- both: `a lane that re-dispatches over a live attempt` · `touch the trace file`
  · `zero new trace lines is a protocol violation` · `a lane that waits without
  a hand-back` · the `## Calls` and `## Phases`/trace pointer sections.

## 5. Budget arithmetic (checked at each wave)

| Spine | Baseline | After W1 (trim only) | After W3/W4 (additions) | Pin |
|---|---|---|---|---|
| `orc-quick/SKILL.md` | 379 | ≤ 300 | ≤ 320 | **325** (new) |
| `orc-mini/SKILL.md` | 268 | ≤ 245 | ≤ 268 | 270 (unchanged), else 280 with comment |

The 1.8.2 gain line is counted in the baseline if it shipped (mini 271 → the
pin was already raised there; read `BUDGETS` at W0 and correct this table).

## 6. The new payload test (W1)

```js
test("no skill description exceeds the spec cap, and the lean lanes stay short", () => {
  for (const d of skillsWithFrontmatter()) {
    const desc = foldedDescription(d);            // strip \r, join the > block
    assert.ok(desc.length <= 1024, `${d.name}: ${desc.length} chars`);
  }
  for (const lane of ["orc-quick", "orc-mini"])
    assert.ok(foldedDescription(lane).length <= 350, lane);
});
```

It guards the whole constellation, not only these two files, because the cost
it measures is paid by every session.
