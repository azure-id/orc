"use strict";
/**
 * fixtures/rules.js — the anti-slop rule surface.
 *
 * CAPTURED FROM THE REAL CLI (`orc rules --json` and `orc rules lint --json`)
 * against a throwaway project, with the paths rewritten afterwards. That is
 * deliberate: a fixture that has drifted from the CLI is worse than no fixture,
 * and the only honest way to carry 65 rules with their real bodies and their
 * real credit table is to take them from the files that ship.
 *
 * The STATE it carries is the one you cannot reach on a clean install: a ledger
 * with all three priorities filled, ONE override that switches a real rule off,
 * and a lint run with findings in both prose and code plus a suppressed check.
 * Every card on the panel renders something, including the ugly ones.
 */

module.exports.rules = {
  "ok": true,
  "line": "ORC 65 (W 23 · C 22 · D 10 · U 10) · yours 5 lines (P0 2 · P1 2 · P2 1) · 1 override",
  "orc": {
    "dir": "/home/you/acme-api/.claude/skills/_shared/rules",
    "source": "installed",
    "read_only": true,
    "count": 65,
    "packs": [
      {
        "id": "writing",
        "file": "/home/you/acme-api/.claude/skills/_shared/rules/writing.md",
        "prefix": "OSW",
        "layer": "writing",
        "title": "Writing",
        "readable": true,
        "count": 23,
        "tiers": {
          "HARD": 14,
          "PURPOSE": 2,
          "LOCK": 7
        }
      },
      {
        "id": "code",
        "file": "/home/you/acme-api/.claude/skills/_shared/rules/code.md",
        "prefix": "OSC",
        "layer": "code",
        "title": "Code",
        "readable": true,
        "count": 22,
        "tiers": {
          "HARD": 17,
          "PURPOSE": 4,
          "LOCK": 1
        }
      },
      {
        "id": "delivery",
        "file": "/home/you/acme-api/.claude/skills/_shared/rules/delivery.md",
        "prefix": "OSD",
        "layer": "core",
        "title": "Delivery",
        "readable": true,
        "count": 10,
        "tiers": {
          "HARD": 7,
          "PURPOSE": 0,
          "LOCK": 3
        }
      },
      {
        "id": "ui",
        "file": "/home/you/acme-api/.claude/skills/_shared/rules/ui.md",
        "prefix": "OSU",
        "layer": "ui",
        "title": "UI",
        "readable": true,
        "count": 10,
        "tiers": {
          "HARD": 7,
          "PURPOSE": 1,
          "LOCK": 2
        }
      }
    ],
    "rules": [
      {
        "id": "OSW-01",
        "tier": "HARD",
        "title": "Lead with the point",
        "pack": "writing",
        "prefix": "OSW",
        "body": "No throat-clearing opener. Cut \"Here's the thing\", \"Here's what I mean\", \"Let me\nbe clear\", \"I'll be honest\", \"The uncomfortable truth is\". State the point.\n\nKeep a personal aside, a story or an admission when it creates context or\ntension. The ban is on the empty run-up, not on character."
      },
      {
        "id": "OSW-02",
        "tier": "HARD",
        "title": "No binary contrast",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut \"It's not X, it's Y\", \"The question isn't X, it's Y\", \"It's not just X but\nY\", and negative listing (\"Not a X. Not a Y. A Z.\"). State Y directly.\n\n\"The question isn't the model. It's the eval.\" becomes \"The eval matters more\nthan the model.\""
      },
      {
        "id": "OSW-03",
        "tier": "HARD",
        "title": "No faux-insight setup",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut \"What nobody tells you\", \"the part everyone misses\", \"what most people get\nwrong\", \"this is the part most people skip\". The setup flatters the writer and\ncarries no information. Make the claim stand on its own."
      },
      {
        "id": "OSW-04",
        "tier": "LOCK",
        "title": "No colon reveal",
        "pack": "writing",
        "prefix": "OSW",
        "body": "A noun phrase, a colon, then a dramatic lowercase reveal is a generated shape:\n\"The detail that makes it work: a separate agent grades it.\" Rewrite as a plain\nsentence. Colons are for lists, labels and quotes."
      },
      {
        "id": "OSW-05",
        "tier": "HARD",
        "title": "No fake-profound kicker, no summary recap",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut the final \"deep\" line that turns the point into an aphorism or a mic drop.\nDo not rewrite it into a better metaphor. Delete it.\n\nCut \"In conclusion\", \"Ultimately\", \"Overall\" and the closing paragraph that\nrestates the piece. End on the last concrete point, the takeaway, or the next\naction."
      },
      {
        "id": "OSW-06",
        "tier": "HARD",
        "title": "No importance puffery",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut \"marks a pivotal moment\", \"underscores its significance\", \"plays a vital\nrole\", \"stands as a testament\", \"solidifies its position\". State the fact and\nlet the reader judge whether it matters.\n\n\"The launch marks a pivotal moment for the company\" becomes \"The launch is the\ncompany's first paid product.\""
      },
      {
        "id": "OSW-07",
        "tier": "HARD",
        "title": "No `-ing` pseudo-analysis",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut trailing clauses that pretend to explain meaning: \"highlighting\",\n\"underscoring\", \"reflecting\", \"showcasing\", \"demonstrating\". Replace with the\nactual consequence.\n\n\"The launch adds file search, highlighting the team's commitment to workflows\"\nbecomes \"The launch adds file search, so users find old drafts without leaving\nthe editor.\""
      },
      {
        "id": "OSW-08",
        "tier": "HARD",
        "title": "No weasel attribution",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut \"experts agree\", \"studies show\", \"industry reports suggest\", \"many argue\",\n\"widely regarded as\". Name the source, or cut the claim. If there is no source,\nask. Never invent one."
      },
      {
        "id": "OSW-09",
        "tier": "LOCK",
        "title": "No synonym cycling",
        "pack": "writing",
        "prefix": "OSW",
        "body": "If the clear word is right, repeat it. Do not rotate terms for style. \"The agent\nreviews the draft. The assistant scores the piece. The tool suggests fixes\"\nbecomes \"The agent reviews the draft, scores it, and suggests fixes.\"\n\nThis matters more in technical writing than anywhere else: a second name for one\nthing reads as a second thing."
      },
      {
        "id": "OSW-10",
        "tier": "HARD",
        "title": "Banned lexicon",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Never use, in any output: delve · leverage · utilize · facilitate · empower ·\nstreamline · robust · cutting-edge · paradigm shift · game changer · tapestry ·\nrealm · beacon · multifaceted · meticulous · intricate · paramount ·\ntransformative · elevate · embark · supercharge · harness · ever-evolving ·\nseamless · unleash · pivotal.\n\nUse the plain word. \"Utilize\" is \"use\". \"Leverage\" is \"use\". \"Facilitate\" is\n\"help\" or the verb for what actually happens.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSW-11",
        "tier": "HARD",
        "title": "Banned phrases",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Never use: \"it's worth noting\" · \"it's important to note\" · \"at the end of the\nday\" · \"when it comes to\" · \"at its core\" · \"in today's world\" · \"in the age\nof\" · \"in the world of\" · \"the reality is\" · \"the truth is\" · \"in terms of\" ·\n\"with regard to\" · \"going forward\" · \"let's dive in\" · \"in this article\".\n\nEvery one of them delays the point by a clause. Delete the clause and keep the\npoint.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSW-12",
        "tier": "PURPOSE",
        "title": "Hedge adverbs earn their place",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut when they add nothing: just · literally · honestly · simply · actually ·\ntruly · fundamentally · importantly · crucially · inherently · inevitably.\n\nKeep one when it carries real uncertainty, a real contrast, or the writer's own\nrhythm. That is the written reason."
      },
      {
        "id": "OSW-13",
        "tier": "PURPOSE",
        "title": "Em dash dose cap",
        "pack": "writing",
        "prefix": "OSW",
        "body": "This is a **dose rule, not a ban.** The em dash is a real punctuation mark and\nORC's own documentation uses it.\n\n- Short output (a chat answer, a commit body, a CTA, a label): none.\n- A long document: at most two per thousand words, and only where the dash\n  clearly beats a comma, a period or parentheses.\n- Never as a rhythm crutch, and never in clusters.\n\n`orc rules lint` reports **density**, not presence."
      },
      {
        "id": "OSW-14",
        "tier": "LOCK",
        "title": "No rule-of-three padding",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Three items only when there are three items. Do not invent a third to complete\nthe cadence, and do not drop a fourth to preserve it."
      },
      {
        "id": "OSW-15",
        "tier": "HARD",
        "title": "No staccato drama",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut \"X. And Y. And Z.\", \"That's it. That's the whole thing.\", and stacked punchy\nfragments. Use complete sentences. Vary sentence shape only when it helps the\npoint."
      },
      {
        "id": "OSW-16",
        "tier": "HARD",
        "title": "No rhetorical setup",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut \"What if I told you…\", \"Think about it:\", \"Plot twist:\", and self-answered\n\"Question? Answer.\" pairs. Make the point."
      },
      {
        "id": "OSW-17",
        "tier": "HARD",
        "title": "No interpretive metadiscourse",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Cut lines that step outside the subject to tell the reader what to notice: \"That\nlast part matters more than it sounds\", \"The key point is\", \"As you can see\",\n\"This distinction matters\", and a redundant \"In other words\".\n\nIf the point is clear, delete the aside. If it is not, add the fact that would\nmake it clear."
      },
      {
        "id": "OSW-18",
        "tier": "LOCK",
        "title": "No formatting slop",
        "pack": "writing",
        "prefix": "OSW",
        "body": "- No emoji in a heading (checked by `orc rules lint`).\n- No bold sprinkled mid-sentence for emphasis.\n- No heading over a two-sentence section.\n- No bullet list where two sentences of prose read better.\n- No table with one column of real content.\n\nFormat follows the content. It does not decorate it."
      },
      {
        "id": "OSW-19",
        "tier": "LOCK",
        "title": "Active voice, real actors",
        "pack": "writing",
        "prefix": "OSW",
        "body": "\"The team shipped it Tuesday\" beats \"the decision emerged\". Never let an\ninanimate thing do a human verb: an architecture does not believe, a module does\nnot want, a decision does not emerge.\n\nPassive voice is allowed when the actor is genuinely unknown or genuinely\nirrelevant, and only then."
      },
      {
        "id": "OSW-20",
        "tier": "LOCK",
        "title": "The portability test",
        "pack": "writing",
        "prefix": "OSW",
        "body": "If a sentence could move unchanged to another project, another company or\nanother product, it is filler. Replace it with a fact, a mechanism, a\nconsequence, or a judgement specific to this subject. Otherwise cut it."
      },
      {
        "id": "OSW-21",
        "tier": "LOCK",
        "title": "Concrete beats abstract",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Names, numbers, dates, file paths, commands, error codes and examples beat\nabstractions. \"The integration improved efficiency\" becomes \"The integration cut\ndeploy time from 40 minutes to 4.\"\n\nProtect the specific fact. Never smooth a useful detail into generic importance."
      },
      {
        "id": "OSW-22",
        "tier": "HARD",
        "title": "A human's paragraph is not yours to restyle",
        "pack": "writing",
        "prefix": "OSW",
        "body": "Never rewrite user-authored prose to match this pack. Preserve the writer's\nvocabulary, bluntness, humour, digressions and level of polish.\n\nThis rule beats every other rule in this file. A pack that flattens the human\nvoice it was written to protect has failed."
      },
      {
        "id": "OSW-23",
        "tier": "HARD",
        "title": "Never invent a specific",
        "pack": "writing",
        "prefix": "OSW",
        "body": "No invented number, date, name, version, benchmark or range. No \"anywhere from X\nto Y\" that nothing measured. No filled-in gap presented as a fact.\n\nIf the number is needed and unknown, say it is unknown, or ask."
      },
      {
        "id": "OSC-01",
        "tier": "HARD",
        "title": "A comment never restates the code",
        "pack": "code",
        "prefix": "OSC",
        "body": "Delete a comment that repeats what the next line, the declaration or the\nsignature already shows: `// Initialize the variable` above `let count = 0`,\n`// User class` above `class User {}`, `const userAge = 25; // User age is 25`.\n\nIt doubles the reading load and adds nothing. Remove the comment. Leave the code."
      },
      {
        "id": "OSC-02",
        "tier": "HARD",
        "title": "No decorative separator",
        "pack": "code",
        "prefix": "OSC",
        "body": "No banner built from repeated characters, no ALL-CAPS section label, no\nbox-drawn header: `// ==========`, `// -------- WORKFLOW --------`,\n`/* ---- ROUTES ---- */`.\n\nThe decoration is the message, and the message is \"generated\". Use one plain\nline, or nothing.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSC-03",
        "tier": "HARD",
        "title": "No workflow narration",
        "pack": "code",
        "prefix": "OSC",
        "body": "No `// Step 1: Validate input`, `// Step 2: Process`, `// First…`, `// Next…`,\n`// Finally…`. The control flow is already visible.\n\nIf the flow is genuinely hard to follow, that is a structure problem, not a\nmissing comment.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSC-04",
        "tier": "HARD",
        "title": "No empty label",
        "pack": "code",
        "prefix": "OSC",
        "body": "No `// Main logic`, `// Core logic`, `// Business logic`, `// Helper function`,\n`// Entry point`, `// Error handling`, `// Note: this is important`,\n`// Important: please read`.\n\nThe label names a category, not a fact. \"Note: retries happen only on 5xx\" earns\nits place. \"Note: this is important\" does not.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSC-05",
        "tier": "HARD",
        "title": "A TODO names a task",
        "pack": "code",
        "prefix": "OSC",
        "body": "No `// TODO: improve this`, `// Future improvements`, `// Additional\noptimization can be added here`, `// Add more validation`.\n\nA vague TODO names a feeling, not a task. Keep a TODO only when it says what to\ndo and carries enough context to act on. Otherwise delete it.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSC-06",
        "tier": "HARD",
        "title": "No decorative emoji in code",
        "pack": "code",
        "prefix": "OSC",
        "body": "No emoji as decoration in a comment, a log line or an identifier: `// ✅\nValidation`, `// 🚀 Performance`, `// 🔒 Security`. Emoji is visual noise in\nsource, and that exact set is the generated vocabulary.\n\nCarve-out: a string the product actually renders to a user, and a test asserting\non it.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSC-07",
        "tier": "HARD",
        "title": "No end markers",
        "pack": "code",
        "prefix": "OSC",
        "body": "No `} // end if`, `# End of function`, `// End processOrder`. The closing brace\nalready ends the block.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSC-08",
        "tier": "LOCK",
        "title": "One line per comment",
        "pack": "code",
        "prefix": "OSC",
        "body": "One line. Two only when the second carries a new fact. Never three.\n\nA person leaves a note; a generator writes a case. Cut the reasoning chain, the\nissue number and the version history. Keep the constraint: the platform trap,\nthe silent failure, the protocol rule, the performance cost.\n\n**Value is not length.** A comment that legitimately earns its place still does\nnot earn a paragraph."
      },
      {
        "id": "OSC-09",
        "tier": "HARD",
        "title": "Comments explain why, never what",
        "pack": "code",
        "prefix": "OSC",
        "body": "Never strip a comment that carries: business logic and intent · an architectural\ndecision · a security consideration · a performance trade-off · concurrency\nbehaviour · a protocol detail · an API contract · a workaround · an edge case or\nassumption · a licence or legal notice.\n\n```js\n// Stripe may retry webhook deliveries for up to three days.\n// Ignore duplicate events using the event ID.\n```\n\nThat comment stays. A comment earns its place when it explains something the\ncode does not already show."
      },
      {
        "id": "OSC-10",
        "tier": "HARD",
        "title": "No speculative abstraction",
        "pack": "code",
        "prefix": "OSC",
        "body": "Minimum code that solves the stated problem. No helper for a one-time operation.\nNo abstraction for a single call site. No configurability nobody asked for. No\ndesign for a hypothetical future requirement.\n\nThree similar lines of code beat a premature abstraction."
      },
      {
        "id": "OSC-11",
        "tier": "HARD",
        "title": "No defence against impossible states",
        "pack": "code",
        "prefix": "OSC",
        "body": "No error handling, fallback or validation for a scenario that cannot happen.\nTrust internal code and framework guarantees.\n\nValidate at system boundaries only: user input, external APIs, parsed files, and\nanything crossing a process boundary."
      },
      {
        "id": "OSC-12",
        "tier": "HARD",
        "title": "No backwards-compatibility shim",
        "pack": "code",
        "prefix": "OSC",
        "body": "When the code can just change, change it. No feature flag, no compatibility\nlayer, no `_unused` rename, no re-export of a moved type, no `// removed`\ntombstone.\n\nIf it is unused, delete it completely."
      },
      {
        "id": "OSC-13",
        "tier": "HARD",
        "title": "Surgical",
        "pack": "code",
        "prefix": "OSC",
        "body": "Every changed line traces directly to the request. Do not improve adjacent code,\ncomments or formatting. Do not refactor what is not broken. Do not add\ndocstrings or type annotations to code you did not change.\n\nCites house card rule 1. Where the house card and this rule differ, the house\ncard wins."
      },
      {
        "id": "OSC-14",
        "tier": "HARD",
        "title": "Pre-existing dead code: mention, do not delete",
        "pack": "code",
        "prefix": "OSC",
        "body": "Remove the imports, variables and functions **your** change left unused. Report\nany other dead code you notice; do not remove it unless asked."
      },
      {
        "id": "OSC-15",
        "tier": "PURPOSE",
        "title": "Method length",
        "pack": "code",
        "prefix": "OSC",
        "body": "A function longer than the file's own norm is split, or the reason is written in\none line.\n\nStronger models write longer methods, not shorter ones: they consolidate complex\nlogic into a single procedural block because that is locally the most probable\ncontinuation. This rule is the counterweight."
      },
      {
        "id": "OSC-16",
        "tier": "PURPOSE",
        "title": "No Modular Mirage",
        "pack": "code",
        "prefix": "OSC",
        "body": "New files that spread one behaviour across the tree produce structural\nmodularity with no semantic cohesion. If a change adds files, the reason each\nboundary exists is written in one line.\n\nSeparating files is not the same as separating concerns."
      },
      {
        "id": "OSC-17",
        "tier": "PURPOSE",
        "title": "No God class, no branch sink",
        "pack": "code",
        "prefix": "OSC",
        "body": "No \"manager\" or \"service\" class that centralises every branch. No class whose\nresponse set spans most of the module. Where one is genuinely right, write the\nreason."
      },
      {
        "id": "OSC-18",
        "tier": "HARD",
        "title": "Look before you write a helper",
        "pack": "code",
        "prefix": "OSC",
        "body": "Before adding a helper, a util, a formatter or a validator, search for the one\nthat already exists. Redundant reimplementation is the most expensive slop in\nthis pack: it compiles, it passes, and it doubles the maintenance surface\nsilently."
      },
      {
        "id": "OSC-19",
        "tier": "HARD",
        "title": "Match the existing style",
        "pack": "code",
        "prefix": "OSC",
        "body": "Match the surrounding code's naming, comment density, error handling and file\nlayout, even where you would do it differently. The cached project pattern\n(`orc pattern`) is the reference when one exists."
      },
      {
        "id": "OSC-20",
        "tier": "PURPOSE",
        "title": "LLM-calling code is pinned and bounded",
        "pack": "code",
        "prefix": "OSC",
        "body": "When the task writes code that calls a model, each of these is done or the\nreason is written:\n\n- Pin the model **version**, never a bare provider alias.\n- Set `temperature` explicitly. Provider defaults differ and change.\n- Bound max tokens, timeouts and retries. Unbounded is not \"no limit\", it is an\n  unknown limit.\n- Send a system message.\n- Enforce a structured output schema where the caller expects fields."
      },
      {
        "id": "OSC-21",
        "tier": "HARD",
        "title": "No unrequested artifact files",
        "pack": "code",
        "prefix": "OSC",
        "body": "Do not create a file nobody asked for: `SUMMARY.md`, `IMPLEMENTATION_NOTES.md`,\n`CHANGES.md`, `NOTES.md`, `*_final`, `*_v2`, `*_new`, `*.bak`, `*.old`.\n\nReport in the return. Do not leave a file behind as the report.\n\nChecked by `orc rules lint` on new files."
      },
      {
        "id": "OSC-22",
        "tier": "HARD",
        "title": "Introduce no OWASP Top 10 weakness",
        "pack": "code",
        "prefix": "OSC",
        "body": "Injection, broken access control, insecure deserialisation, secrets in source,\nmissing authorisation on a new endpoint, unvalidated redirect. If you notice\ninsecure code you wrote, fix it in the same slice and say so in the return."
      },
      {
        "id": "OSD-01",
        "tier": "HARD",
        "title": "Separate what changed from what is verified",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "Two different facts, always reported as two facts.\n\n```\nEdited verifyToken at auth.ts:42. Tests not run yet.\n```\n\nNot \"fixed the token bug\". Editing is an observation. Fixing is a claim, and a\nclaim needs a run behind it."
      },
      {
        "id": "OSD-02",
        "tier": "HARD",
        "title": "Never report an unrun tool",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "Never say a command ran, a test passed, a build succeeded, a file was read or a\npage was fetched when it did not happen in this session. Not as a summary, not\nas a plan restated in the past tense, not as an inference from the diff.\n\nThis is the single most damaging rule in the pack to break, because everything\ndownstream trusts it."
      },
      {
        "id": "OSD-03",
        "tier": "HARD",
        "title": "No invented confidence",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "Cut \"this should work now\", \"definitely fixed\", \"should be perfect\", \"that ought\nto do it\". Confidence is reported from evidence or it is not reported.\n\nSay what you observed and what remains unknown."
      },
      {
        "id": "OSD-04",
        "tier": "HARD",
        "title": "Cut empty hedges, keep load-bearing caveats",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "The two look alike and are opposites.\n\n- **Empty hedge**, cut it: \"this might possibly help\", \"hopefully that works\".\n- **Load-bearing caveat**, keep it: \"this only covers the JSON path; the\n  multipart branch is untested\", \"this assumes the column is already indexed\".\n\nThe test is whether a reader could act on it. Scope, risk and uncertainty are\nload-bearing. A \"be concise\" instruction cuts both; this rule cuts one."
      },
      {
        "id": "OSD-05",
        "tier": "HARD",
        "title": "No apology theatre",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "State the cause and the fix. No \"I apologise for the confusion\", no \"you're\nabsolutely right, my mistake\", no paragraph of contrition before the correction.\n\nOne correction, plainly, then continue."
      },
      {
        "id": "OSD-06",
        "tier": "LOCK",
        "title": "An estimate names its driving variable",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "Never anchor on human-effort time (\"this would take a developer two days\").\nName what actually creates the uncertainty — file count, test-suite size, build\nrepetitions, number of call sites — then pin it with a measurement where one\nexists."
      },
      {
        "id": "OSD-07",
        "tier": "LOCK",
        "title": "No trailing recap",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "No closing paragraph restating what was just done. The user reads the diff and\nthe return. A recap is a second copy of information they already have.\n\nReport what is **unfinished**, **unverified** or **decided**. Not what is visible."
      },
      {
        "id": "OSD-08",
        "tier": "HARD",
        "title": "An honest partial beats a false done",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "Report what is unmet. Never round up, never mark a criterion met because\neverything around it is. A task that is 80% done is reported as 80% done with\nthe missing 20% named.\n\nCites house card rule 6."
      },
      {
        "id": "OSD-09",
        "tier": "LOCK",
        "title": "One issue at a time",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "When raising a problem that needs the user, raise one. A list of five concerns\nin one turn gets one answer covering none of them.\n\nException: a batch the user explicitly asked to be batched, and a round of\nquestions in an interview phase, where the format is the point."
      },
      {
        "id": "OSD-10",
        "tier": "HARD",
        "title": "No verification theatre",
        "pack": "delivery",
        "prefix": "OSD",
        "body": "A PASS with no record of what was actually exercised is not a PASS.\n\nReport the check element by element: the command that ran and its exit code, the\ntest names, the click-through if it was a UI, the file and line for each\ncriterion. If the deliverable could not be run, say so and say that the check\nwas code inspection instead. Never imply a run that did not happen."
      },
      {
        "id": "OSU-01",
        "tier": "HARD",
        "title": "No dead controls",
        "pack": "ui",
        "prefix": "OSU",
        "body": "Every interactive element does something real, or it does not exist:\n\n- a link or button that reaches a destination that exists\n- a modal that opens and closes, and closes on `Escape`\n- a toggle that changes state\n- an external action (`mailto:`, a real URL)\n- a form that submits and shows feedback\n\nA button that does nothing is a defect, not decoration. A nav item pointing at a\nsection that does not exist is the same defect. If it cannot have a destination\nyet, remove it, or label it \"Coming soon\" **and** leave a `TODO` that names the\ntask (`OSC-05`)."
      },
      {
        "id": "OSU-02",
        "tier": "HARD",
        "title": "Three states minimum",
        "pack": "ui",
        "prefix": "OSU",
        "body": "Any view that displays data has an **empty** state, a **loading** state and an\n**error** state. A UI built only for the ideal condition is not finished.\n\nThese are not extras. They are part of the view."
      },
      {
        "id": "OSU-03",
        "tier": "HARD",
        "title": "Accessible by default",
        "pack": "ui",
        "prefix": "OSU",
        "body": "- WCAG AA contrast: 4.5:1 for body text, 3:1 for large text (18px+). Test across\n  the whole area the text crosses, not one point.\n- Every interactive element reachable with `Tab` and `Shift+Tab`, in visual\n  order, and operable with `Enter` or `Space`.\n- Every focused element has a visible focus indicator.\n- Never `outline: none` or `outline: 0` without a better replacement.\n\nA UI that needs a mouse is unfinished.\n\nPartly checked by `orc rules lint` (`outline: none` with no replacement)."
      },
      {
        "id": "OSU-04",
        "tier": "HARD",
        "title": "Real content or an honest placeholder",
        "pack": "ui",
        "prefix": "OSU",
        "body": "No fabricated testimonial, statistic, customer logo, team member, review, or\nsecurity or compliance claim. No number without a real source.\n\nA placeholder is written as what it is: `[REAL DATA]`, `[LOGO]`, \"Coming soon\".\nNever disguised as final.\n\n**An empty section beats a fabricated one.** If there are no testimonials, there\nis no testimonials section."
      },
      {
        "id": "OSU-05",
        "tier": "LOCK",
        "title": "No generic CTA",
        "pack": "ui",
        "prefix": "OSU",
        "body": "\"Get Started\", \"Learn More\", \"Try Now\", \"Explore\", \"Discover\" name no action.\nName the action: \"Start the free trial\", \"Watch the 2-minute demo\", \"Create an\naccount\"."
      },
      {
        "id": "OSU-06",
        "tier": "HARD",
        "title": "No buzzword UI copy",
        "pack": "ui",
        "prefix": "OSU",
        "body": "Never in shipped interface text: \"AI Powered\" · \"Next Generation\" ·\n\"Revolutionary\" · \"Seamless\" · \"Cutting Edge\" · \"Intelligent\" · \"Ultimate\" ·\n\"Powerful\" · \"Effortless\" · \"Supercharged\".\n\nSay what it does. Show evidence, not adjectives.\n\nChecked by `orc rules lint`."
      },
      {
        "id": "OSU-07",
        "tier": "PURPOSE",
        "title": "Decoration needs a written reason",
        "pack": "ui",
        "prefix": "OSU",
        "body": "Each of these is **allowed** and fails only as an unexplained default. Write the\none-line reason it serves hierarchy, identity or readability:\n\n- gradient as a primary colour (blue→purple, blue→cyan, purple→pink especially)\n- glassmorphism · **dose cap: at most two elements**, never navbar + cards +\n  modal + sidebar together\n- glow · **dose cap: at most two elements**\n- capsule badge with no real status behind it\n- a button arrow as every button's identity\n- grid, dot, blueprint or graph-paper background\n- sparkle, star, magic, lightning, diamond, orb or robot as a feature icon\n- an animation stack (fade-up + float + scale + bounce) on everything\n- a generic illustration set with no connection to the product\n\nA gradient that separates one level of hierarchy from another is craft. The same\ngradient covering the page is slop. The technique is not the problem."
      },
      {
        "id": "OSU-08",
        "tier": "LOCK",
        "title": "Do not clone a named product",
        "pack": "ui",
        "prefix": "OSU",
        "body": "Do not build a visual that copies another product's look unless the user asked\nfor it by name. References are inspiration, not a template.\n\nModels default to cloning the products that dominate their training data. Notice\nwhen that is what is happening."
      },
      {
        "id": "OSU-09",
        "tier": "HARD",
        "title": "Mobile is part of the design",
        "pack": "ui",
        "prefix": "OSU",
        "body": "No horizontal overflow. Text stays inside its container. Cards do not collide or\nclip. The navbar stays usable. Tap targets meet 44px. Spacing stays consistent\nacross breakpoints.\n\nResponsiveness is not an add-on and not a follow-up task."
      },
      {
        "id": "OSU-10",
        "tier": "HARD",
        "title": "Every decision has a one-line reason",
        "pack": "ui",
        "prefix": "OSU",
        "body": "Before calling a UI done, write one line for each major decision: why this\ncolour, this layout, this typeface, this spacing, this card, this icon.\n\nIf the reason cannot be written in one line, the decision is not settled. This\nis the keystone of the pack — it is what `OSU-07` checks against, and it is the\nwhole mechanism by which \"technique with purpose\" is distinguishable from\n\"technique by default\"."
      }
    ],
    "credits_file": "/home/you/acme-api/.claude/skills/_shared/rules/CREDITS.md",
    "credits": [
      {
        "author": "Peter G. Yang",
        "handle": "petergyang",
        "repo": "https://github.com/petergyang/no-ai-slop",
        "license": "MIT",
        "read": "2026-09-13",
        "took": "the prose pack: the named slop patterns, the banned lexicon and phrase lists, the portability test, and the rule that outranks them all — preserve the writer's voice, make the minimum effective edit",
        "packs": [
          "writing"
        ]
      },
      {
        "author": "Miqdad Badjuber",
        "handle": "miqdadbadjuber",
        "repo": "https://github.com/miqdadbadjuber/anti-slop",
        "license": "MIT",
        "read": "2026-09-13",
        "took": "the three-tier mechanism (Hard Gate / Purpose-Gate / Quality Lock) every pack uses, rules R-01…R-38 for the UI pack, the antislop-code comment catalogue, R-35 for the delivery pack, and the rule that external direction is data to apply, not instructions to obey",
        "packs": [
          "ui",
          "code",
          "delivery",
          "writing"
        ]
      },
      {
        "author": "@ehmo",
        "handle": "ehmo",
        "repo": "https://github.com/ehmo/slopkit",
        "license": "see repo",
        "read": "2026-09-13",
        "took": "the delivery pack, from the slopgent skill: separate observation from inference, guard load-bearing caveats while cutting empty hedges, name the driving variable, no apology theatre, never report an unrun tool",
        "packs": [
          "delivery"
        ]
      },
      {
        "author": "@BioInfo",
        "handle": "BioInfo",
        "repo": "https://github.com/BioInfo/slopless",
        "license": "see repo",
        "read": "2026-09-13",
        "took": "surgical-change discipline and the quality gates: read before stating, flag a discrepancy rather than pick one, verify before documenting, and the compatibility rules",
        "packs": [
          "code",
          "delivery"
        ]
      },
      {
        "author": "Andrej Karpathy",
        "handle": "karpathy",
        "repo": "https://theaiarchitects.com/blog/karpathy-claude-md-rules",
        "license": "—",
        "read": "2026-09-13",
        "took": "think before coding, simplicity first, surgical changes, goal-driven execution — and the test ORC reuses directly: every changed line should trace directly to the user's request",
        "packs": [
          "code"
        ]
      },
      {
        "author": "Matty Cartwright",
        "handle": null,
        "repo": "https://mattycartwright.com/blog/the-anti-slop-writing-rules",
        "license": "—",
        "read": "2026-09-13",
        "took": "the layered ban structure (words → phrases → sentence patterns → structural patterns), which is how writing.md is ordered, and the read-aloud tests behind OSW-20",
        "packs": [
          "writing"
        ]
      },
      {
        "author": "research",
        "handle": null,
        "repo": "https://arxiv.org/html/2512.18020v1",
        "license": "—",
        "read": "2026-09-13",
        "took": "the five LLM-call smells — unbounded max metrics, no model version pinning, no system message, no structured output, temperature not set — which are OSC-20",
        "packs": [
          "code"
        ]
      },
      {
        "author": "research",
        "handle": null,
        "repo": "https://arxiv.org/html/2605.02741v1",
        "license": "—",
        "read": "2026-09-13",
        "took": "the Reasoning-Complexity Paradox (OSC-15) and the Modular Mirage (OSC-16), plus the God-class finding (OSC-17)",
        "packs": [
          "code"
        ]
      },
      {
        "author": "research",
        "handle": null,
        "repo": "https://arxiv.org/pdf/2510.03029",
        "license": "—",
        "read": "2026-09-13",
        "took": "over-commenting, defensive checks for impossible conditions, and redundant reimplementation — behind OSC-01, OSC-11 and OSC-18",
        "packs": [
          "code"
        ]
      }
    ]
  },
  "user": {
    "file": "/home/you/acme-api/.claude/orc/rules.md",
    "exists": true,
    "empty": false,
    "blocks": {
      "P0": "Never name a customer in a commit message or a PR body. Use the account id.\nEvery public function in src/api/ carries a one-line comment naming its caller.",
      "P1": "Prefer Result<T, E> over throwing inside src/core/.\nOSW-13: em dashes are our house voice. Use them where they read best.",
      "P2": "Say \"customer\", never \"user\", in anything a customer reads."
    },
    "text": "# ORC · project rules\n#\n# This project's own standing instructions — about the words ORC writes and\n# the shape of the code it writes. They are read BEFORE ORC's own anti-slop\n# rules, and THEY WIN wherever the two disagree.\n#\n# Put each one under the heading you want it read at — P0 first, then P1,\n# then P2 — in as many lines as you like. There is no one-line rule and no\n# rule count: the whole block is handed to every agent VERBATIM.\n#\n# To switch an ORC rule off, name its id in your own rule:\n#   OSW-13: em dashes are our house voice. Use them freely.\n#\n# Anything above the first `## P0` heading is a note to yourself and is never\n# dispatched. Edit this file directly, or in `orc ui` ▸ Rules.\n\n## P0\n\nNever name a customer in a commit message or a PR body. Use the account id.\nEvery public function in src/api/ carries a one-line comment naming its caller.\n\n## P1\n\nPrefer Result<T, E> over throwing inside src/core/.\nOSW-13: em dashes are our house voice. Use them where they read best.\n\n## P2\n\nSay \"customer\", never \"user\", in anything a customer reads.\n",
    "template": "# ORC · project rules\n#\n# This project's own standing instructions — about the words ORC writes and\n# the shape of the code it writes. They are read BEFORE ORC's own anti-slop\n# rules, and THEY WIN wherever the two disagree.\n#\n# Put each one under the heading you want it read at — P0 first, then P1,\n# then P2 — in as many lines as you like. There is no one-line rule and no\n# rule count: the whole block is handed to every agent VERBATIM.\n#\n# To switch an ORC rule off, name its id in your own rule:\n#   OSW-13: em dashes are our house voice. Use them freely.\n#\n# Anything above the first `## P0` heading is a note to yourself and is never\n# dispatched. Edit this file directly, or in `orc ui` ▸ Rules.\n\n## P0\n\n## P1\n\n## P2\n",
    "counts": {
      "P0": 2,
      "P1": 2,
      "P2": 1
    }
  },
  "priorities": [
    "P0",
    "P1",
    "P2"
  ],
  "tiers": [
    "HARD",
    "PURPOSE",
    "LOCK"
  ],
  "precedence": [
    {
      "rank": 1,
      "layer": "house rules",
      "scope": "CODE and agent BEHAVIOUR only",
      "where": "_shared/phases/house-rules.md + the project's CLAUDE.md P0",
      "beats": "everything below it, always"
    },
    {
      "rank": 2,
      "layer": "your rules",
      "scope": "everything",
      "where": "<claude>/orc/rules.md",
      "beats": "the ORC rules OUTRIGHT on any conflict"
    },
    {
      "rank": 3,
      "layer": "ORC rules",
      "scope": "everything",
      "where": "<claude>/skills/_shared/rules/",
      "beats": "nothing — it is the floor, and yours replaces it"
    }
  ],
  "overrides": [
    {
      "id": "OSW-13",
      "priority": "P1",
      "line": "OSW-13: em dashes are our house voice. Use them where they read best.",
      "known": true,
      "tier": "PURPOSE",
      "title": "Em dash dose cap"
    }
  ],
  "overrides_note": "counted from ORC rule ids you NAMED in your own rules. A conflict you did not name is found by the agent at dispatch and returned as rules_conflicts[] — the CLI cannot parse intent, so it does not pretend to.",
  "lanes": {
    "orc": [
      "writing",
      "code",
      "delivery"
    ],
    "orc-mini": [
      "writing",
      "code",
      "delivery"
    ],
    "orc-fast": [
      "writing",
      "code",
      "delivery"
    ],
    "orc-diy": [
      "writing",
      "code",
      "delivery"
    ],
    "orc-quick": [
      "writing",
      "code",
      "delivery"
    ],
    "orc-wiki": [
      "writing",
      "delivery"
    ],
    "orc-learn": [
      "writing",
      "delivery"
    ],
    "orc-claude": [
      "writing",
      "delivery"
    ],
    "orc-analyze": [
      "writing",
      "delivery"
    ],
    "orc-analyze-mini": [
      "writing",
      "delivery"
    ],
    "orc-brainstorm": [
      "writing",
      "delivery"
    ],
    "orc-grill": [
      "writing",
      "delivery"
    ],
    "orc-pact": [
      "writing",
      "delivery"
    ],
    "orc-boundary": [
      "writing",
      "delivery"
    ],
    "orc-handoff": [
      "writing",
      "delivery"
    ],
    "orc-export": [
      "writing",
      "delivery"
    ],
    "orc-challenge": [
      "writing",
      "delivery"
    ],
    "orc-poly": [
      "writing",
      "delivery"
    ],
    "orc-aftermath": [
      "writing",
      "delivery"
    ],
    "orc-budget": [
      "writing",
      "delivery"
    ],
    "orc-retro": [
      "writing",
      "delivery"
    ],
    "orc-verify": [
      "writing",
      "delivery"
    ],
    "orc-pr-setup": [
      "writing",
      "delivery"
    ],
    "orc-pr-driver": [
      "writing",
      "delivery"
    ],
    "orc-test": [
      "writing",
      "delivery"
    ],
    "orc-route": [
      "writing",
      "delivery"
    ],
    "orc-explain": [
      "writing",
      "delivery"
    ],
    "context-combiner": [
      "writing",
      "delivery"
    ]
  },
  "excluded": {
    "orc-doc": "has its own ledger: `orc doc rules`"
  },
  "boundary": "Rules govern WHAT is written and HOW it reads, and WHAT SHAPE of code is acceptable. They can never change how a lane RUNS: the scoring, the wave order, the gates, the dispatch contract, the ship rules, or any lane's structural and safety rules. A rule that asks for one of those comes back as unsupported_request — never a guessed compromise."
};

