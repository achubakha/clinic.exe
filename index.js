/* CATALOGUE INTEGRATION:
   Replace the sample entries with the catalogue team's data.
   image should be a local asset path or an image URL supplied by the catalogue.
   productUrl should be the real Valuemed product page URL.
*/

const money=n=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(n);
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const placeholderImage='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="100%" height="100%" fill="#f7f7f7"/><path d="M55 70h50M80 45v50" stroke="#bbbbbb" stroke-width="4" stroke-linecap="round"/><text x="80" y="108" text-anchor="middle" font-family="Arial" font-size="10" fill="#666666">Product image</text></svg>');
let stage="clinic",clinicType="Clinic",selected=new Set(),messages=[
  {who:"bot",text:"Welcome to Clinic.exe.\n\nTell me about your clinic. What type of clinic are you opening?"}
],userContact=null,undoStack=[],redoStack=[];

function activeItems(){return catalogue.filter(p=>selected.has(p.id))}
function subtotal(){return activeItems().reduce((sum,p)=>sum+p.qty*p.price,0)}
function snapshot(){return catalogue.map(p=>({id:p.id,qty:p.qty,selected:selected.has(p.id)}))}
function pushHistory(){undoStack.push(snapshot());if(undoStack.length>40)undoStack.shift();redoStack=[]}
function applySnapshot(s){s.forEach(x=>{const p=catalogue.find(p=>p.id===x.id);if(p)p.qty=x.qty;if(x.selected)selected.add(x.id);else selected.delete(x.id)})}
function undo(){if(!undoStack.length)return false;redoStack.push(snapshot());const s=undoStack.pop();toast(describe(transition(()=>applySnapshot(s)),"Undone"),"Redo",redo);return true}
function redo(){if(!redoStack.length)return false;undoStack.push(snapshot());const s=redoStack.pop();toast(describe(transition(()=>applySnapshot(s)),"Redone"),"Undo",undo);return true}
const reduceMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
function addMessage(who,text){messages.push({who,text,animate:who==="bot"&&!reduceMotion,fresh:true})}

/* List changes: apply() mutates state; items leaving slide out first, then the list
   re-renders with items that came back sliding in. Returns which ids were added/removed. */
let enterIds=new Set();
function transition(apply){
 const before=new Set(selected);apply();
 const removed=[...before].filter(id=>!selected.has(id)),added=[...selected].filter(id=>!before.has(id));
 slideOut(removed).then(()=>{enterIds=new Set(added);renderCurrent();enterIds=new Set()});
 return {added,removed};
}
function slideOut(ids){
 const els=ids.map(id=>document.querySelector(`.item[data-product="${id}"]`)).filter(Boolean);
 if(reduceMotion||!els.length)return Promise.resolve();
 return Promise.all(els.map(el=>{
  const h=el.offsetHeight+"px";el.style.overflow="hidden";
  return el.animate([
   {opacity:1,transform:"none",height:h},
   {opacity:0,transform:"translateX(-40px)",height:h,offset:.55},
   {opacity:0,transform:"translateX(-40px)",height:"0px",paddingTop:"0px",paddingBottom:"0px",borderWidth:"0px",marginBottom:"-9px"}
  ],{duration:360,easing:"ease-in-out",fill:"forwards"}).finished.catch(()=>{});
 }));
}
const shortName=id=>{const p=catalogue.find(x=>x.id===id);return p?(p.short||p.name):"item"};
function describe({added,removed},label){
 const n=ids=>ids.length===1?shortName(ids[0]):`${ids.length} items`;
 if(added.length&&!removed.length)return `${label}: ${n(added)} ${added.length===1?"is":"are"} back on your list.`;
 if(removed.length&&!added.length)return `${label}: ${n(removed)} removed from your list.`;
 return `${label}: your last change.`;
}
const toastEl=document.createElement("div");toastEl.className="toast";toastEl.setAttribute("role","status");toastEl.setAttribute("aria-live","polite");document.body.appendChild(toastEl);
let toastTimer;
function toast(text,actionLabel,action){
 toastEl.innerHTML=`<span>${escapeHTML(text)}</span>${actionLabel?`<button type="button">${escapeHTML(actionLabel)}</button>`:""}`;
 if(actionLabel)toastEl.querySelector("button").onclick=()=>{toastEl.classList.remove("show");action()};
 toastEl.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove("show"),5000);
}
const BIN='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
/* Quantity box: click the number and type (e.g. 100). Enter or clicking away applies it,
   Esc puts the old number back, 0 removes the item. One delegated handler on #mainArea covers
   the equipment list and the 3D popup panel, which are both re-rendered often. */
