# Installer footprint and run state

**Read: on demand** — read when touching `orc init/update/doctor`, the install manifest, the prune, or anything under `.claude/orc/run/`.

> Split out of `CLAUDE.md` (project instructions). Same authority as CLAUDE.md.

- **`orc update` owns its footprint (install manifest + prune, v0.29.0).** Every
  install/update writes `.claude/orc/install-manifest.json` (ORC's exact shipped
  file set). On update, files that left the payload (e.g. a renamed agent) are
  pruned — but ONLY paths a previous manifest proves ORC owned; user files,
  `.claude/orc/patterns/`, wiki, configs, run folders are never touched. A
  pre-manifest install never auto-deletes: it warns and offers `orc update
  --prune` — and since v0.34.1 that candidate REPORT also fires when a manifest
  exists (deletion still gated on `--prune`). `orc doctor` is the read-only
  drift report (version skew incl. a stale GLOBAL `~/.claude` that can win skill
  resolution, orphan/missing payload files, settings wiring, trace pointer, diy
  lock); `orc doctor --fix` = update + prune + settings re-merge. See
  `knowledge.md` §4q.

- **Run state lives OUTSIDE the installer's blast radius (v0.34.1).** Run
  artifacts are `.claude/orc/run/{run-slug}/` (config `run_dir`) — NEVER under
  `.claude/skills/orc/`, which the installer replaces. That claim above ("run
  folders are never touched") was false until this release: the manifest bounds
  the prune, not the install copy, and `orc update` / `orc doctor --fix`
  recursively deleted every checkpoint. Legacy state is migrated once, before
  any skill dir is touched. The installer never recursively deletes a skill dir
  now; removing a departed file is the manifest prune's job alone. See
  `knowledge.md` §4q.1.

