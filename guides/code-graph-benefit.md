# When the code graph helps (with live numbers)

Short version: **the code graph saves search work when the task must find code
or follow a change across files.** It does not help a change inside one file
that you already named. It gives no benefit until it has its data.

---

## 1. What the code graph does for you

The code graph is a structure index of your project: files, symbols, callers,
imports, routes and tests. The lanes read it when they plan and slice a task.
The graph hook reads it when the main session searches for a known symbol.
The key `code_graph` sets the mode: `off`, `semi` or `on`.

---

## 2. Before you see a benefit: the graph needs its data

> [!NOTE]
> - Run `orc graph update` ONE time first. This is a cold build. In the eval
>   repo (a company Vue repo: 799 files, 8,531 symbols) it took about 3.5 s.
>   With no index, every graph read answers "no index". The lane then works as
>   with the graph off.
> - After that, the hooks keep the index current: after each executor, and on
>   read. `orc graph status` shows `fresh`.
> - The 2.2.0 upgrade rebuilds the index one time (engine `graph@7`).
> - Notes (one sentence per function) are OPTIONAL stored knowledge. A noter
>   dispatch writes them, and that dispatch costs tokens. The structure layer
>   is free.

---

## 3. The evidence (real repo, live runs)

How we measured:

- The repo is a real company Vue 2.7 dashboard repo.
- The lane is `/orc-quick`. The main session is Opus 5.5 medium. The executor
  is pinned to `orc-executor-opus-5-low`.
- Each task ran with the graph OFF and with the graph ON. The table shows
  medians (or means where it says so).
- We checked each run: lint, jest, and a Playwright journey where the task has
  a UI. The same grader graded each run against the same lane dossier.

| Task | What it is | Runs (OFF / ON) | Cost | Time | Tokens | Grade |
|---|---|---|---|---|---|---|
| RMT1 | Build step 1 of a new 4-step flow from a requirement document (route shell, API call, i18n, journey spec) | 5 / 3 | −9.6 % | −28.4 % | −15.8 % | equal (84) |
| RMT2 | Change one helper's signature and every caller (5 caller files, 1 test) | 3 / 3 | −2.0 % | −8.6 % | −4.2 % | equal (86) |
| RMT3 | Build step 2 on top of the built step 1 | 2 / 2 (means) | −8.9 % | +4.0 % | −14.0 % | 80 vs 85 (one ON run missed a display detail) |
| RMT4 | Change behaviour across the built step 1 + step 2 page; ON had stored notes | 2 / 2 (means) | +7.7 % | +45.5 % | +4.4 % | 77 vs 85.5 (one ON run 66 for stray git-hook files, the other 88) |

e2e: every RMT1/RMT3/RMT4 run that passed reached every journey step in both
arms.

N = 2–5 per arm. A difference under about 10 % is inside the run-to-run noise
of one task.

---

## 4. Where the graph helps

- **Finding the code to copy or to change.** The executor's exploration fell
  40–74 % (RMT1, RMT3 phase split).
- **Changes that ripple across files.** Callers, props / emits, routes and the
  tests that reach a caller come in one card. This card replaces a grep, a
  test hunt and a coverage check.
- **The main session's own search.** The hook answers a search for a known
  symbol with its callers, tests and coverage (one time per name, 3 per run at
  most). When an executor returns, the hook gives the affected tests.
- **Time.** The clearest win is on new-feature work (RMT1 −28 %).

---

## 5. Where it does not help (or helps very little)

RMT4 is the live example. It is a small follow-up change inside a page that
the agent reads in a few calls. There was no gain, also with stored notes.

- **A change inside ONE named file with no outside effect.** Both arms read
  that file. ORC skips the anchors.
- **Very small tasks.** The lane's own overhead (config, trace, questions) is
  most of the cost. The graph is break-even.
- **Test writing and coverage work.** The graph does not write tests. A
  project rule such as "> 90 % branch coverage" can cost more than all that the
  graph saves. We saw this in both arms.
- **No index, or a stale index.** The lane falls back to Grep. There is no
  harm and no gain.

---

## 6. Turn it on

```bash
orc config set code_graph on
orc graph update
```

Run `orc graph update` one time. The modes are:

- `on` — the hooks keep the graph current, and the lanes read it.
- `semi` — the hooks keep the graph current. No lane reads it.
- `off` — nothing.

For the other keys (`code_graph_notes`, `code_graph_card_budget` and more),
see [configuration](configuration.md).

---

## 7. What it costs

- **Structure:** zero tokens. Local files under `.claude/orc/graph/`. No
  background process.
- **Cards:** a few hundred tokens each, with a cap.
- **Hook cards:** 3 per run at most in the main session.
- **Notes:** optional. Each batch costs a noter dispatch.
