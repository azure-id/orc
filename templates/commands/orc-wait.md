---
description: Wait for wall-clock time to pass — usually a quota window reset — without losing the run you are in
---

Run the `orc-wait` skill.

The user typed: `$ARGUMENTS`

Parse the arguments as `<spec> [mode]`, where:

- `<spec>` is `30` · `90m` · `2h` · `2h30m` · `until 18:41` · `reset`
- `[mode]` is `safe` · `soft` · `hard`, or absent
- `block <reason>` and `unblock` are the veto, not a wait — see the skill

Never compute the hops yourself. `orc wait plan <spec> --json` does that, and it
is the only place that arithmetic exists.

A wait is a STOP: write the hand-back before you wait, every time, in every
mode. `a lane that waits without a hand-back` has broken the contract.
