# Schema — Crosslink Tag + Needs + Cache (cross-repo boundary index)

The machine-resolvable half of the wiki. Where `wiki/orc-*.md` docs are the
human narrative, crosslink files are a per-integration-point index that another
repo resolves **by tag**. See `references/crosslink.md` for the mechanics; this
file pins the shapes.

**Who writes what.** The tag FILES, needs, and cache are written by `orc-wiki`
(never by a model in a chat, never by the CLI) — they carry scanned contract
prose and evidence anchors, which takes a model. The `crosslink_provided`
registry in the manifest is the exception: it is a derived INDEX of those tag
files, so `orc wiki sync` builds it from their headers and nothing else ever
writes it (staleness.md).

---

## 1. Provider tag file — `wiki/crosslink/<kind>/<slug>.md`

One file per integration point this repo **provides**, emitted proactively at
scan time (whether or not any consumer exists). Committed — a consumer reads it
from a plain sibling checkout. Lives under project-root `wiki/crosslink/`, NOT
`.claude/orc/` (that holds only machine state).

**Slug rule (Windows-safe, reversible):** the tag *identity* string uses `:` as
its separator (`service-c:grpc:billing.v1.CreateInvoice`) but a filename MUST
NOT contain `:`. The on-disk slug replaces every path/separator character:
`/` → `_`, `:` → `.`, space → `_`. `POST /v1/invoices` → `POST__v1_invoices.md`.
The header carries the original `tag` verbatim, so the identity round-trips
without parsing the filename.

```markdown
---
crosslink_schema: 1
tag: grpc:billing.v1.CreateInvoice   # identity WITHOUT the repo prefix (the
                                     # consuming repo prefixes with the node name)
kind: grpc
surface: provided                    # provided | consumed
anchor: internal/billing/create.go:42   # real file+line (evidence-anchored)
content_hash: <short-hash>           # hash of the contract BODY below; moves
                                     # only when the anchored contract changes
scanned_commit: <git-hash>
---

# billing.v1.CreateInvoice

## Contract
<the boundary contract, evidence-anchored: request/response message or
 route shape, field names + types, error codes — pulled from `anchor`.
 A field the scan agent can't see in the anchored file is OMITTED, not guessed.>

## Notes
<auth requirement, idempotency, versioning — anything a caller must honor.>
```

`content_hash` is the drift axis: it is the hash of the `## Contract` body, and
it is refreshed whenever the anchored source file's recorded per-file hash moves
(the same per-file hashing the wiki already records at scan time).
A consumer compares its cached copy's `content_hash` against the provider's
current one — equal = clean, different = drifted, file gone = breaking change.

---

## 2. Provider registry — `crosslink_provided` in `wiki-meta.json`

A sibling array in the manifest, alongside `docs`, derived by `orc wiki sync`
from the tag-file headers — never hand-maintained. Per-point tag files are a
machine index, NOT prose docs — they must NOT enter `wiki/INDEX.md` or the `docs`
registry (that would corrupt the human index and the `pages` count); sync
enforces that by construction, since it only ever reads `wiki/crosslink/` into
this array. Shape:

```json
{
  "docs": [ ... ],
  "crosslink_provided": [
    {
      "tag": "grpc:billing.v1.CreateInvoice",
      "kind": "grpc",
      "file": "wiki/crosslink/grpc/billing.v1.CreateInvoice.md",
      "anchor": "internal/billing/create.go:42",
      "content_hash": "<short-hash>"
    }
  ]
}
```

The integrity self-check gains one crosslink rule (integrity-check.md): every
file under `wiki/crosslink/` has exactly one `crosslink_provided` entry and vice
versa; each entry's `anchor` file exists. `crosslink_provided` absent = this repo
publishes no boundary (fine — most repos do until the first scan after adopting
crosslink).

---

## 3. Consumer needs manifest — `.claude/orc/crosslink/needs.json`

Machine-authored by `orc-wiki` (NOT the CLI). The per-point tags THIS repo
actually depends on — the drift baseline. Committed (it is the record of what we
build against). Populated by walking call sites and matching them to linked
repos from `orc-crosslink.config.yaml`; the human never hand-lists tags.

```json
{
  "version": 1,
  "needs": [
    {
      "node": "service-z-be",              // linked repo (from the config)
      "tag": "grpc:billing.v1.CreateInvoice",
      "via": "grpc",
      "discovered_at": "svc/pay.go:31"     // OUR call site that created the need
    }
  ]
}
```

---

## 4. Consumer cache — `.claude/orc/crosslink/cache/<node>/<kind>/<slug>.md`

Machine-authored mirror of the provider tag files this repo needs. **Gitignored**
— derived and regenerable. The durable source of record when the provider is not
checked out. Each cached file is the provider's tag file verbatim PLUS a sync
stamp block appended at the top:

```markdown
<!-- crosslink-sync
synced_at: 12-07-2026            # date we mirrored it (Signal-B age axis)
source_node: service-z-be
source_content_hash: <short-hash>   # provider content_hash AT sync (drift baseline)
source_tier: FRESH                  # provider wiki tier computed AT sync (Signal-A fallback)
source_scan_commit: <git-hash>      # provider scan_commit AT sync
-->
--- <the provider tag file, verbatim> ---
```

The stamp is a **fallback input to a computation**, never a stored status: the
effective tier is always computed on read (`min(Signal-A, Signal-B)` —
references/crosslink.md §freshness). `synced_at` drives Signal-B against
`crosslink_fresh_days` / `crosslink_aging_days`; `source_tier` is the Signal-A
fallback used only when the provider checkout is unavailable.
