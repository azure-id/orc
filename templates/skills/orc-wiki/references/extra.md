# Routing a scan-task off Claude — the two POSITIONS

Load this at the scan phase, once, when `extra_enabled` is true. Canonical
cross-lane prose: `../../_shared/extra-dispatch.md`.

## The row was DEAD until v0.55.0

`/orc-wiki` was declared as routing foreign and asked for a role named `scanner`
in `config.extra_roles` — a spelling that key **refuses by name**, alongside
`wiki-scanner`, which it also does not have. So the lane could never route
however it was configured, and `orc extra lanes` printed
`/orc-wiki → claude` forever with a reason that read like a user's choice.

It is a **POSITION** now, not a role name and not a band. Two of them, one per
tier:

| slot | the Claude agent it displaces |
|---|---|
| `wiki-scanner-deep` | `orc-wiki-scanner-opus-4-8-high` |
| `wiki-scanner-light` | `orc-wiki-scanner-sonnet-5-high` |

Both collapse onto `orc-wiki-scanner-opus-5-med` while `opus5_only` is on, which
is why this adds **no agent and no pair**. Two slots and one Opus 5 agent is not
a contradiction: a slot names the POSITION, not the model.

```
orc extra role set wiki-scanner-light ds/deepseek-chat
orc extra resolve --slot wiki-scanner-light --json     # 0 = extra · 1 = claude
```

**No row on a slot means Claude, and that is an answer rather than a gap.**

## The tier is picked first, and its target is printed with it

Resolve the tier (`wiki_scan_tier`, `references/partial-refresh.md`), then ask
the resolver for **that tier's** slot. The resolved tier already prints; now
print its target on the same block — a cheaper model is never a quiet
substitution, and neither is a different company's:

```
scan-task 3/7   tier LIGHT (small delta, no new surface)
                -> deepseek/deepseek-chat via `ds`  (displaces orc-wiki-scanner-sonnet-5-high)
```

`orc wiki plan` names every scan-task that would run off Claude **before any of
it is paid for**, and **free repairs still come first**: sync → orientation →
crosslink backfill → and only then a paid refresh. A free repair is never
skipped because a cheap model is available.

## Dispatch, validate, recover

```
orc extra dispatch --task <slice.json> --json
```

The slice carries `slot: "wiki-scanner-deep"` or `"wiki-scanner-light"` and
**no `score`** — this lane has none, and both fields together is refused by
name. Everything else about the slice is identical to what the pinned Claude
scanner would receive, including **the kind catalog**
(`references/crosslink-kinds.md`): an agent never shown it invents synonym kinds,
which are permanent duplicates, and that is true of a foreign agent too.

Validate the return with `../../_shared/return-validation.md` **§2b, not §2** — a
foreign worker reports no `actual_model` and that must never be faked. What it
says it read is a CLAIM: the doc body it returns is still anchored, and an
unanchored claim is still omitted rather than guessed.

On a failure, run **`orc extra reconcile <task_id>` FIRST** — free, zero tokens,
and it is what stops the fallback from re-doing work the worktree already
contains. Then `extra_on_failure` decides: `fallback` re-dispatches to **that
tier's pinned Claude agent, by name**, announced, and the scan continues;
`stop` stops.

## What never routes

`orc wiki sync` **never** routes foreign. Registration is 100% derived from doc
headers by the CLI — there is no model in it to replace. The same is true of
`orc wiki plan`, the delta probe, `orc wiki status` and the crosslink registry
walk: they compute, they do not produce.
