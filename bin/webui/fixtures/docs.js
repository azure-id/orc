"use strict";
/* fixtures/docs.js — canned data for `orc ui --fixtures`.
   Document list, per-slug status, the derived section map, lint findings, the
   batching plan and one extracted section.

   THE RULE FOR EVERY FILE IN HERE: carry ONE OF EVERY STATE, including the
   ugly ones. You cannot DESIGN a STALE chip on a fresh wiki, and a state
   with no fixture is a state nobody has ever looked at. A per-state count
   test asserts this, so a new state cannot ship without one.

   Shapes MUST match what `bin/cli.js --json` really emits — a drifted
   fixture is worse than no fixture. */

const { PROJECT } = require("./shell.js");

const docList = {
  ok: true,
  dir: "orc/orc-doc",
  total: 4,
  documents: [
    {
      slug: "prd-checkout-refund-130826",
      title: "Checkout refunds",
      type: "prd",
      target: "notion",
      language: "en",
      cycle: 2,
      document: "present",
      lines: 487,
      sections_total: 17,
      sections_written: 14,
      user_edited: ["02-summary", "08-functional-requirements"],
      where: "Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written",
      dir: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826",
      next: "/orc-doc resume prd-checkout-refund-130826",
    },
    {
      // The finished one. `complete` is the only state that offers `git add`.
      slug: "runbook-payout-freeze-110826",
      title: "Payout freeze runbook",
      type: "workflow",
      target: "confluence",
      language: "en",
      cycle: 3,
      document: "present",
      lines: 212,
      sections_total: 12,
      sections_written: 12,
      user_edited: [],
      where: "Where it stands:  /orc-doc · WORKFLOW · cycle 3 · 12 of 12 sections written",
      dir: PROJECT + "/orc/orc-doc/runbook-payout-freeze-110826",
      next: "/orc-doc resume runbook-payout-freeze-110826",
    },
    {
      // SHIPPED (v0.48.1). The state the panel had no way to show before, and
      // the reason the whereLine grew a suffix: a finished document and a
      // DELIVERED one used to look exactly the same in a listing.
      slug: "adr-queue-choice-070826",
      title: "Queue choice",
      type: "workflow",
      target: "generic",
      language: "en",
      cycle: 3,
      document: "present",
      lines: 212,
      sections_total: 9,
      sections_written: 9,
      user_edited: [],
      where:
        "Where it stands:  /orc-doc · WORKFLOW · cycle 3 · 9 of 9 sections written · shipped 12-08-2026 → Notion › Platform › Payout freeze",
      dir: PROJECT + "/orc/orc-doc/adr-queue-choice-070826",
      next: "/orc-doc resume adr-queue-choice-070826",
    },
    {
      // The MONSTER: 40 sections, which is what forces ribbon overflow. It is
      // also the one the split offer exists for.
      slug: "tsd-ledger-rewrite-090826",
      title: "Ledger rewrite",
      type: "tsd",
      target: "docusaurus",
      language: "en",
      cycle: 1,
      document: "present",
      lines: 3140,
      sections_total: 40,
      sections_written: 31,
      user_edited: ["05-detailed-design"],
      where: "Where it stands:  /orc-doc · TSD · cycle 1 · 31 of 40 sections written",
      dir: PROJECT + "/orc/orc-doc/tsd-ledger-rewrite-090826",
      next: "/orc-doc resume tsd-ledger-rewrite-090826",
    },
    {
      // NOT STARTED: the outline exists, nothing has been assembled. The CLI's
      // own phrase, and it is never softened into "failed" or "empty".
      slug: "collab-risk-and-payments-130826",
      title: "Risk and Payments working agreement",
      type: "collaboration",
      target: "generic",
      language: "id",
      cycle: 0,
      document: "not started",
      lines: 0,
      sections_total: 13,
      sections_written: 0,
      user_edited: [],
      where: "Where it stands:  /orc-doc · COLLABORATION · cycle 0 · 0 of 13 sections written",
      dir: PROJECT + "/orc/orc-doc/collab-risk-and-payments-130826",
      next: "/orc-doc resume collab-risk-and-payments-130826",
    },
  ],
};

