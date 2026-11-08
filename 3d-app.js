/* 3D app for 3d.html: multi-floor building state, UI, pointer interaction, public API and building controller.
   Needs 3d-engine.js loaded first. */
window.CLINIC_BUILDING_MODE = true;


/* Multi-floor state. Catalogue products, purchase choices and room placements
 * are deliberately separate. No DOM or networking is used in this module. */
(function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const { catalogue } = ClinicData;
  const LIMITS = Object.freeze({ floors: 8, roomsPerFloor: 12, rooms: 24, purchasePerProduct: 192, purchased: 384 });
  const product = id => catalogue.find(p => p.id === id);
  const fail = text => { throw new Error(text); };
  const nameOf = value => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) fail('Names must contain 1–80 characters.');
    return value.trim();
  };
  const idOf = value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fail('Invalid floor or room ID.');
    return value;
  };
  function normalizePurchase(items) {
    if (!Array.isArray(items) || items.length > catalogue.length) fail('Purchase selection must be an array of registered product IDs and quantities.');
    const seen = new Set(); let total = 0;
    const rows = items.map(item => {
      if (!item || typeof item !== 'object' || !product(item.productId)) fail('Unknown purchase product ID: ' + String(item?.productId));
      if (seen.has(item.productId)) fail('Duplicate purchase product ID: ' + item.productId);
      seen.add(item.productId);
      if (!Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > LIMITS.purchasePerProduct) fail('Purchase quantity must be a whole number from 0 to ' + LIMITS.purchasePerProduct + '.');
      total += item.quantity;
      return { productId: item.productId, quantity: item.quantity };
    }).filter(item => item.quantity > 0);
    if (total > LIMITS.purchased) fail('Maximum ' + LIMITS.purchased + ' selected items per building in this prototype.');
    return rows;
  }
  function roomPlan(items = [], width = 6, depth = 5) {
    const store = new ClinicState.Store();
    store.setRoom(width, depth, false); store.updateEquipment(items, false);
    return store.export();
  }
  function canonicalPlan(data) {
    const store = new ClinicState.Store(); store.import(data); return store.export();
  }
  function roomRows(state) {
    return state.floors.flatMap(floor => floor.rooms.map(room => ({ floor, room })));
  }
  function inventory(state) {
    const placed = {};
    for (const { room } of roomRows(state)) for (const item of room.plan.layout) placed[item.productId] = (placed[item.productId] || 0) + 1;
    const selected = Object.fromEntries(state.purchaseSelection.map(item => [item.productId, item.quantity]));
    return catalogue.map(item => ({ productId: item.id, name: item.name, selected: selected[item.id] || 0, placed: placed[item.id] || 0, unplaced: (selected[item.id] || 0) - (placed[item.id] || 0) }));
  }
  function checkAllocations(state) {
    const over = inventory(state).find(item => item.unplaced < 0);
    if (over) fail('Not enough selected ' + over.name + '. ' + over.placed + ' are placed, but only ' + over.selected + ' selected. Increase Purchase total first, or remove a placement from another room.');
  }
  function validate(data) {
    if (!data || data.kind !== 'clinic-building' || data.schemaVersion !== 1 || data.units !== 'metres') fail('Use a building JSON exported by this version. A single-room export is not a building.');
    if (!Array.isArray(data.floors) || data.floors.length < 1 || data.floors.length > LIMITS.floors) fail('A building needs 1–' + LIMITS.floors + ' floors.');
    const floorIds = new Set(), roomIds = new Set();
    const floors = data.floors.map(floor => {
      const floorId = idOf(floor.floorId);
      if (floorIds.has(floorId)) fail('Duplicate floor ID.'); floorIds.add(floorId);
      if (!Array.isArray(floor.rooms) || floor.rooms.length < 1 || floor.rooms.length > LIMITS.roomsPerFloor) fail('Each floor needs 1–' + LIMITS.roomsPerFloor + ' rooms.');
      return { floorId, name: nameOf(floor.name), rooms: floor.rooms.map(room => {
        const roomId = idOf(room.roomId);
        if (roomIds.has(roomId)) fail('Room IDs must be unique throughout the building.'); roomIds.add(roomId);
        return { roomId, name: nameOf(room.name), plan: canonicalPlan(room.plan) };
      }) };
    });
    if (roomIds.size > LIMITS.rooms) fail('Maximum ' + LIMITS.rooms + ' rooms in this prototype.');
    const state = { kind: 'clinic-building', schemaVersion: 1, units: 'metres', name: nameOf(data.name), purchaseSelection: normalizePurchase(data.purchaseSelection), floors, active: copy(data.active || {}) };
    const floor = floors.find(f => f.floorId === state.active.floorId);
    if (!floor || !floor.rooms.some(r => r.roomId === state.active.roomId)) fail('Active floor and room do not exist.');
    checkAllocations(state);
    return state;
  }
  function demo() {
    const ids = new Set(catalogue.map(p => p.id));
    const available = rows => rows.filter(row => ids.has(row.productId));
    return {
      kind: 'clinic-building', schemaVersion: 1, units: 'metres', name: 'My Clinic',
      purchaseSelection: available([
        { productId: 'exam-chair', quantity: 3 }, { productId: 'slit-lamp', quantity: 1 },
        { productId: 'stool', quantity: 2 }, { productId: 'exam-table', quantity: 1 },
        { productId: 'cabinet', quantity: 1 }, { productId: 'demo-cart-001', quantity: 1 }
      ]),
      floors: [
        { floorId: 'floor-1', name: 'Ground floor', rooms: [
          { roomId: 'room-101', name: 'Exam Room 101', plan: roomPlan(available([{ productId: 'exam-chair', quantity: 1 }, { productId: 'slit-lamp', quantity: 1 }, { productId: 'stool', quantity: 1 }])) },
          { roomId: 'room-102', name: 'Exam Room 102', plan: roomPlan(available([{ productId: 'exam-table', quantity: 1 }, { productId: 'cabinet', quantity: 1 }]), 5, 4) }
        ] },
        { floorId: 'floor-2', name: 'Second floor', rooms: [ { roomId: 'room-201', name: 'Exam Room 201', plan: roomPlan([], 6, 5) } ] }
      ], active: { floorId: 'floor-1', roomId: 'room-101' }
    };
  }
  class BuildingStore {
    constructor(data = demo()) { this.state = validate(data); }
    export() { return copy({ ...this.state, notice: 'Illustrative planning only. Not a building plan, safety assessment, inventory count or submitted quote. Purchase selection is separate from room placement. Catalogue definitions must match on import.' }); }
    import(data) { const next = validate(data); this.state = next; return this.export(); }
    rows() { return roomRows(this.state); }
    getRoom(floorId = this.state.active.floorId, roomId = this.state.active.roomId) {
      const floor = this.state.floors.find(f => f.floorId === floorId);
      const room = floor?.rooms.find(r => r.roomId === roomId);
      if (!room) fail('Unknown floor/room pair. Specify exact floorId and roomId.');
      return { floor, room };
    }
    inventory() { return inventory(this.state); }
    summary() { const rows = this.inventory(); return { floors: this.state.floors.length, rooms: this.rows().length, selected: rows.reduce((s, r) => s + r.selected, 0), placed: rows.reduce((s, r) => s + r.placed, 0), unplaced: rows.reduce((s, r) => s + r.unplaced, 0) }; }
    selectRoom(floorId, roomId) { this.getRoom(floorId, roomId); this.state.active = { floorId, roomId }; return copy(this.getRoom().room.plan); }
    setPurchaseSelection(items) { const next = { ...this.state, purchaseSelection: normalizePurchase(items) }; checkAllocations(next); this.state.purchaseSelection = next.purchaseSelection; return this.inventory(); }
    setPurchaseQuantity(productId, quantity) { return this.setPurchaseSelection([...this.state.purchaseSelection.filter(r => r.productId !== productId), { productId, quantity }]); }
    validateRoomPlan(floorId, roomId, plan) {
      this.getRoom(floorId, roomId); const canonical = canonicalPlan(plan);
      const next = copy(this.state);
      next.floors.find(f => f.floorId === floorId).rooms.find(r => r.roomId === roomId).plan = canonical;
      checkAllocations(next); return canonical;
    }
    commitRoomPlan(floorId, roomId, plan) { const canonical = this.validateRoomPlan(floorId, roomId, plan); this.getRoom(floorId, roomId).room.plan = canonical; return copy(canonical); }
    updateRoomEquipment({ floorId, roomId, items }) {
      if (!floorId || !roomId) fail('Room updates require both floorId and roomId.');
      const { room } = this.getRoom(floorId, roomId), store = new ClinicState.Store();
      store.import(room.plan); store.updateEquipment(items);
      return this.commitRoomPlan(floorId, roomId, store.export());
    }
    nextId(prefix, ids) { let n = 1; while (ids.has(prefix + n)) n++; return prefix + n; }
    addFloor(name) {
      if (this.state.floors.length >= LIMITS.floors) fail('Maximum ' + LIMITS.floors + ' floors.');
      if (this.rows().length >= LIMITS.rooms) fail('Maximum ' + LIMITS.rooms + ' rooms.');
      const floorId = this.nextId('floor-', new Set(this.state.floors.map(f => f.floorId)));
      const roomId = this.nextId('room-', new Set(this.rows().map(r => r.room.roomId)));
      this.state.floors.push({ floorId, name: nameOf(name), rooms: [{ roomId, name: 'New room', plan: roomPlan() }] });
      this.selectRoom(floorId, roomId); return { floorId, roomId };
    }
    addRoom(floorId, name) {
      const floor = this.state.floors.find(f => f.floorId === floorId); if (!floor) fail('Unknown floor.');
      if (floor.rooms.length >= LIMITS.roomsPerFloor || this.rows().length >= LIMITS.rooms) fail('This prototype has reached its room limit.');
      const roomId = this.nextId('room-', new Set(this.rows().map(r => r.room.roomId)));
      floor.rooms.push({ roomId, name: nameOf(name), plan: roomPlan() }); this.selectRoom(floorId, roomId); return { floorId, roomId };
    }
    renameFloor(floorId, name) { const floor = this.state.floors.find(f => f.floorId === floorId); if (!floor) fail('Unknown floor.'); floor.name = nameOf(name); }
    renameRoom(floorId, roomId, name) { this.getRoom(floorId, roomId).room.name = nameOf(name); }
    renameBuilding(name) { this.state.name = nameOf(name); }
    removeRoom(floorId, roomId) {
      const { floor } = this.getRoom(floorId, roomId);
      if (floor.rooms.length === 1) fail('Keep at least one room per floor, or delete the entire floor.');
      floor.rooms = floor.rooms.filter(r => r.roomId !== roomId);
      if (this.state.active.roomId === roomId) this.selectRoom(floorId, floor.rooms[0].roomId);
    }
    removeFloor(floorId) {
      if (this.state.floors.length === 1) fail('Keep at least one floor.');
      if (!this.state.floors.some(f => f.floorId === floorId)) fail('Unknown floor.');
      this.state.floors = this.state.floors.filter(f => f.floorId !== floorId);
      if (this.state.active.floorId === floorId) { const first = this.state.floors[0]; this.selectRoom(first.floorId, first.rooms[0].roomId); }
    }
    transferEquipment({ fromFloorId, fromRoomId, instanceId, toFloorId, toRoomId }) {
      if (fromRoomId === toRoomId) fail('Choose a different destination room.');
      const source = this.getRoom(fromFloorId, fromRoomId), target = this.getRoom(toFloorId, toRoomId);
      const item = source.room.plan.layout.find(i => i.instanceId === instanceId); if (!item) fail('Unknown source equipment instance.');
      const next = copy(this.state), nextSource = next.floors.find(f => f.floorId === fromFloorId).rooms.find(r => r.roomId === fromRoomId), nextTarget = next.floors.find(f => f.floorId === toFloorId).rooms.find(r => r.roomId === toRoomId);
      const srcStore = new ClinicState.Store(), dstStore = new ClinicState.Store();
      srcStore.import(source.room.plan); dstStore.import(target.room.plan); srcStore.remove(instanceId);
      const quantities = dstStore.quantities(), row = quantities.find(q => q.productId === item.productId);
      if (row) row.quantity++; else quantities.push({ productId: item.productId, quantity: 1 });
      dstStore.updateEquipment(quantities);
      nextSource.plan = srcStore.export(); nextTarget.plan = dstStore.export();
      this.state = validate(next); return copy(nextTarget.plan);
    }
  }
  window.ClinicBuildingState = { BuildingStore, LIMITS, validate, demo, roomPlan, normalizePurchase };
})();


