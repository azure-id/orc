"use strict";
// ── `orc run snapshot` + `orc undo` (v2.0.0 W6b, 08-qol-spec Q2) ─────────────
//
//   orc run snapshot --run <slug> [--json]            at run start: the tree BEFORE the run
//   orc undo --run <slug> [--files a,b] [--apply] [--json]
//
// The defect: quick printed `git checkout -- .` as the undo, which also throws
// away every UNRELATED edit the user had before the run. Claude Code's
// `/rewind` does not cover a subagent or a Bash edit, and almost every ORC edit
// is one. So there was no safe undo at all.
//
// THE SNAPSHOT. `git stash create` makes a commit of the working tree WITHOUT
// touching it (empty on a clean tree → HEAD). `git update-ref
// refs/orc/runs/<slug>/pre <sha>` keeps it alive; it never shows in
// `git stash list`. A stash commit holds TRACKED files only, so every untracked
// file is also written to the object store (`git hash-object -w`) and its blob
// is named in `.claude/orc/run/<slug>/snapshot.json` — user data, never in the
// install manifest. A second snapshot of the same slug (a resumed run) keeps
// the FIRST one: the pre-run tree is the only tree an undo may go back to.
//
// THE UNDO may only revert what the run changed, and must never destroy a user
// edit. So:
//   - the file list is the run's OWN record (`--files`, else the checkpoint's
//     `actual_files`), never `git status` — that list holds the user's edits too;
//   - a file outside that list is never read, never written;
//   - a run file the user edited AFTER the run's last own write (its newest
//     run-folder file) is SKIPPED and named — the user decides, not ORC;
//   - a file the pre-run tree does not hold is deleted only when the disk proves
//     the run created it (birth time after the snapshot). Otherwise it is kept.
// PRINT-ONLY by default (08 Q2, S6: the exact commands are visible, nothing
// runs by itself). `--apply` runs the printed commands, with every rule above.
//
// Exit codes. snapshot: 0 taken (or kept) · 1 usage · 2 not a git repo / no
// commit yet (an answer: the run goes on without an undo). undo: 0 done ·
// 1 usage or a git error · 2 no snapshot for this slug · 3 no record of the
// run's files (pass --files) · 4 done, but a file was kept for the user.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/;
const REF_ROOT = "refs/orc/runs";
const SNAP_FILE = "snapshot.json";
const UNTRACKED_MAX = 5000; // files copied per snapshot
const UNTRACKED_BYTES = 20 * 1024 * 1024; // a bigger file is named, not copied
const AGE_DAYS = 30; // a snapshot ref older than this is removed at the next snapshot
const SLACK_MS = 2000; // mtime resolution on the slowest file systems

function git(cwd, args, opts) {
  const r = spawnSync("git", args, Object.assign({ cwd, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 }, opts || {}));
  return { ok: r.status === 0, code: r.status, out: r.stdout == null ? "" : r.stdout, err: String(r.stderr || "").trim() };
}
const posix = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
const refOf = (slug) => `${REF_ROOT}/${slug}/pre`;

function valueOf(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  return v !== undefined && !v.startsWith("--") ? v : "";
}

function readSnap(runDir, slug) {
  try {
    return JSON.parse(fs.readFileSync(path.join(runDir, slug, SNAP_FILE), "utf8"));
  } catch (_) {
    return null;
  }
}

// → { ok, top } | { ok:false, reason }
function gitTop(cwd) {
  const r = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!r.ok) return { ok: false, reason: "not-a-git-repo" };
  return { ok: true, top: path.resolve(r.out.trim()) };
}

// Remove the refs whose snapshot is older than AGE_DAYS. Only a ref whose
// snapshot.json says so: a ref with no record is left for `orc doctor`.
function pruneOld(top, runDir, now, keep) {
  const pruned = [];
  const r = git(top, ["for-each-ref", "--format=%(refname)", REF_ROOT]);
  if (!r.ok) return pruned;
  for (const ref of r.out.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^refs\/orc\/runs\/(.+)\/pre$/.exec(ref);
    if (!m || m[1] === keep) continue;
    const snap = readSnap(runDir, m[1]);
    if (!snap || !(snap.taken_ms > 0)) continue;
    if (now - snap.taken_ms <= AGE_DAYS * 86400000) continue;
    if (git(top, ["update-ref", "-d", ref]).ok) pruned.push(m[1]);
  }
  return pruned;
}

