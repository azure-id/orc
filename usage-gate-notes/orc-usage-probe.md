# ORC usage probe — read Claude Code's own token numbers

Purpose: find out whether the jump-on-answer burn is a **prompt-cache miss**
(context re-billed at write price) or **real context growth**. Read-only. It
touches nothing but its own output file.

Primary bug (3 concurrent executors on one task) is already proven from the
run traces — this probe only settles the secondary question.

## Run it (macOS, one paste)

```bash
mkdir -p ~/orc-probe && cat > ~/orc-probe/usage.js <<'EOF'
var fs = require("fs"), path = require("path"), os = require("os");
var root = path.join(os.homedir(), ".claude", "projects");
if (!fs.existsSync(root)) {
  console.log("NO " + root);
  process.exit(0);
}
var dirs = [];
fs.readdirSync(root).forEach(function (d) {
  try {
    if (fs.statSync(path.join(root, d)).isDirectory()) dirs.push(d);
  } catch (e) {}
});
console.log("project folders: " + dirs.length);

var files = [];
dirs.forEach(function (d) {
  fs.readdirSync(path.join(root, d)).forEach(function (f) {
    if (f.slice(-6) !== ".jsonl") return;
    var p = path.join(root, d, f);
    try {
      files.push({ p: p, m: fs.statSync(p).mtimeMs });
    } catch (e) {}
  });
});
files.sort(function (a, b) { return b.m - a.m; });
console.log("transcripts: " + files.length);

var out = [], hits = 0;
files.slice(0, 60).forEach(function (rec) {
  var t;
  try { t = fs.readFileSync(rec.p, "utf8"); } catch (e) { return; }
  var isQuick = t.indexOf("orc-quick") !== -1;
  var main = 0, sub = 0, inp = 0, cw = 0, cr = 0, outp = 0, rows = [], seen = {};
  t.split("\n").forEach(function (l) {
    if (!l) return;
    var o;
    try { o = JSON.parse(l); } catch (e) { return; }
    if (o.type !== "assistant" || !o.message || !o.message.usage) return;
    // One assistant message can span several JSONL lines (one per
    // content block) and each line carries the SAME usage object.
    // Counting them all multiplies the totals. Count each id once.
    var id = o.message.id;
    if (id) { if (seen[id]) return; seen[id] = 1; }
    var u = o.message.usage;
    var i = u.input_tokens || 0;
    var w = u.cache_creation_input_tokens || 0;
    var r = u.cache_read_input_tokens || 0;
    var op = u.output_tokens || 0;
    if (o.isSidechain) sub++; else main++;
    inp += i; cw += w; cr += r; outp += op;
    rows.push([w + op * 5, o.timestamp, o.isSidechain ? "SUB " : "MAIN", i, w, r, op]);
  });
  if (!main && !sub) return;
  hits++;
  out.push("=== " + rec.p + (isQuick ? "  [orc-quick]" : "") +
           "  main=" + main + " sub=" + sub);
  out.push("TOTAL in=" + inp + " cache_write=" + cw +
           " cache_read=" + cr + " out=" + outp);
  rows.sort(function (a, b) { return b[0] - a[0]; });
  rows.slice(0, 10).forEach(function (x) {
    out.push("  " + x[1] + " " + x[2] + " in=" + x[3] +
             " cw=" + x[4] + " cr=" + x[5] + " out=" + x[6]);
  });
  out.push("");
});

var dir = path.join(os.homedir(), "Desktop");
if (!fs.existsSync(dir)) dir = os.homedir();
var dest = path.join(dir, "orc-usage.txt");
fs.writeFileSync(dest, out.join("\n"));
console.log("sessions with usage data: " + hits);
console.log("WROTE " + dest);
console.log(out.slice(0, 14).join("\n"));
EOF
node ~/orc-probe/usage.js
```

Result lands at `~/Desktop/orc-usage.txt`.

## If it prints `transcripts: 0`

Claude Code is not keeping transcripts at `~/.claude/projects` on that machine.
Report the printed numbers and we find them another way.

## Reading the output

Each row is one assistant turn:

| field | meaning | price |
|---|---|---|
| `in`  | fresh input tokens | 1x |
| `cw`  | cache **write** | 1.25x |
| `cr`  | cache **read** | 0.1x |
| `out` | output | ~5x |

Look at the `MAIN` rows immediately after a user answer.

- **`cr` near 0 and `cw` huge** -> prompt-cache MISS. The whole conversation was
  re-billed at write price because the gap between the question and the answer
  outlived the cache TTL. Fix belongs in ORC's context footprint and in where it
  places its question boundaries.
- **`cr` large and normal, totals climbing run over run** -> real context growth.
  Fix belongs in what /orc-quick accumulates in the orchestrator: full test-suite
  output after every dispatch and every repair round, plus whole-text material in
  each slice.

`SUB` rows are dispatched subagents. Three SUB streams overlapping in time is
the primary bug, visible here as well as in the traces.

## Not for commit

Process/diagnostic doc. Per CLAUDE.md, working-process documents stay out of git.
