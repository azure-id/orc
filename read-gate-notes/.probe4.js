// W2 — derive the threshold from measured break-even.
const fs=require('fs'),path=require('path');
const ROOT='C:/Users/joshu/.claude/projects';
const files=[];(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory())w(p);else if(e.name.endsWith('.jsonl'))files.push(p);}})(ROOT);
let chars=0,lines=0,n=0; const per=[];
for(const f of files){let L;try{L=fs.readFileSync(f,'utf8').split('\n')}catch{continue}
 const recs=[];for(const l of L){if(!l.trim())continue;try{recs.push(JSON.parse(l))}catch{}}
 const use=new Map();
 recs.forEach(o=>{const m=o.message;if(m&&Array.isArray(m.content))for(const c of m.content)
   if(c.type==='tool_use')use.set(c.id,{name:c.name,input:c.input||{},side:!!o.isSidechain});});
 recs.forEach(o=>{const m=o.message;if(!m||!Array.isArray(m.content))return;
  for(const c of m.content){if(c.type!=='tool_result')continue;
   const u=use.get(c.tool_use_id);if(!u||u.name!=='Read'||u.side)continue;
   if(u.input.offset!=null||u.input.limit!=null)continue;
   const t=typeof c.content==='string'?c.content:Array.isArray(c.content)?c.content.map(x=>x&&x.text||'').join(''):'';
   if(c.is_error||/^Error: /.test(t))return;
   if(Array.isArray(c.content)&&c.content.some(x=>x.type==='image'))return;
   const ln=t?t.split('\n').length:0; if(!ln)return;
   chars+=t.length;lines+=ln;n++;per.push(t.length/ln);}});
}
per.sort((a,b)=>a-b);
const avg=chars/lines, med=per[Math.floor(per.length/2)];
const FLOOR_TOK=13276;               // measured W1 dispatch floor, n=1
const floorChars=FLOOR_TOK*4;
console.log(JSON.stringify({
 full_reads:n, total_chars:chars, total_lines:lines,
 avg_chars_per_line:+avg.toFixed(1), median_file_chars_per_line:+med.toFixed(1),
 dispatch_floor_tokens:FLOOR_TOK, dispatch_floor_chars:floorChars,
 breakeven_lines_at_avg:Math.round(floorChars/avg),
 breakeven_lines_at_median:Math.round(floorChars/med),
},null,2));
