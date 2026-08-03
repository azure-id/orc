# Reference — the P0 certainty gate (never quietly pick a boundary)

Loaded at Phase S4, at **every** seam. The rule the whole lane exists to enforce:
**when the layering is uncertain, ASK — blocking.** A wrong seam costs re-cutting
N branches and force-pushing N PRs; the question costs seconds.

## Step 1 — classify every candidate boundary

**CERTAIN (proceed, no question):**

- the files sit in different taxonomy tiers **by path** (`migrations/` vs
  `handler/` vs `repository/`);
- file X is imported only by files in later layers (a one-way dependency you can
  PROVE by grep, not assume);
- migration/DDL files (always their own bottom layer);
- a config/factory-registration-only change (always the wiring layer);
- the layer is already within both ceilings and single-concern.

**UNCERTAIN (STOP and ask):**

- two files in the **same tier** that could be one layer or two (two handlers,
  two providers, two components);
- a shared util/helper consumed by two different layers — bottom layer, or
  duplicate-then-dedupe?
- a refactor/rename mixed with a behavior change in the same file;
- a circular dependency between candidate layers (a human picks the seam);
- splitting would leave a layer that cannot build/test alone with no obvious fix;
- the smallest coherent unit exceeds a ceiling (an oversize atom);
- **ordering ambiguity** — two layers with no dependency between them, where the
  order changes what reviewers see first;
- **feature-flag placement** — flag in the foundation layer or in the flip layer?
- (`orc-run` mode) a single FILE whose content belongs in two layers — the
  default option offered is "the whole file lands in the LOWEST layer that needs
  it", because hunk surgery is forbidden.

## Step 2 — ask, blocking, ONE decision at a time

Use the question tool. Each question states:

- the two candidate boundaries, concretely (which files land where);
- the **cost of each**: LoC and file count per resulting layer, plus the extra CI
  run a split adds;
- the **review-experience consequence** ("reviewer of layer 3 sees a call to a
  function that does not exist yet");
- a **recommended option** — first in the list, marked as recommended.

Never batch six vague questions. Never assume and note it later.

## Step 3 — record every answer

Append to `## Decisions` in the plan: the boundary, the options offered, the
choice, and the rationale in the user's own words. This is the audit trail, and
it is what lets the plan be re-run after compaction or handed to someone else.

## Red flags — these thoughts mean STOP, you are rationalizing

| Excuse | Reality |
|---|---|
| "It's obvious these two handlers go together" | Same tier ≠ same layer. That is the DEFINITION of UNCERTAIN. Ask. |
| "I'll pick one and note the assumption in the plan" | The gate is blocking, not a footnote. Ask before cutting. |
| "Asking is slow, the user wants speed" | A wrong seam means re-cutting N branches and force-pushing N PRs. The question costs seconds. |
| "It's under the LoC ceiling, so the layer is fine" | The budget is a ceiling, not a definition. Mixed concerns fail at any size. |
| "I'll put everything in layer 1 and split later" | Post-hoc splitting is hunk surgery plus N force-pushes. Cut before submitting. |
| "Layer 2 doesn't compile alone but the stack does" | Merging layer 1 alone then breaks the trunk. Re-cut the seam. |
| "12 layers = maximum reviewability" | 12 layers = 12 CI runs + 12 review contexts. Reviewability peaks, then collapses. |
| "The user said 'just split it', so no questions" | "Split it" is the goal, not permission to guess the seams. |
