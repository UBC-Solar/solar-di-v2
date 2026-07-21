// ─── DATETIME PICKER ─────────────────────────────────────────────────────────
const dtState = {};
const DT_SEGS = [
  { key:'y',  w:42, min:2020, max:2099, pad:4 }, { sep:'-' },
  { key:'mo', w:24, min:1,    max:12,   pad:2 }, { sep:'-' },
  { key:'d',  w:24, min:1,    max:31,   pad:2 }, { sep:' ', cls:'dt-sep-space' },
  { key:'h',  w:24, min:0,    max:23,   pad:2 }, { sep:':' },
  { key:'mi', w:24, min:0,    max:59,   pad:2 }, { sep:':' },
  { key:'s',  w:24, min:0,    max:59,   pad:2 },
];

function dtInit(id, onChange) {
  const wrap = document.getElementById(id); if (!wrap) return;
  wrap.innerHTML = '';
  const now = new Date();
  dtState[id] = { y:now.getFullYear(), mo:now.getMonth()+1, d:now.getDate(), h:now.getHours(), mi:now.getMinutes(), s:now.getSeconds(), onChange: onChange||null };
  DT_SEGS.forEach(def => {
    if (def.sep !== undefined) { const sp = document.createElement('span'); sp.className = def.cls||'dt-sep'; sp.textContent = def.sep; wrap.appendChild(sp); return; }
    const inp = document.createElement('input');
    inp.type='number'; inp.className='dt-seg'; inp.style.width=def.w+'px';
    inp.dataset.key=def.key; inp.dataset.min=def.min; inp.dataset.max=def.max; inp.dataset.pad=def.pad;
    inp.value = String(dtState[id][def.key]).padStart(def.pad,'0');
    inp.addEventListener('wheel', e => { e.preventDefault(); dtStep(id, inp, e.deltaY<0?1:-1); }, {passive:false});
    let dragY=null;
    inp.addEventListener('mousedown', e => { dragY=e.clientY; inp.focus(); e.preventDefault(); });
    inp.addEventListener('mousemove', e => { if(dragY===null) return; const delta=Math.round((dragY-e.clientY)/5); if(delta!==0){dtStep(id,inp,delta);dragY=e.clientY;} });
    inp.addEventListener('mouseup', ()=>{dragY=null;}); inp.addEventListener('mouseleave', ()=>{dragY=null;});
    inp.addEventListener('keydown', e=>{if(e.key==='ArrowUp'){e.preventDefault();dtStep(id,inp,1);}if(e.key==='ArrowDown'){e.preventDefault();dtStep(id,inp,-1);}});
    inp.addEventListener('change', ()=>{ const v=parseInt(inp.value); if(!isNaN(v)){dtState[id][def.key]=Math.max(def.min,Math.min(def.max,v));dtRefresh(id);dtState[id].onChange&&dtState[id].onChange();}});
    wrap.appendChild(inp);
  });
}

function dtStep(id, inp, delta) {
  const st=dtState[id]; if(!st) return;
  const key=inp.dataset.key, min=parseInt(inp.dataset.min), max=parseInt(inp.dataset.max), span=max-min+1;
  let v=st[key]+delta; v=min+((v-min)%span+span)%span;
  st[key]=v; inp.value=String(v).padStart(parseInt(inp.dataset.pad),'0');
  st.onChange&&st.onChange();
}

function dtRefresh(id) {
  const wrap=document.getElementById(id); if(!wrap||!dtState[id]) return;
  wrap.querySelectorAll('.dt-seg').forEach(inp=>{ inp.value=String(dtState[id][inp.dataset.key]).padStart(parseInt(inp.dataset.pad),'0'); });
}

function dtSet(id, ms) {
  if(!document.getElementById(id)) return;
  if(!dtState[id]) dtInit(id,null);
  const d=new Date(ms);
  Object.assign(dtState[id],{y:d.getFullYear(),mo:d.getMonth()+1,d:d.getDate(),h:d.getHours(),mi:d.getMinutes(),s:d.getSeconds()});
  dtRefresh(id);
}

function dtGet(id) {
  const st=dtState[id]; if(!st) return null;
  return new Date(st.y,st.mo-1,st.d,st.h,st.mi,st.s,0).getTime();
}

