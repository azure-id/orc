## Phase: Code-pattern findings

<!-- diy:when pattern=off -->
Code-pattern codification is OFF: executors run language-agnostic (security/
correctness invariants still enforced; conventions imitate neighbor files).
Never prompt about patterns. A cached pattern under `.claude/orc/patterns/`
is still injected if present — cache hits are always silent.
<!-- /diy:when -->
<!-- diy:when pattern=ask -->
On an FE/BE pattern-cache miss at dispatch time, ask the user once: learn the
house style via the `.claude/skills/orc-pattern/SKILL.md` flow, or proceed
language-agnostic. Cache hits are used silently.
<!-- /diy:when -->
<!-- diy:when pattern=on -->
On an FE/BE pattern-cache miss at dispatch time, auto-codify without asking:
run the `.claude/skills/orc-pattern/SKILL.md` flow, then inject the cached
pattern literally into executor slices. Cache hits are used silently.
<!-- /diy:when -->
