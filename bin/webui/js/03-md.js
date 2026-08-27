"use strict";
/* 03-md.js — orc ui client
   stripMd, reflowMd, stripLeadingGlyph, renderMd, inline, link.
   
   Markdown is rendered to real DOM nodes, NEVER assigned as HTML. renderMd's
   paragraph branch must consume its first line unconditionally — it is the
   fall-through, so a line every branch declines is an infinite loop that hangs
   the panel.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */


// The changelog is markdown written for GitHub. Rather than render it — which
// would mean an HTML sanitiser for text fetched over the network — the few
// inline markers are stripped and it is shown as plain text. Nothing from the
// network is ever parsed as HTML by this panel.
// An inline span may WRAP in the source. CHANGELOG.md is hard-wrapped at ~78
// columns, so a bold run or a code span routinely straddles a newline — and `.`
// does not match a newline, so those spans survived unstripped: the panel showed
// literal asterisks and, worse, a mispaired backtick run that swallowed the
// prose between two unrelated code spans. `[\s\S]` is the whole fix; the
// quantifiers stay non-greedy, so nothing runs past its next closing marker.
function stripMd(s) {
  return String(s)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").trim())
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/`([\s\S]+?)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

// REFLOW (v0.44.1). The changelog is this repo's own CHANGELOG.md, and that
// file is hard-wrapped at ~78 columns. `.cl-body` renders `pre-wrap`, so every one of
// those authoring line breaks survived into a 660px box: paragraphs came out as
// a ragged stack of short lines that ended nowhere near the right edge, which
// is exactly the "misaligned" the modal looked. The wrapping belongs to the
// box, not to the source file.
//
// Blank lines are paragraph breaks and are KEPT; a bullet keeps its own line
// (joining those would run a list into one sentence); everything else in a
// paragraph joins with a space and wraps to whatever width it is given.
function reflowMd(s) {
  return String(s)
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split("\n")
        .reduce((lines, raw) => {
          const line = raw.trim();
          if (!line) return lines;
          // A bullet opens a line; anything else continues the one before it,
          // which is also how a bullet that wrapped in the source rejoins.
          if (!lines.length || line.startsWith("• ")) lines.push(line);
          else lines[lines.length - 1] += " " + line;
          return lines;
        }, [])
        .join("\n")
    )
    .filter(Boolean)
    .join("\n\n");
}

// The onboarding titles carry a circled number ("① What ORC is") because a
// terminal has no other way to show order. The rail already numbers every item,
// so the glyph would be shown twice.
function stripLeadingGlyph(s) {
  return String(s || "").replace(/^[①-⑳⓪]\s*/, "");
}
/* --- markdown → DOM -------------------------------------------------------
   Small on purpose: headings, fenced code, tables, quotes, lists, rules and
   paragraphs — the shapes the mocked runs actually use. Anything it does not
   recognise stays as text, which is the correct failure: an unrendered line is
   readable, a swallowed one is not.

   A link to another `.md` in the catalogue becomes a button that opens that
   document here. A link that resolves to nothing renders as its text, never as
   a dead link. */
function renderMd(md, opts) {
  const o = opts || {};
  const lines = String(md || "").split(/\r?\n/);
  const out = frag();
  let i = 0;
  let skippedTitle = false;

  const isTableRow = (s) => /^\s*\|.*\|\s*$/.test(s || "");
  const isDivider = (s) => /^\s*\|?[\s:|-]{3,}\|?\s*$/.test(s || "") && (s || "").includes("-");

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code. The fence language is ignored — none of these documents are
    // syntax-highlighted, and a wrong highlight is worse than none.
    const fence = line.match(/^\s*```/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; // the closing fence
      const box = el("div", "md-codebox");
      const pre = el("pre", "md-code", buf.join("\n"));
      const b = el("button", "copy-btn md-code-copy", t("common.copy").toLowerCase());
      b.type = "button";
      b.addEventListener("click", () => copy(buf.join("\n"), t("mockrun.codeBlock")));
      box.append(pre, b);
      out.append(box);
      continue;
    }

    // Table: a row, then a divider row.
    if (isTableRow(line) && isDivider(lines[i + 1])) {
      const cells = (s) =>
        s
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const table = el("table", "md-table");
      const thead = el("thead");
      const hr = el("tr");
      for (const c of cells(line)) {
        const th = el("th");
        inline(th, c, o);
        hr.append(th);
      }
      thead.append(hr);
      table.append(thead);
      i += 2;
      const tbody = el("tbody");
      while (i < lines.length && isTableRow(lines[i])) {
        const tr = el("tr");
        for (const c of cells(lines[i])) {
          const td = el("td");
          inline(td, c, o);
          tr.append(td);
        }
        tbody.append(tr);
        i++;
      }
      table.append(tbody);
      const scroller = el("div", "md-tablewrap");
      scroller.append(table);
      out.append(scroller);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      // The pane already prints the document title above the article.
      if (h[1].length === 1 && !skippedTitle) {
        skippedTitle = true;
        i++;
        continue;
      }
      const level = Math.min(h[1].length + 1, 5);
      const node = el("h" + level, "md-h md-h" + h[1].length);
      inline(node, h[2], o);
      out.append(node);
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      out.append(el("hr", "md-hr"));
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      const q = el("blockquote", "md-quote");
      inline(q, buf.join(" "), o);
      out.append(q);
      continue;
    }

    const bullet = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /\d/.test(bullet[2]);
      const list = el(ordered ? "ol" : "ul", "md-list");
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) {
          // A wrapped continuation line belongs to the item above it.
          if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && list.lastChild) {
            list.lastChild.append(document.createTextNode(" "));
            inline(list.lastChild, lines[i].trim(), o);
            i++;
            continue;
          }
          break;
        }
        const li = el("li", "md-li md-li-" + Math.min(2, Math.floor(m[1].length / 2)));
        inline(li, m[3], o);
        list.append(li);
        i++;
      }
      out.append(list);
      continue;
    }

    // Paragraph: consecutive plain lines, rewrapped by the box rather than by
    // the file's own 78-column hard wrap (the changelog lesson, v0.44.1).
    //
    // THE FIRST LINE IS TAKEN UNCONDITIONALLY, and that is load-bearing: this
    // is the fall-through branch, so a line the branches above declined but the
    // condition below also rejects (a stray `| … |` row with no divider under
    // it, say) would leave `i` exactly where it was — an infinite loop that
    // hangs the panel on one malformed line. Always consume one, then extend.
    const buf = [lines[i++].trim()];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|#{1,6}\s|>|---|\*\*\*|___)/.test(lines[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
    )
      buf.push(lines[i++].trim());
    const p = el("p", "md-p");
    inline(p, buf.join(" "), o);
    out.append(p);
  }
  return out;
}