const docStatuses = {
  "prd-checkout-refund-130826": {
    ok: true,
    slug: "prd-checkout-refund-130826",
    title: "Checkout refunds",
    type: "prd",
    target: "notion",
    language: "en",
    cycle: 2,
    version: 2,
    state: "in-progress",
    write_mode: "partial",
    wave: { done: 5, total: 7, role: "write" },
    // document.md behind its own sections/ — coverage-relative, and NAMED.
    document_stale: [{ id: "04-goals-and-success-metrics", heading: "Goals and success metrics", reason: "changed" }],
    sections_dir: "orc/orc-doc/prd-checkout-refund-130826/sections",
    document: "orc/orc-doc/prd-checkout-refund-130826/document.md",
    lines: 487,
    sections_total: 17,
    sections_written: 14,
    open_sections: [
      { id: "12-risks-and-open-questions", heading: "Risks and open questions" },
      { id: "13-rollout-and-measurement-plan", heading: "Rollout and measurement plan" },
    ],
    user_edited: [
      { id: "02-summary", heading: "Summary" },
      { id: "08-functional-requirements", heading: "Functional requirements" },
    ],
    lint: { errors: 2, warnings: 6, target: "notion" },
    dir: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826",
    where: "Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written",
    resume: "/orc-doc resume prd-checkout-refund-130826",
  },
  "runbook-payout-freeze-110826": {
    ok: true,
    slug: "runbook-payout-freeze-110826",
    title: "Payout freeze runbook",
    type: "workflow",
    target: "confluence",
    language: "en",
    cycle: 3,
    version: 2,
    state: "complete",
    write_mode: "all",
    wave: { done: 4, total: 4, role: "write" },
    document_stale: [],
    sections_dir: "orc/orc-doc/runbook-payout-freeze-110826/sections",
    document: "orc/orc-doc/adr-queue-choice-070826/document.md",
    lines: 212,
    sections_total: 12,
    sections_written: 12,
    open_sections: [],
    user_edited: [],
    lint: { errors: 0, warnings: 1, target: "confluence" },
    dir: PROJECT + "/orc/orc-doc/adr-queue-choice-070826",
    where: "Where it stands:  /orc-doc · WORKFLOW · cycle 3 · 12 of 12 sections written",
    resume: "/orc-doc resume runbook-payout-freeze-110826",
  },
  "collab-risk-and-payments-130826": {
    ok: true,
    slug: "collab-risk-and-payments-130826",
    title: "Risk and Payments working agreement",
    type: "collaboration",
    target: "generic",
    language: "id",
    cycle: 0,
    // A document started before sections/ became the source of truth. You cannot
    // design the migrate card on a document that is already v2.
    version: 1,
    state: "not-started",
    write_mode: null,
    wave: null,
    document_stale: [],
    sections_dir: "orc/orc-doc/collab-risk-and-payments-130826/sections",
    document: null,
    lines: 0,
    sections_total: 13,
    sections_written: 0,
    open_sections: [],
    user_edited: [],
    lint: null,
    dir: PROJECT + "/orc/orc-doc/collab-risk-and-payments-130826",
    where: "Where it stands:  /orc-doc · COLLABORATION · cycle 0 · 0 of 13 sections written",
    resume: "/orc-doc resume collab-risk-and-payments-130826",
  },
};

// The map carries one of EVERY section state, plus a repaired rename and a
// section with findings — none of which exist on a healthy document.

