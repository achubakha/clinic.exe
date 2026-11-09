/* Equipment list: list panel, quantity controls, add/remove animations, product details, and the full-view popup
   (which is also the "confirm your list" step). */

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
function itemsMarkup(){
 let k=0;  // stagger items sliding in, capped so big lists don't take ages
 return byCategory(activeItems()).map(([c,l])=>catHead(c,l)+l.map(p=>itemMarkup(p,enterIds.has(p.id)?Math.min(k++,12)*45:null)).join("")).join("");
}
let lastTotal=null;
function totalBump(){const t=subtotal(),b=lastTotal!==null&&t!==lastTotal;lastTotal=t;return b?' class="bump"':""}  // subtotal pulses when it changes
function listMarkup(){
  return `<section class="panel list-panel">
    <div class="panel-head"><div><div class="panel-title">Your equipment list</div><div class="panel-sub">Click an item to view details</div></div><span class="count">${activeItems().length} ITEMS</span></div>
    <div class="list-toolbar" style="padding:10px 12px 0"><button class="icon-btn" id="undoBtn" title="Undo" ${undoStack.length?"":"disabled"}>Undo</button><button class="icon-btn" id="redoBtn" title="Redo" ${redoStack.length?"":"disabled"}>Redo</button><button class="icon-btn full-btn" id="listFullBtn" type="button" aria-label="Open the equipment list in full view" ${activeItems().length?"":"disabled"}>⤢ Full view</button></div>
    <div class="items">${activeItems().length?itemsMarkup():`<div class="empty">Your equipment list is empty.<br>Describe your clinic to get started.</div>`}</div>
    <div class="list-footer"><div class="total-row"><span>Indicative subtotal</span><strong${totalBump()}>${money(subtotal())}</strong></div><div class="footer-note">CAD · Before tax, shipping and installation</div><button class="primary" id="finalizeList" style="width:100%;margin-top:12px" ${activeItems().length ? "" : "disabled"}>Finalize list</button></div>
  </section>`;
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
