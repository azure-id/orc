<!-- orc-rules:pack id=writing prefix=OSW layer=writing -->

# ORC RULES · Writing (`OSW`)

> **READ-ONLY.** This file ships with ORC and changes only with `orc update`.
> Your own rules go in `.claude/orc/rules.md` (`orc rules add --priority P0
> --text "…"`), and **yours win** wherever the two disagree.

**Applies to** every word an agent writes: wiki docs, analysis reports, plans,
requirement specs, commit bodies, PR descriptions, and what it says in chat.

**Source.** Peter G. Yang — [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop) (MIT) ·
Miqdad Badjuber — [`miqdadbadjuber/anti-slop`](https://github.com/miqdadbadjuber/anti-slop), the `antislop-copywriting` skill (MIT) ·
Matty Cartwright — [The Anti-Slop Writing Rules](https://mattycartwright.com/blog/the-anti-slop-writing-rules).
Full attribution in `CREDITS.md`.

**Tiers.** `HARD` absolute · `PURPOSE` allowed with a written one-line reason ·
`LOCK` a consistency requirement, reported but never blocking.

---

### OSW-01 · HARD · Lead with the point

No throat-clearing opener. Cut "Here's the thing", "Here's what I mean", "Let me
be clear", "I'll be honest", "The uncomfortable truth is". State the point.

Keep a personal aside, a story or an admission when it creates context or
tension. The ban is on the empty run-up, not on character.

### OSW-02 · HARD · No binary contrast

Cut "It's not X, it's Y", "The question isn't X, it's Y", "It's not just X but
Y", and negative listing ("Not a X. Not a Y. A Z."). State Y directly.

"The question isn't the model. It's the eval." becomes "The eval matters more
than the model."

### OSW-03 · HARD · No faux-insight setup

Cut "What nobody tells you", "the part everyone misses", "what most people get
wrong", "this is the part most people skip". The setup flatters the writer and
carries no information. Make the claim stand on its own.

### OSW-04 · LOCK · No colon reveal

A noun phrase, a colon, then a dramatic lowercase reveal is a generated shape:
"The detail that makes it work: a separate agent grades it." Rewrite as a plain
sentence. Colons are for lists, labels and quotes.

### OSW-05 · HARD · No fake-profound kicker, no summary recap

Cut the final "deep" line that turns the point into an aphorism or a mic drop.
Do not rewrite it into a better metaphor. Delete it.

Cut "In conclusion", "Ultimately", "Overall" and the closing paragraph that
restates the piece. End on the last concrete point, the takeaway, or the next
action.

### OSW-06 · HARD · No importance puffery

Cut "marks a pivotal moment", "underscores its significance", "plays a vital
role", "stands as a testament", "solidifies its position". State the fact and
let the reader judge whether it matters.

"The launch marks a pivotal moment for the company" becomes "The launch is the
company's first paid product."

### OSW-07 · HARD · No `-ing` pseudo-analysis

Cut trailing clauses that pretend to explain meaning: "highlighting",
"underscoring", "reflecting", "showcasing", "demonstrating". Replace with the
actual consequence.

"The launch adds file search, highlighting the team's commitment to workflows"
becomes "The launch adds file search, so users find old drafts without leaving
the editor."

### OSW-08 · HARD · No weasel attribution

Cut "experts agree", "studies show", "industry reports suggest", "many argue",
"widely regarded as". Name the source, or cut the claim. If there is no source,
ask. Never invent one.

### OSW-09 · LOCK · No synonym cycling

If the clear word is right, repeat it. Do not rotate terms for style. "The agent
reviews the draft. The assistant scores the piece. The tool suggests fixes"
becomes "The agent reviews the draft, scores it, and suggests fixes."

This matters more in technical writing than anywhere else: a second name for one
thing reads as a second thing.

### OSW-10 · HARD · Banned lexicon

Never use, in any output: delve · leverage · utilize · facilitate · empower ·
streamline · robust · cutting-edge · paradigm shift · game changer · tapestry ·
realm · beacon · multifaceted · meticulous · intricate · paramount ·
transformative · elevate · embark · supercharge · harness · ever-evolving ·
seamless · unleash · pivotal.

Use the plain word. "Utilize" is "use". "Leverage" is "use". "Facilitate" is
"help" or the verb for what actually happens.

Checked by `orc rules lint`.

### OSW-11 · HARD · Banned phrases

Never use: "it's worth noting" · "it's important to note" · "at the end of the
day" · "when it comes to" · "at its core" · "in today's world" · "in the age
of" · "in the world of" · "the reality is" · "the truth is" · "in terms of" ·
"with regard to" · "going forward" · "let's dive in" · "in this article".

Every one of them delays the point by a clause. Delete the clause and keep the
point.

Checked by `orc rules lint`.

### OSW-12 · PURPOSE · Hedge adverbs earn their place

Cut when they add nothing: just · literally · honestly · simply · actually ·
truly · fundamentally · importantly · crucially · inherently · inevitably.

Keep one when it carries real uncertainty, a real contrast, or the writer's own
rhythm. That is the written reason.

### OSW-13 · PURPOSE · Em dash dose cap

This is a **dose rule, not a ban.** The em dash is a real punctuation mark and
ORC's own documentation uses it.

- Short output (a chat answer, a commit body, a CTA, a label): none.
- A long document: at most two per thousand words, and only where the dash
  clearly beats a comma, a period or parentheses.
- Never as a rhythm crutch, and never in clusters.

`orc rules lint` reports **density**, not presence.

### OSW-14 · LOCK · No rule-of-three padding

Three items only when there are three items. Do not invent a third to complete
the cadence, and do not drop a fourth to preserve it.

### OSW-15 · HARD · No staccato drama

Cut "X. And Y. And Z.", "That's it. That's the whole thing.", and stacked punchy
fragments. Use complete sentences. Vary sentence shape only when it helps the
point.

### OSW-16 · HARD · No rhetorical setup

Cut "What if I told you…", "Think about it:", "Plot twist:", and self-answered
"Question? Answer." pairs. Make the point.

### OSW-17 · HARD · No interpretive metadiscourse

Cut lines that step outside the subject to tell the reader what to notice: "That
last part matters more than it sounds", "The key point is", "As you can see",
"This distinction matters", and a redundant "In other words".

If the point is clear, delete the aside. If it is not, add the fact that would
make it clear.

### OSW-18 · LOCK · No formatting slop

- No emoji in a heading (checked by `orc rules lint`).
- No bold sprinkled mid-sentence for emphasis.
- No heading over a two-sentence section.
- No bullet list where two sentences of prose read better.
- No table with one column of real content.

Format follows the content. It does not decorate it.

### OSW-19 · LOCK · Active voice, real actors

"The team shipped it Tuesday" beats "the decision emerged". Never let an
inanimate thing do a human verb: an architecture does not believe, a module does
not want, a decision does not emerge.

Passive voice is allowed when the actor is genuinely unknown or genuinely
irrelevant, and only then.

### OSW-20 · LOCK · The portability test

If a sentence could move unchanged to another project, another company or
another product, it is filler. Replace it with a fact, a mechanism, a
consequence, or a judgement specific to this subject. Otherwise cut it.

### OSW-21 · LOCK · Concrete beats abstract

Names, numbers, dates, file paths, commands, error codes and examples beat
abstractions. "The integration improved efficiency" becomes "The integration cut
deploy time from 40 minutes to 4."

Protect the specific fact. Never smooth a useful detail into generic importance.

### OSW-22 · HARD · A human's paragraph is not yours to restyle

Never rewrite user-authored prose to match this pack. Preserve the writer's
vocabulary, bluntness, humour, digressions and level of polish.

This rule beats every other rule in this file. A pack that flattens the human
voice it was written to protect has failed.

### OSW-23 · HARD · Never invent a specific

No invented number, date, name, version, benchmark or range. No "anywhere from X
to Y" that nothing measured. No filled-in gap presented as a fact.

If the number is needed and unknown, say it is unknown, or ask.

---

## Not a ban — keep these

Never cut, in the name of this pack:

- A load-bearing caveat about scope, risk or uncertainty (see `delivery.md`, OSD-04).
- A named source, a file path, a command, an error code, a version.
- The user's own words, anywhere (OSW-22).
- A hedge that reports real uncertainty rather than decorating a claim.

**Removing slop leaves a void.** The fix for flat prose is never more bans — it
is a fact, a mechanism, or a consequence the reader did not have.
