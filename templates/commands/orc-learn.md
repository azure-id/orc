---
description: Generate per-feature onboarding docs (learning.md + knowledge.md) into a git-ignored learning-docs/ — wiki-topic scoped, function-level deep; `refresh` regenerates picked features
---

Use the **orc-learn** skill independently (no orchestrator): teach a
developer ONE feature of this repo by generating
`learning-docs/<feature>/learning.md` (mental model, guided walkthrough,
change recipes, FAQ) + `knowledge.md` (anchored functions & flow, contracts,
fingerprints). Topics come from the wiki when it is fresh (then deepened to
function level); otherwise a targeted scan of the files you point at. Output
is local and git-ignored — each dev regenerates their own. One question per
mode: which feature (default), or which features to regenerate (`refresh` —
full list shown with computed freshness flags, multi-select). The skill
dispatches the pinned orc-learn-writer agent; it never writes the docs
itself.

Optional arguments (`refresh`, `focus=<dir-or-hint>`): $ARGUMENTS
