---
description: Standalone verify — checks git-modified changes only, shows summary, Opus 5 medium
---

Use the **orc-verify** skill independently (no orchestrator): verify
only the git-modified changes in the working tree using Opus 5 medium effort,
classify findings on the P0–P3 severity ladder (P0/P1 gate, P2/P3 advisory;
every P0–P2 finding anchored with file:line + a verbatim quote, else it's
auto-P3), and show the summary. Read-only — do not fix or commit.

Optional focus: $ARGUMENTS
