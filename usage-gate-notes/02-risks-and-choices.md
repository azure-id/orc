# The usage gate — choices, benefits, and failures

> Written in Simplified Technical English (ASD-STE100 in spirit, not in
> certification). Every command, config key, state word, model id and path is a
> value the CLI computes. These values keep their exact spelling.

Read `01-how-it-runs.md` first.

---

## 1. The four modes

You choose one mode with `usage_gate`.

| Mode | ORC shows the number | ORC stops | ORC waits | Use it when |
|---|---|---|---|---|
| `off` | no | no | no | You watch the statusline yourself. |
| `warn` | yes | no | no | This is the default. You decide each time. |
| `stop` | yes | yes | no | You are at the keyboard. You want the hand-back. |
| `wait` | yes | yes | yes | You are not at the keyboard. The run can be slow. |

`warn` is the safe default. It changes nothing. It only tells you.

---

## 2. Four answers at the gate, not one

A low window is not always a reason to stop. ORC has four cheaper answers, and
three of them cost you nothing.

| Answer | What it does | Cost |
|---|---|---|
| Use a lower band | Send the wave to a cheaper Claude agent. | fewer tokens |
| Send it off Claude | Route the wave through `orc extra`. | your provider's price |
| Stop | Write `RESUME.md`. You come back later. | none |
| Wait | Wait for the reset in short steps. | none, but slow |

The second answer is important. Your 5-hour window is a Claude window. Work
that runs on another provider does not use it. `orc extra` already exists. Low
quota is the best reason to use it.

---

## 3. What you gain

- **You lose fewer waves.** A wave that stops in the middle leaves a
  half-written file. You must find it and repair it.
- **The wait is free.** A detached command uses no tokens and no model.
- **You can leave the computer.** With `wait`, the run continues without you.
- **You see the number.** Today the number is on the statusline only. The line
  is small, and you read it after the fact.
- **Each hop makes the reading fresh.** A short hop is session activity, and
  session activity makes the statusline run again.
- **`RESUME.md` already exists.** The stop path uses a mechanism that works.

---

## 4. What it costs you

- **The reading can be old.** The statusline runs only when the session is
  active. During a long dispatch it does not run.
- **A wake-up after 1 hour costs money.** The prompt cache ends after 1 hour.
  The first turn after a long wait reads the whole context again, at the full
  input price. This happens when your quota is at its lowest.
- **The session must stay open.** A closed terminal ends the wait.
- **More code in three places.** The hook, the CLI, and every lane spine.
- **One more thing to explain.** Each new gate is one more message to read.

---

## 5. What can go wrong

| # | Failure | Cause | Result | Protection |
|---|---|---|---|---|
| 1 | The gate blocks a run with plenty of quota | The reading is 25 minutes old and the window reset in that time | You stop for no reason | Treat a file older than 30 minutes as `unknown`. Never block on `unknown`. |
| 2 | The gate does not fire | Your Claude Code is older than v2.1.80, so there are no numbers | The wave stops in the middle, as today | Print `unknown` at every gate. You always know what ORC knew. |
| 3 | The wake-up message never arrives | The user closed the terminal, or the computer slept | The run stops with no message | Write `RESUME.md` **before** the wait. The run is not lost. |
| 4 | The session waits and never returns | `resets_at` was wrong, or a reading failed each time | Your terminal is not usable | 5 hops maximum. Then stop and write the hand-back. |
| 5 | The wait costs more than the work | A 2-hour wait ends the prompt cache. The context is read again | You pay a large input cost | Do not wait for a small wave. Compare the wait with the work first. |
| 6 | The model forgets to check | The check is prose in a skill, and the model is under load | The gate does nothing | Put the block in a hook. A hook cannot forget. |
| 7 | ORC waits, and you wanted it to stop | `usage_gate: wait` is a strong default for one user and wrong for another | Two hours are lost | `warn` is the default. `wait` is opt-in. |
| 8 | The gate uses the wrong window | The 7-day window is at 96%, and the 5-hour window is at 20% | You continue, and the run stops soon | Read both windows. The worst window decides. |
| 9 | The number is saved as a word | Somebody saves `LOW` in `usage.json` | The word is wrong one minute later | Save the raw numbers. Compute the state on each read. |
| 10 | A subagent uses the quota you saved | A wave dispatches 4 agents after a green gate | You pass the gate and then exceed it | The gate is a guess, not a promise. Say this in the message. |

---

## 6. Failure 6 is the one to plan for

This repository has lost this same bet five times.

| Release | What was relayed through the model | What broke |
|---|---|---|
| v0.32.0 | trace narration | phases with no lines |
| v0.49.5 | the `RESUME.md` hand-back | a stale hand-back |
| v0.53.2 | the `orc extra` spend line | a cost report that read zero |
| v0.54.0 | the dispatch journal | no baseline for a recovery |
| v1.0.0 W5 | the demotion state | recomputed from disk instead |

Each time the answer was the same. Move the fact out of the model and into the
CLI or a hook.

A usage gate that lives only in skill prose is the same shape. Under load the
model skips it, and the failure is silent. Put the block in a hook. Let the
skill prose explain the block that the hook already made.

---

## 7. Failure 10 deserves a clear sentence

The gate reads the window **before** a wave. The wave then spends tokens. So a
green gate is not a promise that the wave finishes.

Say this in the message. Do not write "you have enough quota". Write "94% used
before this wave".

A gate that promises more than it knows is a gate that people stop trusting.

---

## 8. What cannot be fixed

Two limits have no solution in this design.

**You cannot make the reading fresh on demand.** Only Claude Code runs the
statusline. ORC cannot ask for a new reading. ORC can only wait for the next
one.

**You cannot see the quota that a subagent uses while it runs.** The numbers
arrive at the statusline, and the statusline does not run during a dispatch.

Both limits are acceptable. Both must be written in the message, not hidden.

---

## 9. Questions to answer before the plan

1. Does the gate read the 7-day window as well as the 5-hour window? A weekly
   window at 96% is a bigger problem than a 5-hour window at 91%.
2. Is the block in a hook, in the skill prose, or in both?
3. Which lanes get the gate first? All of them, or `/orc` only?
4. Does `orc doctor` report a low window? A low window is a real finding.
5. Does `orc ui` show the number? The panel shows every other state.
6. Does `/orc-budget` use the same number? It forecasts a percent of a 5-hour
   window today, from a plan. The real number is better.
7. What is the hop length? 30 minutes is a guess. 15 minutes gives a fresher
   reading and more wake-up turns.

---

## 10. My recommendation

Build parts 1 to 3 first. They are small, they are free, and they are useful
alone. Set the default to `warn`.

Build part 4 after. Make it opt-in. Make the stop path work first, because the
wait path uses the same `RESUME.md`.

Do not build the agent that waits. It uses the window that you are trying to
save.