const MAX_QTY=999;
const qtyInput=(p,q)=>`<input class="qty-input" type="number" inputmode="numeric" min="0" max="${MAX_QTY}" step="1" value="${q}" data-qty="${p.id}" aria-label="Quantity of ${escapeHTML(p.short||p.name)}">`;
function setQty(p,raw){
 const v=Number(raw);
 if(String(raw).trim()===""||!Number.isInteger(v)||v<0){renderCurrent();return}  // not a whole number: show the old one again
 if(v===0){if(selected.has(p.id)){pushHistory();transition(()=>selected.delete(p.id));toast(`Removed ${p.short||p.name} from your list.`,"Undo",undo)}return}
 const q=Math.min(MAX_QTY,v);
 if(q!==p.qty){pushHistory();p.qty=q}
 renderCurrent();
 if(v>MAX_QTY)toast(`Quantities go up to ${MAX_QTY}. For more, add a note to your quote request.`);
}
for(const area of [$("mainArea"),$("listModal")]){  // the planner and the equipment full-view popup
area.addEventListener("focusin",e=>{if(e.target.matches("input[data-qty]"))e.target.select()});
area.addEventListener("keydown",e=>{
 const inp=e.target.closest("input[data-qty]");if(!inp)return;
 e.stopPropagation();  // keep Esc from closing the popup
 if(e.key==="Enter")inp.blur();
 else if(e.key==="Escape"){inp.value=inp.defaultValue;inp.blur()}
});
area.addEventListener("change",e=>{
 const inp=e.target.closest("input[data-qty]");if(!inp)return;
 const p=catalogue.find(x=>String(x.id)===inp.dataset.qty);if(p)setQty(p,inp.value);
});
}
const qtyControls=p=>{const one=p.qty<=1;return `<div class="qty"><button class="${one?"bin":""}" data-action="${one?"remove":"minus"}" data-id="${p.id}" aria-label="${one?"Remove item":"Decrease quantity"}" title="${one?"Remove":"Decrease"}">${one?BIN:"−"}</button>${qtyInput(p,p.qty)}<button data-action="plus" data-id="${p.id}" aria-label="Increase quantity" title="Increase">+</button></div>`};
function itemMarkup(p,delay){
 const one=p.qty<=1,enter=delay!==null;
 return `<article class="item${enter?" enter":""}"${enter?` style="--d:${delay}ms"`:""} data-product="${p.id}" tabindex="0" role="button" aria-label="View ${escapeHTML(p.name)} details">
  <button class="item-x" data-action="remove" data-id="${p.id}" aria-label="Remove ${escapeHTML(p.short||p.name)}" title="Remove">×</button>
  ${imageTag(p,"thumb")}
  <div class="item-main"><div class="item-name">${escapeHTML(p.name)}</div><div class="item-meta">${money(p.price)} each</div>
   <div class="item-bottom">${qtyControls(p)}<span class="line-price">${money(p.qty*p.price)}</span></div>
  </div></article>`;
}
// Equipment checklist zones, in the order lists are shown (each catalogue product has one).
const CATEGORIES=["Clinical Examination","Medical Devices & Utilities","Consumables & PPE","IT & Administrative"];
const byCategory=(items,all=false)=>[...CATEGORIES,"Other"].map(c=>[c,items.filter(p=>(CATEGORIES.includes(p.category)?p.category:"Other")===c)]).filter(([c,l])=>l.length||(all&&c!=="Other"));
const groupTotal=l=>l.reduce((t,p)=>t+p.qty*p.price,0);
const catHead=(c,l)=>`<div class="cat-head"><span>${escapeHTML(c)}</span><span>${l.length} ${l.length===1?"item":"items"} · ${money(groupTotal(l))}</span></div>`;
function itemsMarkup(){
 let k=0;  // stagger items sliding in, capped so big lists don't take ages
 return byCategory(activeItems()).map(([c,l])=>catHead(c,l)+l.map(p=>itemMarkup(p,enterIds.has(p.id)?Math.min(k++,12)*45:null)).join("")).join("");
}
function setSteps(){
  const steps=["1. Plan clinic","2. Review equipment","3. Contact details","4. Sales handoff"];
  const idx=stage==="clinic"?0:stage==="contact"?2:stage==="handoff"?3:1;
  reached=Math.max(reached,idx);
  const open=i=>i===0||(i<=reached&&activeItems().length&&(i<3||userContact));  // handoff needs the contact form
  $("steps").innerHTML=steps.map((s,i)=>`<button type="button" class="step ${i===idx?"active":i<idx?"done":""}" data-step="${i}"${i===idx?' aria-current="step"':""}${open(i)?"":" disabled"}>${s}</button>`).join("");
}
let reached=0;  // furthest step visited
let revealed=false;  // at startup only the assistant shows; the list and 3D panels appear once the list has something in it
function revealPanels(ws,from){  // the chat glides to the middle while the list and the 3D room slide in from the sides
  if(reduceMotion)return;
  const chat=ws.querySelector(".chat-panel"),to=chat.getBoundingClientRect(),ease="cubic-bezier(.2,.8,.2,1)";
  chat.animate([{transform:`translate(${from.left-to.left}px,${from.top-to.top}px)`},{transform:"none"}],{duration:650,easing:ease});
  [[".list-panel",-70,150],[".visual-panel",70,300]].forEach(([sel,dx,delay])=>ws.querySelector(sel).animate(
    [{opacity:0,transform:`translateX(${dx}px) scale(.94)`,filter:"blur(4px)"},{opacity:1,transform:"none",filter:"none"}],
    {duration:700,delay,easing:ease,fill:"backwards"}));
}
function pageIn(){  // panels of a newly shown page rise in one after another
  if(!reduceMotion)[...$("mainArea").firstElementChild.children].forEach((el,i)=>el.animate([{opacity:0,transform:"translateY(14px)"},{opacity:1,transform:"none"}],{duration:420,delay:i*80,easing:"cubic-bezier(.2,.8,.2,1)",fill:"backwards"}));
}
let lastTotal=null;
function totalBump(){const t=subtotal(),b=lastTotal!==null&&t!==lastTotal;lastTotal=t;return b?' class="bump"':""}  // subtotal pulses when it changes
function goStep(i){
  if(i<2){stage=i?"review":"clinic";renderChat()}
  else if(i===2)goContact();
  else{stage="handoff";renderHandoff()}
}
$("steps").onclick=e=>{const b=e.target.closest("[data-step]");if(b&&!b.disabled)goStep(+b.dataset.step)};
function imageTag(p,cls=""){return `<img class="${cls}" src="${escapeHTML(p.image||"")}" alt="${escapeHTML(p.name)}" onerror="this.onerror=null;this.src='${placeholderImage}'">`}
function listMarkup(){
  return `<section class="panel list-panel">
    <div class="panel-head"><div><div class="panel-title">Your equipment list</div><div class="panel-sub">Click an item to view details</div></div><span class="count">${activeItems().length} ITEMS</span></div>
    <div class="list-toolbar" style="padding:10px 12px 0"><button class="icon-btn" id="undoBtn" title="Undo" ${undoStack.length?"":"disabled"}>Undo</button><button class="icon-btn" id="redoBtn" title="Redo" ${redoStack.length?"":"disabled"}>Redo</button><button class="icon-btn full-btn" id="listFullBtn" type="button" aria-label="Open the equipment list in full view" ${activeItems().length?"":"disabled"}>⤢ Full view</button></div>
    <div class="items">${activeItems().length?itemsMarkup():`<div class="empty">Your equipment list is empty.<br>Describe your clinic to get started.</div>`}</div>
    <div class="list-footer"><div class="total-row"><span>Indicative subtotal</span><strong${totalBump()}>${money(subtotal())}</strong></div><div class="footer-note">CAD · Before tax, shipping and installation</div><button class="primary" id="finalizeList" style="width:100%;margin-top:12px" ${activeItems().length ? "" : "disabled"}>Finalize list</button></div>
  </section>`;
}
function visualMarkup(){
 return `<aside class="panel visual-panel"><div class="panel-head"><div><div class="panel-title">Clinic workspace</div><div class="panel-sub">3D room · drag to look around</div></div><span class="count">LIVE 3D</span></div><div class="panel-body">
 <div class="viz-slot"><div class="viz-shell" id="vizShell" aria-label="3D clinic planner">
  <div class="viz-bar"><div><strong>3D clinic planner</strong><span>Add equipment on the left, then arrange it in the room · changes update your equipment list</span></div><button class="viz-close" id="vizClose" type="button" aria-label="Close the 3D planner">✕</button></div>
  <div class="viz-body"><aside class="viz-side" id="vizSide" aria-label="Room equipment">${vizSideMarkup()}</aside><div class="viz-stage"><iframe id="vizFrame" src="3d.html" title="3D clinic room planner"></iframe><nav class="viz-rooms" id="vizRooms" aria-label="Rooms"></nav></div></div>
  <button class="viz-btn" id="vizToggle" type="button" aria-label="Open the full 3D planner">⤢ Full view</button>
 </div></div>
 <div id="vizInfo">${vizInfoMarkup()}</div>
 </div></aside>`;
}
// Popup left panel. Adding here adds to the equipment list (the list then syncs to the 3D room).
function vizSideMarkup(){
 const room=catalogue.filter(p=>p.model3d),inList=room.filter(p=>selected.has(p.id)),rest=room.filter(p=>!selected.has(p.id));
 const card=p=>{const q=selected.has(p.id)?p.qty:0;return `<div class="viz-card${q?" on":""}">${imageTag(p,"viz-thumb")}<div class="viz-info"><a class="viz-name" href="${escapeHTML(p.link||"#")}" target="_blank" rel="noopener" title="${escapeHTML(p.name)}">${escapeHTML(p.short||p.name)}</a><div class="viz-price">${money(p.price)}${q>1?` <span>× ${q} = ${money(p.price*q)}</span>`:""}</div>
  ${q?`<div class="qty"><button class="${q===1?"bin":""}" data-viz="minus" data-id="${p.id}" aria-label="${q===1?"Remove":"Decrease"} ${escapeHTML(p.short||p.name)}">${q===1?BIN:"−"}</button>${qtyInput(p,q)}<button data-viz="plus" data-id="${p.id}" aria-label="Increase ${escapeHTML(p.short||p.name)}">+</button></div>`:`<button class="viz-add" data-viz="add" data-id="${p.id}">+ Add to list</button>`}</div></div>`};
 const total=inList.reduce((t,p)=>t+p.price*p.qty,0);
 return `<div class="viz-side-head"><strong>Room equipment</strong><span>Real Valuemed products that appear in the 3D room</span></div>
 <div class="viz-side-list">${inList.length?`<div class="viz-group">In your list</div>${inList.map(card).join("")}`:""}${rest.length?`<div class="viz-group">Add to your rooms</div>${rest.map(card).join("")}`:""}</div>
 <div class="viz-side-foot"><span>Room equipment in your list</span><strong>${money(total)}</strong></div>`;
}
function vizSideClick(e){
 const b=e.target.closest("[data-viz]");if(!b)return;
 const p=catalogue.find(x=>String(x.id)===b.dataset.id);if(!p)return;
 const name=p.short||p.name;pushHistory();
 if(b.dataset.viz==="add"){p.qty=1;transition(()=>selected.add(p.id));toast(`Added ${name} to your equipment list.`,"Undo",undo);return}
 if(b.dataset.viz==="minus"&&p.qty<=1){transition(()=>selected.delete(p.id));toast(`Removed ${name} from your equipment list.`,"Undo",undo);return}
 p.qty=Math.max(1,p.qty+(b.dataset.viz==="plus"?1:-1));renderCurrent();
}
function vizInfoMarkup(){  // checklist coverage per zone, then what we know about the clinic
 const items=activeItems();
 return `<div class="visual-note"><strong>Equipment checklist</strong><div class="cat-list">${CATEGORIES.map(c=>{const l=items.filter(p=>p.category===c);
   return `<div class="cat-row${l.length?"":" none"}"><span>${c}</span><span>${l.length?`${l.length} · ${money(groupTotal(l))}`:"None yet"}</span></div>`}).join("")}</div></div>
 <div class="visual-note"><strong>Clinic plan</strong><div class="plan-chips">${profileLines().map(([k,v])=>`<span>${k} <b>${v==="Not asked yet"?"—":escapeHTML(v)}</b></span>`).join("")}</div></div>`;
}

