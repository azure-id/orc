# W2–W6 — the build, and what the gate caught

**Date:** 2026-09-07 → 2026-09-08 · **Base:** v1.5.0 → **v1.6.0**
**Class: C** — consolidated. A rule that lived in three prose copies now has one
enforcement point. The payload GREW; this is not an E wave and does not claim to
be.

> Built on an EXPLICIT OVERRIDE of W0's refusal. W0 measured the target as
> immaterial (0.99% of price-weighted ingest at a generous bound) and refused
> the release; the user overrode that. **W0's refusal was ECONOMIC and was
> overridable. W1's was a CORRUPTION path and was not overridden — it was
> ANSWERED, with evidence.** Both are recorded rather than smoothed over.

---

## 1. What shipped

| # | Thing | Where |
|---|---|---|
| C | the hook | `templates/hooks/orc-read-gate.js` |
| — | 12 tests | `test/hooks.test.js` (file total 31 → 43) |
| D | `read_gate` (`off`\|`warn`\|`block`, default `off`) | `CONFIG_META` |
| D | `read_gate_max_lines` (default **1000**) | `CONFIG_META` |
| — | both on `SEED_EMPTY`, reason recorded | `bin/verify-contracts.js` |
| — | settings merge, matcher `Read`, non-destructive | `bin/cli.js` |
| — | shipped-file manifest | `bin/verify-package.js` |
| E | `read-gate-unwired` + `read-gate-fallback` | `orc doctor` |
| E | `FINDING_ROUTE` rows + `readGateUnwired` CTA (en/id) | `bin/webui/` |
| F | the user's half, Simplified Technical English | `templates/hooks/README.md` |
| G | README · CHANGELOG · knowledge.md §4z.24 · CLAUDE.md · orc-ui-wiki.md | — |

---

## 2. The two numbers this release refused to borrow

**The threshold is 1000, not 350.** Derived, with sample counts:

