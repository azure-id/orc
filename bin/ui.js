"use strict";
/**
 * ui.js — a tiny zero-dependency terminal UI kit shared by the orc CLI.
 *
 * Rules that keep automated callers safe:
 *  - COLOR is emitted ONLY on a real TTY and only when NO_COLOR is unset. Piped
 *    output (tests, `| cat`, CI) is byte-identical to the plain text — no ANSI.
 *  - GLYPHS fall back to ASCII on a console that can't render UTF-8 (legacy
 *    Windows cmd without a UTF-8 codepage), detected conservatively.
 * Nothing here changes the machine-stable command outputs (`where`,
 * `pattern status`, `doctor` exit codes) — it only styles human-facing text.
 */

const useColor =
  !!process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const wrap = (code) => (s) =>
  useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s);

const color = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  gray: wrap(90),
};

// UTF-8-capable console? Windows Terminal / VS Code / a UTF-8 codepage set it;
// bare legacy cmd.exe does not. Non-Windows is always fine.
const unicodeOk =
  process.platform !== "win32" ||
  !!(
    process.env.WT_SESSION ||
    process.env.TERM_PROGRAM ||
    /utf-?8/i.test(process.env.PYTHONIOENCODING || "") ||
    process.env.ConEmuTask
  );

const glyph = {
  ok: unicodeOk ? "✔" : "OK",
  warn: unicodeOk ? "⚠" : "!",
  bad: unicodeOk ? "✖" : "x",
  arrow: unicodeOk ? "→" : "->",
  bullet: unicodeOk ? "•" : "*",
};

// Section header: a bold title with an underline the same visible width.
function header(title) {
  return "\n" + color.bold(title) + "\n" + color.gray("─".repeat(strip(title).length));
}

// Strip ANSI so width math is correct.
function strip(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}

// Aligned two-column key/value rows: [[key, value, note?], …].
function kv(rows, { indent = "  " } = {}) {
  const pad = Math.max(0, ...rows.map((r) => strip(String(r[0])).length));
  return rows
    .map((r) => {
      const key = String(r[0]);
      const gap = " ".repeat(pad - strip(key).length + 2);
      const note = r[2] ? "  " + color.gray(r[2]) : "";
      return `${indent}${key}${gap}${r[1]}${note}`;
    })
    .join("\n");
}

// A light box around a block of lines (for "next steps" call-outs).
function box(lines) {
  const width = Math.max(0, ...lines.map((l) => strip(l).length));
  const bar = unicodeOk ? "─" : "-";
  const top = unicodeOk ? "┌" + bar.repeat(width + 2) + "┐" : "+" + bar.repeat(width + 2) + "+";
  const bot = unicodeOk ? "└" + bar.repeat(width + 2) + "┘" : "+" + bar.repeat(width + 2) + "+";
  const side = unicodeOk ? "│" : "|";
  const mid = lines.map((l) => `${side} ${l}${" ".repeat(width - strip(l).length)} ${side}`);
  return [top, ...mid, bot].map((l) => color.gray(l)).join("\n");
}

const mark = {
  ok: (s) => color.green(glyph.ok) + " " + s,
  warn: (s) => color.yellow(glyph.warn) + " " + s,
  bad: (s) => color.red(glyph.bad) + " " + s,
};

module.exports = { color, glyph, header, kv, box, mark, strip, useColor, unicodeOk };
