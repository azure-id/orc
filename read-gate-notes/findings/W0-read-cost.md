# W0 — what oversized main-session reads actually cost here

**Date:** 2026-09-07 · **Base:** v1.5.0 · **Class: E-refused** — nothing was
eliminated, because the target was measured and found immaterial.

> **VERDICT: W0 REFUSES THE RELEASE.** Oversized main-session reads are
> **0.99% of price-weighted main-session ingest at the theoretical upper
> bound**, and the share the gate would actually be allowed to refuse is a
> fraction of that. The read gate does not ship. `03-PLAN.md` §3 W0 names this
> outcome in advance and calls it a successful W0.

---

## 1. Instrument and sample

| | |
|---|---|
| Source | Claude Code's own transcripts, `~/.claude/projects/**/*.jsonl` |
| Transcripts | **239**, across 8 projects, 185 MB |
| Main-session assistant turns | **22,510** |
| Subagent turns | 2,706 |
| Unreadable lines | **0** |
| Orphaned tool results | **0** |
| Truncation markers in read results | **0** — content fidelity is intact |
| `unattributed` | **0** (printed even though zero, per the /orc-budget rule) |

Probes: `read-gate-notes/.probe.js`, `.probe2.js`, `.probe3.js` — throwaway,
never committed.

**The one estimate, named as an estimate:** result bytes are converted to tokens
at **~4 chars/token**. Every token figure below inherits that. Everything else
— call counts, line counts, wall times, turn counts — is read off the record.

---

## 2. The four-kind vector, main session only

Never blended, per the /orc-budget rule.

| Kind | Tokens |
|---|---|
| `input` | 114,437 |
| `cache_write` | 57,054,640 |
| `cache_read` | 5,698,043,168 |
| `output` | 20,523,978 |

---

## 3. Question 1 — what share of main-session ingest is oversized reading?

Main-session `Read` calls: **627** total → 9 errors, 37 images, **581 usable**.
Of those, **266 were already targeted** (`offset`/`limit` present) and **315
were full reads**. The model already reaches for a targeted read **46%** of the
time, unprompted.