const docMapSections = [
  { id: "01-document-info", heading: "Document info", level: 2, start: 3, end: 24, lines: 22, hash: "a91f4c02de77", state: "checked", required: true, findings: 0, renamed_from: null },
  { id: "02-summary", heading: "Summary", level: 2, start: 25, end: 41, lines: 17, hash: "4c02aa1791ff", state: "user-edited", required: true, findings: 0, renamed_from: null },
  { id: "03-the-problem-we-are-solving", heading: "The problem we are solving", level: 2, start: 42, end: 118, lines: 77, hash: "7731bb04ce19", state: "written", required: true, findings: 1, renamed_from: "03-problem-and-context" },
  { id: "04-goals-and-success-metrics", heading: "Goals and success metrics", level: 2, start: 119, end: 176, lines: 58, hash: "5d642c42aa10", state: "written", required: true, findings: 2, renamed_from: null },
  { id: "05-non-goals", heading: "Non-goals", level: 2, start: 177, end: 181, lines: 5, hash: "c28656c5be31", state: "open", required: true, findings: 0, renamed_from: null },
  { id: "06-users-and-jobs-to-be-done", heading: "Users and jobs to be done", level: 2, start: 182, end: 240, lines: 59, hash: "a0c7398aff02", state: "checked", required: true, findings: 0, renamed_from: null },
  { id: "07-scenarios-and-user-stories", heading: "Scenarios and user stories", level: 2, start: 241, end: 333, lines: 93, hash: "3c5eb244cd18", state: "written", required: true, findings: 0, renamed_from: null },
  { id: "08-functional-requirements", heading: "Functional requirements", level: 2, start: 334, end: 470, lines: 137, hash: "be7aca8c0091", state: "user-edited", required: true, findings: 0, renamed_from: null },
  { id: "09-non-functional-requirements", heading: "Non-functional requirements", level: 2, start: 471, end: 480, lines: 10, hash: "4ff6336511cc", state: "planned", required: true, findings: 0, renamed_from: null },
  // v0.49.0 — a file on disk that no validated return ever confirmed. This is
  // exactly what a wave killed by a usage limit leaves behind, and you cannot
  // design the chip for it on a document where every wave finished.
  { id: "09b-open-questions", heading: "Open questions", level: 2, start: 481, end: 486, lines: 6, hash: "9b0c1177fe20", state: "unconfirmed", required: true, findings: 0, renamed_from: null },
  { id: "10-revision-history", heading: "Revision history", level: 2, start: 481, end: 487, lines: 7, hash: "0d8c6a9d7742", state: "written", required: true, findings: 0, renamed_from: null },
];

const docMap = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  file: "orc/orc-doc/prd-checkout-refund-130826/document.md",
  lines: 487,
  preamble_end: 2,
  sections: docMapSections,
  repaired: [{ from: "03-problem-and-context", to: "03-the-problem-we-are-solving", heading: "The problem we are solving" }],
  note: "line numbers are DERIVED on every read and never stored — a stored line number is a wrong line number one edit later",
};

// A lint-RED card against --target notion. You cannot design the error chip, the
// rule bars or the import note on a clean document.

const docLint = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  file: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826/document.md",
  target: "notion",
  target_label: "Notion",
  max_heading: 3,
  front_matter: "ban",
  lines: 487,
  errors: 2,
  warnings: 6,
  findings: [
    { id: "D-001", severity: "error", rule: "heading-too-deep", line: 128, what: "H4 is deeper than Notion supports (max H3) — it degrades to bold text", quote: "Refund windows" },
    { id: "D-002", severity: "error", rule: "hard-wrap", line: 204, what: "a hard-wrapped paragraph — one paragraph must be one line, or the wrap becomes a line break on import", quote: "The refund window closes at the end of the settlement day, and any" },
    { id: "D-003", severity: "warn", rule: "long-sentence", line: 141, what: "a 47-word sentence — one idea per sentence, and the bar is 35", quote: "Once the settlement job has been started the reconciliation is not run until…" },
    { id: "D-004", severity: "warn", rule: "long-sentence", line: 262, what: "a 39-word sentence — one idea per sentence, and the bar is 35", quote: "Merchants who have opted into instant payouts and who also…" },
    { id: "D-005", severity: "warn", rule: "undefined-acronym", line: 141, what: '"SoR" is used without being expanded on first use', quote: "the SoR for a refund is the ledger" },
    { id: "D-006", severity: "warn", rule: "undefined-acronym", line: 310, what: '"PSP" is used without being expanded on first use', quote: null },
    { id: "D-007", severity: "warn", rule: "placeholder", line: 179, what: "leftover placeholder text: TBD", quote: "> **Open:** TBD — the fraud limit" },
    { id: "D-008", severity: "warn", rule: "fence-no-language", line: 356, what: "a code fence with no language tag", quote: null },
  ],
  readability: {
    sentences: 214,
    avg_sentence_words: 21.4,
    avg_bar: 20,
    longest_sentence_words: 47,
    longest_sentence_line: 141,
    long_word_pct: 18,
    passive_constructions: 31,
    undefined_acronyms: [
      { acronym: "SoR", line: 141 },
      { acronym: "PSP", line: 310 },
    ],
  },
  honesty: [
    "A readability signal is a SIGNAL, not a verdict. This never blocks anything.",
    "It is English-specific and heuristic: passive voice is a pattern match and a syllable count is an estimate.",
  ],
  import_note: null,
};

