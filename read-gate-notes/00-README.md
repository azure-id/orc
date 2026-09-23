# read-gate-notes — reading order

Working-process folder for **the read gate** (v1.5.0 → **v1.6.0**, new feature,
backward compatible → `npm version minor`).

**Never `git add` anything in here.** CLAUDE.md: commits contain skill/package
work only, never planning or scratch documents.

> **Status: NOTHING BUILT. NOTHING MEASURED.** Every number in `01-audit.md` is
> a structural fact read off the tree on 2026-09-07. Every number this release
> would be *justified* by is still unmeasured — that is W0, and W0 can refuse
> the release.

---

## Where this came from

A published diagram of Spotify's internal Claude Code router ("Portal by
Spotify cut my Claude Code token usage by 90%", Dimitri Mazmanov, 3 Sep 2026).
It is a `PreToolUse` hook that intercepts a `Read` over 350 lines and hands the
file to a cheap worker, which returns bullets — so the file never enters the
expensive model's context.

**The finding is not that the pattern is new to ORC.** ORC already has the
cheap-worker router, the declarative agent files, the disk-not-context write
path, and the read discipline written down in three places. The finding is that
ORC's read discipline is **advisory prose only**, which is the exact
configuration the source post reports as *the version that failed*.

---

## Read in this order, and nothing else

1. **`01-audit.md`** — what ORC already implements, with `file:line` evidence,
   mapped row by row against the diagram. Read this before proposing anything:
   most of the diagram is already here and better, and the plan is only about
   the part that is not.
2. **`02-risks-and-choices.md`** — D1–D11. **D1 is load-bearing and unanswered**
   (does `PreToolUse` fire inside a dispatched subagent). Several waves are
   undefined until it is settled.
3. **`03-PLAN.md`** — what ships, W0–W6, the gate per wave, the non-goals.

---

## The rules that matter most while executing

- **`main` only.** No branch, no worktree, at any wave.
- **W0 is the first thing built and it may REFUSE the release.** CLAUDE.md:
  *"MEASURE THE TARGET FIRST, AND NAME THE CLASS FROM THE COUNT."* If the main
  session's oversized reads are not a material share of main-session tokens,
  this release does not ship and the finding is written down instead.
- **The threshold is ORC's own number, measured.** `350` is Spotify's, derived
  from a 10–30 s delegation round trip. A Claude Code subagent round trip is not
  10–30 s — v1.2.0 measured a healthy dispatch at **17m8s** — so ORC's
  break-even sits far above 350 lines. Copying the constant would delegate work
  whose overhead exceeds its saving.
- **The hook FAILS OPEN, always.** A read gate that throws and blocks a read has
  broken the tool. Precedent: `orc-statusline.js` is fail-silent,
  `orc-effort-guard.js`'s version check is fail-silent.
- **Two exceptions are not preferences** (`_shared/read-ladder.md`): a file that
  will be EDITED is read in full first, and output a gate parses is read whole.
  A gate that cannot honour both is not shippable.
- Every wave ends in a STOP: `npm run verify` + `npm test` → findings → report →
  **wait**.
- **A flake is recorded, never retried away.**
- Every wave declares its class — **E** eliminated · **D** deferred ·
  **C** consolidated. A wave that cannot name its class does not ship.
