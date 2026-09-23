# Round 3 — results

Run 16-09-2026. Raw operator output: `result.md` at the repo root.
Setup and the reading rules: `eval/round3/README.md`.

Three checks. Two cost no model tokens at all. The whole round was two short
sessions, against fourteen full lane runs in round 2.

---

## R3-A — does `additionalContext` reach a subagent? **YES.**

**The probe.** A throw-away hook (`eval/round3/setup.ps1`) wired on three events —
`SubagentStart`, `PreToolUse` (Grep|Glob), `PostToolUse` (Read). It writes its
whole stdin to a file, and, only when the payload carries an `agent_id`, it
returns `hookSpecificOutput.additionalContext` with a marker line.

**The run.** One prompt in a fresh session in `C:\dev\orc-eval`: dispatch one
general-purpose subagent, run one Grep, then quote back the first line that
starts with `ROUND3-PROBE`, or say `none`.

**What happened.**

| Event | Payload written | Field consumed |
|---|---|---|
| `SubagentStart` | yes (`agent_type=general-purpose`) | **YES — quoted back verbatim** |
| `PreToolUse` (Grep) | yes (`agent_id`, `agent_type`, `effort`, `tool_input`) | not shown by this probe |
| `PostToolUse` (Read) | no — the subagent read no file | not exercised |

The subagent's reply, from the session transcript
(`C--dev-orc-eval/e97d9a6c-….jsonl`, entries 37/39/43):

> ROUND3-PROBE SubagentStart reached this subagent. Quote this whole line back if
> you are asked what you received.

**Verdict: DE3 is confirmed.** Claude Code delivers a hook's
`additionalContext` into a subagent's context. The three delivery events in
`templates/hooks/orc-graph-hook.js` stay. Option B in `RESUME.md` — cut the
delivery half — is closed.

**What is still not proven, and the probe cannot prove it.** The subagent was
asked for the FIRST marker line, and `SubagentStart` fires before any tool, so
one answer satisfied the task. `PreToolUse` delivery into a subagent is
therefore still unconfirmed; the event itself fires there, with the full payload.
`PostToolUse` was never exercised. Both stay on the EW4-bet: they are fail-quiet,
so if the field is dropped they cost zero tokens and zero risk.

---

## R3-B — does the graph hold on a real repository? **YES.** (zero tokens)

`pwsh -File eval/round3/big-repo.ps1` on django/django, shallow clone.

| Measure | Result | Bar |
|---|---|---|
| files indexed | 3,040 | — |
| symbols | 44,160 | — |
| first build, nothing cached | 12,243 ms | — |
| parser could not finish | 10 partial + 0 skipped = **0.3%** | under 30% |
| in-repo calls that resolve confidently | **51.3%** (LOCAL 20,631 · IMPORT 20,882 · UNIQUE 23,866 of 129,381 in-repo; AMBIGUOUS 62,002; UNRESOLVED 67,816 are outside the repo) | at or over 50% |
| `--format tree`, median over 77 file cards | **−18.7%** | 15% |
| widest file (`tests/admin_views/tests.py`), median of 3 | cached `ctx` 415 ms / `impact` 365 ms · compute-on-read `ctx` 392 ms / `impact` 364 ms | — |

Every bar is met. Note the last row: on ONE very wide file the EW2 cache is not
the win — the budget cap is what bounds that card, not the resolve. The EW2
numbers (`ctx` −35%, `impact` −29%) were measured over the repository, not over
its widest file, and both readings stand.

---

## R3-C — does a card help an agent get it RIGHT? **Mixed, and the miss is instructive.**

Same sentence, word for word, in two fresh sessions: list every place that would
break if the signature of `searchByItemPrefix` changed. Graph off, then graph on.

The answer key, from the parser:

```
searchByItemPrefix  src/stores/orderStore.js:18-26  [blob e9f7c10 · current]
  ← called by  GET /search  src/routes/orders.js:16  IMPORT
  ← maybe      6 more caller(s) name it among AMBIGUOUS candidates
```

| | graph OFF | graph ON |
|---|---|---|
| direct call sites found | 7 of 7 | 7 of 7 |
| definition + export | both | both |
| invented a call site | no | no |
| route-level tests that break | **11 listed, correctly, and marked indirect** | **declared absent** |
| time | 1 m 3 s | 37 s |

**The ON answer is faster, tighter, and carries one false statement:**

> Nothing else. `tests/orders.test.js` never hits `GET /search` …

It does. That file calls `.get("/orders/search")` fourteen times, at lines 27,
36, 43, 57, 64, 73, 107, 117, 123, 162, 173, 188, 210 and 219 — every one of them
runs the handler at `src/routes/orders.js:16`, which was the only production
caller. The OFF answer found them and labelled them correctly as indirect.

**Why the graph missed them, and why that is not a bug.** The graph records an
edge when code NAMES a symbol. A test that drives an HTTP route names no
function — it names a URL. So there is no edge to record, the file is marked
`coverage: full`, and the card is silent. The card was right. The agent read its
silence as a boundary.

**What this changes.** Nothing in the engine. One rule, already the top of the
precedence line (`code > graph structure > …`), now has the concrete case that
proves it, and it is written into the contract and the release limits:

> A card lists every caller that NAMES the symbol. A caller that reaches it
> another way — an HTTP route, a job runner, a string dispatch, reflection — is
> not in the graph and never will be. A card's silence is not proof of absence.

This is the claim the graph actually makes, stated exactly: it finds what a Grep
finds, with the file, the line and the kind of edge attached, and it does it in
half the time. It does not find what a Grep cannot find either.

---

## What the round decided

- The delivery hooks stay (R3-A).
- The graph is sound at real repository size (R3-B).
- The graph is a LOCATOR, and the release docs must not let a reader take a card
  for a blast radius (R3-C).
- Nothing here re-opens EW8. The graph is still not a token saving, and this
  round did not test one.
