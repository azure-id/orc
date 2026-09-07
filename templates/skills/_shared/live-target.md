# Shared contract — the LIVE TARGET

> Canonical prose for `/orc-test`. Any lane that sends a request to a running
> system, or reports what a running system did, reads this file. A spine keeps
> the TOKEN and a pointer here — never a forked copy of the prose.

ORC has always written tests and never run one. Phase 6.5 (`generate_tests`)
authors `test-generator/<slug>/` and never executes it, which is the right call
for a build pipeline: running a suite is the user's business, and a red test is
sometimes the test being wrong.

`/orc-test` is the mirror image, and the two are different products:

|  | Phase 6.5 `test-generator/` | `/orc-test` |
|---|---|---|
| Writes into the project's test tree | yes — a shipped deliverable | **never** |
| Runs anything | **never** | always — that is the entire lane |
| Output | test cases | **observations** |
| Gates a ship | never | never — it is standalone |

**A test that ran is a FACT; a test that was written is an OPINION.** Everything
below falls out of that one line.

---

## The split

> **The CLI EXECUTES and MEASURES. The model DESIGNS and INTERPRETS.**

- Sending an HTTP request, recording the request and the response to disk,
  comparing a status or a shape against a declared expectation, deriving a
  boundary matrix from a typed parameter, polling a health endpoint, diffing the
  code surface against the live surface — **deterministic, in `bin/cli.js`, at
  zero model tokens, repeatable.**
- Deciding what a valid `POST /orders` body semantically needs, which field is
  the object id a BOLA probe should swap, what "logged in" means in this repo,
  whether a 500 body is a leak — **model work, dispatched, and always anchored
  to an evidence file on disk.**

**A model never sends a request. The CLI never decides what a response means.**

---

## The three contract tokens

They join the family — `a lane that answers its own interview question`, `a lane
that picks its own favourite`, `a lane that fixes what it judged`, `a lane that
picks its own council`, `a lane that reads its own document`, `a lane that sends
work off Claude without saying so`, `a lane that re-does work the worktree
already contains`, `a lane that waits without a hand-back`, `a lane that
re-dispatches over a live attempt` — taking it to **twelve**.

### 1. `a lane that reports a result it did not observe`

Every row in the ledger carries an `evidence` path, or it is not a result. No
evidence → **`unknown`**, never `pass` and never `fail`. This is *unknown is not
zero* and *measured is not unknown*, applied to a verdict.

There are three verdicts and there is no fourth:

| verdict | means |
|---|---|
| `pass` | observed, and it matched the declared expectation |
| `fail` | observed, and it did not |
| `unknown` | **not observed** — connection refused, a timeout, a precondition not met, an identity absent, the tier skipped |

`unknown` is an honest state. It keeps its slot in the report and it never
becomes a pass — the `/orc-pact` UNCHECKABLE rule, and for the same reason.

**A flake is recorded, never retried away.** There is no retry count and there
is no key for one. If the same case answers differently across two runs, the
report says so, and *that instability is the finding*.

### 2. `a lane that sends traffic to a target nobody authorized`

The target is DECLARED at `init`, FROZEN to `target.md`, and every single
request is fenced to that origin. **A redirect off-origin is followed by
nothing** — it is recorded as a finding and dropped.

- There is **no config key that names a target.** A stored default target is how
  a scan reaches the wrong host.
- On a remote target, `--authorized "<who authorized this, and where it is
  recorded>"` is REQUIRED. ORC cannot verify authorization and does not pretend
  to — **it records that the user asserted it, and makes the assertion
  impossible to skip.** The statement is reprinted verbatim at the head of every
  report.
- `--destructive allow | deny`, with `--reason` REQUIRED on `allow`. Per run,
  per target, never a config key: a config that once said yes is on for the run
  you needed it off.

Traffic discipline, because ORC's own run must not be the incident:

- `test_max_rps` and a fixed small concurrency. **The CLI paces** — it is not a
  suggestion.
- **A 429 is a RESULT, not an error.** It means rate limiting works. Record it,
  back off, do not push through.
- **Failed-auth attempts against one identity are capped** at a low fixed
  number. Account lockout would end the run and, on preprod, somebody's
  afternoon.
