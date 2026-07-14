## Phase: Ship

State the current branch and the change summary BEFORE any git action, and
never ship on a red build (locked rule).

<!-- diy:when ship_mode=ask -->
Ask the user how to ship: commit, PR (via
`.claude/skills/orc/subskills/orc-pr/SKILL.md`), or leave the working tree
as-is. Default when auto-accepted by autonomy: leave as-is and report.
<!-- /diy:when -->
<!-- diy:when ship_mode=commit -->
Commit the run's changes on a green gate without asking (branch first if on
the default branch; conventional message from the intent). PRs only if the
user asks afterwards.
<!-- /diy:when -->
<!-- diy:when ship_mode=pr -->
On a green gate, create the PR without asking via
`.claude/skills/orc/subskills/orc-pr/SKILL.md` (branch + commit + push + PR
body from the run artifacts).
<!-- /diy:when -->
<!-- diy:when ship_mode=report-only -->
NEVER commit or push in this flow. Leave the working tree modified, and end
with the change report + suggested commit message the user can apply
themselves.
<!-- /diy:when -->
