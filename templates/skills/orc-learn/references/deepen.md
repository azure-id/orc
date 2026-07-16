# Reference — Deepen Protocol (wiki topic → functions & full flow)

What the writer does AFTER the boundary is known. The wiki (when fresh)
answers "which files make up feature X and what are its contracts"; deepening
answers what the wiki deliberately does not carry: **which functions, in what
order, and why** — the level a human needs to change the code safely.

Precedence throughout: `code > fresh wiki > stale wiki (hints) > model
priors`. Every wiki claim used here is re-verified against the file it
anchors; on conflict the code wins and the doc records what the code shows.

## Inputs

- `covers[]` — the feature's file set (from the chosen wiki area's globs, or
  from the user's directory/focus pointer when the wiki couldn't seed it).
- `wiki_tier` + the topic's wiki doc path when one exists (fresh or aging →
  trust its boundary/contract claims as a starting map; stale → hints only,
  verify before use; none → skip).
- `focus_hint|null` — biases which invocation the walkthrough follows.

## Step 1 — enumerate the feature's surface

Read every file matched by `covers[]` (targeted — NEVER expand to a
repo-wide scan; a file outside `covers` is read only when step 2's flow
provably calls into it, and then it is added to the doc's fingerprint map).
Record each function/method/entrypoint that participates in the feature:

- name + `file:line` anchor (the definition line, verified this run)
- role in one line (what it contributes to the feature)
- classification: entrypoint (route/command/hook/export) · core logic ·
  helper · boundary (I/O, external service, other feature)

Skip vendored/generated files and trivial one-line re-exports. The count of
recorded functions is returned as `functions_mapped`.

## Step 2 — trace ONE real flow, entry to exit

Pick the feature's most representative invocation (the `focus_hint` wins if
it names one; else the primary entrypoint). Follow the actual call chain
through the recorded functions — reading the code, not inferring — until the
flow leaves the feature (response returned, event emitted, write committed).

Produce an ordered chain of anchors: `entry (a.ts:12) → validate (a.ts:40) →
compute (b.ts:88) → persist (c.ts:15) → exit`. Note at each hop WHY the hop
exists when it is not obvious. Branches: trace the main path fully; name the
significant branches and where they diverge, without fully expanding each.
`flow_traced: true` in the return means this chain is complete entry-to-exit
with every hop anchored — anything less returns `false` and says why.

## Step 3 — harvest while it's cheap

During steps 1–2, collect the raw material the templates need, so nothing is
invented at writing time:

- **Invariants/contracts**: assertions, validation, ordering constraints,
  error conventions actually enforced in the code (→ knowledge.md).
- **Why-this-way findings**: places the implementation takes a non-obvious
  route — these seed the FAQ (→ learning.md).
- **Couplings**: where the flow crosses into other features/modules — FAQ +
  gotchas material.
- **Change seams**: the spots a next iteration would extend (→ recipes +
  extension points).

## Output

Everything feeds the two templates (`template-learning.md`,
`template-knowledge.md`). The knowledge.md "Functions & flow" section and the
learning.md "Guided walkthrough" MUST describe the same step-2 flow — one
anchored tersely, one narrated pedagogically. Divergence between them is a
defect.