module.exports.rulesLint = {
  "ok": true,
  "source": "paths",
  "files": 2,
  "findings": [
    {
      "file": "docs.md",
      "line": 3,
      "rule": "OSW-10",
      "tier": "HARD",
      "pack": "writing",
      "title": "Banned lexicon",
      "evidence": "pivotal",
      "fix": "use the plain word"
    },
    {
      "file": "docs.md",
      "line": 3,
      "rule": "OSW-11",
      "tier": "HARD",
      "pack": "writing",
      "title": "Banned phrases",
      "evidence": "it is worth noting",
      "fix": "delete the clause and keep the point"
    },
    {
      "file": "src/checkout.js",
      "line": 1,
      "rule": "OSC-02",
      "tier": "HARD",
      "pack": "code",
      "title": "No decorative separator",
      "evidence": "==========================",
      "fix": "one plain line, or nothing"
    },
    {
      "file": "src/checkout.js",
      "line": 2,
      "rule": "OSC-02",
      "tier": "HARD",
      "pack": "code",
      "title": "No decorative separator",
      "evidence": "MAIN LOGIC",
      "fix": "sentence case, and only if the label carries a fact"
    },
    {
      "file": "src/checkout.js",
      "line": 2,
      "rule": "OSC-04",
      "tier": "HARD",
      "pack": "code",
      "title": "No empty label",
      "evidence": "MAIN LOGIC",
      "fix": "the label names a category, not a fact — delete it"
    },
    {
      "file": "src/checkout.js",
      "line": 3,
      "rule": "OSC-03",
      "tier": "HARD",
      "pack": "code",
      "title": "No workflow narration",
      "evidence": "Step 1: Validate input",
      "fix": "the control flow is already visible — delete it"
    },
    {
      "file": "src/checkout.js",
      "line": 5,
      "rule": "OSC-05",
      "tier": "HARD",
      "pack": "code",
      "title": "A TODO names a task",
      "evidence": "TODO: improve this",
      "fix": "name the task and enough context to act on it, or delete it"
    }
  ],
  "count": 7,
  "checked": [
    "OSW-10",
    "OSW-11",
    "OSW-18",
    "OSC-02",
    "OSC-03",
    "OSC-04",
    "OSC-05",
    "OSC-06",
    "OSC-07",
    "OSC-21",
    "OSU-03",
    "OSU-06"
  ],
  "checked_count": 12,
  "not_checked_count": 53,
  "total_rules": 65,
  "coverage": "checked 12 rules of 65 — not checked here: 53 rules. They need a reader, not a matcher.",
  "suppressed": [
    "OSW-13"
  ],
  "suppressed_note": "your own rules name these ids, so the check is off here. Precedence runs; it is not only written down.",
  "exempt": {
    "packs": [],
    "files": []
  },
  "exempt_note": "a rules pack has to print a banned word to define it, so the packs are skipped whole. `orc-rules-ignore-file` in a head, or `orc-rules-ignore` on a line, is your own opt-out. Both are counted here rather than being silent."
};
