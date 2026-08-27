# Changelog

All notable changes to ORC, newest first.

The **latest release** is also summarised in the [README](README.md#changelog).
This file is the full history, and it is the file `orc changelog` reads — that
command prints only the entries **newer than the version you have installed**.

Format: `### v<version> — <title> _(<date>)_`.

---

### v0.56.0 - a rename moved the command, and nobody could reach the fix _(2026-08-27)_

**READ THIS FIRST IF YOUR `orc upgrade` IS FAILING.** If you are on a version
before v0.56.0, this release cannot install itself - your `orc upgrade` is the
OLD one and it fails the same way every other route does. Run these three lines
once, by hand, and you are across for good:

- **Step 1 - release the command from the old package:** `npm uninstall -g orc`
- **Step 2 - install the current package:** `npm i -g @azure-id/orc`
- **Step 3 - re-apply it to your project:** `orc update` (add `--global` to also
  refresh `~/.claude`)

Then check it worked: `orc version` should print 0.56.0 or newer, and
`orc doctor` should no longer mention `legacy-global-package`. Nothing in your
`.claude/` is touched by any of this, and your `orc.config.yaml` survives.
**Do not use `npm i -g -f`** - `--force` overwrites the command file and leaves
the old package installed underneath, owning nothing and never updated again.
From v0.56.0 onward `orc upgrade` does all three steps for you, announced.

**The package moved from the unscoped `orc` to `@azure-id/orc`, and every
upgrade path in the field died at once.** Both names declare the same `orc` bin.
npm links a bin only if the shim is unowned or owned by the installing package,
so with the old `orc` package still on disk globally, installing the new scoped
one failed with `EEXIST` on the command file itself. That error is about a FILE,
not a source - which is exactly why swapping sources changed nothing: the
tarball, the `github:` spec and the registry all failed identically, `orc
upgrade` walked all three and then printed npm's error wall, and `orc ui`'s
upgrade action did the same. `npm i -g -f` was the only thing that "worked", and
only by overwriting the command file and leaving the superseded package
installed underneath as a ghost that owns nothing and is never updated again.

- **The legacy package is EVICTED BEFORE any source is tried.** `orc upgrade`
  now looks for a globally-installed package that is not this one and whose
  `bin` declares `orc`, and uninstalls it first. Ordering is the point: the
  collision fails every source identically, so walking the ladder first only
  spends three network round trips arriving at the same `EEXIST`. It is
  announced, never silent - it is a global npm mutation on the user's machine,
  and the only one ORC makes for them.
- **Detection is by OWNERSHIP, never by directory name.** A directory called
  `orc` that holds THIS package is not legacy, and a package that declares no
  `orc` bin blocks nothing. A machine that never saw the rename land must not
  have its working install uninstalled.
- **`--force` survives, scoped to the one case it is right for.** If a
  collision remains after the eviction there was nothing to uninstall - an
  ORPHANED shim npm left behind with no package owning it. `--force` overwrites
  a file that belongs to nobody, which is the case it exists for.
  `isBinShimCollision` requires the `EEXIST` code AND a path component that IS
  the bin name, so it never reaches for `--force` on an unrelated `EEXIST`
  deeper in a dependency tree.
- **The npm REGISTRY is now tried first**, then the tarball, then the `github:`
  spec. The registry resolves a VERSION rather than a branch tip; the `github:`
  spec shells out to git and fails under restricted git / NVM, so it stays last.
  `--from` and `ORC_INSTALL_SPEC` still win outright, and the remembered
  `last_good_spec` still leads.
- **`freshCliPath()` resolves the SCOPED directory first.** It looked only under
  `<npm root -g>/orc`, which after the rename is the LEGACY package - so on a
  machine mid-rename it resolved a path that existed and step 2 re-applied the
  very templates step 1 had just superseded. A hit is now accepted only if the
  manifest there says the current package name: a directory that exists is not
  proof of identity.
- **`orc doctor` reports it by name.** `legacy-global-package` is the one
  finding that explains why `orc upgrade` cannot fix anything else in the
  report. It is deliberately NOT `--fix`-able: `orc doctor --fix` is scoped to
  this project's `.claude/`, and evicting a global npm package is neither
  project-scoped nor something to do without saying so - so its `fix_command`
  points at `orc upgrade`, which does it announced. `FINDING_ROUTE` sends it to
  Maintenance, where the upgrade action is.
- **A CAUTION at the top of the README carries the one-time manual fix**, because
  the fix cannot reach the people who need it most: a user still on the old
  package does not have this code, so their `orc upgrade` still fails. Two lines
  (`npm uninstall -g orc` then `npm i -g @azure-id/orc`) get them across once,
  and from here `orc upgrade` handles it.

---

### v0.55.2 - a gate that is never probed is a gate that is always off _(2026-08-27)_

**`/orc-quick` and `/orc-fast` documented the foreign-worker option and then
never went and looked for it.** Both lanes carried the full `orc extra` slot
contract - the menu line, the dispatch call, the failure path - but neither
preflight ever RAN the probe that answers whether a position is held. orc-quick's
Q0 said "read `log_dir` only, read no other key"; orc-fast's F0 had gates a, b
and c and no extra step, while the F2 prose claimed the `extra:` line "joins the
F0 preflight". So a user who armed `extra_enabled` and set
`orc extra role set quick-executor ds/deepseek-chat` was still offered the two
shipped Claude executors and nothing else, with no way to tell configuration
from a bug.

- **orc-quick Q0 gains one PROBE**, named as the single exception to
  "read no other key": `orc extra resolve --slot quick-executor --json`. One
  command answers the master gate, the position and the routing together, so the
  code-writing menu can render line 3. It is still an OPTION - never a default,
  never sticky, re-asked after a failure.
- **orc-fast F0 gains gate `d`**, a probe rather than a gate:
  `orc extra resolve --slot fast-executor --json`. Resolved `extra` prints the
  P0 `extra:` line where the prose always said it would, naming the agent it
  displaces (`orc-executor-sonnet-4-6-high`); resolved `claude` prints nothing
  and never falls back - no row on a slot is an ANSWER, not a gap.
- **`/orc-doc` was never affected.** Its targets are resolved by
  `docExtraResolve` inside `orc doc next`, so the CLI computes them and no
  preflight step can forget to ask. That is the shape the other two now borrow.

No CLI change, no config key, no agent change.

### v0.55.1 — ORC is on npm _(2026-08-27)_

**ORC is published as [`@azure-id/orc`](https://www.npmjs.com/package/@azure-id/orc).**
The GitHub tarball still works and nothing about the payload changed — no skill,
no agent, no CLI behaviour moved. This is the install path getting a name.

- **`npm i -g @azure-id/orc`** is the install, and
  **`npm i -g @azure-id/orc@latest`** is the update. `orc upgrade` already
  fetched the newest package and then applied it, and it continues to;
  `orc upgrade --from @azure-id/orc` names npm explicitly.
- **The GitHub tarball is the fallback now**, not the headline — kept in the
  Quick start behind a fold for forks and for anyone pinning a branch.
- **`orc update` is unchanged**: it re-copies the package you already have and
  never touches the network, so `npm i -g @azure-id/orc@latest && orc update`
  is the manual spelling of `orc upgrade`.

---

### v0.55.0 — a score is what a band needs, and four lanes do not have one _(2026-08-26)_

**A score is what a band needs, and four lanes do not have one.** `/orc-quick`,
`/orc-fast`, `/orc-doc` and `/orc-wiki` pin an agent to a POSITION rather than
scoring a task. `orc extra` routed them anyway — by resolving the pinned agent's
score band at both edges, which is arithmetic on a number nobody chose.

It was wrong twice and dead once. A document set to `checker` resolved the
**writer's** band for a role it was not routing. `/orc-wiki` asked for a role
named `scanner` that `extra_roles` refuses by name, so that lane could never
route however it was configured — `orc extra lanes` printed `claude` forever,
with a reason that read like a user's choice. And `orc extra dispatch` required a
`score` unconditionally, so **no non-scored dispatch had ever reached the bridge
at all** — not the fence, not the journal, not the spend log.

- **`orc extra role` holds six POSITIONS**: `quick-executor` · `fast-executor` ·
  `doc-writer` · `doc-checker` · `wiki-scanner-deep` · `wiki-scanner-light`. One
  named position, one chosen `profile/model`, and **a row's presence is the
  arming**. `list` prints all six always — an unrouted position keeps its slot
  and reads as the Claude agent it falls through to, because "I left the checker
  on Claude on purpose" and "there is no checker" must never look the same.
- **A second resolver that never touches a band.** `orc extra resolve --slot
  <slot>` is the sibling of the score shape, same answer, same exit codes, and
  the Claude answer it carries is a **pinned NAME rather than an interval** —
  strictly more honest than what the scored half can offer. Nine hold-backs, each
  answered by name; a cited risk is never invented for a lane that has none.
- **Precedence, one sentence for both shapes:** extra decides *whether* a Claude
  agent runs at all; `opus5_only` and the score tables only decide *which* Claude
  agent runs where extra did not take it. Under a taken slot `opus5_only` is **not
  consulted** — and it stays fully live for every position with no row. `orc
  config list` and `orc config set` now name the taken POSITIONS beside the taken
  bands.
- **The bridge accepts a slot.** Exactly one of `score` or `slot`; both is
  refused by name; `band` becomes `slot:<slot>` so the trace parser, the
  eight-field dedupe and `orc extra stats` are untouched and each position gets
  its own cost row for free. **Zero new engines, zero new dispatch paths, zero new
  agents** — the fence, the cap, the credential triangle, the journal, the spend
  log and the resume ladder all come along unchanged.
- **Per lane:** `/orc-doc` resolves each role against its OWN slot and `orc doc
  next` names the model per role before the wave (a document's voice is the
  deliverable); `/orc-wiki` prints its target beside the tier it already prints;
  `/orc-fast` names the agent it displaced in the F0 line; **`/orc-quick` gets a
  THIRD OPTION on its menu** — never a default, never sticky, re-asked after a
  failure, because that gate's whole premise is asking.
- **`orc ui ▸ Extra ▸ Routing` grows a second ladder** below the bands, and
  **zero config keys were added** — a second master gate, per-lane switches,
  `extra_quick_ask` and a per-slot model key were all considered and are written
  down as refused.

---

### v0.54.0 — a failed dispatch is a POSITION, not a blank page _(2026-08-25)_

**A worker on another model wrote six of seven lines and lost its connection.
ORC sent the same task to Claude from scratch — onto a file that was already
two-thirds written.**

`orc extra` had exactly one recovery move: re-dispatch the SAME slice to the
Claude band. That move assumes the worktree is where the dispatch found it. **It
usually is not.** The replacement executor's three plausible moves were all
wrong: `Write` the file whole and discard work you already paid for · `Edit`
against a stale mental model so `old_string` does not match and it improvises ·
read first and then guess whether what is there is its own earlier work, a
teammate's, or garbage. No field in the slice could have told it, and no field in
the return contract could have carried it.

**The registered token, sixth in its family:** `a lane that re-does work the
worktree already contains` has broken this contract. It joins `a lane that
answers its own interview question`, `a lane that picks its own favourite`, `a
lane that fixes what it judged`, `a lane that picks its own council`, `a lane
that reads its own document`, and `a lane that sends work off Claude without
saying so`.

- **THE JOURNAL IS THE CLI'S, AND IT IS WRITTEN BEFORE THE FIRST BYTE LEAVES THE
  MACHINE.** `.claude/orc/extra-journal/<task_id>/` — a header carrying HEAD,
  `git status --short` in full and a hash plus a line count for every
  `declared_files` entry; a progress log appended as the dispatch runs; a result
  written beside the spend append. It is written by `orc extra dispatch` itself,
  which is the **fourth** time this repo has chosen a written-by-the-CLI fact
  over a relayed one (v0.32.0 narration, v0.49.5's hand-back page, v0.53.2's
  spend log). No lane writes it, no lane can forget it, and it is best effort by
  construction: a journal that cannot be written never takes the dispatch down.
  The header is the only record of what the repository looked like before a
  third party touched it, which is the only thing that makes a reconciliation
  possible at all.
- **`orc extra reconcile <task_id>` — FREE, deterministic, and it runs before
  anything paid.** Five states, five exit codes (0 `resumable` · 1
  `nothing-to-resume` · 2 `no-journal` · 3 `complete` · 4 `in-flight`), and 0 is
  the answer the command exists to give rather than "healthy". Per declared file:
  `untouched` · `created` · `modified` · `deleted` · `reverted`, with line counts
  where they can be computed EXACTLY and `null` where they cannot — **unknown is
  not zero**. Plus `touched_undeclared[]` (a fence breach, surfaced here because
  a crashed dispatch is exactly when the worktree delta never ran), the last
  recorded action, and the partial token vector.
- **It deliberately does NOT decide whether a file is finished.** No brace
  counter, no truncation heuristic, no language sniffing — /orc-doc's house-rule
  boundary verbatim: the CLI cannot parse intent, so it does not pretend to, and
  **a fake validator would be worse than none.** The checks that answer "is this
  done" already exist and are already engine-blind. Reconciliation's job is to
  point them at the right thing.
- **ATTRIBUTION — whose fault it was, with the evidence.** Five verdicts, each
  carrying a different correct recovery: `provider` · `network` · `local` ·
  `worker` · `orc`. **`network` HOLDS THE WAVE** — a Claude fallback cannot
  succeed when the machine has no network, so falling back would be a second
  failure and a second cost for nothing. The two are told apart by ONE
  unauthenticated 3-second request on a path that has already failed, made only
  on the reasons that cannot be separated without it. `orc` is on the list on
  purpose: a report about a third party with no way to blame its own author is
  not a report anybody should trust — v0.53.3 was exactly an ORC bug that
  presented as a bad key.
- **`orc extra resume-slice <task_id> --out <f>` composes the continuation, and
  the CLI owns the wording.** It is a NEW DISPATCH OF A DERIVED SLICE through the
  ordinary bridge — zero new engines, zero new dispatch paths, **zero new
  agents** — so the fence, the concurrency cap, the credential rules, the spend
  log and the worktree delta all come along unchanged. It **never widens
  `declared_files`**, **never moves `acceptance[]`**, **never moves the score**
  (a resume is not a discount), and **refuses on a drifted slice**, naming both
  hashes.
- **Where a resume goes is DERIVED, never a config key.** Retryable → the same
  profile in a new session, up to `extra_resume_max`. Non-retryable → the Claude
  band, **still as a RESUME slice** — which is what fixes the original bug: the
  Claude fallback stops being a from-scratch dispatch, which it should never have
  been. A key here would let somebody configure "always the same profile" and
  then wait out the cap × a 401.
- **Six refusals, each NAMED, each writing NOTHING** (`not-resumable` ·
  `in-flight` · `reverted-file` · `slice-drifted` · `resume-cap` ·
  `resume-disabled`). **A live attempt is never resumed:** a dropped socket does
  not prove a provider stopped streaming, so a resume is gated on the pid being
  gone OR the lease having expired — and past the lease a live pid is treated as
  somebody else's process, stated as the honest bound it is rather than as proof.
  **A `reverted` declared file blocks and names the paths:** resuming on top of a
  possible destructive action is the one case where continuing is worse than
  starting over, and ORC does not get to make that call.
- **Two new failure classes make the recovery choosable.** `stream-interrupted`
  (the connection was established and then died — `unreachable` means it never
  opened, and those two want opposite recoveries) and `connection-lost-local`
  (the same, with the probe also failing). A taxonomy that returned one word for
  both could not pick either, which is why there was only ever one recovery.
- **JOURNAL FIDELITY IS DECLARED PER ENGINE and never rendered stronger than it
  is.** `api` and `claude-shim` are `per-turn`; engine `cli` is
  `streamed-opaque` — its child's stdout now goes to a FILE DESCRIPTOR rather
  than a buffer in a parent that dies, so a wall-clock kill leaves the bytes on
  disk and `output_file` stops being `null`. ORC captured them and did not
  interpret them, and **a gap that is not reported reads as a capability**.
- **A killed dispatch's spend is recoverable.** `appendExtraSpend` runs after the
  engine returns, so a killed parent left real money invisible to every cost
  report — the v0.53.2 hole through a different door. Reconcile writes the
  journal's running vector once, idempotently, as `recovered: true, complete:
  false`. **Measured is not unknown; unknown is not zero; a recovered vector is a
  FLOOR and says so.**
- **Orphans are REPORTED at preflight and never resumed.** `orc extra preflight`
  lists every journal with a header, no result and an expired lease — and does
  **not** change its exit code, because an orphan is a finding, not a stop.
  Silently continuing a third party's half-finished write into somebody's
  repository is the same class of act as routing off Claude without saying so.
- **Reliability becomes a MEASURED property of a profile.** `orc extra stats`
  gains per-profile `dispatches` · `failed` · `resumed` · `orphaned` · mean time
  to failure · the attribution split, and **below 10 dispatches there is no rate
  at all** — a percentage from three tries is noise with a percent sign on it.
  `orc extra doctor` gains `extra-orphan-dispatch` and `extra-profile-unreliable`
  (never below the floor). Both ABSENT counts are named.
- **`orc ui ▸ Extra ▸ Recovery`** — a sixth tab, not a tenth card. One row per
  journal, **expanded in place** (the Runs-row rule), and the free/paid line is
  visible: `reconcile` is a button, `resume-slice` is a copy-able command,
  because the panel never runs a lane. A row with nothing to show KEEPS ITS SLOT;
  `in-flight` renders as a refusal with its reason; prune is preview-then-apply
  and **names every directory**. Spending gains the reliability strip. Overview
  gets one line, only when there is something to say, and it never offers to
  continue anything.
- **Two new config keys, and the four that were refused are written down.**
  `extra_resume` (`on`) and `extra_resume_max` (`2`) — nine keys became eleven.
  Deliberately NOT added: a key for where a resume goes, a key for the retry
  ladder (`extra_timeout_s` is already the budget), a key to disable the journal
  or its 30-day retention (**a record you can switch off is off on the run you
  needed it for**), and a key for the network probe. `extra_resume` is INERT in
  `/orc-quick`, announced at the agent gate.
- **New trace verbs** `EXTRA resume` and `EXTRA orphan`, composed by the CLI and
  copied verbatim — a resume that leaves no line cannot be counted by
  `orc extra stats` or `/orc-retro`. New mocked run: `mock-run/extra-recovery.md`.

---

### v0.53.4 — the reload that dropped its own token _(2026-08-24)_

**Every `orc update` from the panel ended on `This link is missing its session
token.` — and the token was never missing.**

v0.53.2 taught the server to hand itself over to a fresh process on the SAME
port and the SAME token, so the URL in the address bar stays valid and the open
tab only has to reload. That half worked. The reload did not: the panel strips
`?t=` out of the visible URL at boot (`00-core.js`, so the token never lands in
a screenshot or a pasted link), and the hand-over then called
`location.reload()` — which re-requests **the stripped address**. No `?t=`, no
`x-orc-token` header on a document request, and the server correctly answered
with the un-authenticated page. Deterministic, on every maintenance action that
declares `restarts_ui`.

- **A reload is not `location.reload()` here.** `reloadWithToken()` re-attaches
  the in-memory token and `location.replace()`s that URL. It is the only reload
  route in the panel, and a test fails on any bare `location.reload()` in
  `app.js` — the stripping is deliberate, so the fix has to be the reload, not
  the strip.
- Nothing about the server, the successor, the lock, the token generation or the
  `restarts_ui` declaration changed. The upgrade had already installed by the
  time the page broke; the user's recovery — `orc ui --stop` then `orc ui` — was
  producing a *new* token for a server that was already the new build.

---

### v0.53.3 — the key it never sent _(2026-08-24)_

**A vaulted, verified, routed connection authenticated every wave with the wrong
secret, and four separate green checks agreed it was fine.**

`orc extra dispatch` resolved the credential by passing `inMemory:
process.env.ORC_EXTRA_KEY` into `extraCredentialValue`, and that option
short-circuited the vault branch **on its first line**. So whenever
`ORC_EXTRA_KEY` was set in the environment — a leftover from another profile,
another provider, another day — dispatch sent *that* value and never opened the
vault at all. The profile's real, verified, vaulted key was never consulted.

Only `dispatch` and `conform` passed that option. `ping`, `models --test` and
`preflight` all resolved without it, opened the vault, and succeeded. Hence the
part that made this expensive to find:

```
orc extra doctor                          → nothing to report.
orc extra list                            → dipkshit  deepseek/api  verified  key vault
orc extra preflight                       → dipkshit ✔ ok  saved until 2027-08-19
orc extra models dipkshit --test <model>  → ✔ answered in 1866ms
```

Four checks, each honest about the path it exercised, **none of them exercising
the path a dispatch takes**. Then the wave died at HTTP 401 —
`Your api key: ****w5f7 is invalid` — pointing at the vaulted key the user had
verified four minutes earlier, while the key ORC actually sent came from an
environment variable the message never named. Nothing was written and nothing was
billed; the run halted at F2 under `extra_on_failure: stop`.

- **The two in-memory options were one option, and they are different facts.**
  `opts.inMemory` is an **explicit** key supplied for this invocation
  (`--key-stdin`) — the key being tested and then stored, so it still wins.
  `opts.ambientKey` is a key found lying in the environment, and it is now what
  it was always written to be: the **unattended-wave fallback**, applying only to
  a vault that cannot be opened here (`extra_unlock: per-dispatch`, where nothing
  is cached on purpose). **A vault ORC can open always wins.**
- **A passphrase in hand that the vault refuses is a real answer about the
  declared source,** not a reason to reach for a leftover variable. It returns the
  refusal rather than burning an attempt and then sending the wrong secret anyway.
- **The return now reports the source it USED.** `credential.source` is one of
  `vault` · `env` · `ambient` · `memory` · `tool`, and it describes what happened
  rather than what the profile declares — the two disagreed for a release, so the
  one field that could have named the bug confirmed the wrong story instead.
  `credential_override` is printed whenever the profile's declared source was not
  the one used, pass or fail: an override nobody was told about is the same class
  of silence as work leaving Claude with no `extra:` line.
- **A 401 names the source that produced the rejected secret.** The provider's
  message describes what it saw; only ORC knows where that came from. It was a
  five-minute fix and a multi-step diagnosis.

**`ORC_EXTRA_KEY` holds the KEY, and `orc extra keyhelp` said it was the
passphrase.** For a vaulted profile it rendered a per-OS instruction to export
`ORC_EXTRA_KEY="<your passphrase>"` — into the exact variable a dispatch sends to
the provider in an `Authorization` header. Following ORC's own instruction handed
the secret that opens the vault to a third party. The block is gone. In its place
the route **with a deadline on it** renders first (`orc extra session <name>
--save --ttl 30`, the v0.52.0 design), then the variable, described as the key,
with the warning that a passphrase must never go there. Nothing in ORC reads a
passphrase from the environment, so `passphrase_env` is now always `null`.

**One completions URL, and the probes speak it.** `ping` rung 2 and
`models --test` hardcoded `{base}/chat/completions` while dispatch derived
`{base}/v1/chat/completions` through `apiCompletionsUrl` — and neither probe
honoured a profile's `completions_path` at all. DeepSeek accepts both spellings,
so this was not the 401; on a provider that accepts only one it produces a
profile that verifies **green** and dispatches into a 404, which is the same lie
wearing a different status code. Both probes now call the same builder.

**And the unknown-model escape has to be about the model.** A 400/404/422 on the
probe's invented model id was read as proof that the endpoint authenticated
before declining the name — which is only true if the endpoint is the one it was
aiming at. A gateway answering `Unknown request URL` with a 404 authenticated
nothing. The rejection must now name the model asked for, or say something about
a model/engine/deployment; otherwise the ping fails honestly instead of
verifying. `verify_credential_source` records which credential earned the badge.

**The fake provider was more permissive than the provider.** It answered a
completion on **any** path, which is precisely why two probes could hardcode the
wrong one for three releases with a green suite. It now serves exactly the path
`apiCompletionsUrl` derives and 404s the rest — the v0.53.0 rule, applied to the
third surface in a row that broke on it.

---

### v0.53.2 — the cost that was paid and never written down _(2026-08-24)_

**Two foreign dispatches ran, cost real money, and every cost report read zero.**

`orc extra dispatch` composes an `EXTRA …` trace line and hands it back for the
lane to copy into a phase packet. That is a RELAY THROUGH A MODEL — the
remembered-not-dispatched pattern this repo has already lost to twice — and it
broke in both directions on two graded runs of the same feature:

- one wrote `EXTRA Codex/gpt-5.4-mini :: engine=cli …`, adding the trace's own
  `verb … :: tail` separator, which the parser did not accept;
- one dropped the line entirely and folded the token vector into a free-form
  `VERIFY` sentence.

Both dispatches SUCCEEDED. `return.json` and `return-fast.json` were sitting in
the run folder with complete four-kind vectors — 27,029 / 0 / 159,616 / 1,895 for
codex, 136 / 0 / 20,032 / 134 for opencode — and a perfectly formed `trace_line`
inside each. `orc extra stats` reported **0 dispatches from 2 traces**, `orc extra
rates` had no pair to price, and `orc ui ▸ Extra ▸ Spending` read **`0 tasks
sent`**. A cost report that reads zero when money was spent is worse than no
report, because a zero gets believed.

- **THE BRIDGE WRITES THE SPEND DOWN ITSELF.** Every dispatch appends one JSON
  object to `.claude/orc/extra-spend.jsonl` at the moment it holds the numbers —
  profile, provider, model, engine, task, band, the four token kinds unblended,
  outcome, duration, the run it belonged to, and the `trace_line` it composed.
  The `RESUME.md` lesson from v0.49.5 applied to money: **the fact is recorded by
  the hand that computed it.** Best effort by construction — a record that cannot
  be written never takes a dispatch down — and the dispatch says `spend_logged`
  either way, because a dispatch no cost report can see is worth one line now
  rather than a mystery later.
- **The trace line is NOT retired, it is DEMOTED to the second source.** It is
  still the run's narrative and still what `/orc-retro` reads; it is no longer
  what the money depends on. The two are DEDUPED on the eight fields the line
  itself carries, so a lane that relays correctly is counted exactly once —
  double-counting a correct relay would punish the behaviour the contract asks
  for.
- **The parser now accepts the ` :: ` a trace writer reaches for by reflex.**
  Every other verb in a trace is `VERB … :: tail`. A line that is faithful about
  the numbers and off by two characters in its punctuation must still parse.
  Tolerance is a net under the contract, not a licence to reshape the line.
- **A saved dispatch return backfills a run made before any of this existed.**
  `{run_dir}/<slug>/*.json` is read as a THIRD source when — and only when — it
  carries `dispatched: true` and a `trace_line` this parser accepts. That is the
  CLI's own payload read back, not a narrative about it, which is what separates
  a recovery from an invention. It carries no date and **none is derived from an
  mtime** (the `/orc-pact` UNCHECKABLE rule), so `--since` excludes those rows and
  says how many.
- **Every count says which source it came from,** on both surfaces. "ORC wrote
  this down itself" and "a trace happened to mention it" are different levels of
  confidence in the same total. Two ABSENT counts are named rather than absorbed:
  a torn log line, and an undated saved return a date filter dropped — a report
  that is quietly short by three rows is the exact failure being fixed.

**And the panel now survives its own upgrade.**

`orc upgrade` replaces the package the running `orc ui` server was loaded from.
Node read `bin/webui` at require time and `STATIC` is a one-time walk at boot, so
an upgraded panel keeps serving the old bytes: the version in the rail does not
move, a new panel does not appear, and a fixed bug is still there. The remedy was
three manual steps nobody was told about — stop the server, re-run `orc ui`, open
the new URL.

- **The server hands itself over.** After a maintenance action DECLARED as
  replacing the install (`update`, `prune`, `fix`, `upgrade` — never
  `update-global`, which targets `~/.claude`) succeeds, the panel restarts on the
  **same port and the same token** and the open tab reloads itself. A successor on
  a new address is not a restart; it is a second server, and the tab you are
  looking at would still point at the corpse.
- **CLIENT-TRIGGERED, never automatic on the job's close handler.** The job's
  output lives in the server's memory, so restarting the instant a command
  finished would destroy the record of what it did before anyone read it. It also
  means a tab that is already closed leaves the old process running, which is the
  safe resting state.
- **The token travels in the ENVIRONMENT, never in argv** — it authenticates a
  write surface, which puts it in the same class as the credentials `orc extra`
  refuses on a command line. It is read once at boot and deleted from
  `process.env`, so no CLI subprocess the server shells out to inherits it.
- **A failed handover is a note and two commands, never a broken page.** The old
  panel keeps working; it just prints `orc ui --stop` and `orc ui`. And the
  confirmation says the restart is coming BEFORE the apply — a panel that reloads
  itself with no warning reads as a crash.

---

### v0.53.1 — "up to date" now names what it checked _(2026-08-23)_

**A one-line diagnostic for the update check that could not be questioned.**

The update check was never broken, and that was the problem. `orc version` reads
`package.json` from `UPDATE_URL`; `orc upgrade` installs from `TARBALL_SPEC`.
They are two different URLs on what is *normally* the same branch — and only the
second one was ever printed, on either surface. The Maintenance panel's `source`
row shows the install tarball, so a reader concludes the version comparison read
main too.

That gap makes a true statement unfalsifiable. A maintainer who cut v0.53.0 on an
unmerged release branch saw `✓ up to date` against a main that was still at
0.52.0, with nothing on screen to distinguish "you are current" from "the release
never reached the ref this reads". There is no way to tell those apart from the
output, which is why it reads as a defect in the checker.

So the number and the ref it came from now travel together, everywhere the number
is reported:

- **`orc version`** prints `✓ up to date (azure-id/orc@main is at 0.52.0)`, and
  the offline branch names the unreachable ref rather than saying "source".
- **`orc version --json`** gains `checked_source` (the URL) and `checked_ref` (the
  `owner/repo@ref` label). This is not a new idea: `orc changelog --json` has
  always carried its own `source`, and this is that field's missing twin — a
  field the human path implied and the JSON omitted.
- **`orc ui` ▸ Maintenance** gains a `version read from` row beside `source`, so
  the two URLs are visibly two URLs. The fixture carries both fields.

`checkSourceLabel()` shortens a `raw.githubusercontent.com` URL to
`owner/repo@ref` and returns anything else verbatim — a custom `ORC_VERSION_URL`
is shown as written rather than mangled into a label that does not describe it.

**Nothing about the check itself changed.** No new request, no new cache, no
change to the 24h TTL, `ORC_NO_UPDATE_CHECK` or the comparison. The only thing
that is new is that the answer can now be checked.

### v0.53.0 — the schema the provider rejected, and a routing table you can read _(2026-08-23)_

**One outage, one defect visible at a glance, and the Extra panel rebuilt.**

**The outage.** Engine `cli` on **codex** had been 100% dead for a release, and
the suite was green the whole time. ORC handed codex an `--output-schema` with
`additionalProperties: true`; OpenAI structured outputs require a **closed**
object at every level, so every dispatch was an **HTTP 400 raised before the
model was ever reached** — fast, free, and reported as something vague. Flipping
only that flag is a **second** 400, this time naming `files_changed`, because
`required` must list every key in `properties`. An optional field is a nullable
union now, never an omission from `required`, and the shape is documented as
**provider-dictated rather than chosen** — the comment calling it "deliberately
minimal" is what produced the bug.

Three things went with it:

- **The classifier was reading the wrong stream.** codex relays the upstream
  `invalid_request_error` inside its own event stream on stdout while printing a
  benign notice on stderr, so a precisely-diagnosable, non-retryable failure came
  back as `unknown` and `retry: false` was reached by luck. The codex adapter
  now classifies from **the provider's own error object** first, and
  `classified_from` says which of the two answered — a field that reports where
  a verdict came from must not lie about it.
- **A measurement was being reported as unknown.** codex *does* report
  `cache_write_input_tokens`; the adapter declared three usage kinds, so ORC
  threw a real number away and then said it was never measured.
  `reasoning_output_tokens` is still deliberately unread — the Responses API
  counts it inside `output_tokens`, and an unproven pricing change is worse than
  a missing one.
- **And the reason it shipped green: the fake was more permissive than the
  provider.** It asserted the schema existed and mentioned `status`, and modelled
  none of OpenAI's rules. That is the **third release in a row** broken by the
  same shape — `--auto` renamed, a greedy `-f` array, now an open schema. **A
  strict third-party parser fails for free, and it looks like a model problem.**
  The defence is the same every time: the fake must be at least as strict as the
  real thing. It now rejects both 400s by name.

**The ellipse.** A ready-and-verified tool card drew its "connected as" chip as a
250px green ellipse. `.ex-tool` declared `grid-template-rows: auto auto auto 1fr
auto` — but **four states carry four different numbers of children**, so the chip
landed in the `1fr` slack row, stretched (a grid item's default), and a 999px
radius did the rest. It hit whichever ready card had the shortest content in its
row, so it was never about one tool. The card is a flex column now, with no row
template at all. The old test asserted the property was *present* — which it was,
while the panel drew an ellipse.

**The Extra panel.** It was nine cards in one 8,786px scroll: no first step, no
last step, no way to be *done* with a section.

- **Five tabs** on the panel's own precedent — Setup, Routing, Limits, Spending,
  Providers. The header strip and "what needs your attention" stay outside them,
  because a caution you have to go looking for is a caution nobody reads. The
  open tab survives a re-render, and the gate still decides what **exists**: with
  nothing connected, three tabs are not rendered as empty shells.
- **One vertical band ladder** replaces the horizontal rail *and* the duplicate
  list of rows below it. The target is no longer truncated, the widths no longer
  lie (a `min-width` floor was fighting the percentage), nothing is off-screen,
  there is a **legend** — green means the work leaves your machine — and the row
  you read is the row you edit.
- **The plain-language range is the CLI's.** `orc extra route` gains `range`
  ("scores 0 to 29") and `meaning` per row, printed on the human path as well.
  Writing "simple work" beside a score in the panel would be the panel deciding
  what a score means.
- **One sentence and one control per tool state**, with the diagnostics behind a
  disclosure.
- **Wording**: the panel was serving **design rationale as user instruction**.
  Six keys split — the instruction first, in Simplified Technical English, the
  reasoning collapsed underneath. Nothing deleted, both languages, and the
  rationale keeps its voice.

Setup per provider: **[`guides/extra-models.md`](guides/extra-models.md)**.

---

### v0.52.0 — the connection that could not be used, and the routing nobody could see _(2026-08-23)_

**Eleven defects, one release.** Five came out of a real `/orc-fast` run against
a verified, routed local tool — a run that fell back to Claude twice over, for
two unrelated reasons, neither of which was the model. Six more came out of
reading the panel afterwards, and they are one theme with several faces:
**Extra was invisible to every surface that is not the Extra panel.**

**The two that killed that run.**

- **`opencode` dispatch was dead on arrival.** `-f` is a yargs **array** flag,
  and a yargs array is **greedy**: every non-flag token after it is swallowed as
  another file path. ORC pushed the message last, so `message..` arrived empty
  and opencode exited 1 in its own parser — `dur=0m01s`, `tok=none`,
  `outcome=failed`, looking exactly like a model problem. Engine `cli` on that
  tool was 100% dead for a release. The message comes first now, `-f` comes
  last where it has nothing left to eat, and the test fixture asserts **that a
  message arrived** rather than that a flag was present.
- **A tool that signs itself in was being forced into the vault.** `--tool-auth`
  has existed in the CLI since v0.51.0 and the panel offered two radios, so a
  connection that needed **no key from ORC at all** got a vault, and the vault
  then locked the run. There is a third credential source in the form now,
  offered only where it can be true, and pre-selected when the card you pressed
  Connect on says the tool is already signed in.

**The passphrase finally has a lifecycle, and a deadline.** A vaulted key needed
`ORC_EXTRA_KEY` in the environment or nothing, so a green, verified, routed
connection answered `locked` at wave 1 and the run announced a Claude fallback.

- `orc extra session <name> --save --ttl <days>` saves it, **on stdin** —
  `--passphrase <value>` is refused by name, like every other secret here. The
  deadlines are a closed set (1 · 3 · 7 · 14 · 30 · 90 · 180 · 360): no `0`, no
  "forever", and **no auto-extend on use** — a deadline that renews itself is
  not a deadline.
- The cache lives **in the project**, gitignored beside the vault, and is
  encrypted under the pepper that lives in your home directory. **A copy of the
  project folder opens nothing.** That is the one genuine property this file
  has, and it is said out loud wherever the countdown appears — along with the
  honest half: while it is saved, anything running as you on this computer can
  open the connection.
- **`orc extra preflight` is a P0 gate before wave 1.** Active is fine; expiring
  is fine and names the date; **expired or missing STOPS the run**. It never
  falls back — `extra_on_failure` is about an endpoint that failed, and a
  deadline you set 30 days ago deserves a stop, not a substitution. The
  credential is deleted and the connection stamped expired; **the routing rows
  survive**, because the bands are work you did.
- The save modal at connect time **has no exit but Save**, and one destructive
  escape that is named rather than a Cancel.

**Extra is visible outside its own panel now.**

- **`orc extra lanes`** answers the question a band cannot: *which lane does this
  govern?* `/orc` scores every task; `/orc-fast` pins one executor and resolves
  its band **at both edges**, requiring them to agree. That rule was implemented
  and written down and rendered nowhere. The lane table is code now, mirrored
  against the markdown in both directions by a golden test.
- **The Flow score table sees Extra.** With `extra: on` it renders the composite
  instead of the Claude ladder — a band that cannot route **keeps its row** and
  names its fall-through, and `extra: off` renders byte-identically to before.
- **`fixed_executor` can name a foreign target** (`extra:<profile>/<provider>/<model>`),
  offered only for verified connections. The session-tier rule is skipped for it
  — it is not a Claude model — and **the compiled flow says so**, because a rule
  silently disabled is worse than no rule.
- **`/orc-doc` has its own switch.** `orc doc extra <slug> --set
  off|writer|checker|both`, stored per document, default off. A global setting
  turning Extra on for a throwaway runbook also turned it on for the PRD you
  ship, and a document's voice is the deliverable. `orc doc next` names the
  sections going off Claude **before** the wave.

**Three panel defects, and one of them was in every modal.**

- A **connected** tool no longer offers Connect. `connected` and `verified` are
  computed by the CLI, never joined in the panel, and the verified card **has no
  Connect button at all** rather than a disabled one.
- **Scrolling inside a modal scrolled the page behind it** — every modal in the
  app, not just Extra's. Fixed with scroll containment and a body lock.
- **Two tool cards no longer sit at different heights.** A card declares its rows
  now, so the button in one lines up with the button in the other.

**Wording.** The Extra panel's instruction text — labels, hints, errors, gates,
countdowns, the passphrase modal end to end — is Simplified Technical English,
with a one-page term list at `bin/webui/i18n/TERMS.md` and a test for the cheap
half. Rationale prose keeps its voice and only gets shorter: flattening *"it
stops someone at your keyboard, not someone who copied the file"* makes it true
and useless. One rule is not negotiable and now has a test: **never simplify a
CLI-computed value** — a simplified state word is a state that does not exist.

New: `orc extra session`, `orc extra preflight`, `orc extra lanes`, `orc doc
extra`, `orc extra dispatch --passphrase-stdin`, and one config key
(`extra_passphrase_ttl_days`, default 30). `orc extra keyhelp` now carries the
per-OS command for setting an environment variable — with a placeholder, never a
key, and ORC still refuses to run `setx` or write to your shell profile itself.

---

### v0.51.0 — the tools you already have, and a connection that proves itself _(2026-08-22)_

**`orc extra` connections.** Two of the things ORC can hand work to are not
websites — they are **programs on your own machine**, and the last release could
only reach them by hand-typing a binary name into a `custom` profile. They are
first-class providers now, with a connect box each, a model dropdown built from
what **your** account can actually reach, and a connection test that proves
something answered rather than proving a file exists.

- **A program can simply not be installed, and the panel says that FIRST.** Four
  states, computed fresh every time and never remembered: `absent`,
  `outdated`, `unauthenticated`, `ready`. An absent tool gets no Connect
  button, no Test button and no model list — every one of those is a button that
  cannot succeed. `orc extra add` refuses too, and names the install command
  instead of leaving you a profile that will never work.
- **ORC opens your own terminal and runs the install there.** Not a hidden
  background job — inside one, an administrator prompt, a permissions error, an
  80 MB download and a forty-second wait all look identical: *nothing happened*.
  The exact command is on screen before the button, the window is yours to read
  and Ctrl-C, **ORC never asks for administrator rights**, and if no terminal can
  be opened you get the command to paste rather than a dead button.
- **One tool has an install-free route and one does not**, and `null` means
  *there is none* rather than *ORC did not look*. The two never render the same.
- **The connection test is a ladder now, and every rung reads as itself.** Is the
  program there · is it new enough · does it have a sign-in · which models can
  this account reach · and — only when you ask — **does a real message actually
  come back**, with the round trip, the reply, and the four token counts kept
  separate. Free rungs always run; the paid one is its own button, and what it
  costs is quoted before you press it.
- **A model that is LISTED is not a model that WORKS.** A live list is what the
  provider offers; an id in it can be dead upstream. `orc extra models <name>
  --test <id>` is the only thing that tells those two apart, and the caveat rides
  beside every dropdown.
- **Neither local tool says which model answered**, so a quiet substitution is
  invisible on that engine. ORC prints that sentence rather than an empty field —
  and one of the two reports three token kinds, not four, so the missing one
  reads as an em dash and never as a zero.
- **A models list anyone can read is not proof of your key.** A provider that
  serves its catalogue without a credential would otherwise mark a connection
  verified with a typo'd key. That answer is now recorded for what it was and the
  test carries on to something that actually needs the key.
- **`extra_enabled` cannot be switched on before anything has answered.** It
  would have armed nothing — every task would fall straight back to Claude, so
  the switch read ON and meant OFF. The refusal names what to do next, and the
  Extra panel shows only the connect surfaces until then: no routing table, no
  limits, no cost report.
- **A fix, not a feature:** every dispatch to one of the two local tools was
  failing, and failing in a way that looked like a bad model id. One of them
  renamed a permission flag and refuses unknown ones outright. ORC picks the flag
  from the version it probed, and a tool that answers with its own help text is
  now reported as a flag problem by name.
- **ORC never writes another tool's credential store.** Your key stays in ORC's
  vault or in your own environment variable and is handed to the program for each
  run — so nothing global changes, revoking it in ORC actually revokes it, and if
  you already signed that tool in yourself, ORC leaves it alone.

---

### v0.50.0 — work that runs somewhere else _(2026-08-22)_

**`orc extra`** — a band of ORC's score ladder can now be answered by a
**non-Claude worker**: DeepSeek, Z.ai (GLM), Moonshot (Kimi), MiniMax, Qwen,
Xiaomi MiMo, StepFun, SiliconFlow, OpenRouter, a local Ollama, any
OpenAI-/Anthropic-compatible endpoint you name, or an agentic CLI you already
have (`opencode`, `codex`). ORC's own session never moves — this routes
**workers**, not the conductor.

- **Off by default, and a connection that has never answered can never be used.**
  `orc extra ping` is the gate, it climbs the cheapest rung first (a free model
  list; only then a one-token completion), and it records WHICH rung answered —
  "verified by a models list" and "verified by a real completion" are different
  guarantees and one green tick for both would be a lie.
- **Every armed run says so BEFORE the work starts.** An `extra:` line joins the
  Phase-1 preflight naming how many tasks will cross the boundary and where they
  go. It has no quiet version. The failure this whole subsystem is shaped around
  is not a wrong answer — it is work leaving your machine without anybody saying
  so.
- **A gap in the routing table is not a hole — it is Claude**, and it is printed
  with the exact agent it resolves to, so "I left the top band on Opus on
  purpose" and "there is no top band" can never look the same. Overlapping rows
  are refused by name.
- **Risky work stays.** A task whose plan cites `risk[]` (money, auth, security,
  migration, concurrency, data-integrity) never leaves Claude, and neither does
  anything in an area a boundary card marks REFUSE — in `warn` mode as well as
  `block`.
- **Three engines, and only one composes the request body.** `api` is therefore
  the only one that can enforce the declared-files fence or carry a privacy
  policy, so a return claiming the fence held on the other two is rendered as a
  WARNING: a constraint that was never applied is never reported as kept.
- **Your key never reaches a command line.** `--key <value>` is refused by name.
  Use an environment variable (recommended) or the encrypted vault —
  AES-256-GCM under a passphrase ORC does not store and cannot recover, stored
  only after a green test, with a countdown that prints every time and a
  self-destruct at ten wrong attempts that keeps the profile. New in this
  release: `orc extra ping --passphrase-stdin` re-tests a key that is already
  stored.
- **No shipped model ids and no shipped prices.** Both go stale within a quarter
  and both get believed. `orc extra ping` reads the live model list from the
  provider; `orc extra rates` prints the JSON to paste for a price. Until a pair
  has a rate, `usd` reads as an em dash — a cost ORC did not price itself is
  never printed.
- **`orc extra stats`** joins ORC's own traces per profile per band and reports
  four token kinds separately, plus the three things only it can see: a
  SUBSTITUTION (you did not get the model you asked for), a REROUTE (you got the
  model and a different company served it) and a FALLBACK (it did not work and
  Claude finished the job).
- **A failed foreign dispatch is never a dead run.** It falls back to the Claude
  band that task would have had, announced. `extra_on_failure: stop` is there for
  people who would rather stop than quietly start paying full rates.
- **New panel: `orc ui` ▸ Extra.** The boundary paragraph renders always, never
  behind a click. One 0→100 rail, green where your connection runs the work and
  blue where Claude does, with every unrouted range keeping its slot. Staging a
  change previews it before anything is written. The panel names no provider, no
  model and no agent — it draws what the CLI computed.
- **The `orc ui` boundary is NARROWED, not broken.** The panel still never runs a
  lane and never does agentic model work; the one model-shaped thing it can
  trigger is a connectivity probe, and even that runs through the CLI in a
  subprocess like every other action. A probe is a diagnostic, the family
  `orc doctor` is in.
- **Nine config keys**, one canonical contract
  (`_shared/extra-dispatch.md`), a new `EXTRA` trace verb, `orc extra doctor`
  with eleven findings, and a stance stated in exactly one place for every other
  lane — including `/orc-challenge`, which never routes foreign, because swapping
  a lens for a different model does not make the lane cheaper, it changes what is
  being measured.
- **Also:** the test suite pins `--test-concurrency=8`. At one worker per core,
  the files that spawn real child processes and the one that derives scrypt at
  N=2^17 starved each other and produced failures that looked exactly like
  regressions. Determinism is worth 11% of the wall clock.

Setup detail per provider: **[`guides/extra-models.md`](guides/extra-models.md)**.
A full walkthrough: `orc mock-run orc-extra`.

---

### v0.49.5 — house rules are text, and the hand-back writes itself _(2026-08-21)_

Two fixes to `/orc-doc`, both the same shape: stop making a person work around
the tool.

- **House rules are a PLAIN TEXT config now, not a form.** The first cut modelled
  a rule as a row — one line, one id, a P0/P1/P2 dropdown, an enable flag, added
  one at a time. Nobody's real P0 fits on one line, and filing it as four
  separate rows to keep the CLI's argv simple was the tool asking the user to
  work around it. The ledger is now `.claude/orc/doc-house-rules.md`: three
  headings, and **as much text under each one as you want**, handed to every
  writer verbatim. Open it in your editor, or edit it in **one box** in
  `orc ui` ▸ **Docs** — no dropdown, no Add button, no per-rule row.
- **New: `orc doc rules set|add|clear --priority P0 --text "…"`** (multi-line is
  the point), plus `set-all` for the whole file and `--set-file` for a bulk
  replace. `remove`, `enable`, `disable` and `move` are **refused by name** — a
  command that used to work and now does nothing is worse than one that says
  what replaced it.
- **Migration is lazy, free and non-destructive.** The old `doc-house-rules.json`
  is read once, converted, and **left exactly where it was**. A rule you had
  DISABLED is never resurrected — it is left behind and counted in the output.
- **`RESUME.md` is written by the CLI, on every state change.** It used to be
  prose the orchestrator was told to write at every stop, which is the bet this
  repo has already lost twice: the hand-back you are TOLD to write is the one
  that goes missing on the run a usage limit killed. `doc.json` has exactly one
  writer, so the hand-back hangs off that — it exists from `orc doc init` onward
  and is never behind the disk. `orc doc resume-file <slug>` writes it on demand.
- **Every question `/orc-doc` asks you now ends by pointing at it** (hard rule
  16): the file path, and the one line to paste into a brand-new session. The
  page itself is written for someone who does not read code — what the document
  is, where the files are, what is not written yet, and what happens next.

---

### v0.49.4 — the panel was being handed half an answer _(2026-08-20)_

One bug, and it could hit any `--json` read big enough.

- **Fixed: a large `--json` payload was truncated whenever something read it
  through a pipe.** `emitJson` wrote to stdout and then called `process.exit()`.
  On macOS and Linux a pipe write is asynchronous, so the exit threw away
  whatever had not flushed — and `orc ui` reads every panel through a pipe. On a
  1,100-file repo `orc wiki coverage --json` computed a perfect 30 KB object, the
  server received the first 9 KB, `JSON.parse` failed, and **Knowledge ▸
  Coverage** reported that the repo had neither a registered wiki nor a git
  repository — on a wiki that was FRESH and 39% covered. `orc wiki docs` was hit
  the same way; `wiki status` escaped only because it prints and returns instead
  of exiting. Windows pipes are synchronous, which is why it never showed up in
  development. Every `--json` read now writes through fd 1 synchronously.
- **The Knowledge panel no longer reports a broken read as an empty repo.** A
  failed request renders the CLI's own reason and output, the way every other
  panel has since v0.49.2 — the generic "it needs a registered wiki and a git
  repository" line is for a repo that actually has neither.
- **Also: git output is no longer capped at Node's 1 MB default** (v0.49.3),
  which would have truncated `git ls-files` on a repo of roughly 25,000 files.

---

### v0.49.3 — coverage on a large repo _(2026-08-19)_

One fix, and the bigger the repo the more it mattered.

- **Fixed: `orc wiki coverage` reported "not a git repository" on a large,
  freshly refreshed wiki.** Every git call ORC makes ran through `spawnSync` on
  Node's **1 MB** default output buffer. `git ls-files` in a big repo prints more
  than that, the child is killed with `ENOBUFS`, and the exit status comes back
  `null` — which the code read as *there is no git here*. So `orc ui` ▸
  **Knowledge** ▸ **Coverage** showed no numbers at all on the repos where the
  number matters most, and `orc wiki impact` was one wide diff away from the same
  failure. The buffer is now **256 MB**, and a spawn error is read as an error
  instead of being inferred from the status code.

---

### v0.49.2 — house rules, a run map before you pay, and three defects _(2026-08-18)_

Quality of life on `/orc-doc`, plus three bugs — one of which was breaking a
panel outright. **Zero new agents, zero new skills.** Everything here obeys the
standing rule: **the CLI computes, the panel and the skill render.**

#### `/orc-doc` — house rules

A **house rule** is your project's own standing instruction about **what a
document says and how it reads**: *"open with a one-paragraph summary a PM can
read on a phone"*, *"money always carries its currency"*, *"use the customer's
words, not the internal table name"*. Before this, the shipped rules were the
only rules.

- Three priorities. **P0** must, and it beats every ORC style preference; **P1**
  should, and breaking it is recorded as a gap; **P2** prefer.
- Stored **verbatim** in `.claude/orc/doc-house-rules.json` — one writer,
  `orc doc rules`, outside `templates/` so `orc update` never touches it. A rule
  is one line; a multi-line one is refused by name with the hint to add two.
- **Each document freezes the set it started with.** If a P0 changes at wave 3,
  half the document silently no longer complies and nothing on disk says so — so
  `orc doc rules <slug>` reports frozen-vs-project and **names every rule that
  was added, changed or removed**, never a "rules changed" boolean.
  `--sync` re-freezes deliberately and **lists the sections that predate the
  change**. It re-writes nothing: that would be ORC spending your money applying
  a rule change retroactively without being asked.
- **Read FIRST in every dispatched slice**, above ORC's own rules — that order is
  the contract.
- **The boundary is declared, not detected.** House rules govern content and
  style; they can never change how the lane RUNS. The CLI cannot parse intent, so
  it does not pretend to: it prints the boundary everywhere it matters, and a
  rule that asks for a structural break comes back as `unsupported_request`.
- New: `orc doc rules [add|remove|enable|disable|move|--sync|--set-file|--reset]`,
  a **House rules** card at the top of `orc ui ▸ Docs` (staged and batched, like
  every other write in the panel), and a `house-rules-drifted` audit finding.

#### `/orc-doc` — four rules ORC applies to every document, all free

All four are deterministic lint rules, which is what makes them worth having:
**no model is ever paid to notice a `TODO`.** Every one is narrow on purpose — a
broad rule that argues with the author gets switched off.

- **No questions or confirmations in the body.** The deliverable answers; it does
  not ask. `TBD`, `TODO`, `TBA`, *"to be confirmed"*, and a line that is only a
  question put to you as an approver. **Two exemptions:** fenced code, and a
  section your own outline calls *open questions / risks / assumptions*.
- **Missing information is `N/A` plus one short line, never filler.** A warning,
  never an error — you may have a reason.
- **A section well over its planned length is a finding** (1.5× its budget), plus
  per-section line and word counts in `orc doc lint --json`. Signals, not gates.
- **No local-only references.** No `src/foo.ts:42`, no absolute path, no
  `./relative`, no `localhost`, no `file://`, no link to a local `.md` — the
  person reading a PRD has no repository. Fenced code is always exempt, because a
  code example that *shows* a path is content. New config `doc_local_refs`
  (`off|warn|error`, default `error`): a genuinely internal runbook legitimately
  names local paths, and a lint rule with no switch gets fought instead of used.

#### `/orc-doc` — a supplied template is a cage, not a suggestion

`--template` set the outline and then nothing stopped a writer adding a heading
it never had. It now locks by default: the slice carries the allowed headings,
`orc doc lint` errors on a stray one, **`orc doc parts --confirm` refuses the
part that grew one and writes nothing**, and `orc doc audit` reports both
`template-drift` and `template-moved` (your template file itself changed —
reported, never auto-synced). `--template-soft` opts out; a shipped base template
stays a floor.

#### `/orc-doc` — what it will cost, and what it did cost

- **`orc doc forecast <slug>` — the run map, once, before the first paid wave.**
  How many sections, how many waves, how many agents per wave, **how many times
  it will stop**, and a token range with its sample count. Computed from the same
  batcher the dispatch uses, so it can never describe a run that will not happen.
  Every honesty rule of `/orc-budget` is inherited: four token kinds never
  blended, no dollars without a dated price table, no quota without a known plan
  — and **with no history it refuses rather than invent**, offering the
  `--naive` price-table floor instead. `orc doc next` names it exactly once; a
  changed outline or write mode invalidates it.
- **`orc doc cost <slug>` — joined across every session the document spanned.**
  `orc budget actual` works per run, and a document is not a run. Per role and
  per section, from ORC's traces joined to your local usage transcripts. A slice
  that covered two sections splits evenly, said out loud; **a section nothing can
  be joined to reads `—`, never `0`.** `unattributed` is always printed.
- Both render in `orc ui ▸ Docs` with a stacked four-kind token bar, so
  cache-read stays visibly separate from the rest.

#### `/orc-doc` — an edit round tells you where to look

`orc doc lint <slug> --section <id>` lints one **section file** and returns
**part-local** line numbers, and every finding on an edit-round slice carries its
file and line. The skill prints one line per finding
(`sections/03-scope.md · line 42 · long-sentence`) and, after the round, each
file it touched. The compiled `document.md` line number is deliberately never
carried: it is stale the moment anything is written.

#### Fixed — the Overview card printed over itself

`.run-card` is a four-column grid (caret · chip · mid · age) and the Overview
built a card with **three children and no caret**, so the chip landed in the 16px
caret column and printed straight over an 88px slug, which wrapped one word per
line. A grid never complains. Every variant now declares its own column count —
`.no-caret` for a row that navigates, `.has-extra` for an optional second chip —
and the same collision in the Docs list (from its "you edited it" chip) is fixed
the same way. The age column now carries the age `run list --json` always knew.

#### Fixed — a run could never be marked done

`RESUME.md` existing IS the "unfinished" flag, and ORC deletes it at `FINISH`. So
a run you abandoned was waiting **forever**: `orc resume` kept offering it, the
Overview kept counting it, and the upgrade preview kept refusing with "N run(s)
are still waiting" — with no way out short of deleting a file by hand.

`orc run close <slug> --reason "<why>"` **moves** `RESUME.md` to
`RESUME.closed.md` and records why. **It deletes nothing**, and `orc run reopen`
puts it back byte for byte. The new state is **`closed`**, deliberately not
`done`: the disk cannot prove a run finished, only that you said you were
finished with it. A reason is required — a state change nobody wrote a reason for
is a state nobody can audit. Everything else follows from one boolean: `resume`
skips it, `run list` keeps the row *and* its reason, and the upgrade unblocks.
Buttons for both in `orc ui ▸ Runs`, and inline on the Overview card that was
complaining.

#### Fixed — one corrupt challenge ledger 500'd the whole panel

Two crash classes: a ledger truncated by a killed session, and a ledger with no
`goals` key. Both threw a Node stack with nothing parseable on stdout, so
`orc ui ▸ Challenge` showed a bare 500 — and **every healthy cycle disappeared
with the broken one**, which is the opposite of what a listing is for.

- A broken cycle is now a **row** that reads `UNREADABLE` and carries the parse
  error. It is a list-level state: it never reaches the pass gate and never
  claims a verdict.
- **No `--json` read can emit a stack trace any more.** A throw comes back as
  `{ok: false, reason: "crashed", command, error, hint}` with its own exit code —
  every `--json` route inherits it.
- A 500 from the panel's API now carries the CLI's own reason, and the panel
  renders it. A 500 with no message is what you actually saw.

### v0.49.1 — the challenge council, and a `--json` that stops throwing things away _(2026-08-18)_

One release, two workstreams, and **zero new skills**. They ship together because
they are the same defect seen twice: **ORC computes far more than it shows.**
`computeWikiFreshness` builds a per-doc table that `--json` threw away;
`challenge record` computes per-dimension, per-severity, per-iteration detail
that the panel rendered as one chip. Both halves are "stop discarding what you
already computed" — and only one of them also adds new thinking.

---

## Part A — the challenge council

### Five more ways of looking, and none of them is ORC's to choose

`/orc-challenge` had one grounded opinion (the judge) and one blind one (the cold
reader), and both read the artifact the same way: *does this document do what a
document is supposed to do?* Five ways of looking were missing, and each one is
missed for a different reason:

| Role | It asks | It fails when |
|---|---|---|
| **The Contrarian** | where is the fatal flaw? | it assumes the artifact is fine and stops looking |
| **The First Principles Thinker** | are we even solving the right problem? | it accepts the framing it was handed |
| **The Expansionist** | what is being undervalued here? | it only counts what is wrong |
| **The Outsider** | what does this assume I already know? | it is an expert and cannot un-know things |
| **The Executor** | what do you actually do on Monday morning? | it grades the theory and never the first step |

> **A lens raises; only the judge resolves. ORC proposes the council; the user
> picks it.**

**`a lane that picks its own council` has broken this contract** — registered as
the fourth member of the family with `a lane that answers its own interview
question`, `a lane that picks its own favourite` and `a lane that fixes what it
judged`. A council chosen by ORC is ORC deciding **which kinds of criticism the
user is allowed to hear**, which is a bigger decision than any single finding in
the run. So `orc challenge init --council` has **no default** and refuses by
name, exactly like `--goal` since v0.47.0:

```
❌ --council is required and has no default. ORC SUGGESTS a roster (from the kind
   and the goal); the user PICKS it. […] Suggested for --kind tsd:
   reader,contrarian,executor.
   (a lane that picks its own council has broken this contract)
```

`none` is a first-class answer and reproduces the v0.47.0 review exactly. The
cost is stated in **dispatches**, never in dollars — `/orc-budget`'s rule: no
dollar figure without a dated price table.

### Two of them cannot produce a finding without lying

This is the most important decision in the release.

**The expansionist.** A finding must carry `serves` — the goal element it
advances — and `record` DROPS one without it. Its entire brief is *"what upside
is everyone missing?"*, which by construction is **not** in the stated goal.
Given a `serves` field it would either invent a goal element or be silently
dropped. So it returns an **opportunity**: no severity, never in `findings[]`,
never near the pass gate, always with a `first_step` and a route
(`brainstorm | pact | grill | none`). It is conserved — `--take` or `--drop`,
both requiring a reason — and **this lane never builds one**.

**The first-principles thinker.** Its most valuable output is *"you are asking
the wrong question entirely"*, and in this lane the question is the **frozen
goal**. A finding is measured against the goal; a premise challenge disputes the
**yardstick**. Those cannot be the same object. It returns a **premise**, and
exactly two resolutions exist, both a human's: adopt it (`orc challenge goals
--set`, a `regoal` that bumps `goals.version`) or dismiss it with a mandatory
reason that stays in the report forever. **The judge never sees that report** —
handing a judge a document arguing the frozen goal is wrong would bend every
finding it produced afterwards.

> The three finding lenses feed **the judge**. The two non-finding lenses feed
> **the user**. That sentence is the whole architecture.

### The gate that makes five extra reviewers safe

The obvious failure of adding five reviewers is that the judge quietly ignores
four of them and the run looks identical while costing five times more.

> **Every id the council raised must appear in the judge's return with exactly
> ONE disposition and a reason. `council_coverage_pct` must be 100.**

That is conservation applied to **input** instead of to carry-forward, and the
CLI enforces it without reading a word of prose: the orchestrator writes a
machine JSON beside every council report, and **`orc challenge record` reads that
directory itself**. The judge cannot shrink the set by omission, because the set
was never the judge's to report.

```
❌ malformed verdict — council coverage is below 100% — every id the council
   raised needs exactly ONE disposition (adopted | merged | rejected |
   out-of-goal). Missing: O-003
```

**An adopted finding keeps the raiser's id.** `C-004` stays `C-004` in the
verdict, in the report, in iteration 9 — which is what lets the panel say *"the
contrarian raised four of the six blockers this iteration"*, and how a user finds
out within two rounds whether a lens is worth its money.

**PASS is computed exactly as before.** An adopted council finding is an ordinary
finding from that moment on; `challengeBlocking()`, `challengeOpen()`,
`challengeCounts()` and `challengeStateOf()` are untouched. The pass gate learns
nothing about the council.

### A selected role is never silently absent

Rule 6 (`NOT-CHECKED` is never silent), extended from dimensions to roles. A
roster lens returns either a report or an explicit `{ "lens": …, "ran": false,
"reason": … }`, and silence is rejected by name:

```
❌ malformed verdict — executor is on the roster but returned neither a report
   nor an explicit { "lens": "executor", "ran": false, "reason": "…" }.
   A selected role is never silently absent.
```

The trace carries it too, so `orc stats` and `/orc-retro` see a NOT-RUN lens and
not only the panel:

```
CHALLENGE iter=2 findings=P0:1/P1:3/P2:6 coverage=100% council=4/5 raised=C:6,O:3,E:2 adopted=9 verdict=FAIL
```

### Effort is a measurement, not a cost choice

`outsider` is `low` for the same reason the cold reader is: a harder-thinking
outsider reasons its way *around* an unexplained acronym and reports the document
is fine, which is exactly the gap the instrument exists to find. **Nothing may
ever upgrade it.** `contrarian` is `high` because at low effort it returns the
three surface complaints the free lint already caught for nothing.

That is why there is **no model or effort config key**: a key that lets
`outsider: low` be tuned is a key that lets the instrument be broken.

All seven lenses are `claude-opus-5`, so **`opus5_only` is a no-op for this lane —
it is unaffected, not exempt** — and the agent count moves 46 → 51 with no paired
variants.

### The reader / outsider seam

These two are the closest pair in ORC and the one place this release could have
shipped a duplicate instrument. The distinction is structural:

| | `reader` | `outsider` |
|---|---|---|
| Told the audience | **yes** | **no** |
| What it generates | 8–15 questions the artifact *promised* to answer | nothing — it reacts to what is on the page |
| What it returns | a **scored** questionnaire (`8/12`) | an **unscored** ranked list of assumed knowledge |
| The measurement | *can this be answered from the page?* | *what does this page assume you already know?* |

They are dispatched with no knowledge of each other. Where they agree, that is
recorded as `corroborated_by` — the strongest comprehension evidence the lane can
produce, and **never an automatic severity bump**.

### The roster is frozen, and `council: null` is a real state

Ledger `version: 2`, additive: every v1 key keeps its name, meaning and position.
The roster is a per-cycle **frozen** decision changed only by a recorded
`recouncil` event, which bumps `council_version` exactly like `goals.version` —
and the iteration rail draws a **third** version break for it, because comparing
an iteration judged by three lenses to one judged by six is not a comparison.

**There is no `challenge_council` config key.** A global default roster would
silently answer the one question this release exists to ask. A cycle opened
before v0.49.1 reads back with `council: null` and `record` refuses the next
iteration by name until it is answered — `orc challenge council <slug>` exits 1
for that state, because **UNSET is an answer, not an error**.

### New commands

| Command | Does |
|---|---|
| `orc challenge roles [--kind k] [--json]` | the lens catalogue. Static — it works with no cycle at all |
| `orc challenge council <slug> [--json]` | the frozen roster + per-iteration participation (0 set · 1 unset · 3 unknown) |
| `orc challenge council <slug> --set <csv\|all\|none> --reason "…"` | a recorded `recouncil` |
| `orc challenge note <slug> --from <json>` | opportunities and premises ONLY — it refuses a `findings[]` key by name |
| `orc challenge premise <slug> <id> --dismiss --reason "…"` | |
| `orc challenge opportunity <slug> <id> --take\|--drop --reason "…"` | |

### The panel

It **derives nothing**: it does not name a lens, does not know which class
blocks, does not compute a disposition and does not decide the suggestion. A test
greps the panel for every lens display name, every disposition word and every
agent name and fails if it finds one.

New: a **Council card** directly under the goal (a NOT-RUN row keeps its slot
with its reason; a NOT-SELECTED row is muted with the line that would add it; the
council executor's `monday_morning` list sits here, because it is the most
legible thing this lane produces for a non-engineer); a **premise card** that is
the loudest thing on the panel when one is open and sits *above* the findings; an
**opportunities card** with no severity colour anywhere in it; a lens chip and an
`also found by` chip on every finding; and a per-lens legend under the
convergence chart.

There is deliberately **no route for `council --set`** — changing the roster is a
decision with a recorded reason the *lane* takes in conversation.

### Deliberately absent

- **An anonymised peer-review round.** It doubles the dispatch count, and the
  judge's adoption pass already reconciles the lenses. The payoff — *"two
  advisors independently hit the same thing"* — is `corroborated_by[]` at zero
  extra cost.
- **A chairman agent.** ORC already has one: the advisor groups findings by root
  cause and orders the fix. Rule 5 still holds — no advisor on PASS.
- **A `challenge_council` key, any model or effort key, a `block` mode on a
  council output, a loop cap, and auto-severity from corroboration.**

---

## Part B — the knowledge deepening

### `--json is not a summary`

> A read's `--json` is the WHOLE computed object, not a summary. **A field the
> human path prints and the JSON omits is drift — and it is drift no lint can
> see, because both halves live in one function.**

`wikiStatus()` computes `computeWikiFreshness(...)` and the terminal branch
printed the per-doc FRESH/AGING/STALE counts, **the worst doc's filename** (the
thing actually pinning the tier), the top five stale docs with their own
distances, and the crosslink boundary state. The `--json` branch emitted five
scalars and `blind` **as a count**. The panel therefore *could not* be as
detailed as the terminal, no matter how it was written.

`wiki status --json` now carries `counts`, `worst`, `per_doc[]`, `blind_spot` as
the **file list it always was**, `orientation`, `crosslink`, and `free_repairs`
reused verbatim from `wiki plan` — a user must never be able to pay for what a
free step fixes. **Every legacy key keeps its name, position and meaning** (`orc
doctor`, the overview tile and `_shared/detecting-artifacts.md` all read them)
and the exit code stays 0 in every state.

### You can finally see what the wiki contains

`orc wiki` had six subcommands and **not one of them listed the docs**. A user
could learn the wiki was STALE with 14 docs and 47 commits of drift, and could
not learn what any of those 14 docs was about.

| Command | Returns | Exit |
|---|---|---|
| `orc wiki docs [--json]` | the doc table: tier, its OWN distance, covers, usage, tags, retire hint | 0 · 1 none · 3 unregistered |
| `orc wiki show <doc> [--body]` | one doc + its tags + the free repairs that apply to IT | 0 · 2 unreadable · 3 unknown |
| `orc wiki coverage [--json]` | % of tracked files covered by ≥1 doc, uncovered set by DIRECTORY | 0 full · 1 gaps |
| `orc pattern show <lang> [--body]` | headings, conventions vs invariants, flagged conflicts | 0 · 1 absent · 2 unknown key |
| `orc gotcha show <id>` | one entry, EVERY field | 0 · 3 unknown |
| `orc gotcha list --archived` | the archive | 0 · 1 none |
| `orc gotcha prune --dry-run` | exactly what eviction would archive, and why | 0 none · 1 would prune |

**`orc wiki coverage` is a REPORT and never a gate.** No threshold, no config
key, nothing branches on it — a repo that deliberately documents four subsystems
out of forty is not broken, and a coverage percentage that starts nagging becomes
a number people game. The uncovered set is collapsed to directories and ranked by
file count, because *"240 uncovered files, all in `vendor/`"* and *"12 uncovered
files, all in `src/payments/`"* are opposite situations.

**`--body` is opt-in** on both `wiki show` and `pattern show`: prose is returned
only on an explicit request, exactly one artifact at a time, rendered as DOM and
never as HTML.

**`orc pattern show` invents nothing.** The codifier may not write a parseable
header today; with none it returns `headered: false` plus the headings it could
parse, and says so in one line. It **never** derives a "codified at" from the
file's mtime — the `/orc-pact` UNCHECKABLE rule.

### Two doctor findings, and the restraint is the design

| id | Warns when | Fix |
|---|---|---|
| `wiki-unregistered` | the wiki is unregistered, drifted or corrupt | `orc wiki sync` — free, instant, and until it is done nothing can read the wiki at all |
| `wiki-debt` | tier is **STALE** and `wiki plan` has pending rows | `/orc-wiki refresh --top 2` |

**`wiki-debt` fires on STALE and never on AGING.** Aging is a normal state every
living repo passes through, and a doctor that warns about it is a doctor people
learn to ignore. Deliberately not added: `pattern-missing` — a project with no
cached pattern is not misconfigured, and warning about it would be ORC nagging
for a paid scan.

Both route to the Knowledge panel: *a caution routes to the panel that can CLEAR
it*, and `orc wiki sync` is a button there.

### `orc ui ▸ Knowledge` — five tabs

```
Knowledge   [ Wiki ] [ Coverage ] [ Code patterns ] [ Memory ] [ Peers ]
```

A header strip renders above them all — tier · docs · covered % · blind ·
pending · patterns · repair notes — and **a value the CLI could not compute
renders as an em dash, never as a guess.**

- **Wiki** — the tier card with the **worst doc named** (a hash is not something
  anybody can go and refresh), the per-doc counts as a stacked bar, free repairs
  above everything priced, and **the doc table**. A row expands in place, one at
  a time, detail fetched on first open.
- **Coverage** — one honestly-qualified number, the uncovered set by directory,
  the structural blind spot as the file list it always was, and one line that is
  not optional chrome: coverage is a report, not a target.
- **Code patterns** — per language, with **the conflicts the codifier flagged in
  their own block**: they are the most decision-shaped thing in the file and were
  invisible outside it. Reveal shows the text that is injected literally into
  every executor slice; a user who cannot read it cannot trust it.
- **Memory** — every field the CLI already emitted, headroom against
  `gotchas_max`, and a **preview-then-apply prune that names every entry** (a
  count is not consent). The archive is reachable and labelled recoverable.
- **Peers** — compact, read-only, every word the CLI's. It links to Crosslink and
  never duplicates its editor: one boundary, one picture.

### Guards

Five new agent files named explicitly in `verify-package.js` (floor 46 → 51,
skills unchanged at 38); five new contract-lint entries; a golden test comparing
`CHALLENGE_LENS_META` to `council.md`'s roster table; and one test per new read,
because `--json is not a summary` is drift no lint can catch.

`css/panels/knowledge.css` is a new file, so it is `<link>`ed in `app.html` **and**
named in `verify-package.js` — the manifest is the load order, and a file the
manifest forgot is a file the test suite never sees.

---

### v0.49.0 — the document is a folder, and the file is a build artifact _(2026-08-17)_

`/orc-doc` only. No other lane changes, and **zero new agents**.

Three quarters of what this release is about already existed: `orc doc plan`
already wrote one part file per section, the ids were already number-then-name,
the split already cut on `## ` alone, and `orc doc assemble` was already pure
Node — **zero model tokens, and it always was**. Anyone who tells you this
release made compiling cheaper is selling something.

What was wrong was the direction of the arrow.

#### `sections/` is the source of truth

`.work/` was scratch and `document.md` was the truth, so after the first
assemble every later change was *extract* (copy a section OUT of the monolith) →
edit → *splice* (write it back IN). The section files existed and were dead. A
resumed session, an update and a re-check all routed through the 10,000-line
file.

Now each section lives in `sections/<NN>-<slug>.md` — a real, visible folder you
can open, edit and read in a pull request — and **`document.md` is a build
artifact** that `orc doc compile` rebuilds from those files, for free, when you
ask. `orc doc split` goes the other way and recovers the sections from a
document a human reshaped by hand; **`split` then `compile` reproduces the file
byte for byte**, and there is a test.

The join key is the **filename**. No comment markers inside the files: an HTML
comment is a lint error in this lane and mangles on a Notion or Google Docs
import, and the deliverable's cleanliness is the lane's entire product. A marker
that buys nothing costs the import.

#### You can look before you buy the rest

`orc doc compile --partial` writes exactly the sections that exist and **names
the rest outside the document** — nothing is ever stubbed into the deliverable.
Paired with the new `doc_write_mode` (`ask` · `partial` · `all`, asked once per
run and stored), `orc doc plan --role write` returns **wave 1 only**, with
`more_waves: N`. You read what it wrote, and waves 2..N are bought only if wave 1
was right. That is the single biggest saving in the lane, and it has nothing to
do with the compile.

#### A wave is a stop you can walk away from

The write loop used to live in the orchestrator's head, and `/orc-doc`'s
`RESUME.md` sat in the document folder — where `orc resume` and `orc run list`
never look — carrying a `## Where it stands:` line that the line-anchored parser
**could never match**, and no phase and no wave even if it had.

All four are fixed. `RESUME.md` moves to `{run_dir}/{slug}/`, the line is at
column 0 and gains a `· phase D6 · wave 2 of 7` suffix (the byte-stable prefix is
untouched), and a test feeds the shipped template to the real `parseStands`. The
section files on disk ARE the progress, so `K of N` is **computed** by counting
waves whose sections are all hash-confirmed. A part on disk that no validated
return ever confirmed is `unconfirmed` — exactly what a usage limit leaves — and
it is re-written, never shipped.

#### The deliverable carries content only

`> **Open:**` and `> **Assumption:**` lines are no longer written into your
document, and the section state no longer sniffs the body text for them. This
does not relax "never invent a fact"; it moves where the honesty is written down.
A gap goes to `orc doc log --kind gap` and lands in a derived `gaps.md`, and is
raised with you.

`orc doc lint` gains `annotation-in-body` as an **error**, matching an exact,
narrow set of ORC's own markers and nothing else — a line of yours beginning
"Note:" is content and is never flagged. `compile` **reports** every match and
never silently strips one: we cannot tell whose line it is.

#### A live bug, fixed by construction

A slice covering two sections wrote **one** file, named after the first, while
`assemble` looked one up per outline id. The second section's file never existed:
if it was required, assemble refused forever; if it was optional, it silently
vanished from the deliverable. **One file per section** now, per slice entry, with
a regression test.

#### A section too big for one file

It splits **underneath** — `sections/04-detailed-design/{00-head,01-data-model,…}.md`
— cut on its own `### ` headings, which `docScan` already collected and merely
filtered out. The reader never knows: the compiled document has exactly one `## `
for it, and `orc doc map`, `lint`, `ship` and `audit` are completely unchanged.
Five refuse-and-name rules make the nesting safe, and a changed sub-part is
detected on its own, so a re-check inside a 900-line section reads ~150 lines.

**No new config key** for it: `doc_max_lines_per_agent` is already the threshold.

#### The rest

- **`doc_max_parallel` hard cap is now 2** (default 2, was 4/4). A larger value
  is clamped and the clamp is announced.
- **`orc doc parts`** is the new wave-boundary read, and the one that works
  before a single compile has ever run. `--confirm <ids>` is how a validated
  return becomes a recorded hash.
- **`orc doc ship` refuses on a stale `document.md`**, naming the sections —
  coverage-relative, one step earlier than `shipped-drifted`.
- **`orc doc audit`** gains `part-missing`, `part-orphan`, `part-misnumbered`,
  `part-unconfirmed`, `subpart-bad-level`, `document-stale`,
  `annotation-in-body`, `legacy-work` and `resume-misplaced`.
- **`orc doc outline --set` renames the files on disk** when a renumber moves
  them, in the same step.
- **A checker now reads ONE bounded part file**, so there is no line arithmetic
  anywhere in the check loop.
- The Docs panel gains a **Section files** card with nested sub-part rows, a wave
  strip, a compile button and a migrate button. It derives nothing new: the CLI's
  state words, verbatim.

#### Nothing is lost on the way

`doc.json` goes to `version: 2` and a v1 document migrates the first time you
touch it — lazy, free, idempotent, non-destructive. `document.md` is **never
deleted** (it becomes the build artifact, and starts life fresh rather than
stale), a pending extract wins as the newer edit, an `> **Open:**` stub does not
survive, `RESUME.md` is moved and its prefix stripped, and an **unparseable**
document is REFUSED with `version` left at 1 — a guessed structure is worse than
none. `assemble`, `extract` and `splice` survive as thin aliases for one release,
with their exit codes preserved.

---

### v0.48.1 — one file per thing, and a document that can be finished _(2026-08-16)_

Two halves, deliberately kept separate so that **any** behaviour difference
observed after this release is attributable to the second one and to nothing
else.

#### The panel is an architecture now

`bin/webui/` was four monoliths: a 6 500-line `app.js`, a 2 500-line
stylesheet, a 1 700-line fixture module and two 800-key string tables. Any
change to one panel meant paging through all of it to find three places.

It is now ~60 named files — one per panel, one per CSS layer, one per i18n
namespace, one per fixture set — and the **filename is the load order**, so a
future session never has to reason about dependencies.

- **Classic scripts, not ES modules,** and the constraint that decided it:
  `serve.js` requires the per-launch token on every static request, and **an
  `import` carries no query string**. A module graph would 401 on every import
  unless static auth were weakened, which was not on the table. Classic scripts
  also share one global lexical scope, so the split added no `import`/`export`
  and changed no call site.
- **`serve.js` builds its static map from a one-time walk at boot.** A request
  path is still a KEY LOOKUP in a frozen table, never a path join — directory
  traversal stays structurally impossible. Server-side code (`serve.js`,
  `api.js`, `fixtures/`) is never served.
- **Token stamping is generic.** Naming two files was fine when there were two;
  with ~55 the pattern has to be the rule, or the next `<script>` tag someone
  adds 401s silently. A test parses `app.html` and asserts every reference comes
  back stamped **and** resolves.
- **`06-responsive.css` and `04-motion.css` load last, and that is
  load-bearing.** Several reduced-motion rules are deliberately not
  `!important` — `.vault-pulse` and `.step-flow` are removed with
  `display: none`, because capping an infinite animation to one iteration
  freezes it mid-cycle — so an equal-specificity rule loading afterwards would
  win on order and switch the animation back on.
- **`verify-package.js` names every file AND asserts set equality** with the
  directory, in both directions: the agent-file pattern, applied to the panel.
- The test suite is split to match (`test/cli/`, `test/lanes/`, `test/webui/`),
  using an `appJs()` / `appCss()` helper that concatenates exactly what
  `app.html` loads — so a file the manifest forgot cannot hide behind a passing
  suite.

**No behaviour changed.** All 274 tests pass, all 17 panels render in both
themes and both languages with zero console errors, and the guided tour runs end
to end.

#### `/orc-doc` has a finish line

- **`orc doc next`** turns the pipeline from something the orchestrator
  REMEMBERS into something the CLI COMPUTES — the Flow-stepper shape, and for
  the same reason: D6–D9 was prose a session had to hold in its head across a
  resume that might be months later in a fresh context. Exit **0** = an action
  is available (`command`, plus `paid` so a caller knows button vs copy-able
  command), **1** = waiting on a human decision, **named** in `blocked_by`,
  **2** = unknown slug.
- **`orc doc ship` records delivery as a DECISION** (`/orc-pact`'s rule) while
  the resulting state stays **COMPUTED** (`/orc-challenge`'s rule). `--where`
  has **no default** — "shipped" with nowhere to point at is not a fact, it is a
  feeling — and shipping an incomplete document needs `--force --reason`,
  recorded verbatim. `unship` needs a reason and keeps the old record in
  `ship_history[]`.
- **`shipped-drifted` names the sections that moved,** by diffing the recorded
  per-section hashes against the live map. Coverage-relative, the
  `computeWikiFreshness` lesson applied to a document: a whole-file "something
  changed" cannot tell you what to re-read. It exits **1**, because the document
  moved after it was delivered and that is work.
- **`orc doc audit`** reports every drift class from disk — an extract never
  spliced back, an extract whose section moved under it, a heading a hand edit
  deleted or added, a target that no longer matches the file, a reference file
  that moved, a cycle count that disagrees with itself — each with a fix command
  and the panel that can clear it. A hand-edited section is **reported and never
  counted as a finding**: flagging it would teach people to stop editing their
  own document. `orc doctor` gains a `doc-drifted` finding routed to Docs.

#### And it remembers what you asked for

This was a **data** gap, not a rendering one. `created_at` existed and
`orc doc show --json` never emitted it; `context.md` and `context-sources.md`
were files the CLI never opened; and what the user actually ASKED FOR, in order,
across every session, lived nowhere at all.

- **`orc doc log` / `journal`** record and serve it. The journal merges four
  sources into one chronological array with the provenance of every row attached
  — `recorded` (the user's own words, verbatim), `derived` (a cycle, a ship
  record), `observed` (a section that turned `user-edited`) — and **it never
  invents an entry**: a cycle that ran with nothing logged renders as an explicit
  gap, never a plausible reconstruction from file mtimes. The `/orc-pact`
  UNCHECKABLE rule: not knowing is an answer, and faking it teaches people to
  distrust the rows that are real.
- **`orc doc context`** returns the frozen brief — the verbatim request first,
  because that is the memory-regain payload — plus the D2 reference table with a
  live state per file: `ok`, `MISSING`, `SOURCE-DRIFTED`. A source is stale
  only when THAT FILE moved, never because the repository did, and it is a
  **warning, never an error**: a frozen context is *supposed* to be old.
- **`orc doc read`** is a reader for the HUMAN — and the rule table says out
  loud that the orchestrator never runs it, registered as a contract token so
  the sentence cannot quietly disappear.
- **The Docs panel is rebuilt around this: MEMORY FIRST, state second.** The
  header strip, the brief, the reference files and the journal come before the
  ribbon — because a user coming back after three weeks did not come back to ask
  what state the document is in.

#### One more way in

D4 and D5 gain a `RETURN-TO` suspend into **`/orc-grill`** — gated on all
three of the `_shared/lane-suspend.md` tests (a DECISION not a fact, a
PREREQUISITE that changes the option set, a SUBTREE with more than one question
hanging off it), or it asks inline. The snapshot is **run state, never the
deliverable**, so hard rule 10 still holds; and on resume the lane re-writes
`.current` and touches the trace file in the same step, because `/orc-grill`
deleted the pointer at its own `FINISH`. Two traces for one document is
correct — two lanes ran.

---

### v0.48.0 — a document long enough to end a session, written anyway _(2026-08-13)_

**`/orc-doc`** writes the long document — a PRD, a TSD, a cross-team
collaboration agreement, a status report or a workflow/runbook — as portable
Markdown, and it survives the session that started it.

Two contracts hold the lane together, and everything else serves them:

> **The orchestrator never reads the document body.** It knows the document only
> through the CLI's derived section map and through what the agents it
> dispatched report back. **a lane that reads its own document** has broken this
> contract.

> **The context is gathered once and frozen.** A resumed session reads
> `context.md` from disk; it never re-interviews the user for what session 1
> already settled. **a lane that re-asks a frozen question** has broken this
> contract.

- **The token architecture is the lane.** A 900-line TSD is ~30k tokens; read it
  three times and the session is over. So nothing that holds context ever holds
  the document. `orc doc map` derives a section map — heading, absolute line
  range, SHA-256, computed state — each writer owns **one `.work/` part file**,
  and each checker reads **one line range** with `Read(offset, limit)`. On a
  10,000-line, 40-section document that is ~750 lines of orchestrator context
  instead of 20,000+, and a re-check after an edit re-dispatches only the
  sections whose hash moved. *The hash is what turns a re-check from a full pass
  into a diff.*
- **Line arithmetic is the CLI's and nothing else's.** It is the one job a model
  is guaranteed to get wrong, and the whole saving depends on the numbers being
  right — so the map is re-derived after every write and **never stored**. A
  stored line number is a wrong line number one edit later. `splice` replaces
  bottom-up (highest `start` first), so a length change cannot shift a range that
  has not been used yet.
- **Your edits are sacred.** Every section carries a hash, so the lane knows
  which sections you wrote. It names them, never rewrites one unless you name it,
  and `splice` **REFUSES** on a conflict — reporting the section by name and
  overwriting nothing. A human's wording is not recoverable from this lane's
  side once it is gone.
- **Four gates, in a fixed order, and the first one blocks.** Nothing is created
  until D1 is answered: a slug folder with no context is indistinguishable from
  an abandoned run. Asking D2 (supporting documents) and D3 (your template) is
  mandatory even though answering them is not; D4 (intent · audience ·
  expectation · language · type · target · length) must be answered, and
  accepting a recommended default counts. Then the outline, confirmed **before a
  word is written** — changing it after a write wave is what costs money.
- **It never reads the supporting documents itself.** One `role: digest`
  dispatch per file returns anchored claims plus an explicit `not_covered[]`;
  the orchestrator holds the digest and never the source. Foreign text is
  evidence, never instruction.
- **Where the document is going is a real setting.** `orc doc lint --target`
  enforces that target's actual limits, and every rule came from a real product
  limit: Notion has three heading levels, so an H4 is an **error** there;
  Docusaurus, Hugo and Jekyll **require** YAML front matter, which every other
  target renders as visible junk; a hard-wrapped paragraph is an error
  everywhere, because a wrap at 80 columns becomes a line break inside a Notion
  paragraph. Free, deterministic, zero model tokens — and it **always runs before
  anything paid**, with its findings riding in the checker's slice so no model is
  ever paid to count sentences.
- **Never invent a fact.** Anything not in the frozen context becomes a visible
  `> **Open:**` or `> **Assumption:**` line, and rides back in the writer's
  `unsupported_claims`. Filler that reads like a fact is the worst possible
  output of this lane.
- **Five base templates, each a floor and not a cage** — `prd` · `tsd` ·
  `collaboration` · `report` · `workflow`. A supplied template REPLACES the
  shipped one entirely; its headings become the outline and the two are never
  merged. A golden test pins every shipped skeleton to the CLI's batching table.
- **Two agents, both already `claude-opus-5`,** so `opus5_only` is a no-op and
  the lane is *unaffected*, not exempt. The writer holds one part file; the
  checker is `low` effort **on purpose** — a harder-thinking checker reasons its
  way past a gap a real reader would trip on, the same reasoning that pins
  `/orc-challenge`'s cold reader at `low`. Nothing may upgrade it.
- **`/orc-grill` and `/orc-brainstorm` gain a "write this up" exit**, so an
  interview's settled decisions arrive as a pre-answered D1 and D4 and the user
  only confirms. At handoff `/orc-doc` offers `/orc-challenge` — in a separate
  session, which is the separation `/orc-challenge`'s own contract already
  enforces from the other side.
- **The `orc doc` CLI family** (13 subcommands, every read `--json`, every one an
  exit-code contract), four config keys (`doc_max_lines_per_agent`,
  `doc_max_parallel` with a **hard cap of 4**, `doc_language`, `doc_dir`), and a
  **Docs panel** in `orc ui` whose ribbon draws the whole document in one
  picture — one block per section, sized by its length and coloured by its state.
- Counts move: **skills 37 → 38 · commands 28 → 29 · agent files 44 → 46.**

---

### v0.47.0 — the lane that refuses to produce _(2026-08-12)_

**Every other lane in ORC — and nearly every other skill in the ecosystem —
produces. This one refuses to.** `/orc-challenge` grades a finished artifact,
writes down what is wrong, and then stops and makes the user go away and fix it
somewhere else. The stopping is not friction: **the separation is the measuring
instrument.**

**The one-sentence contract: ORC judges, the user fixes, ORC re-judges — and ORC
never fixes what it judged.** A session that just wrote the fix will grade its
own homework and it will always pass. That registers as the third member of an
existing pair — `a lane that answers its own interview question` (v0.42.0),
`a lane that picks its own favourite` (v0.45.0), and now **`a lane that fixes
what it judged`**. Same split every time: facts and findings are ORC's, the work
and the decision are the user's.

**Rule 0 precedes every other rule: it never guesses the goal.** A finding is
only a finding relative to a goal — the same TSD is *finished* for one purpose
and nowhere near done for another. A lane that assumes will attack the wrong
thing with total confidence, and every one of its findings will be *defensible*,
which is worse than being obviously wrong: the user spends three iterations
fixing what did not matter. So intake ASKS, in ONE round, for the goal, the
audience, what "done" means, the template, and where the fixed version will go —
and freezes them to `goals.md`. **`orc challenge init` has no default for
`--goal`, `--audience` or `--done-means`**, so a run that tried to skip the round
fails at the CLI by name instead of inventing a purpose. Every finding must name
which goal element it `serves`; one that cannot is **dropped**, which is the
mechanism that stops a large context window from reviewing the entire universe.

**Three agents, and they are three different INSTRUMENTS, not three tiers.**

- **`orc-challenge-reader-opus-5-low`** — the cold read. Tools: `Read` and
  nothing else. It is given the artifact and the audience line, never the goal,
  and it answers questions FROM the artifact rather than reviewing it. Returns a
  scored questionnaire (`8/12`). **`low` effort is a measurement choice, not a
  cost one:** a harder-thinking reader reasons around exactly the gaps this
  exists to find, so a stronger configuration is a WORSE instrument.
- **`orc-challenge-judge-opus-5-high`** — grades against the frozen template and
  goal. Its slice is **SEALED**: paths and finding ids only, never prose from the
  session, never a diff summary, never "the user says they fixed #4". A fix is a
  claim; a verdict is evidence. **It cannot declare a pass** — `orc challenge
  record` computes that, which removes leniency as a possibility.
- **`orc-challenge-advisor-opus-5-med`** — dispatched only on a FAIL (advice on a
  passed artifact is invented work and it costs money). Twelve findings are
  usually three causes: it groups them by root cause, orders them with the
  dependency reason, and flags the ones that are really unmade DECISIONS. No
  prose, no diffs — handing over wording is fixing by another name.

All three are already `claude-opus-5`, so `opus5_only` is a no-op here: zero new
pairs, no rename churn. The lane is **unaffected, not exempt**.

**`orc challenge lint` — the deterministic engine, and it costs zero model
tokens.** Structure against the frozen template (missing / out-of-order /
invented / empty-ceremony sections, table column drift, untagged code fences,
links and `file:line` anchors that do not resolve) plus prose (acronyms used
before they are defined, sentences over 25 words with a p50/p90 distribution, a
passive-voice percentage, curated idioms and phrasal verbs, ambiguous
quantifiers, bare-pronoun openers, placeholder markers, a Flesch–Kincaid
estimate). **Sentences are measured over PARAGRAPHS, not lines** — a hard-wrapped
43-word sentence is still a 43-word sentence, and splitting at the newline is how
a length check silently passes every wrapped document. Two honesty rules are
printed by the command itself: it is a SIGNAL, not a verdict, and it is
English-specific and heuristic. Its real payoff is that `lint.json` rides in the
judge's slice, so the judge never spends tokens counting. It is useful with no
cycle, no model and no ORC run at all: `orc challenge lint README.md`.

**Conservation — nothing evaporates.** Every finding from iteration N−1 appears
in N with exactly ONE outcome (`resolved` · `still-open` · `superseded` ·
`withdrawn` · `accepted`) and a reason; below 100% coverage the verdict is
malformed and `record` rejects it **naming the missing ids**. A silently dropped
finding is indistinguishable from a fixed one, and that is the classic way a
review cycle appears to converge. `record` also rejects an unknown carry id, a
reasonless withdrawal, an uncited supersede, an **ignored rebuttal**, and a
**silent dimension** — `NOT-CHECKED` with a reason is allowed, silence is not.

**Two escape valves, because a loop with no exit is a trap.** `orc challenge
accept <slug> <id> "reason"` — the finding stops blocking immediately and stays
visible forever in the report with the reason; never automatic (the `/orc-pact`
retirement rule). `orc challenge rebut <slug> <id> "reason"` — the next judge
must answer it explicitly, `withdrawn` with an admission or `upheld` with new
evidence, and a verdict that ignores it is rejected. Without it, one wrong
finding loops forever and the user's only move is to give up.

**Convergence, not a cap.** There is deliberately no loop cap and no config key
for one: every other loop in ORC runs inside a single session and costs tokens
per turn, but here each turn is a separate human sitting down to work, and a cap
that refused on iteration 6 would be refusing to review a hard document. It
reports `stalled` instead — once, with three honest options.

**Seven states, all COMPUTED, none stored** — `AWAITING-JUDGE`, `AWAITING-FIX`,
`AWAITING-RECHECK`, `PASSED`, `STALE-PASS` (honest, not a failure — the
`UNCHECKABLE` precedent), `MISSING-REVISION`, and `TAMPERED` (a verdict file
changed after it was recorded: reported, never silently re-graded). Two flags
ride alongside rather than becoming states of their own, because a state that
means two things is a state that lies: `stalled` and `no_template`.

**The resumed session never asks where the fix went.** `revision_mode` is
declared at intake and restated in a `Where to put the revised version` block in
every fix brief; `orc challenge diff` resolves the expectation first and then
reports which carried findings the change actually TOUCHED —
coverage-relative, the `computeWikiFreshness` lesson applied to findings, and a
hint for the human that is **never an input to the judge**. When the declared
path is not there, `MISSING-REVISION` **lists candidates and never adopts one**:
picking the closest-looking file would point the judge at the wrong artifact and
produce a page of confident, useless findings. The escape (`orc challenge expect
--set`) is a recorded command.

**The CLI half: 12 subcommands, every read with an exit-code contract and
`--json`.** `list` (0/1/3) · `status` (0/1/2/3) · `show` · `diff` (0/1/2/3) ·
`expect` · `lint` (0/1/2) · `outline` · `record` (the GATE, not a store) ·
`accept` · `rebut` · `template`/`goals` (re-freezing is a recorded event that
needs a reason, and prior iterations keep their stamp) · `report` (derives
`CHALLENGE.md`, plus the final report on a pass). `challenge.json` has exactly
one writer, and it is never a model.

**The `orc ui` Challenge panel** renders it and decides nothing about it: the
goal block above everything, the state chip with its ONE next action inline, an
iteration timeline whose **geometry is solved from the box size** (with a dashed
version break wherever a goal or template was re-frozen), the convergence chart
stacked by severity, a dimension strip where `NOT-CHECKED` keeps its slot and
carries its reason, the cold reader's score, and the findings with their accept /
rebut buttons. **A free action gets a button, a paid action gets a copy-able
command** — running an iteration has no write route at all. `--fixtures` carries
one of every state including the ugly ones, and a test asserts it.

**Four config keys**, all `common`: `challenge_pass_severity` (default `p1`),
`challenge_stall_after` (3), `challenge_reader` (`on`; `off` makes D4 report
`NOT-CHECKED` with that reason, never silently), and `challenge_gate` (`warn`;
there is deliberately no `block` — the `/orc-pact` precedent). Deliberately NOT
added: a same-session escape hatch (that is how the premise dies), any model or
effort key, and any loop cap.

**Seams:** `/orc` prints one preflight line when it is about to build from a
document that has not passed its own review; `/orc-analyze` prints the cycle
state at Phase A (the two compose in one order — challenge it, then analyze it);
`/orc-pact` gains the finding-that-is-really-a-decision harvest; intake's "I
don't know yet" suspends into `/orc-grill` and comes back; `/orc-export` can
carry a PASSED cycle as portable evidence.

**Trace:** lane `challenge`, **Iterative tier** (one packet per completed
iteration), and a new `CHALLENGE iter=…` verb whose line the CLI assembles so
nothing composes a second wording for the same number. Several trace files for
one cycle is CORRECT — several sessions ran.

### v0.46.1 — see a lane run before you pay for one _(2026-08-12)_

**The docs answered "what is ORC" four times and never answered "what does a
lane look like when it runs".** Rides on top of v0.46.0, below.

**`mock-run/` — one written walkthrough per lane.** What you type, what ORC
prints back, what lands on disk, in easy English, all on one shared example
project. Nothing was executed to make them: they exist so nobody has to spend
tokens to find out what a command does. Start at `mock-run/INDEX.md`.

**`orc mock-run list | show <slug>`** reads the same catalogue from the
terminal, and **`orc ui` grows a Mocked Skill Use panel** — every walkthrough,
grouped, searchable, with a reading pane. The catalogue is DERIVED from the
files on disk (title from the heading, lane from whether the command really
exists), so adding a walkthrough needs no list edited anywhere; the panel
renders it and decides nothing about it, exactly like the Flow stepper.

**The README is 928 lines shorter and current.** It was still describing an
older payload — the six v0.46.0 lanes were missing from the panel list, the
config table showed 11 of 52 keys, and the eval section quoted a round from four
releases ago. History moved here to `CHANGELOG.md`, which is now what `orc
changelog` fetches: a README carrying one entry would have answered a user ten
releases behind with a single line. The detail that used to bloat it lives in
`guides/configuration.md` and `guides/model-selection.md`.

**Two real bugs found while building it.** The panel's markdown renderer looped
forever on a malformed table row (the paragraph branch is the fall-through, so a
line every branch declined never advanced the cursor), and an upgrade modal
showed the newest release with `## Earlier releases` glued to the end of it —
an entry now stops at the next section heading, not just at the next release.

---

### v0.46.0 — a lane that remembers, a lane that declines, and a lane that measures _(2026-08-10)_

**The ecosystem has a thousand skills that GENERATE.** This release builds the
three things a generator structurally cannot be, plus the wiki work that pays for
them and the panels that make them visible. Six new lanes, one new agent, and the
biggest cost cut available to ORC so far.

**`/orc-pact` — the lane that remembers.** `/orc-grill` and `/orc-brainstorm`
already settle constraints, and a plan already carries them into every executor
slice. Then the run ends and they evaporate. The pact is a ledger that outlives
the run, with four states that are **computed on read, never stored**: HOLDING,
**DRIFTED** (commits since it was verified touched the files it anchors —
coverage-relative, so a promise about payments does not fall into doubt because
the README changed), **UNCHECKABLE** (nothing cheap proves it — the honest state,
and it never counts against you), and BROKEN. It never invents a promise: every
entry records where it came from. It never retires one for you. And the payoff is
automatic — at planning time, a drifted promise whose files your plan is about to
touch is injected into the planner as a constraint, so last month's decision
constrains this month's work. `PACT.md` is a committed, PM-readable file at your
project root, rendered by the CLI from the ledger so the two can never disagree.

**`/orc-boundary` — the lane that declines.** Every skill you can install assumes
the answer to *"should the agent do this?"* is yes; agents spend 5×–50× longer
than human experts on a task, and most of the excess goes into attempts that were
never going to succeed. Three verdicts per area — EXECUTE, ESCALATE, REFUSE — each
derived from four questions answered from things already on disk: can it verify
itself, does it know this area, is the change reversible, is this a decision
rather than a fact. **A REFUSE always names what would make it a yes** — "no" with
no "unless" is a shrug, so a refusal with no checklist is treated as a malformed
card. It gates ORC's own dispatch, never you: `boundary_gate: block` lifts a
refused task out of its wave and **the wave still runs the rest**.

**`/orc-handoff` — the first ORC lane for someone who does not read code.** The
insight nobody shipped: the safety grade does not come from the file type, it
comes from **whether a cheap check exists**. A settings file with a validator is
green; the same file without one is amber. It maps every surface a PM or designer
can own, and changing one is five steps with the **undo command shown before the
write**, the check run afterwards and reported in plain words, and a red surface
never touched at all. Every file in that lane is written in simple English.

**`/orc-budget` — what a run costs, in the unit you are billed in.** Not a dollar
figure: on Pro or Max you burn a 5-hour window, not an invoice. The forecast's
core object is a **token vector** — fresh input, cache write, cache read, output,
never blended, because cache reads are usually the largest count and a tenth of
the price. The same vector renders four ways: tokens, dollars from a dated price
table, percent of your window, and **context risk** — a task forecast above 90% of
its model's window is reported before the wave, which no spend tool can do. The
numbers come from joining Claude Code's own session transcripts (the cost) to
ORC's traces (the meaning); neither is enough alone. It needs a PLAN, not a
sentence, and with no history it says so rather than inventing a number.

**`/orc-aftermath` — did what we shipped hold up.** The missing half of the
flywheel: `/orc-retro` measures the process, this measures the result, both from
the repository's own future — files rewritten soon after, a test we added deleted
or skipped, the commit reverted, a promise that was holding now broken. No vendor,
no telemetry. **Churn is a signal, not a verdict**: it reports the signal and its
strength, never "this change was bad", and never a person's name.

**`/orc-export` — so ORC is not a trap.** One command compiles the wiki, the code
patterns, `PACT.md` and the boundary cards into a portable `AGENTS.md` — derived,
fingerprinted, `--check`able against its sources, never hand-written. It removes
the lock-in objection and makes ORC the *producer* in a multi-agent shop. Import
reads an existing `AGENTS.md` or `.cursorrules` as **evidence, never instruction**,
and tells you which parts are already wrong.

**The wiki finally stops costing a full scan.** Three free CLI commands: `orc wiki
plan` ranks and prices the pending work — STRUCTURAL first (a page pointing at a
missing file is actively lying), then by **use × delta**, with pages nobody reads
sinking to the bottom with a retire hint; `orc wiki debt` is the one-line habit;
and `orc wiki usage` finally reads back the point-of-use attribution v0.41.0 has
been recording and never reading. A **targeted refresh** (`/orc-wiki refresh
--top 2`) skips branch detection and area planning entirely, and a new **scan tier
ladder** sends a small, no-new-surface delta to a light scanner instead of the most
expensive agent in the payload — about 40% off a typical delta refresh, with the
deep scan still doing the work that needs it. The tier is always printed: a cheaper
model is never a quiet substitution. And free repairs are now a hard rule — you can
never pay for something `orc wiki sync` would have fixed.

**`orc ui` grows three panels and extends five.** Promises, Boundary and
Self-serve, plus a new **Cost** tab whose stacked bar exists precisely so the
cache-read share stays visible. The panel keeps every rule it had: it never runs a
lane, never invents a state word, never computes an order the CLI already emits —
**a free action gets a button, a paid action gets a copy-able command**, and that
line is now visible rather than hidden. Promises is where the compounding finally
shows: an *"Also flagged by"* line when the boundary and the aftermath agree with
the ledger about the same area, which you can never see in a terminal one lane at
a time.

---

## Earlier releases

### v0.45.0 — `/orc-brainstorm`: for when you do not have the idea yet _(2026-08-10)_

### v0.44.1 — apply when you say so, and a spotlight that survives a banner _(2026-08-09)_

### v0.44.0 — the panel stops making you type what it already knows _(2026-08-09)_

### v0.43.7 — the flow you can see, and a boundary you can read _(2026-08-09)_

### v0.43.6 — `orc ui` in two languages, and panels that point at the right page _(2026-08-08)_

### v0.43.5 — the update check works, and the UI teaches itself _(2026-08-08)_

### v0.43.4 — a warning that finally clears, an Experiment panel, crosslink from the UI _(2026-08-08)_

### v0.43.3 — `orc ui`: it tells you about updates, and 36 keys stop being a wall _(2026-08-08)_

### v0.43.2 — `orc ui`: boxes stop colliding, because the container owns the gap _(2026-08-08)_

### v0.43.1 — the panel's stylesheet and script actually reach the browser _(2026-08-08)_

### v0.43.0 — `orc ui`: a control panel for everything that is not ai _(2026-08-08)_

### v0.42.0 — Say what you mean, see what it costs, find your way back _(2026-08-08)_

### v0.41.0 — A wiki that can tell you it is fresh, and TDD only where it can fail _(2026-08-06)_

### v0.40.0 — Gotchas: repair memory that outlives the run _(2026-08-06)_

### v0.39.0 — The read ladder, and foreign input that is evidence rather than instruction _(2026-08-06)_

### v0.38.1 — `orc doctor --json` + handoff carry-over that says what is re-derived _(2026-08-06)_

### v0.38.0 — `/orc-quick`: the quick lane, and the gate no config can collapse _(2026-08-05)_

### v0.37.0 — Stacked pull requests: a measured ship gate + two standalone lanes _(2026-08-03)_

### v0.36.0 — `opus5_only`: one model for every role, not just executors _(2026-08-02)_

### v0.35.0 — `opus5_executor_only`: one model, effort as the cost dial _(2026-08-02)_

### v0.34.8 — `orc pattern status` rejects a language key the payload has never heard of _(2026-08-01)_

### v0.34.7 — DIY: a usable status contract, and compile docs that match the compiler _(2026-08-01)_

### v0.34.6 — Analyze: the evidence gate now covers the rows a good analysis produces _(2026-08-01)_

### v0.34.5 — Wiki: stop losing tags silently, let a delta clear its own delta _(2026-08-01)_

### v0.34.4 — Planner: scorable facets, and TDD rules scoped to reality _(2026-08-01)_

### v0.34.3 — Slice boundary: the worktree, not the editor _(2026-08-01)_

### v0.34.2 — Trace subsystem: the pointer clobber, and a writer contract that holds _(2026-08-01)_

### v0.34.1 — Install integrity: run state survives `orc update` _(2026-08-01)_

### v0.34.0 — Opus 5: top scoring band, every core role, medium-effort session tier _(2026-07-25)_

### v0.33.0 — Knowledge deepening + verification revamp _(2026-07-25)_

### v0.32.0 — Trace revamp: narration is dispatched, not remembered _(2026-07-24)_

### v0.31.0 — Execution-integrity revamp: plan handoff, attributable traces, facet scoring _(2026-07-23)_

### v0.30.0 — Scoring revamp, Fable 5 role override, tier-aware guards, `orc onboarding` _(2026-07-23)_

### v0.29.0 — Drift-prevention hardening: install manifest + prune, `orc doctor`, a real test suite _(2026-07-22)_

### v0.28.1 — Defect fixes: package encoding, trace event routing, count/doc drift _(2026-07-22)_

### v0.28.0 — Run integrity: rich full-lane traces, deterministic wave stop, visible knowledge gates _(2026-07-21)_

### v0.27.0 — `/orc-poly`: plan one change across two-or-more repos without drift _(2026-07-20)_

### v0.26.0 — Test-gen output pinned to a visible `test-generator/<change-slug>/` deliverable _(2026-07-19)_

### v0.25.1 — Eval report: the full 17-lane suite graded against the v0.25.0 payload _(2026-07-18)_

### v0.25.0 — Deterministic artifact detection: a generated wiki/pattern is never missed _(2026-07-18)_

### v0.24.0 — Crosslink fused into wiki generation: always-on, per-scan-task, never wiped _(2026-07-18)_

### v0.23.0 — Trace fix: SPAWN restored on the `Agent` tool, stale runs rotate to fresh files _(2026-07-18)_

### v0.22.0 — `/orc-learn`: per-feature onboarding docs — learning.md + knowledge.md, wiki-deep, git-ignored _(2026-07-17)_

### v0.21.0 — Statusline shows live subscription usage: 5h ↔ weekly, official numbers _(2026-07-16)_

### v0.20.0 — One source of truth: generated executor agents + shared cross-lane contracts _(2026-07-16)_

### v0.19.0 — Thin spines: skill compaction, budget lint, and a trace that logs every phase _(2026-07-16)_

### v0.18.0 — `orc wiki sync`: the wiki registers itself — a paused scan is no longer an invisible wiki _(2026-07-15)_

### v0.17.3 — Trace the wiki consult: Phase 1 now logs whether the run grounded in the wiki (and if it was stale) _(2026-07-14)_

### v0.17.2 — Behavior-trace logging is permanent + the trace folder is now created deterministically _(2026-07-14)_

### v0.17.1 — Complete cross-repo crosslink setup guide in the orc-wiki README _(2026-07-14)_

### v0.17.0 — `orc crosslink`: cross-repo wiki references — advisory boundary contracts _(2026-07-14)_

### v0.16.1 — Interactive `orc diy` composer + numbered picks in `orc config` _(2026-07-14)_

### v0.16.0 — `/orc-diy`: build your own lane — CLI-composed flow, compiled, hard-gated _(2026-07-14)_

### v0.15.0 — Wiki v2: evidence-anchored docs · per-file staleness registry · integrity gate _(2026-07-14)_

### v0.14.0 — Postgres data-access playbook: cross-cutting query grounding _(2026-07-13)_

### v0.13.0 — `/orc-claude`: local CLAUDE.md builder — fenced sections, fingerprint refresh, zero questions _(2026-07-12)_

### v0.12.0 — Lossless context-combiner: conservation gate · overlap taxonomy · evidence freshness _(2026-07-12)_

### v0.11.0 — `/orc-fast`: knowledge-gated speed lane + wiki freshness infrastructure _(2026-07-12)_

### v0.10.1 — README: a fuller "Why ORC exists" _(2026-07-12)_

### v0.10.0 — `/orc-ultra`: max-effort advisor + three judgment gates for ultra-complex work _(2026-07-12)_

### v0.9.0 — Trust-but-verify the analyst→planner chain: quote-anchored evidence · coverage gate · anchored judgment _(2026-07-12)_

### v0.8.1 — /orc-retro delivers upstream: PR/issue to the ORC repo, channel-gated _(2026-07-12)_

### v0.8.0 — Close the loop: grounded intake · scoring anchors · OUTCOME marker · /orc-retro trace miner · eval harness _(2026-07-12)_

### v0.7.0 — Evidence everywhere: grounded plans · verbatim proof · anchored findings · contract lint · trace fixes _(2026-07-12)_

### v0.6.0 — P0–P3 ladder · house rules · deep playbooks + wired gates · 3 new languages · FE rule packs · security pass _(2026-07-11)_

### v0.5.1 — Statusline false-degrade fix _(2026-07-11)_

### v0.5.0 — Code-pattern findings: executors match your house style, invariants always enforced

### v0.4.5 — Rewrite weak worker descriptions (the real score lever)

### v0.4.4 — Act on external review: raise sub-70 workers, fix cross-spine paths

### v0.4.3 — `orc-analyze`: trim description under the 1024-char skill-spec limit

### v0.4.2 — External-review pass: worked examples + sharper mini-analyst activation

### v0.4.1 — `orc-mini`: faster, safer fast-lane — smoke gate, opt-in tests, trimmed ceremony

### v0.4.0 — Opt-in Phase 6.5 Test Authoring (writes test cases, never runs them)

### v0.3.0 — Opt-in behavior-trace logging + claimed-vs-actual model verification

### v0.2.4 — `orc-analyze`: gather anchored adjacent-scope context (non-actionable)

### v0.2.3 — Context Combiner: merge 2+ related analyses into one combined spec

### v0.2.2 — Config: enforce per-key override-first resolution

### v0.2.1 — Move config editing into the `orc config` CLI (zero-token); drop `/orc-config`

### v0.2.0 — Doc-optional evidence-backed analyst + deep mode
