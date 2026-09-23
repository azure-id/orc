# `orc rules` — the anti-slop rule surface (v1.7.0)

Read this before touching `templates/skills/_shared/rules/`,
`templates/skills/_shared/phases/rules.md`, the `orc rules` family in
`bin/cli.js`, or the Rules panel.

Same authority as `CLAUDE.md`.

---

## The two halves never mix

| Half | Writer | Path |
|---|---|---|
| **ORC rules** | ORC, shipped | `templates/skills/_shared/rules/` → `.claude/skills/_shared/rules/` |
| **User rules** | the project | `.claude/orc/rules.md` |

- The packs are **read-only to the user**. `orc rules set --pack …` is refused
  BY NAME, with the command that replaces it. Never add a route, a button or a
  flag that writes to them — a control that exists only to be refused is a
  control that lies.
- `userRulesWrite()` is the **only** writer of the ledger. The panel goes
  through `orc rules set-all`, the same as a script would.
- **`/orc-doc` is excluded from all of it.** That lane has `orc doc rules`.
  Excluded means excluded: do not share a matcher, a lint or a slice with it.

## The pack file format is a contract

```
### OSW-01 · HARD · Lead with the point
<body, to the next ###, the next "## ", or a --- >
```

- The `---` terminator is **not optional**. Without it the pack's own horizontal
  rule bleeds into the last rule of every file and rides into every slice.
- **An id is never renamed.** A finding, an override and a slice line all name
  the same thing across versions.
- Adding or removing a rule changes the count in `orc rules --json`, the lint's
  coverage line, and `test/cli/rules.test.js`. That test asserts 65 on purpose —
  update it in the same commit.

## Precedence, and the sentence that keeps getting misread

```
house rules  >  user rules  >  ORC rules
```

**Layer 1 is CODE and BEHAVIOUR only.** It never overrules a writing rule,
because it does not speak about prose at all. Any prose that implies otherwise
is wrong and should be fixed on sight.

**Layer 2 beats layer 3 outright.** The ORC rule is removed from the slice, and
the removal is stated inside it.

## Never build an intent parser

The CLI counts ORC rule ids the user **named**, and says that is what it
counted. Everything else is the agent's `rules_conflicts[]` at dispatch.

Do not "improve" this by detecting contradictions, and do not add a validator
for the structural boundary. A validator that is right often enough to be
trusted and wrong often enough to matter makes a clean pass mean nothing. This
is the `orc doc rules` decision, and it is settled.

## One assembler, and the cost it owns

`orc rules slice --lane <lane> [--pack ui]` builds the card. **No skill ever
concatenates the packs, re-orders them, summarises a rule, or drops one.**

It rides on every spawn. Measured at v1.7.0: ~3 600 tokens per build-lane slice,
~4 300 with the UI pack, ~2 200 for a prose lane. If that has to come down the
lever is `rulesSlice()` in `bin/cli.js` — **never a lane trimming its own card**,
which is the drift this exists to prevent arriving disguised as a saving.

`ui` rides **per TASK**, never per lane.

## The card is a slice FIELD, not a preflight line (v1.7.1)

The slice field is `rules_card` = the `text` of `orc rules slice`, injected
directly under `house_rules` at EVERY dispatch site. The `line` is only the
report. v1.7.0 shipped the line and no dispatch site named the card, so agents
got house rules only. `rules_card` is a registered contract token — a new
dispatch site that carries `house_rules` must carry `rules_card` too, and
`test/payload.test.js` checks it.

## The lint stays small, and says so

13 of 65. The coverage line — `not checked here: N rules. They need a reader,
not a matcher.` — prints in **every** mode, human and JSON, clean or not. It is
asserted by a test. Do not make it conditional, do not shorten it, and do not
add a check the matcher cannot actually prove.

**No gate.** Findings are advisory. A style preference that fails a build gets
switched off within a week, and then nothing is enforced at all.

Exemptions are counted, never silent: a rules pack (its head carries an
`orc-rules:` marker), and `orc-rules-ignore-file` / `orc-rules-ignore`.

## Credit is a shipped artifact

Every pack opens with a `Source` block. `CREDITS.md` carries the long form and
the date each source was read. `orc rules credits --json` returns the table as
data, and the panel renders it.

If a rule is added or reworded, its source line goes with it. Removing an
attribution is not a cleanup.

## Registry changes travel in threes

`RULE_LANE_PACKS`, `LANE_PHASES.rules` and the `rules-slice` catalogue row must
name the same 28 lanes. `test/cli/rules.test.js` holds them together.

Two traps already paid for:

- **The catalogue row must not read `RULE_LANE_PACKS`** — that table is declared
  far below the CALLS registry and the reference is a temporal dead zone that
  crashes every command. Spell the lanes out.
- **A call is catalogued only after the lane spines NAME it.** The lint measures
  the spines and requires `lanes[]` to match exactly.

## Contract-lint false positives

`bin/verify-contracts.js` matches fixed substrings. A rules pack that happens to
contain another contract's token is a **false positive** — reword the pack, do
not register it in that contract's file set. A file that genuinely describes the
contract gets registered. Know which one you have.

## Spine budgets

The `## Rules` pointer is six lines in every spine, and three budgets were
raised deliberately for it (`orc-mini` 260, `orc-analyze` 260, `orc-fast` 230).
Detail belongs in `_shared/phases/rules.md`, which is free until the phase
fires. If the pointer grows, shrink it — do not raise a budget again without
writing the reason in the table.
