"use strict";
// ── orc graph — EXTRACTION (v1.8.0 W2 · v1.8.2 W1) ──────────────────────────
//
// One source file in, one record out: imports, symbols (with line ranges and a
// body hash), the calls each symbol makes, and the side effects it has (SQL,
// db, HTTP, env, fs). No model, no dependency.
//
// THE LADDER (D3)
//
//   1. BORROWED TOOLCHAIN — Python's own `ast` module, when a Python ≥3.8 runs
//      on this machine. Exact symbols, ranges, calls and imports. One
//      subprocess for the whole batch.
//   2. HEURISTIC — a comment/string MASK first (so a call inside a comment or a
//      string is never a call), then per-language declaration patterns, brace
//      or indentation matching for the body, and a call scan.
//
//   TypeScript's own parser is NOT borrowed in this release: no TypeScript was
//   available to test it against, and an untested extractor is worse than an
//   honest heuristic. `ORC_GRAPH_NO_BORROW=1` forces rung 2 (tests use it).
//
// What the record promises, and what it does not:
//   - `body_hash` changes when THIS symbol's text changes, and not when another
//     symbol in the same file changes. Notes (W4) key on it.
//   - calls are NAMES, not targets. Resolution is `graph-query.js`'s job, and it
//     is computed on read.
//   - dynamic dispatch, reflection, macros and eval are invisible. The graph is
//     a LOCATOR; the code is still the truth.
//
// v1.8.2 W1 — ROUTES ARE EDGES (R3-C). A caller that reaches a symbol through a
// URL had no edge, and the card was silent about eleven route-level tests. Four
// additions, all NAMES again, resolved on read by `graph-query.js`:
//   - `urls[]` on a symbol: every string literal that is the URL of an
//     HTTP-shaped call (`request(app).get("/p")`, `client.post("/p")`,
//     `fetch("/p", {method})`, `httptest.NewRequest("GET", "/p")`), with its
//     method. A `BASE + "/p"` is recorded as a SUFFIX (prefix unknown).
//   - `mounts[]` on a module symbol: `app.use("/orders", ordersRouter)`,
//     `include_router(r, prefix=)`, `register_blueprint(bp, url_prefix=)`,
//     Django `path("api/", include("x"))` — a prefix and the NAME it mounts.
//   - decorator routes: `@Get(":id")`, `@router.get("/p")`, `@GetMapping`,
//     `[HttpGet]`, `#[Route]` — the decorated function KEEPS its symbol and gains
//     `route`; an alias ROUTE symbol named `<METHOD> <path>` points at it
//     (`handler`) and CALLS it, so every walk reaches the handler with no
//     special case. A same-file or same-class prefix (`@Controller("orders")`,
//     `APIRouter(prefix=)`, `Blueprint(url_prefix=)`) is folded into the name
//     here; a prefix from ANOTHER file is a mount, applied on read.
//   - registration routes with a handler passed BY NAME: `mux.HandleFunc("/p",
//     h)`, `r.GET("/p", h)`, `Route::get('/p', [C::class, 'm'])`, Django
//     `path("p/", views.x)` and Express `router.get("/p", handler)`.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// @3 (W9): route handlers are symbols, and a function passed BY NAME is a `ref`.
// @4 (EW1): every record says how much of the file the extractor actually saw.
// @5 (v1.8.2 W1): urls, mounts, decorator routes, `handler` on a route alias.
const HEURISTIC = "heuristic@6";
const MAX_CALLS_PER_SYMBOL = 200;
const MAX_EFFECTS_PER_SYMBOL = 12;
const MAX_URLS_PER_SYMBOL = 200;

const KW = new Set(
  (
    "if for while switch catch function return typeof sizeof def class elif with not and or in " +
    "await yield case new throw else do try foreach using lock fixed func go defer select range " +
    "match fn when elseif isset empty unset array list print echo import export from lambda assert " +
    "del pass raise except finally is this self super base var let const delete instanceof " +
    "require_once include_once require include die exit"
  ).split(" ")
);

// A declaration NAME is checked against its own language's keywords only. The
// shared `KW` set above is for CALL heads, where `list(` in Python is a
// builtin — but `list()` is an ordinary method on a TypeScript controller,
// and W1's Nest fixture lost it to the PHP `list` construct.
const LANG_KW = {
  js: new Set("if for while switch catch function return typeof await yield case new throw else do try instanceof void this super with class export import default extends".split(" ")),
  go: new Set("func if for switch case return range go defer select type var const map chan struct interface".split(" ")),
  java: new Set("if for while switch catch return new throw try do synchronized this super".split(" ")),
  cs: new Set("if for while switch catch return new throw try do using lock fixed foreach this base".split(" ")),
  php: new Set("if for while switch catch return new throw foreach isset empty unset array list print echo require include function".split(" ")),
  // W5 (G6). Each list is that language's control words only — a name a real
  // declaration can never carry. `get` is a Ktor route and a Ruby method, so
  // it is never in one of these sets.
  rb: new Set("if elsif unless while until for case when begin rescue ensure end def class module do then return yield super self nil true false and or not".split(" ")),
  rs: new Set("if else match loop while for return break continue let mut fn impl struct enum trait mod use pub crate self super where as move ref unsafe".split(" ")),
  kt: new Set("if else when while for return break continue val var fun class object interface is in as by try catch finally throw this super companion".split(" ")),
  c: new Set("if else switch case for while do return break continue goto sizeof typedef struct union enum static extern const inline register volatile new delete throw try catch template typename namespace using operator".split(" ")),
};
LANG_KW.ts = LANG_KW.js;
LANG_KW.vue = LANG_KW.js;
LANG_KW.svelte = LANG_KW.js;
const isKw = (lang, name) => (LANG_KW[lang] || KW).has(name);
// A class MEMBER can be called `delete`, `get`, `of` or `list`; only a control
// word that a failed body skip could expose is refused there.
const MEMBER_KW = new Set("if for while switch catch return function typeof throw else do try".split(" "));

const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete", "del", "head", "options"]);
const VERB_OF = (v) => (v === "del" ? "DELETE" : String(v).toUpperCase());

