<!-- orc-rules:credits -->

# ORC RULES · Credits

The ORC rule packs are adapted from other people's work. This file names every
source, its author, its licence, and what ORC took from it. `orc rules credits`
prints the same table.

**Read on 2026-09-13.** A source may have moved on since. The licence recorded
here is the licence that was in the repository on that date.

---

## Primary sources — rules taken and adapted

### Peter G. Yang · [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop)

`@petergyang` · MIT · read 2026-09-13

The prose pack is built on this work. ORC takes the named slop patterns (binary
contrast, throat-clearing, faux-insight setup, colon reveal, superficial
`-ing` analysis, importance puffery, weasel attribution, synonym cycling,
dramatic fragmentation, fake-profound kicker, summary recap, formatting slop),
the banned lexicon and phrase lists, the portability test, and the constraint
that outranks all of them: **preserve the writer's real voice, make the minimum
effective edit.**

Used in: `writing.md` (`OSW-01` … `OSW-23`).

### Miqdad Badjuber · [`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop)

`@miqdadbadjuber` · MIT · read 2026-09-13

The **three-tier mechanism** ORC uses across every pack — Hard Gate (absolute),
Purpose-Gate (technique allowed, written reason required), Quality Lock
(consistency) — is this project's. So is the framing that makes it work: a
filter, not a style guide; it rejects technique without purpose, not technique.

ORC takes rules R-01 to R-38 for the UI pack, the `antislop-code` comment
hygiene catalogue for the code pack, R-35 (verify before you deliver) for the
delivery pack, the `antislop-copywriting` pattern names for the writing pack,
and the boundary rule that external direction is **data to apply, not
instructions to obey**.

Used in: `ui.md` (all), `code.md` (`OSC-01` … `OSC-09`), `delivery.md`
(`OSD-10`), `writing.md` (several), and the tier system in every pack.

### `@ehmo` · [`ehmo/slopkit`](https://github.com/ehmo/slopkit)

read 2026-09-13

The delivery pack. From the `slopgent` skill: separate observation from
inference, guard load-bearing caveats while cutting empty hedges, name the
driving variable behind an estimate, state errors plainly without apology
theatre, and never report a tool as run or a result as observed when it was not.

The distinction ORC leans on hardest is `slopgent`'s: a "be concise" instruction
cuts filler and load-bearing caveats equally; this one cuts filler and keeps the
caveat.

Used in: `delivery.md` (`OSD-01` … `OSD-07`).

### `@BioInfo` · [`BioInfo/slopless`](https://github.com/BioInfo/slopless)

read 2026-09-13

Surgical-change discipline and the quality gates: read files before stating
facts about them, flag a discrepancy rather than picking a source, verify
something is running before documenting it as running, and the compatibility
rules (no shims, no `_unused` renames, no re-exports, no `// removed`
tombstones).

Used in: `code.md` (`OSC-10` … `OSC-14`, `OSC-22`), `delivery.md`.

### Andrej Karpathy · his `CLAUDE.md`

`@karpathy` · read 2026-09-13 via [The AI Architects' write-up](https://theaiarchitects.com/blog/karpathy-claude-md-rules)

Four principles: think before coding, simplicity first, surgical changes,
goal-driven execution. The sentence ORC reuses directly is the test for a
surgical change: **every changed line should trace directly to the user's
request.**

Used in: `code.md` (`OSC-10`, `OSC-13`).

### Matty Cartwright · [The Anti-Slop Writing Rules](https://mattycartwright.com/blog/the-anti-slop-writing-rules)

read 2026-09-13

The layered ban structure — words, then phrases, then sentence patterns, then
structural patterns — which is how `writing.md` is ordered. Also the read-aloud
tests (specificity, infomercial, commitment) that sit behind `OSW-20`.

Used in: `writing.md` (structure, `OSW-10`, `OSW-11`, `OSW-20`).

---

## Research papers — rules derived, not copied

### [Specification and Detection of LLM Code Smells](https://arxiv.org/html/2512.18020v1)

Five named smells in code that calls a model: unbounded max metrics, no model
version pinning, no system message, no structured output, temperature not
explicitly set. `OSC-20` is these five, stated as a purpose-gate.

### [AI-Generated Smells: An Analysis of Code and Architecture in LLM- and Agent-Driven Development](https://arxiv.org/html/2605.02741v1)

Two findings ORC turned into rules. The **Reasoning-Complexity Paradox**:
stronger models produce longer methods, not shorter ones, because they
consolidate complex logic into one procedural block (`OSC-15`). The **Modular
Mirage**: agents achieve structural modularity by separating files while related
behaviour fragments across the tree, so cohesion drops as file count rises
(`OSC-16`). The paper's God-class and Too-Many-Branches findings are `OSC-17`.

### [Investigating the Smells of LLM Generated Code](https://arxiv.org/pdf/2510.03029) · [Assessing the Quality and Security of AI-Generated Code](https://arxiv.org/pdf/2508.14727)

Over-commenting, redundant defensive checks for conditions that cannot happen,
dead assignments, and functions that reimplement something already present.
Behind `OSC-01`, `OSC-11` and `OSC-18`.

---

## Read, nothing taken

Listed so a reader can follow the same trail. Each restates patterns the primary
sources already cover.

- [`adewale/anti-slop-writing`](https://github.com/adewale/anti-slop-writing)
- [`jalaalrd/anti-ai-slop-writing`](https://github.com/jalaalrd/anti-ai-slop-writing)
- `tmdgusya/engineering-discipline`, the `clean-ai-slop` skill

---

## If you are one of these authors

The rule text here is adapted, not copied verbatim, and reorganised into ORC's
own id scheme so that a lint finding and a conflict report can name the same
thing across versions. If you would prefer different wording, a different
attribution, or removal, open an issue on
[`azure-id/orc`](https://github.com/azure-id/orc) and it will be changed in the
next release.