/* 3D room (3d.html) in one iframe. Small: only the 3D view. Full view: the same iframe fills the
   screen with the whole planner, so nothing reloads and the layout is kept. 3d.html saves its
   building in localStorage, so a fresh iframe (e.g. on the contact page) shows the same room. */
const VIZ_COMPACT_CSS=`
body.compact header,body.compact .building-bar,body.compact .left-panel,body.compact .right-panel,
body.compact .scene-heading,body.compact .canvas-toolbar,body.compact .view-options,body.compact .stage-instructions{display:none!important}
body.compact{overflow:hidden!important;background:transparent!important}
body.compact .toast,body.compact .building-toast{display:none!important}
body.compact .workspace{display:block!important;height:100vh!important;min-height:0!important;padding:0!important;margin:0!important}
body.compact .scene-panel{height:100vh!important;min-height:0!important;padding:0!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}
body.compact .canvas-stage{height:100vh!important;min-height:0!important;margin:0!important;border-radius:0!important}
body.popup .left-panel{display:none!important}
body.popup header{display:none!important}
body.popup .workspace{grid-template-columns:minmax(0,1fr) 270px!important;height:calc(100dvh - 138px)!important}`;
const vizBackdrop=document.createElement("div");vizBackdrop.className="viz-backdrop";document.body.appendChild(vizBackdrop);
vizBackdrop.onclick=()=>setVizFull(false);
function setCompact(on){try{const c=$("vizFrame").contentDocument.body.classList;c.toggle("compact",on);c.toggle("popup",!on)}catch(e){}}
function setupViz(){
 const f=$("vizFrame");if(!f)return;
 vizBackdrop.classList.remove("show");document.body.classList.remove("viz-open");  // a fresh panel is never open
 f.addEventListener("load",()=>{
  try{  // same origin (served by app.py), so we can style and drive the planner from here
   const d=f.contentDocument,st=d.createElement("style");st.textContent=VIZ_COMPACT_CSS;d.head.appendChild(st);
   setCompact(!$("vizShell")?.classList.contains("full"));
   d.addEventListener("keydown",e=>{if(e.key==="Escape"&&!d.querySelector("dialog[open]"))setVizFull(false)});  // Esc while the 3D has focus
  }catch(e){/* opened as a file:// page: the planner shows un-compacted */}
  vizSynced=null;vizRoomsSynced=null;syncViz();
  try{f.contentWindow.addEventListener("clinic:building-changed",renderVizRooms)}catch(e){}  // also when rooms change inside the planner
  renderVizRooms();
 });
 $("vizToggle").onclick=()=>setVizFull(true);
 $("vizClose").onclick=()=>setVizFull(false);
 $("vizSide").onclick=vizSideClick;
 $("vizRooms").onclick=vizRoomClick;
}
// Room switcher (popup only): "Room 1 of 3" with previous / next and a tab per room, across all floors.
function vizRoomList(st){return st.floors.flatMap(f=>f.rooms.map(r=>({floorId:f.floorId,roomId:r.roomId,name:r.name,floor:f.name||""})))}
function renderVizRooms(){
 const el=$("vizRooms"),api=$("vizFrame")?.contentWindow?.ClinicBuilding;if(!el||!api)return;
 let st;try{st=api.getState()}catch(e){return}
 const rooms=vizRoomList(st),i=Math.max(0,rooms.findIndex(r=>r.floorId===st.active.floorId&&r.roomId===st.active.roomId)),cur=rooms[i];
 el.innerHTML=`<button class="viz-room-nav" type="button" data-room="${i-1}" ${i?"":"disabled"} aria-label="Previous room">‹</button>
  <div class="viz-room-now"><strong>Room ${i+1} of ${rooms.length}</strong><span>${escapeHTML(cur.name)}${cur.floor?` · ${escapeHTML(cur.floor)}`:""}</span></div>
  <button class="viz-room-nav" type="button" data-room="${i+1}" ${i<rooms.length-1?"":"disabled"} aria-label="Next room">›</button>
  <div class="viz-room-tabs">${rooms.map((r,k)=>`<button class="viz-room-tab${k===i?" on":""}" type="button" data-room="${k}" title="${escapeHTML(r.floor)}"${k===i?' aria-current="true"':""}>${escapeHTML(r.name)}</button>`).join("")}</div>`;
 el.querySelector(".viz-room-tab.on")?.scrollIntoView({block:"nearest",inline:"nearest"});
}
function vizRoomClick(e){
 const b=e.target.closest("[data-room]"),api=$("vizFrame")?.contentWindow?.ClinicBuilding;if(!b||b.disabled||!api)return;
 const r=vizRoomList(api.getState())[+b.dataset.room];if(!r)return;
 try{api.selectRoom({floorId:r.floorId,roomId:r.roomId})}catch(err){toast(err.message);return}
 if(!reduceMotion)$("vizFrame").animate([{opacity:.35},{opacity:1}],{duration:280,easing:"ease-out"});
 renderVizRooms();
}
// Full view: the same iframe pops up over the dimmed site (nothing reloads, the layout is kept).
let vizCloseTimer;
function setVizFull(full){
 const shell=$("vizShell");if(!shell)return;
 const closing=shell.classList.contains("closing");
 if(full===shell.classList.contains("full")&&!closing)return;
 clearTimeout(vizCloseTimer);shell.classList.remove("closing");
 vizBackdrop.classList.toggle("show",full);document.body.classList.toggle("viz-open",full);
 if(full){
  shell.classList.add("full");shell.setAttribute("role","dialog");shell.setAttribute("aria-modal","true");
  setCompact(false);$("vizClose").focus();
  return;
 }
 const done=()=>{shell.classList.remove("full","closing");shell.removeAttribute("role");shell.removeAttribute("aria-modal");setCompact(true)};
 if(reduceMotion)return done();
 shell.classList.add("closing");vizCloseTimer=setTimeout(done,220);  // let the close animation play
}

