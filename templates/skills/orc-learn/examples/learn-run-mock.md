# Worked example — orc-learn runs (mock; orient only, never execute from this)

## Run 1 — INIT with a fresh wiki

U: /orc-learn
C: Repo root found. Reads wiki/INDEX.md + the wiki manifest → tier FRESH.
   Presents the wiki's feature areas; user picks "orders". Slug: `orders`.
   Spawns orc-learn-writer-opus-5-low with mode=init, covers from the
   orders doc's globs (the skill never writes the docs itself).
W: Reads the orders wiki doc for boundary + contracts, re-verifies against
   code. Deepens: maps 14 functions (file:line), traces one real flow —
   POST /orders → validate (routes/orders.ts:31) → price (pricing.ts:88) →
   persist (repo/orders.ts:15) → emit event → 201. Harvests 3 invariants,
   4 why-this-way findings, 2 couplings.
W: Writes learning-docs/orders/knowledge.md (fingerprint header:
   source_commit=HEAD, 9 hashed files; functions & flow; contracts; verify
   commands from the wiki manifest's `commands`) and learning.md (mental
   model, walkthrough of the SAME flow, 3 change recipes, gotchas, FAQ ×6).
   Derives learning-docs/INDEX.md. Returns functions_mapped=14,
   flow_traced=true, faq_count=6, actual_model=claude-opus-5,
   actual_effort=low.
C: Relays the report. `learning-docs/` not in .gitignore → offers the line;
   user accepts → appended.

## Run 2 — INIT, no wiki

U: /orc-learn focus=src/billing
C: No wiki/ → tier none (traced all the same). Asks only to confirm the
   feature ("billing", from the focus pointer). Writer does a TARGETED scan
   of src/billing/** only — never repo-wide — then deepens and writes the
   pair as above.

## Run 3 — REFRESH, multi-select

U: /orc-learn refresh
C: Reads each learning-docs/*/knowledge.md header; computes tiers on read:
   orders STALE (drift hit pricing.ts), billing FRESH. Shows BOTH with
   flags; user picks orders only. One writer dispatch regenerates the orders
   pair (new source_commit, recomputed hashes, changelog line), re-derives
   INDEX.md. billing: byte-untouched.

## Run 4 — behavior trace (permanent, always on)

The skill writes the run pointer (`run-learn-<slug>-<DDMMYY>-<HHMMSS>.txt` into
`log_dir`) before the spawn, records these events as they happen, and — as a
single-dispatch lane — dispatches the trace writer ONCE at run end to append
them (`SPAWN`/`RETURN` come from the `orc-trace.js` hook as they occur):

```
[170726 10:02:01.050] writer   WIKI-CONSULT tier=FRESH :: topic-pick
[170726 10:02:44.310] writer   DISPATCH orc-learn-writer :: init orders expect=opus-5/low
[170726 10:02:44.420] hook     SPAWN orc-learn-writer-opus-5-low
[170726 10:06:12.900] hook     RETURN
[170726 10:06:13.010] writer   VERIFY writer actual=claude-opus-5/low ✅ MATCH
[170726 10:06:13.120] writer   FINISH :: init orders
```

Then the writer packet returns and the run pointer is deleted (in that order).
REFRESH traces one DISPATCH/VERIFY pair per
selected feature, ending `FINISH :: refresh <n> features`. No phase/score/
finding/verdict markers — this lane runs none of those phases.
