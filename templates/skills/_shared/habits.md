# Shared contract — habits (the lane side, read ON DEMAND)

Canonical file: `_shared/habits.md`. **Read it ONLY when the
`orc lane config <lane> --json` answer has a `habits{}` block.** No block means
`habits: off` (the default). Then the lane emits NO `ASK` line, shows NO
suggestion, prints NO habits line and makes NO proposal, and every `(H <qid>)`
mark in a spine or phase file means nothing. Off costs zero tokens.

The CLI owns the rule (`orc habit`, `bin/habit.js`). The lane reads `habits{}`,
shows what it says, and records each answer. **Nothing is applied without a
yes.** `orc habit points --json` lists every qid and its option ids.

## 1. Preflight — one line

Print `habits.line` VERBATIM with the other preflight lines. A learned key
(`habits.learned[]`) is already resolved into `effective` at the `learned`
rank, and its line is already in `announce[]` — print it like every other
announce line. Do not re-derive it.

## 2. At each question marked `(H <qid>)`

**Never ask what is already answered.** The request said it (the intent
ledger), a config key set it, or a learned key answers it → do not ask. Use
that answer, say it in one line, and record `by=ledger|config|learned`.
`orc stats --json` → `questions{}` counts the questions asked per run, per lane
and per point, so each extra question shows.

1. **Suggestion.** A `habits.suggestions[]` row with this `qid` (and a `bucket`
   that matches this question's ctx) → put its `option` FIRST and add its `mark`
   (`→ usual (<count> of <total>)`) beside it. It is a recommendation, never a
   pre-selection. **The question is still asked.** Under `observe` the CLI
   sends no suggestion.
2. **Learned key.** A `learned[]` row answers the key of this qid → do not ask;
   use its value and say so in one line. The user can still override it.
3. **Record.** Put ONE `ASK` event in the phase packet (grammar:
   `trace_grammar` → `ASK`, `./phases/trace-verbs.md`):
   `ASK <qid> :: offered=<o1|o2|…> rec=<o|none> chose=<o|other> by=<…> [pre=<o>] [ctx=<k=v,…>]`
   - `offered`, `rec`, `chose`, `pre` are option ids from `orc habit points`.
     An answer in the user's own words is `chose=other`. **Never store the
     words.**
   - `by`: `user` answered it · `ledger` the request said it up front ·
     `learned` a learned key or a `→ usual` pre-mark answered and the user
     kept it · `config` a config key answered and the question was not shown ·
     `default` the lane default answered and the question was not shown.
   - `pre=<o>` only when an option was pre-marked or pre-selected.
   - `ctx` only with what the lane knows: `branch=main|feature|fix|release|other`,
     `kind=feature|defect|pr|read|refactor`, `size=s|m|l`, `risk=none|cited`.
     Never guess a missing key.

## 3. Run end — at most ONE proposal

`habits.proposal` is set → add its `line` to the EXISTING end-of-run batch. One
line, no new turn. Run the command the answer names — it is part of the
`lane config` answer, so it is an allowed call:
yes → `proposal.yes` · keep asking (a re-ask) → `proposal.keep` ·
later / not now → `proposal.later` · never → `proposal.never`.
A `null` command is an answer that is not offered. Put `proposal.trace` in the
last packet with `chose=` filled in. No proposal → say nothing.
The end-of-run batch per lane: `/orc` and `/orc-ultra` the Phase 8 completion
report · `/orc-mini` the end-of-run batch · `/orc-fast` the F4 ship offer ·
`/orc-quick` the Q3 offers · `/orc-analyze` the Phase F choice · `/orc-diy` the
compiled flow's last phase. `/orc-wait` makes no proposal.

## 4. Lane notes

- **`/orc-quick`.** The dispatch gate is asked EVERY time. A habit only fills
  its `→ suggested` line (Q2b), with the CLI's numbers as the reason.
  `review_before_push` and `quick_update_tests` touch the OFFERS after the work,
  never the gate. A `quick.q3.offer.review` suggestion of `review-first` makes
  offers 2 and 3 ONE offer: *review → then commit (your usual, 9 of 10) ·
  commit without review · stop*. The review is a dispatch, so its gate is still
  asked. ctx: `kind`, `branch`.
- **`/orc-mini`.** A learned `mini_tdd: on` → intake does not ask the TDD
  question; its `announce[]` line names the habit and its undo. A habit
  toward `no` is a pre-mark only, never applied. A learned
  `review_before_push: on` → the end-of-run batch ALWAYS carries option *a*
  (dispatch `orc-reviewer-opus-5-med` on the diff), marked `→ usual`, even with
  no `risk: high` row. Record `any.ship.review-before-push` whenever option *a*
  is offered: `chose=review` when the user takes it, else `push`.
- **`/orc-fast`.** `fast.f0.stale-wiki`: a habit NEVER suggests `continue`
  (a stale wiki is a risk the user takes each time). The CLI never proposes
  it (`never_option`); a suggestion row that names it anyway is ignored. Show
  a `refresh` or `mini` suggestion only, and never apply one. A learned `review_before_push: on` → F4
  offers a dispatch of `orc-reviewer-opus-5-med` on the diff FIRST (P0/P1 block
  the commit), marked `→ usual`; the reviewer is not in the fast pipeline, so
  it runs only on that yes. Record `any.ship.review-before-push` whenever it is
  offered.
- **`/orc` and `/orc-ultra`.** The points live in the phase files. Ultra forces
  its overrides for the run: a habit never answers a forced key or question
  (analysis depth, pattern findings, test authoring, security review) — record
  those `ASK`s `by=config`, and the habits line says ultra wins.
- **`any.analysis.depth`** (`/orc`, `/orc-analyze`): a suggestion only. `deep`
  needs the user's explicit yes EVERY run — a habit never picks it and never
  skips the question. ctx: none.
- **`/orc-diy`.** The compiled flow asks the same questions as the phases it
  came from and emits the same `ASK`. A question the flow's `autonomy`
  (`semi` · `hands-off`) answered is `by=default` and never counts toward a
  habit — it was not a choice.
- **`/orc-wait`.** `any.stop.where` only, at W6. The wait opens no run: the
  `ASK` goes in the NEXT packet of the run in flight, and only when that run's
  `lane config` answer had `habits{}`.