// A plan with a CLAMP and an OVERSIZED section — both are states you cannot see
// on a well-shaped document, and both are things the panel must say out loud.

const docPlan = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  role: "write",
  agent: "orc-doc-writer-opus-5-med",
  budget_lines: 400,
  parallel: 4,
  clamped: { from: 6, to: 4 },
  waves: [
    {
      n: 1,
      agents: [
        { agent: "orc-doc-writer-opus-5-med", sections: ["09-non-functional-requirements"], headings: ["Non-functional requirements"], budget_lines: 120, oversized: false, part: ".work/09-non-functional-requirements.md" },
        { agent: "orc-doc-writer-opus-5-med", sections: ["12-risks-and-open-questions", "13-rollout-and-measurement-plan"], headings: ["Risks and open questions", "Rollout and measurement plan"], budget_lines: 160, oversized: false, part: ".work/12-risks-and-open-questions.md" },
        { agent: "orc-doc-writer-opus-5-med", sections: ["05-non-goals"], headings: ["Non-goals"], budget_lines: 40, oversized: false, part: ".work/05-non-goals.md" },
        { agent: "orc-doc-writer-opus-5-med", sections: ["08-functional-requirements"], headings: ["Functional requirements"], budget_lines: 620, oversized: true, part: ".work/08-functional-requirements.md" },
      ],
    },
    {
      n: 2,
      agents: [
        { agent: "orc-doc-writer-opus-5-med", sections: ["16-glossary", "17-revision-history"], headings: ["Glossary", "Revision history"], budget_lines: 60, oversized: false, part: ".work/16-glossary.md" },
      ],
    },
  ],
  agents: 5,
  oversized: ["08-functional-requirements"],
  hint: null,
  note: "no section is ever split across two agents, and no two agents ever share a file",
};

const docShow = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  title: "Checkout refunds",
  type: "prd",
  language: "en",
  target: "notion",
  length: "standard",
  template: { source: "shipped:prd", label: "PRD — Product Requirements Document" },
  cycle: 2,
  dir: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826",
  document: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826/document.md",
  total_lines: 487,
  outline: docMapSections.map((s) => ({
    id: s.id,
    heading: s.heading,
    level: 2,
    required: s.id !== "10-revision-history" ? true : true,
    purpose: "what this section is for, in one line",
    affinity: null,
    budget_lines: 120,
  })),
  sections: docMapSections,
  extracts: {},
  cycles: [
    { n: 1, at: "13-08-2026 09:14:02", kind: "write", agents: 5, sections: ["01-document-info", "02-summary"] },
    { n: 2, at: "14-08-2026 11:02:47", kind: "edit", agents: 2, sections: ["04-goals-and-success-metrics"] },
  ],
  lock: null,
  where: "Where it stands:  /orc-doc · PRD · cycle 2 · 14 of 17 sections written",
};

// ONE section's text, and only on an explicit Reveal click.

const docSection = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  section: "05-non-goals",
  heading: "Non-goals",
  start: 177,
  end: 181,
  lines: 5,
  state: "open",
  hash: "c28656c5be31",
  text: "## Non-goals\n\n> **Open:** nobody has decided whether subscription refunds are in scope. Needed before the rollout section can commit to a date.\n",
};

/* ── v0.48.1: the ugly states ─────────────────────────────────────────────
   You cannot DESIGN a `shipped-drifted` chip, a journal gap row or a
   SOURCE-DRIFTED reference on a document where none of them happen. Every
   state below exists so that somebody has actually looked at it once. */

// A document that SHIPPED and has not moved since.
const docShipped = {
  ok: true,
  slug: "adr-queue-choice-070826",
  title: "Queue choice",
  type: "workflow",
  target: "generic",
  language: "en",
  cycle: 3,
  state: "shipped",
  shipped: {
    at: "12-08-2026 16:40:11",
    where: "Notion › Platform › Payout freeze",
    note: "handed to the on-call rotation",
    cycle: 3,
    lines: 212,
    forced: false,
    force_reason: null,
  },
  drifted_sections: [],
  document: "orc/orc-doc/adr-queue-choice-070826/document.md",
  lines: 212,
  sections_total: 9,
  sections_written: 9,
  open_sections: [],
  user_edited: [],
  lint: { errors: 0, warnings: 2, target: "generic" },
  dir: PROJECT + "/orc/orc-doc/adr-queue-choice-070826",
  where:
    "Where it stands:  /orc-doc · WORKFLOW · cycle 3 · 9 of 9 sections written · shipped 12-08-2026 → Notion › Platform › Payout freeze",
  resume: "/orc-doc resume adr-queue-choice-070826",
};

