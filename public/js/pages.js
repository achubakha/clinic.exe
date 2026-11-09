/* Steps and pages: step badges, page transitions, contact details form, sales handoff (email draft + submission to /api/quote). */

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
function goStep(i){
  if(i<2){stage=i?"review":"clinic";renderChat()}
  else if(i===2)goContact();
  else{stage="handoff";renderHandoff()}
}
$("steps").onclick=e=>{const b=e.target.closest("[data-step]");if(b&&!b.disabled)goStep(+b.dataset.step)};
function renderCurrent(){if(stage==="contact")renderContact();else if(stage==="handoff")renderHandoff();else renderChat()}
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
