// W0 probe 2 — fidelity check + cache-read amplification bound.
const fs = require('fs'), path = require('path');
const ROOT = 'C:/Users/joshu/.claude/projects';
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) {
  const p = path.join(d,e.name);
  if (e.isDirectory()) walk(p); else if (e.name.endsWith('.jsonl')) files.push(p);
} })(ROOT);

let amplifiedTok = 0, writeTok = 0, nFull = 0, nBig = 0, bigAmp = 0, bigWrite = 0;
let truncMarkers = 0, biggest = [];
let mainCw = 0, mainCr = 0, mainOut = 0, mainIn = 0;

for (const f of files) {
  let lines; try { lines = fs.readFileSync(f,'utf8').split('\n'); } catch { continue; }
  const recs = [];
  for (const l of lines) { if(!l.trim())continue; try{recs.push(JSON.parse(l))}catch{} }
  const use = new Map();
  // index of main-session assistant turns
  const turnIdx = [];
  recs.forEach((o,i)=>{ if(o.message&&o.message.role==='assistant'&&o.message.usage&&!o.isSidechain) turnIdx.push(i); });
  recs.forEach(o=>{ const m=o.message; if(m&&Array.isArray(m.content)) for(const c of m.content) if(c.type==='tool_use') use.set(c.id,{name:c.name,input:c.input||{},side:!!o.isSidechain}); });
  recs.forEach(o=>{ const m=o.message; if(m&&m.role==='assistant'&&m.usage&&!o.isSidechain){
    mainCw+=m.usage.cache_creation_input_tokens||0; mainCr+=m.usage.cache_read_input_tokens||0;
    mainOut+=m.usage.output_tokens||0; mainIn+=m.usage.input_tokens||0; }});

  for (let i=0;i<recs.length;i++) {
    const o=recs[i], m=o.message; if(!m||!Array.isArray(m.content)) continue;
    for (const c of m.content) {
      if (c.type!=='tool_result') continue;
      const u=use.get(c.tool_use_id); if(!u||u.name!=='Read'||u.side) continue;
      if (u.input.offset!=null||u.input.limit!=null) continue;
      const txt = typeof c.content==='string'?c.content:Array.isArray(c.content)?c.content.map(x=>x&&x.text||'').join(''):'';
      if (c.is_error||/^Error: /.test(txt)) continue;
      if (Array.isArray(c.content)&&c.content.some(x=>x.type==='image')) continue;
      if (/truncated|\[\.\.\.\]|<elided>/i.test(txt.slice(-400))) truncMarkers++;
      const tok = Math.round(txt.length/4);
      const after = turnIdx.filter(x=>x>i).length;      // turns this read is re-read on
      const amp = tok * after * 0.1;                    // cache-read weight ~0.1x
      const lines_ = txt?txt.split('\n').length:0;
      writeTok += tok; amplifiedTok += amp; nFull++;
      if (lines_>=350){ nBig++; bigWrite+=tok; bigAmp+=amp; }
      biggest.push({lines:lines_, chars:txt.length, after, p:String(u.input.file_path||'').split(/[\/]/).pop()});
    }
  }
}
biggest.sort((a,b)=>b.chars-a.chars);
console.log(JSON.stringify({
  main: {in:mainIn, cache_write:mainCw, cache_read:mainCr, output:mainOut},
  full_reads: nFull, truncation_markers_seen: truncMarkers,
  all_full_reads: { write_tokens: writeTok, cache_read_amplified_tokens: Math.round(amplifiedTok),
    pct_of_cache_write: +(writeTok/mainCw*100).toFixed(2),
    pct_of_cache_read: +(amplifiedTok*10/mainCr*100).toFixed(2) },
  over_350: { n: nBig, write_tokens: bigWrite, cache_read_amplified_tokens: Math.round(bigAmp),
    pct_of_cache_write: +(bigWrite/mainCw*100).toFixed(2),
    pct_of_cache_read_raw: +(bigAmp*10/mainCr*100).toFixed(2) },
  weighted_price_share_over_350: +(((bigWrite + bigAmp) / (mainCw + mainCr*0.1))*100).toFixed(2),
  weighted_price_share_all_full: +(((writeTok + amplifiedTok) / (mainCw + mainCr*0.1))*100).toFixed(2),
  top10: biggest.slice(0,10),
},null,2));
