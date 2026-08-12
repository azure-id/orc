# Example — `kind: code`, and the pattern file as the template

> The annotated maintainer's walkthrough for the `code` kind. It shows the one
> thing that changes shape (the template) and the one thing that does not (the
> cold read).

## The template problem is already solved

Every other kind asks the user to supply a template, because ORC has no idea what
their team's TSD is supposed to look like. For code it does:

```bash
$ orc pattern status typescript
✓ cached — .claude/orc/patterns/typescript-pattern.md   (14 conventions, 6 invariants)
```

Exit 0 = cached, exit 1 = absent, exit 2 = unknown language key. That is the
deterministic probe every knowledge-gated lane runs first
(`_shared/detecting-artifacts.md`) — never a raw `find`, because the cache lives
under the hidden `.claude/`.

**Why the pattern file is a real template and not a substitute for one:** it was
reconciled against the project's own most-recently-modified files, so its
CONVENTIONS are this project's conventions, not a generic style guide. And it
already distinguishes conventions (which defer to the project) from INVARIANTS
(security and correctness, always enforced) — which is exactly the D1 / D2 split
this lane needs.

Absent? Say so and offer `/orc-pattern`. Never substitute a generic style guide,
and never run with `--no-template` on a `code` cycle without saying what was lost.

## Intake

```bash
orc challenge init billing-webhooks \
  --artifact src/billing/webhooks/ --kind code \
  --goal "a new engineer can extend this module without reading the whole service" \
  --audience "backend engineers joining the team this quarter" \
  --done-means "every exported function has a caller-visible contract, and no error path is silent" \
  --out-of-scope "the retry scheduler (owned by platform)" \
  --template .claude/orc/patterns/typescript-pattern.md \
  --dimensions D2,D3,D4,D6 \
  --revision in-place
```

Note the dimension set: **D1 and D5 are deselected** and print as `NOT-SELECTED`.
A module has no required section list, and idiom-checking a code file is noise.
`kinds.md` proposes exactly this set; the user confirmed it.

`--revision in-place` is right here: a code module is edited where it lives, and
a `-v2` copy of a directory would be a second source of truth.

## What the cold reader does with code

Same instrument, different artifact. The question becomes:

> **"can a new engineer understand this module without asking anyone?"**

It gets `Read` and the file list. No `Grep`. It cannot chase a symbol into
another file — which is the entire measurement, because the new engineer it is
standing in for cannot either, not on day one.

```yaml
questions_asked: 11
answered_from_artifact: 6
answered_by_guessing: 4
unanswerable: 1
comprehension_score: "6/11"
terms_undefined_on_first_use: ["settlement window", "SoR", "replayable"]
findings:
  - id: R-003
    severity: P1
    anchor: "src/billing/webhooks/handler.ts:88"
    quote: "if (!isReplayable(evt)) return;"
    what_is_wrong: "the function returns silently and nothing says whether that is success or a drop"
    consequence: "an engineer adding a webhook type will copy this and lose events"
    acceptance_line: "the early return logs or throws, and the doc comment says which events reach it"
```

**`R-003` is a real defect found by a reader that could not look anything up.**
A grounded judge would have opened `isReplayable`, satisfied itself the logic was
correct, and never noticed that the CALLER cannot tell.

## What the judge does differently

D2 for code is not "does the design exist" — it is **"does the contract exist"**:
every exported symbol's behaviour visible at the call site, every error path
named, every invariant from the pattern file honoured.

The pattern file's INVARIANTS are blocking by definition (they are security and
correctness), its CONVENTIONS are D1-shaped and D1 is not selected here — so a
convention divergence is a P3 at most, and only when it costs the stated audience
something.

## The fix session, for code

Identical shape, one extra line in the paste block:

```
Rules:
- Change the module only. Do not edit anything under orc/orc-challenge/.
- Do not mark findings resolved. The next judgement decides that.
- Run the project's tests before you stop. A red build is not a fix.
```

That last line is a courtesy, not a gate: **this lane never runs a build and
never gates on one.** `/orc-verify` answers "does it work". This answers "is it
good, complete, and readable by someone who was not in the room" — and a module
can be green and still be unreadable, which is the whole reason to point this
lane at code.
