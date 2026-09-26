# Shared contract — the lane contract (Calls · Config · Rules · Trace · Phases · Wait)

Canonical file: `_shared/lane-contract.md`. It holds, ONCE, the text that every
coding-lane spine used to repeat in six blocks. **Read it ONLY when a CLI call
exits ≠ 0.** Otherwise the spine's pointer lines are enough: each pointer names
the lane's OWN values (its `orc lane calls` / `orc lane config` spelling, its
trace token and tier, its checkpoint and safe point). This file never restates
those values, and a spine never restates this file.

## Calls

**ONE catalogue, and it is not you:** `orc lane calls <lane> --json` names every
CLI call the lane makes. Each row gives the exit-code contract, the cost, when
to run the call, and what an EMPTY answer means.

- Never invent a spelling. Never re-word an exit code.
- Never re-derive a state word. The CLI's state words are the only state words.
- **An exit code is an ANSWER wherever that contract says so, not a failure.**
- A call that the answer does not name is a call the lane does not make.
- The catalogue itself exits ≠ 0 → say that the CLI is unavailable. Before you
  run a command, name it out loud.

## Config

**ONE resolver, and it is not you:** `orc lane config <lane> --json`. A spine
carries ONE of two forms. `bin/verify-contracts.js` decides which one.

- **Full form** — the lane reads a contested, gated or inert key. Obey
  `effective`. Print every line in `announce[]` VERBATIM at preflight. Honour
  `stops[]` before wave 1 (or before the lane's first unit of work, which the
  spine names).
- **Short form** — the lane reads nothing contested, gated or a stop. Obey
  `effective`. The lane owes no preflight line and has no gate to honour.

Both forms:

- Never merge `.claude/orc.config.yaml` yourself.
- Never re-derive a value, a precedence or an inertness from that file. A key
  that the lane does not read is not in the answer. A key that another key
  shadows comes back already marked.
- Exit ≠ 0 → say that the CLI is unavailable. Fall back to the documented
  defaults of `config-precedence.md`, out loud.
- Priorities and families: `config-precedence.md`.

## Rules — the anti-slop card

`orc rules slice --lane <lane> --json` is the ONLY assembler. Never build the
card in the spine. Canonical: `phases/rules.md`.

- The card rides under the house rules and above the task:
  **house rules > your project's rules > ORC's own packs**.
- Its `line` prints VERBATIM at preflight.
- Returns gain `rules_applied[]`, `rules_conflicts[]` (a gap, never a silent
  choice) and `rules_overridden[]`.

## Trace

Canonical: `phases/trace.md` (layer `core`, loaded at run start).
`orc lane phases <lane> --json` names the file and the layers, and its
`trace_grammar` gives the verbs. The tier table in `trace.md` defines the
packet count for each tier. The spine names only its token, its tier, its own
unit, and its run-start step. Nothing else about the protocol is restated in a
spine.

## Phases

`orc lane phases <lane> --json` is the lane's pipeline: the ordered list, where
each phase lives, and how much of it to read.

- **The CLI owns the order.** Never derive it from the spine's headings.
- Never renumber or rename a phase heading without the manifest. A
  `read: section` pointer names a HEADING, so a renamed heading is a pointer
  into nothing.

## Wait

Canonical: `wait.md`. The spine names its checkpoint and its safe point, the
same values as `orc wait lanes`. The modes, the safe points and the
never-begin-a-wait list are in `wait.md` only.

- Checkpoint `none` → nothing to checkpoint, so the three modes behave the
  same. Say so. Do not ask.
- Any other checkpoint → `soft` FORCES the checkpoint and does NOT stop if the
  write fails. `hard` skips it and can lose an in-flight return.
