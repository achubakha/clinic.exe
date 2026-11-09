/* Start-up: global keyboard shortcuts, first render, and landing vs planner. Loaded last. */

document.addEventListener("keydown",e=>{if(e.key==="Escape"){if($("productModal").classList.contains("show"))return closeProduct();closeListModal();setVizFull(false)}});
renderChat();
showLanding(location.hash!=="#plan",true);
