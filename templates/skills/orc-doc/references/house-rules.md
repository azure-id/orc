# House rules — the project's own P0/P1/P2

> Canonical prose for `/orc-doc` house rules. The CLI half is
> `orc doc rules` in `bin/cli.js`; the panel half is `orc ui ▸ Docs`.

A **house rule** is this project's own standing instruction about **what a
document says and how it reads**. Before v0.49.2 the shipped rules were the only
rules, and there was no way to tell this lane *"in THIS project, a document
always does X"*.

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
.claude/orc/doc-house-rules.json      the PROJECT ledger — ONE writer: `orc doc rules`
<doc>/house-rules.md                  the FROZEN set for one document — DERIVED, never hand-edited
```

The ledger lives outside `templates/`, so `orc update` never clobbers it — the
same place, and for the same reason, as the cached code patterns. `text` is stored
**verbatim** and re-emitted verbatim — the `context.md` rule. A rule is **one
line**; a multi-line `--text` is REFUSED by name with the hint to add it as two
rules.

## Frozen per document

At `orc doc init` the enabled rules are **snapshotted** into
`doc.json.doc_rules` and rendered to `<doc>/house-rules.md`. **A document is
written against the rules that were true when it started.**

Why freeze: the same reasoning as `context.md`. If a P0 changes at wave 3, half
the document silently no longer complies and nothing on disk says so. So:

- `orc doc rules <slug> --json` reports **frozen vs project** and, when they
  differ, names **every** rule that was added, changed or removed —
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
orc doc rules [--json]                             # the project ledger
orc doc rules <slug> [--json]                      # frozen ledger + drift vs project
orc doc rules add --priority P0|P1|P2 --text "…"   # one line, verbatim
orc doc rules remove <id>
orc doc rules enable|disable <id>
orc doc rules move <id> --priority P1              # a re-prioritise, recorded
orc doc rules <slug> --sync                        # re-freeze, name the affected sections
orc doc rules --set-file <path>                    # bulk replace, CLI only
orc doc rules --reset                              # remove all
```

Exit codes: **0** = rules exist / action done · **1** = no rules yet (an ANSWER,
and the JSON object is still returned) or the frozen set has drifted · **2** =
bad priority, unknown id, or multi-line text. `--json` returns the **whole
computed object** — the ledger, the frozen set, the drift list, the boundary
sentence — never a summary (`--json is not a summary`).

## In the slice — `house rules are read first`

Every dispatched slice (writer, checker, digest) carries, **at the very top and
before any ORC instruction**:

```
HOUSE RULES — this project's own, read these first (verbatim, do not paraphrase)
  P0  …
  P1  …
These govern WHAT the document says and HOW it reads. They cannot change how
this lane runs. If a house rule asks for something this lane structurally
cannot do, return it as unsupported_request — never guess a compromise.
```

Then, **below it**, ORC's own generation rules (`generation-rules.md`). **That
order is the contract.**

Every return gains `doc_rules_applied[]` (ids) and `doc_rules_conflicts[]`.
A conflict becomes a gap via `orc doc log --kind gap` — never a silent
resolution.

## Deliberately absent

- **No config key for the rules themselves.** They are an artifact with a
  ledger, not a scalar; a config key could hold exactly one of them.
- **No automatic detection of a rule that breaks a structural rule.** See the
  boundary above.
- **No re-write on a sync.** It names the affected sections and the user decides.
