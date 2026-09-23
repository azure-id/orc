# W1 — the scope proof: does `PreToolUse` fire inside a dispatched subagent?

**Date:** 2026-09-07 · **Base:** v1.5.0 · **Class: C** — consolidated. One
measured fact replaces an inference drawn from `orc-trace.js`'s design.

> **D1 IS SETTLED. Hooks DO fire inside a dispatched subagent.**
> The inference in `02-risks-and-choices.md` — that hooks are session-level,
> drawn from how `orc-trace.js` is built — **was wrong.**
>
> **The release is NOT refused.** A discriminating field exists: the payload
> carries **`agent_id` and `agent_type` inside a subagent, and carries neither
> in the main session.**

---

## 1. Method

A throwaway `PreToolUse` hook on matcher `Read` that records every field a real
gate could use, and **always exits 0**. Registered in `.claude/settings.json`,
exercised twice, then removed and the file restored byte-identically.

**The validity control, and why it matters.** A negative result would be
meaningless if hooks were simply not reloaded. So a main-session `Read` was run
FIRST and had to fire before the dispatch was allowed to count. **It fired** —
hooks reload without a session restart. Only then was the agent dispatched.

Dispatch: a read-only `Explore` agent (haiku), instructed to `Read` one exact
path once, with no `offset`/`limit`, and to use no other tool. It returned the
file's contents in 10.8 s using exactly 1 tool call.

---

## 2. The result

Two fires, from two different OS processes:

| # | pid | Context | `agent_id` | `agent_type` |
|---|---|---|---|---|
| 0 | 14940 | main session | **absent** | **absent** |
| 1 | 8172 | inside the dispatched subagent | `a77fe7356ca53e093` | `Explore` |

Both fired on the same file, both with `tool_name: "Read"`.

### The two obvious discriminators both FAIL

| Field | Main session | Subagent | Usable? |
|---|---|---|---|
| `session_id` | `034390c8-…` | `034390c8-…` — **identical** | **No** |
| `transcript_path` | `…/034390c8-….jsonl` | **identical** | **No** |

A gate written against either would treat an executor's read as the
orchestrator's. **This is the corruption path R1 warned about**, and it is
exactly what a careless implementation would have reached for first.

### The payload key sets, verbatim

```
main session : cwd, effort, hook_event_name, permission_mode, prompt_id,
               scratchpad_dir, session_id, tool_input, tool_name,
               tool_use_id, transcript_path

subagent     : agent_id, agent_type, cwd, hook_event_name, permission_mode,
               prompt_id, scratchpad_dir, session_id, tool_input, tool_name,
               tool_use_id, transcript_path
```

Two keys appear (`agent_id`, `agent_type`); one disappears (`effort`).
**`agent_id` is the discriminator.** `effort`-absence is a second, weaker
signal and must not be relied on — an absent key is not a positive assertion.

---

## 3. What this changes in the design

**The gate governs the MAIN SESSION ONLY. If `agent_id` is present, ALLOW.**

That single rule, forced by the evidence, collapses three of the plan's
hardest problems:

| Was | Now |
|---|---|
| **R1** — the gate blocks an executor's pre-`Edit` full read and corrupts a file | **Eliminated.** An executor's read is never seen. Read-ladder exception 1 cannot be violated because the gate never fires there |
| **D5** — the gate needs the in-flight slice's `declared_files`, sourced from the pending sidecar | **Moot.** Nothing to look up |
| **R7** — that would mean editing `orc-trace.js`, the most safety-critical file in the payload | **Eliminated.** `orc-trace.js` is not touched |

It also matches the feature's own premise and W0's own measurement. The point
was always the *orchestrator's* context; W0 counted only `isSidechain: false`
reads. Design and measurement now describe the same population.

**The decision order in `03-PLAN.md` §3 W2 gains one step, and it goes first
after fail-open:**

| # | Check | Result |
|---|---|---|
| 0 | anything throws | ALLOW (fail-open) |
| **0.5** | **`agent_id` present ⇒ a subagent is reading** | **ALLOW — new, from W1** |
| 1 | `read_gate` is `off` | allow |
| … | *(unchanged)* | |

---

## 4. Honest limits

1. **One agent type, one dispatch.** `Explore`/haiku. `agent_type` varied
   across ORC's 48 pinned agents is untested; the claim is that `agent_id` is
   *present*, not that any particular value appears.
2. **Presence is the assertion, absence is not.** The gate must test for
   `agent_id` being present, never for `effort` being absent.
3. **Not a nesting test.** An agent that dispatches another agent was not
   exercised. It does not matter for this design: any depth ≥ 1 carries
   `agent_id` and is allowed.
4. **One Claude Code version**, on Windows. The field is undocumented here and
   could change. **This is why the gate fails open** — if `agent_id` ever
   disappears, the gate over-fires on subagent reads in `warn` mode and says
   so, rather than blocking anything.
5. The subagent's own `Read` was confirmed by its return value, not assumed.

---

## 5. Cleanup

- `.claude/settings.json` restored and asserted **byte-identical** to the
  backup taken before the experiment.
- The probe hook file is deleted; no reference to it remains in settings.
- `read-gate-notes/.hookfire.log` and `.w1-target.txt` are scratch evidence,
  untracked, never committed.
