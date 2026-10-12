"use strict";
// @test-pool pure  — loads bin/webui sources into a vm with a tiny fake DOM
// v2.3.0 — the Light ORC panel (`#/lorc`). It draws `orc lorc … --json` and
// nothing else. These cases render the panel against EVERY fixture state, and
// check the three write routes: they are POST-only, and they send exactly the
// body the contract names (`{key, value, global}` and `{id}`).
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { REPO, WEBUI } = require("../_helpers");

const api = require(path.join(REPO, "bin", "webui", "api.js"));
const fixtures = require(path.join(REPO, "bin", "webui", "fixtures", "index.js"));
const { LORC_STATES, lorcStatus } = require(path.join(REPO, "bin", "webui", "fixtures", "lorc.js"));

/* ------------------------------------------------------------- fake DOM -- */
class Node {
  constructor(tag) {
    this.tagName = String(tag || "").toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.dataset = {};
    this.attrs = {};
    this.style = {};
    this.hidden = false;
    this._text = "";
    this._ls = {};
    const self = this;
    this.classList = {
      add: (c) => (self.className = [...new Set(self.className.split(/\s+/).filter(Boolean).concat(c))].join(" ")),
      remove: (c) => (self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(" ")),
      contains: (c) => self.className.split(/\s+/).includes(c),
      toggle: (c, on) => {
        const has = self.classList.contains(c);
        const want = on === undefined ? !has : !!on;
        if (want && !has) self.classList.add(c);
        if (!want && has) self.classList.remove(c);
        return want;
      },
    };
  }
  set textContent(v) {
    this.children = [];
    this._text = String(v);
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  append(...xs) {
    for (const x of xs) {
      if (x == null) continue;
      const n = typeof x === "string" ? textNode(x) : x;
      if (n.tagName === "#FRAGMENT") {
        for (const c of n.children) (c.parentElement = this), this.children.push(c);
        n.children = [];
      } else {
        n.parentElement = this;
        this.children.push(n);
      }
    }
  }
  after() {}
  replaceChildren(...xs) {
    this.children = [];
    this._text = "";
    this.append(...xs);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  addEventListener(ev, fn) {
    (this._ls[ev] = this._ls[ev] || []).push(fn);
  }
  click() {
    for (const fn of this._ls.click || []) fn({ preventDefault() {}, stopPropagation() {} });
  }
  matches(sel) {
    const m = /^([a-z]*)((?:[#.][\w-]+)*)((?:\[[\w-]+="[^"]*"\])*)$/.exec(sel);
    if (!m) return false;
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    for (const p of m[2].match(/[#.][\w-]+/g) || []) {
      if (p[0] === "." && !this.classList.contains(p.slice(1))) return false;
      if (p[0] === "#" && this.attrs.id !== p.slice(1)) return false;
    }
    for (const a of m[3].match(/\[[\w-]+="[^"]*"\]/g) || []) {
      const [, k, v] = /\[([\w-]+)="([^"]*)"\]/.exec(a);
      const dk = k.startsWith("data-") ? k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()) : null;
      if ((dk ? this.dataset[dk] : this.attrs[k]) !== v) return false;
    }
    return true;
  }
  querySelectorAll(sel) {
    const last = sel.trim().split(/\s+/).pop();
    const out = [];
    const walk = (n) => {
      for (const c of n.children) {
        if (c.matches(last)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
}
function textNode(s) {
  const n = new Node("#text");
  n._text = String(s);
  return n;
}

function makeDom() {
  const root = new Node("html");
  const mk = (tag, id) => {
    const n = new Node(tag);
    n.attrs.id = id;
    root.append(n);
    return n;
  };
  mk("div", "panel");
  mk("div", "toasts");
  mk("div", "banners");
  const nav = mk("ul", "nav");
  const li = new Node("li");
  li.hidden = true;
  const a = new Node("a");
  a.dataset.panel = "lorc";
  li.append(a);
  nav.append(li);
  const document = {
    createElement: (t) => new Node(t),
    createElementNS: (_, t) => new Node(t),
    createTextNode: textNode,
    createDocumentFragment: () => new Node("#fragment"),
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    addEventListener() {},
    body: new Node("body"),
    documentElement: new Node("html"),
  };
  return { root, document, navLi: li };
}

// Loads the real client files into a vm. `fetch` answers from the fixture
// router exactly the way api.js does in `--fixtures` mode, and records every
// call so the method and body can be checked.
function boot(state) {
  const { root, document, navLi } = makeDom();
  const calls = [];
  const hash = { value: "#/lorc" + (state ? "?fx=" + state : "") };
  const ctx = {
    document,
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Promise,
    JSON,
    history: { replaceState() {} },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    localStorage: { getItem: () => null, setItem() {} },
    location: {
      search: "",
      pathname: "/",
      get hash() {
        return hash.value;
      },
      set hash(v) {
        hash.value = v;
      },
    },
    fetch: async (url, opts) => {
      const u = new URL(url, "http://x");
      const method = (opts && opts.method) || "GET";
      const body = opts && opts.body ? JSON.parse(opts.body) : undefined;
      calls.push({ route: u.pathname, method, body, query: Object.fromEntries(u.searchParams) });
      let payload;
      if (method === "GET") {
        const data = fixtures.get(u.pathname, Object.fromEntries(u.searchParams));
        payload = data === undefined ? { error: "no fixture" } : { ok: true, exit_code: 0, data, fixture: true };
      } else {
        const c = fixtures.post(u.pathname, body);
        payload = c ? { ok: true, exit_code: c.exit_code, data: c.data } : { ok: true, fixture: true };
      }
      return { ok: !payload.error, status: payload.error ? 404 : 200, json: async () => payload };
    },
    t: (k, v) => k + (v ? " " + JSON.stringify(v) : ""),
    tn: (n, k) => k + " " + n,
  };
  vm.createContext(ctx);
  for (const f of ["js/00-core.js", "js/02-ui.js", "js/04-router.js", "js/panels/lorc.js"])
    vm.runInContext(fs.readFileSync(path.join(WEBUI, f), "utf8"), ctx, { filename: f });
  vm.runInContext("metaInfo = { fixtures: true, project_root: '' };", ctx);
  return { ctx, root, calls, navLi, panel: root.querySelector("#panel") };
}

const settle = () => new Promise((r) => setTimeout(r, 15));
function tab(panel, id) {
  return panel.querySelectorAll("button").find((b) => b.dataset.tab === id);
}
async function openTab(env, id) {
  vm.runInContext("PANELS.lorc", env.ctx)(env.panel);
  await settle();
  tab(env.panel, id).click();
  await settle();
  return env.panel.textContent;
}

/* ---------------------------------------------------------------- tests -- */

test("lorc: the fixtures carry one of every state", () => {
  assert.deepStrictEqual(LORC_STATES, ["none", "project", "global", "both", "old", "noruns", "unreadable"]);
  assert.deepStrictEqual(
    LORC_STATES.map((s) => lorcStatus[s].installed),
    ["none", "project", "global", "both", "global", "project", "project"]
  );
  // Every status answer has exactly the contract keys.
  for (const s of LORC_STATES)
    assert.deepStrictEqual(Object.keys(lorcStatus[s]).sort(), ["cli", "cli_ok", "global", "installed", "project", "version"]);
  // Every pass-through answer is the wrapper or a state word.
  for (const r of Object.keys(api.READS).filter((k) => k.startsWith("/api/lorc/") && k !== "/api/lorc/status"))
    for (const s of LORC_STATES) {
      const w = fixtures.get(r, { fx: s });
      assert.ok(w, `${r} ${s} has no fixture`);
      if (w.ok) assert.deepStrictEqual(Object.keys(w).sort(), ["data", "ok", "source"], `${r} ${s}`);
      else assert.ok(["NOT-INSTALLED", "UNREADABLE"].includes(w.state), `${r} ${s}`);
    }
  assert.strictEqual(fixtures.get("/api/lorc/runs", { fx: "unreadable" }).state, "UNREADABLE");
  assert.ok(fixtures.get("/api/lorc/runs", { fx: "unreadable" }).detail);
  assert.strictEqual(fixtures.get("/api/lorc/habits", {}).data.proposals.length, 2);
  assert.ok(fixtures.get("/api/lorc/changelog", { fx: "old" }).data.newer.length > 0);
  const runs = fixtures.get("/api/lorc/runs", {}).data.runs;
  assert.deepStrictEqual([...new Set(runs.map((r) => r.tier))].sort(), ["high", "low", "mid"]);
  assert.deepStrictEqual([...new Set(runs.map((r) => r.outcome))].sort(), ["done", "failed", "stopped"]);
});

test("lorc: api.js READS and WRITES match the contract; no write route is a READ", () => {
  const reads = ["status", "runs", "run", "stats", "settings", "habits", "usage", "graph", "doctor", "version", "changelog"].map((x) => "/api/lorc/" + x);
  const writes = ["/api/lorc/settings/set", "/api/lorc/habits/accept", "/api/lorc/habits/decline"];
  assert.deepStrictEqual(Object.keys(api.READS).filter((k) => k.startsWith("/api/lorc/")).sort(), reads.sort());
  assert.deepStrictEqual(Object.keys(api.WRITES).filter((k) => k.startsWith("/api/lorc/")).sort(), writes.sort());
  for (const w of writes) assert.ok(!(w in api.READS), w + " must not be a GET");
  assert.deepStrictEqual(api.READS["/api/lorc/run"]({ slug: "s1" }), ["lorc", "run", "s1"]);
  assert.deepStrictEqual(api.WRITES["/api/lorc/settings/set"]({ key: "limit_pct", value: 80, global: true }), ["lorc", "settings", "set", "limit_pct", "80", "--global"]);
  assert.deepStrictEqual(api.WRITES["/api/lorc/settings/set"]({ key: "limit_pct", value: 80, global: false }), ["lorc", "settings", "set", "limit_pct", "80"]);
  assert.deepStrictEqual(api.WRITES["/api/lorc/habits/accept"]({ id: "mute:style" }), ["lorc", "habits", "accept", "mute:style"]);
  assert.deepStrictEqual(api.WRITES["/api/lorc/habits/decline"]({ id: "mute:style" }), ["lorc", "habits", "decline", "mute:style"]);
});

test("lorc: the rail item is hidden when lorc is not installed, shown otherwise", async () => {
  for (const s of LORC_STATES) {
    const env = boot(s);
    vm.runInContext("lorcRailShow()", env.ctx);
    await settle();
    assert.strictEqual(env.navLi.hidden, s === "none", `state ${s}`);
  }
});

test("lorc: the overview chip shows only when lorc is installed", async () => {
  for (const s of ["none", "both"]) {
    const env = boot(s);
    vm.runInContext("lorcOverviewChip", env.ctx)(env.panel);
    await settle();
    const chip = env.panel.querySelector(".lorc-chip");
    if (s === "none") assert.strictEqual(chip, null);
    else assert.strictEqual(chip.attrs.href || chip.href, "#/lorc");
  }
});

test("lorc: every tab renders in every fixture state", async () => {
  for (const s of LORC_STATES)
    for (const id of ["overview", "runs", "usage", "settings", "behaviour", "version"]) {
      const env = boot(s);
      const text = await openTab(env, id);
      assert.ok(!/common\.loadFail/.test(text), `${s}/${id} failed to load: ${text.slice(0, 200)}`);
      if (s === "none" && id === "overview") assert.ok(text.includes("NOT-INSTALLED"));
      if (s === "none" && id !== "overview") assert.ok(text.includes("NOT-INSTALLED"), `${s}/${id}`);
      if (s === "unreadable" && id !== "overview") {
        assert.ok(text.includes("UNREADABLE"), `${s}/${id}`);
        assert.ok(text.includes("is not valid JSON"), `${s}/${id} must show the detail`);
      }
      if (s === "noruns" && (id === "runs" || id === "usage")) assert.ok(text.includes("lorc.runs.none"), `${s}/${id}`);
      if (s === "both" && id === "runs") assert.ok(text.includes("261009-1520-migrate-auth-tokens") && text.includes("stopped"));
      if (s === "both" && id === "usage") assert.ok(text.includes("4.8132") && text.includes("no transcript"));
      if (s === "old" && id === "version") assert.ok(text.includes("0.2.0") && text.includes("npm i -g @azure-id/lorc@latest") && text.includes("lorc update"));
      if (s === "both" && id === "overview") assert.ok(text.includes("delegate") && text.includes("orphans") && text.includes("18%"));
    }
});

test("lorc: a run row opens its detail in place", async () => {
  const env = boot("both");
  await openTab(env, "runs");
  const row = env.panel.querySelector(".lorc-run-row");
  row.click();
  await settle();
  assert.ok(env.calls.some((c) => c.route === "/api/lorc/run" && c.query.slug === "261011-0912-add-refund-endpoint"));
  assert.ok(env.panel.textContent.includes("refund.service.ts"));
});

test("lorc: a settings edit POSTs {key, value, global}, and a bad value shows the CLI line", async () => {
  const env = boot("both");
  await openTab(env, "settings");
  const input = env.panel.querySelectorAll("input").find((i) => i.dataset.key === "limit_pct");
  const glob = env.panel.querySelectorAll("input").find((i) => i.type === "checkbox");
  glob.checked = true;
  input.value = "200";
  const row = input.parentElement.parentElement;
  row.querySelector("button").click();
  await settle();
  const post = env.calls.find((c) => c.route === "/api/lorc/settings/set");
  assert.strictEqual(post.method, "POST");
  assert.deepStrictEqual(post.body, { key: "limit_pct", value: "200", global: true });
  const err = row.querySelector(".lorc-err");
  assert.strictEqual(err.hidden, false);
  assert.ok(err.textContent.includes("bad value for limit_pct"));
});

test("lorc: accept and decline POST {id}", async () => {
  for (const verb of ["accept", "decline"]) {
    const env = boot("both");
    await openTab(env, "behaviour");
    const btn = env.panel.querySelectorAll("button").find((b) => b.dataset.verb === verb);
    btn.click();
    await settle();
    const post = env.calls.find((c) => c.route === "/api/lorc/habits/" + verb);
    assert.strictEqual(post.method, "POST");
    assert.deepStrictEqual(post.body, { id: "executor:mid:sonnet-5-med" });
  }
});

test("lorc: every GET the panel makes is a READ, every POST a WRITE", async () => {
  const env = boot("both");
  for (const id of ["overview", "runs", "usage", "settings", "behaviour", "version"]) await openTab(env, id);
  for (const c of env.calls.filter((x) => x.route.startsWith("/api/lorc/"))) {
    if (c.method === "GET") assert.ok(c.route in api.READS, c.route);
    else assert.ok(c.route in api.WRITES, c.route);
  }
});