/* Equipment list -> 3D building. The building mirrors the list: each planner model's "selected to buy"
   = the list quantity of products with that model3d (0 if none). Small supplies have no model3d, so they never appear in 3D.
   Rooms: when the chat knows how many rooms the clinic has, the building gets exactly that many exam rooms.
   Units are spread across the rooms: a new unit goes to the room with the fewest of that product (the room open
   in the planner wins ties), and units are taken away from the room with the most. So "1 stool per room" lands
   one in each room, and shared items (e.g. a crash cart) go to the room you're looking at.
   Positions you drag in the planner are kept; adding or removing equipment happens in the list. */
let vizSynced=null,vizRoomsSynced=null,vizPending=[];
const MODEL_TO_PRODUCT=Object.fromEntries(catalogue.filter(p=>p.model3d).map(p=>[p.model3d,String(p.id)]));
const modelOf=id=>catalogue.find(p=>String(p.id)===String(id))?.model3d;
// What the AI sees: the rooms in order, with the room equipment placed in each (catalogue id -> quantity).
function vizRoomsForAI(){
 const api=$("vizFrame")?.contentWindow?.ClinicBuilding;if(!api)return [];
 try{return vizRoomList(api.getState()).map((r,i,all)=>{const room=api.getState().floors.find(f=>f.floorId===r.floorId).rooms.find(x=>x.roomId===r.roomId);
  return {name:r.name,floor:r.floor,items:Object.fromEntries(room.plan.selectedItems.filter(x=>MODEL_TO_PRODUCT[x.productId]).map(x=>[MODEL_TO_PRODUCT[x.productId],x.quantity]))}})}catch(e){return []}
}
/* AI room placements. "spread": split each item evenly over all rooms (the first rooms get any extra).
   "place": set how many of an item are in one room; units come from ones not placed yet, then from the
   room with the most (never from a room set earlier in the same reply). Planner limits still apply (8 of one item, 24 items per room). */