- Every request carries a stable `User-Agent` and an `X-Orc-Test-Run: <slug>`
  header, so the target's own logs can identify and exclude the traffic.

### 3. `a lane that fixes the system under test`

If the system will not come up, `/orc-test` **STOPS**, prints exactly what it
ran and the tail of the output, and hands back.

It never edits source. It never installs a dependency into the project. It never
relaxes a check to make its own run go green.

Same shape as `/orc-challenge`: **ORC observes, the user fixes, ORC
re-observes** — and a session that just fixed the code cannot be trusted to
measure it.

---

## Evidence, and redaction

Per case, under `evidence/<case-id>/`: the exact request, the exact response
(status, headers, body, timing), and a reproducible `curl`.

**Redaction is structural, not a review step.** The evidence writer replaces
every known credential value and every `Authorization` / `Cookie` /
`Set-Cookie` value with a stable placeholder **before the bytes reach disk**.
ORC does not do the "last 6 characters" convention: the report is meant to be
readable in a PR, and a tail is still a secret when the vault is small.

**The run folder is never staged.** Not by this lane, not by any other. Evidence
contains real response bodies from a real system — the most sensitive thing ORC
writes to disk. The lane says so once, loudly, and offers the one `.gitignore`
line; it does not edit `.gitignore` itself (the `mock-examples/` precedent).

---

## Remote is a different lane in a trench coat

**R1 — On a remote target, source is a HYPOTHESIS, not a fact.**
Everything derived from the repo is labelled `source-derived` in the ledger. A
case that depended on it and failed is reported as `unknown` FIRST, with "the
deployed build may not be this commit" named as a candidate cause, before it is
ever reported as a defect. The CLI records the target's build fingerprint if one
is exposed and prints the comparison; if none is exposed it says so and never
guesses.

**R2 — On a remote target, ORC never claims it cleaned up.**
Every state-changing request gets a run marker, and the run writes `changes.md`:
every mutation in order, with the request that made it and the request that
would undo it *if one exists*. If no undo exists, the row says so.
**ORC prints the undo; the user runs it.**

---

## Config — five keys, and the five that were REFUSED

The lane has exactly five keys: `test_gate`, `test_security_tier`,
`test_max_rps`, `test_case_budget`, `test_ui_driver`.

The five below were proposed and refused. They are written down HERE, with the
reason, so nobody proposes them again — and so that a later release adding one
has to argue with a sentence rather than with a silence.

| Refused | Why |
|---|---|
| `test_auto_fix` | It is the lane's premise, inverted. **`a lane that fixes the system under test` has broken this contract** — a key for it would be a switch that turns the contract off. |
| `test_destructive` | A permission to write to somebody's system must be PER RUN, for THAT target, with a recorded reason. A stored default is a permission nobody remembers granting, applied to a target nobody was thinking about. |
| `test_target_url` | A stored default target is exactly how a scan reaches the wrong host. Nothing in this lane has a default it could guess, and the target is frozen at `init` by a person who typed it. |
| `test_retries` | **A flake is recorded, never retried away.** The instability IS the finding, and a retry count is a setting whose only function is to hide it. |
| `test_skip_auth_probe` | A switch on a check is a switch that turns off the check people most need. If a probe cannot run here, the honest answer is `UNCHECKABLE` with its reason — not a setting that makes the row disappear. |

The shape of every one of those reasons is the same: a key you can switch off is
off on the run you needed it for.

---

## What this lane will never do

1. **Edit the system under test.** Not to fix a boot failure, not to add a
   `data-testid`, not to relax a check.
2. **Write into the project's test tree.** That is Phase 6.5's job.
3. **Commit or stage anything.**
4. **Report a category it did not measure.** `UNCHECKABLE` keeps its slot.
5. **Exploit.** It demonstrates a CONDITION, not an extraction. Confirming an
   exploit is a human's decision on a human's authority.
6. **Retry a flake into a pass.**
7. **Gate a ship.** `test_gate` warns; it has no `block`.
8. **Send traffic anywhere but the frozen origin.**
9. **Install anything into the user's project.**
10. **Name a person.** A red test is not a performance review.
