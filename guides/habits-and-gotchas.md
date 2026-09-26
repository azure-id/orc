# Habits and gotchas

Two kinds of memory came in ORC 2.0.0. **Habits** remember how YOU answer ORC's
questions. **Gotchas** remember what THIS PROJECT already got wrong. Both are
computed by the CLI from files on your disk, with no model.

---

## Habits

### Turn it on

```bash
orc config set habits observe    # count your answers, propose nothing
orc config set habits propose    # also ask ONCE at the end of a run
orc config set habits off        # the default: nothing is read, nothing changes
```

`off` costs zero tokens. The lanes write no `ASK` line, and
`orc lane config --json` has no habits field.

### How a habit is proposed

1. Each answered question writes one `ASK` line into the run's trace. It
   records the options, the answer and how it was given (`by=user`,
   `ledger`, `learned`, `config` or `default`). Your own words are never
   stored: a free answer is `chose=other`.
2. `orc habit show` groups the answers per question and per context (for
   example the branch kind).
3. An answer becomes a **proposal** when all of these are true:
   - at least 5 answers at full weight;
   - a Wilson lower bound (95 %) of 0.55 or more;
   - the last 3 answers are the same.
   Recent answers count more. An answer the lane pre-selected counts a
   quarter. A value from `config` or a lane default does not count at all.
4. Under `propose`, ORC adds at most ONE proposal to the questions that the
   lane asks at the end of a run: **yes · not now · never**.
5. Nothing is applied without your yes. There is no automatic level.

### The three classes

| Class | What a habit can do | Examples |
|---|---|---|
| `apply` | set a config key at the `learned` rank — **toward the careful side only** | `review_before_push: on`, `mini_tdd: on`, `quick_update_tests: on` |
| `suggest` | put your usual option first with `→ usual (<n> of <m>)`. The question is still asked | how to ship, the review offer in `/orc-quick`, analysis depth |
| `never` | nothing | an unknown question point |

A dispatch gate is asked every time. A habit to skip a review, to drop TDD or
to continue on a stale wiki is never applied. `deep` analysis needs your yes
every run.

### Where a habit sits

An accepted habit is the `learned` rank: below your `.claude/orc.config.yaml`
and above the shipped default. `orc config set` always wins, and
`orc config list` shows `source: learned:H-…` for a key a habit set.

### Stale habits

A habit is stale after 2 overrides in your last 3 answers, or after 90 days
without use. ORC then asks again at the end of a run. A declined habit can come
back only after 10 more answers AND 14 days. `never` stops it for good.

### Commands

```bash
orc habit show [--lane L] [--window 30d|90d|all]   # your usual answers
orc habit log [--states]                           # the last answers, with by=
orc habit points                                   # every question point and its options
orc habit why <H-id|qid>                           # the ASK lines behind a habit
orc habit accept <H-id> | decline <H-id> [--never]
orc habit forget <H-id>                            # undo: back to asking
orc habit reset <H-id> | doctor | export | purge --yes
orc habit repo [accept|decline|forget <id>]        # soft preferences from git history
```

`orc habit repo` reads your git history for commit, branch and test naming. A
preference is proposed only at a share of 0.8 or more over 20 samples or more.
An accepted one goes into the rules card as a LEARNED preference, below your
own `.claude/orc/rules.md`.

`orc ui` ▸ **Behaviour** shows the same data, with the buttons the CLI allows.
A `never` habit has no button — only the command.

---

## Gotchas

### What an entry is

`.claude/orc/gotchas.md` holds entries like `G-017`: a trigger, a symptom, a
cause, a fix and a scope. A v1 file stays valid. 2.0.0 can add nine optional
fields (source, rule, category, cwe, severity, polarity, evidence, helpful,
harmful), and ORC 1.9.2 can still read the file.

### Where observations come from

Every finding becomes an **observation** in `.claude/orc/observations.jsonl`
first. The sources:

| Source | Command | Notes |
|---|---|---|
| a red → green in a lane | (the lane records it) | with a reproduction, it promotes at once |
| an ORC review | (the lane records it at review close) | measured; the outcome of each finding is kept |
| SARIF 2.1.0 (ESLint, Semgrep, …) | `orc gotcha import sarif <file>` | suppressed results are skipped |
| Sonar | `orc gotcha import sonar [--pr N \| --branch B]` | `sonar_url`, `sonar_project`, `sonar_org`; the token comes from `SONAR_TOKEN` only |
| PR review threads | `orc gotcha import pr <n>` | people only; a bot is measured, never mined |
| closed defects | `orc gotcha import issues [--label bug]` | a defect with a closing PR |

`orc gotcha sync` runs every source that is available. It reads only what is
new, it has a time limit, and it runs again when the last sync is older than
`gotcha_sync_hours` (6). No importer writes to GitHub.

### How an observation becomes an entry

A candidate is promoted on ONE of these:

- a red → green inside a lane, with a reproduction;
- a miss: an ORC review read the lines and did not flag them;
- a security finding with a CWE tag or a HIGH/BLOCKER impact (one case);
- 3 addressed cases in 2 PRs within 90 days.

`orc gotcha list --candidates` shows what is close, and what it still needs.
`orc gotcha accept <C-id>` promotes one by hand. Two disputes make a proposed
**suppression**: advice the reviewer should stop giving.

### The reviewer card

`orc gotcha card --files <csv>` is what the reviewer gets: the entries that
match the files under review. Its size is `gotcha_card_budget` (600 tokens,
at least 200). It is always on. An entry that does not fit is counted in the
header, never dropped in silence.

`orc gotcha filter` removes suppressed, folded and noisy advice from a
review's findings. It never removes a P0 or a P1. `orc gotcha quality` shows
the acceptance per category after five reviews.

---

## How to undo

| You want to | Do this |
|---|---|
| stop all habit learning | `orc config set habits off` |
| drop one habit | `orc habit forget <H-id>` |
| never be asked about it again | `orc habit decline <H-id> --never` |
| delete what ORC computed from your traces | `orc habit purge --yes` (your traces stay) |
| undo what a run changed | `orc undo --run <slug>` prints the commands; add `--apply` to run them |

Your data files (`habits-state.json`, `habits-cache.json`,
`observations.jsonl`, `gotchas-sync.json`) are never in the install manifest.
`orc update`, `orc update --prune` and `orc doctor --fix` keep them.
