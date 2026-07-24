# Reference — `/orc-wiki crosslink compile` (one-shot crosslink + atlas + injection)

An orc-wiki ENTRY BRANCH (sibling of the Phase 3c legacy backfill — distinct
from plain `/orc-wiki crosslink`, and NOT the `orc diy compile` CLI: this one
needs a model to synthesize the atlas, so it is a skill branch, not a CLI
command). One command that wires a configured federation end-to-end.

## Precondition (hard)

`.claude/orc-crosslink.config.yaml` exists with ≥1 `links[]` edge.
Missing/empty → explain the `orc crosslink` CLI steps and STOP (never guess a
graph). Local wiki absent → WARN that atlas quality degrades to
graph+peer-peek only; still run (advisory, never blocking).

## Steps — in order; each step warn-only on failure, NEVER a re-scan, NEVER a doc rewrite

1. **Resolve/consume pass** from the config graph (the existing crosslink
   resolve — crosslink.md consumer discovery): refresh
   `.claude/orc/crosslink/needs.json` + `cache/`.
2. **Generate the LOCAL atlas** (`wiki/crosslink/atlas.md`) from own wiki +
   graph + read-only peer wiki/atlas peeks (crosslink.md ATLAS section:
   Federation map · Per-node profile with peek hints · Freshness ledger;
   header `generated_from` + `generated` + per-peer peek freshness).
3. **Write the atlas into EACH linked repo's** `wiki/crosslink/atlas.md`
   (sanctioned peer FILE write, exception #2 — no commit, no push, no other
   peer path; a failed peer warns and the pass continues).
4. **Inject/update the CLAUDE.md pointer block** (claude-md-injection.md
   content: orientation + atlas/crosslink pointers) LOCALLY **and in each
   linked repo's CLAUDE.md** — in-place block update, never duplicated, user
   content byte-preserved. A peer with no CLAUDE.md gets a minimal file
   containing only the block.
5. **One summary line per repo touched** (what was written / what warned) —
   nothing silent.

## Trace

Runs under orc-wiki's existing trace obligation: a single batch → ONE
end-of-run packet dispatched to the writer. "No crosslink tags in a peer"
remains never a reason to re-scan anything.