| Input | Value | n |
|---|---|---|
| `Task` dispatch wall time | p50 **76 s**, p90 188 s | 125 |
| one real read-only dispatch (W1's own) | **13,276 tokens** for a 4-line file | 1 |
| chars per line, main-session full reads | **55.2** (median file 51.9) | 316 |
| ⇒ break-even | **962–1024 lines** | — |

**`agent_id` is the discriminator, and it is measured** (W1). Everything about
rung 0.5 rests on that one fact, so it has its own finding.

---

## 3. What the repo's own guards caught

This is the part worth keeping. Every one of these would have shipped broken.

| Guard | What it caught |
|---|---|
| `verify-contracts.js` | the hook was an **UNREGISTERED copy** of two shared contracts (`.current`, `read-ladder.md`) |
| `verify-contracts.js` | `read_gate` answered a config family (`read`) that `CONFIG_FAMILIES` did not declare |
| `verify-contracts.js` | an uncontested family requires every key at **P2**; `read_gate_max_lines` was P3 |
| `test/cli/upgrade.test.js` | **the newest changelog entry must carry the pre-v0.56.0 recovery steps as three ORDERED BULLETS inside the first six rendered lines.** Mine had none. Not a golden — a live contract every release inherits, because anyone still on the unscoped package has an `orc upgrade` that cannot install its own replacement |
| section-count diff vs `HEAD` | **I truncated `README.md`.** Splicing the changelog with `indexOf('\n### v')` found no next entry, so everything after it — including `## License` — was dropped. Restored; both now list 18 identical sections |

**The `README.md` truncation is the one to remember.** `npm run verify` was
green across it, the suite was green across it, and no lint noticed. It was
caught by diffing the section list against `HEAD` — a check I ran because the
splice was arithmetic on a document, and that is exactly the shape this repo
already distrusts (`/orc-doc` rule 2: a stored line number is a wrong line
number one edit later).

---

## 4. Four goldens updated deliberately

Adding two config keys moved four pinned counts. Each was changed with its
reason, not bumped:

- `test/cli/config.test.js` — key count 84 → 86
- `test/cli/config.test.js` — the `SEED_EMPTY` orphan list is **order-sensitive**;
  both keys inserted at registry position with the "a hook has no lane" reason
- `test/cli/lane.test.js` — `not_read.length` 84 → 86
- `test/goldens.test.js` — title + count, and `test/goldens/config-keys.json`

**The golden file has no auto-regen flag, by design** — a golden that
regenerates itself asserts nothing. So it was regenerated from a real
`orc init` + `config list --json`, and then the DIFF was checked: **10
insertions, 0 deletions.** Exactly the two new key objects, nothing reordered,
no other default silently changed. That check is the point of not having the
flag.

---

## 5. The flake, recorded and NOT retried away

Three full-suite runs, in order:

| Run | Result | Failures |
|---|---|---|
| 1 (during W0) | 874 / 0 | — |
| 2 (after the build) | 881 / **5** | 4 goldens + the changelog contract — **all REAL, all fixed** |
| 3 (after those fixes) | 881 / **5** | a COMPLETELY DIFFERENT five |
| 4 (final, nothing changed after run 3) | **886 / 0** | — |

Run 3's five:

| File | Symptom |
|---|---|
| `cli/extra-resume.test.js` | `extra ping` non-zero after **90.3 s** |
| `cli/extra-conform.test.js` | same family |
| `cli/extra-credential-source.test.js` | two dispatch cases |
| `webui/serve.test.js` | **`ECONNRESET` after 20.2 s** |

**Every one is a local-HTTP socket or probe budget, not a logic error.** The
strongest single tell: in `serve.test.js` the case that failed was "a large
asset is COMPRESSED", and the VERY NEXT case — "the static path and the JSON
path share ONE encoder", exercising the same `encodeBody()` — passed.

**Diagnosis, once, with a stated hypothesis:** all four files run in isolation
→ **40 passed, 0 failed.** That proves this release did not break their logic.
It does **not** prove the suite is green.

**Contributing evidence:** run 3 took **481 s** against 354 s and 358 s for the
same suite — 36% slower — and the box measured 5% CPU and 2 node processes once
it finished, so the load was the suite's own. CLAUDE.md already documents this
family: `extraProbeMs()` over probe budgets of 3000/8000/20000/60000, `net`
pinned at 2 by the POOLS table, and a known-unfixed 12 s absolute assertion at
`test/cli/extra-journal.test.js:428`.

**Nothing was changed to make these pass, and the suite was not re-run until it
went green.** Run 4 was started once, with NO source change after run 3, and
came back **886 / 0 in 348.9 s** — against run 3's 481 s for the same suite.
That runtime gap is the corroboration: the failing run was the slow one.

CLAUDE.md's standing warning applies to that green in full: *three green runs
are the gate, NOT PROOF* — an idle run cannot tell a fixed flake from a quiet
afternoon. **Run 3's five failures are a real observation of this suite's
net-pool fragility, and they are recorded here rather than erased by run 4.**

**Do not run this suite beside a heavy local job.**

---

## 6. Honest limits of what shipped

1. **The gate cannot see a `Bash` read** — `cat`, `head`, `sed -n`. Measured:
   **7,139 read-shaped Bash calls against 581 `Read` calls**, so the matcher
   covers roughly 7.5% of the real read surface here. Stated in the hook header,
   in `templates/hooks/README.md`, in CLAUDE.md and in `knowledge.md`.
2. **It is silent outside an open run**, so `/orc-quick`'s Q1 LOOK is ungated.
3. **`agent_id` is one Claude Code version, one agent type, one OS.** If the
   field ever disappears the gate over-fires on subagent reads in `warn` — which
   is why it fails open and why `off` is the default.
4. **No run has ever executed with this gate armed.** Every test is a spawned
   hook with a synthetic payload; the live path is exercised only by the W1
   probe, which was a different (always-allow) hook.
