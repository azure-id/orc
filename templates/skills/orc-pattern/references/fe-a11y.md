# Rule pack — Frontend Accessibility (impact-ordered, capped)

NOT a language playbook — a reviewer re-check pack. The orchestrator passes
these rules as `fe_rules[]` when the run touched FE files; the reviewer checks
ONLY the diff against them and emits **file:line** findings classified P1–P3 by
real user impact (an a11y rule hit is never automatic P0 — invariants own P0).

Deliberately capped at 15 rules, highest-impact first. Do NOT extend ad hoc —
a 100-rule sweep per FE slice buries real findings and blows the review context.

## Rules (impact-ordered)

1. Interactive elements are REAL controls — `<button>`/`<a>`/`<input>`, not
   `div onClick` (keyboard + AT reachability). *(usually P1)*
2. Every form input has a programmatic label (`<label for>`, `aria-label`, or
   `aria-labelledby`) — placeholder text is not a label. *(P1)*
3. Keyboard path exists for every new flow: focusable, Enter/Space activates,
   no positive `tabindex`, no keyboard trap. *(P1)*
4. Focus is managed on view changes: modals trap + restore focus; route changes
   move focus to the new content. *(P1)*
5. Images: meaningful images have real `alt`; decorative ones have `alt=""` —
   never a missing attribute. *(P2)*
6. Color is never the only signal (error states, required fields, chart series
   also get text/icon/pattern). *(P2)*
7. Text contrast meets 4.5:1 (3:1 for large text) against its actual background. *(P2)*
8. Heading levels are hierarchical — no skipped levels, one `<h1>` per view. *(P2)*
9. Dynamic status updates announce via `role="status"`/`aria-live` (loading,
   save confirmations, async errors). *(P2)*
10. Disabled/loading states communicated to AT (`aria-disabled`, `aria-busy`),
    not just styled. *(P2)*
11. Touch targets ≥ 44×44 CSS px on new interactive elements. *(P2)*
12. `prefers-reduced-motion` respected for new animations/transitions. *(P3)*
13. Semantic landmarks for new page regions (`<nav>`, `<main>`, `<aside>`)
    instead of bare divs. *(P3)*
14. Language of parts: content in another language gets a `lang` attribute. *(P3)*
15. Autocomplete attributes on common personal fields (name, email, address). *(P3)*
