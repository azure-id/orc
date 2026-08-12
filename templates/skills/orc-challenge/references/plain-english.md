# Plain English — what the lint actually checks

`orc challenge lint <path> [--template <p>]` is the deterministic half of this
lane. **Everything a computer can decide must never cost a model token**, and
"is this English simple enough for a non-native reader" is *substantially*
computable.

## Two honesty rules — stated here and printed by the command

1. **It is a SIGNAL, not a verdict** — the `/orc-aftermath` rule. A long sentence
   is not automatically a defect. The lint never blocks; it feeds the judge, who
   decides whether it costs the STATED AUDIENCE anything.
2. **It is English-specific and heuristic.** The grade formula is an estimate and
   passive-voice detection is a pattern match. Say so, once, on the output.

Its real payoff: `lint.json` rides in the judge's slice, so the judge never
spends tokens counting sentences — it spends them on D2, the only dimension no
computer can reach. It is also useful standalone: `orc challenge lint README.md`
needs no cycle, no model, and no ORC run at all.

## Structure (needs `--template`)

- heading tree extracted from both, at **depth 2–3 only** (the H1 is the
  document's title; a title that differs from the template's is the document
  being about something, not a missing section)
- required sections **missing**, **out of order**, or **invented**
- **empty ceremony** — a heading with under 15 words of body. A CONTAINER (its
  next heading is deeper) is skipped: its children carry the body
- table column-count consistency
- code fences with no language tag
- relative links and `file:line` anchors that do not resolve on disk

## Prose (no template needed)

| Check | Emits | Dimension |
|---|---|---|
| Acronym used before it is defined | `L-###` at first use | D5 |
| Sentence over 25 words | `L-###`, plus a p50/p90 distribution | D5 |
| Passive voice (be-verb + participle heuristic) | a **percentage**; findings only past 25% | D5 |
| Idioms / phrasal verbs (the list below) | `L-###` | D5 |
| Sentences opening with a bare `This`/`It`/`They` | `L-###` | D3 |
| Placeholder markers | `L-###` | D6 |
| Ambiguous quantifiers | `L-###` | D6 |
| Flesch–Kincaid grade estimate | one number | — |

**Sentences are measured over PARAGRAPHS, not over lines.** A hard-wrapped
39-word sentence is still a 39-word sentence; splitting at the newline is how a
length check silently passes every wrapped document.

Code fences, tables, indented blocks, HTML comments, inline code and URL targets
are stripped before any prose metric runs. Counting a URL as a long sentence is
how a lint loses a reader's trust in one line of output.

## The curated lists

Mirrored in `bin/cli.js` (`LINT_IDIOMS`, `LINT_MARKERS`, `LINT_VAGUE`,
`LINT_COMMON_ACRONYMS`) — documented drift the token lint cannot see, because a
word list is not a single token. Change both together.

### Idioms and phrasal verbs

spin up · spun up · roll out · rolled out · kick off · kicked off · go-live ·
reach out · circle back · touch base · move the needle · low-hanging fruit ·
boil the ocean · ramp up · wind down · drill down · hash out · iron out ·
flesh out · in the weeds · on the same page · at the end of the day · bake in ·
baked in · double down · take a stab · ballpark · off the shelf

### Placeholder markers

`TBD` · `TODO` · `???` · `tbc` · `as needed` · `and so on` · `etc.` · `FIXME`

### Ambiguous quantifiers

some · several · appropriate · reasonable · quickly · efficient · efficiently ·
properly · adequate · sufficient · various · a number of · as required ·
if necessary · where applicable · robust · scalable · seamless

### Acronyms every technical reader already has

API · HTTP · HTTPS · JSON · YAML · XML · URL · URI · ID · UI · UX · CPU · RAM ·
SQL · CSV · PDF · HTML · CSS · CI · CD · PR · MR · AWS · GCP · SDK · CLI · IDE ·
OS · TLS · SSL · DNS · TCP · UDP · REST · CRUD · UUID · README · SLA · SLO · QA ·
AI · ML · LLM · ADR · PRD · TSD · FAQ

Everything else must be expanded on first use. That is a D5 finding, not a style
opinion — a reader who does not know what `SoR` means cannot check whether the
sentence is true.

## Thresholds

| | Default | Why |
|---|---|---|
| sentence length | 25 words | past this, a non-native reader re-reads |
| passive voice | 25% of sentences | a percentage, never a per-sentence finding |
| empty section | 15 words of body | below this it is ceremony, not content |

These are constants in the CLI, not config keys. A knob per threshold would turn
a signal into a negotiation.
