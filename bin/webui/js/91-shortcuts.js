"use strict";
/* 91-shortcuts.js — orc ui client
   Single keys, and ONLY when you are not typing into something.

   Loaded by app.html in the order its numeric prefix names. Classic
   script, no import/export: an ES module import carries no query string,
   and every static request here needs the per-launch session token. */

/* =============================================================== shortcuts == */

// Keyboard nav for a panel app that is otherwise all mouse. Deliberately small
// and unmodified: single keys, and ONLY when you are not typing into something.
const SHORTCUTS = () => [
  ["1 – 9, 0", t("shortcuts.panels")],
  ["d · c · p · b · h · m", t("shortcuts.panelsLetters")],
  ["/", t("shortcuts.filter")],
  ["r", t("shortcuts.reload")],
  ["t", t("shortcuts.theme")],
  ["l", t("shortcuts.lang")],
  ["?", t("shortcuts.list")],
  ["Esc", t("shortcuts.escape")],
];

// A keystroke must never be stolen from an input, a textarea or a select — that
// is how a UI eats the "r" in the middle of a path somebody is typing.
function typingInto(t) {
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function showShortcuts() {
  const body = el("div", "stack stack-sm");
  const list = el("dl", "kv");
  for (const [key, what] of SHORTCUTS()) {
    const dt = el("dt");
    dt.append(el("kbd", null, key));
    list.append(dt, el("dd", null, what));
  }
  body.append(list);
  body.append(el("div", "note", t("shortcuts.note")));
  modal({
    title: t("shortcuts.title"),
    body,
    actions: [
      // Dismissing the tour must never be a one-way door: it is skippable
      // precisely because it can be replayed.
      {
        label: t("shortcuts.replay"),
        onClick: (c) => {
          c();
          startFirstRunTour(metaInfo.project_root);
        },
      },
      { label: t("common.close"), onClick: (c) => c() },
    ],
  });
}

function installShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // A dialog owns the keyboard while it is open; it has its own Esc handler.
    if (!$("#modal-host").hidden) return;
    // …and so does a blocking tour step. Its own capture-phase handler has
    // already swallowed the key by now; this is the second lock on the door.
    if (tourActive && tourActive.blocking) return;
    if (typingInto(e.target)) return;

    if (e.key >= "0" && e.key <= "9") {
      // Matched on data-idx, not on position: the rail's order is HTML's to
      // decide, and a positional lookup silently rebinds every key the moment a
      // panel is inserted in the middle.
      const target = document.querySelector('#nav a[data-idx="' + e.key + '"]');
      if (target) {
        e.preventDefault();
        location.hash = target.getAttribute("href");
      }
      return;
    }
    // v0.46.0: the rail outgrew ten digits, so several panels carry a LETTER key.
    // Same lookup, same rule — matched on data-idx, never on position — and the
    // letters are checked before the r/t/l actions so a rail key can never be
    // shadowed by one of them. Adding a panel whose letter collides with an
    // action would break the action; p/b/h/m/c/d were free.
    //
    // The class is derived from the rail rather than re-listed, because that is
    // what went wrong the first time: `c` was given to Challenge in the markup
    // and never added to a hardcoded `[pbhm]`, so the key did nothing and
    // nothing failed. A rail key now works because it is IN THE RAIL.
    if (/^[a-z]$/.test(e.key)) {
      const target = document.querySelector('#nav a[data-idx="' + e.key + '"]');
      if (target) {
        e.preventDefault();
        location.hash = target.getAttribute("href");
        return;
      }
    }
    if (e.key === "/") {
      const f = $("#settings-filter");
      if (f) {
        e.preventDefault();
        f.focus();
        f.select();
      }
      return;
    }
    if (e.key === "r") {
      e.preventDefault();
      route();
      return;
    }
    if (e.key === "t") {
      e.preventDefault();
      $("#theme-toggle").click();
      return;
    }
    if (e.key === "l") {
      e.preventDefault();
      cycleLang();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      showShortcuts();
    }
  });
}
