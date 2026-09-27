# Shared contract — Gotchas (repair memory that outlives the run)

Canonical file: `_shared/gotchas.md`. THE one description of ORC's repair memory:
what a gotcha is, where it lives, when one is recorded, when one is injected, and
which lane may do which. Gate: config `gotchas` (`on` | `off`, default `on`).

## 1. What a gotcha is

**ONE project-specific failure that a repair in this project already solved.**
Not a rule, not a preference, not a lesson in general.

It is deliberately none of the other three knowledge artifacts:

| Artifact | Answers | Not this |
|---|---|---|
| the wiki | "what IS this codebase" | a gotcha is not a fact about the code |
| the pattern cache | "how does this project WRITE code" | a gotcha is not a convention |
| `tdd_spec` | "what must this change PROVE" | a gotcha is not an acceptance test |
| **gotchas** | **"what has this project already gotten WRONG here"** | — |

If a finding fits one of the first three rows, it belongs there. A gotcha is the
residue of a repair: something went red, a specific cause was found, a specific
fix made it green.

## 2. The artifact

```
.claude/orc/gotchas.md            # live entries, capped at gotchas_max
.claude/orc/gotchas-archive.md    # evicted entries — never hard-dropped
```

Both sit BESIDE the pattern cache (`orc/patterns/`), never inside it. Like every
file ORC generates under `.claude/orc/`, neither is in the install manifest — so
`orc update --prune` can never delete them and `orc update` never overwrites them.
They are user data by ORC's own rules.

**Entry format** — the parser and every writer depend on this exactly:

```markdown
## G-014 · express · repair
- trigger:   adding a route handler that awaits a Mongoose query
- symptom:   Cannot read properties of undefined (reading 'session') in tests
- cause:     the test harness stubs req.session only for authed routes
- fix:       register the route under authedRouter, not app
- scope:     src/routes/**/*.js
- origin:    run-orc-add-billing-050826-141233 · TDD repair round 2
- hits:      3
- last_seen: 05-08-2026
```

- Heading: `## G-<3-digit id> · <lang-or-area> · <kind>`; `kind` ∈
  `repair | drift | review | verify`.
