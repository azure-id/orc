# Mock run — gotcha import and sync (`orc gotcha`)

> Teach the repair memory from what your tools and your reviewers already
> said: SARIF, Sonar, PR threads and closed defects. No model, and nothing is
> written to GitHub.

---

## 1. What it does

Gotchas are ORC's repair memory: what this project already got wrong, and how
it was fixed. Before 2.0.0 only a red → green inside a run could add one. Now
the CLI also reads four outside sources and turns each finding into an
**observation** in `.claude/orc/observations.jsonl`.

An observation is not an entry yet. A candidate becomes an entry only by a
fixed rule — or when you promote it yourself. The reviewer then gets a short
**card** of the entries that match the files it reviews.

---

## 2. Import once, from each source

```
$ orc gotcha import sarif reports/eslint.sarif
  sarif · ESLint · 14 results · 1 suppressed (skipped) · 13 observations
  new since the last ESLint import: 4

$ export SONAR_TOKEN=…            # the token is never a config key
$ orc config set sonar_url https://sonarcloud.io
$ orc config set sonar_project shopcart
$ orc config set sonar_org shopcart-team
$ orc gotcha import sonar --branch main
  sonar · 9 issues · 9 observations

$ orc gotcha import pr 212
  pr #212 · 6 threads · 5 by people, 1 by a bot (measured, not recorded)
  5 observations (3 addressed · 1 disputed · 1 open)

$ orc gotcha import issues --label bug
  issues · 4 closed defects with a closing PR · 4 observations
```

Every import is read-only. `gh` is used only to read, and a test with a fake
`gh` proves that no call writes.

---

## 3. Keep it fresh

```
$ orc gotcha sync
  sarif    nothing new
  sonar    2 new issues
  pr       #214: 1 new thread
  issues   nothing new
  synced · 3 observations · next sync due in 6 h (gotcha_sync_hours)
```

`sync` runs every source that is available, reads only what is new, and has a
time limit. The review step of a lane runs it too. If a source fails, the lane
goes on — a failed import never blocks a review.

---

## 4. From observations to an entry

```
$ orc gotcha list --candidates
  C-004  money rounding in cart totals   3 addressed cases in 2 PRs   → promoted as G-017
  C-007  missing await on db.save        2 addressed cases in 1 PR    needs 1 more case in 1 more PR
  C-009  "prefer template literals"      4 disputed                   proposed suppression

$ orc gotcha accept C-007
  C-007 → G-018 (promoted by a person)
```

The fixed rule promotes a candidate on ONE of these:

- a red → green inside a lane, with a reproduction;
- a miss — an ORC review read those lines and did not flag them;
- a security finding with a CWE tag or a HIGH impact (one case is enough);
- 3 addressed cases in 2 PRs within 90 days.

---

## 5. What the reviewer sees

```
$ orc gotcha card --files src/cart/total.ts
  gotchas · 2 of 18 match · budget 600 tokens · 0 dropped
  G-017  money rounding in cart totals — round once, at the end, in cents
  G-011  totals cached across currency switch — clear on currency change
```

The card is always on. `gotcha_card_budget` sets its size (600 tokens, at
least 200). An entry that does not fit is counted in the header, never dropped
in silence.

---

## 6. What to notice

- **People teach, bots are measured.** A bot comment is counted for quality,
  but it never becomes an entry by itself.
- **`orc gotcha filter` never removes a P0 or a P1.** It removes only
  suppressed, folded and noisy advice.
- **Your v1 file stays valid.** `gotchas.md` is not rewritten, and ORC 1.9.2
  can still read the file 2.0.0 writes.
- **Quality is measured.** `orc gotcha quality` shows the acceptance per
  category after five reviews, and `orc ui` ▸ **Behaviour** draws it.

---

## 7. Related

- The full guide: [`guides/habits-and-gotchas.md`](../guides/habits-and-gotchas.md)
- A normal run that uses the card: [orc](orc.md)