// The same document after somebody edited two sections. `shipped-drifted`
// KEEPS ITS SLOT — it is an answer, not a gap — and it NAMES what moved,
// because a whole-file "something changed" cannot tell you what to re-read.
const docShippedDrifted = {
  ...docShipped,
  slug: "tsd-ledger-rewrite-090826",
  title: "Ledger rewrite",
  type: "tsd",
  state: "shipped-drifted",
  shipped: {
    at: "09-08-2026 11:02:44",
    where: "Slack #platform-eng thread of 9 Aug",
    note: null,
    cycle: 4,
    lines: 640,
    // A FORCED ship, so the override and its verbatim reason are designable.
    forced: true,
    force_reason: "the review was that afternoon and the risks section could follow",
  },
  drifted_sections: [
    { id: "05-data-model", heading: "Data model", reason: "changed" },
    { id: "09-risks", heading: "Risks", reason: "added" },
  ],
  document: "orc/orc-doc/tsd-ledger-rewrite-090826/document.md",
  lines: 661,
  sections_total: 12,
  sections_written: 12,
  user_edited: [{ id: "05-data-model", heading: "Data model" }],
  where:
    "Where it stands:  /orc-doc · TSD · cycle 4 · 12 of 12 sections written · shipped 09-08-2026 → Slack #platform-eng thread of 9 Aug (drifted: 2 sections)",
  resume: "/orc-doc resume tsd-ledger-rewrite-090826",
};

// `orc doc next` in each of its three shapes: a FREE action, a PAID action,
// and a block that names the human decision.
const docNext = {
  "prd-checkout-refund-130826": {
    ok: true,
    slug: "prd-checkout-refund-130826",
    phase: "D7",
    action: "lint",
    command: "orc doc lint prd-checkout-refund-130826 --json",
    why: "3 sections were written since the last assemble; the free check runs before the paid one",
    paid: false,
    blocked_by: null,
    alternatives: ["orc doc map prd-checkout-refund-130826 --json"],
  },
  "collab-risk-and-payments-130826": {
    ok: true,
    slug: "collab-risk-and-payments-130826",
    phase: "D6",
    action: "plan-write",
    command: "orc doc plan collab-risk-and-payments-130826 --role write --json",
    why: "4 required sections still open",
    paid: true,
    blocked_by: null,
    alternatives: [],
  },
  "tsd-ledger-rewrite-090826": {
    ok: true,
    slug: "tsd-ledger-rewrite-090826",
    phase: "D9",
    action: "ask",
    command: null,
    why: "shipped to Slack #platform-eng thread of 9 Aug, then 2 sections changed (Data model, Risks). Re-send it, or say why not.",
    paid: false,
    blocked_by:
      "shipped to Slack #platform-eng thread of 9 Aug, then 2 sections changed (Data model, Risks). Re-send it, or say why not.",
    alternatives: ['orc doc ship tsd-ledger-rewrite-090826 --where "<where it went this time>"'],
  },
};

// A dirty audit with four classes, each carrying a fix and a route. One has
// `panel: null` — there is genuinely nothing to press, and a button that goes
// nowhere is worse than no button.
const docAudit = {
  "tsd-ledger-rewrite-090826": {
    ok: true,
    slug: "tsd-ledger-rewrite-090826",
    clean: false,
    findings: [
      {
        id: "ship-drifted",
        level: "warn",
        summary:
          "shipped 09-08-2026 11:02:44 to Slack #platform-eng thread of 9 Aug, and 2 sections changed since: Data model, Risks.",
        fix: 'orc doc ship tsd-ledger-rewrite-090826 --where "<where it went this time>"',
        panel: "docs",
      },
      {
        id: "orphan-extract",
        level: "warn",
        summary: ".work/05-data-model.md was extracted (4 days old) and never spliced back.",
        fix: "orc doc splice tsd-ledger-rewrite-090826",
        panel: "docs",
      },
      {
        id: "section-vanished",
        level: "error",
        summary: 'outline lists "Migration plan" but the document has no such heading.',
        fix: "orc doc map tsd-ledger-rewrite-090826",
        panel: "docs",
      },
      {
        id: "source-drifted",
        level: "warn",
        summary: "1 reference file moved since the brief was frozen: docs/ledger-contract.md (SOURCE-DRIFTED)",
        fix: "orc doc context tsd-ledger-rewrite-090826",
        panel: "docs",
      },
      {
        id: "cycle-mismatch",
        level: "warn",
        summary: "doc.json says cycle 4 but records 3 cycles.",
        fix: "orc doc show tsd-ledger-rewrite-090826 --json",
        panel: null,
      },
    ],
    user_edited: [{ id: "05-data-model", heading: "Data model" }],
  },
  "prd-checkout-refund-130826": {
    ok: true,
    slug: "prd-checkout-refund-130826",
    clean: true,
    findings: [],
    user_edited: [
      { id: "02-summary", heading: "Summary" },
      { id: "08-functional-requirements", heading: "Functional requirements" },
    ],
  },
};

