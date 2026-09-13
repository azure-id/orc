"use strict";
/**
 * fixtures/wiki-one.js — the wiki's one-doc-at-a-time probes.
 *
 * CAPTURED FROM THE REAL CLI against a throwaway two-doc wiki with one
 * undocumented area, then the paths rewritten. Three payloads, because the
 * three verdicts are three different cards and only one of them is reachable
 * on any given repo:
 *
 *   wikiResolveNew        nothing covers it — with a proposed scope
 *   wikiResolveMatch      one doc clearly does — routes to an update
 *   wikiResolveAmbiguous  two cover it about equally — a QUESTION, never a
 *                         guess, and the card offers no command until a human
 *                         picks one
 *
 * `wikiRefs` carries a RESERVED row and three behind surfaces, because a sweep
 * where everything is clean renders six identical green lines and teaches
 * nothing about the state it exists to show.
 */

module.exports.wikiResolveNew = {
  "ok": true,
  "topic": "remittance",
  "terms": [
    "remittance"
  ],
  "verdict": "new",
  "match": null,
  "candidates": [],
  "suggested_slug": "remittance",
  "suggested_covers": [
    {
      "glob": "src/remittance/**",
      "matches": 3
    }
  ],
  "next": "/orc-wiki add \"remittance\"",
  "note": "the suggested covers are a STARTING POINT derived from path names, never an answer — the user corrects them before anything is scanned."
};

module.exports.wikiResolveMatch = {
  "ok": true,
  "topic": "login session",
  "terms": [
    "login",
    "session"
  ],
  "verdict": "match",
  "match": {
    "file": "wiki/orc-feature-auth-overview.md",
    "area": "auth",
    "title": "auth Overview",
    "keywords": [
      "login",
      "session",
      "token"
    ],
    "covers": [
      "src/auth/**"
    ],
    "score": 8,
    "why": [
      "login in keywords",
      "session in keywords"
    ]
  },
  "candidates": [
    {
      "file": "wiki/orc-feature-auth-overview.md",
      "area": "auth",
      "title": "auth Overview",
      "keywords": [
        "login",
        "session",
        "token"
      ],
      "covers": [
        "src/auth/**"
      ],
      "score": 8,
      "why": [
        "login in keywords",
        "session in keywords"
      ]
    }
  ],
  "suggested_slug": "login-session",
  "suggested_covers": [],
  "next": "/orc-wiki update wiki/orc-feature-auth-overview.md",
  "note": "the suggested covers are a STARTING POINT derived from path names, never an answer — the user corrects them before anything is scanned."
};

module.exports.wikiRefs = {
  "ok": true,
  "mode": "check",
  "registration": "drifted",
  "items": [
    {
      "id": "registration",
      "state": "drifted",
      "what": "registration is DRIFTED",
      "fix": "orc wiki sync",
      "cost": "free"
    },
    {
      "id": "reserved",
      "state": "outstanding",
      "what": "1 reserved row with no scan behind it: wiki/orc-feature-remittance-overview.md",
      "fix": "/orc-wiki update wiki/orc-feature-remittance-overview.md",
      "cost": "money"
    },
    {
      "id": "orientation",
      "state": "missing",
      "what": "wiki/orc-orientation.md does not exist — it is the page every consumer reads first",
      "fix": "/orc-wiki refresh wiki/orc-orientation.md",
      "cost": "free"
    },
    {
      "id": "architecture",
      "state": "absent",
      "what": "no architecture overview — optional, and a small wiki may not need one",
      "fix": null,
      "cost": "free"
    },
    {
      "id": "claude-md",
      "state": "missing",
      "what": "no CLAUDE.md — future sessions are never told the wiki exists",
      "fix": "/orc-wiki (the pointer-injection step)",
      "cost": "free"
    },
    {
      "id": "crosslink",
      "state": "clean",
      "what": "every crosslink tag's anchor still exists",
      "fix": null,
      "cost": "free"
    }
  ],
  "open": [
    "registration",
    "reserved",
    "orientation",
    "claude-md"
  ],
  "repaired": [],
  "clean": false,
  "note": "only registration is repaired here, because `orc wiki sync` is free and already the single writer of wiki-meta.json and INDEX.md. Everything else is REPORTED with its command — a sweep that silently regenerated prose would be spending money nobody asked it to spend."
};

module.exports.wikiResolveAmbiguous = {
  "ok": true,
  "topic": "invoice",
  "terms": [
    "invoice"
  ],
  "verdict": "ambiguous",
  "match": null,
  "candidates": [
    {
      "file": "wiki/orc-feature-billing-overview.md",
      "area": "billing",
      "title": "billing Overview",
      "keywords": [
        "invoice",
        "charge"
      ],
      "covers": [
        "src/billing/**"
      ],
      "score": 4,
      "why": [
        "invoice in keywords"
      ]
    },
    {
      "file": "wiki/orc-feature-payments-overview.md",
      "area": "payments",
      "title": "payments Overview",
      "keywords": [
        "invoice",
        "refund"
      ],
      "covers": [
        "src/billing/**"
      ],
      "score": 4,
      "why": [
        "invoice in keywords"
      ]
    }
  ],
  "suggested_slug": "login-session",
  "suggested_covers": [],
  "next": "ask which doc this belongs to — two or more cover it about equally",
  "note": "the suggested covers are a STARTING POINT derived from path names, never an answer — the user corrects them before anything is scanned."
};