// ── text utilities ──────────────────────────────────────────────────────────
function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineOf(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

const clip = (s, n = 80) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

const hash = (s) => crypto.createHash("sha1").update(String(s).replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

// ── N1 (v1.8.2 W4): doc notes at 0 model tokens ─────────────────────────────
// Layer 2 pays a subagent for one sentence about a function. For a documented
// function that sentence is ALREADY THERE — a docstring, a JSDoc block, a
// `///` run, a `#` run — and the extractor is reading the bytes anyway.
//
// It is a NOTE, not a fact. A comment can lie and a comment can rot, which is
// why the precedence line puts `doc` beside graph notes, below a stale wiki,
// and why a MODEL note outranks the doc note for the same symbol. The body
// hash rule is the same: a doc is shown only while the body hashes the same,
// and since it is re-extracted with the body it can never be stale on its own.
const DOC_MAX = 240;
// The first line that is a TAG ends the sentence: `@param`, `:returns:`,
// `Args:`. Nobody wants half a parameter table as the summary of a function.
const DOC_TAG = /^\s*(?:[@\\][A-Za-z]|:(?:param|type|returns?|raises?|rtype|arg)\b|(?:Args|Arguments|Returns?|Raises?|Yields?|Params?|Parameters|Example|Examples|Note|Notes|Attributes|See Also|Usage|Todo|TODO)\s*:|[-=*_]{3,}\s*$)/;

function docText(lines) {
  const buf = [];
  for (const raw of lines) {
    if (DOC_TAG.test(raw)) break;
    buf.push(raw);
  }
  let t = buf.join(" ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  // The FIRST sentence. `Math.max` guards an abbreviation at the very start.
  const m = /^([\s\S]*?[.!?])(?:\s|$)/.exec(t);
  if (m && m[1].length >= 12) t = m[1];
  t = t.replace(/^[*/#\s]+/, "").trim();
  return t.length > DOC_MAX ? t.slice(0, DOC_MAX - 1) + "…" : t;
}

// Python: the docstring is the first thing INSIDE the body.
function pyDoc(lines, d) {
  let i = d.s - 1; // 0-based index of the `def` line
  const lim = Math.min(lines.length, d.s + 8);
  while (i < lim && !/:\s*(?:#.*)?$/.test(lines[i] || "")) i++;
  i++;
  while (i < lim && !(lines[i] || "").trim()) i++;
  const first = (lines[i] || "").trim();
  const q = /^[rRbBuUfF]{0,2}("""|''')/.exec(first);
  if (!q) return "";
  const open = first.indexOf(q[1]) + 3;
  const rest = first.slice(open);
  const close = rest.indexOf(q[1]);
  if (close >= 0) return docText([rest.slice(0, close)]);
  const buf = [rest];
  for (let j = i + 1; j < Math.min(lines.length, i + 16); j++) {
    const ln = lines[j] || "";
    const e = ln.indexOf(q[1]);
    if (e >= 0) {
      buf.push(ln.slice(0, e));
      break;
    }
    buf.push(ln);
  }
  return docText(buf);
}

// Everything else: the comment block immediately ABOVE, past any decorators.
function aboveDoc(lines, d) {
  let i = d.s - 2; // 0-based index of the line above the definition
  const skip = (t) => !t || /^@/.test(t) || /^\[[A-Za-z]/.test(t) || /^#\[/.test(t);
  while (i >= 0 && skip((lines[i] || "").trim())) i--;
  if (i < 0) return "";
  const t = (lines[i] || "").trim();
  if (/\*\/$/.test(t)) {
    const buf = [];
    let j = i;
    for (; j >= 0 && j > i - 40; j--) {
      const s = (lines[j] || "").trim();
      buf.unshift(s.replace(/\*\/\s*$/, "").replace(/^\/\*+!?/, "").replace(/^\*+\/?\s?/, ""));
      if (/^\/\*/.test(s)) break;
    }
    return j < 0 ? "" : docText(buf);
  }
  const head = /^\/\//.test(t) ? "//" : /^#/.test(t) ? "#" : /^--/.test(t) ? "--" : null;
  if (!head) return "";
  const strip = head === "//" ? /^\/\/+[!/]?\s?/ : head === "#" ? /^#+!?\s?/ : /^-{2,}!?\s?/;
  const buf = [];
  for (let j = i; j >= 0 && j > i - 20 && (lines[j] || "").trim().startsWith(head); j--) buf.unshift((lines[j] || "").trim().replace(strip, ""));
  return docText(buf);
}

const DOC_KINDS = new Set(["function", "method", "route"]);

function docFor(lines, lang, d) {
  if (!DOC_KINDS.has(d.kind)) return "";
  try {
    // Python first looks INSIDE (the docstring), then above (a `#` block) —
    // measured on django, the `#` block above is the only other place a Python
    // author writes the sentence.
    if (lang === "py") return pyDoc(lines, d) || aboveDoc(lines, d) || "";
    return aboveDoc(lines, d) || "";
  } catch (_) {
    return ""; // a doc is a nicety; it never fails an extraction
  }
}

// Replace comment and string CONTENT with spaces, keeping every newline and
// every offset. Declarations and calls are found in the mask; string text (for
// SQL and URLs) is read back from the original at the recorded spans.
function mask(src, lang) {
  const slash = lang !== "py" && lang !== "rb";
  const hashC = lang === "py" || lang === "php" || lang === "rb";
  const block = lang !== "py" && lang !== "rb";
  // A Ruby backtick runs a shell command, so its content is a string. A Kotlin
  // backtick quotes an IDENTIFIER (`fun \`adds an order\`()`), so it is code.
  const backtick = lang === "js" || lang === "ts" || lang === "go" || lang === "rb";
  const m = src.split("");
  const n = src.length;
  const strings = [];
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (m[k] !== "\n" && m[k] !== "\r") m[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if ((slash && c === "/" && c2 === "/") || (hashC && c === "#" && !(lang === "php" && c2 === "["))) {
      const e = src.indexOf("\n", i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (block && c === "/" && c2 === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
      continue;
    }
    // W5 (G6). Ruby `=begin` … `=end` is a block comment, at column 0 only.
    if (lang === "rb" && src.startsWith("=begin", i) && (i === 0 || src[i - 1] === "\n")) {
      const e = src.indexOf("\n=end", i);
      const end = e < 0 ? n : src.indexOf("\n", e + 1) < 0 ? n : src.indexOf("\n", e + 1);
      blank(i, end);
      i = end;
      continue;
    }
    // W5 (G6). A Rust raw string `r"…"` / `r#"…"#`, and a Rust LIFETIME or
    // char literal. `&'a str` opens a quote that never closes, and without
    // this rule the mask blanks the rest of the line — the same class of loss
    // G5 fixed for regex literals.
    if (lang === "rs" && c === "r" && (c2 === '"' || c2 === "#")) {
      let h = 0;
      while (src[i + 1 + h] === "#") h++;
      if (src[i + 1 + h] === '"') {
        const close = '"' + "#".repeat(h);
        const e = src.indexOf(close, i + 2 + h);
        const end = e < 0 ? n : e;
        strings.push({ start: i + 2 + h, end });
        blank(i + 2 + h, end);
        i = e < 0 ? n : e + close.length;
        continue;
      }
    }
    if (lang === "rs" && c === "'" && /[A-Za-z_]/.test(c2 || "") && src[i + 2] !== "'") {
      i++;
      continue;
    }
    // W5 (G6). A Kotlin raw string is `"""…"""`.
    if (lang === "kt" && src.startsWith('"""', i)) {
      const e = src.indexOf('"""', i + 3);
      const end = e < 0 ? n : e;
      strings.push({ start: i + 3, end });
      blank(i + 3, end);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (lang === "py" && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.substr(i, 3);
      const e = src.indexOf(q, i + 3);
      const end = e < 0 ? n : e;
      strings.push({ start: i + 3, end });
      blank(i + 3, end);
      i = e < 0 ? n : e + 3;
      continue;
    }
    // W2 (G5): a regex literal is masked like a string, so the `/` inside
    // `/\/\*/` cannot open a bogus comment and `str.match(/x/)` is one call.
    // Only where a regex can start: after an operator, a bracket, a comma, a
    // line start, or a keyword — never after a name, a number or `)` (division).
    if ((lang === "js" || lang === "ts") && c === "/" && c2 !== "/" && c2 !== "*") {
      let k = i - 1;
      while (k >= 0 && (m[k] === " " || m[k] === "\t")) k--;
      const prev = k >= 0 ? m[k] : "\n";
      let ok = k < 0 || "(,=:[!&|?{};\n+-*%<>~^".includes(prev);
      if (!ok && /[A-Za-z_$]/.test(prev)) {
        let w = k;
        while (w >= 0 && /[A-Za-z_$]/.test(m[w])) w--;
        ok = /^(return|typeof|instanceof|in|of|delete|void|throw|case|do|else|yield|await)$/.test(m.slice(w + 1, k + 1).join(""));
      }
      if (ok) {
        let j = i + 1;
        let cls = false;
        while (j < n && src[j] !== "\n") {
          const d = src[j];
          if (d === "\\") {
            j += 2;
            continue;
          }
          if (cls) {
            if (d === "]") cls = false;
          } else if (d === "[") cls = true;
          else if (d === "/") break;
          j++;
        }
        if (j < n && src[j] === "/") {
          blank(i + 1, j);
          i = j + 1;
          continue;
        }
      }
    }
    if (c === '"' || c === "'" || (backtick && c === "`")) {
      const verbatim = lang === "cs" && src[i - 1] === "@";
      const raw = c === "`" && lang === "go";
      // W2 (G5): a template literal's `${…}` and an f-string's `{…}` are CODE:
      // `${fn()}` is a call, and `f"{base}/p"` keeps its expression. The
      // string is recorded as segments around each expression, and the
      // expression is masked on its own (a string inside it is still a string).
      const tpl = (c === "`" && !raw) || (lang === "rb" && c !== "'");
      const fstr = lang === "py" && c !== "`" && /^[fF]$|^[rRbB][fF]$|^[fF][rRbB]$/.test(((src[i - 2] || "") + (src[i - 1] || "")).replace(/^[^A-Za-z]/, ""));
      let j = i + 1;
      let seg = i + 1;
      while (j < n) {
        const d = src[j];
        if (d === "\\" && !verbatim && !raw) {
          j += 2;
          continue;
        }
        if (d === c) {
          if (verbatim && src[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        // A quote that never closes on its line is not a string (a regex
        // literal, an apostrophe in a template): stop at the line end so one
        // bad guess costs one line, not the rest of the file.
        if (d === "\n" && c !== "`" && !verbatim) break;
        // A Ruby interpolation opens with `#{`, a JS template with `${`.
        if ((tpl && d === (lang === "rb" ? "#" : "$") && src[j + 1] === "{") || (fstr && d === "{" && src[j + 1] !== "{")) {
          const open = tpl ? j + 1 : j;
          const close = closeBrace(src, open);
          if (close < 0) {
            j++;
            continue;
          }
          strings.push({ start: seg, end: j });
          blank(seg, j);
          const inner = mask(src.slice(open + 1, close), lang);
          for (let q = 0; q < inner.masked.length; q++) m[open + 1 + q] = inner.masked[q];
          for (const s of inner.strings) strings.push({ start: open + 1 + s.start, end: open + 1 + s.end });
          j = close + 1;
          seg = j;
          continue;
        }
        if (fstr && d === "{" && src[j + 1] === "{") {
          j += 2;
          continue;
        }
        j++;
      }
      strings.push({ start: seg, end: Math.min(j, n) });
      blank(seg, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return { masked: m.join(""), strings };
}

// The `}` that closes the brace at `open`, skipping quoted text on the way.
function closeBrace(src, open) {
  let d = 0;
  for (let k = open; k < src.length; k++) {
    const ch = src[k];
    if (ch === '"' || ch === "'" || ch === "`") {
      let q = k + 1;
      while (q < src.length && src[q] !== ch && src[q] !== "\n") q += src[q] === "\\" ? 2 : 1;
      k = q;
      continue;
    }
    if (ch === "{") d++;
    else if (ch === "}") {
      d--;
      if (d === 0) return k;
    }
  }
  return -1;
}

// COVERAGE (EW1). A heuristic extractor can lose the thread: an opening brace
// with no partner makes a declaration run to the end of the file, and a symbol
// that hits a cap keeps only part of what it found. Neither is an error — the
// record is still useful — but the reader must be told which lines are only
// partly seen, or a card that shows nothing reads as "there is nothing".
// One extraction runs at a time, so a module-level note is enough.
let UNBALANCED = -1;
function resetCoverage() {
  UNBALANCED = -1;
}

function matchPair(s, open, a, b) {
  let d = 0;
  for (let k = open; k < s.length; k++) {
    const ch = s[k];
    if (ch === a) d++;
    else if (ch === b) {
      d--;
      if (d === 0) return k;
    }
  }
  // Only a BLOCK that really never closes is a coverage gap. Two other callers
  // land here and neither is one: a parameter list scanned speculatively, and a
  // probe whose start is not the opener at all (`s[open] !== a`), which can
  // never balance. Noting those marked 40% of this repo's own files partial —
  // a signal that fires everywhere says nothing.
  if (a === "{" && s[open] === a && (UNBALANCED < 0 || open < UNBALANCED)) UNBALANCED = open;
  return s.length - 1;
}

// After a parameter list: find the body. `requireArrow` = this is only a
// function if an `=>` follows (a `const x = (a + b)` is not one).
function bodyAfter(m, from, requireArrow) {
  const limit = Math.min(m.length, from + 400);
  for (let k = from; k < limit; k++) {
    const ch = m[k];
    if (ch === "=" && m[k + 1] === ">") {
      let j = k + 2;
      while (j < m.length && /\s/.test(m[j])) j++;
      if (m[j] === "{") return { open: j, end: matchPair(m, j, "{", "}") };
      const nl = m.indexOf("\n", j);
      return { open: j, end: nl < 0 ? m.length - 1 : nl - 1 };
    }
    if (ch === "{") return requireArrow ? null : { open: k, end: matchPair(m, k, "{", "}") };
    if (ch === ";") return requireArrow ? null : { open: k, end: k };
    if (ch === "\n" && requireArrow) {
      let j = k + 1;
      while (j < limit && (m[j] === " " || m[j] === "\t" || m[j] === "\r")) j++;
      if (m[j] !== "=" && m[j] !== ":") return null;
    }
  }
  return null;
}

// ── call arguments (v1.8.2 W1) ──────────────────────────────────────────────
// The mask blanks string CONTENT but keeps the quotes, so an argument that is
// one string reads as `"      "` in the mask and its text is read back from the
// original at the recorded span. Each top-level argument becomes one piece:
//   s     the string text, when the piece IS one string literal
//   id    a bare or dotted identifier (`ordersRouter`, `views.list`, `C::class`)
//   req   the specifier of an inline `require("…")`
//   kw    the keyword when the piece is `name=value` / `name: value`
//   list  the string items of a `[...]` value (`methods=["GET","POST"]`)
//   obj   `{ method: "POST", … }` — the string-valued keys of an object literal
//   inc   Django: the specifier inside an `include("…")` piece
// W5 (G6). Kotlin gives a function either a block body or an EXPRESSION body
// (`fun total() = items.sumOf { it.price }`), and both are real declarations.
// A member of an interface, or an `abstract fun`, has neither and is not one.
function ktBody(m, from) {
  const limit = Math.min(m.length, from + 400);
  for (let k = from; k < limit; k++) {
    const ch = m[k];
    if (ch === "{") return { open: k, end: matchPair(m, k, "{", "}") };
    if (ch === "=" && m[k + 1] !== "=") {
      let j = k + 1;
      while (j < m.length && (m[j] === " " || m[j] === "\t" || m[j] === "\r" || m[j] === "\n")) j++;
      if (m[j] === "{") return { open: j, end: matchPair(m, j, "{", "}") };
      const nl = m.indexOf("\n", j);
      return { open: j, end: nl < 0 ? m.length - 1 : nl - 1 };
    }
    if (ch === "\n") {
      let j = k + 1;
      while (j < limit && (m[j] === " " || m[j] === "\t" || m[j] === "\r")) j++;
      // A `:` return type or a `where` clause continues the header; anything
      // else on the next line means this declaration had no body.
      if (m[j] !== ":" && m[j] !== "{" && m[j] !== "=" && m.slice(j, j + 5) !== "where") return null;
    }
  }
  return null;
}

function firstStringIn(src, strAt, a, b) {
  for (let k = a; k < b; k++) {
    const ch = src[k];
    if (ch !== '"' && ch !== "'" && ch !== "`") continue;
    const sp = strAt.get(k + 1);
    if (sp) return src.slice(sp.start, sp.end);
  }
  return null;
}

function stringsIn(src, strAt, a, b) {
  const out = [];
  for (let k = a; k < b; k++) {
    const ch = src[k];
    if (ch !== '"' && ch !== "'" && ch !== "`") continue;
    const sp = strAt.get(k + 1);
    if (sp) {
      out.push(src.slice(sp.start, sp.end));
      k = sp.end;
    }
  }
  return out;
}

const KW_PIECE = /^\s*([A-Za-z_]\w*)\s*(?:=(?![=>])|:(?!:))\s*([\s\S]*)$/;
const IDENT_PIECE = /^\s*&?\$?((?:[A-Za-z_$][\w$]*\s*(?:\.|->|::)\s*)*[A-Za-z_$][\w$]*)\s*$/;

function argPieces(c, open, close) {
  const { src, m, strAt } = c;
  const pieces = [];
  let depth = 0;
  let a = open + 1;
  for (let k = open + 1; k <= close && k < m.length; k++) {
    const ch = m[k];
    const end = k === close;
    if (!end && (ch === "(" || ch === "[" || ch === "{")) depth++;
    else if (!end && (ch === ")" || ch === "]" || ch === "}")) depth--;
    if (!end && !(ch === "," && depth === 0)) continue;
    const text = m.slice(a, k);
    if (text.trim()) pieces.push(piece(c, a, k, text));
    a = k + 1;
    if (pieces.length >= 8) break;
  }
  return pieces;

  function piece(c, start, end, text) {
    const p = {};
    let body = text;
    let bodyStart = start;
    const kw = KW_PIECE.exec(text);
    if (kw && !/^\s*(new|return|await)\b/.test(kw[2])) {
      p.kw = kw[1];
      body = kw[2];
      bodyStart = start + text.length - kw[2].length;
    }
    const t = body.trim();
    const q = /^\s*(?:[A-Za-z]{1,2}|@)?(["'`])([\s\S]*)\1\s*$/.exec(body);
    if (q && !q[2].includes(q[1])) {
      // ONE string literal. A template literal / f-string with expressions
      // (G5 keeps them as code, so the mask is not blank between the quotes)
      // is rebuilt from its recorded segments, `{}` per expression: `${base}/p`
      // is a suffix, `/orders/${id}` matches a route's parameter segment.
      if (/^\s*$/.test(q[2])) p.s = firstStringIn(src, strAt, bodyStart, end);
      else {
        const segs = c.strings.filter((s) => s.start >= bodyStart && s.end <= end).map((s) => src.slice(s.start, s.end));
        if (segs.length) p.s = segs.join("{}");
      }
    } else if (/^\[[\s\S]*\]$/.test(t)) p.list = stringsIn(src, strAt, bodyStart, end);
    else if (/^\{[\s\S]*\}$/.test(t)) {
      const obj = {};
      const re = /([A-Za-z_]\w*)\s*:\s*(["'`])/g;
      let x;
      while ((x = re.exec(body))) {
        const at = bodyStart + x.index + x[0].length;
        const sp = strAt.get(at);
        if (sp) obj[x[1]] = src.slice(sp.start, sp.end);
      }
      if (Object.keys(obj).length) p.obj = obj;
    } else if (/\+\s*(["'`])[^"'`]*\1\s*$/.test(t)) {
      // `BASE + "/p"` — the TAIL is known, the prefix is not.
      const all = stringsIn(src, strAt, bodyStart, end);
      if (all.length) p.cat = all[all.length - 1];
    } else {
      const req = /^\s*require\s*\(\s*(["'])[^"']*\1\s*\)\s*$/.exec(body);
      if (req) p.req = firstStringIn(src, strAt, bodyStart, end);
      const inc = /^\s*include\s*\(/.exec(body);
      if (inc) p.inc = firstStringIn(src, strAt, bodyStart, end);
      const cls = /\[\s*([A-Za-z_\\][\w\\]*)\s*::\s*class\s*,\s*(["'])[^"']*\2\s*\]/.exec(body);
      if (cls) p.id = cls[1].split("\\").pop() + "." + (firstStringIn(src, strAt, bodyStart, end) || "");
      const id = !p.req && !p.inc && !p.id ? IDENT_PIECE.exec(body) : null;
      if (id && !KW.has(id[1]) && !/^\d/.test(id[1])) p.id = id[1].replace(/\s+/g, "").replace(/->|::/g, ".");
    }
    return p;
  }
}

// What a call's arguments say the RIGHT-HAND assignment target is, when the
// call is `x = f(...)`. Used for router prefixes (`router = APIRouter(prefix=)`)
// here, and for instance aliases in W2.
const ASSIGN_BEFORE = /(?:^|[;{}\n(,:])\s*(?:(?:const|let|var|val|final|public|private|protected|readonly|static|export)\s+)*(?:[A-Za-z_][\w<>\[\],?]*\s+)?((?:\$?[A-Za-z_][\w$]*\s*(?:\.|->)\s*)*\$?[A-Za-z_$][\w$]*)\s*(?::\s*[\w.<>\[\]|?]+\s*)?(?::=|=)\s*(?:new\s+)?$/;
function assignBefore(m, at) {
  const before = m.slice(Math.max(0, at - 120), at);
  const x = ASSIGN_BEFORE.exec(before);
  if (!x) return null;
  let n = x[1].replace(/\s+/g, "").replace(/->/g, ".").replace(/\$/g, "");
  if (/^(this|self)\./.test(n)) n = "self." + n.replace(/^(this|self)\./, "");
  return KW.has(n) ? null : n;
}

// ── declarations: brace languages ───────────────────────────────────────────
function braceDefs(c, lang) {
  const { src, m, starts } = c;
  const defs = [];
  const defParens = new Set();
  // The parens of a route REGISTRATION (`router.get("/p", fn)`): the call
  // stays a call, but its URL is the route's own path, never a URL it reaches.
  const regParens = new Set();
  const classes = [];
  const add = (d) => {
    if (!d.name || isKw(lang, d.name)) return;
    d.s = lineOf(starts, d.from);
    d.e = lineOf(starts, Math.max(d.from, d.to));
    defs.push(d);
  };
  const innermostClass = (pos) => {
    let best = null;
    for (const cl of classes) if (cl.open < pos && pos < cl.to && (!best || cl.to - cl.open < best.to - best.open)) best = cl;
    return best;
  };
  let x;

  if (lang === "js" || lang === "ts") {
    const CLASS = /^[ \t]*(export[ \t]+)?(?:default[ \t]+)?(?:abstract[ \t]+)?class[ \t]+([A-Za-z_$][\w$]*)([^{;]*)\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const to = matchPair(m, open, "{", "}");
      const cl = { name: x[2], qname: x[2], kind: "class", from: x.index, to, open, exported: !!x[1], bases: basesOf(x[3]) };
      classes.push(cl);
      add(cl);
    }
    const FN = /^[ \t]*(export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?function[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)[ \t]*(?:<[^>\n]*>)?[ \t]*\(/gm;
    while ((x = FN.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      defParens.add(paren);
      // `function f(a: A): B;` is an overload SIGNATURE — no body, not a symbol.
      if (!body || m[body.open] === ";") continue;
      add({ name: x[2], qname: x[2], kind: "function", from: x.index, to: body.end, exported: !!x[1] });
    }
    const ARROW = /^[ \t]*(export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*(?:async[ \t]+)?(function\b[^(\n]*\(|\(|[A-Za-z_$][\w$]*[ \t]*=>)/gm;
    while ((x = ARROW.exec(m))) {
      const end = x.index + x[0].length;
      let body;
      if (x[3].endsWith("(")) {
        const paren = end - 1;
        body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, !x[3].startsWith("function"));
        if (body) defParens.add(paren);
      } else {
        body = bodyAfter(m, m.lastIndexOf("=>", end), true);
      }
      if (!body) continue;
      add({ name: x[2], qname: x[2], kind: "function", from: x.index, to: body.end, exported: !!x[1] });
    }
    // Route handlers (Express, Koa, Fastify, Hono): `router.get("/path", mw,
    // (req, res) => { … })`. The handler is anonymous, so without this a route
    // file has NO symbol and its card is an import list — W9 measured 6 files,
    // 1 symbol on an Express app. Named `<METHOD> <path>`; the body is the whole
    // registration call, so the middleware passed to it and every call inside
    // the handler belong to the route. W1: a handler passed BY NAME
    // (`app.get("/p", handler)`) is a route too, when the receiver is a router.
    const ROUTE = /\b([A-Za-z_$][\w$]*)[ \t]*\.[ \t]*(get|post|put|patch|delete|del|all|options|head)[ \t]*\(/g;
    const ROUTER_HEAD = /^(router|app|server|api|routes?|r|fastify|koa|hono|express|v\d+)$/i;
    while ((x = ROUTE.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const pieces = argPieces(c, paren, close);
      const p0 = pieces[0];
      if (!p0 || p0.s == null || p0.kw) continue;
      const routePath = p0.s;
      if (!/^(\/|\*$)/.test(routePath) || /[\r\n]/.test(routePath)) continue;
      // `cache.get("/k")` and `request(app).get("/orders")` pass no handler.
      const fnArg = /=>|\bfunction\b/.test(m.slice(p0 ? paren + 1 : paren, close));
      const namedHandler = !fnArg && pieces.length >= 2 && pieces[pieces.length - 1].id && ROUTER_HEAD.test(x[1]);
      if (!fnArg && !namedHandler) continue;
      regParens.add(paren);
      add({ kind: "route", method: VERB_OF(x[2]), path: routePath, head: x[1], name: "route", from: x.index, to: close, exported: false });
    }
    // Members: scanned inside each class body, skipping every member body it
    // finds, so a statement inside a method is never read as a member.
    // A member starts at a line start, or right after the `{` / `}` / `;`
    // before it — so `class A extends B { go() { … } }` on one line is a
    // class WITH a member (W2: two fixtures and one real repository had it).
    const MEMBER = /(?<=^|[{};])[ \t]*((?:(?:public|private|protected|static|async|readonly|override|abstract|get|set|declare|accessor)[ \t]+)*)\*?[ \t]*(#?[A-Za-z_$][\w$]*)[ \t]*\??[ \t]*(?:<[^>\n]*>)?[ \t]*(\(|(?::[^=\n;]+)?=[ \t]*(?:async[ \t]+)?(?:\(|[A-Za-z_$][\w$]*[ \t]*=>))/gm;
    for (const cl of classes) {
      MEMBER.lastIndex = cl.open + 1;
      while ((x = MEMBER.exec(m)) && x.index < cl.to) {
        const end = x.index + x[0].length;
        let body = null;
        let paren = null;
        if (x[3] === "(") {
          paren = end - 1;
          body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
        } else if (x[3].endsWith("(")) {
          paren = end - 1;
          body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, true);
        } else {
          body = bodyAfter(m, m.lastIndexOf("=>", end), true);
        }
        if (paren != null) defParens.add(paren);
        // A member with no body is an overload signature or an abstract
        // declaration. Recording it made `NestFactoryStatic.create` three
        // symbols on nestjs/nest and every `ctx` on it an ambiguity.
        if (!body || body.end >= cl.to || m[body.open] === ";") {
          if (body && body.end < cl.to) MEMBER.lastIndex = Math.max(body.end + 1, end);
          continue;
        }
        const name = x[2].replace(/^#/, "");
        if (!MEMBER_KW.has(name)) {
          const priv = /private|protected/.test(x[1]) || x[2].startsWith("#");
          add({ name, qname: `${cl.name}.${name}`, kind: "method", from: x.index, to: body.end, exported: cl.exported && !priv, member: true, owner: cl });
        }
        MEMBER.lastIndex = Math.max(body.end + 1, end);
      }
    }
  } else if (lang === "go") {
    const TYPE = /^type[ \t]+([A-Za-z_]\w*)(?:\[[^\]]*\])?[ \t]+(?:struct|interface)[ \t]*\{/gm;
    while ((x = TYPE.exec(m))) {
      const open = x.index + x[0].length - 1;
      add({ name: x[1], qname: x[1], kind: "class", from: x.index, to: matchPair(m, open, "{", "}"), exported: /^[A-Z]/.test(x[1]) });
    }
    const FUNC = /^func[ \t]*(?:\([ \t]*\w*[ \t]*\*?[ \t]*([A-Za-z_]\w*)(?:\[[^\]]*\])?[ \t]*\)[ \t]*)?([A-Za-z_]\w*)[ \t]*(?:\[[^\]]*\])?[ \t]*\(/gm;
    while ((x = FUNC.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const nextFunc = m.indexOf("\nfunc", close);
      const brace = m.indexOf("{", close);
      if (brace < 0 || (nextFunc >= 0 && brace > nextFunc)) continue;
      defParens.add(paren);
      const recv = x[1];
      add({
        name: x[2],
        qname: recv ? `${recv}.${x[2]}` : x[2],
        kind: recv ? "method" : "function",
        from: x.index,
        to: matchPair(m, brace, "{", "}"),
        exported: /^[A-Z]/.test(x[2]),
      });
    }
    // W1: net/http, gin, echo, chi registrations with a handler BY NAME. A Go
    // 1.22 pattern carries its method in the string (`"GET /orders"`).
    const GOROUTE = /\b([A-Za-z_]\w*)[ \t]*\.[ \t]*(HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Any|Get|Post|Put|Patch|Delete|Head|Options)[ \t]*\(/g;
    while ((x = GOROUTE.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const pieces = argPieces(c, paren, close);
      if (pieces.length < 2 || pieces[0].s == null) continue;
      let method = /^(HandleFunc|Handle|Any)$/.test(x[2]) ? "ANY" : x[2].toUpperCase();
      let routePath = pieces[0].s;
      const pat = /^([A-Z]+)\s+(\/\S*)$/.exec(routePath);
      if (pat) {
        method = pat[1];
        routePath = pat[2];
      }
      if (!routePath.startsWith("/")) continue;
      regParens.add(paren);
      add({ kind: "route", method, path: routePath, head: x[1], name: "route", from: x.index, to: close, exported: false });
    }
  } else if (lang === "java" || lang === "cs") {
    const CLASS = /^[ \t]*((?:(?:public|private|protected|internal|static|abstract|final|sealed|partial|readonly|unsafe)[ \t]+)*)(?:class|interface|enum|record|struct)[ \t]+([A-Za-z_]\w*)([^{;]*)\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const to = matchPair(m, open, "{", "}");
      const cl = { name: x[2], qname: x[2], kind: "class", from: x.index, to, open, exported: /public/.test(x[1]), bases: basesOf(x[3]) };
      classes.push(cl);
      add(cl);
    }
    const METHOD = /^[ \t]*((?:(?:public|private|protected|internal|static|final|abstract|synchronized|async|virtual|override|sealed|extern|unsafe|new|default|native|strictfp)[ \t]+)*)(?:<[^>\n]+>[ \t]+)?([\w<>\[\],.?]+(?:[ \t]*<[^>\n]*>)?)[ \t]+([A-Za-z_]\w*)[ \t]*(?:<[^>\n]*>)?[ \t]*\(/gm;
    while ((x = METHOD.exec(m))) {
      const typeWord = x[2].split(/[<.\[]/)[0];
      if (KW.has(typeWord) || isKw(lang, x[3])) continue;
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      if (!body || (m[body.open] === ";" && !/abstract|extern|native/.test(x[1]))) continue;
      defParens.add(paren);
      const owner = innermostClass(x.index);
      add({
        name: x[3],
        qname: owner ? `${owner.name}.${x[3]}` : x[3],
        kind: owner ? "method" : "function",
        from: x.index,
        to: body.end,
        exported: /public/.test(x[1]),
        owner,
      });
    }
    const CTOR = /^[ \t]*(?:(?:public|private|protected|internal)[ \t]+)([A-Z]\w*)[ \t]*\(/gm;
    while ((x = CTOR.exec(m))) {
      const owner = innermostClass(x.index);
      if (!owner || owner.name !== x[1]) continue;
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      if (!body) continue;
      defParens.add(paren);
      add({ name: x[1], qname: `${owner.name}.${x[1]}`, kind: "method", from: x.index, to: body.end, exported: /public/.test(x[0]), owner });
    }
  } else if (lang === "php") {
    const CLASS = /^[ \t]*(?:(?:abstract|final|readonly)[ \t]+)*(?:class|interface|trait|enum)[ \t]+([A-Za-z_]\w*)([^{;]*)\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const to = matchPair(m, open, "{", "}");
      const cl = { name: x[1], qname: x[1], kind: "class", from: x.index, to, open, exported: true, bases: basesOf(x[2]) };
      // `use Trait;` inside the body is a base too.
      for (const u of m.slice(open, to).matchAll(/^[ \t]*use[ \t]+([A-Za-z_\\][\w\\, \t]*);/gm))
        for (const t of u[1].split(",")) if (t.trim()) cl.bases.push(t.trim().split("\\").pop());
      classes.push(cl);
      add(cl);
    }
    const FUNC = /^[ \t]*((?:(?:public|private|protected|static|abstract|final)[ \t]+)*)function[ \t]+&?([A-Za-z_]\w*)[ \t]*\(/gm;
    while ((x = FUNC.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      if (!body) continue;
      defParens.add(paren);
      const owner = innermostClass(x.index);
      add({
        name: x[2],
        qname: owner ? `${owner.name}.${x[2]}` : x[2],
        kind: owner ? "method" : "function",
        from: x.index,
        to: body.end,
        exported: !/private|protected/.test(x[1]),
        owner,
      });
    }
    // Laravel: `Route::get('/p', [OrdersController::class, 'index'])`.
    const LARAVEL = /\bRoute[ \t]*::[ \t]*(get|post|put|patch|delete|any|options)[ \t]*\(/g;
    while ((x = LARAVEL.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const pieces = argPieces(c, paren, close);
      if (!pieces[0] || pieces[0].s == null) continue;
      regParens.add(paren);
      add({ kind: "route", method: x[1] === "any" ? "ANY" : VERB_OF(x[1]), path: pieces[0].s, head: "Route", name: "route", from: x.index, to: close, exported: false });
    }
  } else if (lang === "rs") {
    // W5 (G6). A Rust type is a `struct`, `enum`, `trait` or `union`; its
    // methods live in an `impl` block somewhere else in the file, so the impl
    // block — not the type — is what owns a method.
    const TYPE = /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?(?:struct|enum|trait|union)[ \t]+([A-Za-z_]\w*)/gm;
    while ((x = TYPE.exec(m))) {
      const brace = m.indexOf("{", x.index + x[0].length);
      const semi = m.indexOf(";", x.index + x[0].length);
      const unit = semi >= 0 && (brace < 0 || semi < brace);
      const cl = { name: x[1], qname: x[1], kind: "class", from: x.index, to: unit ? semi : brace < 0 ? x.index : matchPair(m, brace, "{", "}"), exported: /pub/.test(x[0]), bases: [] };
      add(cl);
      // A `trait` body owns its DEFAULT methods, which is what makes
      // `self.ok(…)` on an implementing struct an inherited call.
      if (!unit && brace >= 0) classes.push({ ...cl, open: brace });
    }
    // `impl Trait for Type {` and `impl<T> Type<T> {` — the owner is the TYPE,
    // which is the last word of the tail.
    const IMPL = /^[ \t]*(?:unsafe[ \t]+)?impl(?:[ \t]*<[^>\n]*>)?[ \t]+([^{\n]+?)[ \t]*\{/gm;
    while ((x = IMPL.exec(m))) {
      const tail = x[1].split(/\bfor\b/).pop();
      const mm = /([A-Za-z_]\w*)/.exec(tail.replace(/<[^>]*>/g, "").replace(/'\w+/g, ""));
      if (!mm) continue;
      const open = x.index + x[0].length - 1;
      classes.push({ name: mm[1], qname: mm[1], kind: "class", from: x.index, to: matchPair(m, open, "{", "}"), open, exported: false, bases: [] });
      // `impl Trait for Type` is Rust's inheritance: the type gains the
      // trait's default methods, so the trait is a BASE of the type.
      const tr = /\bfor\b/.test(x[1]) ? /([A-Za-z_]\w*)/.exec(x[1].split(/\bfor\b/)[0].replace(/<[^>]*>/g, "").replace(/'\w+/g, "")) : null;
      if (tr) for (const d of defs) if (d.kind === "class" && d.name === mm[1] && d.bases) d.bases.push(tr[1]);
    }
    const FN = /(?:^|[{};])[ \t]*(?:#\[[^\]]*\][ \t\r\n]*)*((?:(?:pub(?:\([^)]*\))?|async|unsafe|const|extern[ \t]+"[^"\n]*")[ \t]+)*)fn[ \t]+([A-Za-z_]\w*)[ \t]*(?:<[^>\n]*>)?[ \t]*\(/gm;
    while ((x = FN.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const body = bodyAfter(m, matchPair(m, paren, "(", ")") + 1, false);
      defParens.add(paren);
      // A trait method with no body is a signature, not a symbol.
      if (!body || m[body.open] === ";") continue;
      const owner = innermostClass(x.index);
      add({
        name: x[2],
        qname: owner ? `${owner.name}.${x[2]}` : x[2],
        kind: owner ? "method" : "function",
        from: x.index,
        to: body.end,
        exported: /\bpub\b/.test(x[1]),
        owner,
      });
    }
    // axum / actix builder registration: `.route("/orders", get(list))`.
    const RSROUTE = /\.[ \t]*route[ \t]*\(/g;
    while ((x = RSROUTE.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const pieces = argPieces(c, paren, close);
      if (!pieces[0] || pieces[0].s == null || !pieces[0].s.startsWith("/")) continue;
      const verbs = [...m.slice(paren, close).matchAll(/\b(get|post|put|patch|delete|head|options)[ \t]*\(/g)].map((v) => v[1]);
      if (!verbs.length) continue;
      regParens.add(paren);
      for (const v of verbs) add({ kind: "route", method: VERB_OF(v), path: pieces[0].s, head: "route", name: "route", from: x.index, to: close, exported: false });
    }
  } else if (lang === "kt") {
    const CLASS = /^[ \t]*((?:(?:public|private|protected|internal|open|abstract|sealed|data|enum|inner|annotation|value)[ \t]+)*)(?:class|object|interface)[ \t]+([A-Za-z_]\w*)([^{\n]*)\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const cl = { name: x[2], qname: x[2], kind: "class", from: x.index, to: matchPair(m, open, "{", "}"), open, exported: !/private|internal/.test(x[1]), bases: basesOf(x[3].replace(/\([^)]*\)/g, "")) };
      classes.push(cl);
      add(cl);
    }
    // `fun list(): List<Order>` · `fun Order.label()` (an extension) · an
    // expression body (`fun n() = x`) is as real a declaration as a block one.
    const FUN = /^[ \t]*((?:(?:public|private|protected|internal|open|override|suspend|inline|operator|abstract|external|tailrec|infix)[ \t]+)*)fun[ \t]*(?:<[^>\n]*>[ \t]*)?(?:([A-Za-z_]\w*)[ \t]*\.[ \t]*)?([A-Za-z_]\w*|`[^`\n]+`)[ \t]*\(/gm;
    while ((x = FUN.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const body = ktBody(m, matchPair(m, paren, "(", ")") + 1);
      defParens.add(paren);
      if (!body) continue;
      const name = x[3].replace(/^`|`$/g, "");
      const owner = x[2] ? { name: x[2] } : innermostClass(x.index);
      add({
        name,
        qname: owner ? `${owner.name}.${name}` : name,
        kind: owner ? "method" : "function",
        from: x.index,
        to: body.end,
        exported: !/private|internal/.test(x[1]),
        owner: x[2] ? null : owner,
      });
    }
    // Ktor: `get("/orders") { … }`, nested inside `route("/api") { … }`.
    const GROUPS = [];
    const KROUTE = /(?:^|[^\w.])route[ \t]*\(/g;
    while ((x = KROUTE.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const pieces = argPieces(c, paren, close);
      const brace = m.indexOf("{", close);
      if (!pieces[0] || pieces[0].s == null || brace < 0 || brace > close + 4) continue;
      GROUPS.push({ path: pieces[0].s, open: brace, to: matchPair(m, brace, "{", "}") });
      regParens.add(paren);
    }
    const KVERB = /(?:^|[^\w.])(get|post|put|patch|delete|head|options)[ \t]*\(/g;
    while ((x = KVERB.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      const pieces = argPieces(c, paren, close);
      const brace = m.indexOf("{", close);
      if (!pieces[0] || pieces[0].s == null || !pieces[0].s.startsWith("/") || brace < 0 || brace > close + 4) continue;
      let pre = "";
      for (const g of GROUPS) if (g.open < x.index && x.index < g.to) pre = joinPath(pre, g.path);
      regParens.add(paren);
      add({ kind: "route", method: VERB_OF(x[1]), path: joinPath(pre, pieces[0].s), head: "route", name: "route", from: x.index, to: matchPair(m, brace, "{", "}"), exported: false });
    }
  } else if (lang === "c") {
    const CLASS = /^[ \t]*(?:template[ \t]*<[^>\n]*>[ \t\r\n]*)?(?:class|struct)[ \t]+([A-Za-z_]\w*)([^{;\n]*)\{/gm;
    while ((x = CLASS.exec(m))) {
      const open = x.index + x[0].length - 1;
      const cl = { name: x[1], qname: x[1], kind: "class", from: x.index, to: matchPair(m, open, "{", "}"), open, exported: true, bases: basesOf(x[2].replace(/\b(public|private|protected|virtual)\b/g, "")) };
      classes.push(cl);
      add(cl);
    }
    // A MACRO at column 0 with a block body is a definition the preprocessor
    // writes: `TEST_F(NonMutatingTest, Equal) { … }`. Without this rung every
    // such body belongs to the module symbol, which then passes the call cap
    // and reports the whole file `partial` — measured on abseil-cpp, that was
    // most of the gap, and every one of those files was a test file.
    const MACRODEF = /^([A-Z][A-Z0-9_]{2,})[ \t]*\(/gm;
    while ((x = MACRODEF.exec(m))) {
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      if (close < 0) continue;
      const body = bodyAfter(m, close + 1, false);
      if (!body || m[body.open] !== "{") continue;
      const ids = argPieces(c, paren, close)
        .filter((a) => !a.kw && a.id)
        .map((a) => a.id)
        .filter((sid) => /^[A-Za-z_]\w*$/.test(sid));
      const name = ids.length >= 2 ? ids[1] : ids.length === 1 ? ids[0] : x[1];
      defParens.add(paren);
      add({ name, qname: ids.length >= 2 ? `${ids[0]}.${name}` : name, kind: ids.length >= 2 ? "method" : "function", from: x.index, to: body.end, exported: true });
    }
    // A definition is `<type> name(args) {`, or `Type::name(args) {` for a
    // member defined outside its class. A DECLARATION ends in `;` and is not
    // a symbol — the header file would otherwise duplicate every function.
    const FUNC = /(?:^|[{};])[ \t]*((?:(?:static|inline|extern|virtual|explicit|constexpr|friend|const|unsigned|signed)[ \t]+)*)([A-Za-z_][\w:<>,*&\[\] \t]*?[ \t*&])?(?:([A-Za-z_]\w*)[ \t]*::[ \t]*)?(~?[A-Za-z_]\w*)[ \t]*\(/gm;
    while ((x = FUNC.exec(m))) {
      const name = x[4];
      if (isKw(lang, name) || MEMBER_KW.has(name)) continue;
      if (!x[2] && !x[3] && !/^~/.test(name)) continue; // a plain call, not a definition
      // `return ok(body);` looks like `<type> <name>(` — the "type" is a
      // keyword, so it is a CALL, and it must stay one. The paren is claimed
      // for a declaration only once the body proves it is a definition.
      const typeWord = (x[2] || "").trim().split(/[<:*&[\s]/)[0];
      if (typeWord && (KW.has(typeWord) || isKw(lang, typeWord))) continue;
      const paren = x.index + x[0].length - 1;
      const close = matchPair(m, paren, "(", ")");
      if (close < 0) continue;
      const body = bodyAfter(m, close + 1, false);
      if (!body || m[body.open] === ";") continue;
      defParens.add(paren);
      const owner = x[3] ? { name: x[3] } : innermostClass(x.index);
      add({
        name,
        qname: owner ? `${owner.name}.${name}` : name,
        kind: owner ? "method" : "function",
        from: x.index,
        to: body.end,
        exported: !/\bstatic\b/.test(x[1]),
        owner: x[3] ? null : owner,
      });
    }
  }

  let exportsSet = null;
  if (lang === "js" || lang === "ts") {
    exportsSet = new Set();
    for (const e of m.matchAll(/^[ \t]*export[ \t]*\{([^}]*)\}/gm))
      for (const p of e[1].split(",")) {
        const mm = /^\s*([\w$]+)/.exec(p);
        if (mm) exportsSet.add(mm[1]);
      }
    for (const e of m.matchAll(/export[ \t]+default[ \t]+([A-Za-z_$][\w$]*)/g)) exportsSet.add(e[1]);
    for (const e of m.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)[ \t]*=/g)) exportsSet.add(e[1]);
    const me = /module\.exports[ \t]*=[ \t]*(\{[^}]*\}|[A-Za-z_$][\w$]*)/.exec(m);
    if (me) {
      if (me[1][0] === "{") {
        for (const p of me[1].slice(1, -1).split(",")) {
          const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?/.exec(p);
          if (mm) exportsSet.add(mm[2] || mm[1]);
        }
      } else exportsSet.add(me[1]);
    }
  }
  return { defs, defParens, regParens, exportsSet };
}

// `class X extends A implements B, C` / `class X : A, IB` → ["A", "B", "C"].
// Recorded for W2 (inherited members); harmless before it.
function basesOf(tail) {
  const out = [];
  if (!tail) return out;
  const t = tail.replace(/<[^>]*>/g, "");
  for (const mm of t.matchAll(/(?:\bextends\b|\bimplements\b|:)\s*((?:[A-Za-z_$][\w$.\\]*\s*,\s*)*[A-Za-z_$][\w$.\\]*)/g))
    for (const b of mm[1].split(","))
      if (/^[A-Za-z_$][\w$.\\]*$/.test(b.trim()) && !KW.has(b.trim())) out.push(b.trim().split(/[.\\]/).pop());
  return [...new Set(out)].slice(0, 8);
}

// ── W5b (v1.9.1, DE-15): an OBJECT is a declaration too ─────────────────────
// An Options API component, a mixin and a Vuex module define every function
// they have as a MEMBER of one default-exported object. The rungs above read
// declarations at a line start, so on a Vue project 416 of 429 `.vue` files
// had no symbol at all. This pass runs on the masked source for js/ts (and an
// SFC's `<script>`), on the heuristic rung AND after the borrowed TypeScript
// walk — the walker only records a method inside a class, so both were blind in
// the same place.
//
// It adds no new idea to the resolver: the object is a `class`, a member is a
// `method` named `<Owner>.<name>`, `mixins`/`extends` are its `bases`. So
// `this.submit()` resolves LOCAL through `classOf`, and a mixin member is
// reached through `inheritedMember`, exactly as a class method is.
const OBJ_SECTIONS = new Set(["methods", "computed", "watch", "getters", "mutations", "actions", "filters", "provide"]);
const DEFAULT_OBJECT = /\bexport[ \t]+default[ \t]+(?:(?:defineComponent|Vue[ \t]*\.[ \t]*extend)[ \t]*\([ \t\r\n]*)?\{/g;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
// A value that is a function: `function (…)`, `async function`, `(…) =>`,
// `x =>`. The arrow's parameter list may span lines, so it is matched by pair.
function fnValueAt(m, v) {
  const rest = m.slice(v, v + 200);
  if (/^(?:async[ \t]+)?function\b/.test(rest)) {
    const p = m.indexOf("(", v);
    return { paren: p };
  }
  if (/^(?:async[ \t]+)?[A-Za-z_$][\w$]*[ \t]*=>/.test(rest) && !/^(?:async[ \t]+)?(?:function|class|new)\b/.test(rest)) return { paren: null };
  const a = /^(?:async[ \t]*)?\(/.exec(rest);
  if (a) {
    const p = v + a[0].length - 1;
    const pc = matchPairQuiet(m, p, "(", ")");
    if (pc > 0 && /^\s*(?::[^=\n]+)?=>/.test(m.slice(pc + 1, pc + 200))) return { paren: null };
  }
  return null;
}

// `matchPair` records an unclosed `{` as a coverage gap. A speculative probe
// for an arrow's parameter list must never do that.
function matchPairQuiet(s, open, a, b) {
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === a) d++;
    else if (s[k] === b && --d === 0) return k;
  }
  return -1;
}

// The depth-0 members of an object literal, as [start, end) with the leading
// whitespace dropped. The mask keeps quotes and blanks what is inside them, so
// a comma in a string can never split a member.
function objectMembers(m, open, close) {
  const out = [];
  let d = 0;
  let a = open + 1;
  for (let k = open + 1; k < close; k++) {
    const ch = m[k];
    if (ch === "(" || ch === "[" || ch === "{") d++;
    else if (ch === ")" || ch === "]" || ch === "}") d--;
    else if (ch === "," && d === 0) {
      out.push([a, k]);
      a = k + 1;
    }
  }
  out.push([a, close]);
  const kept = [];
  for (let [x, y] of out) {
    while (x < y && /\s/.test(m[x])) x++;
    if (x < y) kept.push([x, y]);
  }
  return kept;
}

const KEY = "([A-Za-z_$][\\w$]*|\\[[ \\t]*[A-Za-z_$][\\w$.]*[ \\t]*\\])";
const MEM_ACCESSOR = /^(?:get|set)[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/;
const MEM_METHOD = new RegExp(`^(?:async[ \\t]+)?\\*?[ \\t]*${KEY}[ \\t]*\\(`);
const MEM_PAIR = new RegExp(`^${KEY}[ \\t]*:[ \\t\\r\\n]*`);
const keyName = (k) => (k.startsWith("[") ? k.replace(/[[\]\s]/g, "").split(".").pop() : k);

// What one member IS. `fn` carries the paren of a method shorthand (so the
// call scanner never reads `submit() {` as a call to `submit`).
function memberOf(m, a, b) {
  const seg = m.slice(a, b);
  if (seg.startsWith("...")) return null;
  let x = MEM_ACCESSOR.exec(seg);
  if (x) return { type: "fn", name: x[1], paren: a + x[0].length - 1 };
  x = MEM_METHOD.exec(seg);
  if (x && !/^(?:function|async)$/.test(x[1])) return { type: "fn", name: keyName(x[1]), paren: a + x[0].length - 1 };
  x = MEM_PAIR.exec(seg);
  if (x) {
    const name = keyName(x[1]);
    const v = a + x[0].length;
    const f = fnValueAt(m, v);
    // `submit: function submit() {}` — the paren is a declaration's, never a call.
    if (f) return { type: "fn", name, paren: f.paren, v };
    if (m[v] === "{") return { type: "obj", name, open: v, close: matchPairQuiet(m, v, "{", "}"), v };
    if (m[v] === "[") return { type: "arr", name, open: v, close: matchPairQuiet(m, v, "[", "]"), v };
    return { type: "val", name, v };
  }
  if (/^[A-Za-z_$][\w$]*\s*$/.test(seg)) return { type: "short", name: seg.trim() };
  return null;
}

// The owner's name when the object has no `name:` — the file stem, or the
// folder for an `index` file. A kebab-case stem becomes PascalCase, the way a
// component is named where it is used.
function ownerStem(rel) {
  const parts = String(rel).split("/");
  let base = parts.pop().replace(/\.[^.]*$/, "");
  if (/^index$/i.test(base) && parts.length) base = parts.pop();
  if (IDENT_RE.test(base)) return base;
  let n = base
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
  if (!n) n = "Component";
  return /^\d/.test(n) ? "_" + n : n;
}

// The end of a `const X = …` value: the `;` or the line break at depth 0 that
// ends the statement. A line that ends on an operator, or a next line that
// starts with one, continues it.
function valueEnd(m, v) {
  let d = 0;
  for (let k = v; k < m.length; k++) {
    const ch = m[k];
    if (ch === "(" || ch === "[" || ch === "{") d++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (d === 0) return k - 1;
      d--;
    } else if (d === 0 && ch === ";") return k - 1;
    else if (d === 0 && ch === "\n") {
      let p = k - 1;
      while (p > v && (m[p] === " " || m[p] === "\t" || m[p] === "\r")) p--;
      let n = k + 1;
      while (n < m.length && /\s/.test(m[n])) n++;
      if (!/[=+\-*/,(?:&|]/.test(m[p]) && !/[.?:+\-*/&|]/.test(m[n] || "")) return p;
    }
  }
  return m.length - 1;
}

function objectDefs(c, have, sfc) {
  const { src, m, starts, rel } = c;
  const defs = [];
  const defParens = new Set();
  const taken = new Set(have.map((d) => d.name));
  const trim = (b) => {
    let k = b - 1;
    while (k > 0 && /\s/.test(m[k])) k--;
    return k;
  };
  const add = (d) => {
    if (!d.name || MEMBER_KW.has(d.name)) return null;
    d.s = lineOf(starts, d.from);
    d.e = lineOf(starts, Math.max(d.from, d.to));
    defs.push(d);
    return d;
  };
  // A top-level `const NAME = …`: where a shorthand key's value is declared.
  const declOf = (name) => {
    const re = new RegExp(`^[ \\t]*(?:export[ \\t]+)?(?:const|let|var)[ \\t]+${name.replace(/\$/g, "\\$")}[ \\t]*(?::[^=\\n]+)?=[ \\t]*`, "m");
    const x = re.exec(m);
    return x ? { from: x.index, v: x.index + x[0].length } : null;
  };
  // A value that is a `require(…)` / `import(…)` is a RE-EXPORT: the name is
  // defined in the other file, and a constant here would make this barrel look
  // like its definition (`exports.x = require("./store").x`).
  const reexport = (v) => /^(?:await[ \t]+)?(?:require|import)[ \t]*\(/.test(m.slice(v, v + 40));
  const constant = (name, from, to, v) => {
    if (!IDENT_RE.test(name) || taken.has(name) || (v != null && reexport(v))) return;
    taken.add(name);
    add({ name, qname: name, kind: "const", from, to, exported: true });
  };
  // E2 for an object whose members are data: each key is a constant. A
  // function-valued member is a function, not a constant, and is left alone.
  const constantsOf = (open, close) => {
    for (const [a, b] of objectMembers(m, open, close)) {
      const mem = memberOf(m, a, b);
      if (!mem || mem.type === "fn") continue;
      if (mem.type === "short") {
        const d = declOf(mem.name);
        if (d && !fnValueAt(m, d.v)) constant(mem.name, d.from, valueEnd(m, d.v), d.v);
        continue;
      }
      constant(mem.name, a, trim(b), mem.v);
    }
  };

  // ── E1: the default-exported object ──
  let owner = null;
  DEFAULT_OBJECT.lastIndex = 0;
  const dx = DEFAULT_OBJECT.exec(m);
  if (dx) {
    const open = dx.index + dx[0].length - 1;
    const close = matchPairQuiet(m, open, "{", "}");
    const top = close > open ? objectMembers(m, open, close).map(([a, b]) => ({ a, b, mem: memberOf(m, a, b) })).filter((x) => x.mem) : [];
    const shaped = top.some(
      (x) => x.mem.type === "fn" || (OBJ_SECTIONS.has(x.mem.name) && (x.mem.type === "obj" || x.mem.type === "short")) || x.mem.name === "mixins" || x.mem.name === "extends"
    );
    if (shaped) {
      const nameMem = top.find((x) => x.mem.type === "val" && x.mem.name === "name");
      const named = nameMem ? /^\s*(['"`])([A-Za-z_$][\w$]*)\1/.exec(src.slice(nameMem.mem.v, nameMem.mem.v + 120)) : null;
      const oname = named ? named[2] : ownerStem(rel);
      const bases = [];
      for (const x of top) {
        if (x.mem.name === "mixins" && x.mem.type === "arr")
          for (const w of m.slice(x.mem.open + 1, x.mem.close).split(",")) if (IDENT_RE.test(w.trim())) bases.push(w.trim());
        if (x.mem.name === "extends" && x.mem.type === "val") {
          const w = m.slice(x.mem.v, x.b).trim();
          if (IDENT_RE.test(w)) bases.push(w);
        }
      }
      owner = add({ name: oname, qname: oname, kind: "class", from: dx.index, to: close, exported: true, ...(bases.length ? { bases: bases.slice(0, 8) } : {}) });
      const method = (name, from, to, paren) => {
        if (paren != null) defParens.add(paren);
        add({ name, qname: `${oname}.${name}`, kind: "method", from, to, exported: false });
      };
      const section = (open2, close2) => {
        for (const [a, b] of objectMembers(m, open2, close2)) {
          const mem = memberOf(m, a, b);
          if (!mem) continue;
          if (mem.type === "fn") method(mem.name, a, trim(b), mem.paren);
          else if (mem.type === "obj" && mem.close > mem.open) {
            // `label: { get() {…}, set(v) {…} }` and a watcher's `{ handler() {…} }`
            // are ONE member whose behaviour sits in its inner functions.
            const inner = objectMembers(m, mem.open, mem.close).map(([p, q]) => memberOf(m, p, q)).filter(Boolean);
            if (inner.some((i) => i.type === "fn" && /^(get|set|handler)$/.test(i.name))) {
              for (const i of inner) if (i.type === "fn" && i.paren != null) defParens.add(i.paren);
              method(mem.name, a, trim(b), null);
            }
          }
        }
      };
      for (const x of top) {
        if (x.mem.type === "fn") method(x.mem.name, x.a, trim(x.b), x.mem.paren);
        else if (OBJ_SECTIONS.has(x.mem.name) && x.mem.type === "obj" && x.mem.close > x.mem.open) section(x.mem.open, x.mem.close);
        else if (OBJ_SECTIONS.has(x.mem.name) && x.mem.type === "short") {
          // `const mutations = { … }; export default { mutations }` — the section
          // is declared above and named here.
          const d = declOf(x.mem.name);
          if (d && m[d.v] === "{") section(d.v, matchPairQuiet(m, d.v, "{", "}"));
        }
      }
    } else if (close > open) constantsOf(open, close);
  }

  // ── E2: exported constants ──
  const EXPORT_CONST = /^[ \t]*export[ \t]+(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*/gm;
  let x;
  // A Svelte `export let` is a PROP the parent passes in, not a constant.
  while (!(sfc && sfc.svelte) && (x = EXPORT_CONST.exec(m))) {
    const v = x.index + x[0].length;
    if (fnValueAt(m, v)) continue;
    constant(x[1], x.index, valueEnd(m, v), v);
  }
  const EXPORTS_DOT = /^[ \t]*(?:module[ \t]*\.[ \t]*)?exports[ \t]*\.[ \t]*([A-Za-z_$][\w$]*)[ \t]*=[ \t]*/gm;
  while ((x = EXPORTS_DOT.exec(m))) {
    const v = x.index + x[0].length;
    if (fnValueAt(m, v) || /^[A-Za-z_$][\w$]*[ \t]*[;\n]/.test(m.slice(v, v + 80))) continue;
    constant(x[1], x.index, valueEnd(m, v), v);
  }
  const MODULE_OBJECT = /^[ \t]*module[ \t]*\.[ \t]*exports[ \t]*=[ \t]*\{/gm;
  while ((x = MODULE_OBJECT.exec(m))) {
    const open = x.index + x[0].length - 1;
    const close = matchPairQuiet(m, open, "{", "}");
    if (close > open) constantsOf(open, close);
  }

  // ── E3: a component with no object to name ──
  // `<script setup>`, a Svelte instance script, or no script at all: ONE class
  // symbol, so the component exists in the map, the names and the hints.
  if (sfc && !owner && (sfc.setup || sfc.svelte || !sfc.blocks.length)) {
    const from = sfc.blocks.length ? sfc.blocks[0][0] : 0;
    const to = sfc.blocks.length ? Math.max(from, sfc.blocks[sfc.blocks.length - 1][1] - 1) : Math.max(0, src.length - 1);
    const name = ownerStem(rel);
    // NAME-ONLY: it owns no line. `<script setup>` code is module scope, and
    // an alias declared there (`const store = new OrderStore()`) must stay
    // visible to every function below it, exactly as it was before W5b.
    if (!taken.has(name)) add({ name, qname: name, kind: "class", from, to, exported: true, nameOnly: true });
  }
  return { defs, defParens };
}

// ── declarations: Python (indentation) ──────────────────────────────────────
function pyDefs(c) {
  const { src, m, starts, strAt } = c;
  const lines = m.split("\n");
  const defs = [];
  const defParens = new Set();
  const regParens = new Set();
  const stack = [];
  const width = (s) => s.replace(/\t/g, "    ").length;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const d = /^([ \t]*)(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/.exec(L);
    const cl = d ? null : /^([ \t]*)class[ \t]+([A-Za-z_]\w*)[ \t]*(?:\(([^)]*)\))?/.exec(L);
    const hit = d || cl;
    if (!hit) continue;
    const indent = width(hit[1]);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    let header = i;
    if (d) {
      const paren = starts[i] + hit[0].length - 1;
      defParens.add(paren);
      header = lineOf(starts, matchPair(m, paren, "(", ")")) - 1;
    } else if (cl[3] !== undefined) {
      // `class X(Base):` is a declaration, not a call to X.
      defParens.add(starts[i] + L.indexOf("("));
    }
    let end = header;
    for (let k = header + 1; k < lines.length; k++) {
      const t = lines[k];
      if (!t.trim()) continue;
      if (width(/^[ \t]*/.exec(t)[0]) <= indent) break;
      end = k;
    }
    const chain = [];
    for (let s = stack.length - 1; s >= 0 && stack[s].kind === "class"; s--) chain.unshift(stack[s].name);
    const name = hit[2];
    // Decorators are the lines directly above, at the same indent, starting `@`.
    const decos = [];
    for (let k = i - 1; k >= 0; k--) {
      const dm = /^([ \t]*)@([A-Za-z_][\w.]*)[ \t]*(\()?/.exec(lines[k]);
      if (!dm || width(dm[1]) !== indent) break;
      const deco = { name: dm[2] };
      if (dm[3]) {
        const open = starts[k] + dm[0].length - 1;
        deco.args = argPieces(c, open, matchPair(m, open, "(", ")"));
        // `@router.get("/p")` is a route, never a URL the module reaches.
        regParens.add(open);
      }
      decos.unshift(deco);
    }
    defs.push({
      name,
      qname: [...chain, name].join("."),
      kind: d ? (chain.length ? "method" : "function") : "class",
      s: i + 1,
      e: end + 1,
      from: starts[i],
      exported: !name.startsWith("_"),
      ...(decos.length ? { decos } : {}),
      ...(cl && cl[3] ? { bases: cl[3].split(",").map((b) => b.trim().split(".").pop()).filter((b) => /^[A-Za-z_]\w*$/.test(b)) } : {}),
    });
    stack.push({ indent, name, kind: d ? "function" : "class" });
  }
  // Django `urlpatterns`: `path("p/", views.x)` / `re_path` / `url(...)` — a
  // route with its handler by name, or a mount when the target is `include()`.
  let x;
  const DJ = /\b(path|re_path|url)[ \t]*\(/g;
  while ((x = DJ.exec(m))) {
    const paren = x.index + x[0].length - 1;
    if (defParens.has(paren)) continue;
    const close = matchPair(m, paren, "(", ")");
    const pieces = argPieces(c, paren, close);
    if (!pieces[0] || pieces[0].s == null || !pieces[1] || pieces[1].inc) continue;
    if (!pieces[1].id) continue;
    const p = pieces[0].s.replace(/^\^/, "").replace(/\$$/, "");
    regParens.add(paren);
    defs.push({ kind: "route", method: "ANY", path: p.startsWith("/") ? p : "/" + p, head: x[1], name: "route", from: x.index, to: close, s: lineOf(starts, x.index), e: lineOf(starts, close), exported: false });
  }
  void src;
  void strAt;
  return { defs, defParens, regParens };
}

// ── declarations: Ruby (keyword depth) ──────────────────────────────────────
// W5 (G6). Ruby has no braces around a body: every `class`, `module`, `def`,
// `if`, `while`, `case`, `begin` and every trailing `do` is closed by one
// `end`. So the scanner counts keyword depth, one line at a time, and a
// declaration's body runs from its own line to the `end` that pops it.
//
// The MODIFIER form (`save if valid?`) must never open a block, so `if`,
// `unless`, `while` and `until` count only as the FIRST word of a statement —
// which is the one place a real block can start.
const RB_OPEN_FIRST = /^(class|module|def|if|unless|while|until|for|begin|case)\b/;
const RB_DO_TAIL = /(?:^|[)\s])do(?:[ \t]*\|[^|\n]*\|)?[ \t]*$/;
const RB_ROUTE = /^(get|post|put|patch|delete|head|options|match)[ \t]+(['"])([^'"\n]+)\2/;

function rbDefs(c) {
  const { m, src, starts } = c;
  const lines = m.split("\n");
  // The mask blanks string CONTENT, so a route path is read back from the
  // original bytes — the same rule `argPieces` follows everywhere else.
  const rawLines = src.split("\n");
  const defs = [];
  const defParens = new Set();
  const regParens = new Set();
  const stack = [];
  const classOf = () => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].kind === "class" || stack[k].kind === "module") return stack[k];
    return null;
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const ln = i + 1;
    // `private` with no argument hides every method below it in this body.
    if (/^(private|protected)[ \t]*$/.test(t)) {
      const owner = classOf();
      if (owner) owner.private = true;
      continue;
    }
    let decl = null;
    let mm;
    if ((mm = /^class[ \t]+([A-Z]\w*(?:::\w+)*)(?:[ \t]*<[ \t]*([\w:]+))?/.exec(t))) {
      decl = { kind: "class", name: mm[1].split("::").pop(), bases: mm[2] ? [mm[2].split("::").pop()] : [] };
    } else if ((mm = /^module[ \t]+([A-Z]\w*(?:::\w+)*)/.exec(t))) {
      decl = { kind: "module", name: mm[1].split("::").pop(), bases: [] };
    } else if ((mm = /^def[ \t]+(self\.)?([A-Za-z_]\w*[?!=]?)/.exec(t))) {
      decl = { kind: "def", name: mm[2] };
      const p = lines[i].indexOf("(", lines[i].indexOf(mm[0]));
      if (p >= 0) defParens.add(starts[i] + p);
    } else if (RB_ROUTE.test(t) && (mm = RB_ROUTE.exec(rawLines[i].trim()))) {
      // Rails `get "/orders/:id", to: "orders#show"` in `config/routes.rb`.
      // The path is what a request URL reaches; the `to:` string names a
      // controller action in ANOTHER file, so it is not a local edge.
      const p = mm[3].startsWith("/") ? mm[3] : "/" + mm[3];
      const open = lines[i].indexOf("(");
      if (open >= 0 && open < lines[i].indexOf(mm[3])) regParens.add(starts[i] + open);
      defs.push({
        kind: "route",
        method: mm[1] === "match" ? "ANY" : VERB_OF(mm[1]),
        path: p,
        head: "routes",
        name: "route",
        from: starts[i],
        to: starts[i] + lines[i].length,
        s: ln,
        e: ln,
        exported: false,
      });
    }
    const firstKw = RB_OPEN_FIRST.exec(t);
    let opens = firstKw ? 1 : 0;
    // `while x do` and `for a in b do` are ONE block, not two: the trailing
    // `do` belongs to the loop keyword that already opened it.
    if (RB_DO_TAIL.test(t) && !(firstKw && /^(while|until|for)$/.test(firstKw[1]))) opens++;
    const ends = (t.match(/\bend\b/g) || []).length;
    for (let k = 0; k < opens; k++) {
      if (k === 0 && decl) stack.push({ ...decl, line: ln, private: false });
      else stack.push({ kind: "_" });
    }
    for (let k = 0; k < ends; k++) {
      const fr = stack.pop();
      if (!fr || fr.kind === "_") continue;
      const owner = classOf();
      const name = fr.name;
      if (fr.kind === "def") {
        defs.push({
          name,
          qname: owner ? `${owner.name}.${name}` : name,
          kind: owner ? "method" : "function",
          s: fr.line,
          e: ln,
          from: starts[fr.line - 1] || 0,
          exported: !(owner && owner.private) && !name.startsWith("_"),
        });
      } else {
        defs.push({
          name,
          qname: name,
          kind: "class",
          s: fr.line,
          e: ln,
          from: starts[fr.line - 1] || 0,
          exported: true,
          ...(fr.bases && fr.bases.length ? { bases: fr.bases } : {}),
        });
      }
    }
  }
  defs.sort((a, b) => a.from - b.from);
  return { defs, defParens, regParens };
}

// ── decorators (brace languages) ────────────────────────────────────────────
// `@Get(":id")` / `@GetMapping("/p")` / `[HttpGet("{id}")]` / `#[Route('/p')]`
// belong to the NEXT declaration that starts after them. A class-level
// `@Controller("orders")` / `@RequestMapping("/orders")` / `[Route("api/x")]`
// is the prefix every route in that class carries.
function braceDecorators(c, lang, defs) {
  const { m } = c;
  const marks = [];
  let x;
  if (lang === "js" || lang === "ts" || lang === "java" || lang === "kt") {
    const RE = /(?:^|[\s;}])@([A-Za-z_$][\w$.]*)[ \t]*(\()?/g;
    while ((x = RE.exec(m))) marks.push({ pos: x.index + x[0].indexOf("@"), name: x[1], paren: x[2] ? x.index + x[0].length - 1 : null });
  } else if (lang === "rs") {
    // actix and rocket put the route on the function: `#[get("/orders")]`.
    const RE = /#\[[ \t]*(get|post|put|patch|delete|head|options|route)[ \t]*(\()?/g;
    while ((x = RE.exec(m))) marks.push({ pos: x.index, name: x[1], paren: x[2] ? x.index + x[0].length - 1 : null });
  } else if (lang === "cs") {
    const RE = /^[ \t]*\[[ \t]*(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|HttpHead|HttpOptions|Route|ApiController)[ \t]*(\()?/gm;
    while ((x = RE.exec(m))) marks.push({ pos: x.index, name: x[1], paren: x[2] ? x.index + x[0].length - 1 : null });
  } else if (lang === "php") {
    const RE = /#\[[ \t]*(Route|Get|Post|Put|Patch|Delete)[ \t]*(\()?/g;
    while ((x = RE.exec(m))) marks.push({ pos: x.index, name: x[1], paren: x[2] ? x.index + x[0].length - 1 : null });
  }
  if (!marks.length) return;
  const targets = defs.filter((d) => d.kind !== "route").sort((a, b) => a.from - b.from);
  for (const mk of marks) {
    const deco = { name: mk.name };
    if (mk.paren != null) deco.args = argPieces(c, mk.paren, matchPair(m, mk.paren, "(", ")"));
    // The nearest declaration that starts after the mark, and not further than
    // a screen away — a stray `@` in a JSDoc that the mask kept is not a
    // decorator of the next function.
    let best = null;
    for (const d of targets) if (d.from > mk.pos && (!best || d.from < best.from)) best = d;
    if (!best || best.from - mk.pos > 600) continue;
    (best.decos || (best.decos = [])).push(deco);
  }
}

// One decorator → `{ prefix }` (class level) or `{ routes: [{method, path}] }`.
function decoRoute(deco, isClass) {
  const last = String(deco.name).split(".").pop();
  const args = deco.args || [];
  const pos = args.filter((a) => !a.kw);
  const kw = {};
  for (const a of args) if (a.kw) kw[a.kw] = a;
  const str = (a) => (a && a.s != null ? a.s : null);
  const first = str(pos[0]) != null ? str(pos[0]) : str(kw.path) != null ? str(kw.path) : str(kw.value) != null ? str(kw.value) : str(kw.template) != null ? str(kw.template) : null;
  const norm = (p) => {
    let s = String(p == null ? "" : p).trim();
    if (s && !s.startsWith("/")) s = "/" + s;
    return s;
  };
  if (isClass) {
    if (/^(Controller|RequestMapping|Route|Blueprint)$/.test(last)) return { prefix: norm(first != null ? first : pos[0] && pos[0].obj && pos[0].obj.path) };
    return null;
  }
  if (first == null && pos[0] && pos[0].obj && pos[0].obj.path) return isClass ? { prefix: norm(pos[0].obj.path) } : null;
  const NEST = /^(Get|Post|Put|Patch|Delete|Head|Options|All)$/;
  const PY = /^(get|post|put|patch|delete|head|options)$/;
  const SPRING = /^(Get|Post|Put|Patch|Delete)Mapping$/;
  const CS = /^Http(Get|Post|Put|Patch|Delete|Head|Options)$/;
  let methods = null;
  if (NEST.test(last)) methods = [last === "All" ? "ANY" : last.toUpperCase()];
  else if (PY.test(last)) methods = [last.toUpperCase()];
  else if (SPRING.test(last)) methods = [SPRING.exec(last)[1].toUpperCase()];
  else if (CS.test(last)) methods = [CS.exec(last)[1].toUpperCase()];
  else if (/^(route|api_route|Route|RequestMapping)$/.test(last)) {
    const list = (kw.methods && kw.methods.list) || (kw.method && kw.method.list) || null;
    if (list && list.length) methods = list.map((v) => v.toUpperCase());
    else if (kw.method && kw.method.id) methods = [kw.method.id.split(".").pop().toUpperCase()];
    else methods = ["ANY"];
  }
  if (!methods) return null;
  return { routes: methods.map((method) => ({ method, path: norm(first) })) };
}

// ── calls ───────────────────────────────────────────────────────────────────
const CALL = /(?:\bnew[ \t]+)?((?:[A-Za-z_$][\w$]*[ \t]*(?:\?\.|\.|->|::)[ \t]*)*[A-Za-z_$][\w$]*)[ \t]*(?:<[\w$., \t\[\]]*>)?[ \t]*\(/g;

function normCall(name) {
  let n = String(name).replace(/[ \t]*(?:\?\.|->|::)[ \t]*/g, ".").replace(/[ \t]+/g, "");
  let self = false;
  let sup = false;
  const m = /^(?:\$this|this|self|static|cls)\.(.+)$/.exec(n);
  if (m) {
    n = m[1];
    self = true;
  } else {
    // W2 (G3): `super.m()` / `parent::m()` / `base.m()` is a self call that
    // starts ONE level up the base chain.
    const sm = /^(?:super|parent|base)\.(.+)$/.exec(n);
    if (sm) {
      n = sm[1];
      self = true;
      sup = true;
    }
  }
  n = n.replace(/^\$/, "").replace(/\.\$/g, ".");
  const last = n.split(".").pop();
  // A keyword after a dot is a METHOD name — `router.delete(`, `promise.catch(` —
  // and the arguments inside it (a middleware passed by name) are still scanned.
  if (!last || (KW.has(last) && !n.includes(".")) || /^\d/.test(last)) return null;
  return { name: n, self, ...(sup ? { sup: true } : {}) };
}

// Which calls carry arguments worth keeping: an HTTP-shaped call (its URL), a
// mount, a router constructor (its prefix), or an assignment target. Every
// other call keeps only its name and line, as before.
const ARGS_WORTH = /(^|\.)(get|post|put|patch|delete|del|head|options|fetch|axios|request|use|register|include_router|register_blueprint|mount|path|re_path|url|include|NewRequest|Get|Post|Head|APIRouter|Blueprint|Router|Route|json|perform|GetAsync|PostAsync|PutAsync|DeleteAsync|PatchAsync|SendAsync|open|route|add_url_rule|Group|Mount|Handle|HandleFunc)$/;

function scanCalls(c, defParens, regParens) {
  const { m, starts } = c;
  const out = [];
  let x;
  CALL.lastIndex = 0;
  while ((x = CALL.exec(m))) {
    const paren = x.index + x[0].length - 1;
    if (defParens.has(paren)) continue;
    // `function (` / `def (` style anonymous forms, and the word before a
    // declaration name, are not calls.
    const before = m.slice(Math.max(0, x.index - 12), x.index);
    if (/\b(function|def|func|fn)[ \t]*\*?[ \t]*$/.test(before)) continue;
    const cc = normCall(x[1]);
    if (!cc) continue;
    const close = matchPair(m, paren, "(", ")");
    // `async (req, res) => …` is a parameter list, not a call to `async`.
    if (cc.name === "async" && /^\s*=>/.test(m.slice(close + 1, close + 8))) continue;
    // W1: `new OrderService().create(…)` / Python `OrderService().create(…)` —
    // the receiver is a constructor call, so the head is the class. Without it
    // the call is a bare `create`, and a bare name is never a class method.
    if (!cc.name.includes(".") && !cc.self) {
      const chain = m.slice(Math.max(0, x.index - 160), x.index);
      const nw = c.lang === "py" ? /\b([A-Z][\w]*)[ \t]*\([^()]*\)[ \t]*\.[ \t]*$/.exec(chain) : /\bnew[ \t]+([A-Za-z_$][\w$]*)[ \t]*\([^()]*\)[ \t]*\.[ \t]*$/.exec(chain);
      if (nw) cc.name = `${nw[1]}.${cc.name}`;
      else if (/\bsuper[ \t]*\([ \t]*\)[ \t]*\.[ \t]*$/.test(chain)) {
        // Python `super().m()` — a self call one level up (W2, G3).
        cc.self = true;
        cc.sup = true;
      }
    }
    const rec = { name: cc.name, line: lineOf(starts, paren), ...(cc.self ? { self: true } : {}), ...(cc.sup ? { sup: true } : {}), _p: paren };
    if (regParens && regParens.has(paren)) rec.reg = true;
    if (ARGS_WORTH.test(cc.name)) {
      rec.args = argPieces(c, paren, close);
      const assign = assignBefore(m, x.index);
      if (assign) rec.assign = assign;
    }
    out.push(rec);
    refsIn(m, starts, paren, close, out, c);
  }
  // W5 (G6). Ruby calls a method with NO parentheses — `@store.list`,
  // `handler.index`, `OrderStore.new` — so without this rung a Ruby file looks
  // as though it calls almost nothing. Only a RECEIVER form is taken: a bare
  // word with no parentheses is far more often a local variable, and guessing
  // there would invent edges, which is the one thing this engine must not do.
  if (c.lang === "rb") {
    const RBDOT = /@{0,2}[A-Za-z_]\w*(?:[ \t]*\.[ \t]*[A-Za-z_]\w*[?!]?)+(?![\w?!]|[ \t]*[(.])/g;
    while ((x = RBDOT.exec(m))) {
      const before = m.slice(Math.max(0, x.index - 6), x.index);
      if (/def[ 	]*$/.test(before)) continue;
      const cc = normCall(x[0].replace(/^@+/, ""));
      if (!cc || !cc.name.includes(".")) continue;
      out.push({ name: cc.name, line: lineOf(starts, x.index), ...(cc.self ? { self: true } : {}), ...(cc.sup ? { sup: true } : {}), _p: x.index });
    }
  }
  return out;
}

// A function passed BY NAME — `router.post("/", requireAuth, handler)`,
// `items.map(normalize)` — is a use no call scan sees, so `requireAuth` had
// fan-in 0 on every route that used it. Each bare or dotted identifier argument
// becomes a REF. `finalize` keeps a ref only when its head is defined in this
// file or bound by an import, and resolution accepts only LOCAL or IMPORT for
// it, so a local variable passed along never becomes an edge.
const REF_WORDS = new Set(["true", "false", "null", "undefined", "nil", "None", "True", "False", "NaN", "Infinity"]);
const REF_ARG = /^\s*(?:\.\.\.|&)?((?:[A-Za-z_$][\w$]*[ \t]*(?:\?\.|\.|->|::)[ \t]*)*[A-Za-z_$][\w$]*)\s*$/;
const LARAVEL_REF = /^\s*\[\s*([A-Za-z_\\][\w\\]*)\s*::\s*class\s*,\s*(["'])\s*\2\s*\]\s*$/;

function refsIn(m, starts, open, close, out, c) {
  let depth = 0;
  let a = open + 1;
  for (let k = open + 1; k <= close && k < m.length; k++) {
    const ch = m[k];
    const end = k === close;
    if (!end && (ch === "(" || ch === "[" || ch === "{")) depth++;
    else if (!end && (ch === ")" || ch === "]" || ch === "}")) depth--;
    if (!end && !(ch === "," && depth === 0)) continue;
    const piece = m.slice(a, k);
    const t = REF_ARG.exec(piece);
    if (t && !REF_WORDS.has(t[1])) {
      const cc = normCall(t[1]);
      if (cc && !cc.sup) out.push({ name: cc.name, line: lineOf(starts, a + piece.indexOf(t[1])), ref: true, ...(cc.self ? { self: true } : {}) });
    } else if (c) {
      const lr = LARAVEL_REF.exec(piece);
      if (lr) {
        const method = firstStringIn(c.src, c.strAt, a, k);
        if (method) out.push({ name: `${lr[1].split("\\").pop()}.${method}`, line: lineOf(starts, a), ref: true });
      }
    }
    a = k + 1;
  }
}

// ── instance aliases (v1.8.2 W2, G2) ────────────────────────────────────────
// `const store = new OrderStore()` makes `store.list()` a call to
// `OrderStore.list`. nestjs/nest measured 118 `maybe` callers on ONE symbol
// from this shape alone. Each declaration below yields { line, local, cls,
// self }: `self` is a class field (`this.x = new S()`, a constructor
// param-property, a typed field), scoped to the class; anything else is scoped
// to the symbol that contains the line (a function, a method, or the module).
// A local re-bound to something that is not a class (`cls: null`) SHADOWS an
// outer alias for that scope.
const UP = "[A-Z][A-Za-z0-9_$]*";
const ID = "[A-Za-z_$][A-Za-z0-9_$]*";

function aliasesOf(c, lang) {
  const { m, starts } = c;
  const out = [];
  const push = (pos, local, cls, self) => {
    if (!local || (cls && !/^[A-Z]/.test(cls))) return;
    out.push({ line: lineOf(starts, pos), local: local.replace(/^[$@]+/, ""), cls: cls || null, ...(self ? { self: true } : {}) });
  };
  let x;
  if (lang === "js" || lang === "ts") {
    // const x = new S() · const x: S = … · let x: S · const x = S() (a factory)
    const DECL = new RegExp(`\\b(?:const|let|var)\\s+(${ID})\\s*(?::\\s*(${UP})[^=;\\n]*)?=\\s*(?:new\\s+(${UP})|(${UP})\\s*\\(|([^\\n;]*))`, "g");
    while ((x = DECL.exec(m))) push(x.index, x[1], x[3] || x[4] || x[2] || null, false);
    const TYPED = new RegExp(`\\b(?:let|var)\\s+(${ID})\\s*:\\s*(${UP})\\s*[;\\n]`, "g");
    while ((x = TYPED.exec(m))) push(x.index, x[1], x[2], false);
    // this.x = new S()  ·  constructor(private readonly x: S)  ·  x: S;  ·  x = new S();
    const THIS = new RegExp(`\\bthis\\.(${ID})\\s*=\\s*new\\s+(${UP})`, "g");
    while ((x = THIS.exec(m))) push(x.index, x[1], x[2], true);
    const PARAM = new RegExp(`\\b(?:public|private|protected|readonly)\\s+(?:readonly\\s+)?(${ID})\\s*[?!]?\\s*:\\s*(${UP})`, "g");
    while ((x = PARAM.exec(m))) push(x.index, x[1], x[2], true);
    const FIELD = new RegExp(`^[ \\t]+(?:(?:public|private|protected|static|readonly|declare|override|accessor)\\s+)*(${ID})\\s*[?!]?\\s*(?::\\s*(${UP})\\s*(?:=[^\\n;]*)?|=\\s*new\\s+(${UP}))\\s*(?:\\(|;)`, "gm");
    while ((x = FIELD.exec(m))) push(x.index, x[1], x[2] || x[3], true);
  } else if (lang === "py") {
    // x = S()  ·  x: S = …  ·  x: S  ·  self.x = S()  ·  def f(x: S)
    const ASSIGN = new RegExp(`^[ \\t]*(${ID})\\s*(?::\\s*(${UP})\\s*)?=\\s*(?:(${UP})\\s*\\(|([^\\n]*))`, "gm");
    while ((x = ASSIGN.exec(m))) push(x.index, x[1], x[3] || x[2] || null, false);
    const SELF = new RegExp(`\\bself\\.(${ID})\\s*(?::\\s*(${UP})\\s*)?=\\s*(?:(${UP})\\s*\\(|[^\\n]*)`, "g");
    while ((x = SELF.exec(m))) if (x[3] || x[2]) push(x.index, x[1], x[3] || x[2], true);
    const ANN = new RegExp(`[(,]\\s*(${ID})\\s*:\\s*(${UP})\\b`, "g");
    while ((x = ANN.exec(m))) push(x.index, x[1], x[2], false);
  } else if (lang === "go") {
    // x := S{}  ·  x := &S{}  ·  var x *S  ·  x := NewS()  ·  func (s *S)  ·  f(s *S)
    const LIT = new RegExp(`\\b(${ID})\\s*:=\\s*&?(${UP})\\s*\\{`, "g");
    while ((x = LIT.exec(m))) push(x.index, x[1], x[2], false);
    const VAR = new RegExp(`\\bvar\\s+(${ID})\\s+\\*?(${UP})\\b`, "g");
    while ((x = VAR.exec(m))) push(x.index, x[1], x[2], false);
    const NEW = new RegExp(`\\b(${ID})\\s*:?=\\s*(?:[a-z][\\w]*\\.)?New(${UP})\\s*\\(`, "g");
    while ((x = NEW.exec(m))) push(x.index, x[1], x[2], false);
    const RECV = new RegExp(`^func\\s*\\(\\s*(${ID})\\s+\\*?(${UP})\\s*\\)`, "gm");
    while ((x = RECV.exec(m))) push(x.index, x[1], x[2], false);
    const PARAM = new RegExp(`[(,]\\s*(${ID})\\s+\\*?(${UP})\\s*[,)]`, "g");
    while ((x = PARAM.exec(m))) push(x.index, x[1], x[2], false);
  } else if (lang === "java" || lang === "cs") {
    // S x = …  ·  var x = new S()  ·  S x;  (fields, locals, parameters)
    const TYPED = new RegExp(`\\b(${UP})(?:<[^>\\n]*>)?\\s+(${ID})\\s*(?:=|;|,|\\))`, "g");
    while ((x = TYPED.exec(m))) if (!KW.has(x[1]) && !/^(String|Integer|Long|Boolean|Double|Float|Object|List|Map|Set|Task|Void)$/.test(x[1])) push(x.index, x[2], x[1], false);
    const VAR = new RegExp(`\\bvar\\s+(${ID})\\s*=\\s*new\\s+(${UP})`, "g");
    while ((x = VAR.exec(m))) push(x.index, x[1], x[2], false);
  } else if (lang === "php") {
    // $x = new S()  ·  private S $x  ·  $this->x = new S()
    const NEW = new RegExp(`\\$(${ID})\\s*=\\s*new\\s+\\\\?(${UP})`, "g");
    while ((x = NEW.exec(m))) push(x.index, x[1], x[2].split("\\").pop(), false);
    const PROP = new RegExp(`\\b(?:public|private|protected)\\s+(?:readonly\\s+)?\\??\\\\?(${UP})\\s+\\$(${ID})`, "g");
    while ((x = PROP.exec(m))) push(x.index, x[2], x[1], true);
    const THIS = new RegExp(`\\$this->(${ID})\\s*=\\s*new\\s+\\\\?(${UP})`, "g");
    while ((x = THIS.exec(m))) push(x.index, x[1], x[2], true);
  } else if (lang === "rb") {
    // `store = OrderStore.new` · `@store = OrderStore.new` (an instance
    // variable IS the field form here, so it is a `self` alias).
    const LOCAL = new RegExp(`^[ \\t]*(${ID})\\s*=\\s*(${UP})(?:::\\w+)*\\.new\\b`, "gm");
    while ((x = LOCAL.exec(m))) push(x.index, x[1], x[2], false);
    const IVAR = new RegExp(`@@?(${ID})\\s*=\\s*(${UP})(?:::\\w+)*\\.new\\b`, "g");
    while ((x = IVAR.exec(m))) push(x.index, x[1], x[2], true);
  } else if (lang === "rs") {
    // `let s = Service::new()` · `let s: Service = …` · `s: Service` (a struct
    // field, so a `self.s` call) · `fn f(s: &Service)`.
    const LET = new RegExp(`\\blet\\s+(?:mut\\s+)?(${ID})\\s*(?::\\s*&?(?:mut\\s+)?(${UP}))?\\s*=\\s*(?:&?(${UP})(?:::\\w+)*\\s*(?:\\{|\\()|[^\\n;]*)`, "g");
    while ((x = LET.exec(m))) push(x.index, x[1], x[3] || x[2] || null, false);
    const FIELD = new RegExp(`^[ \\t]+(?:pub(?:\\([^)]*\\))?\\s+)?(${ID})\\s*:\\s*&?(?:mut\\s+)?(?:Arc<|Box<|Rc<|RwLock<|Mutex<)*(${UP})`, "gm");
    while ((x = FIELD.exec(m))) push(x.index, x[1], x[2], true);
    const PARAM = new RegExp(`[(,]\\s*(${ID})\\s*:\\s*&?(?:mut\\s+)?(?:Arc<|Box<|Rc<|State<)*(${UP})`, "g");
    while ((x = PARAM.exec(m))) push(x.index, x[1], x[2], false);
  } else if (lang === "kt") {
    // `val s = Service()` · `val s: Service` · `class X(private val s: Service)`
    const DECL = new RegExp(`\\b(?:val|var)\\s+(${ID})\\s*(?::\\s*(${UP})[^=\\n]*)?\\s*=\\s*(${UP})\\s*\\(`, "g");
    while ((x = DECL.exec(m))) push(x.index, x[1], x[3] || x[2] || null, false);
    const TYPED = new RegExp(`\\b(?:val|var)\\s+(${ID})\\s*:\\s*(${UP})`, "g");
    while ((x = TYPED.exec(m))) push(x.index, x[1], x[2], false);
    const PARAM = new RegExp(`[(,]\\s*(?:(?:private|protected|internal|public|val|var)\\s+)*(${ID})\\s*:\\s*(${UP})`, "g");
    while ((x = PARAM.exec(m))) push(x.index, x[1], x[2], true);
    // A `val` at class level is a FIELD: it is reached from a method with no
    // receiver, so it has to be recorded as a `self` alias, not a local.
    const FIELD = new RegExp(`^[ \\t]+(?:(?:private|protected|internal|public|open|override|lateinit|const)\\s+)*(?:val|var)\\s+(${ID})\\s*(?::\\s*(${UP})[^=\\n]*)?\\s*=\\s*(${UP})\\s*\\(`, "gm");
    while ((x = FIELD.exec(m))) push(x.index, x[1], x[3] || x[2], true);
  } else if (lang === "c") {
    // `Service s;` · `Service* s = new Service();` · a member declared in the
    // class body is reached without `this->`, like Java and C#.
    const NEW = new RegExp(`\\b(${ID})\\s*=\\s*new\\s+(${UP})`, "g");
    while ((x = NEW.exec(m))) push(x.index, x[1], x[2], false);
    const TYPED = new RegExp(`\\b(${UP})(?:<[^>\\n]*>)?\\s*[*&]?\\s+(${ID})\\s*(?:=|;|,|\\))`, "g");
    while ((x = TYPED.exec(m))) if (!isKw(lang, x[1])) push(x.index, x[2], x[1], false);
    const FIELD = new RegExp(`^[ \\t]+(${UP})(?:<[^>\\n]*>)?\\s*[*&]?\\s+(${ID})\\s*;`, "gm");
    while ((x = FIELD.exec(m))) if (!isKw(lang, x[1])) push(x.index, x[2], x[1], true);
  }
  return out;
}

// ── re-exports (v1.8.2 W2, G4) ──────────────────────────────────────────────
// A barrel defines nothing and re-exports: `export * from "./x"`,
// `export { a as b } from "./x"`, `module.exports = require("./x")`,
// `exports.a = require("./x").a`, and every import in a Python `__init__.py`.
// The IMPORT rung on read follows these to the defining file.
function reexportsFor(lang, src, m, rel, imports) {
  const out = [];
  let x;
  if (lang === "js" || lang === "ts") {
    const STAR = /^[ \t]*export[ \t]+\*[ \t]+from[ \t]*['"]([^'"\n]+)['"]/gm;
    while ((x = STAR.exec(src))) if (codeAt(src, m, x.index)) out.push({ at: x.index, from: x[1], names: "*" });
    const NAMED = /^[ \t]*export[ \t]+(?:type[ \t]+)?\{([^}]*)\}[ \t]*from[ \t]*['"]([^'"\n]+)['"]/gm;
    while ((x = NAMED.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const names = [];
      for (const p of x[1].split(",")) {
        const mm = /^\s*(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(p);
        if (mm) names.push({ local: mm[2] || mm[1], orig: mm[1] });
      }
      if (names.length) out.push({ at: x.index, from: x[2], names });
    }
    const WHOLE = /module\.exports[ \t]*=[ \t]*require\([ \t]*['"]([^'"\n]+)['"][ \t]*\)[ \t]*;?[ \t]*$/gm;
    while ((x = WHOLE.exec(src))) if (codeAt(src, m, x.index)) out.push({ at: x.index, from: x[1], names: "*" });
    const PROP = /(?:module\.)?exports\.([A-Za-z_$][\w$]*)[ \t]*=[ \t]*require\([ \t]*['"]([^'"\n]+)['"][ \t]*\)\.([A-Za-z_$][\w$]*)/g;
    while ((x = PROP.exec(src))) if (codeAt(src, m, x.index)) out.push({ at: x.index, from: x[2], names: [{ local: x[1], orig: x[3] }] });
    // `export { a, b }` of names that were IMPORTED (not defined here) is a
    // re-export too: `import { A } from "./a"; export { A };`.
    const LOCAL = /^[ \t]*export[ \t]*\{([^}]*)\}[ \t]*;?[ \t]*$/gm;
    while ((x = LOCAL.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      for (const p of x[1].split(",")) {
        const mm = /^\s*([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(p);
        if (!mm) continue;
        for (const imp of imports || [])
          for (const b of imp.bindings || []) if (b.local === mm[1] && b.kind === "named") out.push({ at: x.index, from: imp.from, names: [{ local: mm[2] || mm[1], orig: b.orig }] });
      }
    }
    // Source order, whatever shape found them.
    out.sort((a, b) => a.at - b.at);
    for (const r of out) delete r.at;
  } else if (lang === "py" && /(^|\/)__init__\.py$/.test(rel)) {
    for (const imp of imports || []) {
      if (!imp.from) continue;
      if (!(imp.bindings || []).length) continue;
      out.push({ from: imp.from, names: imp.bindings.map((b) => ({ local: b.local, orig: b.orig })) });
    }
    if (/^[ \t]*from[ \t]+[.\w]+[ \t]+import[ \t]+\*/m.test(src)) {
      for (const mm of src.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+\*/gm)) if (codeAt(src, m, mm.index)) out.push({ from: mm[1], names: "*" });
    }
  }
  return out.slice(0, 200);
}

// ── imports ─────────────────────────────────────────────────────────────────
// A statement is read from the ORIGINAL text (its path is a string), but only
// where the mask agrees the keyword is code — never inside a comment.
function codeAt(src, m, idx) {
  let k = idx;
  while (k < src.length && (src[k] === " " || src[k] === "\t")) k++;
  return m[k] === src[k] && m[k] !== " ";
}

function jsClause(cl) {
  const b = [];
  const brace = /\{([^}]*)\}/.exec(cl);
  if (brace)
    for (const part of brace[1].split(",")) {
      const p = part.trim().replace(/^type\s+/, "");
      const mm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(p);
      if (mm) b.push({ local: mm[2] || mm[1], orig: mm[1], kind: "named" });
    }
  for (const r of cl.replace(/\{[^}]*\}/, "").split(",")) {
    const t = r.trim();
    if (!t) continue;
    const ns = /^\*\s+as\s+([\w$]+)$/.exec(t);
    if (ns) b.push({ local: ns[1], orig: "*", kind: "namespace" });
    else if (/^[\w$]+$/.test(t)) b.push({ local: t, orig: "default", kind: "default" });
  }
  return b;
}

function importsFor(lang, src, m, starts) {
  const out = [];
  const line = (i) => lineOf(starts, i);
  let x;
  if (lang === "js" || lang === "ts") {
    const IMP = /^[ \t]*import[ \t]+(?:type[ \t]+)?([\w$*{}\s,]+?)[ \t]*from[ \t]*['"]([^'"\n]+)['"]/gm;
    while ((x = IMP.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[2], line: line(x.index), bindings: jsClause(x[1]) });
    const REQ = /(?:const|let|var)[ \t]+(\{[^}]*\}|[A-Za-z_$][\w$]*)[ \t]*=[ \t]*require\([ \t]*['"]([^'"\n]+)['"][ \t]*\)(?:\.([A-Za-z_$][\w$]*))?/g;
    while ((x = REQ.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const bindings = [];
      if (x[1][0] === "{") {
        for (const p of x[1].slice(1, -1).split(",")) {
          const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?\s*$/.exec(p);
          if (mm) bindings.push({ local: mm[2] || mm[1], orig: mm[1], kind: "named" });
        }
      } else if (x[3]) bindings.push({ local: x[1], orig: x[3], kind: "named" });
      else bindings.push({ local: x[1], orig: "default", kind: "namespace" });
      out.push({ from: x[2], line: line(x.index), bindings });
    }
  } else if (lang === "py") {
    const FROM = /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]+)/gm;
    while ((x = FROM.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const bindings = [];
      for (const p of x[2].replace(/[()]/g, "").split(",")) {
        const mm = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(p);
        if (mm) bindings.push({ local: mm[2] || mm[1], orig: mm[1], kind: "named" });
      }
      out.push({ from: x[1], line: line(x.index), bindings });
    }
    const IMP = /^[ \t]*import[ \t]+([^\n#]+)/gm;
    while ((x = IMP.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      for (const p of x[1].split(",")) {
        const mm = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(p);
        if (!mm) continue;
        const mod = mm[2] ? mm[1] : mm[1].split(".")[0];
        out.push({ from: mod, line: line(x.index), bindings: [{ local: mm[2] || mod, orig: mod, kind: "namespace" }] });
      }
    }
  } else if (lang === "go") {
    const addGo = (alias, p, at) => {
      const local = alias || p.split("/").pop();
      out.push({ from: p, line: line(at), bindings: alias === "_" || alias === "." ? [] : [{ local, orig: local, kind: "namespace" }] });
    };
    const ONE = /^import[ \t]+(?:([\w.]+)[ \t]+)?"([^"]+)"/gm;
    while ((x = ONE.exec(src))) if (codeAt(src, m, x.index)) addGo(x[1], x[2], x.index);
    const BLOCK = /^import[ \t]*\(([\s\S]*?)\)/gm;
    while ((x = BLOCK.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      let off = x.index + x[0].indexOf("(") + 1;
      for (const l of x[1].split("\n")) {
        const mm = /^\s*(?:([\w.]+)\s+)?"([^"]+)"/.exec(l);
        if (mm) addGo(mm[1], mm[2], off);
        off += l.length + 1;
      }
    }
  } else if (lang === "java") {
    const IMP = /^[ \t]*import[ \t]+(static[ \t]+)?([\w.]+?)(\.\*)?[ \t]*;/gm;
    while ((x = IMP.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const parts = x[2].split(".");
      if (x[3]) out.push({ from: x[2], line: line(x.index), bindings: [], star: true });
      else if (x[1]) out.push({ from: parts.slice(0, -1).join("."), line: line(x.index), bindings: [{ local: parts[parts.length - 1], orig: parts[parts.length - 1], kind: "named" }] });
      else out.push({ from: x[2], line: line(x.index), bindings: [{ local: parts[parts.length - 1], orig: parts[parts.length - 1], kind: "named" }] });
    }
  } else if (lang === "cs") {
    const USING = /^[ \t]*using[ \t]+(?:static[ \t]+)?(?:(\w+)[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm;
    while ((x = USING.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[2], line: line(x.index), bindings: [] });
  } else if (lang === "php") {
    const USE = /^[ \t]*use[ \t]+(?:function[ \t]+)?([\w\\]+)(?:[ \t]+as[ \t]+(\w+))?[ \t]*;/gm;
    while ((x = USE.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const last = x[1].split("\\").pop();
      out.push({ from: x[1], line: line(x.index), bindings: [{ local: x[2] || last, orig: last, kind: "named" }] });
    }
    const INC = /\b(?:require|include)(?:_once)?[ \t]*\(?[ \t]*['"]([^'"\n]+\.php)['"]/g;
    while ((x = INC.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[1], line: line(x.index), bindings: [], include: true });
  } else if (lang === "rb") {
    // `require_relative "../store"` is a path; `require "store"` is a load
    // path entry, matched by suffix. Neither names the constants it brings in,
    // so the file is the binding and the UNIQUE rung names the symbol.
    const REQ = /^[ \t]*require(_relative)?[ \t]*\(?[ \t]*['"]([^'"\n]+)['"]/gm;
    while ((x = REQ.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[2], line: line(x.index), bindings: [], ...(x[1] ? { include: true } : {}) });
  } else if (lang === "rs") {
    // `mod store;` names a sibling file; `use crate::store::OrderStore` names
    // a symbol in one. A `{a, b}` group brings in several names at once.
    const MOD = /^[ \t]*(?:pub[ \t]+)?mod[ \t]+([A-Za-z_]\w*)[ \t]*;/gm;
    while ((x = MOD.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[1], line: line(x.index), bindings: [], mod: true });
    const USE = /^[ \t]*(?:pub[ \t]+)?use[ \t]+([^;\n]+);/gm;
    while ((x = USE.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const raw = x[1].replace(/\s+/g, "");
      const g = /^(.*?)::\{(.+)\}$/.exec(raw);
      const bindings = [];
      const take = (p) => {
        const mm = /^(?:.*::)?(\w+)(?:as(\w+))?$/.exec(p);
        if (mm && mm[1] !== "self" && mm[1] !== "*") bindings.push({ local: mm[2] || mm[1], orig: mm[1], kind: "named" });
      };
      if (g) {
        for (const p of g[2].split(",")) if (p) take(p);
        out.push({ from: g[1], line: line(x.index), bindings });
      } else {
        take(raw);
        out.push({ from: raw.replace(/::\w+$/, ""), line: line(x.index), bindings });
      }
    }
  } else if (lang === "kt") {
    const IMP = /^[ \t]*import[ \t]+([\w.]+?)(\.\*)?(?:[ \t]+as[ \t]+(\w+))?[ \t]*$/gm;
    while ((x = IMP.exec(src))) {
      if (!codeAt(src, m, x.index)) continue;
      const last = x[1].split(".").pop();
      if (x[2]) out.push({ from: x[1], line: line(x.index), bindings: [], star: true });
      else out.push({ from: x[1], line: line(x.index), bindings: [{ local: x[3] || last, orig: last, kind: "named" }] });
    }
  } else if (lang === "c") {
    // Only a QUOTED include is a file in this repository; `<vector>` is not.
    const INC = /^[ \t]*#[ \t]*include[ \t]*"([^"\n]+)"/gm;
    while ((x = INC.exec(src))) if (codeAt(src, m, x.index)) out.push({ from: x[1], line: line(x.index), bindings: [], include: true });
  }
  return out;
}

// ── effects ─────────────────────────────────────────────────────────────────
const SQL_RE = /^\s*(SELECT\s|INSERT\s+INTO\s|UPDATE\s+[\w."`\[\]]+\s+SET\s|DELETE\s+FROM\s|CREATE\s+(TABLE|INDEX|VIEW)\s|ALTER\s+TABLE\s|DROP\s+TABLE\s|WITH\s+\w+\s+AS\s*\(|MERGE\s+INTO\s)/i;
const HTTP_RE = /^(fetch|axios|axios\.(get|post|put|patch|delete|head|request)|https?\.(request|get)|requests\.(get|post|put|patch|delete|head|request)|httpx\.(get|post|put|patch|delete|request)|http\.(Get|Post|Head|NewRequest|NewRequestWithContext)|curl_exec|Http\.(get|post|put|patch|delete)|restTemplate\.\w+|webClient\.\w+|httpClient\.(get|post|put|patch|delete|send|GetAsync|PostAsync|PutAsync|DeleteAsync|SendAsync)|urllib\.request\.urlopen|urlopen)$/;
const DB_RE = /(^[\w$]+(\.[\w$]+)*\.(query|execute|executemany|executescript|raw|\$queryRaw|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe)$)|(^prisma\.[\w$]+\.[\w$]+$)|(^knex(\.|$))|(\.objects\.\w+$)|(^(db|conn|connection|pool|cursor|session|sequelize|em|entityManager|dataSource|queryRunner|mongoose|collection)\.[\w$]+$)/;
const FS_RE = {
  js: /^(fs|fsp|fse|fs\.promises)\.(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|outputFile|remove)$/,
  go: /^(os\.(WriteFile|Create|Remove|RemoveAll|Mkdir|MkdirAll|Rename)|ioutil\.WriteFile)$/,
  py: /^(os\.(remove|unlink|rename|makedirs|mkdir|rmdir)|shutil\.(rmtree|move|copy|copyfile)|.+\.(write_text|write_bytes))$/,
  php: /^(file_put_contents|unlink|mkdir|rmdir|rename|fwrite)$/,
  cs: /^(File\.(Write\w*|Delete|Move|Copy|AppendAll\w*|Create)|Directory\.(CreateDirectory|Delete))$/,
  java: /^(Files\.(write|writeString|delete|deleteIfExists|move|copy|createDirectories))$/,
};
FS_RE.ts = FS_RE.js;
const ENV_RE = /process\.env(?:\.([A-Za-z_]\w*)|\[\s*['"`]([^'"`]+)['"`]\s*\])|os\.environ(?:\.get\(\s*|\[\s*)['"]([^'"]+)['"]|os\.getenv\(\s*['"]([^'"]+)['"]|os\.Getenv\(\s*"([^"]+)"|System\.getenv\(\s*"([^"]+)"|Environment\.GetEnvironmentVariable\(\s*"([^"]+)"|\bgetenv\(\s*['"]([^'"]+)['"]|\$_ENV\[\s*['"]([^'"]+)['"]/g;

function stringAt(src, strAt, pos) {
  let k = pos;
  while (k < src.length && /\s/.test(src[k])) k++;
  if (!/['"`]/.test(src[k] || "")) return null;
  const s = strAt.get(k + 1);
  return s ? src.slice(s.start, s.end) : null;
}

function parenFor(src, starts, call) {
  if (call._p != null) return call._p;
  const ls = starts[call.line - 1] || 0;
  const le = starts[call.line] || src.length;
  const last = call.name.split(".").pop();
  const i = src.indexOf(last, ls);
  if (i < 0 || i >= le) return null;
  const p = src.indexOf("(", i + last.length);
  return p >= 0 && p < le ? p : null;
}

function effectsOf(lang, src, m, starts, strings, strAt, calls) {
  const out = [];
  for (const s of strings) {
    const text = src.slice(s.start, s.end);
    if (SQL_RE.test(text)) out.push({ type: "sql", text: clip(text), line: lineOf(starts, s.start) });
  }
  let x;
  ENV_RE.lastIndex = 0;
  while ((x = ENV_RE.exec(src))) {
    if (!codeAt(src, m, x.index)) continue;
    const name = x.slice(1).find(Boolean);
    if (name) out.push({ type: "env", text: name, line: lineOf(starts, x.index) });
  }
  const fsRe = FS_RE[lang];
  for (const cc of calls) {
    if (HTTP_RE.test(cc.name)) {
      const p = parenFor(src, starts, cc);
      const url = p != null ? stringAt(src, strAt, p + 1) : null;
      out.push({ type: "http", text: url ? `${cc.name} ${clip(url, 60)}` : cc.name, line: cc.line });
    } else if (DB_RE.test(cc.name)) {
      out.push({ type: "db", text: cc.name, line: cc.line });
    } else if (fsRe && fsRe.test(cc.name)) {
      out.push({ type: "fs", text: cc.name, line: cc.line });
    } else if (lang === "py" && cc.name === "open") {
      const p = parenFor(src, starts, cc);
      if (p != null && /^[^)]*?,\s*(?:mode\s*=\s*)?['"][wax]/.test(src.slice(p + 1, p + 120))) out.push({ type: "fs", text: "open (write)", line: cc.line });
    }
  }
  return out;
}

// ── URLs, mounts and prefixes (v1.8.2 W1) ───────────────────────────────────
// A URL is a string that starts with `/`. A template or an f-string whose
// leading expression is unknown (`${base}/p`, `f"{base}/p"`) and a `BASE + "/p"`
// concatenation are SUFFIXES: the path is known, the prefix is not, and the
// resolver matches them by their tail only.
function urlText(s) {
  if (s == null) return null;
  let t = String(s).trim();
  let suffix = false;
  const lead = /^(\$\{[^}]*\}|\{[^}]*\})+/.exec(t);
  if (lead) {
    t = t.slice(lead[0].length);
    suffix = true;
  }
  const abs = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(\/.*)?$/i.exec(t);
  if (abs) t = abs[2] || "/";
  else if (/^[a-z]+:\/\//i.test(t)) return null; // another host — not a route here
  if (!t.startsWith("/") || /[\r\n]/.test(t) || t.length > 200) return null;
  return { url: t, suffix };
}

const GO_METHOD = /^http\.Method(Get|Post|Put|Patch|Delete|Head|Options)$/;

// The URL an HTTP-shaped call names, with its method — or null.
function urlOf(lang, call) {
  const args = call.args;
  if (!args || !args.length) return null;
  const parts = call.name.split(".");
  const last = parts[parts.length - 1];
  const head = parts.length > 1 ? parts[parts.length - 2] : null;
  const pos = args.filter((a) => !a.kw);
  const kw = {};
  for (const a of args) if (a.kw) kw[a.kw] = a;
  // `BASE + "/p"` is one piece whose tail is known: it becomes `{}/p`, which
  // `urlText` reads as a SUFFIX.
  const strArg = (i) => (pos[i] && pos[i].s != null ? pos[i].s : pos[i] && pos[i].cat != null ? "{}" + pos[i].cat : null);
  let method = null;
  let raw = null;
  if (last === "open" && !(kw.method && kw.method.s)) return null;
  if (HTTP_VERBS.has(last) && head !== "Route" && !/^(cache|map|store|redis|client\.hgetall|localStorage|params|headers|searchParams|Map|WeakMap|process|obj|opts|options|config|env|form|url)$/i.test(head || "")) {
    method = VERB_OF(last);
    raw = strArg(0) != null ? strArg(0) : kw.url && kw.url.s != null ? kw.url.s : null;
    // `$this->json('POST', '/p')`, `client.open("/p", method="post")`
  } else if (last === "json" && lang === "php" && strArg(0) && /^[A-Z]+$/.test(strArg(0))) {
    method = strArg(0);
    raw = strArg(1);
  } else if (last === "fetch" || last === "axios" || last === "request" || last === "open" || last === "perform") {
    raw = strArg(0) != null ? strArg(0) : kw.url && kw.url.s != null ? kw.url.s : null;
    const o = (pos[1] && pos[1].obj) || (pos[0] && pos[0].obj) || null;
    method = (o && o.method && o.method.toUpperCase()) || (kw.method && kw.method.s && kw.method.s.toUpperCase()) || "ANY";
    if (last === "perform" && !raw) return null;
  } else if (/^(NewRequest|NewRequestWithContext)$/.test(last) && (head === "http" || head === "httptest")) {
    const i = last === "NewRequestWithContext" ? 1 : 0;
    const mm = strArg(i);
    method = mm ? mm.toUpperCase() : pos[i] && pos[i].id && GO_METHOD.test(pos[i].id) ? GO_METHOD.exec(pos[i].id)[1].toUpperCase() : "ANY";
    raw = strArg(i + 1);
  } else if (/^(Get|Post|Head)$/.test(last) && head === "http") {
    method = last.toUpperCase();
    raw = strArg(0);
  } else if (/^(GetAsync|PostAsync|PutAsync|DeleteAsync|PatchAsync)$/.test(last)) {
    method = last.replace(/Async$/, "").toUpperCase();
    raw = strArg(0);
  } else return null;
  const u = urlText(raw);
  if (!u) return null;
  return { method: method || "ANY", url: u.url, ...(u.suffix ? { suffix: true } : {}), line: call.line };
}

// `app.use("/orders", ordersRouter)` and its cousins → { prefix, target }.
// `target` is a NAME (an import binding, a dotted name), an inline require's
// specifier, or a Django `include()` module — resolved on read.
function mountOf(lang, call) {
  const args = call.args;
  if (!args || !args.length) return null;
  const last = call.name.split(".").pop();
  const pos = args.filter((a) => !a.kw);
  const kw = {};
  for (const a of args) if (a.kw) kw[a.kw] = a;
  const tgt = (a) => (a ? (a.req != null ? a.req : a.inc != null ? a.inc : a.id != null ? a.id : null) : null);
  const norm = (p) => (p == null ? null : String(p).startsWith("/") ? String(p) : "/" + String(p));
  if ((lang === "js" || lang === "ts") && last === "use" && pos[0] && pos[0].s != null && pos[0].s.startsWith("/")) {
    const t = pos.slice(1).map(tgt).find(Boolean);
    return t ? { prefix: pos[0].s, target: t } : null;
  }
  if ((lang === "js" || lang === "ts") && last === "register" && pos[0] && tgt(pos[0])) {
    const o = pos[1] && pos[1].obj;
    return { prefix: (o && o.prefix) || "", target: tgt(pos[0]) };
  }
  if (lang === "py" && (last === "include_router" || last === "register_blueprint" || last === "mount")) {
    if (last === "mount") return pos[0] && pos[0].s != null && tgt(pos[1]) ? { prefix: pos[0].s, target: tgt(pos[1]) } : null;
    const t = tgt(pos[0]);
    if (!t) return null;
    const p = (kw.prefix && kw.prefix.s) || (kw.url_prefix && kw.url_prefix.s) || (pos[1] && pos[1].s) || "";
    return { prefix: p, target: t };
  }
  if (lang === "py" && /^(path|re_path|url)$/.test(last) && pos[0] && pos[0].s != null && pos[1] && pos[1].inc != null) {
    return { prefix: norm(pos[0].s.replace(/^\^/, "")), target: pos[1].inc, module: true };
  }
  if (lang === "go" && (last === "Mount" || last === "Group") && pos[0] && pos[0].s != null && pos[1] && tgt(pos[1])) {
    return { prefix: pos[0].s, target: tgt(pos[1]) };
  }
  return null;
}

// `router = APIRouter(prefix="/orders")` / `bp = Blueprint("x", __name__,
// url_prefix="/x")` / `new Router({ prefix: "/x" })` — the prefix a VARIABLE
// carries in this file. Decorator routes on it and `router.get` registrations
// on it fold it into their name.
function prefixOf(call) {
  const args = call.args;
  if (!args || !call.assign) return null;
  const last = call.name.split(".").pop();
  if (!/^(APIRouter|Blueprint|Router)$/.test(last)) return null;
  for (const a of args) {
    if (a.kw === "prefix" || a.kw === "url_prefix") return a.s != null ? a.s : null;
    if (a.obj && a.obj.prefix) return a.obj.prefix;
  }
  return "";
}

const joinPath = (prefix, p) => {
  const a = String(prefix || "");
  let b = String(p || "");
  if (b && !b.startsWith("/")) b = "/" + b;
  const out = (a + b).replace(/\/{2,}/g, "/");
  return out || "/";
};

// ── assembly ────────────────────────────────────────────────────────────────
function finalize(c, lang, defs, calls, imports, exportsSet, extractor) {
  const { src, m, starts, strings, strAt } = c;
  const rel = c.rel;
  const nLines = starts.length;

  // W1: the prefix each router VARIABLE carries in this file, and the prefix of
  // each class (a decorator on the class).
  const varPrefix = new Map();
  for (const cc of calls) {
    if (cc.ref) continue;
    const p = prefixOf(cc);
    if (p != null) varPrefix.set(cc.assign, p);
  }
  const classPrefix = new Map();
  for (const d of defs) {
    if (d.kind !== "class" || !d.decos) continue;
    for (const deco of d.decos) {
      const r = decoRoute(deco, true);
      if (r && r.prefix != null) classPrefix.set(d.name, r.prefix);
    }
  }
  // Route names. A registration (`router.get("/p", …)`) carries its head's
  // prefix; a decorated handler carries its class's, or its decorator head's.
  const aliases = [];
  for (const d of defs) {
    if (d.kind === "route") {
      const pre = varPrefix.get(d.head) || "";
      d.name = `${d.method} ${clip(joinPath(pre, d.path), 60)}`;
      d.qname = d.name;
      continue;
    }
    if (!d.decos) continue;
    const routes = [];
    for (const deco of d.decos) {
      const r = decoRoute(deco, false);
      if (!r) continue;
      const head = String(deco.name).split(".").slice(0, -1).join(".");
      const cls = d.qname.includes(".") ? d.qname.split(".").slice(0, -1).pop() : null;
      let pre = (cls && classPrefix.get(cls)) || varPrefix.get(head) || "";
      // ASP.NET: `[Route("api/[controller]")]` names the class without its suffix.
      if (cls && /\[controller\]/i.test(pre)) pre = pre.replace(/\[controller\]/gi, cls.replace(/Controller$/, "").toLowerCase());
      for (const rt of r.routes) routes.push({ method: rt.method, path: joinPath(pre, rt.path) });
    }
    if (routes.length) {
      d.route = `${routes[0].method} ${clip(routes[0].path, 60)}`;
      for (const rt of routes) aliases.push({ def: d, name: `${rt.method} ${clip(rt.path, 60)}` });
    }
  }

  const owner = new Int32Array(nLines + 2).fill(-1);
  const order = defs.map((_, i) => i).sort((a, b) => defs[b].e - defs[b].s - (defs[a].e - defs[a].s));
  // W5b (E2): a `const` is a NAME, not a body. A call inside its value (`axios.create(…)`)
  // stays with whatever holds the constant — the module, most often — so a
  // constant symbol always carries `calls: []`.
  for (const i of order) {
    if (defs[i].kind === "const" || defs[i].nameOnly) continue;
    for (let L = defs[i].s; L <= defs[i].e && L <= nLines; L++) owner[L] = i;
  }

  // W2 (G2): instance aliases, scoped. `classAt(line)` is the innermost class
  // holding a line; `ownerOf(line)` the innermost symbol (−1 = the module).
  const classDefs = defs.map((d, i) => ({ d, i })).filter((x) => x.d.kind === "class");
  const classAt = (line) => {
    let best = null;
    for (const x of classDefs) if (x.d.s <= line && line <= x.d.e && (!best || x.d.e - x.d.s < best.d.e - best.d.s)) best = x;
    return best ? best.d : null;
  };
  const ownerOf = (line) => (line >= 0 && line <= nLines ? owner[line] : -1);
  const localAl = new Map(); // owner index → Map<local, cls|null>
  const classAl = new Map(); // class name → Map<field, cls>
  for (let al of aliasesOf(c, lang)) {
    // W5 (G6): a `self` alias with no enclosing class is not a field — it is
    // an indented local (a Kotlin `val` inside a top-level function). Reading
    // it as a local is what it is; dropping it loses the edge.
    if (al.self && !classAt(al.line)) al = { ...al, self: false };
    if (al.self) {
      const cl = classAt(al.line);
      if (!cl) continue;
      const mm = classAl.get(cl.name) || new Map();
      mm.set(al.local, al.cls);
      classAl.set(cl.name, mm);
    } else {
      const idx = ownerOf(al.line);
      const mm = localAl.get(idx) || new Map();
      // The first declaration in a scope wins; a later re-binding of the same
      // name in the same scope is rare and a guess either way.
      if (!mm.has(al.local)) mm.set(al.local, al.cls);
      localAl.set(idx, mm);
    }
  }
  const classOfDef = (d) => (d && d.kind === "method" && d.qname.includes(".") ? d.qname.split(".").slice(0, -1).pop() : d && d.kind === "class" ? d.name : null);
  const aliasFor = (cc) => {
    if (cc.ref || cc.sup || !cc.name.includes(".")) return null;
    const parts = cc.name.split(".");
    if (parts.length !== 2) return null;
    const head = parts[0];
    const idx = ownerOf(cc.line);
    const d = idx >= 0 ? defs[idx] : null;
    if (cc.self) {
      const cn = classOfDef(d) || (classAt(cc.line) || {}).name;
      const mm = cn ? classAl.get(cn) : null;
      const cls = mm ? mm.get(head) : undefined;
      return cls ? { cls, head } : null;
    }
    const scoped = localAl.get(idx);
    if (scoped && scoped.has(head)) {
      const cls = scoped.get(head);
      return cls ? { cls, head } : null; // null = shadowed here
    }
    const modAl = localAl.get(-1);
    if (idx !== -1 && modAl && modAl.has(head)) {
      const cls = modAl.get(head);
      return cls ? { cls, head } : null;
    }
    // Java, C#, Kotlin, C++ and Ruby all reach a field with no `this.`
    // (`@store` in Ruby is the field itself, written without `self.`).
    if (lang === "java" || lang === "cs" || lang === "kt" || lang === "c" || lang === "rb") {
      const cn = classOfDef(d);
      const mm = cn ? classAl.get(cn) : null;
      const cls = mm ? mm.get(head) : undefined;
      return cls ? { cls, head } : null;
    }
    return null;
  };
  // W5 (G6). In Ruby and Kotlin a bare call inside a method is a call on the
  // object — `ok(body)` means `self.ok(body)` — and that is what lets it reach
  // the base class. It is marked self only when THIS FILE has no top-level
  // function of the same name, so a real module function still wins where the
  // language would give it the call.
  if (lang === "rb" || lang === "kt") {
    const topLevel = new Set(defs.filter((d) => d.kind === "function").map((d) => d.name));
    for (const imp of imports || []) for (const b of imp.bindings || []) topLevel.add(b.local);
    for (const cc of calls) {
      if (cc.ref || cc.self || cc.name.includes(".") || topLevel.has(cc.name)) continue;
      const d = defs[ownerOf(cc.line)];
      if (d && d.kind === "method") cc.self = true;
    }
  }
  for (const cc of calls) {
    const al = aliasFor(cc);
    if (!al) continue;
    cc.name = `${al.cls}.${cc.name.split(".")[1]}`;
    cc.alias = al.head;
    delete cc.self;
  }

  // N1: the sentence the author already wrote, read out of the raw source (the
  // mask blanks comments, so it cannot come from `m`).
  const rawLines = src.split(/\r?\n/);
  const syms = defs.map((d) => {
    const doc = docFor(rawLines, lang, d);
    return {
      id: "",
      name: d.name,
      qname: d.qname || d.name,
      kind: d.kind,
      lines: [d.s, d.e],
      exported: !!(d.exported || (exportsSet && exportsSet.has(d.name))),
      body_hash: "",
      calls: [],
      effects: [],
      ...(doc ? { doc } : {}),
      ...(d.route ? { route: d.route } : {}),
      ...(d.bases && d.bases.length ? { bases: d.bases } : {}),
    };
  });
  const mod = { id: "", name: "<module>", qname: "<module>", kind: "module", lines: [1, nLines], exported: false, body_hash: "", calls: [], effects: [] };
  const at = (line) => (owner[line] >= 0 ? syms[owner[line]] : mod);

  const known = new Set(defs.map((d) => d.name));
  for (const imp of imports || []) for (const b of imp.bindings || []) known.add(b.local);
  // A cap is a coverage gap, and the gap starts at the FIRST thing that was
  // dropped — not at the top of the symbol. A file whose `<module>` holds 400
  // calls is fully seen down to call 200; saying the whole file is partial
  // would hide where the record actually stops.
  const cutAt = new Map();
  const cut = (t, line) => {
    const was = cutAt.get(t);
    if (was === undefined || line < was) cutAt.set(t, line);
  };
  for (const cc of calls) {
    // A ref is kept when its head is defined here or imported. Go's package
    // scope is the DIRECTORY, so a bare Go identifier is kept too and the
    // package rung on read decides (`mux.HandleFunc("/p", listOrders)`).
    const refHead = cc.self ? cc.name.split(".").pop() : cc.name.split(".")[0];
    if (cc.ref && !known.has(refHead) && !(lang === "go" && !cc.name.includes("."))) continue;
    const t = at(cc.line);
    if (t.calls.length < MAX_CALLS_PER_SYMBOL)
      t.calls.push({
        name: cc.name,
        line: cc.line,
        ...(cc.self ? { self: true } : {}),
        ...(cc.sup ? { sup: true } : {}),
        ...(cc.ref ? { ref: true } : {}),
        ...(cc.alias ? { alias: cc.alias } : {}),
      });
    else cut(t, cc.line);
    if (cc.ref || !cc.args) continue;
    const u = cc.reg ? null : urlOf(lang, cc);
    if (u) {
      if (!t.urls) t.urls = [];
      if (t.urls.length < MAX_URLS_PER_SYMBOL) t.urls.push(u);
      else cut(t, cc.line);
    }
    const mt = mountOf(lang, cc);
    if (mt) (t.mounts || (t.mounts = [])).push({ ...mt, line: cc.line });
  }
  // A function passed as an argument runs no HTTP, SQL or fs effect by being passed.
  for (const ef of effectsOf(lang, src, m, starts, strings, strAt, calls.filter((cc) => !cc.ref))) {
    const t = at(ef.line);
    if (t.effects.length >= MAX_EFFECTS_PER_SYMBOL) {
      cut(t, ef.line);
      continue;
    }
    if (!t.effects.some((e) => e.type === ef.type && e.text === ef.text)) t.effects.push(ef);
  }

  // The partial RANGES, merged, in line order. A cap gives the tail from the
  // first dropped line; an unbalanced block gives everything from it to the end
  // of the file.
  const ranges = [];
  for (const [t, line] of cutAt) ranges.push([line, t.lines[1]]);
  if (UNBALANCED >= 0) ranges.push([lineOf(starts, UNBALANCED), nLines]);
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const partial = [];
  for (const r of ranges) {
    const last = partial[partial.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else partial.push([r[0], r[1]]);
  }

  const seen = new Map();
  const assignId = (s) => {
    let id = `${rel}#${s.qname}`;
    const k = seen.get(id) || 0;
    seen.set(id, k + 1);
    if (k) id += `~${k + 1}`;
    s.id = id;
  };
  for (const s of syms) {
    const a = starts[s.lines[0] - 1] || 0;
    const b = s.lines[1] < nLines ? starts[s.lines[1]] : src.length;
    s.body_hash = hash(src.slice(a, b));
    assignId(s);
  }
  // W1: the alias ROUTE symbol for a decorated handler. Same lines and the same
  // body hash as the handler; it CALLS the handler (one LOCAL edge on read), so
  // `impact` and `ctx` walk test → route → handler with no special case.
  for (const al of aliases) {
    const h = syms[defs.indexOf(al.def)];
    if (!h) continue;
    const s = {
      id: "",
      name: al.name,
      qname: al.name,
      kind: "route",
      lines: h.lines.slice(),
      exported: false,
      body_hash: h.body_hash,
      calls: [{ name: h.qname, line: h.lines[0], ...(h.kind === "method" ? {} : {}) }],
      effects: [],
      ...(h.doc ? { doc: h.doc } : {}),
      handler: h.id,
    };
    assignId(s);
    syms.push(s);
  }
  if (mod.calls.length || mod.effects.length || mod.urls || mod.mounts) {
    mod.id = `${rel}#<module>`;
    syms.push(mod);
  }
  const reexports = reexportsFor(lang, src, m, rel, imports);
  return {
    extractor,
    imports,
    symbols: syms,
    // K1 (v1.8.2 W4b): the line count. The gain meter's counterfactual needs
    // the AVERAGE line length of this file to price "an 80-line range read",
    // and `bytes / lines` is that, for free, from the parse that just ran.
    lines: nLines,
    coverage: partial.length ? "partial" : "full",
    ...(partial.length ? { partial } : {}),
    ...(reexports.length ? { reexports } : {}),
  };
}

function context(item) {
  const { rel, lang, src } = item;
  const { masked: m, strings } = mask(src, lang);
  const strAt = new Map();
  for (const s of strings) strAt.set(s.start, s);
  return { rel, lang, src, m, strings, strAt, starts: lineIndex(src) };
}

// W5 (G6). A single-file component is a `<script>` block inside markup. Blank
// everything outside it, keeping every newline, so the js/ts rung reads the
// script and every line number is still the FILE's own line number.
function sfcSource(src) {
  const out = src.split("");
  let lang = "js";
  let setup = false;
  const keep = [];
  const lower = src.toLowerCase();
  const RE = /<script\b([^>]*)>/gi;
  let x;
  while ((x = RE.exec(src))) {
    const open = x.index + x[0].length;
    const close = lower.indexOf("</script>", open);
    const end = close < 0 ? src.length : close;
    if (/lang[ \t]*=[ \t]*["']?(ts|typescript)/i.test(x[1])) lang = "ts";
    // W5b (E3): `<script setup>` has no object to name, so the component is
    // named from its file instead.
    if (/(^|\s)setup(\s|=|$)/i.test(x[1])) setup = true;
    keep.push([open, end]);
    RE.lastIndex = end;
  }
  let at = 0;
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  for (const [a, b] of keep) {
    blank(at, a);
    at = b;
  }
  blank(at, src.length);
  return { src: out.join(""), lang, blocks: keep, setup };
}

function extractOne(item, borrowed) {
  let { lang, src } = item;
  resetCoverage();
  let sfc = null;
  if (lang === "vue" || lang === "svelte") {
    const s = sfcSource(src);
    sfc = { blocks: s.blocks, setup: s.setup, svelte: lang === "svelte" };
    src = s.src;
    lang = s.lang;
    item = { ...item, src, lang };
  }
  const c = context(item);
  if (borrowed) {
    const calls = [];
    for (const cc of borrowed.calls) {
      const n = normCall(cc.name);
      if (!n) continue;
      if (cc.ref && n.sup) continue;
      const rec = { name: n.name, line: cc.line, ...(n.self ? { self: true } : {}), ...(n.sup ? { sup: true } : {}), ...(cc.ref ? { ref: true } : {}) };
      if (cc.args) rec.args = cc.args;
      if (cc.assign) rec.assign = cc.assign;
      calls.push(rec);
    }
    const defs = borrowed.defs.map((d) => ({ ...d, from: c.starts[d.s - 1] || 0 }));
    if (lang !== "py") {
      // A borrowed rung that is not Python still needs the ROUTE pass that
      // reads registrations out of the mask (`router.get("/p", …)`), because a
      // route handler is anonymous and the AST has no name to give it.
      const reg = new Set();
      const { defs: rdefs, regParens, exportsSet: hexports } = braceDefs(c, lang);
      resetCoverage();
      for (const d of rdefs) if (d.kind === "route") defs.push({ ...d, s: lineOf(c.starts, d.from), e: lineOf(c.starts, Math.max(d.from, d.to)) });
      // W5b: the walker records a method only inside a class. An object's
      // members, the constants and an SFC's component come from the same pass
      // the heuristic rung runs, so both rungs name the same symbols.
      if (lang === "js" || lang === "ts") defs.push(...objectDefs(c, defs, sfc).defs);
      for (const p of regParens) reg.add(lineOf(c.starts, p));
      for (const cc of calls) if (reg.has(cc.line) && ARGS_WORTH.test(cc.name)) cc.reg = true;
      defs.sort((a, b) => a.from - b.from);
      // `module.exports = { … }` is not in the AST walk; the heuristic half
      // that just ran read it out of the source, so the two sets are merged.
      const exp = new Set([...(borrowed.exportsSet || []), ...(hexports || [])]);
      return finalize(c, lang, defs, calls, borrowed.imports, exp.size ? exp : null, borrowed.extractor);
    }
    // Django routes are module-level calls the ast visitor reports with their
    // argument pieces; the heuristic finds them by regex. Same shape either way.
    for (const cc of calls) {
      if (cc.ref || !cc.args || !/^(path|re_path|url)$/.test(cc.name)) continue;
      const pos = cc.args.filter((a) => !a.kw);
      if (!pos[0] || pos[0].s == null || !pos[1] || pos[1].inc != null || !pos[1].id) continue;
      const p = pos[0].s.replace(/^\^/, "").replace(/\$$/, "");
      const line = cc.line;
      // The ast visitor already reported `views.x` as a ref on this line.
      defs.push({ kind: "route", method: "ANY", path: p.startsWith("/") ? p : "/" + p, head: cc.name, name: "route", s: line, e: cc.end || line, from: c.starts[line - 1] || 0, exported: false });
    }
    return finalize(c, lang, defs, calls, borrowed.imports, null, borrowed.extractor);
  }
  if (lang === "py" || lang === "rb") {
    const { defs, defParens, regParens } = lang === "py" ? pyDefs(c) : rbDefs(c);
    return finalize(c, lang, defs, scanCalls(c, defParens, regParens), importsFor(lang, c.src, c.m, c.starts), null, HEURISTIC);
  }
  const { defs, defParens, regParens, exportsSet } = braceDefs(c, lang);
  if (lang === "js" || lang === "ts") {
    const o = objectDefs(c, defs, sfc);
    defs.push(...o.defs);
    // APPENDED, never sorted in: a file with no object keeps every symbol in
    // the order 1.9.0 wrote it, so its record is the same bytes.
    for (const p of o.defParens) defParens.add(p);
  }
  braceDecorators(c, lang, defs);
  return finalize(c, lang, defs, scanCalls(c, defParens, regParens), importsFor(lang, c.src, c.m, c.starts), exportsSet, HEURISTIC);
}

// ── the borrowed Python parser ──────────────────────────────────────────────
// Emits the SAME rich call shape the heuristic builds (`args` pieces with
// `s` / `id` / `kw` / `list` / `inc`, and `assign`), so `finalize` is one code
// path for both rungs.
const PY_AST = String.raw`
import ast, sys, json
def dotted(n):
    parts = []
    while isinstance(n, ast.Attribute):
        parts.append(n.attr)
        n = n.value
    if isinstance(n, ast.Name):
        parts.append(n.id)
        return ".".join(reversed(parts))
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "super":
        parts.append("super")
        return ".".join(reversed(parts))
    # OrderService().create() -- a constructor call is the receiver (W1).
    if parts and isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id[:1].isupper():
        parts.append(n.func.id)
        return ".".join(reversed(parts))
    return None
def sconst(n):
    if isinstance(n, ast.Constant) and isinstance(n.value, str):
        return n.value
    if isinstance(n, ast.JoinedStr):
        out = []
        for v in n.values:
            if isinstance(v, ast.Constant) and isinstance(v.value, str):
                out.append(v.value)
            else:
                out.append("{}")
        return "".join(out)
    return None
def piece(n, kw=None):
    p = {}
    if kw:
        p["kw"] = kw
    s = sconst(n)
    if s is not None:
        p["s"] = s
        return p
    if isinstance(n, (ast.List, ast.Tuple)):
        items = [sconst(e) for e in n.elts]
        p["list"] = [i for i in items if i is not None]
        return p
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "include" and n.args:
        inc = sconst(n.args[0])
        if inc is not None:
            p["inc"] = inc
            return p
    d = dotted(n)
    if d:
        p["id"] = d
    return p
WORTH = set("get post put patch delete head options fetch request open include_router register_blueprint mount path re_path url APIRouter Blueprint Router route add_url_rule json".split())
class V(ast.NodeVisitor):
    def __init__(s):
        s.defs = []; s.calls = []; s.imports = []; s.stack = []; s.assign_for = {}; s.skip = set()
    def qual(s, name):
        chain = []
        for kind, n in reversed(s.stack):
            if kind != "class":
                break
            chain.append(n)
        chain.reverse()
        return ".".join(chain + [name]), bool(chain)
    def decos(s, node):
        out = []
        for d in node.decorator_list:
            if isinstance(d, ast.Call):
                s.skip.add(id(d))
                name = dotted(d.func)
                if not name:
                    continue
                args = [piece(a) for a in d.args] + [piece(k.value, k.arg) for k in d.keywords if k.arg]
                out.append({"name": name, "args": args})
            else:
                name = dotted(d)
                if name:
                    out.append({"name": name})
        return out
    def visit_ClassDef(s, node):
        q, _ = s.qual(node.name)
        bases = [b for b in (dotted(x) for x in node.bases) if b]
        d = {"name": node.name, "qname": q, "kind": "class", "s": node.lineno, "e": node.end_lineno or node.lineno, "exported": not node.name.startswith("_")}
        if bases:
            d["bases"] = [b.split(".")[-1] for b in bases][:8]
        dl = s.decos(node)
        if dl:
            d["decos"] = dl
        s.defs.append(d)
        s.stack.append(("class", node.name)); s.generic_visit(node); s.stack.pop()
    def visit_FunctionDef(s, node):
        q, inclass = s.qual(node.name)
        d = {"name": node.name, "qname": q, "kind": "method" if inclass else "function", "s": node.lineno, "e": node.end_lineno or node.lineno, "exported": not node.name.startswith("_")}
        dl = s.decos(node)
        if dl:
            d["decos"] = dl
        s.defs.append(d)
        s.stack.append(("function", node.name)); s.generic_visit(node); s.stack.pop()
    visit_AsyncFunctionDef = visit_FunctionDef
    def visit_Assign(s, node):
        if isinstance(node.value, ast.Call) and len(node.targets) == 1:
            t = dotted(node.targets[0])
            if t:
                s.assign_for[id(node.value)] = t
        s.generic_visit(node)
    def visit_AnnAssign(s, node):
        if isinstance(node.value, ast.Call):
            t = dotted(node.target)
            if t:
                s.assign_for[id(node.value)] = t
        s.generic_visit(node)
    def visit_Call(s, node):
        name = dotted(node.func)
        if name and id(node) not in s.skip:
            rec = {"name": name, "line": node.lineno}
            last = name.split(".")[-1]
            if last in WORTH:
                rec["args"] = [piece(a) for a in node.args] + [piece(k.value, k.arg) for k in node.keywords if k.arg]
                rec["end"] = node.end_lineno or node.lineno
                t = s.assign_for.get(id(node))
                if t:
                    rec["assign"] = t
            s.calls.append(rec)
        for a in list(node.args) + [k.value for k in node.keywords]:
            r = dotted(a)
            if r:
                s.calls.append({"name": r, "line": getattr(a, "lineno", node.lineno), "ref": True})
        s.generic_visit(node)
    def visit_Import(s, node):
        for a in node.names:
            mod = a.name if a.asname else a.name.split(".")[0]
            s.imports.append({"from": mod, "line": node.lineno, "bindings": [{"local": a.asname or mod, "orig": mod, "kind": "namespace"}]})
    def visit_ImportFrom(s, node):
        mod = "." * (node.level or 0) + (node.module or "")
        b = [{"local": a.asname or a.name, "orig": a.name, "kind": "named"} for a in node.names if a.name != "*"]
        s.imports.append({"from": mod, "line": node.lineno, "bindings": b})
items = json.loads(sys.stdin.buffer.read().decode("utf-8"))
out = {}
for it in items:
    try:
        with open(it["abs"], "r", encoding="utf-8", errors="replace") as f:
            tree = ast.parse(f.read())
        v = V(); v.visit(tree)
        out[it["rel"]] = {"defs": v.defs, "calls": v.calls, "imports": v.imports}
    except Exception:
        out[it["rel"]] = None
sys.stdout.buffer.write(json.dumps(out).encode("utf-8"))
`;

let pythonProbe;
// ── the borrowed TypeScript parser (v1.8.2 W6, G7) ──────────────────────────
// The Python `ast` rung proved the pattern: if the PROJECT already has the
// tool, borrow it — one batch, exact ranges, and no dependency for ORC.
//
// A project with `node_modules/typescript` gets an EXACT parse of its `.ts`,
// `.tsx`, `.js` and `.jsx` files. It is loaded IN PROCESS (`require`) and only
// `createSourceFile` is used — no `Program`, no type checker, because the graph
// is a locator and a type checker would make an update cost minutes.
//
// Everything else is unchanged: `finalize` gets the same shapes the heuristic
// builds, the mask still runs (aliases and effects are read from it), and
// `ORC_GRAPH_NO_BORROW=1` forces the heuristic back.
let tsProbe;
function findTypeScript(root) {
  if (tsProbe !== undefined && tsProbe !== null && tsProbe.root === root) return tsProbe;
  if (tsProbe === null) return null;
  tsProbe = null;
  if (!root) return null;
  try {
    const lib = path.join(root, "node_modules", "typescript", "lib", "typescript.js");
    if (!fs.existsSync(lib)) return null;
    const ts = require(lib);
    if (!ts || typeof ts.createSourceFile !== "function") return null;
    tsProbe = { ts, ver: String(ts.version || "?"), root };
  } catch (_) {
    tsProbe = null;
  }
  return tsProbe;
}

const TS_SCRIPT_KIND = (ts, rel) => {
  if (/\.tsx$/i.test(rel)) return ts.ScriptKind.TSX;
  if (/\.[cm]?ts$/i.test(rel)) return ts.ScriptKind.TS;
  if (/\.jsx$/i.test(rel)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
};

function tsWalk(ts, it) {
  const sf = ts.createSourceFile(it.rel, it.src, ts.ScriptTarget.Latest, true, TS_SCRIPT_KIND(ts, it.rel));
  const lineAt = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const defs = [];
  const calls = [];
  const imports = [];
  const exportsSet = new Set();
  const chain = []; // the enclosing CLASS names, innermost last

  const text = (n) => {
    try {
      return n.getText(sf);
    } catch (_) {
      return "";
    }
  };
  const unwrap = (n) => {
    while (n && (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n) || (ts.isTypeAssertionExpression && ts.isTypeAssertionExpression(n)))) n = n.expression;
    return n;
  };
  // A dotted NAME the resolver understands: `a.b.c`, `this.x`, `super.m`. A
  // constructor call as the receiver carries the CLASS as the head, which is
  // the W1-chained-new rule (`new S().m()` is a call on `S`).
  const dotted = (node) => {
    const n = unwrap(node);
    if (!n) return null;
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text.replace(/^#/, "");
    if (n.kind === ts.SyntaxKind.ThisKeyword) return "this";
    if (n.kind === ts.SyntaxKind.SuperKeyword) return "super";
    if (ts.isPropertyAccessExpression(n)) {
      const head = dotted(n.expression);
      const tail = n.name && n.name.text;
      if (!tail) return null;
      // A receiver the parser cannot name (`request(app).get(…)`, `rows[0].id`)
      // leaves the BARE member name, exactly as the heuristic's chain regex
      // does — and W1's rule keeps a bare name from ever becoming a method
      // edge. Dropping the call instead would lose the URL it carries.
      return head ? `${head}.${tail}` : tail;
    }
    if (ts.isNewExpression(n)) {
      const c = dotted(n.expression);
      return c && /^[A-Z]/.test(c.split(".").pop()) ? c : null;
    }
    if (ts.isCallExpression(n)) {
      const c = dotted(n.expression);
      if (c === "super") return "super";
      return c && /^[A-Z]/.test(c.split(".").pop()) ? c : null;
    }
    return null;
  };
  // The piece shapes `argPieces` builds, so `urlOf`, `mountOf`, `prefixOf` and
  // `decoRoute` are ONE code path for the borrowed rung and the heuristic.
  const strOf = (n) => {
    const e = unwrap(n);
    if (!e) return null;
    if (ts.isStringLiteralLike(e)) return e.text;
    if (ts.isTemplateExpression(e)) return [e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join("{}");
    return null;
  };
  const piece = (n, kw) => {
    const p = {};
    if (kw) p.kw = kw;
    const e = unwrap(n);
    const s = strOf(e);
    if (s != null) {
      p.s = s;
      return p;
    }
    if (ts.isArrayLiteralExpression(e)) {
      p.list = e.elements.map(strOf).filter((x) => x != null);
      return p;
    }
    if (ts.isObjectLiteralExpression(e)) {
      const obj = {};
      for (const pr of e.properties) {
        if (!ts.isPropertyAssignment(pr) || !pr.name) continue;
        const key = ts.isIdentifier(pr.name) || ts.isStringLiteralLike(pr.name) ? pr.name.text : null;
        const val = strOf(pr.initializer);
        if (key && val != null) obj[key] = val;
      }
      if (Object.keys(obj).length) p.obj = obj;
      return p;
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      // `BASE + "/p"` — the TAIL is known, the prefix is not.
      const tail = strOf(e.right);
      if (tail != null) p.cat = tail;
      return p;
    }
    if (ts.isCallExpression(e)) {
      const head = dotted(e.expression);
      const first = e.arguments && e.arguments.length ? strOf(e.arguments[0]) : null;
      if (head === "require" && first != null) {
        p.req = first;
        return p;
      }
    }
    const id = dotted(e);
    if (id) p.id = id;
    return p;
  };
  const skip = new Set(); // decorator call expressions — never a call of the declaration
  const decosOf = (n) => {
    const list = (ts.getDecorators ? ts.getDecorators(n) : null) || (n.decorators || []);
    const out = [];
    for (const d of list) {
      const e = unwrap(d.expression);
      if (ts.isCallExpression(e)) {
        skip.add(e);
        const name = dotted(e.expression);
        if (!name) continue;
        out.push({ name, args: e.arguments.map((a) => piece(a)) });
      } else {
        const name = dotted(e);
        if (name) out.push({ name });
      }
    }
    return out;
  };
  const modifiers = (n) => (ts.getModifiers ? ts.getModifiers(n) : n.modifiers) || [];
  const has = (n, k) => modifiers(n).some((m2) => m2.kind === k);
  const isExported = (n) => has(n, ts.SyntaxKind.ExportKeyword);
  const isPrivate = (n) => has(n, ts.SyntaxKind.PrivateKeyword) || has(n, ts.SyntaxKind.ProtectedKeyword);

  const push = (node, name, kind, extra) => {
    if (!name) return;
    defs.push({
      name,
      qname: chain.length && kind === "method" ? `${chain[chain.length - 1]}.${name}` : name,
      kind,
      s: lineAt(node.getStart(sf)),
      e: lineAt(node.getEnd()),
      ...extra,
    });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const bindings = [];
      const cl = node.importClause;
      if (cl) {
        if (cl.name) bindings.push({ local: cl.name.text, orig: "default", kind: "default" });
        const nb = cl.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) bindings.push({ local: nb.name.text, orig: "*", kind: "namespace" });
        else if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) bindings.push({ local: el.name.text, orig: (el.propertyName || el.name).text, kind: "named" });
      }
      imports.push({ from: node.moduleSpecifier.text, line: lineAt(node.getStart(sf)), bindings });
    }
    if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) exportsSet.add(el.name.text);
    }
    if (ts.isExportAssignment(node)) {
      const d = dotted(node.expression);
      if (d) exportsSet.add(d);
    }
    if (ts.isClassDeclaration(node) && node.name) {
      const bases = [];
      for (const h of node.heritageClauses || []) for (const t of h.types) {
        const d = dotted(t.expression);
        if (d) bases.push(d.split(".").pop());
      }
      const decos = decosOf(node);
      push(node, node.name.text, "class", {
        exported: isExported(node),
        ...(bases.length ? { bases: bases.slice(0, 8) } : {}),
        ...(decos.length ? { decos } : {}),
      });
      chain.push(node.name.text);
      ts.forEachChild(node, visit);
      chain.pop();
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      push(node, node.name.text, "function", { exported: isExported(node) });
    }
    if (ts.isConstructorDeclaration(node) && node.body && chain.length) {
      push(node, "constructor", "method", { exported: true });
    }
    if ((ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.body && node.name && chain.length) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) ? node.name.text : ts.isPrivateIdentifier(node.name) ? node.name.text.replace(/^#/, "") : null;
      const decos = decosOf(node);
      push(node, name, "method", { exported: !isPrivate(node), ...(decos.length ? { decos } : {}) });
    }
    // `handle = (req, res) => {}` on a class is a method; at module level it is
    // a function. An OVERLOAD signature and an `abstract` member have no body
    // and are not symbols — recording them made every `ctx` on them ambiguous.
    if (ts.isPropertyDeclaration(node) && node.initializer && node.name && chain.length) {
      const init = unwrap(node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        const name = ts.isIdentifier(node.name) ? node.name.text : null;
        const decos = decosOf(node);
        push(node, name, "method", { exported: !isPrivate(node), ...(decos.length ? { decos } : {}) });
      }
    }
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        const init = d.initializer && unwrap(d.initializer);
        if (!init) continue;
        if (!chain.length && ts.isIdentifier(d.name) && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) push(d, d.name.text, "function", { exported: isExported(node) });
        // `const x = require("m")` · `const { a } = require("m")` ·
        // `const x = require("m").Y`
        let call = init;
        let prop = null;
        if (ts.isPropertyAccessExpression(call)) {
          prop = call.name.text;
          call = unwrap(call.expression);
        }
        if (!ts.isCallExpression(call)) continue;
        if (!ts.isIdentifier(call.expression) || call.expression.text !== "require") continue;
        const spec = call.arguments[0] && ts.isStringLiteralLike(call.arguments[0]) ? call.arguments[0].text : null;
        if (!spec) continue;
        const bindings = [];
        if (ts.isObjectBindingPattern(d.name)) {
          for (const el of d.name.elements) if (ts.isIdentifier(el.name)) bindings.push({ local: el.name.text, orig: (el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text), kind: "named" });
        } else if (ts.isIdentifier(d.name)) {
          if (prop) bindings.push({ local: d.name.text, orig: prop, kind: "named" });
          else bindings.push({ local: d.name.text, orig: "default", kind: "namespace" });
        }
        if (bindings.length) imports.push({ from: spec, line: lineAt(d.getStart(sf)), bindings });
      }
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && !skip.has(node)) {
      const name = dotted(node.expression);
      // The line of the CALLEE's own name, not of the whole expression: in a
      // chain broken over lines (`request(app)\n  .post("/orders")`) the call
      // a reader points at is `.post`, and that is the line the heuristic
      // reports and the line a card has to print.
      const callee = unwrap(node.expression);
      const at = callee && ts.isPropertyAccessExpression(callee) && callee.name ? callee.name : callee || node;
      const line = lineAt(at.getStart(sf));
      if (name) {
        // The RAW dotted name: `extractOne` normalises every borrowed rung's
        // calls in ONE place, and normalising twice loses `self`
        // (`this.ok` would already be `ok` by the time it got there).
        const rec = { name, line };
        if (ARGS_WORTH.test(name)) {
          rec.args = (node.arguments || []).map((a) => piece(a));
          rec.end = lineAt(node.getEnd());
          const par = node.parent;
          if (par && ts.isVariableDeclaration(par) && ts.isIdentifier(par.name)) rec.assign = par.name.text;
          else if (par && ts.isBinaryExpression(par) && par.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            const t = dotted(par.left);
            if (t) rec.assign = t;
          }
        }
        calls.push(rec);
      }
      // A name passed AS an argument (`app.get("/p", handler)`) is a ref: an
      // edge only when this file defines or imports it (`finalize` decides).
      for (const a of node.arguments || []) {
        const r = dotted(a);
        if (r) calls.push({ name: r, line: lineAt(a.getStart(sf)), ref: true });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  // `module.exports = …` and `exports.x = …` are CommonJS, and the regex half
  // of the heuristic already reads them out of the source; the walker adds the
  // ES forms above. Both end up in the same set.
  for (const e of it.src.matchAll(/(?:^|[\s;])(?:module\.)?exports\.([A-Za-z_$][\w$]*)[ \t]*=/g)) exportsSet.add(e[1]);
  return { defs, calls, imports, exportsSet: [...exportsSet] };
}

function runTsWalk(items, root) {
  const probe = findTypeScript(root);
  if (!probe) return null;
  const map = {};
  let ok = 0;
  for (const it of items) {
    try {
      map[it.rel] = tsWalk(probe.ts, it);
      ok++;
    } catch (_) {
      // Per FILE, exactly like the Python rung: one file the parser cannot
      // read falls back to the heuristic, and the rest of the batch is exact.
      map[it.rel] = null;
    }
  }
  return ok ? { map, extractor: `typescript@${probe.ver}` } : null;
}

// ── the borrowed Go parser (v1.8.2 W6, G7) ──────────────────────────────────
// Go ships its own parser in its standard library, so a repository that has a
// Go toolchain can have an EXACT parse for free. The program below is written
// once per CLI process to the OS temp directory and run with `go run` over the
// whole batch — JSON in on stdin, JSON out on stdout, the same contract the
// Python rung uses. No module, no network: it imports only `go/parser`,
// `go/ast`, `go/token`, `encoding/json` and `os`.
const GO_AST = String.raw`package main

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strconv"
	"strings"
)

type Piece struct {
	S    *string  ` + "`json:\"s,omitempty\"`" + `
	ID   string   ` + "`json:\"id,omitempty\"`" + `
	List []string ` + "`json:\"list,omitempty\"`" + `
	Cat  string   ` + "`json:\"cat,omitempty\"`" + `
}

type Call struct {
	Name   string  ` + "`json:\"name\"`" + `
	Line   int     ` + "`json:\"line\"`" + `
	End    int     ` + "`json:\"end,omitempty\"`" + `
	Ref    bool    ` + "`json:\"ref,omitempty\"`" + `
	Assign string  ` + "`json:\"assign,omitempty\"`" + `
	Args   []Piece ` + "`json:\"args,omitempty\"`" + `
}

type Def struct {
	Name     string   ` + "`json:\"name\"`" + `
	QName    string   ` + "`json:\"qname\"`" + `
	Kind     string   ` + "`json:\"kind\"`" + `
	S        int      ` + "`json:\"s\"`" + `
	E        int      ` + "`json:\"e\"`" + `
	Exported bool     ` + "`json:\"exported\"`" + `
	Bases    []string ` + "`json:\"bases,omitempty\"`" + `
}

type Imp struct {
	From     string    ` + "`json:\"from\"`" + `
	Line     int       ` + "`json:\"line\"`" + `
	Bindings []Binding ` + "`json:\"bindings\"`" + `
}

type Binding struct {
	Local string ` + "`json:\"local\"`" + `
	Orig  string ` + "`json:\"orig\"`" + `
	Kind  string ` + "`json:\"kind\"`" + `
}

type Out struct {
	Defs    []Def  ` + "`json:\"defs\"`" + `
	Calls   []Call ` + "`json:\"calls\"`" + `
	Imports []Imp  ` + "`json:\"imports\"`" + `
}

type Item struct {
	Rel string ` + "`json:\"rel\"`" + `
	Abs string ` + "`json:\"abs\"`" + `
}

var worth = map[string]bool{
	"Get": true, "Post": true, "Put": true, "Patch": true, "Delete": true, "Head": true, "Options": true,
	"HandleFunc": true, "Handle": true, "GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true,
	"HEAD": true, "OPTIONS": true, "Any": true, "Mount": true, "Group": true, "NewRequest": true,
	"NewRequestWithContext": true, "Query": true, "Exec": true, "ExecContext": true, "QueryContext": true,
	"QueryRow": true, "QueryRowContext": true, "Getenv": true, "LookupEnv": true, "ReadFile": true,
	"WriteFile": true, "Open": true, "Create": true,
}

func dotted(e ast.Expr) string {
	switch n := e.(type) {
	case *ast.Ident:
		return n.Name
	case *ast.SelectorExpr:
		h := dotted(n.X)
		if h == "" {
			return ""
		}
		return h + "." + n.Sel.Name
	case *ast.ParenExpr:
		return dotted(n.X)
	case *ast.StarExpr:
		return dotted(n.X)
	case *ast.IndexExpr:
		return dotted(n.X)
	case *ast.CallExpr:
		h := dotted(n.Fun)
		if h == "" {
			return ""
		}
		last := h[strings.LastIndex(h, ".")+1:]
		if last != "" && strings.ToUpper(last[:1]) == last[:1] {
			return h
		}
		return ""
	}
	return ""
}

func strOf(e ast.Expr) (string, bool) {
	switch n := e.(type) {
	case *ast.BasicLit:
		if n.Kind == token.STRING {
			v, err := strconv.Unquote(n.Value)
			if err == nil {
				return v, true
			}
		}
	case *ast.BinaryExpr:
		if n.Op == token.ADD {
			if r, ok := strOf(n.Y); ok {
				return r, false
			}
		}
	}
	return "", false
}

func pieceOf(e ast.Expr) Piece {
	p := Piece{}
	if s, whole := strOf(e); s != "" {
		if whole {
			v := s
			p.S = &v
		} else {
			p.Cat = s
		}
		return p
	}
	if cl, ok := e.(*ast.CompositeLit); ok {
		for _, el := range cl.Elts {
			if s, whole := strOf(el); whole {
				p.List = append(p.List, s)
			}
		}
		if len(p.List) > 0 {
			return p
		}
	}
	if id := dotted(e); id != "" {
		p.ID = id
	}
	return p
}

func main() {
	var items []Item
	dec := json.NewDecoder(os.Stdin)
	if err := dec.Decode(&items); err != nil {
		os.Exit(1)
	}
	out := map[string]*Out{}
	for _, it := range items {
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, it.Abs, nil, parser.SkipObjectResolution)
		if err != nil || f == nil {
			out[it.Rel] = nil
			continue
		}
		line := func(p token.Pos) int { return fset.Position(p).Line }
		o := &Out{Defs: []Def{}, Calls: []Call{}, Imports: []Imp{}}
		for _, im := range f.Imports {
			pth, err := strconv.Unquote(im.Path.Value)
			if err != nil {
				continue
			}
			local := pth[strings.LastIndex(pth, "/")+1:]
			alias := ""
			if im.Name != nil {
				alias = im.Name.Name
			}
			b := []Binding{}
			if alias != "_" && alias != "." {
				if alias != "" {
					local = alias
				}
				b = append(b, Binding{Local: local, Orig: local, Kind: "namespace"})
			}
			o.Imports = append(o.Imports, Imp{From: pth, Line: line(im.Pos()), Bindings: b})
		}
		for _, d := range f.Decls {
			switch n := d.(type) {
			case *ast.GenDecl:
				if n.Tok != token.TYPE {
					continue
				}
				for _, sp := range n.Specs {
					ts, ok := sp.(*ast.TypeSpec)
					if !ok {
						continue
					}
					def := Def{Name: ts.Name.Name, QName: ts.Name.Name, Kind: "class", S: line(ts.Pos()), E: line(ts.End()), Exported: ts.Name.IsExported()}
					// An EMBEDDED struct field is Go's inheritance: the outer
					// type answers the embedded type's methods.
					if st, ok := ts.Type.(*ast.StructType); ok && st.Fields != nil {
						for _, fl := range st.Fields.List {
							if len(fl.Names) == 0 {
								if b := dotted(fl.Type); b != "" {
									def.Bases = append(def.Bases, b[strings.LastIndex(b, ".")+1:])
								}
							}
						}
					}
					if it, ok := ts.Type.(*ast.InterfaceType); ok && it.Methods != nil {
						for _, fl := range it.Methods.List {
							if len(fl.Names) == 0 {
								if b := dotted(fl.Type); b != "" {
									def.Bases = append(def.Bases, b[strings.LastIndex(b, ".")+1:])
								}
							}
						}
					}
					o.Defs = append(o.Defs, def)
				}
			case *ast.FuncDecl:
				if n.Body == nil {
					continue
				}
				recv := ""
				if n.Recv != nil && len(n.Recv.List) > 0 {
					recv = dotted(n.Recv.List[0].Type)
					recv = recv[strings.LastIndex(recv, ".")+1:]
				}
				kind := "function"
				q := n.Name.Name
				if recv != "" {
					kind = "method"
					q = recv + "." + n.Name.Name
				}
				o.Defs = append(o.Defs, Def{Name: n.Name.Name, QName: q, Kind: kind, S: line(n.Pos()), E: line(n.End()), Exported: n.Name.IsExported()})
			}
		}
		assign := map[ast.Expr]string{}
		ast.Inspect(f, func(nd ast.Node) bool {
			if a, ok := nd.(*ast.AssignStmt); ok && len(a.Lhs) == 1 && len(a.Rhs) == 1 {
				if t := dotted(a.Lhs[0]); t != "" {
					assign[a.Rhs[0]] = t
				}
			}
			return true
		})
		ast.Inspect(f, func(nd ast.Node) bool {
			ce, ok := nd.(*ast.CallExpr)
			if !ok {
				return true
			}
			name := dotted(ce.Fun)
			if name != "" {
				c := Call{Name: name, Line: line(ce.Pos())}
				last := name[strings.LastIndex(name, ".")+1:]
				if worth[last] {
					c.End = line(ce.End())
					for _, a := range ce.Args {
						c.Args = append(c.Args, pieceOf(a))
					}
					if t, ok := assign[ce]; ok {
						c.Assign = t
					}
				}
				o.Calls = append(o.Calls, c)
			}
			for _, a := range ce.Args {
				if r := dotted(a); r != "" {
					o.Calls = append(o.Calls, Call{Name: r, Line: line(a.Pos()), Ref: true})
				}
			}
			return true
		})
		out[it.Rel] = o
	}
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(out); err != nil {
		os.Exit(1)
	}
}
`;

let goProbe;
function findGo() {
  if (goProbe !== undefined) return goProbe;
  goProbe = null;
  const cmd = process.env.ORC_GRAPH_GO || "go";
  try {
    const r = spawnSync(cmd, ["version"], { encoding: "utf8", timeout: 15000, windowsHide: true });
    if (r.status !== 0 || !/go\d|go version/.test(r.stdout || "")) return null;
    const ver = /go(\d+\.\d+(?:\.\d+)?)/.exec(r.stdout || "");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orc-graph-go-"));
    fs.writeFileSync(path.join(dir, "main.go"), GO_AST);
    fs.writeFileSync(path.join(dir, "go.mod"), "module orcgraph\n\ngo 1.20\n");
    goProbe = { cmd, ver: ver ? ver[1] : "?", dir };
  } catch (_) {
    goProbe = null;
  }
  return goProbe;
}

function runGoAst(items, root) {
  void root;
  const go = findGo();
  if (!go) return null;
  const r = spawnSync(go.cmd, ["run", "."], {
    cwd: go.dir,
    input: JSON.stringify(items.map((i) => ({ rel: i.rel, abs: i.abs }))),
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    timeout: 600000,
    windowsHide: true,
    env: { ...process.env, GOFLAGS: "-mod=mod", GO111MODULE: "on" },
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return { map: JSON.parse(r.stdout), extractor: `go-ast@${go.ver}` };
  } catch (_) {
    return null;
  }
}

function findPython() {
  if (pythonProbe !== undefined) return pythonProbe;
  pythonProbe = null;
  const cands = [];
  if (process.env.ORC_GRAPH_PYTHON) cands.push([process.env.ORC_GRAPH_PYTHON]);
  cands.push(["python3"], ["python"], ["py", "-3"]);
  for (const [cmd, ...pre] of cands) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys;print('%d.%d' % sys.version_info[:2]);print(sys.version_info >= (3, 8))"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    if (r.status === 0 && /True/.test(r.stdout || "")) {
      pythonProbe = { cmd, pre, ver: (r.stdout || "").split(/\r?\n/)[0].trim() };
      break;
    }
  }
  return pythonProbe;
}

function runPythonAst(items) {
  const py = findPython();
  if (!py) return null;
  const r = spawnSync(py.cmd, [...py.pre, "-c", PY_AST], {
    input: JSON.stringify(items.map((i) => ({ rel: i.rel, abs: i.abs }))),
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    timeout: 300000,
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return { map: JSON.parse(r.stdout), extractor: `python-ast@${py.ver}` };
  } catch (_) {
    return null;
  }
}

// items: [{ rel, abs, lang, src }] → Map<rel, { extractor, imports, symbols }>
function extractBatch(items, opts) {
  const out = new Map();
  const root = (opts && opts.root) || null;
  const borrow = !process.env.ORC_GRAPH_NO_BORROW;
  const pys = items.filter((i) => i.lang === "py");
  const ast = pys.length && borrow ? runPythonAst(pys) : null;
  // W6 (G7): TypeScript and JavaScript, when the PROJECT has the compiler.
  // The `<script>` block of an SFC is handled by the heuristic rung — the
  // walker would need the blanked source, and the gain is in the .ts tree.
  const jts = items.filter((i) => i.lang === "ts" || i.lang === "js");
  const tsw = jts.length && borrow ? runTsWalk(jts, root) : null;
  const gos = items.filter((i) => i.lang === "go");
  const goa = gos.length && borrow ? runGoAst(gos, root) : null;
  // Which rung answered for this file, so the record's `extractor` names the
  // tool that actually read it — a claim of `typescript@5.4.2` on a file the
  // walker choked on would be a lie the card repeats.
  const rungOf = (rel) => {
    if (ast && ast.map[rel]) return [ast.map[rel], ast.extractor];
    if (tsw && tsw.map[rel]) return [tsw.map[rel], tsw.extractor];
    if (goa && goa.map[rel]) return [goa.map[rel], goa.extractor];
    return [null, null];
  };
  for (const it of items) {
    const [b, tag] = rungOf(it.rel);
    try {
      out.set(it.rel, extractOne(it, b ? { ...b, extractor: tag } : null));
    } catch (_) {
      // A file the extractor cannot read is an empty record, never a failed
      // update: one pathological file must not take the whole map down.
      out.set(it.rel, { extractor: HEURISTIC, error: "extract-failed", imports: [], symbols: [] });
    }
  }
  return out;
}

module.exports = { HEURISTIC, MAX_CALLS_PER_SYMBOL, MAX_EFFECTS_PER_SYMBOL, extractBatch, extractOne, mask, normCall, urlText, joinPath, _findPython: findPython, _findTypeScript: findTypeScript, _findGo: findGo };
