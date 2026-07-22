"use strict";
/**
 * onboarding-content.js — the single source for `orc onboarding`. One ordered
 * list of sections; the CLI renders a menu (TTY) or prints them all (piped).
 * Keeping the content here (not inline in cli.js) means the help/init pointers
 * to `orc onboarding` can't drift from the walkthrough itself.
 *
 * Each section: { id, title, lines: string[] } — `lines` is plain text; the CLI
 * adds the styled header. `{cmd}` is styled by the renderer.
 */

const SECTIONS = [
  {
    id: "overview",
    title: "① What ORC is",
    lines: [
      "ORC is a CONSTELLATION of Claude Code skills, slash commands, and",
      "model-pinned subagents — NOT a runtime. The `orc` CLI only installs those",
      "files into your project's .claude/ directory; Claude Code reads and follows",
      "them to run a build pipeline:",
      "",
      "   intake → analyze → plan → score → parallel subagents → review → verify → ship",
      "",
      "Every unit of work is done by a spawned subagent whose model is scored to the",
      "task. The main session orchestrates; it never implements.",
    ],
  },
  {
    id: "install",
    title: "② Install & init",
    lines: [
      "  orc init                 install into ./.claude (this project)",
      "  orc init --global        install into ~/.claude (all projects)",
      "  orc where                show exactly where files land",
      "",
      "init merges two guards into .claude/settings.json (non-destructively):",
      "  • a PreToolUse effort hard-block (keeps /orc on a capable tier)",
      "  • a statusline model warning (❌ ORC WILL DEGRADE on the wrong tier)",
      "Run your MAIN session on Opus 4.8 high (or Fable 5) — subagents can't exceed it.",
    ],
  },
  {
    id: "first-run",
    title: "③ Your first run",
    lines: [
      "  /orc <request>       full pipeline: analyze · plan · score · review · verify · ship",
      "  /orc-mini <request>  fast lane: one Sonnet 5 subagent, no review/verify",
      "  /orc-fast <request>  fastest: needs a fresh wiki + cached pattern (else falls to mini)",
      "",
      "Session-tier acceptance (the statusline verdict):",
      "  ✔ ORC-ready     Opus 4.8 high            (the baseline)",
      "  🚀 ORC-boosted  Opus 4.8 xhigh/max, or   Fable 5 medium…max (does better)",
      "  ✖ WILL DEGRADE  anything below           (wrong model or sub-baseline effort)",
    ],
  },
  {
    id: "lanes",
    title: "④ Lanes cheat-sheet (14 commands)",
    lines: [
      "  /orc           full orchestrated pipeline",
      "  /orc-mini      lightweight single-subagent build",
      "  /orc-fast      knowledge-gated single-executor build (wiki + pattern)",
      "  /orc-ultra     max rigor: + advisor + 3 judgment gates",
      "  /orc-diy       your own composed flow (configure via `orc diy`)",
      "  /orc-analyze   turn a doc/requirement into a code-grounded spec",
      "  /orc-plan      turn a spec/request into a grounded task plan",
      "  /orc-poly      cross-repo PLANNER (host + peers; never builds)",
      "  /orc-verify    verify the git-modified changes (read-only)",
      "  /orc-wiki      build/maintain the project knowledge base",
      "  /orc-pattern   learn & cache your code conventions per language",
      "  /orc-claude    build/refresh this repo's CLAUDE.md",
      "  /orc-learn     per-feature onboarding docs (local, git-ignored)",
      "  /orc-retro     mine behavior traces → calibration report",
    ],
  },
  {
    id: "config",
    title: "⑤ Config (`orc config`)",
    lines: [
      "Config is a CLI concern (zero model tokens). Edit via the interactive menu",
      "or `orc config set <key> <value>`; overrides live in .claude/orc.config.yaml",
      "and survive every update/upgrade.",
      "",
      "Groups:",
      "  Common   waves, pauses, scoring granularity, analysis depth, tests,",
      "           pattern gate, security pass",
      "  Fable 5  fable5_enabled / fable5_effort / fable5_roles — HARD-GATED role",
      "           override: route analyze/plan/advisor/judge/review to Fable 5 agents",
      "           (nothing happens unless fable5_enabled: true AND roles are selected)",
      "  Advanced dirs, crosslink day-tiers, orchestrator model, log dir",
    ],
  },
  {
    id: "knowledge",
    title: "⑥ Knowledge systems (paid vs free)",
    lines: [
      "  wiki      (/orc-wiki)     PAID scan → persistent knowledge base. Registration",
      "                            (`orc wiki sync`) is FREE and derived from the docs.",
      "  pattern   (/orc-pattern)  PAID scan → cached per-language conventions executors",
      "                            match. Probe existence free: `orc pattern status <lang>`.",
      "  crosslink (`orc crosslink`) FREE graph config → advisory cross-repo wiki hints;",
      "                            never blocks, reads foreign WIKI only (never source).",
      "",
      "Precedence everywhere: code > fresh wiki > stale wiki (hints) > model priors.",
    ],
  },
  {
    id: "upgrade",
    title: "⑦ Upgrade & after-upgrade",
    lines: [
      "  orc upgrade    fetch the latest package (network), THEN apply it. Tries the",
      "                 last source that worked, then the tarball, then the github: spec.",
      "  orc update     re-copy the already-installed templates (offline).",
      "  orc doctor     read-only health report (version skew, orphans, settings wiring).",
      "  orc doctor --fix   = update + prune + settings re-merge.",
      "",
      "PRUNE removes files ORC used to ship but no longer does — only ones a previous",
      "install manifest proves ORC owned. Your files, patterns, wiki, configs are never",
      "touched. Your .claude/orc.config.yaml overrides always survive.",
    ],
  },
  {
    id: "troubleshooting",
    title: "⑧ Troubleshooting",
    lines: [
      "  \"/orc blocked — required effort not met\"",
      "     → switch the session to high effort (or Fable 5 medium+). xhigh/max also pass.",
      "  statusline says \"WILL DEGRADE\"",
      "     → wrong model/effort, or a usage window ≥90%. Move to Opus 4.8 high / Fable 5.",
      "  \"wiki: UNREGISTERED\"",
      "     → docs exist but no manifest. Run `orc wiki sync` (instant, no re-scan).",
      "  /orc-diy \"blocked — no compiled flow\"",
      "     → run `orc diy init`, shape it, then `orc diy compile`.",
      "  an agent ran on the wrong model",
      "     → the main session's tier caps subagents; run it on Opus 4.8 (or Fable 5).",
    ],
  },
];

module.exports = { SECTIONS };