function applyPlacements(api,ops,want){
 const st=api.getState();
 const rooms=st.floors.flatMap(f=>f.rooms.map(r=>{const items=Object.fromEntries(r.plan.selectedItems.map(i=>[i.productId,i.quantity]));return {floorId:f.floorId,roomId:r.roomId,items,was:{...items}}}));
 const has=(r,id)=>r.items[id]||0,used=r=>Object.values(r.items).reduce((t,q)=>t+q,0);
 const free=id=>(want[id]||0)-rooms.reduce((t,r)=>t+has(r,id),0);
 const pinned=new Set();  // rooms the AI set explicitly in this reply: later placements don't take from them
 const take=(id,to)=>{if(free(id)>0)return true;const r=rooms.filter(x=>x!==to&&has(x,id)>0&&!pinned.has(x.roomId+'|'+id)).reduce((m,x)=>!m||has(x,id)>has(m,id)?x:m,null);if(!r)return false;r.items[id]--;return true};
 for(const op of ops){
  if(op.op==="spread"){
   for(const id of op.id?[modelOf(op.id)]:Object.keys(want).filter(id=>want[id]>0)){
    if(!id)continue;const n=want[id]||0;rooms.forEach(r=>r.items[id]=0);
    rooms.forEach((r,k)=>{r.items[id]=Math.max(0,Math.min(8,Math.floor(n/rooms.length)+(k<n%rooms.length?1:0),24-used(r)))});
   }
  }else if(op.op==="place"){
   const id=modelOf(op.id),r=rooms[op.room-1];if(!id||!r)continue;
   while(has(r,id)>op.qty)r.items[id]--;
   while(has(r,id)<op.qty&&used(r)<24&&take(id,r))r.items[id]=has(r,id)+1;
   pinned.add(r.roomId+'|'+id);
  }
 }
 // Placed may never exceed "selected to buy": first apply only the decreases, then the final counts.
 const list=o=>Object.entries(o).filter(([,q])=>q>0).map(([productId,quantity])=>({productId,quantity})).sort((a,b)=>a.productId<b.productId?-1:1);
 const key=o=>JSON.stringify(list(o));
 for(const r of rooms){const low=Object.fromEntries(Object.keys(r.was).map(id=>[id,Math.min(r.was[id],has(r,id))]));if(key(low)!==key(r.was))api.updateRoomEquipment({floorId:r.floorId,roomId:r.roomId,items:list(low)});}
 for(const r of rooms)if(key(r.items)!==key(r.was))api.updateRoomEquipment({floorId:r.floorId,roomId:r.roomId,items:list(r.items)});
}
const FLOOR_NAMES=["Ground","Second","Third","Fourth","Fifth","Sixth","Seventh","Eighth"];
function syncVizRooms(api){
 const want=Math.min(24,Math.max(0,Math.floor(profile.rooms||0)));  // planner limit: 24 rooms, 12 per floor
 if(!want||want===vizRoomsSynced)return;
 const data=api.getState();
 if(vizRoomList(data).length!==want){
  const empty={...JSON.parse(JSON.stringify(data.floors[0].rooms[0].plan)),selectedItems:[],layout:[]};
  let extra=vizRoomList(data).length-want;  // too many: remove rooms from the end (last floor first)
  for(let f=data.floors.length-1;f>=0&&extra>0;f--)while(data.floors[f].rooms.length&&extra>0){data.floors[f].rooms.pop();extra--;}
  data.floors=data.floors.filter(f=>f.rooms.length);
  const roomIds=new Set(data.floors.flatMap(f=>f.rooms.map(r=>r.roomId))),floorIds=new Set(data.floors.map(f=>f.floorId));
  let count=vizRoomList(data).length;
  for(let fi=0;count<want;fi++){  // too few: fill the ground floor, then the next floors
   if(!data.floors[fi]){let n=fi+1;while(floorIds.has("floor-"+n))n++;floorIds.add("floor-"+n);data.floors.push({...data.floors[0],floorId:"floor-"+n,name:(FLOOR_NAMES[fi]||"Floor "+(fi+1))+" floor",rooms:[]});}
   const floor=data.floors[fi];
   while(floor.rooms.length<12&&count<want){let n=(fi+1)*100+floor.rooms.length+1;while(roomIds.has("room-"+n))n++;roomIds.add("room-"+n);floor.rooms.push({roomId:"room-"+n,name:"Exam Room "+n,plan:JSON.parse(JSON.stringify(empty))});count++;}
  }
  if(!vizRoomList(data).some(r=>r.floorId===data.active.floorId&&r.roomId===data.active.roomId))data.active={floorId:data.floors[0].floorId,roomId:data.floors[0].rooms[0].roomId};
  api.importBuilding(data);
 }
 vizRoomsSynced=want;
}
function syncViz(){
 const api=$("vizFrame")?.contentWindow?.ClinicBuilding;if(!api)return;  // not loaded yet: the load handler syncs
 let known;try{known=new Set(api.getCatalogue().map(m=>m.id))}catch(e){return}
 const want=Object.fromEntries([...known].map(m=>[m,0]));
 activeItems().forEach(p=>{if(p.model3d in want)want[p.model3d]+=p.qty});
 // Planner limits: 192 of one product and 384 in total per building (extra stays on the list, just not in 3D).
 for(const id in want)want[id]=Math.min(want[id],192);
 let over=Object.values(want).reduce((t,n)=>t+n,0)-384;
 for(const id of Object.keys(want).sort((a,b)=>want[b]-want[a])){if(over<=0)break;const cut=Math.min(want[id],over);want[id]-=cut;over-=cut;}
  const key=JSON.stringify([want,profile.rooms||0]),changed=key!==vizSynced;if(!changed&&!vizPending.length)return;
 try{
  if(changed){
  syncVizRooms(api);
  const st=api.getState();
  const rooms=st.floors.flatMap(f=>f.rooms.map(r=>{const items=Object.fromEntries(r.plan.selectedItems.map(i=>[i.productId,i.quantity]));return {floorId:f.floorId,roomId:r.roomId,items,was:JSON.stringify(items)}}));
  const active=rooms.find(r=>r.floorId===st.active.floorId&&r.roomId===st.active.roomId)||rooms[0];
  const order=[active,...rooms.filter(r=>r!==active)];  // ties go to the room open in the planner
  const has=(r,id)=>r.items[id]||0,used=r=>Object.values(r.items).reduce((t,q)=>t+q,0);
  const bought=Object.fromEntries(st.purchaseSelection.map(i=>[i.productId,i.quantity]));
  for(const [id,n] of Object.entries(want)){
   let placed=rooms.reduce((t,r)=>t+has(r,id),0);
   while(placed>n){const r=[...order].reverse().reduce((m,r)=>has(r,id)>has(m,id)?r:m);r.items[id]--;placed--;}  // remove from the room with the most
   while(placed<n){  // add to the room with the fewest that still has space (planner: 8 of one model, 24 items per room)
    const r=order.filter(r=>has(r,id)<8&&used(r)<24).reduce((m,r)=>!m||has(r,id)<has(m,id)?r:m,null);
    if(!r)break;r.items[id]=has(r,id)+1;placed++;
   }
  }
  const list=o=>Object.entries(o).filter(([,q])=>q>0).map(([productId,quantity])=>({productId,quantity}));
  // Placed may never exceed "selected to buy": raise purchases, update rooms, then set the final purchases.
  // (Each product only ever moves one way per sync, so no room update can overshoot.)
  api.setPurchaseSelection(list({...bought,...Object.fromEntries(Object.entries(want).map(([id,n])=>[id,Math.max(n,bought[id]||0)]))}));
  for(const r of rooms)if(JSON.stringify(r.items)!==r.was)api.updateRoomEquipment({floorId:r.floorId,roomId:r.roomId,items:list(r.items)});
  api.setPurchaseSelection(list({...bought,...want}));
  vizSynced=key;
  }
  if(vizPending.length){const ops=vizPending;vizPending=[];applyPlacements(api,ops,want);}
 }catch(e){vizPending=[];console.warn("3D sync:",e.message)}
}
function chatMarkup(){
 return `<section class="panel chat-panel"><div class="panel-head"><div><div class="panel-title">AI planning assistant</div><div class="panel-sub">Ask questions or make changes to your equipment list</div></div><span class="chat-head-status"><span class="dot"></span> AI assistant</span></div>
 <div class="messages" id="messages">${messages.map((m,i)=>`<div class="msg${m.who==="user"?" user":""}${m.fresh&&!reduceMotion?" fade":""}"><div class="bubble-wrap">${m.thinking?`<div class="bubble thinking" aria-label="Assistant is typing"><span></span><span></span><span></span></div>`:m.animate?`<div class="bubble typing" data-type="${i}"></div>`:`<div class="bubble">${escapeHTML(m.text)}</div>`}</div></div>`).join("")}</div>
 <div class="composer"><div class="quick" id="quick"></div><form class="compose-row" id="chatForm"><input id="chatInput" autocomplete="off" placeholder="${stage==="clinic"?"e.g. I am opening an optometry clinic":"e.g. Remove the Almedic Eye Magnet"}" required><button class="primary" type="submit">Send</button></form></div></section>`;
}
function bindList(){
 $("undoBtn").onclick=undo;$("redoBtn").onclick=redo;$("listFullBtn").onclick=()=>openListModal();
 const finalizeButton=$("finalizeList");if(finalizeButton)finalizeButton.onclick=()=>openListModal(true);
 document.querySelectorAll(".item").forEach(el=>{
  const open=()=>openProduct(el.dataset.product);
  el.addEventListener("click",e=>{if(e.target.closest("button,input"))return;open()});
  el.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&!e.target.closest("button,input")){e.preventDefault();open()}});
 });
 $("mainArea").querySelectorAll("[data-action]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();listAction(btn)}));
}
function listAction(btn){  // remove / minus / plus, from the planner list or the full-view popup
  const p=catalogue.find(x=>String(x.id)===btn.dataset.id);if(!p)return;
  if(btn.dataset.action==="remove"){
   if(!selected.has(p.id))return;
   pushHistory();transition(()=>selected.delete(p.id));
   toast(`Removed ${p.short||p.name} from your list.`,"Undo",undo);return;
  }
  pushHistory();
  if(btn.dataset.action==="plus")p.qty++;
  if(btn.dataset.action==="minus")p.qty=Math.max(1,p.qty-1);
  renderCurrent();
}
let lastQuickKey="";
function renderChat(){
 const keep=document.querySelector(".items")?.scrollTop||0;  // re-render shouldn't jump the list to the top
 setSteps();
 const show=revealed||activeItems().length>0,reveal=show&&!revealed;revealed=show;
 const ws=document.querySelector("#mainArea > .workspace");
 if(ws&&$("vizFrame")){  // keep the 3D iframe alive: only swap the list and chat panels
  const from=ws.querySelector(".chat-panel").getBoundingClientRect();
  ws.querySelector(".list-panel").outerHTML=listMarkup();
  ws.querySelector(".chat-panel").outerHTML=chatMarkup();
  $("vizInfo").innerHTML=vizInfoMarkup();$("vizSide").innerHTML=vizSideMarkup();
  ws.classList.toggle("solo",!show);
  if(reveal)revealPanels(ws,from);
 }else{
  $("mainArea").innerHTML=`<div class="workspace${show?"":" solo"}">${listMarkup()}${chatMarkup()}${visualMarkup()}</div>`;setupViz();pageIn();
 }
 const items=document.querySelector(".items");if(items)items.scrollTop=keep;
 messages.forEach(m=>m.fresh=false);  // fade each message in once, not on every re-render
 const msg=$("messages");msg.scrollTop=msg.scrollHeight;bindList();
 $("chatForm").addEventListener("submit",e=>{e.preventDefault();const v=$("chatInput").value.trim();if(v)handleUser(v)});
 const options=stage==="clinic"&&!suggestions.length?clinicTypes.slice(0,4).map(t=>`I'm opening a ${t.replace(/-/g," ")} clinic`):[...suggestions,"Undo last change"];
 const quick=$("quick"),key=JSON.stringify(options),typingEl=document.querySelector("[data-type]");
 quick.classList.toggle("animate",key!==lastQuickKey);lastQuickKey=key;  // only pop in when the options are new
 quick.classList.toggle("wait",!!typingEl||busy);                        // ...and after the reply has finished typing
 options.forEach((v,i)=>{const b=document.createElement("button");b.textContent=v;b.style.setProperty("--i",i);b.onclick=()=>handleUser(v);quick.appendChild(b)});
 if(typingEl)typeOut(typingEl,messages[typingEl.dataset.type],()=>quick.classList.remove("wait"));
 if($("listModal").classList.contains("show"))fillListModal();  // keep the full view in step with the list
 syncViz();
}
// ChatGPT-style reveal, word by word. If the chat re-renders mid-way, the full text is shown instead.
const TYPE_SPEED=70;  // average ms per word (~14 words/s). Lower = faster.
function typeOut(el,m,done){
 m.animate=false;
 const words=m.text.split(/(\s+)/);let i=0;
 (function step(){
  if(!el.isConnected)return;
  const w=document.createElement("span");w.className="w";  // each word fades in, Claude-style
  w.textContent=words.slice(i,i+2).join("");i+=2;           // one word + the space after it
  el.appendChild(w);
  const box=$("messages");if(box)box.scrollTop=box.scrollHeight;
  if(i>=words.length){el.classList.remove("typing");done();return}
  const word=words[i-2]||"";
  const pause=/[.!?]$/.test(word)?TYPE_SPEED*4:/[,;:]$/.test(word)?TYPE_SPEED*1.5:0;  // breathe at punctuation
  setTimeout(step,TYPE_SPEED*(0.6+Math.random()*0.8)+pause);  // slight jitter so it doesn't feel mechanical
 })();
}
function renderCurrent(){if(stage==="contact")renderContact();else if(stage==="handoff")renderHandoff();else renderChat()}
let suggestions=[],busy=false,profile={};
// What the assistant has learned about the clinic, shown in the workspace panel and the sales email.
function profileLines(){
 const show=v=>v===null||v===undefined?"Not asked yet":v;
 return [["Practice",profile.clinic_type?titleCase(profile.clinic_type):null],
  ["Rooms",profile.rooms],
  ["Budget",profile.budget===0?"No limit":profile.budget?money(profile.budget):null],
  ["Extra services",Array.isArray(profile.services)?(profile.services.join(", ")||"None"):null]].map(([k,v])=>[k,show(v)]);
}
const clinicTypes=[...new Set(catalogue.flatMap(p=>p.tags||[]))];
const titleCase=t=>t.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
async function handleUser(value){
 if(busy)return;
 addMessage("user",value);
 // Page navigation and history stay local; everything else goes to the AI.
 if(/^\s*undo/i.test(value)){addMessage("bot",undoStack.length?"I reversed the last equipment-list change.":"There's nothing to undo yet.");if(!undo())renderChat();return}
 if(/^\s*redo/i.test(value)){addMessage("bot",redoStack.length?"I restored the last undone equipment-list change.":"There's nothing to redo.");if(!redo())renderChat();return}
 if(/^\s*(continue|next step|looks good|i'?m done|confirm)/i.test(value)&&activeItems().length){goContact();return}
 const lastReply=[...messages].reverse().find(m=>m.who==="bot"&&!m.thinking)?.text||"";
 busy=true;messages.push({who:"bot",thinking:true,fresh:true});renderChat();
 try{
  const list=Object.fromEntries(activeItems().map(p=>[String(p.id),p.qty]));
  const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:value,list,profile,last_reply:lastReply,rooms:vizRoomsForAI()})});
  if(!res.ok)throw new Error(res.status);
  const data=await res.json();
  messages.pop();
  if(JSON.stringify(list)!==JSON.stringify(data.list||{}))pushHistory();  // only list changes are undoable
  profile=data.profile||profile;
  if(profile.clinic_type)clinicType=titleCase(profile.clinic_type)+" Clinic";
  suggestions=data.suggestions||[];
  vizPending=data.placements||[];  // applied to the 3D rooms after the list has synced
  addMessage("bot",data.reply||"Done.");busy=false;
  transition(()=>{
   selected.clear();
   catalogue.forEach(p=>{const q=data.list?.[String(p.id)];if(q){p.qty=q;selected.add(p.id)}else p.qty=1});
   if(selected.size&&stage==="clinic")stage="review";
  });
 }catch(e){
  messages.pop();
  addMessage("bot","I couldn't reach the assistant. Start the server with “python3 app.py” and open http://localhost:5001.");
  busy=false;renderChat();
 }
}

