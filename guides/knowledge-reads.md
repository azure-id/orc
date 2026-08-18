# What ORC knows about your project — the reads

> Every command here is **free**. None of them scans, refreshes, or spends a
> model token. They tell you what is already on disk.

This is the overflow from the README, so it can be as detailed as it needs to be.

---

## The rule these all live under

> **`--json is not a summary`** — a read's `--json` is the WHOLE computed object.
> A field the human path prints and the JSON omits is drift, and it is drift no
> lint can catch, because both halves live in one function.

Before v0.49.1, `orc wiki status --json` emitted five numbers while its own
terminal output printed the per-doc breakdown, the top five stale docs, and **the
name of the doc actually pinning the tier**. `orc ui` therefore could not be as
detailed as the terminal, no matter how well it was written.

Every legacy key kept its name, its position and its meaning — `orc doctor`, the
Overview tile and the skills' artifact probe all read them — so the change is
purely additive.

---

## The wiki

### `orc wiki status [--json]`

The tier, and now everything the terminal was already printing:

| field | what it is |
|---|---|
| `tier` · `distance` · `anchor` | the wiki's freshness, which is **its worst doc's** |
| `counts` | how many docs are FRESH / AGING / STALE / unmeasurable |
| **`worst`** | the doc pinning the tier, **by name**. A hash is not a thing anybody can go and refresh |
| `per_doc[]` | one row per registered doc: its own tier, its own distance, what it covers, its usage, its tags |
| **`blind_spot`** | the changed files no doc covers — **the file list**, not the number `2` |
| `orientation` | present, or missing with the free command that regenerates it |
| `crosslink` | `PUBLISHED` / `UNPUBLISHED` / `NONE`, and the boundary row count |
| `free_repairs` | reused verbatim from `orc wiki plan` — **a user must never pay for what a free step fixes** |

**Exit code 0 in every state.** `state` and `tier` are the branch; overloading
the exit code would collide with the existence probe, where a non-zero result
reads as "absent" — and `unregistered` means the wiki very much exists.

### `orc wiki docs [--json]`

The doc table. `orc wiki` had six subcommands and **not one of them listed the
docs** — you could learn the wiki was STALE with 14 docs and 47 commits of drift,
and could not learn what any of those 14 docs was about.

```
STALE   orc-feature-billing.md                  47c  used 12/20  4 tags
        Billing
        covers: src/billing/
FRESH   orc-orientation.md                       2c  used 20/20
```

**Each distance is measured against that doc's OWN covered files.** A doc about
payments does not age because the README changed forty times.

Exit **0** registered · **1** no wiki · **3** unregistered (and it names
`orc wiki sync`, which is free and instant).

### `orc wiki show <doc> [--body]`

One doc: its header fields, its coverage list, its crosslink tags, its usage, and
**the free repairs that apply to it**. `--body` adds the markdown.

`--body` is opt-in on purpose: prose is returned only on an explicit request,
exactly one artifact at a time.

Exit **0** · **2** unreadable · **3** unknown doc (and it lists the ones that
exist).

### `orc wiki coverage [--json]`

The number nobody could get before: **what percentage of your tracked files is
covered by at least one wiki doc.** ORC's own artifacts are excluded, so a
changed `wiki/` file never reads as a documentation gap.

The uncovered set is collapsed to **directories** and ranked by file count,
because these are opposite situations and a flat list of 240 paths hides both:

```
  118  vendor/stripe-sdk       last touched a1b2c3d 2026-02-11
   22  src/notifications       last touched 9f2c41a 2026-08-08
```

> **It is a REPORT and never a gate.** There is no threshold, no config key, and
> nothing in ORC branches on it. A repo that deliberately documents four
> subsystems out of forty is not broken — and a coverage percentage that starts
> nagging becomes a number people game.

Exit **0** fully covered · **1** gaps exist. That is a branch, not a failure.

---

## Code patterns

### `orc pattern show <lang> [--body]`

The pattern file is injected **literally** into every executor slice, and nothing
would show you a line of it. This does:

- when it was codified, from what commit, against which playbook
- its section headings
- how many CONVENTIONS and how many INVARIANTS it carries
- **the conflicts the codifier flagged** — *the project does X, the invariant
  says Y*. These are the most decision-shaped thing in the file and were
  invisible outside it
- `--body` prints the text itself

**It reports what is on disk and invents nothing.** The codifier may not write a
parseable header today; with none it returns `headered: false`, shows what it
could parse, and says so in one line. It **never** derives a "codified at" from
the file's mtime — an mtime is when the file moved, not when the pattern was
written.

Exit **0** cached · **1** absent · **2** unknown language key. That third one is
a *caller* bug: keys are FRAMEWORK names (`react`, `nestjs`), never file
extensions.

---

## Repair memory

### `orc gotcha show <id>`

One entry, **every field** — symptom, fix, why, trigger, first seen. `gotcha
list` had always emitted these and the panel rendered six columns and discarded
the rest.

Works on live entries and archived ones alike.

### `orc gotcha list --archived`

The archive. **Eviction is an archive, never a delete**, and ids are monotonic
and never reused, so an archived gotcha stays traceable forever.

### `orc gotcha prune --dry-run`

Exactly which entries eviction would archive, and **why** — fewest hits first,
then oldest. It writes nothing.

```
Would archive 1 gotcha (6 live, gotchas_max=5) — nothing has been written:
  G-002 · react · repair · hits 0 · 01-01-2026
      rank 1 of the low-value tail — 0 hit(s), last seen 01-01-2026
```

This exists because **a count is not consent.** The panel's Apply button stays
disabled until this has been run, and the preview names every entry.

Exit **0** nothing to prune · **1** it would prune.

---

## The two doctor cautions

`orc doctor` gained exactly two wiki findings, and the restraint is deliberate.

| id | Fires when | Fix |
|---|---|---|
| `wiki-unregistered` | the wiki is unregistered, drifted or corrupt | `orc wiki sync` — **free**, instant, and until it is done nothing can read the wiki at all |
| `wiki-debt` | the tier is **STALE** and `orc wiki plan` has pending rows | `/orc-wiki refresh --top 2` |

**`wiki-debt` never fires on AGING.** Aging is a normal state that every living
repo passes through, and a doctor that warns about it is a doctor people learn to
ignore.

**There is no `pattern-missing` finding.** A project with no cached pattern is
not misconfigured, and warning about it would be ORC nagging you for a paid scan.

Both route to the Knowledge panel, because that is where they can actually be
cleared — `orc wiki sync` is a button there, and `orc wiki plan` is the card
above it.

---

## In `orc ui`

All of it renders on **Knowledge**, now five tabs: Wiki · Coverage · Code
patterns · Memory · Peers.

The panel computes none of it. A free action gets a button, a paid action gets a
copy-able command, and a value the CLI could not compute renders as an em dash —
never a guess, and never a zero.
