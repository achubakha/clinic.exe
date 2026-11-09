/* Shared helpers and state: money/escaping, the selected list, undo/redo, toasts, checklist categories, clinic profile. */

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
// Equipment checklist zones, in the order lists are shown (each catalogue product has one).
const CATEGORIES=["Clinical Examination","Medical Devices & Utilities","Consumables & PPE","IT & Administrative"];
const byCategory=(items,all=false)=>[...CATEGORIES,"Other"].map(c=>[c,items.filter(p=>(CATEGORIES.includes(p.category)?p.category:"Other")===c)]).filter(([c,l])=>l.length||(all&&c!=="Other"));
const groupTotal=l=>l.reduce((t,p)=>t+p.qty*p.price,0);
const catHead=(c,l)=>`<div class="cat-head"><span>${escapeHTML(c)}</span><span>${l.length} ${l.length===1?"item":"items"} · ${money(groupTotal(l))}</span></div>`;
function imageTag(p,cls=""){return `<img class="${cls}" src="${escapeHTML(p.image||"")}" alt="${escapeHTML(p.name)}" onerror="this.onerror=null;this.src='${placeholderImage}'">`}
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