/* UI, pointer interaction and public integration API.
 * The catalogue, JSON input, 3D geometry and exports use the same Store.
 */
(function () {
  'use strict';
  const paths={
    logo:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" stroke="none"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',
    cube:'<path d="m12 3 9 5v8l-9 5-9-5V8l9-5zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5"/>',
    grid:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 10h18M10 3v18"/>',
    code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',undo:'<path d="M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5" transform="translate(0 -3)"/>',
    frame:'<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5"/>',move:'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
    orbit:'<ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="2"/><path d="m19 4 2 4-5-1"/>',zoom:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M10 7v6M7 10h6"/>',
    rotate:'<path d="M20 8a8 8 0 1 0 1 7M20 3v5h-5"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 4H5a1 1 0 0 0-1 1v10"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    camera:'<path d="M3 7h5l2-3h4l2 3h5v13H3z"/><circle cx="12" cy="13" r="4"/>',spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',cursor:'<path d="m4 3 5 17 4-7 7-4L4 3z"/>',
    table:'<path d="M3 10h18v5H3zM5 15v5m14-5v5M4 7h6l2 3M5 18h14"/><path d="M4 10V7"/>',
    chair:'<path d="M8 4h8v9H8zM6 13h12v4H6zM12 17v4M7 21h10M4 11v4m16-4v4"/>',
    lamp:'<path d="M3 13h18v3H3zM12 16v5M8 21h8M9 13V6h5v4H9M7 6V3h6v3M16 5v8M16 5h3v2"/>',
    stool:'<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v3c0 4 14 4 14 0V8M12 14v7M5 21l7-3 7 3"/>',
    cabinet:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 12h16M12 3v9M8 7v2m8-2v2M4 16h16M10 14h4m-4 4h4"/>',
    monitor:'<rect x="4" y="3" width="16" height="12" rx="2"/><path d="M12 15v5M7 21h10M6 9h3l2-3 2 6 2-3h3"/>'
  };
  const icon=n=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[n]||paths.cube)+'</svg>';
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  const $=id=>document.getElementById(id),store=new ClinicState.Store(),{catalogue,presets}=ClinicData;
  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const buildingMode=!!window.CLINIC_BUILDING_MODE;
  const embed=buildingMode||new URLSearchParams(location.search).has('embed');if(embed&&!buildingMode)document.body.classList.add('embed');
  let changeValidator=null,lastAcceptedPlan=null,lastRejection='';
  let selected=null,renderer=null,pointer=null,pinch=null,toastTimer=null,topView=false,saveTimer=null;
  const touchPoints=new Map(),STORAGE_KEY='clinic-exe-room-studio-v1';
  function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600);}
  function safe(fn){try{return fn();}catch(error){toast(error.message,true);refresh();return null;}}
  const getSelected=()=>store.state.instances.find(i=>i.instanceId===selected);
  const defOf=item=>catalogue.find(p=>p.id===item.productId);
  function parentMessage(type,detail={}){if(buildingMode||window.parent===window)return;const origin=location.origin==='null'?'*':location.origin;window.parent.postMessage({type,...detail},origin);}
  function persist(){if(embed)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store.export()));$('save-text').textContent='Saved on this device';}catch(_){$('save-text').textContent='Session only · export to save';}},120);}
  function notify(source){const plan=store.export();window.dispatchEvent(new CustomEvent('clinic:selection-changed',{detail:{source,selectedItems:plan.selectedItems,plan}}));parentMessage('clinic:planner:change',{source,selectedItems:plan.selectedItems,plan});}
  function changed(source='ui'){
    try { if(changeValidator)changeValidator(store.export(),source); }
    catch(error){lastRejection=error.message;if(lastAcceptedPlan){store.import(lastAcceptedPlan);store.history=[];}selected=null;refresh();toast(error.message,true);return false;}
    lastAcceptedPlan=store.export();if(!getSelected())selected=null;refresh();persist();notify(source);return true;
  }
  function drawScene(){if(!renderer)return;const conflicts=store.conflicts(),scene=ClinicModels.buildScene(store.state,selected,conflicts.ids);renderer.setScene(scene.commands,scene.lines,store.state.room);}
  function updateOverlay(){if(!renderer)return;const rect=$('stage').getBoundingClientRect();const position=(id,p)=>{const q=renderer.project(p),el=$(id);el.style.left=(q.x-rect.left)+'px';el.style.top=(q.y-rect.top)+'px';el.style.visibility=q.visible?'visible':'hidden';};const r=store.state.room;position('width-tag',[0,.01,r.depth/2+.51]);position('depth-tag',[r.width/2+.55,.01,0]);const item=getSelected();if(item){position('selected-label',[item.x,defOf(item).height+.25,item.z]);}}
  function refresh(){
    const state=store.state,items=store.quantities(),qty=Object.fromEntries(items.map(v=>[v.productId,v.quantity]));
    for(const p of catalogue){const input=$('qty-'+p.id);if(input&&document.activeElement!==input)input.value=qty[p.id]||0;const card=$('card-'+p.id);if(card)card.classList.toggle('active',!!qty[p.id]);const minus=$('minus-'+p.id),plus=$('plus-'+p.id);if(minus)minus.disabled=!qty[p.id];if(plus)plus.disabled=(qty[p.id]||0)>=8||state.instances.length>=24;}
    $('room-width').value=state.room.width;$('room-depth').value=state.room.depth;
    const area=(state.room.width*state.room.depth).toFixed(1).replace(/\.0$/,'');$('area-badge').textContent=area;$('area-summary').textContent=area+' m²';$('count-badge').textContent=state.instances.length;$('items-summary').textContent=state.instances.length+' item'+(state.instances.length===1?'':'s');
    $('width-tag').textContent=state.room.width.toFixed(1)+' m';$('depth-tag').textContent=state.room.depth.toFixed(1)+' m';
    const item=getSelected();$('selection-empty').hidden=!!item;$('selection-panel').hidden=!item;$('selected-label').hidden=!item;
    if(item){const def=defOf(item);$('selected-icon').innerHTML=icon(def.icon);$('selected-name').textContent=def.name;$('selected-label').textContent=def.name;$('selected-id').textContent=def.id+' · '+item.instanceId;$('selected-dimensions').textContent=def.width.toFixed(2)+' × '+def.depth.toFixed(2)+' m';$('position-x').value=item.x;$('position-z').value=item.z;$('rotation-value').textContent='Rotation: '+item.rotation+'°';$('duplicate-button').disabled=(qty[item.productId]||0)>=8||state.instances.length>=24;}
    const conflict=store.conflicts();$('layout-status').classList.toggle('warning',conflict.pairs.length>0);$('status-title').textContent=conflict.pairs.length?conflict.pairs.length+' footprint overlap'+(conflict.pairs.length===1?'':'s'):'No footprint overlaps';$('status-description').textContent=conflict.pairs.length?'Move the amber-outlined items apart. This is an approximate bounding-box check, not a safety assessment.':'A geometric check only. Operational clearances are not assessed.';
    $('undo-button').disabled=!store.history.length;drawScene();if(window.ClinicBuildingAfterRefresh)window.ClinicBuildingAfterRefresh();
  }
  function updateEquipment(items,source='api'){store.updateEquipment(items);$('preset').value='custom';if(!changed(source))throw new Error(lastRejection);return store.export();}
  function quantity(id,value){const items=store.quantities().filter(p=>p.productId!==id);items.push({productId:id,quantity:value});store.updateEquipment(items);$('preset').value='custom';const found=store.state.instances.filter(i=>i.productId===id);if(found.length)selected=found[found.length-1].instanceId;changed();}
  function applyPreset(name){if(!presets[name])return;store.updateEquipment(presets[name].items);selected=store.state.instances[0]?.instanceId||null;changed('preset');toast(presets[name].name+' loaded. Demo choices, not clinical recommendations.');}
  function select(id){selected=id;refresh();}
  function rotate(){if(!getSelected())return;store.rotate(selected);changed();}
  function remove(){if(!getSelected())return;const name=defOf(getSelected()).name;store.remove(selected);selected=null;$('preset').value='custom';changed();toast(name+' removed. Equipment list updated.');}
  function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('catalogue-count').textContent = catalogue.length + ' ITEMS';
  $('catalogue').innerHTML=catalogue.map(p=>'<div class="product-card" id="card-'+p.id+'"><div class="product-icon">'+icon(p.icon)+'</div><div><h3 class="product-name">'+escapeHTML(p.name)+'</h3><div class="product-meta">'+p.width.toFixed(2)+' × '+p.depth.toFixed(2)+' m · demo</div></div><div class="product-bottom"><span class="quote-tag">Quote required</span><div class="stepper"><button id="minus-'+p.id+'" aria-label="Remove one '+escapeHTML(p.name)+'">−</button><input id="qty-'+p.id+'" type="number" min="0" max="8" step="1" value="0" aria-label="'+escapeHTML(p.name)+' quantity"><button id="plus-'+p.id+'" aria-label="Add one '+escapeHTML(p.name)+'">+</button></div></div></div>').join('');
  for(const p of catalogue){const count=()=>store.state.instances.filter(i=>i.productId===p.id).length;$('minus-'+p.id).onclick=()=>safe(()=>quantity(p.id,Math.max(0,count()-1)));$('plus-'+p.id).onclick=()=>safe(()=>quantity(p.id,count()+1));$('qty-'+p.id).onchange=e=>{const value=Number(e.target.value);safe(()=>quantity(p.id,value));e.target.value=count();};$('card-'+p.id).onclick=e=>{if(e.target.closest('button,input'))return;const item=store.state.instances.find(i=>i.productId===p.id);if(item)select(item.instanceId);};}
  $('preset').onchange=e=>safe(()=>applyPreset(e.target.value));
  function applyRoom(){safe(()=>{store.setRoom(Number($('room-width').value),Number($('room-depth').value));changed();renderer?.home(topView);toast('Room dimensions updated. Equipment kept inside the room.');});}
  $('apply-room').onclick=applyRoom;for(const id of ['room-width','room-depth'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter')applyRoom();});
  $('rotate-button').onclick=rotate;$('remove-button').onclick=remove;
  $('duplicate-button').onclick=()=>safe(()=>{const item=getSelected();if(item)quantity(item.productId,store.state.instances.filter(i=>i.productId===item.productId).length+1);});
  for(const id of ['position-x','position-z'])$(id).onchange=()=>safe(()=>{if(!getSelected())return;store.move(selected,Number($('position-x').value),Number($('position-z').value));changed();});
  $('undo-button').onclick=()=>{if(store.undo()){changed('undo');toast('Last layout change undone.');}};
  $('arrange-button').onclick=()=>{store.autoArrange();changed();toast('Equipment rearranged. Check any remaining overlaps.');};
  $('export-button').onclick=()=>{download('clinic-room-layout.json',new Blob([JSON.stringify(store.export(),null,2)],{type:'application/json'}));toast('Layout exported. This does not submit a quote.');};
  $('import-button').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>500000)throw new Error('The layout file is too large. Maximum size: 500 KB.');const data=JSON.parse(await file.text());store.import(data);selected=null;$('preset').value='custom';changed('import');renderer?.home(topView);toast('Saved layout imported.');}catch(error){toast(error.message,true);}e.target.value='';};
  $('snapshot-button').onclick=()=>{if(!renderer)return;renderer.render();$('room-canvas').toBlob(blob=>{if(blob){download('clinic-room-3d.png',blob);toast('3D view saved as PNG. Export JSON to keep the editable layout.');}},'image/png');};
  $('integration-button').onclick=()=>$('integration-dialog').showModal();$('close-integration').onclick=()=>$('integration-dialog').close();
  $('apply-json').onclick=()=>safe(()=>{const items=JSON.parse($('equipment-json').value);updateEquipment(items,'integration-test');$('integration-dialog').close();toast('Equipment choices applied to the live 3D room.');});
  $('copy-api').onclick=async()=>{const text='window.ClinicPlanner.updateEquipment('+ $('equipment-json').value +');';try{await navigator.clipboard.writeText(text);toast('Integration example copied.');}catch(_){$('equipment-json').select();toast('Select and copy the equipment JSON; clipboard permission is unavailable.');}};
  function setView(top){topView=top;$('view-3d').classList.toggle('active',!top);$('view-top').classList.toggle('active',top);renderer?.home(top,true);}
  $('view-3d').onclick=()=>setView(false);$('view-top').onclick=()=>setView(true);$('fit-button').onclick=()=>renderer?.home(topView,true);
  $('zoom-in').onclick=()=>renderer?.zoomBy(Math.log(.85));$('zoom-out').onclick=()=>renderer?.zoomBy(-Math.log(.85));
  $('grid-toggle').onchange=e=>{if(renderer){renderer.showGrid=e.target.checked;renderer.requestRender();}};$('walls-toggle').onchange=e=>{if(renderer){renderer.showWalls=e.target.checked;renderer.requestRender();}};
  store.updateEquipment(presets.general.items,false);store.history=[];
  if(!embed){try{const saved=localStorage.getItem(STORAGE_KEY);if(saved){store.import(JSON.parse(saved));store.history=[];$('preset').value='custom';$('save-text').textContent='Restored from this device';}}catch(_){$('save-text').textContent='Session only · export to save';}}
  selected=store.state.instances[0]?.instanceId||null;
  try {renderer=new Clinic3D.Renderer($('room-canvas'));renderer.onRender=updateOverlay;refresh();renderer.home();if(renderer.mode==='software')document.querySelector('.live-pill').innerHTML='<span></span>3D · COMPATIBILITY';}catch(error){
    // A WebGL driver or shader error must not strand the user on a blank page.
    try {const oldCanvas=$('room-canvas'),fresh=oldCanvas.cloneNode(false);oldCanvas.replaceWith(fresh);renderer=new Clinic3D.SoftwareRenderer(fresh);renderer.onRender=updateOverlay;refresh();renderer.home();document.querySelector('.live-pill').innerHTML='<span></span>3D · COMPATIBILITY';}
    catch(fallbackError){renderer=null;$('fatal').hidden=false;$('fatal-error').textContent=fallbackError.message;refresh();}
  }
  const canvas=$('room-canvas');
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(!renderer)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);touchPoints.set(e.pointerId,[e.clientX,e.clientY]);
    renderer.stopCamera();if(touchPoints.size===2){const pts=[...touchPoints.values()];pinch={length:Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]),distance:renderer.distance};pointer=null;return;}
    const hit=e.button===0&&!e.altKey?renderer.pick(e.clientX,e.clientY,store.state.instances,catalogue):null;
    if(hit){selected=hit.instanceId;const point=renderer.floorPoint(e.clientX,e.clientY);pointer={id:e.pointerId,type:'item',startX:e.clientX,startY:e.clientY,offset:point?[hit.x-point[0],hit.z-point[2]]:[0,0],remembered:false};refresh();}
    else {if(e.button===0)selected=null;pointer={id:e.pointerId,type:(e.button===2||e.shiftKey)?'pan':'orbit',x:e.clientX,y:e.clientY};refresh();}canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',e=>{
    if(!renderer)return;
    if(touchPoints.has(e.pointerId))touchPoints.set(e.pointerId,[e.clientX,e.clientY]);
    if(pinch&&touchPoints.size===2){const pts=[...touchPoints.values()],length=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);renderer.distance=Math.max(3,Math.min(60,pinch.distance*pinch.length/Math.max(length,1)));renderer.requestRender();return;}
    if(!pointer||pointer.id!==e.pointerId)return;
    if(pointer.type==='item'){
      const item=getSelected(),point=renderer.floorPoint(e.clientX,e.clientY);if(!item||!point)return;if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)<3&&!pointer.remembered)return;
      if(!pointer.remembered){store.remember();pointer.remembered=true;}
      const snap=v=>$('snap-toggle').checked?Math.round(v*10)/10:v;
      store.move(selected,snap(point[0]+pointer.offset[0]),snap(point[2]+pointer.offset[1]),false);refresh();
    } else if(pointer.type==='orbit') {
      const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;renderer.orbitBy(-dx*.008,dy*.006);pointer.x=e.clientX;pointer.y=e.clientY;topView=false;$('view-3d').classList.add('active');$('view-top').classList.remove('active');
    } else {const a=renderer.floorPoint(pointer.x,pointer.y),b=renderer.floorPoint(e.clientX,e.clientY);if(a&&b)renderer.panBy(a[0]-b[0],a[2]-b[2]);pointer.x=e.clientX;pointer.y=e.clientY;}
  });
  function pointerUp(e){touchPoints.delete(e.pointerId);if(pointer?.remembered)changed('drag');if(pointer?.id===e.pointerId)pointer=null;if(touchPoints.size<2)pinch=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
  canvas.addEventListener('wheel',e=>{if(!renderer)return;e.preventDefault();renderer.zoomBy(e.deltaY*.001);},{passive:false});
  canvas.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'){e.preventDefault();rotate();}else if(['Delete','Backspace'].includes(e.key)){e.preventDefault();remove();}else if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();$('undo-button').click();}else if(getSelected()&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const i=getSelected(),step=e.shiftKey?.5:.1;store.move(selected,i.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),i.z+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0));changed('keyboard');}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('fatal').hidden=false;$('fatal-error').textContent='The graphics context was lost. Export your layout, then refresh the page.';});
  const api={
    version:'2.0.0',
    setChangeValidator:fn=>{if(typeof fn!=='function')throw new Error('Validator must be a function.');changeValidator=fn;lastAcceptedPlan=store.export();},
    restoreRoom:data=>{store.import(data);store.history=[];selected=null;pointer=null;pinch=null;touchPoints.clear();lastAcceptedPlan=store.export();$('preset').value='custom';refresh();renderer?.home(topView);return store.export();},
    refreshView:()=>refresh(),
    getSelectedInstanceId:()=>selected,
    updateEquipment:items=>updateEquipment(items,'api'),
    setRoom:room=>{store.setRoom(room.width,room.depth);changed('api');renderer?.home(topView);return store.export();},
    getState:()=>store.export(),
    getCatalogue:()=>JSON.parse(JSON.stringify(catalogue)),
    importLayout:data=>{store.import(data);selected=null;changed('api-import');renderer?.home(topView);return store.export();},
    selectEquipment:id=>{if(!store.state.instances.some(i=>i.instanceId===id))throw new Error('Unknown equipment instance.');select(id);},
    getScreenPosition:id=>{const i=store.state.instances.find(x=>x.instanceId===id);if(!i||!renderer)return null;return renderer.project([i.x,Math.min(defOf(i).height*.65,.85),i.z]);},
    getDiagnostics:()=>({rendering:!!renderer,rendererMode:renderer?.mode||null,webgl:renderer?.gl?renderer.gl.getParameter(renderer.gl.VERSION):null,instances:store.state.instances.length,geometryParts:renderer?.commands.length||0,overlapPairs:store.conflicts().pairs.length,externalDependencies:0})
  };
  window.ClinicPlanner=Object.freeze(api);
  window.updateRoom=api.updateEquipment;
  window.addEventListener('message',event=>{
    if(buildingMode||event.source!==window.parent||window.parent===window)return;
    const sameOrigin=event.origin===location.origin,localFile=location.protocol==='file:'&&event.origin==='null';if(!sameOrigin&&!localFile)return;
    if(!event.data||event.data.type!=='clinic:equipment:update')return;
    try{updateEquipment(event.data.items,'parent');parentMessage('clinic:planner:updated',{requestId:event.data.requestId||null,plan:store.export()});}
    catch(error){parentMessage('clinic:planner:error',{requestId:event.data.requestId||null,error:error.message});toast(error.message,true);}
  });
  if(!buildingMode)window.addEventListener('clinic:equipment-update',event=>safe(()=>updateEquipment(event.detail?.items,'event')));
  parentMessage('clinic:planner:ready',{version:api.version});
  window.dispatchEvent(new CustomEvent('clinic:planner-ready',{detail:{version:api.version}}));
  persist();
})();


