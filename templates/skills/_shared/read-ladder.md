# Shared contract — The read ladder (escalate; never start at the top)

Canonical file: `_shared/read-ladder.md`. THE canonical reading discipline for every ORC role that reads code it is not
about to edit: scouts, wiki scan-tasks, the analyst, the reviewer, and every
executor reading a file for context rather than for change. Load this wherever
a slice tells an agent to go read something.

## Why this exists

ORC's cost is dominated by parallel reading, not by thinking: up to `max_scouts`
scouts at once, a wiki scan that is expensive by design, and every executor in a
wave opening its declared files. A role that opens a 900-line file to learn one
function's shape has spent the run's budget on bytes nobody needed. Reading more
is not understanding more.

## The ladder

Escalate one step at a time. Stop at the step that answers the question.

| Step | Do | Stop here when |
|------|----|----------------|
| 1. Locate | `Grep` / `Glob` for the symbol, route, config key, or error string | You only needed to know WHERE it is |
| 2. Outline | Read the file's declaration lines — imports, exports, top-level signatures | You needed the API surface |
| 3. Range | Read the ±40 lines around the anchor found in step 1 | You needed one function's behaviour |
| 4. Full | Read the whole file | It is the subject of the task — or you will edit it |

## The anti-chain rule

Do NOT chain locate → full-read → locate → full-read across a directory. If two
escalations to step 4 have not answered the question, the question is wrong for
this area. Return `needs_context` with `searched:` (what you looked for and
where) instead of reading further. An honest "not here" costs the run far less
than a third full read.

## The budget

A read-only slice carries an explicit read budget. Spending it without an answer
is a `needs_context` return, not permission to keep going.

## Two exceptions — these are not preferences

1. **A file you will EDIT is read in FULL, first, always.** Claude Code enforces
   a path-keyed read-before-write gate; an `Edit` whose `old_string` was
   reconstructed from an outline is a corruption bug, not a failed call. Every
   path in the task's `declared_files` is a step-4 read.
2. **Never apply the ladder to output a gate parses.** Build logs, test output,
   lint results — the smoke gate, the TDD gate, the verifier and orc-quick's
   build loop decide red vs green from those exact bytes. Read them whole.

## Reading ORC's own payload — the partial-read discipline (v1.0.0 W10)

Everything above is about reading the PROJECT. It applies unchanged to reading
ORC's own files, and it has to: a lane manifest of pointers that every lane
dutifully reads whole is MORE round-trips than the prose it replaced, for the
same bytes. Centralizing prose and then reading all of it is a slower payload,
not a smaller one.

So every pointer a lane carries declares three things.

| Declaration | Values | Means |
|---|---|---|
| `when` | `always` · `on-phase` · `on-state` · `on-demand` · `compile-time` | WHETHER to open it at all |
| `read` | `layer` · `section` · `whole` | HOW MUCH to open |
| `layers` | `core` · `full` · `trim` · `composed` | WHICH part, when `read: layer` |

### The four rules that make it honest

1. **`on-phase` is the default, and `always` must be justified.** A file every
   lane always loads has saved nothing by moving. Each `always` pointer is
   named in the wave that adds it.
2. **`read: section` names a HEADING, never a line number.** A stored line
   number is a wrong line number one edit later; a heading anchor survives an
   edit above it. This is why a shared file's headings are part of its
   contract — renaming one breaks every pointer into it.
3. **A trimmed lane reads `core` plus its OWN layer, and never the `full`
   layer.** Reading a neighbouring layer "for context" is the bleed this rule
   exists to stop: the layer boundary is the product promise, not a suggestion.
4. **The two exceptions above carry over unchanged.** A file you will EDIT is
   read in full, first, always; and output a gate parses is read whole.
5. **`compile-time` is not a run-time read at all.** `orc-diy` is a declared
   reader of ten shared phases and opens none of them during a run: the `orc
   diy compile` CLI reads their `composed` layer once and stitches it into
   `FLOW-COMPILED.md`, which is the only spine that run then follows. Saying
   `on-phase` there would describe a read that never happens, and a manifest
   that describes a run nobody performs is the drift it exists to prevent
   (v1.0.0 W13).

### The honest limit

A partial read saves round-trips and bytes for the lanes that SKIP a phase. It
does **not** make a phase cheaper for the lane that runs it — that lane reads
its layers whole. Any claim otherwise has to show the measurement.

## Handoff

The ladder governs HOW MUCH to read. It never decides WHETHER knowledge exists —
that is `detecting-artifacts.md` — and it never overrides precedence:
`code > fresh wiki > stale wiki (hints) > model priors`.

What a lane INVOKES, and what each exit code means, is not here either: that is
`orc lane calls <lane> --json`, whose catalogue is the one copy of every call
two or more lanes share.
