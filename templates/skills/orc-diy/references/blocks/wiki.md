## Wiki gate

<!-- diy:when wiki_gate=off -->
Skip the wiki freshness check entirely for this flow. If a project wiki
exists, executors may still receive wiki page pointers, but freshness is
never computed and never surfaced.
<!-- /diy:when -->
<!-- diy:when wiki_gate=notice -->
Read the wiki freshness tier from `orc wiki status --json` (`state`, then
`tier`) — the CLI is its only executor; never compute it yourself.
Fresh → use silently; aging → one-line notice, continue; stale → warn the
user that wiki hints may be outdated, continue. Never block on it.
<!-- /diy:when -->
<!-- diy:when wiki_gate=hard -->
Read the wiki freshness tier from `orc wiki status --json` (`state`, then
`tier`) — the CLI is its only executor; never compute it yourself.
Fresh or aging → proceed. Stale or missing → STOP and ask the user: refresh
the wiki first (recommended), or continue anyway with hints demoted. Respect
the precedence rule from that reference in every consumer slice.
<!-- /diy:when -->

<!-- diy:when post_ship_wiki_ask=on -->
After a successful ship on a big run, offer the post-ship wiki refresh ask
exactly as the full lane defines it in the orc skill (guarded on a non-empty
wiki; judged by final task/file counts at ship time).
<!-- /diy:when -->
