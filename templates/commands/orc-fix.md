---
description: Record a fix and what it fixes — a Sonar issue, a defect ORC caused, a bug from AI-generated code — so the next review sees it
---

Run the `orc-fix` skill.

The user typed: `$ARGUMENTS`

The arguments say what the fix fixes, in the user's own words: a Sonar rule key
or URL, a PR thread URL, a failed check, or "ORC caused this", and the file and
lines when the user knows them.

Never classify the fix yourself. `orc fix classify --text "<the words>" --json`
proposes the class from evidence, and the user confirms or changes it ONCE.

A run is open → record only; the host lane makes the fix. No run is open → offer
to make the fix like `/orc-quick` (the dispatch gate, then the smoke gate).
Either way it returns to exactly where the user was.
