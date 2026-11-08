/* CATALOGUE INTEGRATION:
   Replace the sample entries with the catalogue team's data.
   image should be a local asset path or an image URL supplied by the catalogue.
   productUrl should be the real Valuemed product page URL.
*/

const FORM_ENDPOINT = ""; // Optional Formspree endpoint for a real test submission.
const money=n=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(n);
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const placeholderImage='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="100%" height="100%" fill="#eef2f7"/><path d="M55 70h50M80 45v50" stroke="#9aabc0" stroke-width="4" stroke-linecap="round"/><text x="80" y="108" text-anchor="middle" font-family="Arial" font-size="10" fill="#718198">Product image</text></svg>');
let stage="clinic",clinicType="Clinic",selected=new Set(),messages=[
  {who:"bot",text:"Welcome to Clinic.exe.\n\nTell me about your clinic. What type of clinic are you opening?"}
],userContact=null,undoStack=[],redoStack=[];

function activeItems(){return catalogue.filter(p=>selected.has(p.id))}
function subtotal(){return activeItems().reduce((sum,p)=>sum+p.qty*p.price,0)}
function snapshot(){return catalogue.map(p=>({id:p.id,qty:p.qty,selected:selected.has(p.id)}))}
function pushHistory(){undoStack.push(snapshot());if(undoStack.length>40)undoStack.shift();redoStack=[]}
function applySnapshot(s){s.forEach(x=>{const p=catalogue.find(p=>p.id===x.id);if(p)p.qty=x.qty;if(x.selected)selected.add(x.id);else selected.delete(x.id)});renderCurrent()}
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());applySnapshot(undoStack.pop())}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());applySnapshot(redoStack.pop())}
function addMessage(who,text){messages.push({who,text})}
function setSteps(){
  const steps=["1. Plan clinic","2. Review equipment","3. Contact details","4. Sales handoff"];
  const idx=stage==="clinic"?0:stage==="contact"?2:stage==="handoff"?3:1;
  $("steps").innerHTML=steps.map((s,i)=>`<span class="step ${i===idx?"active":i<idx?"done":""}">${s}</span>`).join("");
}
function imageTag(p,cls=""){return `<img class="${cls}" src="${escapeHTML(p.image||"")}" alt="${escapeHTML(p.name)}" onerror="this.onerror=null;this.src='${placeholderImage}'">`}
function listMarkup(){
  return `<section class="panel list-panel">
    <div class="panel-head"><div><div class="panel-title">Your equipment list</div><div class="panel-sub">Click an item to view details</div></div><span class="count">${activeItems().length} ITEMS</span></div>
    <div class="list-toolbar" style="padding:10px 12px 0"><button class="icon-btn" id="undoBtn" title="Undo" ${undoStack.length?"":"disabled"}>Undo</button><button class="icon-btn" id="redoBtn" title="Redo" ${redoStack.length?"":"disabled"}>Redo</button></div>
    <div class="items">${activeItems().length?activeItems().map(p=>`<article class="item" data-product="${p.id}" tabindex="0" role="button" aria-label="View ${escapeHTML(p.name)} details">
      ${imageTag(p,"thumb")}
      <div class="item-main"><div class="item-name">${escapeHTML(p.name)}</div><div class="item-meta">${escapeHTML((p.tags||[]).join(' · '))}</div>
        <div class="item-bottom"><div class="qty"><button data-action="minus" data-id="${p.id}" aria-label="Decrease quantity">−</button><span>${p.qty}</span><button data-action="plus" data-id="${p.id}" aria-label="Increase quantity">+</button></div><span class="line-price">${money(p.qty*p.price)}</span></div>
        <button class="remove" data-action="remove" data-id="${p.id}">Remove item</button>
      </div></article>`).join(""):`<div class="empty">Your equipment list is empty.<br>Describe your clinic to get started.</div>`}</div>
    <div class="list-footer"><div class="total-row"><span>Indicative subtotal</span><strong>${money(subtotal())}</strong></div><div class="footer-note">CAD · Before tax, shipping and installation</div><button class="primary" id="finalizeList" style="width:100%;margin-top:12px" ${activeItems().length ? "" : "disabled"}>Finalize list</button></div>
  </section>`;
}
function visualMarkup(){
 return `<aside class="panel visual-panel"><div class="panel-head"><div><div class="panel-title">Clinic workspace</div><div class="panel-sub">3D room preview</div></div><span class="count">PREVIEW</span></div><div class="panel-body">
 <div class="eyecase"><svg viewBox="0 0 360 190" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M46 123L183 57L313 122L180 181L46 123Z" fill="#bdd4f6" stroke="#729cdc" stroke-width="2"/><path d="M46 123V96L183 34L313 99V122L183 59L46 123Z" fill="#e7f0ff" stroke="#729cdc"/><path d="M183 34V59" stroke="#729cdc"/><path d="M80 111L156 75L196 96L120 132L80 111Z" fill="#f4f9ff" stroke="#608fce" stroke-width="2"/><path d="M96 111V144L120 157V132" fill="#d6e6fa" stroke="#608fce"/><path d="M120 132V157L196 120V96" fill="#a8c4ed" stroke="#608fce"/><path d="M96 99L156 71L183 83L122 112Z" fill="#fff"/><path d="M226 99L261 81L282 92L248 110Z" fill="#f6fbff" stroke="#5e8ecb"/><path d="M229 100V138L248 147V110" fill="#cfe2fa" stroke="#5e8ecb"/><path d="M248 110V147L282 130V92" fill="#a9c6ea" stroke="#5e8ecb"/><path d="M229 99L261 81L282 92L248 110Z" fill="#fff"/><path d="M169 93L169 45M169 45L185 40" stroke="#4d7abe" stroke-width="6" stroke-linecap="round"/><circle cx="185" cy="41" r="9" fill="#5686cc"/><path d="M195 149L215 140" stroke="#648bc1" stroke-width="5" stroke-linecap="round"/></svg></div>
 <div class="visual-stats"><div class="stat"><small>Products selected</small><strong>${activeItems().length}</strong></div><div class="stat"><small>Equipment subtotal</small><strong>${money(subtotal())}</strong></div></div>
 <div class="visual-note"><strong>Clinic plan</strong><br>${profileLines().map(([k,v])=>`${k}: ${escapeHTML(v)}`).join("<br>")}</div>
 </div></aside>`;
}
function chatMarkup(){
 return `<section class="panel chat-panel"><div class="panel-head"><div><div class="panel-title">AI planning assistant</div><div class="panel-sub">Ask questions or make changes to your equipment list</div></div><span class="chat-head-status"><span class="dot"></span> AI assistant</span></div>
 <div class="messages" id="messages">${messages.map(m=>`<div class="msg ${m.who==="user"?"user":""}"><div class="avatar">${m.who==="user"?"YOU":"AI"}</div><div class="bubble-wrap"><div class="msg-label">${m.who==="user"?"You":"Clinic.exe"}</div><div class="bubble">${escapeHTML(m.text)}</div></div></div>`).join("")}</div>
 <div class="composer"><div class="quick" id="quick"></div><form class="compose-row" id="chatForm"><input id="chatInput" autocomplete="off" placeholder="${stage==="clinic"?"e.g. I am opening an optometry clinic":"e.g. Remove the Almedic Eye Magnet"}" required><button class="primary" type="submit">Send</button></form></div></section>`;
}
function bindList(){
 $("undoBtn").onclick=undo;$("redoBtn").onclick=redo;
 const finalizeButton=$("finalizeList");if(finalizeButton)finalizeButton.onclick=openFinalize;
 document.querySelectorAll(".item").forEach(el=>{
  const open=()=>openProduct(el.dataset.product);
  el.addEventListener("click",e=>{if(e.target.closest("button"))return;open()});
  el.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&!e.target.closest("button")){e.preventDefault();open()}});
 });
 document.querySelectorAll("[data-action]").forEach(btn=>btn.addEventListener("click",e=>{
  e.stopPropagation();const p=catalogue.find(x=>String(x.id)===btn.dataset.id);if(!p)return;
  pushHistory();
  if(btn.dataset.action==="plus")p.qty++;
  if(btn.dataset.action==="minus"){p.qty=Math.max(1,p.qty-1)}
  if(btn.dataset.action==="remove")selected.delete(p.id);
  renderCurrent();
 }));
}
function renderChat(){
 setSteps();$("mainArea").innerHTML=`<div class="workspace">${listMarkup()}${chatMarkup()}${visualMarkup()}</div>`;
 const msg=$("messages");msg.scrollTop=msg.scrollHeight;bindList();
 $("chatForm").addEventListener("submit",e=>{e.preventDefault();const v=$("chatInput").value.trim();if(v)handleUser(v)});
 const quick=$("quick");(stage==="clinic"&&!suggestions.length?clinicTypes.slice(0,4).map(t=>`I'm opening a ${t.replace(/-/g," ")} clinic`):[...suggestions,"Undo last change"]).forEach(v=>{const b=document.createElement("button");b.textContent=v;b.onclick=()=>handleUser(v);quick.appendChild(b)});
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
 if(/^\s*undo/i.test(value)){undo();addMessage("bot","I reversed the last equipment-list change.");renderChat();return}
 if(/^\s*redo/i.test(value)){redo();addMessage("bot","I restored the last undone equipment-list change.");renderChat();return}
 if(/^\s*(continue|next step|looks good|i'?m done|confirm)/i.test(value)&&activeItems().length){goContact();return}
 const lastReply=[...messages].reverse().find(m=>m.who==="bot")?.text||"";
 busy=true;addMessage("bot","Thinking…");renderChat();
 try{
  const list=Object.fromEntries(activeItems().map(p=>[String(p.id),p.qty]));
  const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:value,list,profile,last_reply:lastReply})});
  if(!res.ok)throw new Error(res.status);
  const data=await res.json();
  messages.pop();pushHistory();selected.clear();
  catalogue.forEach(p=>{const q=data.list?.[String(p.id)];if(q){p.qty=q;selected.add(p.id)}else p.qty=1});
  profile=data.profile||profile;
  if(profile.clinic_type)clinicType=titleCase(profile.clinic_type)+" Clinic";
  if(selected.size&&stage==="clinic")stage="review";
  suggestions=data.suggestions||[];
  addMessage("bot",data.reply||"Done.");
 }catch(e){
  messages.pop();
  addMessage("bot","I couldn't reach the assistant. Start the server with “python3 app.py” and open http://localhost:5001.");
 }
 busy=false;renderChat();
}
function openFinalize(){
 if(!activeItems().length)return;
 $("finalizeItems").innerHTML=activeItems().map(p=>`<div class="finalize-row">${imageTag(p)}<div><strong>${escapeHTML(p.name)}</strong><small>Quantity: ${p.qty} · ${money(p.price)} each</small></div><span class="finalize-price">${money(p.qty*p.price)}</span></div>`).join("");
 $("finalizeTotal").textContent=money(subtotal());
 $("finalizeModal").classList.add("show");
}
function closeFinalize(){$("finalizeModal").classList.remove("show")}
$("closeFinalize").onclick=closeFinalize;
$("editFinalize").onclick=closeFinalize;
$("confirmFinalize").onclick=()=>{closeFinalize();goContact()};
$("finalizeModal").addEventListener("click",e=>{if(e.target===$("finalizeModal"))closeFinalize()});

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
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeProduct();closeFinalize()}});

