// W0 probe 3 — addressable set. Of oversized full reads, how many does the gate
// actually get to refuse once both ladder exceptions are honoured?
const fs=require('fs'),path=require('path');
const ROOT='C:/Users/joshu/.claude/projects';
const files=[]; (function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
  if(e.isDirectory())w(p);else if(e.name.endsWith('.jsonl'))files.push(p);}})(ROOT);

const THRESH=[200,350,500];
const out={};
for(const T of THRESH) out[T]={total:0,edited_later:0,gate_output:0,plan_doc:0,addressable:0,samples:[],in_task_session:0};

// paths whose bytes a gate parses (ladder exception 2) — build/test/lint output
const GATE_OUT=/(\.log$|test-results|coverage|junit|\.tap$|npm-debug)/i;
const PLANDOC=/(plan|spec|README|CHANGELOG|knowledge|RESUME|handover|notes?)/i;

for(const f of files){
  let lines; try{lines=fs.readFileSync(f,'utf8').split('\n')}catch{continue}
  const recs=[]; for(const l of lines){if(!l.trim())continue;try{recs.push(JSON.parse(l))}catch{}}
  const use=new Map(); let hasTask=false;
  recs.forEach(o=>{const m=o.message;if(m&&Array.isArray(m.content))for(const c of m.content){
    if(c.type==='tool_use'){use.set(c.id,{name:c.name,input:c.input||{},side:!!o.isSidechain});
      if((c.name==='Task'||c.name==='Agent')&&!o.isSidechain)hasTask=true;}}});
  // every path written/edited in this transcript, with its record index
  const edits=[];
  recs.forEach((o,i)=>{const m=o.message;if(m&&Array.isArray(m.content))for(const c of m.content){
    if(c.type==='tool_use'&&(c.name==='Edit'||c.name==='Write'||c.name==='NotebookEdit')&&c.input&&c.input.file_path)
      edits.push({i,p:String(c.input.file_path)});}});

  for(let i=0;i<recs.length;i++){
    const o=recs[i],m=o.message; if(!m||!Array.isArray(m.content))continue;
    for(const c of m.content){
      if(c.type!=='tool_result')continue;
      const u=use.get(c.tool_use_id); if(!u||u.name!=='Read'||u.side)continue;
      if(u.input.offset!=null||u.input.limit!=null)continue;
      const txt=typeof c.content==='string'?c.content:Array.isArray(c.content)?c.content.map(x=>x&&x.text||'').join(''):'';
      if(c.is_error||/^Error: /.test(txt))continue;
      if(Array.isArray(c.content)&&c.content.some(x=>x.type==='image'))continue;
      const nl=txt?txt.split('\n').length:0;
      const p=String(u.input.file_path||'');
      for(const T of THRESH){
        if(nl<T)continue;
        const R=out[T]; R.total++;
        if(hasTask)R.in_task_session++;
        const wasEdited=edits.some(e=>e.p===p);
        const isGateOut=GATE_OUT.test(p);
        const isPlan=PLANDOC.test(path.basename(p));
        if(wasEdited)R.edited_later++;
        if(isGateOut)R.gate_output++;
        if(isPlan)R.plan_doc++;
        if(!wasEdited&&!isGateOut){R.addressable++; if(R.samples.length<12)R.samples.push({lines:nl,f:path.basename(p),plan:isPlan});}
      }
    }
  }
}
console.log(JSON.stringify(out,null,2));