- Field order is FIXED. Every field is required. Values are single-line.
- `scope` is a glob matched against a task's `declared_files`.
- Dates are `DD-MM-YYYY` (the repo's convention).
- IDs are monotonic; **never reused**, even after archival — an archived gotcha
  stays traceable from a trace or a run doc that cited it.

## 3. Existence probe (never a `find`)

```
orc gotcha status     exit 0 = one or more live entries · exit 1 = none
orc gotcha list       the same contract, and prints the entries
orc gotcha prune      archive the low-value tail down to gotchas_max
```

**The exit code IS the contract**, same convention as `orc pattern status <lang>`
and `orc diy status`. `.claude/` is a hidden directory, so an ad-hoc `find`/glob
false-negatives from the wrong CWD or when it skips dot-dirs — the same reason
`detecting-artifacts.md` exists for the wiki and the pattern cache. Probe once,
treat the result as the source of truth, and never second-guess a positive probe.

## 4. When one is RECORDED

At phase close, **when and only when a repair loop went red → green**:

- the TDD repair loop turned a failing `tdd_spec` test green;
- a `DRIFT-FROM` recovery round resolved the drift;
- a reviewer P0/P1 that THIS SAME RUN fixed;
- a verifier `unmet[]` entry that THIS SAME RUN closed.

**A loop that hit its cap and STOPPED records NOTHING.** An unsolved failure is
not a gotcha — it is an open problem, and the honest red report is where it
belongs. Writing one anyway would seed the memory with advice that never worked.

Nothing else records. A first-try success has no repair to remember; a green
`regression-guard` test proved something, but it was never red.

## 5. Who writes it

Three parties, and they do not overlap:

1. **The agent RETURNS the body** in `gotcha_recorded` (see
   `return-validation.md` §7) — either the entry fields or `none` + a one-line
   reason. The agent that did the repair is the only party that knows the cause.
2. **The ORCHESTRATOR hands it to `orc gotcha add -`** (§10), at the same
   phase-close point where it dispatches the trace packet. **A subagent never
   writes either gotcha file.**
3. **The CLI owns counting, capping and archival** (`orc gotcha prune`) —
   deterministic bookkeeping, never a model's judgement.

## 6. Dedupe (before every append)

`orc gotcha add` does this; the rule is written here so a person can check it.
Compare the returned `symptom` + `scope` against the live entries. A match:
increment `hits`, refresh `last_seen`, and **append nothing**. Only a genuinely
new failure gets a new ID. Without this the file grows one duplicate per run and
the injection cap fills with the same entry three times.

## 7. When one is INJECTED

Into an executor slice, **filtered by the `scope` glob against that task's
`declared_files`**.

- **NEVER inject unfiltered.** An unfiltered injection is the exact failure mode
  that turns this feature into the bloat it exists to prevent.
- Cap **3 entries per slice**, highest `hits` first.
- **Zero matches = no gotcha block at all** — not an empty one. An empty block
  costs tokens and says nothing.

The block rides beside `pattern` in the slice, and like `pattern` it is injected
LITERALLY, never as a file pointer.

## 8. Who reads it

- **Phase 1 preflight** — one line, never silent (see
  `../orc/references/preflight-report.md`).
- **executor slices** — filtered, capped, per §7.
- **the reviewer** — the matching entries as a checklist: has this change
  reintroduced a failure this project already paid for?
- **`/orc-retro`** — read-only calibration input. It never writes one.

## 9. Staleness is the user's job

An injected gotcha is presented to an executor as **fact**. Nothing in ORC
re-verifies that it is still true — `orc gotcha prune` handles CAPACITY, not
correctness.

So, plainly: **delete an entry that stopped being true.** Open
`.claude/orc/gotchas.md` and remove the block. That is the whole procedure, and
it is deliberately manual — a model deciding which of its own memories to forget
is a worse failure mode than a stale line a human can read.

## 10. Lane policy (v2.0.0 — who reads, who records, and where)

| Lane | Reads | Records (an observation; promotion is computed) |
|------|-------|-------|
| `/orc`, `/orc-ultra` | match (executors) · card (Phase 5 reviewer, Phase 6 verifier, ultra gate 3) · filter (after Phase 5) | repairs (via `add`) · every Phase 5 finding's outcome · defect repros |
| `/orc-mini` | match · card (when the risk option dispatches the reviewer) · filter | repairs · a smoke-gate repair round that went green · reviewer outcomes |
| `/orc-fast` | match | nothing |
| `/orc-quick` | card for the review offer · match for code dispatches | a defect repro red → green · a PR thread taken and fixed · a Sonar/SARIF item fixed · a CI failure fixed · a review-offer P0/P1 fixed · a finding the user disputed |
| `/orc-verify` | card (its adversarial pass) | nothing — read-only lane stays read-only |
| `/orc-pr-driver` | card at the per-layer gate | a green-gate lint/seam fix |
| `/orc-diy` | compile-owned (`gotchas` flow key) | compile-owned |
| `/orc-retro` | yes | no (read-only by contract) |

The `gotchas` key (`on` | `off`) now gates ONLY the executor block
(`orc gotcha match` exits 4 under `off`). The reviewer card has no off answer
(review learning is always on); `gotcha_card_budget` is only its size.

### How a lane records — ONE CLI call, where it already writes

- **An observation:** `orc gotcha observe - --json`, stdin ONE JSON object:
  `source` (`repair` · `drift` · `review` · `verify` · `defect` · `ci` · `pr` ·
  `sonar` · `sarif` · `dismissal`), `ref` (unique per event, e.g.
  `<run> · F3` — the same `ref` REPLACES the earlier line), `outcome`
  (`addressed` · `disputed` · `wontfix` · `open` · `flaky`), `author` (`orc` ·
  `human` · `bot`), `rule` or `sig` (the finding text), and when known
  `category`, `severity`, `path`, `lines`, `run`, `gotcha` (the `G-###` the
  finding cited). Exit 0 = appended and promotion ran · 2 = malformed: say it
  once and go on. **It never blocks a run.** The CLI alone writes
  `.claude/orc/observations.jsonl`; a lane never edits it.
- **A red → green repair:** the `gotcha_recorded` body goes to
  `orc gotcha add -` (exit 0 added · 3 bumped an existing entry · 2 malformed).
  The CLI dedupes, assigns the id and writes the entry. Nobody appends by hand.
- **The outcome is PROGRAMMATIC**, never a model's opinion: the flagged lines
  changed before ship = `addressed`; the user said "not a problem here" =
  `disputed`; declined with no reason = `wontfix`; none of these yet = `open`.

### Review close — the same step in every lane that ran a review

After `review-slice.md` §3 and the fixes: ONE observation per finding
(`source: review`, `author: orc`, the outcome above, `gotcha` when the finding
cited one), then ONE trace line:
`FINDING-OUTCOME addressed=<n> disputed=<n> wontfix=<n> open=<n> pre=<n> suppressed=<n> :: <cat>:<addressed>/<total>,…`.
Where: `/orc` and `/orc-ultra` at Phase 7 (`phases/summary.md`), `/orc-mini`
after the risk option's review, `/orc-quick` after the review offer. A review
with zero findings records nothing and is a HEALTHY answer.

### Per-lane mechanics (the spines keep the trigger; this is the detail)

**`/orc-mini` — reads AND writes, trimmed to one row.** Phase 1: probe
`orc gotcha status` and print exactly one of `gotchas: <n> known · <m> match` /
`none yet` / `off` — never silent. Phase 3: inject the scope-matching entries into
the single executor slice beside the pattern (cap 3, highest `hits` first; zero
matches = no block, NEVER unfiltered). After the return: pipe a
`gotcha_recorded` body to `orc gotcha add -` (a match on `symptom`+`scope`
bumps `hits`/`last_seen`). A capped-and-stopped loop records nothing. A
smoke-gate repair round that went green records `source: repair`. When the
risk option ran the reviewer, record its outcomes as "Review close" says.

**`/orc-fast` — reads only, and gains no third prerequisite.** Its two hard gates
(a FRESH/AGING wiki + a cached pattern) are its entire design; a missing gotchas
file is never a reason to fall back, and gotchas here are purely additive: probe,
inject the scope-matching entries into the F2 slice, and stop there. It never
writes one, because one executor plus one repair round is too little signal to
attribute a cause — and a lane with no analyst writing repair memory is how that
memory fills with guesses.

**`/orc-quick` — reads and records, since 2.0.0 (a deliberate reversal).**
Record at step 3.3, after entry N is appended, and only for a request with
programmatic proof: a defect entry with `REPRO red` then `REPRO green`
(`source: defect`, `reproduced: true`) · a PR thread the request took and fixed
(`source: pr`) · a Sonar or SARIF item fixed (`source: sonar` / `sarif`) · a CI
failure fixed (`source: ci`) · a review-offer P0/P1 fixed (`source: review`,
`addressed`) · a review finding the user called "not a problem here"
(`source: review`, `disputed`). A plain fix with none of these records nothing.
Why the reversal: quick is where most of the fixes happen, so a memory that
skips it never learns; a PR thread is a human's judgement and a red → green
repro is proof, so the v1 "too little signal" objection does not apply; and the
card and `observe` are CLI calls — the CLI reads the `gotchas` key, so Q0 still
reads `log_dir` and no other config key itself.

**`/orc-pr-driver` — the card is advice only.** A rung that went red and then
green after a lint or seam fix records `source: repair` (`ref`: the layer and
the rung). The gate itself stays build · tests · lint · hooks.

**`/orc-verify` and `/orc-retro` never record.** Both are read-only by contract.
