## Wiki gate

<!-- diy:when wiki_gate=off -->
Skip the wiki freshness check entirely for this flow. If a project wiki
exists, executors may still receive wiki page pointers, but freshness is
never computed and never surfaced.
<!-- /diy:when -->
<!-- diy:when wiki_gate=notice -->
Compute the wiki freshness tier exactly as the full lane does (follow the
read-side procedure in `.claude/skills/orc-wiki/references/staleness.md`).
Fresh → use silently; aging → one-line notice, continue; stale → warn the
user that wiki hints may be outdated, continue. Never block on it.
<!-- /diy:when -->
<!-- diy:when wiki_gate=hard -->
Compute the wiki freshness tier exactly as the full lane does (follow the
read-side procedure in `.claude/skills/orc-wiki/references/staleness.md`).
Fresh or aging → proceed. Stale or missing → STOP and ask the user: refresh
the wiki first (recommended), or continue anyway with hints demoted. Respect
the precedence rule from that reference in every consumer slice.
<!-- /diy:when -->

<!-- diy:when post_ship_wiki_ask=on -->
After a successful ship on a big run, offer the post-ship wiki refresh ask
exactly as the full lane defines it in the orc skill (guarded on a non-empty
wiki; judged by final task/file counts at ship time).
<!-- /diy:when -->
