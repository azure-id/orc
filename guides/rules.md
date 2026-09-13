# Rules — `orc rules` in detail

README overflow. The short version is in the README under *Rules that keep the
slop out*; this is everything that would have bloated it.

---

## Two halves that never mix

| Half | Who writes it | Where it lives | Changes when |
|---|---|---|---|
| **ORC rules** | ORC | `.claude/skills/_shared/rules/` | `orc update` |
| **Your rules** | the project | `.claude/orc/rules.md` | you type |

The ORC rules are **read-only to you**. A write aimed at them is refused by
name, with the command that replaces it:

```
$ orc rules set --pack writing --priority P0 --text "…"
❌ ORC rules are read-only — they change with `orc update`, never with a command.
   Write your own instead: orc rules add --priority P0 --text "…" (yours win on any conflict).
```

`/orc-doc` reads none of this. That lane has its own ledger (`orc doc rules`)
and its own frozen-per-document mechanic, and the two surfaces are kept apart on
purpose.

---

## The 65 rules

| Pack | Ids | Rules | Applies to |
|---|---|---|---|
| Writing | `OSW-01…23` | 23 | every word an agent writes |
| Code | `OSC-01…22` | 22 | source an agent writes or edits |
| Delivery | `OSD-01…10` | 10 | what an agent reports about its own work |
| UI | `OSU-01…10` | 10 | front-end work only |

`orc rules packs` prints the table. `orc rules show <pack>` prints one pack.

### The three tiers

| Tier | Meaning | On a finding |
|---|---|---|
| **HARD** | Absolute. No exception, no purpose that redeems it. | A finding. |
| **PURPOSE** | The technique is allowed. It needs a written one-line reason. | A missing reason is a finding; the technique is not. |
| **LOCK** | A consistency requirement. | Reported, never blocking. |

