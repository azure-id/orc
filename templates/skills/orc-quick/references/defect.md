# A defect entry shows the bug RED first

## 1. When this applies

Q1 sorted the request as **`kind: defect`**. The user described a behaviour that
is wrong:

- *"the orders page returns 500"*
- *"it shows the wrong total"*
- *"find it and fix it"*
- *"this used to work last week"*

A request to ADD something is not a defect. A request to clean something up is
not a defect. Only a behaviour the user says is wrong.

## 2. Why red first

Without a reproduction, the fix is proven against the **test suite**. With one,
the fix is proven against the **bug**.

Those are not the same thing. A suite that was green before the fix is still
green after a fix that changed nothing the user cares about. A reproduction that
goes from red to green is the only cheap proof that the thing the user reported
is the thing that got fixed.

It costs one extra run of one command. It is the cheapest correctness step in
this lane.

## 3. What goes in the slice

```yaml
repro:
  required: true
  kind: test | command
  hint: "GET /orders/search?item=blue returns 500 — see src/routes/orders.js:16"
```

- **`kind: test`** when the project has a test runner. The executor writes a
  failing test in the project's own framework.
- **`kind: command`** when it has none. The executor writes a command that shows
  the fault — a `curl`, a script, a one-line node call.

**A good `hint` is specific.** Give the exact input the user described and the
`file:line` your dig found:

| Weak | Good |
|---|---|
| "search is broken" | `GET /orders/search?item=blue` returns 500 — `src/routes/orders.js:16` |
| "the total is wrong" | cart with 2 × 4.99 shows 9.99, not 9.98 — `src/cart/total.js:22` |

## 4. Who writes it

**The executor writes the reproduction, in the SAME slice as the fix. Never
you.**

A reproduction written by the orchestrator and handed over is a sketch the
executor has to trust. One written by the executor is a thing it ran and
watched fail. The second is worth something; the first is a longer slice.

## 5. What comes back

```yaml
repro:
  command: "npm test -- tests/orders.search.test.js"
  before: { exit_code: 1, tail: "…" }
  after:  { exit_code: 0, tail: "…" }
```

Two of these are malformed returns, and both are treated as a failure
(`../../_shared/return-validation.md` §5d):

- `status: done` with `before.exit_code` of 0 — it was never red, so nothing was
  reproduced.
- `status: done` with `after.exit_code` not 0 — it is still red, so nothing was
  fixed.

Print both runs, two lines, and emit `REPRO red :: <cmd> exit=<n>` and
`REPRO green :: <cmd> exit=0` into the record.

## 6. When it cannot be reproduced

Sometimes there is no runner and no reachable entry point. Sometimes the fault
needs production data.

```yaml
repro: none
reason: "no test runner, and the failing path needs a live Stripe webhook"
```

**That is an honest return, not a failure.** But it changes what the user is
told. The entry says **not reproduced** with the reason, and the commit offer
shows it on its own line:

```
commit? — 2 files changed
⚠ not reproduced: no test runner, and the failing path needs a live Stripe webhook
```

A user who knows the fix was never seen to work can decide to test it by hand.
A user who was not told cannot. **Never invent a reproduction to fill the
field.**
