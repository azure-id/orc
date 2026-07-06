---
description: View and change ORC config safely — guided menu, writes an update-safe override file
---

Use the **orc-config** skill to view and change ORC's configuration without
hand-editing `config.md`. Three forms:

- no args → show the effective config table (value + whether it's a default or
  your override), then a guided menu to change any setting with a recommended
  value.
- `<key> <value>` → set one key directly (power-user shortcut).
- `reset [key]` → revert one key (or all, if no key) to the shipped default.

Changes are written to the update-safe override file `.claude/orc.config.yaml` —
never to `config.md`, so `orc update` never clobbers them.

Optional: $ARGUMENTS