// A RICH multi-session journal, and — separately — one with nothing recorded
// at all, so the gap rows are designable. You cannot lay out "no request was
// recorded for it" on a document that logged everything.
const docJournalRich = {
  ok: true,
  slug: "prd-checkout-refund-130826",
  entries: 8,
  recorded: 4,
  gaps: 1,
  journal: [
    {
      at: "13-08-2026 09:02:11",
      origin: "recorded",
      kind: "request",
      text: "write the refund PRD for checkout, and do not invent an SLA — we have not agreed one",
      cycle: 0,
      sections: [],
      source: "user",
    },
    { at: "13-08-2026 09:14:02", origin: "derived", kind: "write cycle", text: null, cycle: 1, sections: ["01-document-info", "02-summary"], agents: 5 },
    {
      at: "13-08-2026 09:40:55",
      origin: "recorded",
      kind: "decision",
      text: "partial refunds are out of scope for v1",
      cycle: 1,
      sections: ["05-non-goals"],
      source: "/orc-grill",
    },
    { at: "13-08-2026 10:11:30", origin: "derived", kind: "check cycle", text: null, cycle: 2, sections: ["02-summary"], agents: 3 },
    { at: null, origin: "observed", kind: "you edited", text: null, cycle: 2, sections: ["02-summary"] },
    {
      at: "14-08-2026 08:20:03",
      origin: "recorded",
      kind: "request",
      text: "the goals section reads like marketing — make it measurable",
      cycle: 2,
      sections: ["04-goals-and-success-metrics"],
      source: "user",
    },
    { at: "14-08-2026 08:44:19", origin: "derived", kind: "edit cycle", text: null, cycle: 3, sections: ["04-goals-and-success-metrics"], agents: 1, gap: true },
    { at: "15-08-2026 17:05:00", origin: "recorded", kind: "note", text: "waiting on legal before the rollout section", cycle: 3, sections: [], source: "user" },
  ],
};

const docJournalEmpty = {
  ok: true,
  slug: "collab-risk-and-payments-130826",
  entries: 3,
  recorded: 0,
  gaps: 3,
  journal: [
    { at: "13-08-2026 14:00:00", origin: "derived", kind: "write cycle", text: null, cycle: 1, sections: ["01-purpose"], agents: 2, gap: true },
    { at: "13-08-2026 14:38:00", origin: "derived", kind: "check cycle", text: null, cycle: 2, sections: ["01-purpose"], agents: 2, gap: true },
    { at: "13-08-2026 15:02:00", origin: "derived", kind: "write cycle", text: null, cycle: 3, sections: ["02-decisions"], agents: 2, gap: true },
  ],
};