// → { code, payload }
function snapshot(cwd, runDir, slug, now) {
  now = now || Date.now();
  if (!slug || !SLUG_RE.test(slug)) return { code: 1, payload: { ok: false, reason: "usage", message: "Usage: orc run snapshot --run <slug> [--json]   (slug: [a-z0-9._-])" } };
  const t = gitTop(cwd);
  if (!t.ok) return { code: 2, payload: { ok: false, reason: t.reason, slug, message: "not a git repository — no snapshot, so this run has no `orc undo`" } };
  const top = t.top;
  const ref = refOf(slug);
  const have = git(top, ["rev-parse", "--verify", "-q", ref + "^{commit}"]);
  if (have.ok) {
    const snap = readSnap(runDir, slug);
    return {
      code: 0,
      payload: { ok: true, slug, ref, pre: have.out.trim(), existing: true, taken_at: snap ? snap.taken_at : null, snapshot_file: path.join(runDir, slug, SNAP_FILE), pruned: [], message: "a snapshot for this run already exists — kept (the pre-run tree never moves)" },
    };
  }
  const head = git(top, ["rev-parse", "--verify", "-q", "HEAD"]);
  if (!head.ok) return { code: 2, payload: { ok: false, reason: "no-commit", slug, message: "the repository has no commit yet — no snapshot, so this run has no `orc undo`" } };
  const stash = git(top, ["stash", "create"]);
  if (!stash.ok) return { code: 1, payload: { ok: false, reason: "git-error", slug, message: `git stash create failed: ${stash.err}` } };
  const pre = stash.out.trim() || head.out.trim();
  const clean = !stash.out.trim();
  const upd = git(top, ["update-ref", ref, pre]);
  if (!upd.ok) return { code: 1, payload: { ok: false, reason: "git-error", slug, message: `git update-ref failed: ${upd.err}` } };

  // The untracked files: a stash commit does not hold them.
  const list = git(top, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const paths = list.ok ? list.out.split("\0").filter(Boolean) : [];
  const untracked = [];
  const not_copied = [];
  const toHash = [];
  for (const p of paths) {
    if (toHash.length >= UNTRACKED_MAX || /[\r\n]/.test(p)) {
      not_copied.push({ path: posix(p), why: toHash.length >= UNTRACKED_MAX ? "over the file cap" : "a newline in the name" });
      continue;
    }
    let size = 0;
    try {
      size = fs.statSync(path.join(top, p)).size;
    } catch (_) {
      continue;
    }
    if (size > UNTRACKED_BYTES) not_copied.push({ path: posix(p), why: "over 20 MB" });
    else toHash.push(p);
  }
  if (toHash.length) {
    const h = git(top, ["hash-object", "-w", "--stdin-paths"], { input: toHash.join("\n") + "\n" });
    const blobs = h.ok ? h.out.split("\n").map((l) => l.trim()).filter(Boolean) : [];
    toHash.forEach((p, i) => (blobs[i] ? untracked.push({ path: posix(p), blob: blobs[i] }) : not_copied.push({ path: posix(p), why: "hash-object failed" })));
  }
  const dirty = clean ? [] : git(top, ["diff", "--name-only", "-z", head.out.trim(), pre]).out.split("\0").filter(Boolean).map(posix);
  const snap = {
    version: 1,
    slug,
    ref,
    pre,
    head: head.out.trim(),
    clean,
    taken_at: new Date(now).toISOString(),
    taken_ms: now,
    dirty,
    untracked,
    not_copied,
  };
  const dir = path.join(runDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, SNAP_FILE), JSON.stringify(snap, null, 2) + "\n");
  const pruned = pruneOld(top, runDir, now, slug);
  return {
    code: 0,
    payload: { ok: true, slug, ref, pre, head: snap.head, clean, existing: false, taken_at: snap.taken_at, dirty, untracked: untracked.length, not_copied, snapshot_file: path.join(dir, SNAP_FILE), pruned },
  };
}

