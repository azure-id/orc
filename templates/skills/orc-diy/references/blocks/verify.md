## Phase: Verify

<!-- diy:when verify=off -->
Verification is DISABLED in this flow. The build+test evidence in each
executor return is the only green signal; say "verify skipped by flow
config" in the summary. Never claim criteria were verified.
<!-- /diy:when -->
<!-- diy:when verify=smoke -->
Run a SMOKE verify only: dispatch the verifier
(`orc-verifier-opus-4-8-high`) with an explicitly narrowed scope — build +
full test suite, red/green verdict, NO per-criterion definition-of-done
sweep. Red blocks ship exactly as a full verify would.
<!-- /diy:when -->
<!-- diy:when verify=full -->
Dispatch verification exactly as the full lane does — follow the verify half
of `.claude/skills/orc/subskills/orc-review-verify/SKILL.md` (build + tests +
every acceptance criterion checked against the definition of done).
<!-- /diy:when -->
