
Result of : C:\dev\orc-eval\w9\round3.ps1 -Step c-off
Nothing edited. Here's the full blast radius.

Direct references to the symbol (these break on any signature change):

- src/stores/orderStore.js:18 — the definition itself
- src/stores/orderStore.js:28 — the module.exports line
- src/routes/orders.js:16 — the only production call site (orderStore.searchByItemPrefix(item)), inside the GET /search handler
- tests/orderStore.test.js:37 — store.searchByItemPrefix("blue")
- tests/orderStore.test.js:40 — store.searchByItemPrefix("WIDG")
- tests/orderStore.test.js:43 — store.searchByItemPrefix("456")
- tests/orderStore.test.js:50 — store.searchByItemPrefix("")
- tests/orderStore.test.js:51 — store.searchByItemPrefix(undefined)
- tests/orderStore.test.js:52 — store.searchByItemPrefix(123)

Indirect — route-level tests that break if the return shape changes or if orders.js:16 isn't updated in step (they never name the function; they go through GET /orders/search):

- tests/orders.test.js:25
- tests/orders.test.js:35
- tests/orders.test.js:41
- tests/orders.test.js:50
- tests/orders.test.js:71
- tests/orders.test.js:105
- tests/orders.test.js:115
- tests/orders.test.js:147
- tests/orders.test.js:171
- tests/orders.test.js:180
- tests/orders.test.js:195

Two notes worth having: orders.js:17 reads items.length, so a return type that isn't an array breaks the response envelope even though line 17 doesn't call the function. And three files hardcode the symbol id string src/stores/orderStore.js#searchByItemPrefix — w9/round3.ps1:70, W9-GUIDE.md:146, W9-PANDUAN-ID.md:152 — those only break on a rename, not a signature change.

✻ Worked for 1m 3s · done 8:03 AM

----
result of: C:\dev\orc-eval\w9\round3.ps1 -Step c-on 
Call sites that would break

- src/routes/orders.js:16 — orderStore.searchByItemPrefix(item), the only production caller (route GET /search, defined at src/routes/orders.js:11)
- tests/orderStore.test.js:37 — store.searchByItemPrefix("blue")
- tests/orderStore.test.js:40 — store.searchByItemPrefix("WIDG")
- tests/orderStore.test.js:43 — store.searchByItemPrefix("456")
- tests/orderStore.test.js:50 — store.searchByItemPrefix("")
- tests/orderStore.test.js:51 — store.searchByItemPrefix(undefined)
- tests/orderStore.test.js:52 — store.searchByItemPrefix(123)

Definition / export (change these to make the above compile)

- src/stores/orderStore.js:18 — the declaration itself
- src/stores/orderStore.js:28 — module.exports = { create, get, list, searchByItemPrefix } (only breaks if you rename, not on arity change)

Nothing else. tests/orders.test.js never hits GET /search, and no other module requires orderStore beyond src/routes/orders.js:3. Docs mention the name but aren't code: W9-GUIDE.md:146, W9-PANDUAN-ID.md:152, w9/round3.ps1:70, w9/prompts/s2.txt:1. The cached graph blob under .claude/orc/graph/blobs/ records the call edge and would go stale, but it regenerates.

✻ Crunched for 37s · done 8:04 AM

result of: PS C:\dev\orc-eval> node "C:\dev\orc\bin\cli.js" graph ctx "src/stores/orderStore.js#searchByItemPrefix" --dir "C:\dev\orc-eval"
searchByItemPrefix  src/stores/orderStore.js:18-26  [blob e9f7c10 · current]
  ← called by  GET /search  src/routes/orders.js:16  IMPORT
  ← maybe      6 more caller(s) name it among AMBIGUOUS candidates
  budget 54/1200 tokens · 6 unresolved call(s) not shown
  
  
 ---
 
 CLI setup terminal
 
 PS C:\dev\orc-eval> w9\round3.ps1 -Step setup

round 3 probe installed in C:\dev\orc-eval
  hook     : C:\dev\orc-eval\.claude\hooks\round3-probe.js
  payloads : C:\dev\orc-eval\.claude\round3
  events   : SubagentStart, PreToolUse (Grep|Glob), PostToolUse (Read)