| Threshold | Full reads ≥ | Est. tokens | % of `cache_write` | % of price-weighted ingest¹ |
|---|---|---|---|---|
| 200 lines | 66 | 394,049 | 0.69% | 1.72% |
| **350 lines** (the post's constant) | **23** | **221,271** | **0.39%** | **0.99%** |
| 500 lines | 14 | 170,982 | 0.30% | — |
| 1000 lines | 5 | 78,734 | 0.14% | — |
| *every* full read, any size | 315 | 636,785 | 1.12% | 1.95% |

¹ **The upper bound, computed in the feature's favour.** A read is paid once at
`cache_write` and then re-read at `cache_read` on every later turn. This column
assumes each read persists for **every remaining turn of its session, never
compacted**, and weights `cache_read` at 0.1×. Real compaction makes it smaller.
**The bound overstates the case FOR the gate and the case still fails.**

**Ceiling, stated plainly:** a gate that blocked *every* full read in the
recorded history and returned nothing at all would move **1.95%**.

---

## 4. Question 2 — the distribution

| Lines | Full reads | Chars |
|---|---|---|
| 0–100 | 180 | 427,643 |
| 100–200 | 69 | 543,157 |
| 200–350 | 43 | 691,112 |
| 350–500 | 9 | 201,155 |
| 500–1000 | 9 | 368,992 |
| 1000–2000 | 4 | 231,388 |
| 2000–5000 | 1 | 83,549 |
| 5000+ | 0 | 0 |

p50 **85** · p75 **177** · p90 **288** · p99 **1,107** · max **2,275** (n=315).

The reads this feature exists to catch sit past p90.

---

## 5. Question 3 — what a delegated read costs

Measured from `Task`/`Agent` tool_use → tool_result timestamps, **n=125**:

| | |
|---|---|
| p50 | **76 s** |
| p90 | **188 s** |
| max | 563 s |

`01-audit.md` §5 predicted this and it holds: the post's 350 was derived from a
10–30 s round trip. **Ours is 76 s median — 2.5–7.6× theirs.** Break-even is
therefore far above 350 lines, and the table in §3 shows the population above
350 is already only 23 calls.

---

## 6. The number that ends it — the addressable set

The gate must honour both ladder exceptions. After they are honoured, at
threshold **350**:

| | n | of 23 |
|---|---|---|
| Oversized full reads, all history | 23 | 100% |
| — edited later ⇒ **exception 1 forces allow** | 7 | 30% |
| — gate-parsed output ⇒ exception 2 | 0 | 0% |
| **Addressable at all** | **16** | 70% |
| — of which are plan/spec documents² | 8 | — |
| Occurred in a session that dispatched *anything* | **8** | **35%** |

² Eight of the sixteen are `orc-doc-plan.md`, `orc-challenge-plan.md`,
`orc-newlane-plan.md`, `orc-v0.48.1-plan.md` and their siblings — **documents
the user handed the model on purpose.** `/orc-boundary`'s rule is that a gate
constrains ORC's own dispatch, never an explicit user instruction. Refusing
these is the gate refusing the user.

And **D11's leaning was to gate only while a run is open.** Only **8 of 23**
oversized reads happened in a session that dispatched a Task at all. Intersect
that with the 16 addressable and the run-scoped, exception-cleared, not-the-
user's-own-plan-document set is **a handful of calls across 239 sessions.**

---

## 7. The scope problem the measurement also surfaced

| Surface | Main-session calls |
|---|---|
| `Read` tool | 581 usable |
| `Bash` total | 10,515 |
| `Bash`, read-shaped (`cat`/`head`/`tail`/`sed -n`/`less`/`more`) | **7,139** |

**Reading in this environment does not go through `Read`.** It goes through
Bash — auto mode instructs exactly that, and this very session was told to. A
`PreToolUse` matcher on `Read` covers roughly **7.5%** of the actual read
surface. `D7` put the Bash gate out of scope for "no data yet"; this is the
data, and it says the in-scope half is the small half.

---

## 8. What this refuses, and what it does not

**Refused:** shipping `orc-read-gate.js` in v1.6.0. W2–W6 do not start. W5 was
already gated on this wave and is refused with it (`D8`'s `context-reader`
`EXTRA_SLOTS` row would be, in `02-risks-and-choices.md`'s own words,
*infrastructure for nothing*).

**Not refused, and still true:** `01-audit.md` stands. ORC's read discipline
*is* advisory prose in three places, and that *is* the configuration the source
post reports as the version that failed. The audit is kept.

**Why the conclusion differs anyway:** the post's finding was measured on a Java
monorepo where bulk file reading was the workload. ORC's orchestrators barely
read — they dispatch. The prose ladder, `orc-doc` hard rule 0, and `/orc-quick`
line 21 are *already working*: p50 is 85 lines and 46% of reads are targeted
without any hook telling them to. **The mechanism this repo moved out of a
model's memory five times did not need moving a sixth time, because the
measurement says the memory is holding.**

---

## 9. Honest limits of this measurement

1. **4 chars/token is an estimate.** Every token figure inherits it. Call
   counts, line counts, turn counts and wall times are not estimates.
2. **One machine, one user, 239 sessions.** Not a fleet.
3. **The amplification column is an upper bound**, not a measurement — it
   assumes zero compaction. It is deliberately generous to the feature.
4. **A dispatch duration is not a delegated-read duration.** n=125 covers every
   `Task`, most of which were doing more than reading. It is an upper bound on
   the population.
5. Transcripts predate this release; no run under a read gate has ever been
   observed, because none exists.

---

## 10. Wave gate, and one flake recorded

Recorded, not retried away — the standing rule in `00-README.md`.

| Gate | Result |
|---|---|
| `npm run verify` | **green** — 10 executor files match the template, 40 skills, 48 agent files, 187 contracts consistent |
| `npm test` | **green** — 874 passed, 0 failed, 55 files, 354.3 s |
| `git diff HEAD` (tracked) | **0 lines.** W0 built nothing; the tree is byte-identical to `fa15493` |

**The flake.** A first `npm test` was cut off by session teardown. Before it
died it reported four failing files:

- `test/cli/extra-secrets.test.js`
- `test/cli/extra-resume.test.js`
- `test/cli/extra-credential-source.test.js`
- `test/statusline-baseline.test.js`

The clean re-run is green on all four. **Attribution, stated as the inference
it is:** the three W0 probes were walking 185 MB of transcripts on the same box
at the same time, and three of the four failures are in the `extra` credential
family, which does `scrypt` at `N = 2^17` — a deliberate CPU cost CLAUDE.md
says must never be tuned down. CPU starvation is a plausible cause and is
**not proven**. Nothing was changed to make them pass, and nothing was
re-run until it went green: the second run is the first complete one.

This is consistent with what CLAUDE.md already records about this suite —
*three green runs are the gate, NOT PROOF* — and with the known unfixed
absolute wall clock at `test/cli/extra-journal.test.js:428`. **Do not run the
suite concurrently with a heavy local job.**

---

## 11. If this is revisited

The threshold to re-measure against, so nobody re-derives it: **the release
becomes worth building when oversized, run-scoped, exception-cleared reads
exceed roughly 5% of price-weighted main-session ingest** — five times today's
generous upper bound. The instrument is these three probes; re-run them.

The likelier trigger is not a bigger number here but a different workload: a
repo where the orchestrator must read bulk source it will not edit. ORC is not
that repo.