// Inline markup: `code`, **bold**, and links. Everything else is text.
function inline(parent, text, opts) {
  const o = opts || {};
  const src = String(text || "");
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) parent.append(document.createTextNode(src.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith("`")) parent.append(el("code", "md-code-inline", tok.slice(1, -1)));
    else if (tok.startsWith("**")) parent.append(el("strong", null, tok.slice(2, -2)));
    else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      // `nolink` is the recursion stop: a link LABEL gets the same inline pass
      // (so `[`orc mock-run`](…)` is not printed with its backticks) but can
      // never contain another link to descend into.
      if (o.nolink) parent.append(document.createTextNode(lm[1]));
      else parent.append(link(lm[1], lm[2], o));
    }
    last = re.lastIndex;
  }
  if (last < src.length) parent.append(document.createTextNode(src.slice(last)));
}

function link(text, href, o) {
  const label = (node) => {
    inline(node, text, Object.assign({}, o, { nolink: true }));
    return node;
  };
  if (/^https?:\/\//i.test(href)) {
    const a = label(el("a", "md-link"));
    a.href = href;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    return a;
  }
  // A relative link into the catalogue opens in this panel. Resolution is by
  // the target's own tail, so `orc-pact.md` and
  // `../templates/skills/orc-mini/examples/mini-run-mock.md` both land.
  const docs = o.docs || [];
  const tail = href.split("#")[0].replace(/^\.\//, "");
  const base = tail.split("/").pop();
  const hit =
    docs.find((d) => d.path.endsWith(tail.replace(/^(\.\.\/)+/, ""))) ||
    docs.find((d) => d.slug + ".md" === base) ||
    docs.find((d) => d.path.endsWith("/" + base));
  if (hit && o.open) {
    const b = label(el("button", "md-doclink"));
    b.type = "button";
    b.title = hit.title;
    b.addEventListener("click", () => o.open(hit.slug));
    return b;
  }
  // Nothing to open: the words stay, the link does not. A dead link in a panel
  // that cannot browse a repository is a promise it cannot keep.
  return label(el("span", "md-link-flat"));
}
