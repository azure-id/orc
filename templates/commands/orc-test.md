---
description: Run the tests against the real running system — happy path to security — and report only what was observed
---

Use the **orc-test** skill. Standalone — no plan, no build, no code written into
your project.

Every other ORC lane reasons about your system. This one **runs it**:

> **A test that ran is a FACT; a test that was written is an OPINION.**

ORC already has a lane that WRITES tests and never runs them (Phase 6.5,
`test-generator/`). This is the mirror image, and the two never mix: `/orc-test`
writes nothing into your test tree and runs everything.

**It never edits the system it is testing.** If the server will not come up, it
prints exactly what it ran and the tail of the output, and hands back. You fix
it, and re-run for free — the same shape as `/orc-challenge`, and for the same
reason: a session that just fixed the code cannot be trusted to measure it.

**It never reports a result it did not observe.** Three verdicts and no fourth:
`pass` (observed, matched), `fail` (observed, did not match), and `unknown` —
not observed. `unknown` keeps its slot in the report and never becomes a pass.
A flake is recorded, never retried away: there is no retry count, because if the
same case answers differently twice, *that instability is the finding*.

One pass:

1. **Target** — `orc test init <slug>` asks what it must not guess: back end or
   front end, local or remote, the base URL. On a remote target it also requires
   `--authorized "<who authorized this, and where it is recorded>"`, stored
   verbatim and reprinted at the head of every report. ORC cannot verify
   authorization and does not pretend to — it makes the assertion impossible to
   skip. Frozen, and never asked again.
2. **Surface** — free, deterministic: an OpenAPI or GraphQL spec on disk, the
   same spec at the target, route extraction by framework fingerprint, FE router
   config. Anything ambiguous comes back as `unresolved[]` and is never guessed.
   The **code-vs-live diff** is a first-class output: routes that answer live and
   exist in no source file are zombie APIs.
3. **Flow** — it digs the repo for how a request reaches your endpoint: the
   route registration, the middleware in order, the handler, what it writes, what
   must be true first, which fields name an object, and the login flow itself.
4. **Environment** (local only) — it brings the system up and waits for health.
   Five states, one next action each.
5. **Cases** — the CLI derives the bulk for free: equivalence partitions,
   boundary values, method and content-type negatives, stateful create → read →
   update → delete sequences. An agent fills only what a schema cannot know.
6. **Run** — paced, capped, and fenced to the frozen origin. A 429 is a RESULT,
   not an error: it means rate limiting works. Every case leaves its exact
   request, its exact response and a reproducible `curl`, with every credential
   redacted **before the bytes reach disk**.
7. **Report** — `orc/orc-test/<slug>/REPORT.md`, written for someone who does
   not read code.

The security tier is a **closed set** mapped to the OWASP API Security Top 10
(2023), and it demonstrates a CONDITION rather than an extraction — confirming
an exploit is your decision on your authority. With one identity, BOLA and BFLA
report `UNCHECKABLE`, which keeps its slot and never becomes a pass.

**The run folder is never staged.** Evidence contains real response bodies from
a real system. The lane offers you the one `.gitignore` line; it does not edit
`.gitignore` itself.

Read the state back any time without this lane: `orc test status <slug>`.

The slug to open or reopen (or nothing, and it will ask): $ARGUMENTS
