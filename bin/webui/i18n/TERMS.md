# Panel wording — the term list

> One page. It exists so the next two hundred strings stay consistent, because
> without it a wording pass drifts back within two releases.

The panel's **instruction text** is written in Simplified Technical English
(ASD-STE100 in spirit, not in certification). Instruction text is anything the
user must **act on**: a button, a field label, a hint, an error, a gate, a
countdown, an install or connect step.

**Rationale prose keeps its voice** and only gets shorter. Sentences like *"It
stops someone at your keyboard, not someone who copied the file"* draw a
distinction STE has no vocabulary for; flattened, they become true and useless.

---

## The rule that is not negotiable

> **NEVER simplify a CLI-computed value.**

A state word, an exit reason, a doctor message, a config key, a model id, a
provider id, a path, a band or a command is **not prose** and is not the panel's
to rewrite. A simplified state word is a state that does not exist — the same
failure as a translated config key.

This applies to `bin/cli.js --json` output in every panel, in every language.

---

## How to write an instruction

- One instruction per sentence.
- 20 words maximum.
- Active voice, present tense, "you" as the subject.
- The condition comes **before** the action: *"If the test is green, save the key."*
- No phrasal verb where a single verb exists.

---

## One word, one meaning

Pick the left column. Never use the right column for the same idea.

| use | never |
|---|---|
| **connect** (make a connection to a provider) | add, link, hook up, set up |
| **test** (prove a connection answers) | probe, ping, check, try |
| **delete** (remove permanently) | remove, forget, drop, clear, wipe |
| **save** (write and keep) | store, persist, remember |
| **enable** / **disable** | turn on, turn off, switch on, activate |
| **configure** | set up, sort out |
| **run** (execute a command) | fire, kick off, trigger, invoke |
| **open** (a file, a window, a terminal) | bring up, pull up, launch |
| **install** | get, grab, pull |
| **refresh** (read again) | reload, re-fetch, sync |
| **stop** (end before it finishes) | halt, abort, kill, cancel |
| **wait** | hold, pause, hang on |
| **choose** | pick, select from |
| **show** | display, render, surface |
| **key** (a credential value) | token, secret, api key |
| **passphrase** (what opens the vault) | password, phrase, secret |
| **deadline** (when a saved passphrase ends) | expiry, timeout, TTL, lifetime |
| **connection** (a configured profile) | profile, endpoint, provider link |
| **document** | doc, file, artefact |
| **section** | part, chunk, block |
| **command** | line, invocation |

Two exceptions, both because they are the CLI's own words and the rule above
outranks this table:

- `profile` where the CLI prints `profile`;
- `ping`, `probe` and `forget` where they are the **name of a command**
  (`orc extra ping`, `orc extra session --forget`).

---

## Where each rule applies

| STE, strictly | keep the voice |
|---|---|
| button and control labels | the honesty sentences (the passphrase deadline, `tok=none`, "zero reroutes is not evidence") |
| field labels and hints | the boundary card |
| error and refusal text | the "why this design" notes |
| every gate and countdown sentence | trace-format explanations |
| install and connect steps | |
| the passphrase modal, **end to end** — it is a procedure and it cannot be dismissed | |

---

## Keys that keep their voice

The default is STE: **a new key is instruction text unless it is listed here.**
Opting out is a deliberate line in a diff somebody reads, which is the same
shape as the contract-lint table.

These are the sentences doing the most work in this subsystem, and STE has no
vocabulary for the distinctions they draw. Flattened, they become true and
useless. The test parses this fenced list by name.

```prose-keys
extra.boundary.leaves
extra.boundary.whom
extra.boundary.cannot
extra.boundary.fence
extra.boundary.probe
extra.providers.subWhy
extra.providers.noModels
extra.providers.stale
extra.routing.gapWhy
extra.gate.hiddenWhy
extra.cost.noRate
extra.cost.sourcesWhy
extra.live.noReport
extra.tools.subWhy
extra.tools.altNone
extra.tools.neverElevates
extra.add.vaultWarn
extra.session.honesty
extra.lanes.subWhy
extra.guard.subWhy
extra.recovery.noteWhy
extra.demotion.noteWhy
extra.slots.subWhy
extra.slots.keepsSlotWhy
```

---

## What is NOT checked automatically

There is no STE checker in this repo and there is not going to be one: a real
one needs the approved dictionary, which is licensed. A test asserts the cheap
half — no string in the STE set is over 20 words, and no banned synonym appears
— and the rest is this page plus review. A checker that half-works would be
worse than none, because people would trust it.