// A frozen brief whose reference files no longer all hold, and one where D2
// was answered "none" — which is an ANSWER and keeps its slot.
const docContext = {
  "prd-checkout-refund-130826": {
    ok: true,
    slug: "prd-checkout-refund-130826",
    drifted: ["docs/refund-policy.md"],
    context: {
      exists: true,
      path: PROJECT + "/orc/orc-doc/prd-checkout-refund-130826/context.md",
      frozen_at: "13-08-2026",
      request: "write the refund PRD for checkout, and do not invent an SLA — we have not agreed one",
      purpose:
        "- **Intent:** hand to the payments backend team\n- **Audience:** backend engineers (assumed: they know the checkout flow, not the refund ledger)\n- **Expectation:** after reading, they can size the work without asking us anything",
      template: "Shipped base template: PRD (references/templates/prd.md)",
      decisions: "| # | Date | Decision | Asked by |\n|---|---|---|---|\n| 1 | 13-08 | Partial refunds out of scope for v1 | /orc-grill |",
      sources: [
        {
          path: "docs/refund-policy.md",
          read: true,
          digest: "context-sources.md §1",
          state: "SOURCE-DRIFTED",
          note: "changed since the brief was frozen — the brief is not wrong, but it is older than this file",
        },
        { path: "docs/ledger-contract.md", read: true, digest: "context-sources.md §2", state: "ok" },
        { path: "docs/deleted-spec.md", read: true, digest: "context-sources.md §3", state: "MISSING", note: "the file the brief was built on is gone" },
      ],
      source_commit: "b72bd91",
    },
  },
  "collab-risk-and-payments-130826": {
    ok: true,
    slug: "collab-risk-and-payments-130826",
    drifted: [],
    context: {
      exists: true,
      path: PROJECT + "/orc/orc-doc/collab-risk-and-payments-130826/context.md",
      frozen_at: "13-08-2026",
      request: "we need one page risk and payments can both edit before Thursday",
      purpose: "- **Intent:** get two teams to agree in writing\n- **Audience:** risk + payments leads",
      template: "Shipped base template: Collaboration (references/templates/collaboration.md)",
      decisions: null,
      sources: [],
      source_commit: "b72bd91",
    },
  },
};


