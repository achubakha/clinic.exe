/* Landing page. */

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
