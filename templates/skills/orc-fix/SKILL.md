---
name: orc-fix
description: >
  Say "this is a fix, and here is what it fixes". Use for "/orc-fix", "this
  fixes Sonar typescript:S3776", "ORC caused this defect", "this bug came from
  AI-generated code", "record this fix". It classifies the fix from evidence,
  asks once, and records it so the next review sees it. A rider: it opens no
  run and returns to exactly where the run was. With no run open it can also
  make the fix, like /orc-quick.
---

# ORC — the fix record

A RIDER lane, like `/orc-wait` and `/orc-explain`. It opens no run of its own,
writes no `run-<lane>-<slug>` pointer and never writes `.current`. The user can
call it at any time — also while another lane waits at a question.

## What this lane never does

- It never begins between a dispatch and its validated return.
- It never changes the host run: no re-plan, no re-score, no new task. A
  suspend does not widen anyone's authority.
- With a run open, it never writes code. The host lane makes the fix — two
  writers on one tree is the conflict `/orc-wait` forbids (DE-12).
- It never sets `miss` itself, and never records `author: orc`. The CLI does
  the first, and refuses the second.

## F0 — look (silent)

Run `orc fix classify --text "<the user's words>" --json`. The CLI reads the
git state, `git blame` on the named lines, the traces and the host run, and
proposes ONE class on two axes:

- `source` (what found it): `sonar` · `ci` · `defect` · `pr` · `review` · `other`
- `introduced_by` (who wrote the bad lines): `orc` · `ai` · `human` · `unknown`

| exit | meaning | what you do |
|---|---|---|
| 0 | classified | go to F1 |
| 1 | a dispatch is in flight | say so, wait for its return, then run F0 again |
| 2 | no text | ask what the fix fixes |

Never classify in your head. The user's three cases: "a SonarQube fix" →
`source: sonar`; "a defect caused by ORC" → `source: defect, introduced_by:
orc`; "a bug caused by AI-generated code" → `introduced_by: ai`.

## F1 — ask once (H `fix.f1.class`)

Show the proposed class, every `evidence` line and the file, then:

```text
This fix:  source sonar · introduced by ORC (run-mini-total-290926)
  - a Sonar rule key (typescript:S3776)
  - git blame → 4c1e2a9: the commit falls inside the run's trace window ...
  1. confirm   2. change the class   3. cancel
```

The user's word wins over the evidence. A changed class goes into the record
as `class_by: "user"`; a confirmed one as `class_by: "evidence"`. Cancel →
nothing is written; return to the run.

## F2 — record

Pipe the classify answer's `record` object (with the user's class and
`class_by`) to `orc fix record - --json`. The CLI:

1. writes ONE observation through the gotcha store — with a Sonar issue key it
   uses the importer's own id, so a later `gotcha sync` completes the same row;
2. computes `miss` from the stored review scopes;
3. writes ONE `FIX` line into the HOST run's trace, when one is open;
4. prints ONE line. Show it VERBATIM, then stop.

Exit 1 → a dispatch started meanwhile; nothing was written. Wait, then F2 again.

## No run open — offer the fix (DE-12)

`mode: may-fix` from F0 → offer to make the fix before F2, like `/orc-quick`:

1. The user picks the executor at the `/orc-quick` dispatch gate (that lane's
   `dispatch-gate.md` reference, "Writing code") — nothing spawns without a yes.
2. The slice carries `orc rules slice --lane orc-fix --json` (below).
3. The smoke gate (`../_shared/smoke-gate.md`): red blocks the record.
4. F2 with `outcome: "addressed"` and `via: "orc-fix"`.

The user can also say "record only" — then F2 at once.

## Config

`orc lane config orc-fix --json`, obey `effective`. Never merge
`.claude/orc.config.yaml` yourself (`../_shared/config-precedence.md`).

## Rules — the anti-slop card (`../_shared/phases/rules.md`)

`orc rules slice --lane orc-fix --json` is the ONLY assembler. It rides only in
an executor slice of the no-run fix.

## Habits and trace

**Habits:** the host run had `habits{}` in its config answer → read
`../_shared/habits.md`; its next packet takes the `ASK` for `fix.f1.class`
(class `never`: a fact is never a habit). No `habits{}` → ignore `(H …)`.

**Trace:** the CLI writes the `FIX` line itself. You do not narrate it and you
do not repeat it. With no run open, nothing is traced — the record is the
observation.

## Waiting mid-run (`/orc-wait`)

Canonical: `../_shared/wait.md`. **`a lane that waits without a hand-back` has broken this contract.**
Checkpoint **none** · safe point **after the record is written**. Nothing here to checkpoint, so all three modes behave identically — say so rather than asking.
