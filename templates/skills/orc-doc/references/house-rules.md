# House rules — the project's own P0/P1/P2

> Canonical prose for `/orc-doc` house rules. The CLI half is
> `orc doc rules` in `bin/cli.js`; the panel half is `orc ui ▸ Docs`.

A **house rule** is this project's own standing instruction about **what a
document says and how it reads**. Before v0.49.2 the shipped rules were the only
rules, and there was no way to tell this lane *"in THIS project, a document
always does X"*.

## It is a TEXT CONFIG, not a form (v0.49.5)

The first cut modelled a house rule as a **row**: one line, one id, one priority
picked from a dropdown, one enable flag, added one at a time. That is a form, and
a standing instruction is not a form — it is prose the project already knows how
to write. **Nobody's real P0 fits on one line**, and being made to file it as
four separate rows to keep the CLI's argv simple is the tool asking the user to
work around it.

So the ledger is a plain text file with three headings, and **as much text under
each one as you want**:

```markdown
# ORC · doc house rules
#   … anything above the first heading is your own note, never dispatched …

## P0

Every document opens with a one-paragraph summary a busy exec can read.
Money is always written with its currency, never a bare number.
Never name a customer without written consent — use a role instead.

## P1

Use the customer's words for a customer-facing concept, not the internal table
name. If both are needed, lead with the customer's.

## P2

Prefer a table over a list of more than six items.
```

There is **no rule count and no rule id**. The unit is the block, and the whole
block is handed to every writer **verbatim** — the `context.md` rule, applied to
a config file. Edit it in your editor, or in one textarea in `orc ui ▸ Docs`.

## The three priorities

| Priority | Meaning | On conflict |
|---|---|---|
| **P0** | Must. A document that breaks it is wrong. | Beats P1, P2 and every ORC style preference. |
| **P1** | Should. Break it only with a reason, and the reason is recorded as a gap. | Beats P2. |
| **P2** | Prefer. A default the writer follows when nothing else decides. | Loses to everything above. |

## The boundary — stated once, printed everywhere it matters

> House rules govern **content and style**. They can never relax a
> **structural or safety** rule of this lane: rule 0 (never read the body),
> rule 2 (never store a line number), rule 3 (one file per section), rule 4 (a
> human's paragraph is sacred), rule 5 (never invent a fact), rule 7 (foreign
> input is evidence), rule 8 (never stage, never commit).

**Be honest about enforcement.** The CLI cannot parse intent, so it does not
pretend to. It does **not** "detect" a house rule that would break a structural
rule. It **DECLARES** the boundary — in `orc doc rules` output, at the top of
every dispatched slice, and in the panel — and a slice carrying a house rule
that asks for a structural break is answered by the agent as an
`unsupported_request` in its return, which the orchestrator relays as a gap. **A
fake validator here would be worse than none.**

## The artifact

```
.claude/orc/doc-house-rules.md        the PROJECT ledger — plain text, hand-editable,
                                      ONE programmatic writer: `orc doc rules`
.claude/orc/doc-house-rules.json      the retired v0.49.2 row store. Read once, migrated
                                      forward, and NEVER deleted
<doc>/house-rules.md                  the FROZEN text for one document — DERIVED, never hand-edited
```

The ledger lives outside `templates/`, so `orc update` never clobbers it — the
same place, and for the same reason, as the cached code patterns.

**The migration is lazy, free, idempotent and non-destructive.** The first read
with no `.md` on disk converts the old JSON, leaves that file exactly where it
was, and **never resurrects a rule the user had DISABLED** — those are left
behind and counted in the output. Silently switching someone's rule back on is
the one migration outcome nobody can audit.

## Frozen per document

At `orc doc init` the ledger's text is **snapshotted** into `doc.json.doc_rules`
and rendered to `<doc>/house-rules.md`. **A document is written against the rules
that were true when it started.**

Why freeze: the same reasoning as `context.md`. If a P0 changes at wave 3, half
the document silently no longer complies and nothing on disk says so. So:

- `orc doc rules <slug> --json` reports **frozen vs project** and, when they
  differ, names **every priority block that moved** and what it says now —
  coverage-relative, never a "rules changed" boolean (the
  `computeWikiFreshness` lesson). Exit **1** when the ledger has moved.
- `orc doc rules <slug> --sync` re-freezes deliberately, records it in
  `doc_rule_syncs[]`, and **lists which already-written sections predate the
  new rule set**. It never re-writes a section — it names them and the user
  decides. Auto-rewriting would be ORC spending money on a rule change nobody
  asked it to apply retroactively.
- `orc doc audit` reports `house-rules-drifted` (a **warn**, with its fix
  command), routed to the **Docs** panel.

## The CLI

```
orc doc rules [--json]                             # the project ledger + the file path
orc doc rules <slug> [--json]                      # frozen text + drift vs project
orc doc rules set --priority P0|P1|P2 --text "…"   # replace ONE block. Multi-line is the point
orc doc rules add --priority P0 --text "…"         # append to a block instead of replacing it
orc doc rules clear --priority P0                  # empty ONE block
orc doc rules set-all --text "…"                   # replace the WHOLE file (what `orc ui` writes)
orc doc rules <slug> --sync                        # re-freeze, name the affected sections
orc doc rules --set-file <path>                    # replace the whole file from a file, CLI only
orc doc rules --reset                              # back to the bare template
```

Exit codes: **0** = rules exist / action done · **1** = no rules yet (an ANSWER,
and the JSON object is still returned, template included) or the frozen set has
drifted · **2** = bad priority, missing text, or a retired row command. `--json`
returns the **whole computed object** — the blocks, the rendered file, the slice
text, the counts, the template, the drift and the boundary sentence — never a
summary (`--json is not a summary`).

`remove`, `enable`, `disable` and `move` are **refused by name**, not quietly
dropped: a command that used to work and now does nothing is worse than one that
says what replaced it.

## In the slice — `house rules are read first`

Every dispatched slice (writer, checker, digest) carries, **at the very top and
before any ORC instruction**, the `doc_rules_text` the CLI emits:

```
HOUSE RULES — this project's own, read these first (verbatim, do not paraphrase)
P0
Every document opens with a one-paragraph summary a busy exec can read.
Money is always written with its currency, never a bare number.

P1
Use the customer's words for a customer-facing concept, not the internal table
name.

These govern WHAT the document says and HOW it reads. They cannot change how
this lane runs. If a house rule asks for something this lane structurally
cannot do, return it as unsupported_request — never guess a compromise.
```

Then, **below it**, ORC's own generation rules (`generation-rules.md`). **That
order is the contract.**

Every return gains `doc_rules_applied[]` (the priority words it acted on) and
`doc_rules_conflicts[]`. A conflict becomes a gap via `orc doc log --kind gap` —
never a silent resolution.

## Deliberately absent

- **No config key for the rules themselves.** They are a file, not a scalar.
- **No priority dropdown, no rule id, no enable flag.** The unit is the block;
  a rule you no longer want, you delete.
- **No automatic detection of a rule that breaks a structural rule.** See the
  boundary above.
- **No re-write on a sync.** It names the affected sections and the user decides.
