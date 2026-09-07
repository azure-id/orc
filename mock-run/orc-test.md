# Mock run — `/orc-test`

> ORC runs the test against a real system, writes down what it saw, and never touches the system it is testing.

---

## 1. What it does

Every other testing tool in ORC **writes** tests. `/orc-test` **runs** them.

It points at a running API — yours, on your laptop, or one you were given
permission to touch — sends real requests, and writes down what came back. Then
it stops.

The split is the whole design:

> **The CLI executes and measures. The model designs and interprets.**
> A model never sends a request. The CLI never decides what a response means.

That split is what makes the report worth reading. A number in it was measured
by a program. A sentence in it was written by a model that only ever saw
evidence on disk.

Three rules hold it together, and each one is a contract with a name:

| Rule | What it means |
|---|---|
| `a lane that reports a result it did not observe` | Three verdicts: `pass`, `fail`, `unknown`. **`unknown` is the honest one.** A case nobody ran is never a pass. |
| `a lane that sends traffic to a target nobody authorized` | The target is frozen at the start, with a written statement of who said yes. Nothing outside that origin is ever contacted. |
| `a lane that fixes the system under test` | ORC never edits the thing it is testing. When the app is broken, it hands the machine back to you. |

---

## 2. Freeze the target

Nothing here has a default it could guess. There is no config key that names a
target, on purpose.

```
$ orc test init api-users --kind be --env local \
    --base-url http://127.0.0.1:4000 \
    --authorized "me, on my own laptop, against my own dev database" \
    --destructive deny --reason "this box shares a database with the seed script"
```

```
  /orc-test · api-users
  target FROZEN at orc/orc-test/api-users/target.md

    kind          be
    environment   local
    base URL      http://127.0.0.1:4000
    origin fence  http://127.0.0.1:4000
    destructive   deny — this box shares a database with the seed script

  This folder is NEVER staged. It will hold real response bodies from a real
  system. Add this line to .gitignore yourself — ORC does not edit it:
      orc/orc-test/

  Next:  orc test surface api-users
```

Two things to notice.

**The origin fence.** Every request the runner sends is checked against it. A
redirect that leaves the fence is not followed — it is recorded and dropped.

**`--authorized` is a sentence, not a checkbox.** ORC records it word for word
and never checks it. On a remote target it is required. It prints at the top of
every report, so the person reading the report can see whose permission this
was run on.

---

## 3. The free pass

The surface costs nothing. No model, no tokens.

```
$ orc test surface api-users
```

```
  /orc-test · api-users · surface
  the free pass — zero model tokens. Written to orc/orc-test/api-users/surface.md

    spec on disk   openapi.yaml  (4 routes)
    spec at target http://127.0.0.1:4000/openapi.json
    frameworks     express
    routes         5   (34 files scanned, 1 live-only)
    mounted at     /api/v1
    unresolved     1

    in code, not live   1   dead or unshipped
    live, not in code   1   shadow / zombie APIs — OWASP API9:2023
        GET /internal/debug
```

`GET /internal/debug` answers at the target and is in no file in this
repository. Nobody reviews it. Nobody patches it. Finding that took zero model
tokens and one comparison of two documents — **no route was called to produce
it**.

If there had been no spec at the target, that line would read:

```
    code-vs-live diff   NOT MEASURED — no spec answered at the target, so there
    is nothing to compare the code against. This is NOT 'no shadow APIs' — it is
    'not measured'.
```

That distinction is the lane in one sentence.

---

## 4. When the app is broken

```
$ orc test env api-users
```

```
  /orc-test · api-users · environment
  state  UNHEALTHY   the process is up and answering wrong. ORC does not fix
                     the system it is testing.

    detected   npm run dev   (package.json)
    process    pid 48211
    missing    STRIPE_SECRET_KEY, SESSION_SECRET

    Error: password authentication failed for user "app"
```

And then it stops.

It found the start command. It knows the process is alive. It can see the exact
line in the log. It will not open that file. It names the two environment keys
that are absent and **writes no value for either** — a placeholder written into
a real environment is a credential-shaped lie, and only you know the right
value.

You fix it. You run the command again. That is the whole loop.

---

## 5. The cases derive themselves

```
$ orc test case derive api-users
```

```
  /orc-test · api-users · cases
  derived for free — zero model tokens

    happy     2
    edge      4
    abuse     3
    security  3
    total     12

  2 cases carry a GAP — what a schema could not answer.
  This is what the designer agent is for, and it is the only part that costs anything.

  security tier  safe   (the shipped default)
  5 OWASP rows UNCHECKABLE — each keeps its slot, and none of them will ever become a pass
```

The matrix comes out of the schema for free. The **gaps** are what a schema
cannot know — what a valid email looks like in this business, which order the
two calls have to happen in. Those go to the designer agent, and that is the
only part of this lane you pay for.

