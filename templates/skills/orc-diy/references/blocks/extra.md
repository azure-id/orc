## Phase: Extra — may an executor run OFF Claude?

<!-- diy:when extra=on -->
This flow ALLOWS a foreign executor. Canonical contract:
`.claude/skills/_shared/extra-dispatch.md` — load it before the first dispatch.

Two things must both be true or nothing routes foreign: `config.extra_enabled`
is on, and a route row covers the score. Neither is decided here — **the flow
key decides WHETHER, the resolver decides WHERE**, per task, at run time:

```
orc extra resolve <score> --role executor --risk <n> --json     # 0 foreign · 1 Claude
```

Route rows are deliberately NOT baked into this compiled flow the way the score
table is. The score table is clipped to this flow's session tier, so it is a
compile-time fact; a route row is a ledger the user edits independently, and
`orc diy status` cannot see it change. Baked rows would go stale in silence.

- **`scoring: off`** — this flow pins ONE executor, so there is no score.
  Resolve that agent's **BAND at both edges and require them to agree**; a row
  that covers the band only partially keeps the run on Claude and says so.
- Print the `extra:` preflight line whenever the gate is on, before the first
  dispatch — including on a run where nothing routed foreign. P0:
  `a lane that sends work off Claude without saying so`.
- Dispatch through `orc extra dispatch --task <file> --json` with the IDENTICAL
  slice; validate the return with `return-validation.md` **§2b, not §2**; a
  failure falls back to the Claude band it would have had, announced.
- A cited-risk task never leaves Claude while `extra_risk_tasks` is `off`.
<!-- /diy:when -->
<!-- diy:when extra=off -->
Extra is OFF in this flow. Every executor dispatch stays on Claude.

**This is a decision the compile made, and it OUTRANKS the global setting.** If
`config.extra_enabled` is on, say so once before the first dispatch — Extra is
INERT here, exactly as `opus5_only` is inert in `/orc-quick`, and a shadowed
setting must never be silent. Turning it on globally must never quietly change a
flow the user compiled; that is what this key is for. To route foreign here, run
`orc diy set extra on` and recompile.
<!-- /diy:when -->
