# Mock run — `/orc-diy`

> Your own lane. You choose which phases run and how strict they are — in the
> terminal, not in the chat.

---

## 1. What it does

The shipped lanes fix the trade between speed and rigor for you. `/orc-diy`
lets you set it yourself: which phases exist, whether scoring runs or one fixed
executor does everything, how much it asks you, and how it ships.

The important part: **the shape of your flow is written only by the `orc diy`
CLI.** Claude never invents or edits it during a session. If the flow is not
compiled, or something changed since it was compiled, `/orc-diy` refuses to run
and offers plain `/orc` instead.

That refusal is the whole design. A flow you *think* is running is worse than
no custom flow at all.

---

## 2. Compose it (terminal, zero tokens)

```bash
$ orc diy
```

```
No flow yet. Start from:
  1  full-lane defaults        every phase on
  2  lean                      analyze off, review blocking-only, verify smoke
  3  paranoid                  every gate on, small waves
  4  solo-fast                 one fixed executor, ship on commit

> 2

Created  .claude/orc-diy.config.yaml
```

```bash
$ orc diy set verify smoke
$ orc diy set scoring off
$ orc diy set fixed_executor orc-executor-sonnet-5-high
$ orc diy set ship_mode commit
$ orc diy status
```

```
STALE — 2 triggers:
  · `scoring` changed since the last compile
  · `fixed_executor` changed since the last compile
Run: orc diy compile                              (exit 1)
```

```bash
$ orc diy compile
```

```
validate    ✓  no cross-key conflicts
stitch      ✓  9 blocks, in the compiler's own order
            header · intake · plan · tdd · execution · review · verify
            · trace · ship
written     .claude/orc/diy/FLOW-COMPILED.md
stamped     .claude/orc/diy/flow.lock.json

$ orc diy status
READY   compiled 2026-08-12 · sonnet-5-high fixed · ship: commit   (exit 0)
```

---

## 3. Run it

```
> /orc-diy add the CSV export endpoint
```

```
Gate: READY  ✓   (flow.lock.json matches the config and the installed payload)

Your flow, in order:
  intake → plan → tdd → execution → verify (smoke) → ship (commit)
  analyze  OFF     review  OFF

Every task goes to orc-executor-sonnet-5-high — you switched scoring off.

… 3 tasks … smoke gate green … committed on feat/csv-export.
```

And when it is not ready:

```
> /orc-diy add the CSV export endpoint

Gate: STALE — you ran `orc update` after compiling, so the compiled flow may
point at references that changed.

I will not run a stale flow. Two options:
  · run `orc diy compile` and call me again
  · let me take this through plain /orc right now

> /orc
```

---

## 4. What to notice

- **Some things you can never configure away.** The orchestrator never
  implements, checkpoints always happen, two tasks never write the same file in
  one wave, a red build always blocks the ship. Those are locked into every
  compiled flow.
- **`opus5_only` does not reach this lane.** DIY executors come from
  `flow.lock.json`, which only the compiler writes. Set `fixed_executor` and
  `session_tier` here instead.
- **Tracing is not optional either.** The compiler stitches the trace block
  into every flow.
- **`orc diy status` is an exit code**: 0 = READY, 1 = STALE or UNCONFIGURED —
  the same convention as `orc pattern status`.

---

## 5. Related

- The full guide with every key: [`templates/skills/orc-diy/README.md`](../templates/skills/orc-diy/README.md)
- The Flow panel does all of this with buttons: [`orc ui`](orc-ui.md)
