<!-- orc-rules:pack id=ui prefix=OSU layer=ui -->

# ORC RULES · UI (`OSU`)

> **READ-ONLY.** This file ships with ORC and changes only with `orc update`.
> Your own rules go in `.claude/orc/rules.md`, and **yours win** wherever the two
> disagree.

**Applies to** front-end work only. This pack rides **per task**, never per lane:
the orchestrator adds it to a slice whose declared files are front-end. A UI rule
in a backend slice is tokens paid for nothing.

**This is a filter, not a style guide.** It prescribes no colour, no typeface and
no layout. It rejects **technique without purpose**. Where the project has a
design direction — a `DESIGN.md`, a brand guide, a design system — that
direction is the identity and this pack only filters on top of it. A bold palette
is identity. A blue-to-purple gradient chosen because it was the default is slop.

**Source.** Miqdad Badjuber — [`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop), rules R-01 to R-38 (MIT).
Full attribution in `CREDITS.md`.

---

### OSU-01 · HARD · No dead controls

Every interactive element does something real, or it does not exist:

- a link or button that reaches a destination that exists
- a modal that opens and closes, and closes on `Escape`
- a toggle that changes state
- an external action (`mailto:`, a real URL)
- a form that submits and shows feedback

A button that does nothing is a defect, not decoration. A nav item pointing at a
section that does not exist is the same defect. If it cannot have a destination
yet, remove it, or label it "Coming soon" **and** leave a `TODO` that names the
task (`OSC-05`).

### OSU-02 · HARD · Three states minimum

Any view that displays data has an **empty** state, a **loading** state and an
**error** state. A UI built only for the ideal condition is not finished.

These are not extras. They are part of the view.

### OSU-03 · HARD · Accessible by default

- WCAG AA contrast: 4.5:1 for body text, 3:1 for large text (18px+). Test across
  the whole area the text crosses, not one point.
- Every interactive element reachable with `Tab` and `Shift+Tab`, in visual
  order, and operable with `Enter` or `Space`.
- Every focused element has a visible focus indicator.
- Never `outline: none` or `outline: 0` without a better replacement.

A UI that needs a mouse is unfinished.

Partly checked by `orc rules lint` (`outline: none` with no replacement).

### OSU-04 · HARD · Real content or an honest placeholder

No fabricated testimonial, statistic, customer logo, team member, review, or
security or compliance claim. No number without a real source.

A placeholder is written as what it is: `[REAL DATA]`, `[LOGO]`, "Coming soon".
Never disguised as final.

**An empty section beats a fabricated one.** If there are no testimonials, there
is no testimonials section.

### OSU-05 · LOCK · No generic CTA

"Get Started", "Learn More", "Try Now", "Explore", "Discover" name no action.
Name the action: "Start the free trial", "Watch the 2-minute demo", "Create an
account".

### OSU-06 · HARD · No buzzword UI copy

Never in shipped interface text: "AI Powered" · "Next Generation" ·
"Revolutionary" · "Seamless" · "Cutting Edge" · "Intelligent" · "Ultimate" ·
"Powerful" · "Effortless" · "Supercharged".

Say what it does. Show evidence, not adjectives.

Checked by `orc rules lint`.

### OSU-07 · PURPOSE · Decoration needs a written reason

Each of these is **allowed** and fails only as an unexplained default. Write the
one-line reason it serves hierarchy, identity or readability:

- gradient as a primary colour (blue→purple, blue→cyan, purple→pink especially)
- glassmorphism · **dose cap: at most two elements**, never navbar + cards +
  modal + sidebar together
- glow · **dose cap: at most two elements**
- capsule badge with no real status behind it
- a button arrow as every button's identity
- grid, dot, blueprint or graph-paper background
- sparkle, star, magic, lightning, diamond, orb or robot as a feature icon
- an animation stack (fade-up + float + scale + bounce) on everything
- a generic illustration set with no connection to the product

A gradient that separates one level of hierarchy from another is craft. The same
gradient covering the page is slop. The technique is not the problem.

### OSU-08 · LOCK · Do not clone a named product

Do not build a visual that copies another product's look unless the user asked
for it by name. References are inspiration, not a template.

Models default to cloning the products that dominate their training data. Notice
when that is what is happening.

### OSU-09 · HARD · Mobile is part of the design

No horizontal overflow. Text stays inside its container. Cards do not collide or
clip. The navbar stays usable. Tap targets meet 44px. Spacing stays consistent
across breakpoints.

Responsiveness is not an add-on and not a follow-up task.

### OSU-10 · HARD · Every decision has a one-line reason

Before calling a UI done, write one line for each major decision: why this
colour, this layout, this typeface, this spacing, this card, this icon.

If the reason cannot be written in one line, the decision is not settled. This
is the keystone of the pack — it is what `OSU-07` checks against, and it is the
whole mechanism by which "technique with purpose" is distinguishable from
"technique by default".

---

## Not a ban — keep these

- Anything the project's own design direction specifies. Identity is not slop.
- A technique with its reason written. That is the pass condition, not an
  exception to it.
- A deliberate uniform layout, when uniformity is the stated choice rather than
  the default that happened.