function openProduct(id){
 const p=catalogue.find(x=>String(x.id)===String(id));if(!p)return;
 $("productTitle").textContent=p.name;
 $("productDetails").innerHTML=`<div class="detail">${imageTag(p)}<div><div class="eyebrow">${escapeHTML((p.tags||[]).join(' · '))}</div><div class="detail-price">${money(p.price)}</div><div class="detail-desc">${escapeHTML(p.description)}</div><div class="item-meta" style="margin-top:9px">Product ID: ${escapeHTML(p.id)}</div></div></div><div class="notice">Demonstration product. Confirm availability, specifications and final pricing with Valuemed.</div>`;
 $("openProductLink").hidden=!p.link;
 $("openProductLink").onclick=()=>{if(p.link)window.open(p.link,"_blank","noopener")};
 $("productModal").classList.add("show");
}
function closeProduct(){$("productModal").classList.remove("show")}
$("closeProduct").onclick=closeProduct;$("modalDone").onclick=closeProduct;
$("productModal").addEventListener("click",e=>{if(e.target===$("productModal"))closeProduct()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if($("productModal").classList.contains("show"))return closeProduct();closeListModal();setVizFull(false)}});

/* Equipment list full view: every zone from the catalogue, with the list's items as cards. */
const eqCard=p=>`<article class="eq-card" data-product="${p.id}" tabindex="0" role="button" aria-label="View ${escapeHTML(p.name)} details">
 <button class="item-x" data-action="remove" data-id="${p.id}" aria-label="Remove ${escapeHTML(p.short||p.name)}" title="Remove">×</button>
 <div class="eq-media">${imageTag(p,"eq-thumb")}</div><div class="eq-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</div><div class="eq-each">${money(p.price)} each</div>
 <div class="eq-bottom">${qtyControls(p)}<span class="line-price">${money(p.qty*p.price)}</span></div></article>`;