// ── the SECTION FILES (v0.49.0) ─────────────────────────────────────────────
// ONE OF EVERY STATE, the ugly ones included: a section stored as SUB-PARTS
// (with one of them changed), an `unconfirmed` file a killed wave left behind,
// a `planned` row that KEEPS ITS SLOT, a `user-edited` one, and a misnumbered
// id. You cannot design the `unconfirmed` chip on a document where every wave
// finished, and you cannot design the nested rows on a flat one.
const docParts = {
  "prd-checkout-refund-130826": {
    ok: true,
    slug: "prd-checkout-refund-130826",
    dir: "orc/orc-doc/prd-checkout-refund-130826/sections",
    front: "sections/00-front.md",
    confirmed: [],
    total: 10,
    written: 6,
    missing: ["09-non-functional-requirements"],
    unconfirmed: ["09b-open-questions"],
    misnumbered: ["09b-open-questions"],
    problems: [],
    wave: { done: 5, total: 7, role: "write" },
    parts: [
      { id: "01-document-info", heading: "Document info", required: true, files: ["sections/01-document-info.md"], nested: false, exists: true, lines: 22, hash: "a91f4c02de77", state: "checked", subsections: [], ordinal_ok: true, findings: 0 },
      { id: "02-summary", heading: "Summary", required: true, files: ["sections/02-summary.md"], nested: false, exists: true, lines: 17, hash: "4c02aa1791ff", state: "user-edited", subsections: [], ordinal_ok: true, findings: 0 },
      { id: "03-the-problem-we-are-solving", heading: "The problem we are solving", required: true, files: ["sections/03-the-problem-we-are-solving.md"], nested: false, exists: true, lines: 77, hash: "7731bb04ce19", state: "written", subsections: [], ordinal_ok: true, findings: 1 },
      {
        // The nested one: a big section stored as sub-parts, invisible to the
        // reader and to `orc doc map`, and only the sub-part that MOVED is
        // marked — which is what makes a re-check cost one small read.
        id: "04-goals-and-success-metrics",
        heading: "Goals and success metrics",
        required: true,
        files: [
          "sections/04-goals-and-success-metrics/00-head.md",
          "sections/04-goals-and-success-metrics/01-north-star.md",
          "sections/04-goals-and-success-metrics/02-guardrails.md",
        ],
        nested: true,
        exists: true,
        lines: 58,
        hash: "5d642c42aa10",
        state: "written",
        subsections: [
          { id: "01-north-star", heading: "North star", file: "sections/04-goals-and-success-metrics/01-north-star.md", exists: true, lines: 21, hash: "aa10c42b7731", changed: false },
          { id: "02-guardrails", heading: "Guardrails", file: "sections/04-goals-and-success-metrics/02-guardrails.md", exists: true, lines: 24, hash: "c42baa1077f3", changed: true },
        ],
        ordinal_ok: true,
        findings: 2,
      },
      { id: "05-non-goals", heading: "Non-goals", required: true, files: ["sections/05-non-goals.md"], nested: false, exists: true, lines: 5, hash: "c28656c5be31", state: "written", subsections: [], ordinal_ok: true, findings: 0 },
      { id: "06-users-and-jobs-to-be-done", heading: "Users and jobs to be done", required: true, files: ["sections/06-users-and-jobs-to-be-done.md"], nested: false, exists: true, lines: 59, hash: "a0c7398aff02", state: "checked", subsections: [], ordinal_ok: true, findings: 0 },
      { id: "07-scenarios-and-user-stories", heading: "Scenarios and user stories", required: true, files: ["sections/07-scenarios-and-user-stories.md"], nested: false, exists: true, lines: 93, hash: "3c5eb244cd18", state: "written", subsections: [], ordinal_ok: true, findings: 0 },
      { id: "08-functional-requirements", heading: "Functional requirements", required: true, files: ["sections/08-functional-requirements.md"], nested: false, exists: true, lines: 137, hash: "be7aca8c0091", state: "user-edited", subsections: [], ordinal_ok: true, findings: 0 },
      // Not written yet. It KEEPS ITS SLOT — "not written" is an answer.
      { id: "09-non-functional-requirements", heading: "Non-functional requirements", required: true, files: [], nested: false, exists: false, lines: 0, hash: null, state: "planned", subsections: [], ordinal_ok: true, findings: 0 },
      // A file a usage limit left behind: on disk, never confirmed by a return.
      { id: "09b-open-questions", heading: "Open questions", required: true, files: ["sections/09b-open-questions.md"], nested: false, exists: true, lines: 6, hash: "9b0c1177fe20", state: "unconfirmed", subsections: [], ordinal_ok: false, findings: 0 },
    ],
    note: "the section files ARE the progress — there is no checkpoint file to invent and none to drift",
  },
  "runbook-payout-freeze-110826": {
    ok: true,
    slug: "runbook-payout-freeze-110826",
    dir: "orc/orc-doc/runbook-payout-freeze-110826/sections",
    front: null,
    confirmed: [],
    total: 2,
    written: 2,
    missing: [],
    unconfirmed: [],
    misnumbered: [],
    problems: [],
    wave: { done: 4, total: 4, role: "write" },
    parts: [
      { id: "01-purpose", heading: "Purpose", required: true, files: ["sections/01-purpose.md"], nested: false, exists: true, lines: 12, hash: "77f3aa10c42b", state: "checked", subsections: [], ordinal_ok: true, findings: 0 },
      { id: "02-the-procedure", heading: "The procedure", required: true, files: ["sections/02-the-procedure.md"], nested: false, exists: true, lines: 84, hash: "0091be7aca8c", state: "checked", subsections: [], ordinal_ok: true, findings: 0 },
    ],
    note: "the section files ARE the progress — there is no checkpoint file to invent and none to drift",
  },
  // Nothing written at all: the card still has to read well, and `orc doc parts`
  // still answers with its object rather than an error.
  "collab-risk-and-payments-130826": {
    ok: true,
    slug: "collab-risk-and-payments-130826",
    dir: "orc/orc-doc/collab-risk-and-payments-130826/sections",
    front: null,
    confirmed: [],
    total: 2,
    written: 0,
    missing: ["01-document-info", "02-purpose-and-scope"],
    unconfirmed: [],
    misnumbered: [],
    problems: [],
    wave: null,
    parts: [
      { id: "01-document-info", heading: "Document info", required: true, files: [], nested: false, exists: false, lines: 0, hash: null, state: "planned", subsections: [], ordinal_ok: true, findings: 0 },
      { id: "02-purpose-and-scope", heading: "Purpose and scope", required: true, files: [], nested: false, exists: false, lines: 0, hash: null, state: "planned", subsections: [], ordinal_ok: true, findings: 0 },
    ],
    note: "the section files ARE the progress — there is no checkpoint file to invent and none to drift",
  },
};

module.exports = { docList, docParts, docStatuses, docMapSections, docMap, docLint, docPlan, docShow, docSection, docShipped, docShippedDrifted, docNext, docAudit, docJournalRich, docJournalEmpty, docContext };
