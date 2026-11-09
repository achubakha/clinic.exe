/* AI planning assistant: the chat panel, the planner page render, word-by-word replies, and calls to /api/chat. */

function addMessage(who,text){messages.push({who,text,animate:who==="bot"&&!reduceMotion,fresh:true})}
function chatMarkup(){
 return `<section class="panel chat-panel"><div class="panel-head"><div><div class="panel-title">AI planning assistant</div><div class="panel-sub">Ask questions or make changes to your equipment list</div></div><span class="chat-head-status"><span class="dot"></span> AI assistant</span></div>
 <div class="messages" id="messages">${messages.map((m,i)=>`<div class="msg${m.who==="user"?" user":""}${m.fresh&&!reduceMotion?" fade":""}"><div class="bubble-wrap">${m.thinking?`<div class="bubble thinking" aria-label="Assistant is typing"><span></span><span></span><span></span></div>`:m.animate?`<div class="bubble typing" data-type="${i}"></div>`:`<div class="bubble">${escapeHTML(m.text)}</div>`}</div></div>`).join("")}</div>
 <div class="composer"><div class="quick" id="quick"></div><form class="compose-row" id="chatForm"><input id="chatInput" autocomplete="off" placeholder="${stage==="clinic"?"e.g. I am opening an optometry clinic":"e.g. Remove the Almedic Eye Magnet"}" required><button class="primary" type="submit">Send</button></form></div></section>`;
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