function goContact(){stage="contact";renderContact()}
function summaryMarkup(){return `<section class="panel contact-summary"><div class="panel-head"><div><div class="panel-title">Your equipment list</div><div class="panel-sub">${activeItems().length} selected products</div></div></div><div class="panel-body">${activeItems().length?activeItems().map(p=>`<div class="summary-item">${imageTag(p)}<div><strong>${escapeHTML(p.name)}</strong><small>Quantity: ${p.qty}</small></div><strong style="font-size:10px">${money(p.qty*p.price)}</strong></div>`).join(""):`<div class="empty">No products selected.</div>`}<div class="summary-total"><span>Indicative subtotal</span><span>${money(subtotal())}</span></div><div class="footer-note">CAD · Before tax, shipping and installation</div><div style="margin-top:13px"><button class="secondary" id="backToPlanner">Edit equipment list</button></div></div></section>`}
function renderContact(){
 setSteps();
 $("mainArea").innerHTML=`<div class="contact-layout">${summaryMarkup()}<section class="panel contact-card"><div class="eyebrow">Final step</div><h2>Request a personalized quote</h2><p>Your selected equipment will be included in the request. A Valuemed sales representative can review the details and provide a final quote.</p>
 <form id="contactForm"><div class="form-grid">
 <div class="field"><label for="fullname">Full name *</label><input id="fullname" required autocomplete="name" placeholder="Alex Chen"></div>
 <div class="field"><label for="email">Work email *</label><input id="email" type="email" required autocomplete="email" placeholder="alex@yourclinic.ca"></div>
 <div class="field"><label for="clinic">Clinic name *</label><input id="clinic" required placeholder="Example Eye Clinic"></div>
 <div class="field"><label for="phone">Phone (optional)</label><input id="phone" type="tel" autocomplete="tel" placeholder="780-555-0100"></div>
 <div class="field full"><label for="location">Clinic location (optional)</label><input id="location" placeholder="Edmonton, Alberta"></div>
 <div class="field full"><label for="notes">Additional notes (optional)</label><textarea id="notes" placeholder="Delivery timeline, room requirements, etc."></textarea></div>
 </div><div class="modal-actions"><button type="button" class="secondary" id="backChat">Back to planner</button><button type="submit" class="primary">Review sales request</button></div></form></section>${visualMarkup()}</div>`;
 $("backToPlanner").onclick=()=>{stage="review";renderChat()};
 $("backChat").onclick=()=>{stage="review";renderChat()};
 $("contactForm").onsubmit=e=>{e.preventDefault();userContact={name:$("fullname").value.trim(),email:$("email").value.trim(),clinic:$("clinic").value.trim(),phone:$("phone").value.trim(),location:$("location").value.trim(),notes:$("notes").value.trim()};stage="handoff";renderHandoff()};
}
function emailText(){
 const u=userContact;
 return `NEW CLINIC EQUIPMENT QUOTE REQUEST\n\nClinic type: ${clinicType}\n${profileLines().slice(1).map(([k,v])=>`${k}: ${v}`).join("\n")}\nClinic name: ${u.clinic}\nContact: ${u.name}\nEmail: ${u.email}\nPhone: ${u.phone||"Not provided"}\nLocation: ${u.location||"Not provided"}\n\nEQUIPMENT REQUEST\n${activeItems().map(p=>`- ${p.name} | Quantity: ${p.qty} | Reference price: ${money(p.price)} | Line total: ${money(p.qty*p.price)}`).join("\n")||"(No products selected)"}\n\nIllustrative subtotal: ${money(subtotal())}\nAdditional notes: ${u.notes||"None"}\n\nSample product information and prices are for demonstration only. Final pricing and availability require sales-team confirmation.`;
}
function renderHandoff(){
 setSteps();
 $("mainArea").innerHTML=`<div class="contact-layout">${summaryMarkup()}<section class="panel contact-card"><div class="eyebrow">Sales handoff</div><h2>Review the sales request</h2><p>This is the structured request that would be sent to the sales team.</p><div class="mail-preview" id="emailPreview"></div><div class="modal-actions" style="justify-content:flex-start"><button class="secondary" id="copyEmail">Copy request</button><button class="secondary" id="mailto">Open email draft</button><button class="primary" id="send">${FORM_ENDPOINT?"Send test request":"Simulate submission"}</button></div><div class="notification" id="notice"></div><div class="notice">${FORM_ENDPOINT?"Test endpoint configured. Use dummy information during the demo.":"Demo mode: no email is delivered. Configure FORM_ENDPOINT or connect your team's backend to deliver requests."}</div><div class="modal-actions"><button class="secondary" id="editList">Back to equipment</button><button class="secondary" id="restart">Start over</button></div></section>${visualMarkup()}</div>`;
 $("emailPreview").textContent=emailText();
 $("copyEmail").onclick=async()=>{try{await navigator.clipboard.writeText(emailText());notify("Request copied to clipboard.")}catch{notify("Clipboard access unavailable. Select and copy the request manually.")}};
 $("mailto").onclick=()=>{window.location.href="mailto:?subject="+encodeURIComponent("New Clinic Equipment Quote Request — "+userContact.clinic)+"&body="+encodeURIComponent(emailText())};
 $("send").onclick=async()=>{
  if(!FORM_ENDPOINT){notify("Demo complete: submission simulated. No email was sent.");return}
  const data=new FormData();Object.entries(userContact).forEach(([k,v])=>data.append(k,v));data.append("equipment_request",emailText());data.append("_subject","New Clinic Equipment Quote Request");
  try{const res=await fetch(FORM_ENDPOINT,{method:"POST",body:data,headers:{Accept:"application/json"}});if(!res.ok)throw new Error();notify("The test form service accepted the request. Check its configured destination inbox.");}
  catch{notify("Submission failed. Check the endpoint and connection.");}
 };
 $("editList").onclick=()=>{stage="review";renderChat()};
 $("restart").onclick=()=>{selected.clear();catalogue.forEach(p=>p.qty=1);undoStack=[];redoStack=[];suggestions=[];profile={};messages=[{who:"bot",text:"Welcome to Clinic.exe.\n\nTell me about your clinic. What type of clinic are you opening?"}];stage="clinic";userContact=null;renderChat()};
}
function notify(text){const n=$("notice");n.style.display="block";n.textContent=text}
renderChat();