function fillListModal(){
 const items=activeItems();if(!items.length)return closeListModal();
 const groups=byCategory(items,true),body=$("listModalBody"),keep=body.scrollTop;
 $("listModalEyebrow").textContent=listConfirm?"Equipment list confirmation":"Equipment list · full view";
 $("listModalTitle").textContent=listConfirm?"Review your equipment list":"Your equipment by category";
 $("listModalSub").textContent=`${items.length} ${items.length===1?"product":"products"} in ${groups.filter(([,l])=>l.length).length} of ${CATEGORIES.length} categories`
  +(listConfirm?". Please confirm this is the equipment for your quote request. You can still change quantities here.":"");
 $("listModalNote").hidden=$("listModalBack").hidden=!listConfirm;
 $("listModalTabs").innerHTML=groups.map(([c,l],i)=>`<button type="button" class="cat-tab" data-jump="${i}"${l.length?"":" disabled"}>${escapeHTML(c)}<b>${l.length}</b></button>`).join("");
 body.innerHTML=groups.map(([c,l],i)=>`<section class="eq-group" id="eqCat${i}"><div class="eq-group-head"><h3>${escapeHTML(c)}</h3><span>${l.length?`${l.length} ${l.length===1?"item":"items"} · ${money(groupTotal(l))}`:"None yet"}</span></div>
  ${l.length?`<div class="eq-grid">${l.map(eqCard).join("")}</div>`:`<div class="eq-empty">Nothing from this category on your list yet. Ask the assistant to add some.</div>`}</section>`).join("");
 body.scrollTop=keep;
 $("listModalTotal").textContent=money(subtotal());
}
let listConfirm=false;  // true: the full view is the "confirm your list" step before contact details
function openListModal(confirm=false){if(!activeItems().length)return;listConfirm=confirm;$("listModalBody").scrollTop=0;fillListModal();$("listModal").classList.add("show");$("closeListModal").focus()}
function closeListModal(){$("listModal").classList.remove("show")}
$("closeListModal").onclick=closeListModal;
$("listModalFinalize").onclick=()=>{closeListModal();goContact()};
$("listModalBack").onclick=closeListModal;
$("listModal").addEventListener("click",e=>{
 if(e.target===$("listModal"))return closeListModal();
 const act=e.target.closest("[data-action]");if(act)return listAction(act);
 const jump=e.target.closest("[data-jump]");if(jump)return $("eqCat"+jump.dataset.jump).scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"start"});
 const card=e.target.closest(".eq-card");if(card&&!e.target.closest("button,input"))openProduct(card.dataset.product);
});
$("listModal").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches(".eq-card")){e.preventDefault();openProduct(e.target.dataset.product)}});

function goContact(){stage="contact";renderContact()}
function summaryMarkup(){return `<section class="panel contact-summary"><div class="panel-head"><div><div class="panel-title">Your equipment list</div><div class="panel-sub">${activeItems().length} selected products</div></div></div>
 <div class="summary-items">${activeItems().length?byCategory(activeItems()).map(([c,l])=>catHead(c,l)+l.map(p=>`<div class="summary-item">${imageTag(p)}<div><strong>${escapeHTML(p.name)}</strong><small>Quantity: ${p.qty}</small></div><span class="line-price">${money(p.qty*p.price)}</span></div>`).join("")).join(""):`<div class="empty">No products selected.</div>`}</div>
 <div class="summary-foot"><div class="total-row"><span>Indicative subtotal</span><strong>${money(subtotal())}</strong></div><div class="footer-note">CAD · Before tax, shipping and installation</div></div></section>`}