The tier system is Miqdad Badjuber's, from
[`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop), and it
exists for a reason worth stating: **a ban list alone leaves a void, and a model
fills a void with its most generic output.** A purpose gate asks for the reason
instead, which is the only thing that separates craft from a default.

### The UI pack rides per TASK

`ui` is in no lane's default set. The orchestrator adds it to a single slice
when that task's declared files are front-end — `.css`, `.scss`, `.html`,
`.jsx`, `.tsx`, `.vue`, `.svelte`, or a directory the wiki or the cached pattern
names as the UI layer.

A UI rule in a backend slice is tokens paid on every spawn for a rule that
cannot apply.

---

## Precedence, and the sentence people get wrong

```
house rules  >  your rules  >  ORC rules
```

**The house card is CODE and BEHAVIOUR only.** It governs how a change is made:
surgical, simple, honest, in-slice. It says nothing about the words an agent
writes, so it never overrules a writing rule — *it does not speak about prose at
all.*

**A project rule beats an ORC rule outright.** Not a waiver and not a
negotiation: the ORC rule is removed from the slice, and the removal is stated
inside it.

To switch an ORC rule off, name its id in a rule of your own:

```
$ orc rules add --priority P1 --text "OSW-13: em dashes are our house voice."
✓ P1 extended — 1 line
  ORC 65 (W 23 · C 22 · D 10 · U 10) · yours 3 lines (P0 2 · P1 1) · 1 override
```

### How an override is counted, and why it is counted that way

The CLI counts ORC rule ids you **named**. It says so in the same breath:

> counted from ORC rule ids you NAMED in your own rules. A conflict you did not
> name is found by the agent at dispatch and returned as `rules_conflicts[]` —
> the CLI cannot parse intent, so it does not pretend to.

That split is deliberate. A validator that guessed whether one of your sentences
contradicted a rule would be right often enough to be trusted and wrong often
enough to matter, and a clean pass would then mean nothing. The agent is the only
reader that can tell, so the agent is where the answer comes from.

**An override is never silent.** It appears in the preflight line, in the panel,
and inside every slice.

---

## Your ledger

`.claude/orc/rules.md`. Plain text, three headings, and as much text under each
as you want.

```markdown
# ORC · project rules
#   … anything above the first heading is your own note, never dispatched …

## P0

Never name a customer in a commit message or a PR body. Use the account id.
Every public function in src/api/ carries a one-line comment naming its caller.

## P1

Prefer Result<T, E> over throwing inside src/core/.

## P2

Say "customer", never "user", in anything a customer reads.
```

| Priority | Meaning | On conflict |
|---|---|---|
| **P0** | Must. A run that breaks it is wrong. | Beats P1, P2 and every ORC rule. |
| **P1** | Should. Break it only with a reason, and the reason is recorded as a gap. | Beats P2. |
| **P2** | Prefer. A default when nothing else decides. | Loses to everything above. |

**There is no rule id and no rule count on your side.** The unit is the block,
and the whole block is handed to every agent verbatim. This is the `orc doc
rules` design, reused without change, because that argument was already had: a
standing instruction is prose, not a form, and nobody's real P0 fits on one line.

### The commands

```
orc rules [--json]                       both halves + the precedence ladder   0 / 1
orc rules packs [--json]                 the pack table (read-only)            0 / 2
orc rules show <pack> [--json]           ONE pack, rule by rule                0 / 2
orc rules user [--json]                  YOUR ledger and where it lives        0 / 1
orc rules credits [--json]               every source, author and licence      0 / 2
orc rules slice --lane <lane> [--pack ui]  THE dispatch text                   0 / 2

orc rules set   --priority P0 --text "…"   replace ONE block
orc rules add   --priority P0 --text "…"   append to a block
orc rules clear --priority P0              empty ONE block
orc rules set-all --text "…"               replace the WHOLE file (what `orc ui` writes)
orc rules --set-file <path>                replace it from a file
orc rules --reset                          back to the bare template
```

Exit `1` on a read means **no project rules yet**. That is an answer, and the
JSON object still comes back with the template in it.

`orc ui` ▸ **Rules** is the same thing with a text box and a Save button.
Nothing is written until you press Apply, the pending edit is named, and Discard
appears only while there is something to discard.

---

## The lint

```
orc rules lint <path…|--staged|--diff> [--pack w,c,d,u] [--json]
```

Free, deterministic, zero tokens. Exit `0` clean · `1` findings · `2` nothing to
lint.

It checks **13 of the 65 rules** — the ones a string match can prove:

| Checked | Rules |
|---|---|
| Banned lexicon and phrases | `OSW-10` `OSW-11` `OSU-06` |
| Em dash density | `OSW-13` |
| Emoji in a heading | `OSW-18` |
| Comment shapes | `OSC-02` `OSC-03` `OSC-04` `OSC-05` `OSC-06` `OSC-07` |
| Unrequested artifact files | `OSC-21` |
| `outline: none` with no replacement | `OSU-03` |

And it prints, in **every** mode, human and JSON:

```
checked 13 rules of 65 — not checked here: 52 rules. They need a reader, not a matcher.
```

That line is the point of the command. A lint that implied it had graded all 65
would let a clean exit stand in for a review that never happened.

**Findings are advisory.** There is no gate. A style preference that fails a
build gets switched off within a week, and then nothing is enforced at all.

### What it skips, and why it says so

- **The rule packs themselves.** A rule that bans a word has to print that word
  to define it, so the packs would fail their own lint on every line — and a
  lint whose loudest findings are its own documentation is a lint people learn
  to ignore.
- **`orc-rules-ignore-file`** in a file's head, or **`orc-rules-ignore`** on a
  line: your own opt-out.

Both are counted in the output. An exemption nobody can see is a file that
passed without being read.

### Em dash is a DOSE rule, not a ban

`OSW-13` is measured per file, never per occurrence:

- short output (a chat answer, a commit body, a label): none;
- a long document: at most two per thousand words.

ORC's own documentation uses em dashes, and a rule the shipping project breaks
on every page is a rule nobody will believe. The lint reports **density**.

---

## In a run

Every lane that writes words or code carries a card in every slice it
dispatches, assembled by one command (`orc rules slice`) and never by a skill:

```
1  HOUSE RULES              how a change is made
2  YOUR PROJECT'S RULES     read first, and they win
3  ORC RULES                the anti-slop baseline
4  the task
```

Preflight prints one line:

```
rules:    ORC 65 (W 23 · C 22 · D 10 · U 10) · yours 9 lines (P0 4 · P1 2 · P2 3) · 1 override
rules:    ORC 65 (W 23 · C 22 · D 10 · U 10) · yours none
```

Both spellings are mandatory in their state. `yours none` says this project has
not written its own rules — a different fact from the CLI failing to look.

Every return gains three fields:

| Field | What it holds |
|---|---|
| `rules_applied[]` | the ids the agent acted on |
| `rules_conflicts[]` | two rules that disagree. **A gap, never a silent choice** |
| `rules_overridden[]` | an ORC id a project rule replaced |

### The cost, stated

The card rides on **every spawn**. Measured at v1.7.0: about **3 600 tokens** per
build-lane slice, **4 300** with the UI pack, **2 200** for a prose-only lane.

It is already the cheap shape — HARD rules carry their body, PURPOSE and LOCK
rules carry one line each plus the file to open when one applies. If it has to
come down, the lever is `rulesSlice()` in the CLI, and never a lane trimming its
own card.

---

## The boundary

Rules govern **what is written and how it reads**, and **what shape of code is
acceptable**. They can never change how a lane **runs**: the scoring, the wave
order, the gates, the dispatch contract, the ship rules, or any lane's
structural and safety rules.

A rule that asks for one of those comes back as `unsupported_request` and is
relayed as a gap. Never a guessed compromise.

There is no detector for this, and there will not be one. The CLI declares the
boundary and does not pretend to enforce it — the same decision `orc doc rules`
made, for the same reason.

---

## Credit

The rules are adapted from other people's work. `orc rules credits` prints the
whole table; `CREDITS.md` beside the packs is the long form, with the date each
source was read.

| Source | Author | Licence |
|---|---|---|
| [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop) | Peter G. Yang | MIT |
| [`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop) | Miqdad Badjuber | MIT |
| [`ehmo/slopkit`](https://github.com/ehmo/slopkit) | `@ehmo` | see repo |
| [`BioInfo/slopless`](https://github.com/BioInfo/slopless) | `@BioInfo` | see repo |
| Karpathy's `CLAUDE.md` | Andrej Karpathy | — |
| [The Anti-Slop Writing Rules](https://mattycartwright.com/blog/the-anti-slop-writing-rules) | Matty Cartwright | — |

Plus three papers on LLM code smells:
[2512.18020](https://arxiv.org/html/2512.18020v1) ·
[2605.02741](https://arxiv.org/html/2605.02741v1) ·
[2510.03029](https://arxiv.org/pdf/2510.03029).

If you are one of these authors and would prefer different wording, a different
attribution, or removal, open an issue on
[`azure-id/orc`](https://github.com/azure-id/orc).
