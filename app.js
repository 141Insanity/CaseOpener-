(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const OPEN_COST=2.69,FEE=.15,ST_CHANCE=.10,wearNames=['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred'];
const RC={'Mil-Spec':'#4b69ff','Restricted':'#8847ff','Classified':'#d32ce6','Covert':'#eb4b4b','Special':'#e4ae39'};
const price=(normal,st)=>({normal,st});
const skins=[
 {name:'Dual Berettas | Hideout',rarity:'Mil-Spec',min:0,max:.70,p:price([.47,.18,.09,.09,.08],[.50,.25,.14,.16,.11])},
 {name:'MAC-10 | Light Box',rarity:'Mil-Spec',min:0,max:1,p:price([1.23,.23,.11,.08,.08],[2.61,.38,.16,.11,.14])},
 {name:'Nova | Dark Sigil',rarity:'Mil-Spec',min:0,max:.70,p:price([.47,.15,.08,.10,.10],[.45,.23,.12,.10,.12])},
 {name:'SSG 08 | Dezastre',rarity:'Mil-Spec',min:0,max:1,p:price([.86,.20,.10,.07,.06],[1.59,.20,.13,.11,.09])},
 {name:'Tec-9 | Slag',rarity:'Mil-Spec',min:0,max:.90,p:price([.80,.18,.09,.07,.12],[1.10,.26,.12,.14,.09])},
 {name:'UMP-45 | Motorized',rarity:'Mil-Spec',min:0,max:.80,p:price([.54,.18,.09,.05,.08],[.76,.25,.14,.17,.14])},
 {name:'XM1014 | Irezumi',rarity:'Mil-Spec',min:0,max:1,p:price([.48,.17,.08,.08,.08],[.85,.25,.12,.14,.09])},
 {name:'Glock-18 | Block-18',rarity:'Restricted',min:0,max:.671875,p:price([2.44,1.19,.66,.67,.61],[5.79,3.30,1.46,1.56,1.26])},
 {name:'M4A4 | Etch Lord',rarity:'Restricted',min:0,max:1,p:price([6.90,1.26,.56,.54,.56],[9.40,3.10,1.24,1,1])},
 {name:'Five-SeveN | Hybrid',rarity:'Restricted',min:0,max:1,p:price([4.20,1.35,.52,.53,.53],[5.68,1.96,.96,.85,.89])},
 {name:'MP7 | Just Smile',rarity:'Restricted',min:0,max:1,p:price([7,1.26,.54,.49,.46],[6.87,2.18,1.15,1.01,.83])},
 {name:'Sawed-Off | Analog Input',rarity:'Restricted',min:0,max:1,p:price([1.63,.77,.51,.51,.53],[2.73,1.84,.99,.94,.87])},
 {name:'M4A1-S | Black Lotus',rarity:'Classified',min:0,max:.70,p:price([17.61,8.70,5.45,5.35,5.24],[58.22,25,15.10,15.21,13.89])},
 {name:'Zeus x27 | Olympus',rarity:'Classified',min:0,max:1,p:price([10.13,6.55,4.20,4.03,4.57],[21.99,11.64,5.83,6.48,6.32])},
 {name:'USP-S | Jawbreaker',rarity:'Classified',min:0,max:1,p:price([25.83,8.37,4.44,4.35,3.61],[69.84,28.53,11.97,7.74,7.62])},
 {name:'AWP | Chrome Cannon',rarity:'Covert',min:0,max:1,p:price([95.21,47.50,26.52,32,30.70],[186,81.01,51,34.76,28.98])},
 {name:'AK-47 | Inheritance',rarity:'Covert',min:0,max:.80,p:price([154.25,78.80,49.08,47.55,38.51],[230,183.30,94.20,50.80,85])}
];
const knives=[
 {name:'★ Kukri Knife | Vanilla',min:.06,max:.80,base:95},{name:'★ Kukri Knife | Fade',min:0,max:.08,base:182},{name:'★ Kukri Knife | Slaughter',min:.01,max:.26,base:130},{name:'★ Kukri Knife | Case Hardened',min:0,max:1,base:92,pattern:true},{name:'★ Kukri Knife | Crimson Web',min:.06,max:.80,base:78,pattern:true},{name:'★ Kukri Knife | Blue Steel',min:0,max:1,base:68},{name:'★ Kukri Knife | Stained',min:0,max:1,base:56},{name:'★ Kukri Knife | Night Stripe',min:.06,max:.80,base:48},{name:'★ Kukri Knife | Urban Masked',min:.06,max:.80,base:47},{name:'★ Kukri Knife | Scorched',min:.06,max:.80,base:44},{name:'★ Kukri Knife | Forest DDPAT',min:.06,max:.80,base:43},{name:'★ Kukri Knife | Boreal Forest',min:.06,max:.80,base:42},{name:'★ Kukri Knife | Safari Mesh',min:.06,max:.80,base:41}
].map(k=>({...k,rarity:'Special'}));
const allDefs=[...skins,...knives];
let images={},caseImage='';
const defaultState={balance:500,inventory:[],opened:0,spent:0,soldNet:0,golds:0,stCount:0,history:[]};
let state=structuredClone(defaultState),rolling=false,rollTimer=null,pendingReveal=null,tradeSelected=new Set(),viewerURL='',audioCtx=null,tickTimers=[];
let storageReady=false;
function save(){
  if(storageReady&&window.CaseLabStorage){
    window.CaseLabStorage.saveState(state).catch(e=>console.warn('IndexedDB save failed',e));
  }
  render();
}
function ensureAudio(){try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume()}catch(e){}}
function blip(freq=700,dur=.025,gain=.025){if(!audioCtx)return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}catch(e){}}
function scheduleRollTicks(duration=5200){tickTimers.forEach(clearTimeout);tickTimers=[];ensureAudio();let t=90,i=0;while(t<duration-180&&i<42){const delay=t;tickTimers.push(setTimeout(()=>blip(620+Math.random()*90,.018,.018),delay));const p=t/duration;t+=75+Math.pow(p,2.2)*270;i++}}
function revealSound(r){ensureAudio();const seq=r==='Special'?[520,660,880,1100]:r==='Covert'?[440,620,820]:r==='Classified'?[420,560,700]:[420,500];seq.forEach((f,i)=>setTimeout(()=>blip(f,.10,.035),i*95))}
function money(n){return '$'+Number(n||0).toFixed(2)}
function wearIndex(f){return f<.07?0:f<.15?1:f<.38?2:f<.45?3:4}
function wearBounds(i){return [[0,.07],[.07,.15],[.15,.38],[.38,.45],[.45,1]][i]}
function rollRarity(){let r=Math.random()*100;if(r<79.92)return'Mil-Spec';if(r<95.90)return'Restricted';if(r<99.10)return'Classified';if(r<99.74)return'Covert';return'Special'}
function estimate(s,float,st){if(s.rarity==='Special'){let q=1-((float-s.min)/(s.max-s.min||1)),v=s.base*(.88+q*.24);if(st)v*=1.45;return Math.max(1,v)}const wi=wearIndex(float),arr=st?s.p.st:s.p.normal,base=arr[wi]??arr.find(x=>x!=null)??.03,[lo,hi]=wearBounds(wi),validLo=Math.max(lo,s.min),validHi=Math.min(hi,s.max),pos=(float-validLo)/Math.max(.000001,validHi-validLo),strength=[.22,.10,.07,.05,.09][wi];return Math.max(.03,base*(1+strength*(.5-pos)))}
function rarityColor(r){return RC[r]||'#aaa'}
function imageFor(name){return images[name]||''}
function normName(n){return String(n||'').replace('★ ','★ ').replace(' | Vanilla','').trim()}
async function loadImages(){
 try{
  const res=await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json',{cache:'force-cache'});if(!res.ok)throw new Error('api');const crates=await res.json();const k=crates.find(x=>x.name==='Kilowatt Case');if(!k)throw new Error('case');
  caseImage=k.image||'';
  [...(k.contains||[]),...(k.contains_rare||[])].forEach(x=>{if(x&&x.name&&x.image){images[x.name]=x.image;images[normName(x.name)]=x.image}});
  // Rare entries may be generic or variant names. Add any exact compatible names from skins endpoint only if needed.
  const missing=allDefs.filter(x=>!imageFor(x.name));
  if(missing.length){
    const sres=await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json',{cache:'force-cache'});if(sres.ok){const list=await sres.json();for(const d of missing){let needle=d.name.replace('★ ','');let hit=list.find(x=>x.name===d.name||x.name===needle);if(hit?.image)images[d.name]=hit.image}}
  }
  if(caseImage)$('#caseArtWrap').innerHTML=`<img class="case-img" src="${caseImage}" alt="Kilowatt Case">`;
  render();
 }catch(e){console.warn('CS2 image API unavailable',e);toast('Weapon image CDN unavailable; using fallbacks')}
}
function openOne(charge=true){
 if(charge&&state.balance<OPEN_COST){toast('Not enough balance');return null}
 if(charge){state.balance-=OPEN_COST;state.spent+=OPEN_COST;state.opened++}
 const rarity=rollRarity(),pool=rarity==='Special'?knives:skins.filter(x=>x.rarity===rarity),s=pool[Math.floor(Math.random()*pool.length)],float=s.min+Math.random()*(s.max-s.min),st=Math.random()<ST_CHANCE,pattern=Math.floor(Math.random()*1000),wi=wearIndex(float),value=estimate(s,float,st);
 const item={id:crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random(),name:s.name,rarity,float,wear:wearNames[wi],st,pattern,value,ts:Date.now(),patternSensitive:!!s.pattern};
 state.inventory.unshift(item);if(rarity==='Special')state.golds++;if(st)state.stCount++;state.history.unshift({name:item.name,rarity,value,wear:item.wear,ts:item.ts});state.history=state.history.slice(0,50);save();return item;
}
function randomVisualItem(){const r=rollRarity(),pool=r==='Special'?knives:skins.filter(x=>x.rarity===r),d=pool[Math.floor(Math.random()*pool.length)];return {name:d.name,rarity:d.rarity}}
function cardHTML(x){const img=imageFor(x.name),fallback=x.rarity==='Special'?'🔪':'🔫';return `<div class="roll-card" style="--rar:${rarityColor(x.rarity)}">${img?`<img src="${img}" alt="">`:`<div style="height:88px;display:grid;place-items:center;font-size:34px">${fallback}</div>`}<div class="tiny-name">${x.name.replace('★ ','')}</div></div>`}
function finishRollNow(){if(!rolling)return;tickTimers.forEach(clearTimeout);tickTimers=[];clearTimeout(rollTimer);rollTimer=null;rolling=false;$('#rollTrack').style.transition='none';const shell=$('#rollShell');$('#openBtn').disabled=false;$('#rollStatus').textContent='Opened';const item=pendingReveal;pendingReveal=null;setTimeout(()=>{shell.classList.remove('show');showReveal(item)},120)}
function animateOpen(item){
 rolling=true;pendingReveal=item;$('#openBtn').disabled=true;$('#rollShell').classList.add('show');$('#rollStatus').textContent='Opening Kilowatt Case…';
 const count=42,winIndex=35,arr=[];for(let i=0;i<count;i++)arr.push(randomVisualItem());arr[winIndex]={name:item.name,rarity:item.rarity};
 const track=$('#rollTrack');track.style.transition='none';track.style.transform='translate3d(0,0,0)';track.innerHTML=arr.map(cardHTML).join('');void track.offsetWidth;
 const first=track.children[0],cardW=first?first.getBoundingClientRect().width:132,gap=parseFloat(getComputedStyle(track).gap)||8,windowW=$('#rollWindow').getBoundingClientRect().width,randomInside=(Math.random()-.5)*cardW*.52;
 const target=(winIndex*(cardW+gap)+cardW/2)-(windowW/2)+randomInside;
 const duration=5200;scheduleRollTicks(duration);requestAnimationFrame(()=>{track.style.transition=`transform ${duration}ms cubic-bezier(.08,.62,.08,1)`;track.style.transform=`translate3d(${-target}px,0,0)`});
 rollTimer=setTimeout(finishRollNow,duration+120);
}
function showReveal(item){if(!item)return;const sheet=$('#modal .sheet');if(sheet)sheet.scrollTop=0;revealSound(item.rarity);const net=item.value*(1-FEE),profit=net-OPEN_COST,img=imageFor(item.name),fallback=item.rarity==='Special'?'🔪':'🔫';$('#reveal').style.setProperty('--rar',rarityColor(item.rarity));$('#reveal').innerHTML=`<div class="reveal-art spark">${img?`<img src="${img}" alt="${item.name}">`:`<div style="font-size:76px">${fallback}</div>`}</div><div class="eyebrow" style="margin-top:12px">${item.st?'StatTrak™ · ':''}${item.rarity}</div><h2>${item.name}</h2><div class="finish">${item.wear}</div><div class="detailgrid"><div class="detail"><small>Float</small><b>${item.float.toFixed(8)}</b></div><div class="detail"><small>Pattern seed</small><b>#${item.pattern}</b></div><div class="detail"><small>Estimated Steam value</small><b>${money(item.value)}</b></div><div class="detail"><small>Steam net if sold</small><b>${money(net)}</b></div></div><div class="money ${profit>=0?'good':'bad'}">${profit>=0?'+':''}${money(profit)}</div><div class="note">vs. this $${OPEN_COST.toFixed(2)} opening · CaseLab stores the exact rolled float and pattern. The exact float and pattern are preserved for trade-ups and 3D inspection. The embedded viewer shell uses a true-to-game external renderer rather than faking wear.</div><div class="actions" style="margin-top:14px"><button class="secondary" id="keepBtn">KEEP</button><button class="openbtn" style="margin:0" id="sellReveal">SELL · ${money(net)}</button><button class="inspectLaunch" id="inspect3D">INSPECT 3D</button></div>`;$('#modal').classList.add('show');$('#keepBtn').onclick=()=>$('#modal').classList.remove('show');$('#sellReveal').onclick=()=>{sellItem(item.id);$('#modal').classList.remove('show')};$('#inspect3D').onclick=()=>openExact3D(item);}
function skinshotterURL(item){
 const raw=item.name.replace('★ ','');const [weapon,finishRaw='']=raw.split(' | ');const slug=x=>x.toLowerCase().replace(/™/g,'').replace(/x27/g,'x27').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const categoryMap={'Dual Berettas':'pistols','Glock-18':'pistols','Five-SeveN':'pistols','Tec-9':'pistols','USP-S':'pistols','Zeus x27':'pistols','MAC-10':'smgs','UMP-45':'smgs','MP7':'smgs','Nova':'heavy','XM1014':'heavy','Sawed-Off':'heavy','SSG 08':'rifles','M4A4':'rifles','M4A1-S':'rifles','AWP':'rifles','AK-47':'rifles','Kukri Knife':'knives'};
 const weapPath=weapon==='Kukri Knife'?'kukri':slug(weapon);const cat=categoryMap[weapon]||'rifles';let finish=slug(finishRaw||'vanilla');
 return `https://skinshotter.com/${cat}/${weapPath}/${finish}`;
}
function nextRarity(r){return {'Mil-Spec':'Restricted','Restricted':'Classified','Classified':'Covert','Covert':'Special'}[r]||null}
function collectionHasGoldPool(){return knives.length>0}
function tradeRequiredCount(rarity){return rarity==='Covert'?5:10}
function tradeEligible(item){if(item.rarity==='Covert')return collectionHasGoldPool();return !!nextRarity(item.rarity)&&item.rarity!=='Special'}
function tradeOutputDefs(){if(!tradeSelected.size)return[];const first=state.inventory.find(x=>tradeSelected.has(x.id));if(!first)return[];if(first.rarity==='Covert')return collectionHasGoldPool()?knives:[];const nr=nextRarity(first.rarity);return skins.filter(x=>x.rarity===nr)}
function tradeAvgFloat(){const arr=state.inventory.filter(x=>tradeSelected.has(x.id));return arr.length?arr.reduce((a,x)=>a+x.float,0)/arr.length:0}
function projectedTradeItem(def){const avg=tradeAvgFloat(),f=avg*(def.max-def.min)+def.min,st=state.inventory.find(x=>tradeSelected.has(x.id))?.st||false;return {float:f,wear:wearNames[wearIndex(f)],value:estimate(def,f,st),st}}
function resetAutoTradeFilters(){const r=$('#tradeRarityFilter'),st=$('#tradeSTFilter');if(r)r.value='all';if(st)st.value='all'}
function renderTrade(){
 const selected=state.inventory.filter(x=>tradeSelected.has(x.id));const first=selected[0];const need=first?tradeRequiredCount(first.rarity):10;
 $('#tradeCount').textContent=selected.length;$('#tradeNeed').textContent=need;$('#tradeProgress').style.width=Math.min(100,selected.length/need*100)+'%';
 $('#tradeExecute').disabled=selected.length!==need;
 $('#tradeRule').textContent=!first?'Choose your first eligible skin.':first.rarity==='Covert'?`${first.st?'StatTrak™ ':''}Covert · 5-item Rare Special contract · Kukri Knife pool`:`${first.rarity} · ${first.st?'StatTrak™ only':'non-StatTrak only'} · next: ${nextRarity(first.rarity)}`;
 const avg=tradeAvgFloat();$('#tradeAvg').textContent=selected.length?`Avg input float ${avg.toFixed(8)}`:'—';const outs=tradeOutputDefs();
 $('#tradeOutputs').innerHTML=outs.length?outs.map(d=>{const pr=projectedTradeItem(d),img=imageFor(d.name);return `<div class="output" style="--rar:${rarityColor(d.rarity)}">${img?`<img src="${img}" alt="">`:'<div>🔪</div>'}<div><b>${pr.st?'StatTrak™ ':''}${d.name}</b><small>${pr.wear} · ${pr.float.toFixed(8)} · est. ${money(pr.value)}</small></div><div class="chance">${(100/outs.length).toFixed(2)}%</div></div>`}).join(''):'<div class="card empty">Select inputs to preview the exact output pool.</div>';
 let elig=state.inventory.filter(tradeEligible),rf=$('#tradeRarityFilter')?.value||'all',sf=$('#tradeSTFilter')?.value||'all',sort=$('#tradeSortFilter')?.value||'new';
 const isCompatible=x=>!first||(x.rarity===first.rarity&&x.st===first.st)||tradeSelected.has(x.id);
 const sorter=(a,b)=>{const rr={'Mil-Spec':1,'Restricted':2,'Classified':3,'Covert':4,'Special':5};if(sort==='rarity')return (rr[b.rarity]||0)-(rr[a.rarity]||0)||(b.value-a.value);if(sort==='value')return b.value-a.value;if(sort==='float')return a.float-b.float;return (b.ts||0)-(a.ts||0)};
 elig=elig.filter(x=>(sf==='all'||(sf==='st'&&x.st)||(sf==='normal'&&!x.st)));
 elig.sort((a,b)=>{
   const ac=isCompatible(a)?1:0,bc=isCompatible(b)?1:0;if(ac!==bc)return bc-ac;
   if(rf!=='all'){const ar=a.rarity===rf?1:0,br=b.rarity===rf?1:0;if(ar!==br)return br-ar}
   const as=tradeSelected.has(a.id)?1:0,bs=tradeSelected.has(b.id)?1:0;if(as!==bs)return bs-as;
   return sorter(a,b);
 });
 const compatibleCount=elig.filter(isCompatible).length;$('#tradeInvMeta').textContent=first?`${compatibleCount} compatible · ${elig.length} eligible`:`${elig.length} eligible`;
 $('#tradeList').innerHTML=elig.length?elig.map(x=>{let compatible=isCompatible(x),checked=tradeSelected.has(x.id),priority=(rf!=='all'&&x.rarity===rf)||compatible&&!!first;const img=imageFor(x.name);return `<label class="trade-item ${compatible?'':'disabled'} ${priority?'priority':''}" style="--rar:${rarityColor(x.rarity)}"><input class="trade-check" type="checkbox" data-trade="${x.id}" ${checked?'checked':''} ${compatible?'':'disabled'}><div class="trade-mini">${img?`<img src="${img}" alt="">`:'🔫'}</div><div class="trade-info"><b>${x.st?'StatTrak™ ':''}${x.name}</b><small>${x.wear} · ${x.float.toFixed(8)}<br>${money(x.value)} estimated</small></div><small>${x.rarity}</small></label>`}).join(''):'<div class="card empty">No trade-up eligible skins match these filters.</div>';
 $$('[data-trade]').forEach(c=>c.onchange=()=>{
   if(c.checked){
     const picked=state.inventory.find(x=>x.id===c.dataset.trade);const cap=picked?tradeRequiredCount(picked.rarity):10;
     if(tradeSelected.size>=cap){c.checked=false;toast(`Contract already has ${cap} inputs`);return}
     tradeSelected.add(c.dataset.trade);
     if(picked&&tradeSelected.size===1){if($('#tradeRarityFilter'))$('#tradeRarityFilter').value=picked.rarity;if($('#tradeSTFilter'))$('#tradeSTFilter').value=picked.st?'st':'normal'}
   }else{
     tradeSelected.delete(c.dataset.trade);
     if(tradeSelected.size===0)resetAutoTradeFilters();
   }
   renderTrade();
 });
}
function executeTrade(){
 const inputs=state.inventory.filter(x=>tradeSelected.has(x.id));const first=inputs[0];if(!first)return toast('Select contract inputs');const need=tradeRequiredCount(first.rarity);if(inputs.length!==need)return toast(`Select exactly ${need} skins`);if(inputs.some(x=>x.rarity!==first.rarity||x.st!==first.st))return toast('Inputs must match rarity and StatTrak type');if(first.rarity==='Covert'&&!collectionHasGoldPool())return toast('This collection has no Rare Special Item pool');const outs=tradeOutputDefs();if(!outs.length)return toast('No valid output');const def=outs[Math.floor(Math.random()*outs.length)],avg=tradeAvgFloat(),float=avg*(def.max-def.min)+def.min,pattern=Math.floor(Math.random()*1000),wi=wearIndex(float),value=estimate(def,float,first.st);const item={id:crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random(),name:def.name,rarity:def.rarity,float,wear:wearNames[wi],st:first.st,pattern,value,ts:Date.now(),patternSensitive:!!def.pattern,origin:first.rarity==='Covert'?'Covert Trade-Up':'Trade-Up'};const ids=new Set(inputs.map(x=>x.id));state.inventory=state.inventory.filter(x=>!ids.has(x.id));state.inventory.unshift(item);state.history.unshift({name:item.name,rarity:item.rarity,value:item.value,wear:item.wear,ts:item.ts,origin:item.origin});state.history=state.history.slice(0,50);tradeSelected.clear();resetAutoTradeFilters();save();showReveal(item);renderTrade();toast(first.rarity==='Covert'?'Covert contract completed':'Trade-Up completed');
}
function renderContents(){const el=$('#contents');if(!el)return;el.innerHTML=skins.map(d=>{const img=imageFor(d.name);const vals=d.p.normal.filter(v=>v!=null);return `<div class="content-card" style="--rar:${rarityColor(d.rarity)}"><div class="content-art">${img?`<img src="${img}" alt="${d.name}">`:'🔫'}</div><b>${d.name}</b><small>${d.rarity} · float ${d.min.toFixed(2)}–${d.max.toFixed(3)}<br>${money(Math.min(...vals))}–${money(Math.max(...vals))} wear snapshot</small></div>`}).join('')+`<div class="content-card" style="--rar:${rarityColor('Special')}"><div class="content-art" style="font-size:36px">🔪</div><b>★ Kukri Knife finishes</b><small>13 finishes · rare special pool</small></div>`}
function openExact3D(item){
 if(!item)return;viewerURL=skinshotterURL(item);$('#viewerName').textContent=(item.st?'StatTrak™ ':'')+item.name;$('#viewerMeta').textContent=`${item.wear} · ${item.float.toFixed(8)} · Pattern #${item.pattern}`;const wearAbbrev={'Factory New':'FN','Minimal Wear':'MW','Field-Tested':'FT','Well-Worn':'WW','Battle-Scarred':'BS'};$('#viewerExterior').textContent=`${item.wear} (${wearAbbrev[item.wear]||item.wear})`;$('#viewerFloat').textContent=item.float.toFixed(8);$('#viewerPattern').textContent=`#${item.pattern}${item.st?' · StatTrak™':''}`;$('#viewerModal').classList.add('show');$('#viewerLoading').classList.remove('hidden');$('#viewerLoading').textContent='Loading native CS2 weapon mesh…';if(window.CaseLab3D)window.CaseLab3D.open(item,imageFor(item.name));else $('#viewerLoading').textContent='3D engine is still loading…';
}
function inspectItem(id){const item=state.inventory.find(x=>x.id===id);if(!item)return;showReveal(item);}
function sellItem(id){tradeSelected.delete(id);const i=state.inventory.findIndex(x=>x.id===id);if(i<0)return;const item=state.inventory[i],net=item.value*(1-FEE);state.balance+=net;state.soldNet+=net;state.inventory.splice(i,1);save();toast(`Sold for ${money(net)} net`)}
function itemImageHTML(x){const img=imageFor(x.name);return img?`<img src="${img}" alt="${x.name}">`:`<div style="font-size:28px">${x.rarity==='Special'?'🔪':'🔫'}</div>`}
function renderInventory(){let arr=[...state.inventory],rf=$('#rarityFilter').value,sf=$('#stFilter')?.value||'all';if(rf!=='all')arr=arr.filter(x=>x.rarity===rf);if(sf==='st')arr=arr.filter(x=>x.st);if(sf==='normal')arr=arr.filter(x=>!x.st);let sort=$('#sortFilter').value;const rr={'Mil-Spec':1,'Restricted':2,'Classified':3,'Covert':4,'Special':5};if(sort==='rarity')arr.sort((a,b)=>(rr[b.rarity]||0)-(rr[a.rarity]||0)||(b.value-a.value));if(sort==='value')arr.sort((a,b)=>b.value-a.value);if(sort==='float')arr.sort((a,b)=>a.float-b.float);$('#invCount').textContent=`${state.inventory.length} item${state.inventory.length===1?'':'s'}`;$('#inventory').innerHTML=arr.length?arr.map(x=>`<div class="item" style="--rar:${rarityColor(x.rarity)}"><div class="weapon-art">${itemImageHTML(x)}</div><div><h3>${x.st?'StatTrak™ ':''}${x.name}</h3><div class="meta">${x.wear} · ${x.float.toFixed(8)}<br>Pattern #${x.pattern} · ${x.rarity}</div></div><div class="value"><div><b>${money(x.value)}</b><small>est. Steam</small></div><button class="sell" data-sell="${x.id}">Sell ${money(x.value*(1-FEE))}</button></div></div>`).join(''):'<div class="card empty">No skins yet. Go open the Kilowatt Case.</div>';$$('[data-sell]').forEach(b=>b.onclick=e=>{e.stopPropagation();sellItem(b.dataset.sell)});$$('.item').forEach((el,i)=>{const x=arr[i];el.addEventListener('click',()=>inspectItem(x.id))});}
function render(){
 $('#balance').textContent=money(state.balance);$('#openedStat').textContent=state.opened;$('#spentStat').textContent=money(state.spent);$('#sCases').textContent=state.opened;$('#sGold').textContent=state.golds;$('#sST').textContent=state.stCount;$('#sSold').textContent=money(state.soldNet);
 const iv=state.inventory.reduce((a,x)=>a+x.value,0),nv=iv*(1-FEE),soldGross=state.soldNet/(1-FEE),grossReturned=iv+soldGross,netReturned=nv+state.soldNet,grossROI=state.spent?grossReturned/state.spent*100:null,netROI=state.spent?netReturned/state.spent*100:null;$('#invValue').textContent=money(iv);$('#netValue').textContent=money(nv);$('#grossRoiStat').textContent=grossROI!=null?grossROI.toFixed(1)+'%':'—';$('#roiStat').textContent=netROI!=null?netROI.toFixed(1)+'%':'—';$('#roiGapStat').textContent=grossROI!=null?(grossROI-netROI).toFixed(1)+' pts':'—';const best=state.inventory.length?[...state.inventory].sort((a,b)=>b.value-a.value)[0]:null;$('#bestStat').textContent=best?money(best.value):'—';
 $('#openBtn').disabled=rolling||state.balance<OPEN_COST;renderInventory();$('#history').innerHTML=state.history.length?state.history.map(h=>`<div class="history-row"><span style="color:${rarityColor(h.rarity)}">${h.name}<br><small style="color:var(--muted)">${h.wear}${h.origin?' · '+h.origin:''}</small></span><b>${money(h.value)}</b></div>`).join(''):'<div class="empty">No openings yet.</div>';renderTrade();renderContents();
}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(window.__tt);window.__tt=setTimeout(()=>el.classList.remove('show'),1600)}
$('#openBtn').onclick=()=>{if(rolling)return;const item=openOne(true);if(item)animateOpen(item)};
$('#skipRoll').onclick=finishRollNow;
$('#open10').onclick=()=>{if(rolling)return toast('Wait for current opening');let n=Math.min(10,Math.floor(state.balance/OPEN_COST));if(!n)return toast('Not enough balance');let best=null;for(let i=0;i<n;i++){const x=openOne(true);if(!best||x.value>best.value)best=x}save();toast(`Opened ${n}; best ${money(best.value)}`)};
$('#add100').onclick=()=>{state.balance+=100;save();toast('Added $100 test balance')};
$('#resetSave').onclick=()=>{if(confirm('Reset the entire CaseLab save?')){state=structuredClone(defaultState);save();toast('Save reset')}};
$('#rarityFilter').onchange=renderInventory;$('#stFilter').onchange=renderInventory;$('#sortFilter').onchange=renderInventory;$('#tradeRarityFilter').onchange=renderTrade;$('#tradeSTFilter').onchange=renderTrade;$('#tradeSortFilter').onchange=renderTrade;
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').classList.remove('show')});
$$('.tab').forEach(b=>b.onclick=()=>{if(rolling)return toast('Finish the opening first');$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.view').forEach(v=>v.classList.remove('active'));$('#'+b.dataset.view).classList.add('active');render()});
$('#clearTrade').onclick=()=>{tradeSelected.clear();resetAutoTradeFilters();renderTrade()};$('#tradeExecute').onclick=executeTrade;
$('#viewerClose').onclick=()=>{$('#viewerModal').classList.remove('show');if(window.CaseLab3D)window.CaseLab3D.close()};$('#viewerExternal').onclick=()=>{if(viewerURL)window.open(viewerURL,'_blank','noopener,noreferrer')};$('#viewerReset').onclick=()=>{if(window.CaseLab3D)window.CaseLab3D.reset()};
// Mobile-game shell: aggressively block Safari page zoom while preserving normal in-app vertical scrolling.
// iOS can begin double-tap zoom on touchstart, so the second tap is cancelled before Safari sees it.
const viewportMeta=document.querySelector('meta[name="viewport"]');
const viewportContent='width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,viewport-fit=cover,user-scalable=no';
let __lastTap={t:0,x:0,y:0};
function resetViewportScale(){
  if(!viewportMeta)return;
  viewportMeta.setAttribute('content',viewportContent);
}
document.addEventListener('touchstart',e=>{
  if(!e.touches)return;
  if(e.touches.length>1){e.preventDefault();return;}
  const t=e.touches[0],now=Date.now(),dt=now-__lastTap.t,dx=t.clientX-__lastTap.x,dy=t.clientY-__lastTap.y;
  if(dt>0&&dt<430&&(dx*dx+dy*dy)<3600){e.preventDefault();__lastTap.t=0;resetViewportScale();return;}
  __lastTap={t:now,x:t.clientX,y:t.clientY};
},{passive:false,capture:true});
document.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false,capture:true});
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,e=>{e.preventDefault();resetViewportScale()},{passive:false,capture:true}));
document.addEventListener('dblclick',e=>{e.preventDefault();resetViewportScale()},{passive:false,capture:true});
if(window.visualViewport){
  const killUnexpectedZoom=()=>{if(window.visualViewport.scale>1.01)resetViewportScale()};
  window.visualViewport.addEventListener('resize',killUnexpectedZoom,{passive:true});
  window.visualViewport.addEventListener('scroll',killUnexpectedZoom,{passive:true});
}
document.addEventListener('contextmenu',e=>{if(!e.target.closest('input,select,textarea'))e.preventDefault()});
async function bootstrapV060(){
  try{
    if(!window.CaseLabStorage) throw new Error('Storage module unavailable');
    const boot=await window.CaseLabStorage.bootstrap(defaultState);
    state=boot.state;
    storageReady=true;
    if(boot.migrated){toast('v0.5.6 save migrated to v0.6 storage');}
  }catch(e){
    console.warn('v0.6 storage bootstrap failed; using temporary in-memory state',e);
    state=structuredClone(defaultState);
    toast('Storage startup failed; running temporary session');
  }
  render();
  loadImages();
}
bootstrapV060();
})();