function renderContact(){
 setSteps();
 const u=userContact||{},val=k=>` value="${escapeHTML(u[k]||"")}"`;
 $("mainArea").innerHTML=`<div class="contact-layout">${summaryMarkup()}<section class="panel contact-card"><div class="eyebrow">Final step</div><h2>Request a personalized quote</h2><p>Your selected equipment will be included in the request. A Valuemed sales representative can review the details and provide a final quote.</p>
 <form id="contactForm"><div class="form-grid">
 <div class="field"><label for="fullname">Full name *</label><input id="fullname"${val("name")} required autocomplete="name" placeholder="Alex Chen"></div>
 <div class="field"><label for="email">Work email *</label><input id="email"${val("email")} type="email" required autocomplete="email" placeholder="alex@yourclinic.ca"></div>
 <div class="field"><label for="clinic">Clinic name *</label><input id="clinic"${val("clinic")} required placeholder="Example Eye Clinic"></div>
 <div class="field"><label for="phone">Phone (optional)</label><input id="phone"${val("phone")} type="tel" autocomplete="tel" placeholder="780-555-0100"></div>
 <div class="field full"><label for="location">Clinic location (optional)</label><input id="location"${val("location")} placeholder="Edmonton, Alberta"></div>
 <div class="field full"><label for="notes">Additional notes (optional)</label><textarea id="notes" placeholder="Delivery timeline, room requirements, etc.">${escapeHTML(u.notes||"")}</textarea></div>
 </div><div class="modal-actions"><button type="button" class="secondary" id="backChat">Back to planner</button><button type="submit" class="primary">Review sales request</button></div></form></section>${visualMarkup()}</div>`;
 setupViz();pageIn();
 $("backChat").onclick=()=>{stage="review";renderChat()};
 $("contactForm").onsubmit=e=>{e.preventDefault();userContact={name:$("fullname").value.trim(),email:$("email").value.trim(),clinic:$("clinic").value.trim(),phone:$("phone").value.trim(),location:$("location").value.trim(),notes:$("notes").value.trim()};stage="handoff";renderHandoff()};
}
function emailText(){
 const u=userContact;
 return `NEW CLINIC EQUIPMENT QUOTE REQUEST\n\nClinic type: ${clinicType}\n${profileLines().slice(1).map(([k,v])=>`${k}: ${v}`).join("\n")}\nClinic name: ${u.clinic}\nContact: ${u.name}\nEmail: ${u.email}\nPhone: ${u.phone||"Not provided"}\nLocation: ${u.location||"Not provided"}\n\nEQUIPMENT REQUEST\n${byCategory(activeItems()).map(([c,l])=>`${c.toUpperCase()} (${money(groupTotal(l))})\n`+l.map(p=>`- ${p.name} | Quantity: ${p.qty} | Reference price: ${money(p.price)} | Line total: ${money(p.qty*p.price)}`).join("\n")).join("\n\n")||"(No products selected)"}\n\nIllustrative subtotal: ${money(subtotal())}\nAdditional notes: ${u.notes||"None"}\n\nSample product information and prices are for demonstration only. Final pricing and availability require sales-team confirmation.`;
}
function renderHandoff(){
 setSteps();
 $("mainArea").innerHTML=`<div class="contact-layout">${summaryMarkup()}<section class="panel contact-card"><div class="eyebrow">Sales handoff</div><h2>Review the sales request</h2><p>This is the request that will be sent to the sales team.</p><div class="mail-preview" id="emailPreview"></div><div class="modal-actions" style="justify-content:flex-start"><button class="secondary" id="copyEmail">Copy request</button><button class="secondary" id="mailto">Open email draft</button><button class="primary" id="send">Submission</button></div><div class="notification" id="notice"></div><div class="notice">Prices are illustrative. A sales representative will confirm final pricing and availability.</div><div class="modal-actions"><button class="secondary" id="editList">Back to equipment</button><button class="secondary" id="restart">Start over</button></div></section>${visualMarkup()}</div>`;
 setupViz();pageIn();
 $("emailPreview").textContent=emailText();
 $("copyEmail").onclick=async()=>{try{await navigator.clipboard.writeText(emailText());notify("Request copied to clipboard.")}catch{notify("Clipboard access unavailable. Select and copy the request manually.")}};
 $("mailto").onclick=async()=>{
  const full=emailText(),link=body=>"mailto:?subject="+encodeURIComponent("New Clinic Equipment Quote Request - "+userContact.clinic)+"&body="+encodeURIComponent(body.replace(/\n/g,"\r\n"));
  let copied=true;try{await navigator.clipboard.writeText(full)}catch{copied=false}  // copy first: the page loses focus once the mail app opens
  const fits=link(full).length<=2000;  // Chrome/Edge on Windows ignore mailto links over 2048 characters
  window.location.href=fits?link(full):link(copied?"Paste the quote request here (Ctrl+V / Cmd+V). It has been copied to your clipboard.\n":"Paste the quote request here. Use \"Copy request\" on the sales request page to copy it.\n");
  notify(fits?"Opening your email app."+(copied?" The request is also on your clipboard if no email app opens.":"")
   :copied?"Opening your email app. The request is too long for an email link, so it's on your clipboard: paste it into the email body.":"Opening your email app. The request is too long for an email link: use \"Copy request\" and paste it into the email body.");
 };
 $("send").onclick=async e=>{  // the server re-prices the list from the catalogue, saves it, and emails it (see .env)
  const btn=e.currentTarget,label=btn.textContent;btn.disabled=true;btn.textContent="Sending…";
  try{
   const res=await fetch("/api/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...userContact,
    list:Object.fromEntries(activeItems().map(p=>[String(p.id),p.qty])),profile:Object.fromEntries(profileLines())})});
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(data.error||"Something went wrong sending your request.");
   btn.textContent="Sent";  // stays disabled so the same request isn't sent twice
   notify(data.emailed?`Request sent to the sales team. Your reference is ${data.ref}.`:`Request saved as ${data.ref}, but email isn't set up on the server yet (see .env).`);
  }catch(err){
   btn.disabled=false;btn.textContent=label;
   notify(err.message==="Failed to fetch"?"Couldn't reach the server. Check your connection and try again.":err.message);
  }
 };
 $("editList").onclick=()=>{stage="review";renderChat()};
 $("restart").onclick=()=>{selected.clear();catalogue.forEach(p=>p.qty=1);undoStack=[];redoStack=[];suggestions=[];profile={};messages=[{who:"bot",text:"Welcome to Clinic.exe.\n\nTell me about your clinic. What type of clinic are you opening?"}];stage="clinic";userContact=null;reached=0;revealed=false;renderChat()};
}
function notify(text){const n=$("notice");n.style.display="block";n.textContent=text}
renderChat();

/* Landing page. "Get started" goes to #plan; Back (or the logo) returns. The planner stays laid out underneath
   (inert while covered), so the 3D room is already loaded and framed when the landing lifts away. */
const app=document.querySelector(".app");
function showLanding(show,instant=false){
 const l=$("landing");
 app.inert=show;document.body.classList.toggle("landing-open",show);
 if(show){l.hidden=false;l.classList.remove("leaving");l.scrollTop=0;countUp();return}
 if(l.hidden)return;
 if(instant||reduceMotion){l.hidden=true;return}
 l.classList.add("leaving");setTimeout(()=>{l.hidden=true;l.classList.remove("leaving")},700);
 [document.querySelector(".topbar"),document.querySelector(".intro")].forEach((el,i)=>el.animate([{opacity:0,transform:"translateY(16px)"},{opacity:1,transform:"none"}],{duration:600,delay:250+i*90,easing:"cubic-bezier(.2,.8,.2,1)",fill:"backwards"}));
 setTimeout(pageIn,350);
 if(matchMedia("(pointer:fine)").matches)setTimeout(()=>$("chatInput")?.focus({preventScroll:true}),900);  // no surprise keyboard on phones
}
function countUp(){  // hero stats count up from 0 (real numbers from the catalogue)
 const n={products:catalogue.length,types:clinicTypes.length,categories:CATEGORIES.length};
 document.querySelectorAll("[data-count]").forEach(el=>{
  const to=n[el.dataset.count];if(reduceMotion){el.textContent=to;return}
  const t0=performance.now(),tick=t=>{const k=Math.min(1,(t-t0)/1400);el.textContent=Math.round(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(tick)};
  requestAnimationFrame(tick);
 });
}
$("heroMore").onclick=()=>$("how").scrollIntoView({behavior:reduceMotion?"auto":"smooth"});
addEventListener("hashchange",()=>showLanding(location.hash!=="#plan"));
showLanding(location.hash!=="#plan",true);