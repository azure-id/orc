# Code-pattern pre-warm (opt-in — config `orc_wiki_pattern_findings: on`)

Default OFF. When on, after Phase 3 also **codify the code-pattern for every
detected FE/BE language** as a scan byproduct — pre-warming
`.claude/orc/patterns/<lang>-pattern.md` so later `/orc` runs never hit the
`pattern_findings` prompt.

Rules:

- Rides the wiki's existing scan-consent, so there is NO separate ask (hence
  on/off only, no `ask` value).
- Per detected language (`../../orc-pattern/references/INDEX.md`): dispatch
  `orc-pattern-codifier-sonnet-5-high` with the generic playbook + the
  most-recently-modified real files; YOU write the returned pattern to the
  cache.
- Never run tests or change project code; skip languages already cached and
  un-drifted.
- Reuses the `orc-pattern` engine — you never codify yourself.
