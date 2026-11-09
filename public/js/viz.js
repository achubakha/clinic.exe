/* 3D clinic workspace: the 3d/3d.html planner in an iframe, its full-view popup, room switcher, and syncing the list into the rooms. */

function visualMarkup(){
 return `<aside class="panel visual-panel"><div class="panel-head"><div><div class="panel-title">Clinic workspace</div><div class="panel-sub">3D room · drag to look around</div></div><span class="count">LIVE 3D</span></div><div class="panel-body">
 <div class="viz-slot"><div class="viz-shell" id="vizShell" aria-label="3D clinic planner">
  <div class="viz-bar"><div><strong>3D clinic planner</strong><span>Add equipment on the left, then arrange it in the room · changes update your equipment list</span></div><button class="viz-close" id="vizClose" type="button" aria-label="Close the 3D planner">✕</button></div>
  <div class="viz-body"><aside class="viz-side" id="vizSide" aria-label="Room equipment">${vizSideMarkup()}</aside><div class="viz-stage"><iframe id="vizFrame" src="3d/3d.html" title="3D clinic room planner"></iframe><nav class="viz-rooms" id="vizRooms" aria-label="Rooms"></nav></div></div>
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
/* 3D room (3d/3d.html) in one iframe. Small: only the 3D view. Full view: the same iframe fills the
   screen with the whole planner, so nothing reloads and the layout is kept. 3d/3d.html saves its
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