/* Building controller. The existing 3D viewer renders ONE active room.
 * This module saves every accepted room change and routes scoped API updates. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), planner = window.ClinicPlanner;
  const { BuildingStore, LIMITS } = ClinicBuildingState;
  const STORAGE_KEY = 'clinic-exe-building-studio-v1';
  const model = new BuildingStore(); let hydrating = false, toastTimer, nameAction = null, restored = false;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(text, error = false) { $('building-toast').textContent = text; $('building-toast').className = 'building-toast show' + (error ? ' error' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('building-toast').classList.remove('show'), 5500); }
  function safe(fn) { try { return fn(); } catch (error) { toast(error.message, true); render(); return null; } }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(model.export())); $('save-text').textContent = 'Building saved on this device'; } catch (_) { $('save-text').textContent = 'Session only · export to save'; } }
  function post(type, extra = {}) { if (window.parent === window) return; const target = location.origin === 'null' ? '*' : location.origin; parent.postMessage({ type, ...extra }, target); }
  function publish(source) { const detail = { source, active: { ...model.state.active }, summary: model.summary(), building: model.export() }; window.dispatchEvent(new CustomEvent('clinic:building-changed', { detail })); post('clinic:building:changed', detail); }
  function accepted(source) { render(); save(); publish(source); }
  function loadActive() {
    hydrating = true;
    try { planner.restoreRoom(model.getRoom().room.plan); } finally { hydrating = false; }
    render();
  }
  function chooseRoom(floorId, roomId) { model.selectRoom(floorId, roomId); loadActive(); accepted('select-room'); return model.export(); }
  planner.setChangeValidator(plan => {
    const { floorId, roomId } = model.state.active;
    model.validateRoomPlan(floorId, roomId, plan);
  });
  window.addEventListener('clinic:selection-changed', event => {
    if (hydrating) return;
    const { floorId, roomId } = model.state.active;
    model.commitRoomPlan(floorId, roomId, event.detail.plan);
    accepted('room:' + event.detail.source);
  });
  function inventoryRefresh() {
    for (const row of model.inventory()) {
      const input = $('purchase-' + row.productId); if (input && document.activeElement !== input) input.value = row.selected;
      const label = $('stock-' + row.productId); if (label) label.textContent = row.placed + ' placed in building · ' + row.unplaced + ' unplaced';
      const minus = $('purchase-minus-' + row.productId); if (minus) minus.disabled = row.selected <= row.placed;
      const plus = $('purchase-plus-' + row.productId); if (plus) plus.disabled = row.selected >= LIMITS.purchasePerProduct || model.summary().selected >= LIMITS.purchased;
      const add = $('plus-' + row.productId);
      if (add && row.unplaced <= 0) { add.disabled = true; add.title = 'Increase Purchase total to make another item available.'; } else if (add) add.title = 'Place one available item in this room';
    }
    const selectedId = planner.getSelectedInstanceId(), item = planner.getState().layout.find(i => i.instanceId === selectedId);
    if (item) {
      const stock = model.inventory().find(r => r.productId === item.productId);
      if (stock?.unplaced <= 0) $('duplicate-button').disabled = true;
    }
  }
  window.ClinicBuildingAfterRefresh = inventoryRefresh;
  function render() {
    const { floor, room } = model.getRoom(), s = model.summary();
    $('building-name').textContent = model.state.name;
    $('floor-select').replaceChildren(...model.state.floors.map(f => new Option(f.name, f.floorId)));
    $('floor-select').value = floor.floorId;
    $('room-select').replaceChildren(...floor.rooms.map(r => new Option(r.name, r.roomId)));
    $('room-select').value = room.roomId;
    $('building-summary').textContent = s.floors + ' floors · ' + s.rooms + ' rooms';
    $('purchase-count').textContent = s.selected; $('placed-count').textContent = s.placed; $('unplaced-count').textContent = s.unplaced;
    document.querySelector('.scene-heading h1').textContent = room.name;
    document.querySelector('.scene-heading p').textContent = floor.name + ' · ' + room.roomId + ' · only this room is being edited';
    $('scope-label').textContent = floor.name + ' / ' + room.name;
    $('room-context-note').textContent = 'In room = ' + room.name + '. Purchase total applies to the whole building.';
    $('add-floor').disabled = s.floors >= LIMITS.floors || s.rooms >= LIMITS.rooms;
    $('add-room').disabled = floor.rooms.length >= LIMITS.roomsPerFloor || s.rooms >= LIMITS.rooms;
    inventoryRefresh();
    if ($('overview-dialog').open) renderOverview();
  }
  for (const p of ClinicData.catalogue) {
    const bottom = $('card-' + p.id).querySelector('.product-bottom');
    bottom.querySelector('.quote-tag').textContent = 'In this room';
    const row = document.createElement('div'); row.className = 'purchase-row';
    row.innerHTML = '<span>Purchase total</span><div class="stepper"><button id="purchase-minus-' + p.id + '" aria-label="Decrease purchase quantity for ' + esc(p.name) + '">−</button><input id="purchase-' + p.id + '" type="number" min="0" max="192" step="1" aria-label="Building purchase quantity for ' + esc(p.name) + '"><button id="purchase-plus-' + p.id + '" aria-label="Increase purchase quantity for ' + esc(p.name) + '">+</button></div>';
    const stock = document.createElement('div'); stock.className = 'stock-note'; stock.id = 'stock-' + p.id;
    $('card-' + p.id).append(row, stock);
    const current = () => model.inventory().find(r => r.productId === p.id);
    function setQuantity(n) { const previous = current().selected; model.setPurchaseQuantity(p.id, n); accepted('purchase'); planner.refreshView(); if (previous !== n) toast('Purchase quantity updated. Room placements have not changed.'); }
    $('purchase-minus-' + p.id).onclick = () => safe(() => setQuantity(current().selected - 1));
    $('purchase-plus-' + p.id).onclick = () => safe(() => setQuantity(current().selected + 1));
    $('purchase-' + p.id).onchange = event => { safe(() => setQuantity(Number(event.target.value))); event.target.value = current().selected; };
  }
  function nameDialog(title, value, action) {
    nameAction = action; $('name-title').textContent = title; $('name-input').value = value; $('name-error').textContent = '';
    $('name-dialog').showModal(); $('name-input').focus(); $('name-input').select();
  }
  $('name-form').onsubmit = event => { event.preventDefault(); try { nameAction($('name-input').value); $('name-dialog').close(); loadActive(); accepted('structure'); } catch (error) { $('name-error').textContent = error.message; } };
  $('name-cancel').onclick = () => $('name-dialog').close();
  $('floor-select').onchange = event => safe(() => { const floor = model.state.floors.find(f => f.floorId === event.target.value); chooseRoom(floor.floorId, floor.rooms[0].roomId); });
  $('room-select').onchange = event => safe(() => chooseRoom(model.state.active.floorId, event.target.value));
  $('add-floor').onclick = () => nameDialog('Add a floor', 'New floor', name => model.addFloor(name));
  $('add-room').onclick = () => nameDialog('Add a room', 'New examination room', name => model.addRoom(model.state.active.floorId, name));
  $('edit-building-name').onclick = () => nameDialog('Rename building', model.state.name, name => model.renameBuilding(name));
  $('rename-floor').onclick = () => nameDialog('Rename floor', model.getRoom().floor.name, name => model.renameFloor(model.state.active.floorId, name));
  $('rename-room').onclick = () => nameDialog('Rename room', model.getRoom().room.name, name => model.renameRoom(model.state.active.floorId, model.state.active.roomId, name));
  document.querySelector('.room-menu').addEventListener('click', event => { if (event.target.closest('button')) document.querySelector('.room-menu').open = false; });
  $('delete-room').onclick = () => safe(() => { const { floor, room } = model.getRoom(); if (!confirm('Delete ' + room.name + '? Its equipment becomes unplaced. Purchase quantities stay unchanged.')) return; model.removeRoom(floor.floorId, room.roomId); loadActive(); accepted('delete-room'); });
  $('delete-floor').onclick = () => safe(() => { const { floor } = model.getRoom(); if (!confirm('Delete ' + floor.name + ' and its ' + floor.rooms.length + ' room(s)? Equipment becomes unplaced; purchase quantities stay unchanged.')) return; model.removeFloor(floor.floorId); loadActive(); accepted('delete-floor'); });
  function renderOverview() {
    const s = model.summary();
    $('overview-totals').textContent = s.selected + ' selected for purchase · ' + s.placed + ' placed · ' + s.unplaced + ' not yet placed';
    $('floor-cards').innerHTML = model.state.floors.map(f => '<section class="floor-card"><h3>' + esc(f.name) + '<span>' + f.rooms.length + ' room' + (f.rooms.length === 1 ? '' : 's') + '</span></h3><div class="room-card-grid">' + f.rooms.map(r => '<button class="room-card' + (r.roomId === model.state.active.roomId ? ' current' : '') + '" data-floor="' + f.floorId + '" data-room="' + r.roomId + '"><strong>' + esc(r.name) + '</strong><span>' + r.plan.room.width + ' × ' + r.plan.room.depth + ' m · ' + r.plan.layout.length + ' items</span><small>' + esc(r.roomId) + ' → Edit room</small></button>').join('') + '</div></section>').join('');
    $('inventory-body').innerHTML = model.inventory().filter(r => r.selected || r.placed).map(r => '<tr><th>' + esc(r.name) + '</th><td>' + r.selected + '</td><td>' + r.placed + '</td><td>' + r.unplaced + '</td></tr>').join('') || '<tr><td colspan="4">No equipment selected.</td></tr>';
  }
  $('overview-button').onclick = () => { renderOverview(); $('overview-dialog').showModal(); };
  $('overview-close').onclick = () => $('overview-dialog').close();
  $('floor-cards').onclick = event => { const button = event.target.closest('[data-room]'); if (!button) return; safe(() => chooseRoom(button.dataset.floor, button.dataset.room)); $('overview-dialog').close(); };
  $('move-room-button').onclick = () => {
    const plan = planner.getState(), selected = planner.getSelectedInstanceId();
    if (!selected || !plan.layout.some(i => i.instanceId === selected)) return toast('First click the equipment you want to move in the 3D view.', true);
    const targets = model.rows().filter(r => r.room.roomId !== model.state.active.roomId);
    if (!targets.length) return toast('Create another room first.', true);
    $('move-target').replaceChildren(...targets.map(({ floor, room }) => new Option(floor.name + ' → ' + room.name, floor.floorId + '/' + room.roomId)));
    $('move-error').textContent = ''; $('move-dialog').showModal();
  };
  $('move-cancel').onclick = () => $('move-dialog').close();
  $('move-form').onsubmit = event => { event.preventDefault(); try {
    const [toFloorId, toRoomId] = $('move-target').value.split('/');
    const { floorId, roomId } = model.state.active;
    model.transferEquipment({ fromFloorId: floorId, fromRoomId: roomId, instanceId: planner.getSelectedInstanceId(), toFloorId, toRoomId });
    $('move-dialog').close(); loadActive(); accepted('transfer'); toast('Moved to the destination room. Purchase total is unchanged.');
  } catch (error) { $('move-error').textContent = error.message; } };
  function download(name, text, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('export-button').onclick = () => { download('clinic-building.json', JSON.stringify(model.export(), null, 2)); toast('All floors, rooms and purchase quantities exported. This does not submit a quote.'); };
  $('import-button').onclick = () => $('building-file').click();
  $('building-file').onchange = async event => { const file = event.target.files[0]; if (!file) return; try {
    if (file.size > 2000000) throw new Error('Maximum building file size: 2 MB.');
    const data = JSON.parse(await file.text());
    const checked = ClinicBuildingState.validate(data);
    if (!confirm('Replace the current building with this file? Export the current building first to keep a separate copy.')) return;
    model.import(checked); loadActive(); accepted('import'); toast('Building imported. All rooms restored.');
  } catch (error) { toast(error.message, true); } finally { event.target.value = ''; } };
  $('quote-summary-button').onclick = () => {
    const b = model.export(), lines = ['CLINIC.EXE — EQUIPMENT REQUEST DRAFT', b.name, '', 'Not submitted. No prices or customer contact information included.', 'Illustrative equipment. Supplier review required.', '', 'BUILDING PURCHASE SELECTION'];
    for (const item of model.inventory().filter(r => r.selected)) lines.push(item.name + ' | ' + item.productId + ' | quantity ' + item.selected + ' | placed ' + item.placed + ' | unplaced ' + item.unplaced);
    lines.push('', 'ROOM ALLOCATION');
    for (const { floor, room } of model.rows()) { lines.push('', floor.name + ' / ' + room.name + ' [' + room.roomId + ']'); for (const item of room.plan.selectedItems) lines.push('  ' + item.productId + ' × ' + item.quantity); if (!room.plan.layout.length) lines.push('  No equipment placed.'); }
    download('clinic-equipment-request-draft.txt', lines.join('\n'), 'text/plain');
    toast('Request summary exported as a draft, not emailed or submitted.');
  };
  $('reset-building').onclick = () => { if (!confirm('Replace this building with the demonstration? Export first to keep your work.')) return; model.import(ClinicBuildingState.demo()); loadActive(); accepted('reset'); };
  const api = Object.freeze({
    version: '2.0.0',
    getState: () => model.export(),
    getCatalogue: () => planner.getCatalogue(),
    getInventory: () => model.inventory(),
    getDiagnostics: () => ({ ...planner.getDiagnostics(), ...model.summary(), active: { ...model.state.active } }),
    selectRoom: ({ floorId, roomId }) => chooseRoom(floorId, roomId),
    setPurchaseSelection: items => { model.setPurchaseSelection(items); planner.refreshView(); accepted('api-purchase'); return model.export(); },
    updateRoomEquipment: input => { const plan = model.updateRoomEquipment(input); if (input.floorId === model.state.active.floorId && input.roomId === model.state.active.roomId) loadActive(); accepted('api-room'); return plan; },
    addFloor: ({ name }) => { const result = model.addFloor(name); loadActive(); accepted('api-floor'); return result; },
    addRoom: ({ floorId, name }) => { const result = model.addRoom(floorId, name); loadActive(); accepted('api-new-room'); return result; },
    transferEquipment: input => { const result = model.transferEquipment(input); loadActive(); accepted('api-transfer'); return result; },
    importBuilding: data => { model.import(data); loadActive(); accepted('api-import'); return model.export(); }
  });
  window.ClinicBuilding = api;
  $('integration-button').onclick = () => { const a = model.state.active; $('building-api-json').value = JSON.stringify({ floorId: a.floorId, roomId: a.roomId, items: model.getRoom().room.plan.selectedItems }, null, 2); $('api-result').textContent = ''; $('building-api-dialog').showModal(); };
  $('building-api-close').onclick = () => $('building-api-dialog').close();
  $('building-api-apply').onclick = () => { try { const input = JSON.parse($('building-api-json').value); api.updateRoomEquipment(input); $('api-result').textContent = 'Applied to ' + input.floorId + ' / ' + input.roomId + '. Other rooms unchanged.'; $('api-result').className = 'success-text'; } catch (error) { $('api-result').textContent = error.message; $('api-result').className = 'error-text'; } };
  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== parent) return;
    const allowed = event.origin === location.origin || (location.protocol === 'file:' && event.origin === 'null');
    if (!allowed || event.data?.type !== 'clinic:building:command') return;
    const { action, payload, requestId } = event.data;
    const commands = ['getState','getCatalogue','getInventory','selectRoom','setPurchaseSelection','updateRoomEquipment','transferEquipment'];
    try { if (!commands.includes(action)) throw new Error('Unsupported building command.'); const result = api[action](payload); post('clinic:building:response', { requestId: typeof requestId === 'string' ? requestId.slice(0,120) : null, ok: true, result }); }
    catch (error) { post('clinic:building:response', { requestId: typeof requestId === 'string' ? requestId.slice(0,120) : null, ok: false, error: error.message }); }
  });
  // Browser local storage is best-effort. Export JSON for a portable backup.
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) { /* Storage may be blocked; exporting still works. */ }
  if (saved) { try { model.import(JSON.parse(saved)); restored = true; } catch (_) { toast('The saved building could not be restored. Use an exported JSON backup; a demo is shown for now.', true); } }
  loadActive(); save();
  if (restored) toast('Building restored from this browser.');
  post('clinic:building:ready', { version: api.version, active: { ...model.state.active } });
  window.dispatchEvent(new CustomEvent('clinic:building-ready', { detail: { version: api.version } }));
})();