// The run's own record of the files it changed.
function runFiles(runDir, slug, flagFiles) {
  if (typeof flagFiles === "string" && flagFiles.trim())
    return { source: "--files", files: flagFiles.split(/[,\s]+/).map(posix).filter(Boolean) };
  let ck = null;
  try {
    ck = JSON.parse(fs.readFileSync(path.join(runDir, slug, "checkpoint.json"), "utf8"));
  } catch (_) {}
  if (!ck) return null;
  const set = new Set();
  for (const f of Array.isArray(ck.actual_files) ? ck.actual_files : []) set.add(posix(f));
  for (const t of Array.isArray(ck.tasks) ? ck.tasks : []) for (const f of Array.isArray(t && t.actual_files) ? t.actual_files : []) set.add(posix(f));
  if (!set.size) return null;
  return { source: "checkpoint.json", files: [...set] };
}

// The run's last own write: the newest file in its run folder (the checkpoint,
// the trace, a lane's own record), the snapshot itself excluded.
function lastRunWrite(runDir, slug, top) {
  let best = null;
  const dir = path.join(runDir, slug);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_) {}
  for (const n of names) {
    if (n === SNAP_FILE) continue;
    try {
      const st = fs.statSync(path.join(dir, n));
      if (st.isFile() && (best == null || st.mtimeMs > best)) best = st.mtimeMs;
    } catch (_) {}
  }
  try {
    const ck = JSON.parse(fs.readFileSync(path.join(dir, "checkpoint.json"), "utf8"));
    if (ck && ck.trace_path) {
      const tp = path.isAbsolute(ck.trace_path) ? ck.trace_path : path.join(top, ck.trace_path);
      const m = fs.statSync(tp).mtimeMs;
      if (best == null || m > best) best = m;
    }
  } catch (_) {}
  return best;
}

function blobOf(top, spec) {
  const r = git(top, ["rev-parse", "--verify", "-q", spec]);
  return r.ok ? r.out.trim() : null;
}