NEXT - and the fresh session matters, hooks are read at session start:
  1. open Claude Code in C:\dev\orc-eval, in a NEW session
  2. paste the prompt from eval/round3/README.md (check R3-A)
  3. pwsh -File eval/round3/collect.ps1 -Repo C:\dev\orc-eval


=== ROUND 3 / A - does a hint reach a subagent? ===
Open Claude Code in C:\dev\orc-eval, in a NEW session, and paste EXACTLY this:

  Use the Agent tool to dispatch one general-purpose subagent. Its entire task:
  run one Grep for the pattern "searchByItemPrefix", then reply with the first line
  of any text it received that begins with "ROUND3-PROBE". If it received none,
  reply "none".

Then: C:\dev\orc-eval\w9\round3.ps1 -Step collect

PS C:\dev\orc-eval> w9\round3.ps1 -Step collect

=== ROUND 3 / A - does additionalContext reach a subagent? ===

  PreToolUse       SUBAGENT       agent_type=general-purpose
      keys: agent_id, agent_type, cwd, effort, hook_event_name, permission_mode, prompt_id, scratchpad_dir, session_id, tool_input, tool_name, tool_use_id, transcript_path
  SubagentStart    SUBAGENT       agent_type=general-purpose
      keys: agent_id, agent_type, cwd, hook_event_name, prompt_id, scratchpad_dir, session_id, transcript_path

The hook FIRED inside a subagent on: PreToolUse, SubagentStart

NOW READ THE AGENT'S REPLY, because that is the actual answer:
  it quoted a line starting ROUND3-PROBE
     -> additionalContext IS delivered to a subagent. DE3 confirmed.
        Keep all four events. Record it in the CHANGELOG limits list.
  it said 'none', or did not mention the line
     -> the event fires but the FIELD is dropped.
        Delete the three delivery events; keep SubagentStop.

Either way, run this again with -Remove when you are finished.

PS C:\dev\orc-eval> w9\round3.ps1 -Step bigrepo
Check B spends NO model tokens. It clones a real repository and measures the graph.
cloning https://github.com/django/django.git (shallow) ...

=== ROUND 3 / B - the graph on django ===

  building the index (first build, nothing cached) ...
  files indexed   : 3040
  symbols         : 44160
  first build     : 12243 ms
  generation      : 1

  parser could not finish : 10 partial + 0 skipped of 3040  = 0.3%
  ^ under 30% - acceptable.

  calls resolved  : 195197
    LOCAL 20631 · IMPORT 20882 · UNIQUE 23866 · AMBIGUOUS 62002 · UNRESOLVED 67816 (outside the repo)
  confident share of in-repo calls : 51.3%
  ^ at or over 50% - a card here carries real information.

  read timings on the widest file (tests/admin_views/tests.py), median of 3:
    CACHED          | ctx   415 ms | impact   365 ms
    compute-on-read | ctx   392 ms | impact   364 ms

  tree format, median over 77 file cards: -18.7%
  ^ meets the 15% bar.

  clone kept at C:\Users\joshu\AppData\Local\Temp\orc-round3\django (delete it when you are done)

PS C:\dev\orc-eval> w9\round3.ps1 -Step c-off
graph OFF ...

=== ROUND 3 / C - graph OFF (baseline) ===
Open Claude Code in C:\dev\orc-eval, in a NEW session, and paste EXACTLY this:

  Without editing anything: list every place that would break if I changed the
  signature of searchByItemPrefix in src/stores/orderStore.js. Answer with
  file:line for each, then stop.

Save the answer somewhere, then run -Step c-on in ANOTHER new session.

PS C:\dev\orc-eval> w9\round3.ps1 -Step c-on
graph ON, and building it ...

=== ROUND 3 / C - graph ON (same sentence, word for word) ===
Open Claude Code in C:\dev\orc-eval, in a NEW session, and paste EXACTLY this:

  Without editing anything: list every place that would break if I changed the
  signature of searchByItemPrefix in src/stores/orderStore.js. Answer with
  file:line for each, then stop.

THE ANSWER KEY - it is derived from the parser, so you can check both answers:
  node "C:\dev\orc\bin\cli.js" graph ctx "src/stores/orderStore.js#searchByItemPrefix" --dir "C:\dev\orc-eval"

Score by hand, in two minutes: how many REAL call sites did each answer find,
and did either one invent a call site that does not exist?