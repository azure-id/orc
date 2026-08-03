# Reference — the per-layer GREEN GATE (mandatory)

Loaded at Phase D2, run once per layer and again after every rebase above a
changed layer.

**Rule: no layer is submitted, pushed or merged until its own gate is green at
its OWN base.** Never `git commit --no-verify`. Never `gh stack submit` over a red
layer. "Green when the whole stack is applied" is not green.

## The ladder — all four steps, in order, per layer

Detect the stack from the repo (never ask what the repo can tell you) and run the
four rungs. The commands below are the common shapes; the repo's own scripts win.

| # | Rung | Go | Node/TS | Java/Kotlin | Python | Rust |
|---|------|----|---------|-------------|--------|------|
| 1 | **build** at this layer's base | `go build ./...` | `npm run build` | `./gradlew compileJava` / `mvn -q compile` | `python -m compileall` / type-check | `cargo build` |
| 2 | **tests** for the layer's scope | `go test ./<pkgs>/...` | `npm test -- <paths>` | `./gradlew test --tests …` | `pytest <paths>` | `cargo test <filter>` |
| 3 | **lint scoped to THIS layer's base** | `golangci-lint run --new-from-rev <base> ./<pkgs>/...` | `eslint <changed files>` | `./gradlew checkstyleMain` / detekt | `ruff check <paths>` | `cargo clippy -- -D warnings` |
| 4 | **the repo's own pre-commit hooks, unbypassed** | `git commit` (hooks run) | same | same | same | same |

Mocks/codegen first when the project needs them (`mockery`, `go generate`,
`protoc`, `npm run codegen`) — a missing generated file reads as a compile error
and sends you hunting the wrong thing. Platform quirks belong here too: e.g. on
macOS, Go tests that monkey-patch need `GOARCH=amd64 … -gcflags=all=-l`.

Any rung red → **stop, fix, re-run the whole ladder from rung 1** for that layer.
Do not proceed to the next layer. Do not push.

## Attribution — the stacked-specific trap

Many repos pin their linter's "new code" baseline to the trunk (e.g.
`issues.new-from-rev: origin/main` in `.golangci.yml`). On layer 4 that flags
layers 1–3's diff too: noisy and **misattributed**. Override per layer with
`--new-from-rev <that layer's base>` (or the equivalent) so each layer is judged
on **its own** diff.

## Code-quality scans (SonarQube and friends) are a STACK-LEVEL gate

A scan that analyzes the project key directly, with no PR decoration, measures
the **cumulative** L1..LN diff against the trunk — not layer N's diff. So:

- per-layer new-code coverage from such a scan is **not a trustworthy per-layer
  signal** — verify coverage locally, per layer;
- treat the scan as a **stack-level** gate;
- a scan reported as `SKIPPED` on a layer usually means that layer's test job
  failed first — the gate never ran. Read it as red, not as flaky.

Keep each layer's tests **with its code** for exactly this reason: a FOUNDATION
layer with no tests can red-gate on its own coverage rule.

## Dead-code / `unused` on a FOUNDATION layer — a P0 QUESTION, never auto-fixed

Linters flag declared-but-unreferenced identifiers (Go's `unused`, TS
`noUnusedLocals`, Rust `dead_code`) even when the compiler is happy. A FOUNDATION
layer that declares something only a LATER layer calls will go RED. **That is a
real signal about the seam**, so stop and ask:

```
L2 declares repo.FindByRef()
L4 (handler) is its only caller
lint --new-from-rev <L2 base>: unused → RED

ASK: [a] merge L2 into L4 (one layer, no dead code)          ← recommended
     [b] keep the split, land the first caller in L2
     [c] accept it: one suppression, with a reason naming the consumer layer
         (user override only)
```

Never silently add a suppression, never invent a fake caller, never delete the
identifier to go green. Record the answer under the plan's `## Decisions`.

## Re-verification after ANY lower-layer change (the rule people get wrong)

Amending layer N rewrites every branch above it, so previously-green upper layers
can go red:

```
amend L2  →  gh stack rebase --upstack
for layer in L2..Ltop, bottom-up:
    run the FULL ladder (codegen + build + tests + lint + hooks)
    RED → stop, fix, restart from that layer
all green → gh stack push  /  gh stack submit
```

The same applies after `gh stack sync` when the trunk moves, and after
`gh stack modify` (insert / reorder / drop / combine).

## Merge-time gate

Bottom-up only. Before `gh stack merge`, confirm the layer's own CI is green
(`gh stack view --json` + `gh pr view <n> --json statusCheckRollup`); after each
merge, confirm the upper layers auto-retargeted and their CI re-ran.

## Gate red flags

| Excuse | Reality |
|---|---|
| "Tests pass on the top layer, the stack is fine" | The gate is per-layer at its own base. Merging L1 alone must not break the trunk. |
| "The build is clean, lint is cosmetic" | Lint blocks the repo's pre-commit hook. Clean build ≠ committable. |
| "I'll `--no-verify` and fix lint in a follow-up" | Forbidden. The hooks are the gate; bypassing means the PR cannot land. |
| "It was green before the rebase" | A rebase rewrites every upper branch. Re-run the ladder at every tip above the change. |
| "`unused` is a false positive — the caller is in layer 4" | It is a TRUE positive about layer 2 *as a standalone PR*. That is the P0 question, not a suppression. |
| "The scan says new coverage is fine on layer 3" | Layer 3's scan measures L1..L3 cumulatively. Verify per-layer coverage locally. |
| "The scan was SKIPPED — it's flaky" | The layer's test job failed first; the gate never ran. Red. |
