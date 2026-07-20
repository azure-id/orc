# orc-poly — worked example (orient only; never execute from this)

A mock run to show the shape of a poly-repo plan. Values are illustrative.

**Setup.** The user is in `C:\dev\shop-api` (HOST, backend). The change: *add a
"saved carts" feature* — a new `GET /carts/saved` endpoint (BE) and a new
"Saved carts" screen (FE) that lists them. They run `/orc-poly` and paste the
PEER path `C:\dev\shop-web`.

**P0 — Intake.** HOST = `shop-api` (owns the endpoint). PEER = `shop-web` (owns
the screen, consumes the endpoint). Slug = `saved-carts`.

**P1 — Knowledge gate.**
- `orc wiki status` in HOST → present, FRESH. `WIKI-CONSULT tier=FRESH ::
  shop-api`.
- Reads `C:\dev\shop-web\wiki\wiki-meta.json` directly → AGING.
  `WIKI-CONSULT tier=AGING :: shop-web`. `GATE knowledge shop-api=wiki
  shop-web=wiki`.
- Both have wikis → reads each repo's crosslink boundary tags: shop-web already
  consumes `GET /carts` from shop-api, so the new endpoint extends a known seam.

**P2 — Recon + gather.** Reads `shop-api/src/routes/carts.ts` and
`shop-web/src/features/cart/` (read-only). Open questions asked in one batch:
response pagination? (yes, cursor) · empty state? (FE shows "No saved carts")
· auth? (same bearer token as `/carts`) · does `saved` reuse the `Cart` type?
(yes, plus a `savedAt` field). All pinned.

**P3 — Doc set** written to `shop-api/poly-repo-implementation/saved-carts/`:
- `poly-context.md` — the change, both repos' roles + touch points, decisions.
- `interface-contract.md` — froze `GET /carts/saved`: request (bearer,
  `?cursor`), response (`{ items: Cart[] & { savedAt }, nextCursor }`), `401`
  unauth, `200` empty → `{ items: [], nextCursor: null }`. Additive, no
  breaking change.
- `poly-spec.md` — `orc-poly:spec v1`, `repos[]` = shop-api (host, R1: add the
  endpoint) + shop-web (peer, R2: add the screen), each `contract_ref` pointing
  at the frozen response shape.

**P4 — Iterate.** User picks **1) Pass to orc-plan**.

**P5 — Split.** `DISPATCH orc-planner :: poly saved-carts`. The planner emits:
- `shop-api/poly-repo-implementation/saved-carts/shop-api-implementation-plan.md`
- `shop-web/poly-repo-implementation/saved-carts/shop-web-implementation-plan.md`
  (written INTO the peer — the only peer write)

both embedding the frozen `interface-contract.md`. `VERIFY planner
actual=opus-4-8/medium ✅ MATCH`. `FINISH`.

**Handoff.** orc-poly tells the user: open `shop-api` and run `/orc` on its
plan; separately open `shop-web` in a fresh session and run `/orc` on its plan.
Both plans pin the same contract, so the FE screen and the BE endpoint fit on
the first try. orc-poly built nothing itself.
