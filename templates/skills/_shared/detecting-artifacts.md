# Shared contract — Detecting the wiki & pattern cache (existence, not freshness)

THE canonical answer to the question every knowledge-gated lane asks FIRST:
**does a generated wiki / cached code-pattern already exist?** This governs
EXISTENCE detection only — freshness and precedence are decided afterward per
`../orc-wiki/references/staleness.md`. Load this at any
preflight/consult point that must know whether the precomputed knowledge is
present (orc-fast F0, orc/orc-mini wiki-consult, the pattern resolve gate,
orc-verify's pattern check, orc-learn's topic pick).

## The trap this closes

Both artifacts live under the HIDDEN `.claude/` dir:

- wiki manifest → `.claude/orc/wiki-meta.json` (+ docs under `wiki/`)
- pattern cache → `.claude/orc/patterns/<lang>-pattern.md`

A model probing with an ad-hoc `find` / glob / `ls` gets a FALSE "missing"
whenever the search skips dot-directories or runs from the wrong working
directory (a subfolder, an eval sandbox root). A generated wiki or pattern then
reads as absent and the lane needlessly falls back, re-scans, or re-codifies.
**Never conclude "missing" from a raw filesystem search.**

## The rule — probe with the deterministic CLI, ONCE, up front

At preflight — BEFORE any gate logic — run the CLI probes and treat their output
as the SOURCE OF TRUTH. They resolve `.claude` exactly like every other `orc`
command (independent of CWD) and read the artifacts directly, so a generated
wiki/pattern is never missed:

- **Wiki:** `orc wiki status` → `none | unregistered | corrupt | drifted |
  registered` (plus a freshness tier when registered). Only `none` means the
  wiki is truly ABSENT; every other state means it EXISTS (registration/parse
  issues are a cheap re-registration fix, never a reason to conclude "no wiki").
- **Pattern:** `orc pattern status <lang>` → exit 0 = cached, exit 1 = absent
  (the exit code is the contract). `orc pattern status` with no arg lists every
  cached language.

Use `npx --no-install orc …` when `orc` is not on PATH. Record both results in
run state so the lane ALREADY KNOWS the wiki and pattern exist — do not re-probe
per gate, and do not second-guess a positive probe with a `find`.

## Fallback when the CLI genuinely cannot run

Only if the `orc` CLI is unavailable: resolve the repo root explicitly and test
the EXACT path — never trust a recursive search that may skip dot-dirs:

```
root=$(git rev-parse --show-toplevel)
test -f "$root/.claude/orc/wiki-meta.json"                 # wiki registered
test -f "$root/.claude/orc/patterns/<lang>-pattern.md"     # pattern cached
```

## Handoff

Existence decides only "is the knowledge THERE." Once present, hand off to
`../orc-wiki/references/staleness.md` for the freshness tier and the precedence
rule. Absent routes per each lane's own gate: orc-fast → fallback to orc-mini;
orc / orc-mini → proceed without it (the wiki/pattern are purely additive).
