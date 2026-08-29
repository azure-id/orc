# Shared contract — config precedence: ranks, families, and one resolver per lane

Canonical rule for how EVERY ORC lane learns what it is configured to do.
Consumed by every lane that reads a setting; the lint pins the
`config-precedence.md` pointer into each of them.

Two sentences carry the whole file:

> **ONE resolver, and it is not you:** `orc lane config <lane> --json`.
>
> **Read a family top-down and stop at the first rank that resolves.**

---

## 1. The resolver

A lane never reads `.claude/orc.config.yaml`. It runs
`orc lane config <lane> --json` once, at preflight, and obeys the answer.

| field | what a lane does with it |
|---|---|
| `effective` | the flat answer. Obey it and reason about nothing. |
| `announce[]` | print every line VERBATIM at preflight, before the first dispatch |
| `stops[]` | every value that can HARD-STOP this run; honour each before wave 1 |
| `keys[]` | per key: `value`, `default`, `prio`, `family`, `state`, `is_shadowed` / `shadow_reason`, `is_inert` / `inert_reason` |
| `families{}` | which rank answered each question, and why the rest were not read |
| `not_read[]` | the keys this lane deliberately ignores |

`not_read[]` is an ANSWER, not a gap. "This lane does not read `doc_language`"
is information, and it is what makes the two-way registry lint possible.

**Never re-derive a value, a precedence, or an inertness.** A key this lane does
not read is not in the answer; a key another key shadows comes back already
marked, with the sentence already worded. A lane that reasons *"`opus5_only` is
on, so the fable block must be inert"* has forked the resolver — it reads
`is_shadowed` and prints `shadow_reason`.

---

## 2. Ranks, and the rule that makes them mean something

Every key declares `answers[]`: which FAMILY question it answers, at which
RANK (`P0` · `P1` · `P2` · `P3`), in which MODE.

> **Read a family top-down and stop at the first rank that resolves.**
> If the P0 key of a family resolves, P1, P2 and P3 of that family are **not
> read at all** — not consulted, not defaulted, not mentioned as a fallback. A
> rank below a resolved rank has no effect and no meaning for this decision.

**A rank compares only INSIDE its family.** `log_dir` being P2 and `opus5_only`
being P1 says nothing whatever: they never compete. A family whose keys do not
compete has every key at P2, the neutral rank, and the lint asserts it — rank
distinctness is required only where a family is declared contested.

| `mode` | resolves when | effect on the ranks below it |
|---|---|---|
| `replace` | the key is set to a truthy / non-default value | every lower rank is shadowed, entirely |
| `overlay` | the key is on **and** at least one row applies to THIS decision | lower ranks are shadowed only for the ranges or slots it covers |
| `gate` | — | it never resolves the family; it makes its own dependants **inert** (§4) |

An `overlay` resolves PARTIALLY, so the honest report is WHICH ranges and WHICH
positions it took — never a single word. The ranges it did not take fall through
to the next rank normally. That is what lets "cheap work goes to a foreign
worker, hard work stays on Opus 5" be two rows rather than a table rewrite.

**The lowest rank of a contested family is TOTAL.** Something must answer when
nothing above resolved, so that terminal row is the shipped default and it is
declared as a row, not as a key — a fall-through is not a setting.

---

## 3. The two contested families

Everything else is uncontested: one question, no competition, every key P2.

**`executor-band` — which model executes a SCORED task**

| rank | key | mode | |
|---|---|---|---|
| P0 | `extra_enabled` | overlay | a route row covering this score sends it off Claude |
| P1 | `opus5_only` | replace | the fixed 2-band Opus 5 ladder |
| P2 | `rubric_bands_override` | replace | hand-edited, registry-less by design; resolves on PRESENCE |
| P3 | — | terminal | the shipped score→model table |

**`fixed-role-model` — which model runs a role that has no score**

| rank | key | mode | |
|---|---|---|---|
| P0 | `extra_enabled` | overlay | a slot row holds that POSITION |
| P1 | `opus5_only` | replace | the shipped Opus 5 variant of that position's agent |
| P2 | — | terminal | the agent shipped for that position |

Said once, for both shapes: **extra decides whether a Claude agent runs at all;
`opus5_only` and the score tables only decide WHICH Claude agent runs where
extra did not take it.** Under a taken band or a taken slot, `opus5_only` is
**not consulted** — not "inert" — and it stays fully live everywhere else.