// → { code, payload }
function undo(cwd, runDir, slug, opts) {
  opts = opts || {};
  if (!slug || !SLUG_RE.test(slug)) return { code: 1, payload: { ok: false, reason: "usage", message: "Usage: orc undo --run <slug> [--files a,b] [--apply] [--json]   (prints; --apply runs it)" } };
  const t = gitTop(cwd);
  if (!t.ok) return { code: 2, payload: { ok: false, reason: t.reason, slug, message: "not a git repository — there is no snapshot to go back to" } };
  const top = t.top;
  const ref = refOf(slug);
  const snap = readSnap(runDir, slug);
  const pre = blobOf(top, ref + "^{commit}") || (snap && snap.pre && blobOf(top, snap.pre + "^{commit}"));
  if (!pre)
    return { code: 2, payload: { ok: false, reason: "no-snapshot", slug, message: `no snapshot for run ${slug} — the run never called \`orc run snapshot\`, so ORC cannot tell your edits from its own. Nothing was changed.` } };
  const rec = runFiles(runDir, slug, opts.files);
  if (!rec)
    return { code: 3, payload: { ok: false, reason: "no-record", slug, ref, pre, message: `no record of the files run ${slug} changed — pass --files <the run's actual_files>. ORC never guesses from git status: that list holds your edits too.` } };
  // The pre-run INDEX: a stash commit's second parent; a clean tree's is HEAD.
  const preIndex = blobOf(top, pre + "^2^{commit}") || pre;
  const mark = lastRunWrite(runDir, slug, top);
  const projectRoot = path.resolve(opts.projectRoot || top);
  const untracked = new Map(((snap && snap.untracked) || []).map((u) => [u.path, u.blob]));
  const notCopied = new Set(((snap && snap.not_copied) || []).map((u) => u.path));
  const takenMs = snap && snap.taken_ms > 0 ? snap.taken_ms : null;

  const rows = [];
  for (const raw of [...new Set(rec.files)].sort()) {
    const abs = path.resolve(projectRoot, raw);
    const rel = posix(path.relative(top, abs));
    const row = { path: rel, action: null, reason: null, commands: [] };
    rows.push(row);
    if (!rel || rel.startsWith("../") || path.isAbsolute(rel) || rel.startsWith(".git/")) {
      Object.assign(row, { action: "skipped", reason: "outside the repository" });
      continue;
    }
    let st = null;
    try {
      st = fs.statSync(abs);
    } catch (_) {}
    if (st && !st.isFile()) {
      Object.assign(row, { action: "skipped", reason: "not a regular file" });
      continue;
    }
    if (st && mark != null && st.mtimeMs > mark + SLACK_MS) {
      Object.assign(row, { action: "skipped", reason: "edited after the run's last write — yours now; restore it by hand if you want", hint: `git restore --source=${ref} -- ${rel}` });
      continue;
    }
    const preBlob = blobOf(top, `${pre}:${rel}`);
    const cur = st ? git(top, ["hash-object", "--", rel]).out.trim() : null;
    if (preBlob) {
      if (cur === preBlob) row.action = "unchanged";
      else {
        row.action = "restore";
        row.commands.push(`git restore --source=${ref} --worktree -- ${rel}`);
      }
    } else if (untracked.has(rel)) {
      const blob = untracked.get(rel);
      if (cur === blob) row.action = "unchanged";
      else {
        row.action = "restore-untracked";
        row.blob = blob;
        row.commands.push(`git cat-file blob ${blob} > ${rel}`);
      }
    } else if (notCopied.has(rel)) {
      Object.assign(row, { action: "skipped", reason: "it existed before the run but the snapshot could not copy it" });
      continue;
    } else if (!st) {
      row.action = "unchanged";
    } else {
      // Not in the pre-run tree and not an untracked file then: the run created
      // it, or it is an IGNORED file the snapshot never saw. Delete only on proof.
      const born = st.birthtimeMs > 0 ? st.birthtimeMs : null;
      if (takenMs != null && born != null && born >= takenMs - SLACK_MS) {
        row.action = "delete";
        row.commands.push(`git rm --cached --quiet --ignore-unmatch -- ${rel}`, `rm -- ${rel}`);
      } else {
        Object.assign(row, { action: "skipped", reason: born != null ? "it existed before the run (an ignored file the snapshot does not hold)" : "cannot prove the run created it" });
        continue;
      }
    }
    // The index: back to the pre-run index entry, only when it differs.
    if (row.action !== "delete") {
      const idxNow = git(top, ["ls-files", "-s", "--", rel]).out.trim().split(/\s+/)[1] || null;
      const idxPre = blobOf(top, `${preIndex}:${rel}`);
      if (idxNow !== idxPre) {
        if (idxPre) row.commands.push(`git restore --source=${preIndex === pre ? ref : ref + "^2"} --staged -- ${rel}`);
        else if (idxNow) row.commands.push(`git rm --cached --quiet -- ${rel}`);
        if (row.action === "unchanged") row.action = "restore-index";
      }
    }
  }

  const failed = [];
  if (opts.apply) {
    for (const row of rows) {
      if (!row.commands.length) continue;
      const abs = path.join(top, row.path);
      try {
        for (const c of row.commands) {
          if (c.startsWith("rm -- ")) fs.unlinkSync(abs);
          else if (c.startsWith("git cat-file blob ")) {
            const b = spawnSync("git", ["cat-file", "blob", row.blob], { cwd: top, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
            if (b.status !== 0) throw new Error(String(b.stderr || "cat-file failed").trim());
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, b.stdout);
          } else {
            const argv = c.replace(/^git /, "").split(" -- ")[0].split(" ").concat(["--", row.path]);
            const r = git(top, argv);
            if (!r.ok) throw new Error(r.err || c);
          }
        }
      } catch (e) {
        row.error = String((e && e.message) || e);
        failed.push(row.path);
      }
    }
  }
  const pick = (a) => rows.filter((r) => r.action === a).map((r) => r.path);
  const skipped = rows.filter((r) => r.action === "skipped").map((r) => ({ path: r.path, reason: r.reason, hint: r.hint || null }));
  const payload = {
    ok: !failed.length,
    slug,
    ref,
    pre,
    applied: !!opts.apply,
    files_source: rec.source,
    last_run_write: mark == null ? null : new Date(mark).toISOString(),
    files: rows,
    restored: rows.filter((r) => /^restore/.test(r.action)).map((r) => r.path),
    deleted: pick("delete"),
    unchanged: pick("unchanged"),
    skipped,
    failed,
    commands: rows.reduce((a, r) => a.concat(r.commands), []),
  };
  return { code: failed.length ? 1 : skipped.length ? 4 : 0, payload };
}

function renderSnapshot(p) {
  if (!p.ok) return console.error(p.message);
  if (p.existing) return console.log(`snapshot: kept ${p.ref} (${p.pre.slice(0, 10)}) — ${p.message}`);
  console.log(`snapshot: ${p.ref} → ${p.pre.slice(0, 10)}${p.clean ? " (clean tree = HEAD)" : ` (${p.dirty.length} uncommitted file(s) held)`} · ${p.untracked} untracked file(s) copied`);
  for (const n of p.not_copied) console.log(`  not copied: ${n.path} (${n.why})`);
  if (p.pruned.length) console.log(`  removed ${p.pruned.length} snapshot ref(s) older than ${AGE_DAYS} days: ${p.pruned.join(", ")}`);
  console.log(`  undo later: orc undo --run ${p.slug}`);
}

function renderUndo(p) {
  if (!p.files) return console.error(p.message);
  console.log(`undo ${p.slug}${p.applied ? "" : " — PRINT ONLY, nothing changed (--apply runs these commands)"} · files from ${p.files_source}`);
  for (const r of p.files) {
    const tag = r.action === "skipped" ? `KEPT — ${r.reason}` : r.action;
    console.log(`  ${r.path}  ${tag}${r.error ? `  (FAILED: ${r.error})` : ""}`);
    for (const c of r.commands) console.log(`      ${c}`);
    if (r.hint) console.log(`      by hand: ${r.hint}`);
  }
  console.log(`${p.applied ? "" : "with --apply: "}${p.restored.length} restored · ${p.deleted.length} deleted · ${p.unchanged.length} unchanged · ${p.skipped.length} kept for you${p.failed.length ? ` · ${p.failed.length} FAILED` : ""}. Files outside this run were not touched.`);
}

// deps: { args, wantsJson, emitJson, resolveClaudeDir, resolveRunDir, ensureRunDir, repoRootOf }
function snapshotCmd(deps) {
  const claudeDir = deps.resolveClaudeDir();
  const root = deps.repoRootOf(claudeDir);
  const r = snapshot(fs.existsSync(root) ? root : process.cwd(), deps.ensureRunDir(claudeDir), valueOf(deps.args, "--run"));
  if (deps.wantsJson()) deps.emitJson(r.payload, r.code);
  renderSnapshot(r.payload);
  process.exit(r.code);
}

function undoCmd(deps) {
  const claudeDir = deps.resolveClaudeDir();
  const root = deps.repoRootOf(claudeDir);
  const r = undo(fs.existsSync(root) ? root : process.cwd(), deps.resolveRunDir(claudeDir), valueOf(deps.args, "--run"), {
    files: valueOf(deps.args, "--files"),
    apply: deps.args.includes("--apply"),
    projectRoot: root,
  });
  if (deps.wantsJson()) deps.emitJson(r.payload, r.code);
  renderUndo(r.payload);
  process.exit(r.code);
}

module.exports = { snapshot, undo, runFiles, snapshotCmd, undoCmd, refOf, AGE_DAYS };
