# Rule pack — Frontend Performance (impact-ordered, capped)

NOT a language playbook — a reviewer re-check pack. The orchestrator passes
these rules as `fe_rules[]` when the run touched FE files; the reviewer checks
ONLY the diff against them and emits **file:line** findings classified P1–P3 by
real impact (a perf rule hit is never automatic P0 — invariants own P0).

Deliberately capped at 15 rules, ordered by REAL impact (network waterfalls and
bundle weight first, micro-optimizations last). Do NOT extend ad hoc.

## Rules (impact-ordered)

1. No request waterfalls: sequential awaits on independent fetches → parallelize
   (`Promise.all`, parallel loaders, RSC composition). *(usually P1)*
2. No data fetching inside a render loop — N items must not mean N requests
   (batch or lift the fetch). *(P1)*
3. No barrel-file imports of heavy libraries (`import { x } from "lodash"` /
   whole-icon-pack imports) — import the specific module. *(P1)*
4. Heavy, conditionally-shown components are lazy-loaded (dynamic import /
   route-level splitting), not bundled into the initial path. *(P1)*
5. No new heavy dependency for something the platform/stdlib/project already
   does (date-fns for one format call, lodash for a map). *(P2)*
6. Images sized + lazy: explicit dimensions (no layout shift), `loading="lazy"`
   below the fold, modern format via the project's image pipeline. *(P2)*
7. Lists render with stable keys and, when large (100+ rows), windowing or
   pagination — never an unbounded DOM. *(P2)*
8. No O(n²)+ work or heavy transforms in the render path — precompute, memoize,
   or move server-side. *(P2)*
9. Effects don't cascade renders: no setState loops in effects, no unstable
   deps re-firing every render. *(P2)*
10. Event handlers on scroll/resize/input are throttled/debounced or passive. *(P2)*
11. Web-font usage bounded: subsetted/self-hosted per project convention,
    `font-display` set, no new render-blocking font chains. *(P3)*
12. No layout thrash: batched reads/writes of layout properties; animations use
    transform/opacity, not top/left/width. *(P3)*
13. Memoization where props are referentially unstable and the subtree is
    expensive — and NOT where it's noise. *(P3)*
14. Third-party scripts loaded async/deferred, never synchronously in `<head>`. *(P3)*
15. Polyfills/shims not duplicated for platforms the project no longer targets. *(P3)*