---

## 4. A gate is not a rank — it is inertness

`extra_enabled: false` does not lose a precedence contest. It means **no
`extra_*` key is consulted at all**. A key declares `gated_by`, inherits its
gate's row, and comes back `inert` with the reason already worded.

Lane-level inertness is a THIRD thing, with nothing in the config file involved:

| lane | inert | reason (must not be softened) |
|---|---|---|
| `/orc-quick` | `opus5_only`, `rubric_bands_override`, `extra_*` | this lane asks WHICH AGENT before every dispatch — a config that silently answered that question would break the lane's entire premise |
| `/orc-challenge` | `opus5_only` | every agent in this lane is already `claude-opus-5` — a **no-op; the lane is unaffected, not exempt** |
| `/orc-doc` | `opus5_only` | the same — unaffected, not exempt |

**"Unaffected, not exempt"** survives verbatim. A generic "not applicable" loses
the fact that turning the key on breaks nothing here.

---

## 5. `announce[]` — and its exact boundary

A shadowed setting must never be silent, and work must never leave Claude
without the run saying so. Those lines are computed, worded once by the CLI, and
printed by the lane verbatim.

| goes in `announce[]` | stays with the lane |
|---|---|
| anything derivable from config + disk the CLI already reads: the wiki tier, pattern-cache presence, crosslink state, extra route rows and taken slots, pact / boundary / challenge state, which keys are shadowed or inert, the resolved scan tier, a run-scoped demotion | anything needing a per-task or per-run value the CLI cannot know: a task's score, a task id, a slug, a file count, a forecast number, a wave index |

A line needing a runtime value is **not** emitted as a template with holes. Half
a sentence from the CLI and half from the model is worse than either — it is a
sentence nobody owns. Those lines stay with the lane.

---

## 6. The ladder can move at runtime

A profile that stalls twice in one run, or holds one live attempt quiet past
`extra_demote_stale_min`, is DEMOTED to the bottom of its families for the rest
of that run — so the next rank down becomes the effective P0. The verdict is
recomputed from disk on every read and never stored; it is run-scoped and never
touches the config file; it is never promoted back on its own; and it is
ANNOUNCED, because the mirror of sending work off Claude silently is quietly
stopping. Full rule: `extra-dispatch.md`.

---

## 7. When the CLI is not there

Exit ≠ 0, or the command is not found:

1. **Say so, in one line.** Fail open with the failure stated.
2. Use the documented defaults below.
3. Treat **every P0 forcing mode as OFF**.
4. Never guess a user override, and never present a default as a resolved value.

The floor is the keys a run cannot start without — `max_wave_tasks: 3` ·
`batch_pause_every: 2` · `rubric_bands: 5` · `max_scouts: 3` ·
`default_analysis_depth: standard` · `generate_tests: false` ·
`pattern_findings: ask` · `security_review: off`.

Every other key's default is the CLI's to state. **A lane never guesses one** —
if a decision needs a key not on that list and the CLI cannot answer, the lane
says which key it could not resolve and stops, rather than inventing a value the
user may have overridden.

---

## 8. The `## Config` section every lane carries

Verbatim, and identical in every lane but its own name:

```markdown
## Config

**ONE resolver, and it is not you:** `orc lane config <lane> --json`. Obey
`effective`, print every line in `announce[]` VERBATIM at preflight, and honour
`stops[]` before wave 1. Never re-derive a value, a precedence or an inertness
from `.claude/orc.config.yaml` — a key this lane does not read is not in the
answer, and a key another key shadows comes back already marked. Exit ≠ 0 → say
the CLI is unavailable and fall back to `../_shared/config-precedence.md`'s
documented defaults, out loud. Priorities and families:
`../_shared/config-precedence.md`.
```

---

## 9. The file the user edits

`.claude/orc.config.yaml` holds only the keys the user changed, sits outside
`templates/` (so `orc update` never clobbers it), and is written exclusively by
`orc config set`. It is grouped by the QUESTION each key answers, ordered by
rank only inside a contested family.

`orc config set` regenerates its own group comments on every write and
**never rewrites a value it was not given**: a comment the user wrote stays with
the key it sits above, and a hand-edited multi-line block survives byte for
byte. A key written under a retired spelling is rebuilt under its current name —
a renamed mechanism must never be a silent revert.
