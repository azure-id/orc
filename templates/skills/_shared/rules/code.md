<!-- orc-rules:pack id=code prefix=OSC layer=code -->

# ORC RULES · Code (`OSC`)

> **READ-ONLY.** This file ships with ORC and changes only with `orc update`.
> Your own rules go in `.claude/orc/rules.md`, and **yours win** wherever the two
> disagree.

**Applies to** source an agent writes or edits.

**Precedence note.** The project's CODE house rules
(`../phases/house-rules.md` and the project's own `CLAUDE.md` P0) beat this pack
and beat the user ledger. This pack never restates a house rule; where one
already covers the ground, the rule below cites it.

**Source.** Andrej Karpathy's `CLAUDE.md` ·
[`BioInfo/slopless`](https://github.com/BioInfo/slopless) ·
Miqdad Badjuber — [`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop), the `antislop-code` skill (MIT) ·
[Specification and Detection of LLM Code Smells](https://arxiv.org/html/2512.18020v1) ·
[AI-Generated Smells](https://arxiv.org/html/2605.02741v1) ·
[Investigating the Smells of LLM Generated Code](https://arxiv.org/pdf/2510.03029).
Full attribution in `CREDITS.md`.

---

### OSC-01 · HARD · A comment never restates the code

Delete a comment that repeats what the next line, the declaration or the
signature already shows: `// Initialize the variable` above `let count = 0`,
`// User class` above `class User {}`, `const userAge = 25; // User age is 25`.

It doubles the reading load and adds nothing. Remove the comment. Leave the code.

### OSC-02 · HARD · No decorative separator

No banner built from repeated characters, no ALL-CAPS section label, no
box-drawn header: `// ==========`, `// -------- WORKFLOW --------`,
`/* ---- ROUTES ---- */`.

The decoration is the message, and the message is "generated". Use one plain
line, or nothing.

Checked by `orc rules lint`.

### OSC-03 · HARD · No workflow narration

No `// Step 1: Validate input`, `// Step 2: Process`, `// First…`, `// Next…`,
`// Finally…`. The control flow is already visible.

If the flow is genuinely hard to follow, that is a structure problem, not a
missing comment.

Checked by `orc rules lint`.

### OSC-04 · HARD · No empty label

No `// Main logic`, `// Core logic`, `// Business logic`, `// Helper function`,
`// Entry point`, `// Error handling`, `// Note: this is important`,
`// Important: please read`.

The label names a category, not a fact. "Note: retries happen only on 5xx" earns
its place. "Note: this is important" does not.

Checked by `orc rules lint`.

### OSC-05 · HARD · A TODO names a task

No `// TODO: improve this`, `// Future improvements`, `// Additional
optimization can be added here`, `// Add more validation`.

A vague TODO names a feeling, not a task. Keep a TODO only when it says what to
do and carries enough context to act on. Otherwise delete it.

Checked by `orc rules lint`.

### OSC-06 · HARD · No decorative emoji in code

No emoji as decoration in a comment, a log line or an identifier: `// ✅
Validation`, `// 🚀 Performance`, `// 🔒 Security`. Emoji is visual noise in
source, and that exact set is the generated vocabulary.

Carve-out: a string the product actually renders to a user, and a test asserting
on it.

Checked by `orc rules lint`.

### OSC-07 · HARD · No end markers

No `} // end if`, `# End of function`, `// End processOrder`. The closing brace
already ends the block.

Checked by `orc rules lint`.

### OSC-08 · LOCK · One line per comment

One line. Two only when the second carries a new fact. Never three.

A person leaves a note; a generator writes a case. Cut the reasoning chain, the
issue number and the version history. Keep the constraint: the platform trap,
the silent failure, the protocol rule, the performance cost.

**Value is not length.** A comment that legitimately earns its place still does
not earn a paragraph.

### OSC-09 · HARD · Comments explain why, never what

Never strip a comment that carries: business logic and intent · an architectural
decision · a security consideration · a performance trade-off · concurrency
behaviour · a protocol detail · an API contract · a workaround · an edge case or
assumption · a licence or legal notice.

```js
// Stripe may retry webhook deliveries for up to three days.
// Ignore duplicate events using the event ID.
```

That comment stays. A comment earns its place when it explains something the
code does not already show.

### OSC-10 · HARD · No speculative abstraction

Minimum code that solves the stated problem. No helper for a one-time operation.
No abstraction for a single call site. No configurability nobody asked for. No
design for a hypothetical future requirement.

Three similar lines of code beat a premature abstraction.

### OSC-11 · HARD · No defence against impossible states

No error handling, fallback or validation for a scenario that cannot happen.
Trust internal code and framework guarantees.

Validate at system boundaries only: user input, external APIs, parsed files, and
anything crossing a process boundary.

### OSC-12 · HARD · No backwards-compatibility shim

When the code can just change, change it. No feature flag, no compatibility
layer, no `_unused` rename, no re-export of a moved type, no `// removed`
tombstone.

If it is unused, delete it completely.

### OSC-13 · HARD · Surgical

Every changed line traces directly to the request. Do not improve adjacent code,
comments or formatting. Do not refactor what is not broken. Do not add
docstrings or type annotations to code you did not change.

Cites house card rule 1. Where the house card and this rule differ, the house
card wins.

### OSC-14 · HARD · Pre-existing dead code: mention, do not delete

Remove the imports, variables and functions **your** change left unused. Report
any other dead code you notice; do not remove it unless asked.

### OSC-15 · PURPOSE · Method length

A function longer than the file's own norm is split, or the reason is written in
one line.

Stronger models write longer methods, not shorter ones: they consolidate complex
logic into a single procedural block because that is locally the most probable
continuation. This rule is the counterweight.

### OSC-16 · PURPOSE · No Modular Mirage

New files that spread one behaviour across the tree produce structural
modularity with no semantic cohesion. If a change adds files, the reason each
boundary exists is written in one line.

Separating files is not the same as separating concerns.

### OSC-17 · PURPOSE · No God class, no branch sink

No "manager" or "service" class that centralises every branch. No class whose
response set spans most of the module. Where one is genuinely right, write the
reason.

### OSC-18 · HARD · Look before you write a helper

Before adding a helper, a util, a formatter or a validator, search for the one
that already exists. Redundant reimplementation is the most expensive slop in
this pack: it compiles, it passes, and it doubles the maintenance surface
silently.

### OSC-19 · HARD · Match the existing style

Match the surrounding code's naming, comment density, error handling and file
layout, even where you would do it differently. The cached project pattern
(`orc pattern`) is the reference when one exists.

### OSC-20 · PURPOSE · LLM-calling code is pinned and bounded

When the task writes code that calls a model, each of these is done or the
reason is written:

- Pin the model **version**, never a bare provider alias.
- Set `temperature` explicitly. Provider defaults differ and change.
- Bound max tokens, timeouts and retries. Unbounded is not "no limit", it is an
  unknown limit.
- Send a system message.
- Enforce a structured output schema where the caller expects fields.

### OSC-21 · HARD · No unrequested artifact files

Do not create a file nobody asked for: `SUMMARY.md`, `IMPLEMENTATION_NOTES.md`,
`CHANGES.md`, `NOTES.md`, `*_final`, `*_v2`, `*_new`, `*.bak`, `*.old`.

Report in the return. Do not leave a file behind as the report.

Checked by `orc rules lint` on new files.

### OSC-22 · HARD · Introduce no OWASP Top 10 weakness

Injection, broken access control, insecure deserialisation, secrets in source,
missing authorisation on a new endpoint, unvalidated redirect. If you notice
insecure code you wrote, fix it in the same slice and say so in the return.

---

## Not a ban — keep these

- Every comment on the `OSC-09` list, at whatever length its facts require.
- Validation at a real system boundary (`OSC-11` is about impossible states, not
  about untrusted input).
- An abstraction with two or more real call sites today.
- Defensive code the project's own pattern already established (`OSC-19` wins).
