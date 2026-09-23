# orc extra — routing work off Claude

**Read: on demand** — read when touching `orc extra`, the provider catalog, the vault, the journal, spend, or the slot table.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **`orc extra` routes WORKERS, never the conductor (v0.50.0).** A band of the
  score ladder can be answered by a non-Claude worker; ORC's own session stays on
  a first-party credential. **`extra_enabled` is false by default and a profile
  that has never answered a probe can never be routed to** — and the failure this
  subsystem is shaped around is not a wrong answer, it is
  **`a lane that sends work off Claude without saying so`**, which is why every
  armed run prints an `extra:` line at Phase 1 before wave 1. Canonical prose:
  `templates/skills/_shared/extra-dispatch.md`. See `knowledge.md` §4z.15.
  - **THE CATALOG SHIPS PROVIDERS AND NEVER MODELS.** A shipped model id is wrong
    within a quarter and wrong *silently* — a 404 mid-wave. `orc extra ping` reads
    the live list and caches it; nothing invents a name. Same rule for PRICE:
    `bin/pricing.json`'s `providers.*.models` maps ship EMPTY, `orc extra rates`
    is the paste path, and **a cost figure ORC did not price itself is never
    printed** — `usd` reads as an em dash.
  - **ONE resolver.** `orc extra resolve <score>` (exit 0 extra / 1 claude) always
    explains itself and always carries the Claude answer it displaced. `bandFor()`
    consults it, or `/orc-budget` would forecast at Opus rates a run that will
    execute on DeepSeek. **A gap in the route table is not a hole — it is Claude**,
    and `route --json` always carries the fall-through split at the Claude table's
    own edges. Overlap is REFUSED BY NAME. A fixed-executor lane has no score, so
    **resolve the pinned agent's BAND at BOTH EDGES and require them to agree** —
    a midpoint would let a row covering `[55,58)` capture an entire mini run, and
    a number ORC invented to satisfy an interface is not a routing decision the
    user made.
  - **Two hard hold-backs, and neither is a second resolver:** a cited `risk[]`
    (`extra_risk_tasks`, default `off`) and a **REFUSE boundary area, which holds
    in `warn` too** — `block` decides whether ORC should attempt the task, `warn`
    records that the user accepted that risk, and neither asked whether the work
    should leave the machine.
  - **The credential never reaches argv.** `--key <value>` is refused BY NAME; a
    key travels on STDIN. The vault is AES-256-GCM under `scrypt(pepper + " " +
    passphrase)` at N=2^17 — **that cost IS the defence and must never be tuned
    down** — with no verifier hash (the GCM tag is the verifier). **TEST FIRST,
    THEN STORE:** a failed test on a never-verified profile removes the profile,
    so a typo'd key cannot rot in a vault nobody can open. `attempts` is flushed
    BEFORE the decrypt, the countdown prints every time, and at the cap the
    ciphertext is overwritten and removed while the PROFILE SURVIVES. Say the
    honest part wherever the counter appears: it stops someone at your keyboard,
    not someone who copied the file. **`ping --passphrase-stdin`** re-probes a
    stored key (v0.50.0 W14); the two stdin flags are refused together by name.
  - **Three engines, and only ONE composes the request body.** `api` is therefore
    the only one that can enforce the `declared_files` fence or carry a privacy
    policy — so a return carrying `fence: {declared_files: false}` is rendered as
    a WARNING and **a constraint that was never applied is never reported as
    kept**. Same discipline on ⚠ REROUTE: on `claude-shim` and `cli`, zero
    reroutes is not evidence there were none. A nested `claude` MUST run `--bare`
    (or it loads ORC's own hooks), needs SIX model env vars, and **exit code 0 is
    not success** — `is_error` is the verdict.
  - **A foreign return is FOREIGN** (`_shared/untrusted-input.md`) and is the ONLY
    foreign class that EDITS the worktree, so what it says it did is a CLAIM
    checked against the worktree. It carries no `actual_model` and that must never
    be faked: `return-validation.md` **§2b, not §2**.
  - **Every other lane's stance is stated in exactly one place.** `/orc-diy` gains
    a real `extra` block that decides WHETHER while the resolver still decides
    WHERE (route rows are deliberately NOT baked into `flow.lock.json` — they
    would go stale in silence). `/orc-quick` is INERT and announces it.
    `/orc-doc` names the sections going off Claude BEFORE the wave, because a
    document's voice is the deliverable. **`/orc-challenge` never** — swapping a
    lens for a different model does not make the lane cheaper, it changes what is
    being MEASURED, and invisibly.
  - **CONNECTIONS (v0.51.0).** Two catalog rows are a LOCAL TOOL (`cli_bin`), and
    a tool can simply not be installed — a STATE before it is a failure. `orc
    extra tools` computes it FRESH every read and NEVER stores it (no
    "installing" flag: the user can close the window). Four states, one next
    action each: **`absent` · `outdated` · `unauthenticated` · `ready`**;
    `orc extra add` REFUSES while absent, naming the install command.
    **`no_install_alternative: null` MEANS there is none**, never that ORC forgot
    to look. `orc extra install` opens the USER'S OWN TERMINAL on a script it
    wrote — visible, theirs, **NEVER elevated**, and fallback-first (a launch that
    could not happen is exit 0 with the command to paste). ORC NEVER WRITES
    ANOTHER TOOL'S CREDENTIAL STORE: the key is injected into the child at every
    rung and at dispatch, and `orc extra keyhelp` says which of three routes
    applies. Engine `cli` gets a four-rung ladder — `cli-bin` · `cli-auth` ·
    `cli-models` · `cli-live` — each its OWN `verify_method`, because nothing may
    read stronger than it is; `--live` is the paid rung and **a CLI ping is NOT a
    cheap ping**. `models_public: true` means a 200 on `/models` is a URL proof
    and NEVER a credential proof (recorded `models-public`, falls through).
    **A LISTED model is not a WORKING model** — `orc extra models --test <id>` is
    the only thing that tells them apart, and `entry: "list" | "free-text"` is the
    CLI's answer to whether a dropdown may be drawn at all. **NEITHER tool reports
    which model answered** (`reports_model: false`) and one reports three token
    kinds, not four (`cache_write: null`, never 0); one also needs
    `-c model_reasoning_effort` or it silently runs at the config default.
    `extra_enabled` cannot be armed before something has answered — ONE
    `extraConnectedState()`, read by the config gate, `extra-enabled-unverified`
    and the panel's `gate`.
  - **`orc ui ▸ Extra` names no provider, no model and no agent** (a test greps
    the panel and both string tables). The boundary card renders ALWAYS, the save
    modal opens only on a GREEN test, an unmapped range keeps its slot on the
    rail, and **a staged un-route draws an em dash rather than guessing the Claude
    agent** — that is `claudeGaps`'s answer and the panel does not know it.
  - **A STRICT PARSER FAILS FOR FREE, AND IT LOOKS LIKE A MODEL PROBLEM
    (v0.52.0).** `opencode run` is `run [message..]` with `-f, --file [array]`,
    and **a yargs array is GREEDY**: it eats every following non-flag token. The
    trailing message was parsed as a second FILE, `message..` arrived empty, and
    the dispatch died in the parser — `dur=0m01s`, `tok=none`, `outcome=failed`.
    Engine `cli` on that tool was 100% dead for a release. The message comes
    FIRST and `-f` comes LAST; `probeArgv` moved to the same order so the two can
    never diverge. `--file=<path>` is NOT the fix (yargs arrays stay greedy with
    `=`). The fake CLI now parses argv the way yargs does and asserts **that a
    message arrived**, because every flag was present while the engine was dead.
  - **A FAKE THAT IS MORE PERMISSIVE THAN THE PROVIDER CERTIFIES THE ADAPTER; IT
    DOES NOT TEST IT (v0.53.0).** Three releases in a row have now been broken by
    the same shape on three different third-party surfaces — opencode's renamed
    `--auto`, opencode's greedy `-f`, and codex's `--output-schema` — and every
    time the tell was identical: **the dispatch was fast, cost nothing, and
    reported something vague.** codex was handed
    `additionalProperties: true` when OpenAI structured outputs require a CLOSED
    object at EVERY level and require `required` to list EVERY key in
    `properties`, so every dispatch was an HTTP 400 **before the model**, and
    flipping only that flag is a SECOND 400 naming `files_changed` — an optional
    field is a NULLABLE UNION, never an omission from `required`. The shape is
    **PROVIDER-DICTATED, not chosen**; documenting it as "deliberately minimal"
    is what produced the bug. **So the rule, stated once: the fake must be at
    least as strict as the real thing.** Two more honesty fixes rode with it —
    a failure is classified from **the provider's own error object** before any
    stderr pattern (and `classified_from` says which answered, because a field
    that reports where a verdict came from must not lie), and codex's
    `cache_write_input_tokens` is no longer discarded and then reported as never
    measured: **"measured is not unknown" is the mirror of "unknown is not
    zero", and both lie to /orc-budget.** `reasoning_output_tokens` stays
    UNREAD — the Responses API counts it inside `output_tokens` and an unproven
    pricing change is worse than a missing one.
  - **THE CREDENTIAL TRIANGLE.** `env` · `vault` · `tool`, and the panel offered
    two — so a tool reporting `authed: true`, which needs NO key from ORC at all,
    was pushed into the vault and the vault locked the run. The third radio is
    offered only where it can be true (engine `cli`, a row with `cli_bin`) and is
    PRE-SELECTED from a signed-in tool card. `keyhelp` carries the per-OS
    variable command with a PLACEHOLDER; ORC still refuses `setx` (key in argv)
    and refuses to append `export` to a dotfile (key in plaintext).
  - **A CARD WHOSE CHILD COUNT CHANGES CANNOT DECLARE ITS ROWS (v0.53.0).**
    `.ex-tool` had `grid-template-rows: auto auto auto 1fr auto`; FOUR STATES
    CARRY FOUR DIFFERENT NUMBERS OF CHILDREN, so a ready+verified card's
    "connected as" chip landed in the `1fr` slack row, stretched (a grid item's
    default), and a 999px radius drew a 250px ellipse. It hit whichever ready
    card had the SHORTEST content in its row. Flex column now, footer pushed by
    the FREE SPACE, and **a chip states a fact — it is never a layout element**.
    The old test asserted the property was PRESENT, which it was, while the panel
    drew an ellipse.
  - **THE EXTRA PANEL IS FIVE TABS AND ONE BAND LADDER (v0.53.0).** It was
    8,786px of unbroken scroll across nine cards. Tabs on the panel's own
    precedent (Knowledge's five, Crosslink's two); the header strip and
    `extra.findings` stay OUTSIDE them (a caution you must hunt for is a caution
    nobody reads); `EX_TAB` survives a re-render (the `KN_TAB` rule); and **the
    gate still decides what EXISTS** — with nothing connected the other tabs are
    not rendered as empty shells and Setup is spotlighted. The horizontal rail
    AND the duplicate rows below it collapse into ONE vertical ladder: **the
    proportional bar is a width INSIDE the row**, so a `min-width` floor can no
    longer fight `var(--w)`, nothing is clipped, nothing scrolls sideways, and
    the row you read is the row you edit. **The plain-language range is the
    CLI's** — `orc extra route` emits `range` + `meaning` + `band_meanings` and
    prints them on BOTH surfaces; writing "simple work" beside a score in the
    panel would be the panel deciding what a score means (the Flow-stepper rule).
    The tour step moved to `.ex-boundary` because its old target now lives on a
    tab that does not exist on a first run.
  - **DESIGN RATIONALE IS NOT USER INSTRUCTION (v0.53.0).** Both string tables
    were complete; the rationale was simply in the way. Six keys split — the key
    KEEPS ITS NAME and becomes the STE instruction, a new `…Why` key takes the
    reasoning into a collapsed disclosure. Nothing deleted, the `…Why` keys join
    the `prose-keys` fence and the instruction keys leave it, because **a new key
    is instruction text unless it is listed** and opting out must stay a
    deliberate line in a diff.
  - **THE PASSPHRASE IS A DEADLINE, NOT A SECOND FACTOR** — say it that way
    everywhere. Cached at `.claude/orc/.orc-ec-session` (project, gitignored,
    0600) **encrypted under the pepper in `$HOME`**, so **a copied project folder
    opens nothing**; `N = 2^17` is not tuned down here either. The state
    (`ACTIVE` · `EXPIRING` · `EXPIRED` · `ABSENT`) is COMPUTED on read, never
    stored, and **the sweep is MEMOISED per process because it destroys the
    evidence the gate needs** (swept and never-saved both read ABSENT off disk,
    and those are different facts). **`orc extra preflight` STOPS a run** on
    EXPIRED/ABSENT for a vaulted profile a route row names — the credential goes,
    the profile is stamped expired, **the route rows survive**. **`extra_on_failure`
    NEVER covers it**: that key is about an endpoint that failed, and a deadline
    you set 30 days ago deserves a stop, not a substitution. TTLs are a closed
    set (1·3·7·14·30·90·180·360, key `extra_passphrase_ttl_days`, default 30, stored
    PER PROFILE); no `0`, no "forever", **no auto-extend on use**, no timer.
    `extraCredentialValue` is the ONE reader. The connect-time modal is
    un-dismissible with exactly one destructive, NAMED escape.
  - **`EXTRA_LANE_SHAPES` is the registered mirror of the lane table** and
    `orc extra lanes` renders it through the SAME `extraResolveFor` every
    dispatch uses. A fixed-executor lane resolves **BOTH EDGES** of its pinned
    agent's band and requires them to agree; `extraAgentBand` matches by the
    agent's **model+effort TAIL** (an agent's model change is always a rename),
    and an unmatched tail is null — a number ORC invented to satisfy an interface
    is not a routing decision the user made. **`/orc-doc` joined that rule's
    list**, which it had been missing while being declared as routing foreign.
  - **EXTRA IS RENDERED IN DIY, AND ONLY RENDERED.** `diyScoreTable(cfg,
    claudeDir)` draws the composite when `extra: on` AND `extra_enabled`; the
    tier clip applies to Claude rows and **never** to a foreign one; a band that
    cannot route KEEPS ITS ROW and names its fall-through; `extra: off` is
    byte-identical to before. **Route rows stay OUT of `flow.lock.json`.**
    `fixed_executor` may name `extra:<profile>/<provider>/<model>` — the OPTION
    list is extended, `DIY_EXECUTORS` is NOT (it feeds `agentFitsTier`, and a
    foreign target has no tier), only VERIFIED profiles are offered, the skipped
    tier rule is ANNOUNCED in the compiled flow, and `scoring: off` + `extra:` is
    refused BY NAME without `extra: on`.
  - **`/orc-doc` HAS ITS OWN SWITCH** (`orc doc extra <slug> --set
    off|writer|checker|both`, in `doc.json`, one writer, default `off`).
    Resolution is highest-wins and PRINTED (`doc.json.extra` > `config.extra_roles`
    > off); `both` while `extra_roles` names neither resolves to off **and says
    so**. `orc doc next` names the sections going off Claude BEFORE the wave — a
    document's VOICE is the deliverable.
  - **THE PANEL'S INSTRUCTION TEXT IS SIMPLIFIED TECHNICAL ENGLISH**, with
    `bin/webui/i18n/TERMS.md` as the term list and its `prose-keys` fence as the
    ONLY opt-out (**the default is STE**; a new key is instruction text unless
    listed). Rationale prose keeps its voice. **NEVER simplify a CLI-computed
    value** — a state word, exit reason, config key, model id, path, band or
    command is not prose, and a simplified state word is a state that does not
    exist. No automated STE checker: a real one needs the licensed dictionary,
    and one that half-works would be trusted.
  - **Three panel rules the release added.** A **connected** tool gets no Connect
    button at all (never a disabled one) and `connected`/`verified` are computed
    in `bin/cli.js`. Every modal CONTAINS ITS SCROLL (`overscroll-behavior:
    contain` + `body.modal-open` + `scrollbar-gutter: stable`) — this was every
    modal in the app. `.ex-tool` DECLARES its rows with `1fr` as the slack row,
    never `subgrid`.
  - **THE BRIDGE WRITES THE SPEND DOWN ITSELF (v0.53.2).** `trace_line` was
    composed by the CLI and RELAYED through the orchestrator into a phase packet
    — a fact travelling through a model's memory, the remembered-not-dispatched
    pattern this repo has now lost to three times, in the one subsystem where
    the fact is money. Two graded `/orc-fast` runs, three real dispatches: one
    wrote NO `EXTRA` line, one folded the vector into a free-form `VERIFY`
    sentence, one added the trace's own ` :: ` separator and broke the parser.
    `orc extra stats` said `0 dispatches across 2 traces`, `extra rates` had
    nothing to price and the Spending tab read `0 tasks sent` — while complete
    four-kind vectors sat in `return.json` the whole time. **A cost report that
    reads zero when money was spent is worse than no report, because a zero gets
    believed.** Every dispatch now appends one record to
    **`.claude/orc/extra-spend.jsonl`** at the moment `extraDispatch` holds the
    numbers (the `RESUME.md` v0.49.5 shape), best effort by construction, and
    `spend_logged` says either way. **The trace line is DEMOTED, not retired** —
    still the narrative, still `/orc-retro`'s input. `extraStatsScan` merges
    THREE sources and always reports the split: the spend log · the traces (the
    only place `EXTRA fallback` lands, because the CALLER emits it) · saved
    dispatch returns under `{run_dir}`, accepted ONLY on `dispatched: true` plus
    a parsable `trace_line`. That last one is a RECOVERY, not an invention: it is
    the bridge's own `--json` payload read back. It carries **no date and none is
    derived from an mtime** (the `/orc-pact` UNCHECKABLE rule), so `--since`
    excludes those rows and COUNTS them. Dedupe is on the eight fields the line
    itself carries, so a lane that relayed correctly is counted ONCE. The ` :: `
    is now tolerated — **a net under the contract, never a licence to reshape the
    line.** Both ABSENT counts are named (`unreadable_spend_lines`,
    `run_returns_undated_skipped`): a report quietly short by three rows is the
    exact failure being fixed. No config key — a spend log you can switch off is
    off on the run you needed it for.
  - **`orc ui` SURVIVES ITS OWN UPGRADE (v0.53.2).** `orc upgrade` replaces the
    package the running server was loaded from, and `STATIC` is a one-time walk
    at boot — so the panel kept serving the old bytes until the user stopped the
    server, re-ran `orc ui` and found the new URL. `ctx.restart()` now spawns a
    DETACHED successor on **the SAME port and the SAME token** and the open tab
    reloads itself; a successor on a new address is not a restart, it is a second
    server. **`restarts_ui` is DECLARED per maintenance action** (`update` ·
    `prune` · `fix` · `upgrade`; never `update-global`, which targets
    `~/.claude`) and fires ONLY on exit 0. **CLIENT-TRIGGERED, never the job's
    close handler** — the job's output lives in that process's memory, and a
    closed tab correctly leaves the old server running. **The token travels in
    the ENVIRONMENT, never argv** (`ORC_UI_TOKEN`, read once at boot then deleted
    from `process.env`), the same rule that keeps `orc extra` keys off a command
    line. A successor SKIPS the idempotent-relaunch lock check and never removes
    the lock; a failed handover is a note plus `orc ui --stop` / `orc ui`, never
    a broken page, and the confirmation says the restart is coming BEFORE the
    apply.
  - **A VAULT ORC CAN OPEN ALWAYS WINS, AND `ORC_EXTRA_KEY` IS THE KEY
    (v0.53.3).** `extraCredentialValue` had ONE in-memory option and it covered
    two different facts, so an environment variable short-circuited the vault
    branch on its FIRST LINE — and only `dispatch` and `conform` passed it.
    `ping`, `models --test` and `preflight` all opened the vault and went GREEN
    while every wave authenticated with whatever that variable held and died at
    401 quoting the vaulted key it never sent. **Four honest checks, each about a
    path a wave does not take.** The split is the fix and it must stay split:
    `opts.inMemory` is an EXPLICIT key for this invocation (`--key-stdin`) and
    still wins, because it is the key being proved and stored; `opts.ambientKey`
    is a key found lying in the environment and applies ONLY to a vault that
    cannot be opened here (`extra_unlock: per-dispatch`). A passphrase in hand
    that the vault REFUSES returns that refusal — falling through would burn an
    attempt and then send the wrong secret anyway. **The return reports the
    source it USED** (`credential.source`: `vault` · `env` · `ambient` ·
    `memory` · `tool`), never what the profile declares — the two disagreed for a
    release, so the one field that could have named the bug confirmed the wrong
    story; `credential_override` prints pass OR fail, and a 401 carries
    `credential_hint` naming the source, because the provider's message describes
    the secret it SAW and only ORC knows where it came from. **`orc extra
    keyhelp` told users to export their vault PASSPHRASE into `ORC_EXTRA_KEY`** —
    the variable a dispatch sends to a third party in an `Authorization` header.
    Nothing in ORC reads a passphrase from the environment, so `passphrase_env`
    is now ALWAYS null; `vault_unlock` (the route with a DEADLINE) renders first,
    then `key_env`, described as the key. **ONE completions URL:**
    `extraProbeCompletionsUrl` — the probes hardcoded `{base}/chat/completions`
    while dispatch derived `{base}/v1/chat/completions` and honoured
    `completions_path`, which on a provider accepting only one spelling verifies
    GREEN and dispatches into a 404. A green badge is earned by the path a wave
    will actually run, and `verify_credential_source` records which credential
    earned it. **The unknown-model escape must be ABOUT THE MODEL**
    (`extraErrAboutModel`): a gateway answering `Unknown request URL` with a 404
    authenticated nothing. And the fake provider answered a completion on ANY
    path — third surface in a row to break the v0.53.0 rule that **the fake must
    be at least as strict as the real thing**, with the same tell every time: the
    dispatch was fast, cost nothing, and reported something vague. No config key
    for any of it, and no `ORC_EXTRA_KEY_<PROFILE>` — a second spelling of one
    thing is the drift this subsystem lints for everywhere else.
  - **A FAILED DISPATCH IS A POSITION, NOT A BLANK PAGE (v0.54.0).** The
    fallback re-dispatched the SAME slice to Claude as if the repository were
    untouched. It usually is not: a worker cut off mid-write leaves a
    half-changed file, and the replacement's three plausible moves are all wrong
    — rewrite it and discard work already paid for, `Edit` against a stale model
    and improvise, or read it and GUESS whose work it is. **`a lane that re-does
    work the worktree already contains` has broken this contract**, sixth in the
    family with `a lane that answers its own interview question`, `a lane that
    picks its own favourite`, `a lane that fixes what it judged`, `a lane that
    picks its own council`, `a lane that reads its own document` and `a lane that
    sends work off Claude without saying so`. Canonical prose: the `Recovery`
    section of `_shared/extra-dispatch.md`. See `knowledge.md` §4z.16.
    - **THE JOURNAL IS THE CLI'S, AND IT IS THE FOURTH TIME.**
      `.claude/orc/extra-journal/<task_id>/` is written by `orc extra dispatch`
      itself — the header AFTER the credential and the slot resolve and **BEFORE
      the first byte leaves the machine**, because that instant is the only one at
      which the repository is provably untouched and therefore the only one at
      which a baseline means anything. v0.32.0's narration, v0.49.5's hand-back
      and v0.53.2's spend log are the same lesson: **a fact relayed through a
      model's memory is a fact this repo has already lost.** Best effort by
      construction; `journal: null` is the honest answer. The baseline covers
      `declared_files` ONLY plus `git status --short` in full — with
      **`--untracked-files=all` on BOTH sides**, or an untracked directory
      collapses to `?? src/routes/` and a declared file inside it reads as a fence
      breach. **ORC's own bookkeeping is excluded by name**: a fence warning that
      always fires is one nobody reads. Retention is a fixed 30 days after a
      `done` close, and **an attempt with no result is NEVER swept**.
    - **THREE COMMANDS, AND THE FREE ONE RUNS FIRST.** `orc extra reconcile
      <task>` (0 `resumable` · 1 `nothing-to-resume` · 2 `no-journal` · 3
      `complete` · 4 `in-flight`) → `orc extra resume-slice <task> --out <f>` →
      the ORDINARY `orc extra dispatch`. **Zero new engines, zero new dispatch
      paths, zero new agents** (floor stays 51), so the fence, the cap, the
      credential rules, the spend log and §6 come along unchanged. Line counts are
      EXACT or `null` — **unknown is not zero**. It **never decides whether a file
      is finished**: no brace counter, no truncation heuristic, and **a fake
      validator would be worse than none** (the /orc-doc house-rule boundary).
    - **ATTRIBUTION DECIDES THE RECOVERY, AND `network` HOLDS THE WAVE.**
      `provider` · `network` · `local` · `worker` · `orc`, each with evidence.
      ONE unauthenticated 3-second probe separates "your wifi is down" from "the
      provider is down" — opposite correct responses — and **any** HTTP answer
      counts as reachable, because it measures the wire and not the key. A Claude
      fallback that cannot succeed is a second cost for nothing. **`orc` is in the
      set on purpose**: a report about a third party with no way to blame its own
      author is not one anybody should trust (v0.53.3). Two new failure classes,
      `stream-interrupted` and `connection-lost-local`, are what make the recovery
      choosable — `unreachable` covered both halves and they want opposite moves.
    - **A RESUME NEVER WIDENS `declared_files`, NEVER MOVES `acceptance[]`,
      NEVER MOVES THE SCORE, AND REFUSES ON A DRIFTED SLICE.** A resume is not a
      discount. Where it goes is DERIVED from `EXTRA_FAILURES[…].retry` plus the
      attribution — never a key, or somebody configures "always the same profile"
      and waits out the cap × a 401. **A non-retryable failure still gets a RESUME
      slice, on Claude**: that is what stops the fallback being a from-scratch
      dispatch. **SIX refusals, each NAMED, each writing NOTHING**
      (`not-resumable` · `in-flight` · `reverted-file` · `slice-drifted` ·
      `resume-cap` · `resume-disabled` — the sixth is its own word because "you
      turned this off" and "there is nothing to resume" have different fixes). **A
      live attempt is never resumed** (pid gone OR lease expired; pid reuse is
      real and is stated as a bound, not a proof), and **a `reverted` declared
      file blocks and names the paths** — ORC does not get to decide whether to
      resume on top of a possible destructive action.
    - **FIDELITY IS DECLARED PER ENGINE** (`per-turn` · `per-turn` ·
      `streamed-opaque`) **and never rendered stronger than it is** — engine
      `cli`'s stdout now goes to an **fd**, not a buffer in a parent that dies, so
      `output_file` stops being `null` and a timeout leaves a parsable stream.
      **The honest limit is stated:** a killed parent may leave a live child.
    - **A KILLED DISPATCH'S SPEND IS RECOVERABLE**, written once and idempotently
      as `recovered: true, complete: false` — the v0.53.2 hole through a different
      door. **Measured is not unknown; unknown is not zero; a recovered vector is
      a FLOOR and says so.** Recorded `orphaned`, never `failed`: nothing observed
      it end.
    - **ORPHANS ARE REPORTED AT PREFLIGHT AND NEVER RESUMED**, and the exit code
      does NOT move — an orphan is a finding, not a stop. Reliability becomes
      measured per profile in `orc extra stats`, with **no rate below 10
      dispatches** and `unattributed` always printed; `orc extra doctor` gains
      `extra-orphan-dispatch` and `extra-profile-unreliable` (never below the
      floor). **`orc ui ▸ Extra ▸ Recovery`** is a sixth TAB: rows expand in
      place, a FREE action is a button and a PAID one a copy-able command, a row
      with nothing to show KEEPS ITS SLOT, `in-flight` renders as a refusal with
      its reason, and the row is a FLEX COLUMN — a card whose child count changes
      with its state must not declare its rows (`.ex-tool`'s 250px ellipse).
    - **Two keys — `extra_resume` (`on`, because `off` is what is broken) and
      `extra_resume_max` (`2`) — take the count to ELEVEN**, and the four that
      were REFUSED are written down so nobody proposes them again: where a resume
      goes, the retry ladder, disabling the journal or its retention (**a record
      you can switch off is off on the run you needed it for**), and the probe.
      `extra_resume` is INERT in `/orc-quick`, announced at the agent gate. New
      trace verbs `EXTRA resume` / `EXTRA orphan`, CLI-composed: **a resume that
      leaves no line cannot be counted.**
  - **A SCORE IS WHAT A BAND NEEDS, AND FOUR LANES DO NOT HAVE ONE (v0.55.0).**
    `/orc-quick`, `/orc-fast`, `/orc-doc` and `/orc-wiki` pin an agent to a
    POSITION; routing them by resolving that agent's band AT BOTH EDGES was
    arithmetic on a number nobody chose, and it was wrong twice and dead once —
    a doc CHECKER resolved the WRITER's band, `/orc-wiki` asked for a role
    spelling `extra_roles` refuses BY NAME (so that row could never fire however
    it was configured), and `orc extra dispatch` required a `score`
    unconditionally, so **no non-scored dispatch had ever reached the bridge at
    all.** Canonical prose: the `## The slot table` and `## Precedence` sections
    of `_shared/extra-dispatch.md`. See `knowledge.md` §4z.17.
    - **SIX POSITIONS, held by `orc extra role`** — `quick-executor` ·
      `fast-executor` · `doc-writer` · `doc-checker` · `wiki-scanner-deep` ·
      `wiki-scanner-light`. `EXTRA_SLOTS` in `bin/cli.js` is the registry,
      mirrored in the markdown, golden-tested BOTH DIRECTIONS. **A row's PRESENCE
      is the arming** and `list` prints all six ALWAYS: an unrouted position
      KEEPS ITS SLOT and reads as the pinned Claude agent, because "I left the
      checker on Claude on purpose" and "there is no checker" must never look the
      same. **A slot names the POSITION, not the model** — both wiki slots
      collapse onto `orc-wiki-scanner-opus-5-med` under `opus5_only`, so **no
      agent and no pair are added** (floor stays 51).
    - **THE PRECEDENCE SENTENCE, one for both shapes:** *extra decides whether a
      Claude agent runs at all; `opus5_only` and the score tables only decide
      WHICH Claude agent runs where extra did not take it.* Scored: route row >
      `opus5_only` > `rubric_bands_override` > the default table. Slot: slot row
      > `opus5_only`'s variant of that slot's agent > the shipped agent. Under a
      taken slot `opus5_only` is **NOT CONSULTED**, not "inert", and it stays
      fully live for every position with no row — `shadowReason`, `configList`
      and `scoreTableJson` NAME the taken positions beside the taken bands.
    - **`extraResolveSlot` NEVER TOUCHES A BAND** — no `extraAgentBand`, no
      `extraResolveEdges`, no score — and the Claude answer it carries is a
      pinned NAME rather than an interval. Nine hold-backs, each named; **never
      invent a risk facet** (a wiki scan and a doc section do not have one).
      `extraResolveEdges`/`extraAgentBand` survive with **exactly ONE caller**
      (`/orc-mini`, which scores its tasks and then pins one executor over them);
      the old `fixed-role` lane shape is DELETED, because a shape no row carries
      is a shape that does not exist.
    - **The bridge takes exactly one of `score` or `slot`** (both is refused by
      name), `score` is `null` and derived from nothing, and `band` becomes
      `slot:<slot>` so the trace parser, the eight-field dedupe and
      `orc extra stats` are untouched and each position gets its own cost row.
      **Zero new engines, zero new dispatch paths, zero new agents.**
      `orc extra preflight` walks slot rows too.
    - **Per lane:** `/orc-doc` resolves each role against its OWN slot
      (`targets`, replacing the hardcoded `edges`) and `orc doc next` names the
      MODEL PER ROLE before the wave — a document's voice is the deliverable;
      `orc doc forecast` prices each half at its own provider's rates and an
      unpriceable model reads as an **em dash**. `/orc-wiki` prints its target
      beside the tier it already prints (prose in the new
      `orc-wiki/references/extra.md` — the spine budget fired and the pointer
      won). `/orc-quick` is `gated-choice`: the slot is a **THIRD OPTION** on a
      menu the user already reads, never a default, never sticky, **re-asked
      after a failure**; `extra_on_failure` and `extra_resume` stay INERT there
      and `extra_enabled` is the one key that LEFT that list.
    - **ZERO CONFIG KEYS ADDED**, and the four refused are written down:
      `extra_slots_enabled` (a second master gate), per-lane on/off keys (a row
      you can park is a row you can delete), `extra_quick_ask` (it would answer
      the one question the gate exists to ask), and a per-slot model key (the row
      IS that, validated against `models_seen`). `extra_roles` keeps
      `doc-writer`/`doc-checker` for ONE release as deprecated read+set values —
      accepted, **warned by name**, arming nothing.

- **A PROVIDER THAT STALLS TWICE IS DEMOTED, AND THE LADDER MOVES AT RUNTIME
  (v1.0.0 W5).** `extra_stall_s` stops ONE dispatch and has nothing to say about
  the second. Two consecutive `stalled` dispatches on one profile inside one run
  — or one LIVE attempt quiet for `extra_demote_stale_min` minutes — drop that
  profile to the BOTTOM of its families for the rest of the run, so `opus5_only`
  or the shipped score table becomes the effective P0. Canonical prose: the
  `## The demotion` section of `_shared/extra-dispatch.md`.
  - **IT WRITES NO NEW MEASUREMENT AND IS NEVER REMEMBERED.** Every fact comes
    from `EXTRA_FAILURES.stalled` + the `timeline` (v0.56.1) and the CLI-written
    journal (v0.54.0). `extraDemotionState()` recomputes the verdict FROM DISK on
    every read; the only thing stored is the HUMAN half — a promote or a manual
    demote with its reason — in `{run_dir}/{slug}/extra-demotion.json`, beside
    `RESUME.md`, deleted with the run. Fifth time this repo has applied that
    lesson (v0.32.0 narration · v0.49.5 hand-back · v0.53.2 spend log · v0.54.0
    journal).
  - **THE JOURNAL HEADER NOW CARRIES `run`**, read by `extraCurrentRun()` off the
    trace `.current` pointer at dispatch time — the spend log's own reader, never
    a caller and never a slice field. **An attempt with `run: null` belongs to NO
    run's clock** and is counted as `skipped_unattributed` and PRINTED.
  - **TWO CLOCKS, NEVER MERGED.** The consecutive clock is about attempts that
    ENDED; the stale clock is about one that has NOT. Each has its own key and
    its own `0`. **`extra_stall_s: 0` silently disables the consecutive clock**
    (nothing is ever classified `stalled`) and the report says so. **ONLY
    `stalled` counts**, in both directions — a 401 RESETS it, and demoting on one
    would hide a credential problem behind a routing change. A resume of the same
    stalled attempt is the SAME stall.
  - **FOUR THINGS IT NEVER DOES:** writes your config (run-scoped, the
    `ultra_mode` precedent) · auto-promotes (`orc extra promote <run> --reason`
    is a human action; **a promote is a WATERMARK, not a mute** — it forgives the
    evidence it saw and re-arms) · changes WHAT (same score, same
    `declared_files`, same `acceptance[]`, and the SAME Claude agent) · abandons
    the position (`reconcile` → `resume-slice` → an ordinary Claude dispatch).
  - **IT IS ANNOUNCED, MANDATORILY.** The mirror of `a lane that sends work off
    Claude without saying so` is a lane that quietly STOPS. `orc lane config`
    renders the overlay rank as `state: "demoted"` — the word W3 declared with no
    producer — and the trace verb `EXTRA demote` is CLI-composed, because a
    demotion that leaves no line cannot be counted. Three commands
    (`demotion` 0/1/2 · `promote` · `demote`), a reason REQUIRED on both writes,
    preflight reports it WITHOUT moving its exit code, `orc doctor` gains
    `extra-demoted-run` routed to Extra, and `orc extra stats` counts it per
    profile per run with **no rate below 3 runs**. **TWO config keys, and
    `extra_demote` / `extra_promote_after` were both REFUSED** — the two zeros
    already are the off switch. Zero new agents, zero new engines. The slot
    resolver's hold-backs went nine → **ten**. See
    `orc-v1-build/findings/W5-demotion.md`.

