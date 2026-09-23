// W0 probe — throwaway, never committed. Reads Claude Code transcripts only.
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || 'C:/Users/joshu/.claude/projects';

const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) {
  const p = path.join(d,e.name);
  if (e.isDirectory()) walk(p); else if (e.name.endsWith('.jsonl')) files.push(p);
} })(ROOT);

const R = {
  transcripts: 0, unreadable_lines: 0,
  main: { in:0, cw:0, cr:0, out:0, turns:0 },
  side: { in:0, cw:0, cr:0, out:0, turns:0 },
  reads: [],            // main-session Read calls
  side_reads: 0,
  bash_reads: 0, bash_total: 0,
  tasks: [],            // dispatch durations
  no_result: 0,
};

const buckets = [0,100,200,350,500,1000,2000,5000,Infinity];

for (const f of files) {
  let lines;
  try { lines = fs.readFileSync(f,'utf8').split('\n'); } catch { continue; }
  R.transcripts++;
  const use = new Map();   // tool_use_id -> {name,input,ts,sidechain}
  const recs = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    let o; try { o = JSON.parse(l); } catch { R.unreadable_lines++; continue; }
    recs.push(o);
    const m = o.message;
    if (m && Array.isArray(m.content)) for (const c of m.content) {
      if (c.type === 'tool_use') use.set(c.id, { name:c.name, input:c.input||{}, ts:o.timestamp, side:!!o.isSidechain });
    }
  }
  for (let i=0;i<recs.length;i++) {
    const o = recs[i], m = o.message;
    // token accounting per assistant turn
    if (m && m.role === 'assistant' && m.usage) {
      const t = o.isSidechain ? R.side : R.main;
      t.in  += m.usage.input_tokens||0;
      t.cw  += m.usage.cache_creation_input_tokens||0;
      t.cr  += m.usage.cache_read_input_tokens||0;
      t.out += m.usage.output_tokens||0;
      t.turns++;
    }
    if (!m || !Array.isArray(m.content)) continue;
    for (const c of m.content) {
      if (c.type !== 'tool_result') continue;
      const u = use.get(c.tool_use_id); if (!u) { R.no_result++; continue; }
      const txt = typeof c.content === 'string' ? c.content
        : Array.isArray(c.content) ? c.content.map(x => x && x.text || '').join('') : '';
      if (u.name === 'Read') {
        if (u.side) { R.side_reads++; continue; }
        const isErr = c.is_error || /^Error: /.test(txt);
        const img = /^\{?"?type"?:"?image/.test(txt) || (Array.isArray(c.content) && c.content.some(x=>x.type==='image'));
        R.reads.push({
          chars: txt.length,
          lines: txt ? txt.split('\n').length : 0,
          targeted: u.input.offset != null || u.input.limit != null,
          err: !!isErr, img: !!img,
          p: String(u.input.file_path||''),
        });
      }
      if (u.name === 'Bash' && !u.side) {
        R.bash_total++;
        if (/(^|[;&|]\s*)(cat|head|tail|less|more|sed -n|type)\s/.test(String(u.input.command||''))) R.bash_reads++;
      }
      if ((u.name === 'Task' || u.name === 'Agent') && u.ts && o.timestamp) {
        const ms = Date.parse(o.timestamp) - Date.parse(u.ts);
        if (ms > 0 && ms < 6*3600*1000) R.tasks.push(ms);
      }
    }
  }
}

const good = R.reads.filter(r => !r.err && !r.img);
const full = good.filter(r => !r.targeted);
const tgt  = good.filter(r => r.targeted);
const q = (a,p) => a.length ? a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))] : null;
const sum = a => a.reduce((s,x)=>s+x,0);

const hist = {};
for (let i=0;i<buckets.length-1;i++) {
  const lo=buckets[i], hi=buckets[i+1];
  const g = full.filter(r=>r.lines>=lo && r.lines<hi);
  hist[`${lo}-${hi===Infinity?'inf':hi}`] = { n:g.length, chars:sum(g.map(r=>r.chars)) };
}

const est = c => Math.round(c/4);             // ESTIMATE: ~4 chars/token
const mainIngest = R.main.in + R.main.cw;     // tokens that were paid full price

console.log(JSON.stringify({
  transcripts: R.transcripts, unreadable_lines: R.unreadable_lines,
  main_tokens: R.main, side_tokens: R.side,
  main_ingest_tokens: mainIngest,
  reads_total: R.reads.length,
  reads_error: R.reads.filter(r=>r.err).length,
  reads_image: R.reads.filter(r=>r.img).length,
  reads_usable: good.length,
  reads_targeted: tgt.length,
  reads_full: full.length,
  subagent_reads: R.side_reads,
  full_chars_total: sum(full.map(r=>r.chars)),
  full_est_tokens: est(sum(full.map(r=>r.chars))),
  lines_p50: q(full.map(r=>r.lines),0.5),
  lines_p75: q(full.map(r=>r.lines),0.75),
  lines_p90: q(full.map(r=>r.lines),0.90),
  lines_p99: q(full.map(r=>r.lines),0.99),
  lines_max: Math.max(0,...full.map(r=>r.lines)),
  histogram_lines: hist,
  over: [200,350,500,1000,2000].reduce((a,t)=>{
    const g = full.filter(r=>r.lines>=t);
    a[t] = { n:g.length, chars:sum(g.map(r=>r.chars)), est_tokens:est(sum(g.map(r=>r.chars))),
             pct_of_main_ingest: mainIngest? +(est(sum(g.map(r=>r.chars)))/mainIngest*100).toFixed(2):null };
    return a; },{}),
  task_dispatches: R.tasks.length,
  task_ms_p50: q(R.tasks,0.5), task_ms_p90: q(R.tasks,0.9), task_ms_max: Math.max(0,...R.tasks),
  bash_total: R.bash_total, bash_readlike: R.bash_reads,
  orphan_results: R.no_result,
}, null, 2));
