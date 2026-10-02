---
description: Fastest lane — knowledge-gated single Sonnet 5 medium executor; needs fresh wiki + pattern cache, else falls back to orc-mini
---

Use the **orc-fast** skill. It needs a fresh project wiki AND a cached
code-pattern for the request's language; either missing → it falls back to
orc-mini with the request carried over. Then one Sonnet 5 medium executor, a
build+test smoke gate, and ship.

Request: $ARGUMENTS