---

## 6. The security tier is a closed set

```
$ orc test security api-users
```

```
  /orc-test · api-users · security · OWASP API Top 10 (2023)
  tier safe (the shipped default) · the set is CLOSED and is never extended ad hoc

    API1   FOUND           Broken object level authorization (BOLA)
           severity critical  OBSERVED, and the request crossed an identity boundary
           C-006  replay a successful request as a SECOND identity
           orc/orc-test/api-users/runs/03/evidence/C-006/
    API2   observed-clean  Broken authentication
    API5   unchecked       Broken function level authorization (BFLA)
           only one ROLE is declared. BFLA asks whether a caller who should be
           REFUSED is refused; with one role there is nobody to refuse.
    …

  DETECTION, NEVER EXPLOITATION. Every probe demonstrates the CONDITION and stops there.
  `unchecked` keeps its slot, never becomes a pass, and never raises the exit code.
```

**Ten rows, always, in every state.** A category ORC could not measure says so
and says why. It never becomes a pass, and it never changes the exit code.

That last rule matters more than it looks. Reporting an unmeasured category as
clean is the single most damaging thing a security report can do, because
somebody then ships on it.

---

## 7. The run

```
$ orc test run api-users
```

The ladder runs `happy` → `edge` → `abuse` → `security`, and **it stops on a red
happy path**. A 500 on every request will "prove" a dozen vulnerabilities that
are one bug, so there is no point continuing.

```
  /orc-test · api-users · run 3
  2 req/s, concurrency 2 · X-Orc-Test-Run: api-users-03 · written to runs/03

    pass      4
    fail      3
    unknown   4

  The ladder STOPPED at the edge tier. The cases below it were not observed,
  and none of them is a pass.
```

Four things the runner does that you should know about:

- **The pace is the target's, not ORC's.** A fixed small concurrency and a rate
  limit the CLI actually applies.
- **A 429 is a result.** It means rate limiting works. ORC records it, backs
  off, and does not push through — pushing through is how a staging scan becomes
  a lockout.
- **Failed logins are capped** per identity, so a run cannot lock somebody's
  account out.
- **Redaction is structural.** Every credential is replaced *before* the bytes
  reach disk, not in a review step afterwards.

---

## 8. The report

```
$ orc test report api-users
```

```
    cases     12   4 pass · 3 fail · 4 not observed · 1 never run
    runs      3
    findings  3    2 observed · 1 not observed, and none of those is a pass
    security  safe   2 FOUND
    flakes    1      recorded, never retried away — the instability IS the finding

  This folder is NEVER staged.
```

A finding must cite evidence that resolves on disk, or it is **dropped by name
and counted**. A model that describes a vulnerability it cannot point at does
not get to put it in your report.

Severity is ORC's. If the interpreting model disagrees, its word is kept beside
ORC's and printed — so a disagreement is visible instead of invisible.

And a flake is written down, never retried away. If the same case answers
differently on two runs, **that instability is the finding.**

---

## 9. What lands on disk

```
orc/orc-test/api-users/
  test.json        the ledger — the single source of truth
  target.md        the frozen target, and who authorized it
  surface.md       the routes, and the code-vs-live diff
  cases.json       the matrix (derived from the ledger)
  findings.md      the findings (derived from the ledger)
  REPORT.md        the one file written to be shared
  runs/03/evidence/C-006/
     request.txt   redacted
     response.txt  redacted
     repro.sh      a curl you can run yourself, with the secret taken out
```

**Never stage this folder.** It holds real response bodies from a real system —
the most sensitive thing ORC writes to disk. `orc doctor` tells you if it is not
git-ignored, and it will not edit `.gitignore` for you.

---

## 10. In the panel

`orc ui` ▸ **Test** shows the same thing, and works out none of it:

- **Targets** — the frozen target, who authorized it, the identities, the
  environment.
- **Surface** — the routes, and the code-vs-live diff.
- **Cases** — the matrix, and all ten OWASP rows.
- **Runs** — one row per run, opening in place.
- **Findings** — observed and not observed, kept apart.

A free action is a button there. `orc test run` is not: it sends real traffic,
so the panel gives you the command to copy and never a button.

---

## 11. What it will not do

- It will not edit the system it is testing. Not a config file, not a
  `.env`, not a line of source.
- It will not send a request to anything outside the frozen origin.
- It will not report a category it could not measure as clean.
- It will not confirm an exploit. It shows the condition and stops there —
  going further is a human's decision on a human's authority.
- It will not stage or commit anything.

---

## Related

- `orc-quick` — a fast fix once you know what is wrong.
- `orc-challenge` — grade the report itself, in a different session.
- `orc-pact` — record the invariant a finding taught you.
