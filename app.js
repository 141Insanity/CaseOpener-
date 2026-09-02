import * as DB from './db.js';
import {SourceRandom,rollUnboxFloat,rollUnboxPaintSeed,rollStatTrak,weightedChoice} from './rng.js';
import {MarketService} from './market.js';
import {money} from './fees.js';
import {CaseLabViewer} from './viewer.js';
import {RARITY_ORDER,requiredInputs,validateContract,contractOutcomes,chooseOutcome,makeTradeOutput,normalizedAverage,outputFloat,collectionOutputsFor,previewContractOutcomes} from './trade.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const RC={'Mil-Spec':'#4b69ff','Restricted':'#8847ff','Classified':'#d32ce6','Covert':'#eb4b4b','Special':'#e4ae39'};
const WEAR_NAMES=['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred'];
const OPEN_ST_CHANCE=.10;
const PAGE=100;

let caseData,priceData,materialData,defsById,defByName,collectionById,goldPools,caseDefsByRarity;
let market,viewer,items=[],history=[],images=new Map(),caseImage='';
let meta={balanceCents:50000,opened:0,spentCents:0,soldNetCents:0,soldGrossCents:0,golds:0,statTrakDrops:0,bestPull:null};
let rolling=false,rollTimer=0,pendingReveal=null,invLimit=PAGE,tradeLimit=PAGE,tradeSelected=new Set(),tradeAuto={rarity:false,st:false};
let confirmResolve=null,theoretical={gross:null,net:null,coverage:0};
let audioCtx=null,tickTimers=[];

function h(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function rarityColor(r){return RC[r]||'#aaa'}
function wearIndex(f){return market?.wearIndex(f)??(f<.07?0:f<.15?1:f<.38?2:f<.45?3:4)}
function wearName(f){return WEAR_NAMES[wearIndex(f)]}
function val(item){return market.getNetCents(item)}
function grossCents(item){return market.getGrossCents(item).cents}
function imageFor(defOrItem){const id=defOrItem?.skinId||defOrItem?.id;return images.get(id)||''}
function defOf(item){return defsById.get(item.skinId)}
function allDefs(){return [...defsById.values()]}
function possibleWear(def,wi){const b=[[0,.07],[.07,.15],[.15,.38],[.38,.45],[.45,1]][wi];return def.maxFloat>b[0]&&def.minFloat<b[1]}

async function loadJSON(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return r.json()}
async function loadMeta(){
  const keys=['balanceCents','opened','spentCents','soldNetCents','soldGrossCents','golds','statTrakDrops','bestPull'];
  for(const key of keys){const v=await DB.getMeta(key,undefined);if(v!==undefined)meta[key]=v}
}
async function saveMeta(){await DB.setMetaMany(meta)}

function buildDefinitionMaps(){
  const defs=[...caseData.skins];
  goldPools=new Map();
  for(const [poolId,arr] of Object.entries(caseData.goldPools||{})){goldPools.set(poolId,arr);defs.push(...arr)}
  defsById=new Map(defs.map(x=>[x.id,x]));defByName=new Map(defs.map(x=>[x.name,x]));
  collectionById=new Map([[caseData.collection.id,caseData.collection]]);
  caseDefsByRarity=new Map();
  for(const r of ['Mil-Spec','Restricted','Classified','Covert'])caseDefsByRarity.set(r,caseData.skins.filter(x=>x.rarity===r));
  caseDefsByRarity.set('Special',goldPools.get(caseData.collection.goldPoolId)||[]);
}

async function init(){
  try{
    [caseData,priceData,materialData]=await Promise.all([loadJSON('./kilowatt.json'),loadJSON('./prices.json'),loadJSON('./materials.json')]);
    buildDefinitionMaps();
    market=new MarketService(priceData,defsById,DB);
    await DB.openDB();
    const migration=await DB.migrateLegacy(defByName,wearIndex);
    $('#migrationStatus').textContent=migration.migrated?`migrated ${migration.count} items`:'ready';
    await loadMeta();items=await DB.getAllItems();history=await DB.getHistory(100);
    // Repair any missing wearIndex values from old migrated rows.
    let repair=[];for(const item of items){if(!Number.isInteger(item.wearIndex)){item.wearIndex=wearIndex(item.float);repair.push(item)}}if(repair.length)await DB.putItems(repair);
    viewer=new CaseLabViewer({host:$('#native3d'),loading:$('#viewerLoading'),materials:materialData,defsById,onStatus:s=>$('#viewerFoot').textContent=s});
    bindUI();renderAll();loadImages();computeTheoretical();
    market.refreshLivePrices({onProgress:t=>{$('#priceNote').textContent=t}}).then(()=>{renderPriceStatus();computeTheoretical();renderAll()});
    if(migration.migrated)toast(`Migrated ${migration.count} v0.5.x inventory items`);
  }catch(e){console.error(e);document.body.innerHTML=`<pre style="white-space:pre-wrap;color:white;padding:20px">CaseLab failed to initialize:\n${h(e?.stack||e)}</pre>`}
}

function randomCaseDef(rng){
  const rarity=weightedChoice(rng,caseData.rarityOdds).rarity;
  const pool=caseDefsByRarity.get(rarity)||[];
  return pool[rng.int(0,pool.length-1)];
}
function createCaseItem(rng){
  const def=randomCaseDef(rng),f=rollUnboxFloat(rng,def);
  return {id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,skinId:def.id,float:f,wearIndex:wearIndex(f),pattern:rollUnboxPaintSeed(rng),st:rollStatTrak(rng,OPEN_ST_CHANCE),ts:Date.now(),origin:'Case Opening'};
}
function historyRowFor(item){const d=defOf(item),p=grossCents(item);return {ts:item.ts,name:d?.name||item.skinId,skinId:item.skinId,rarity:d?.rarity||'',wear:wearName(item.float),grossCents:p??0,origin:item.origin||'Case Opening'}}
function updateBestPull(item){
  if(item.origin!=='Case Opening')return;
  const d=defOf(item),g=grossCents(item);if(g==null)return;
  if(!meta.bestPull||g>Number(meta.bestPull.grossCents||0))meta.bestPull={skinId:item.skinId,name:d?.name||item.skinId,grossCents:g,float:item.float,pattern:item.pattern,st:item.st,ts:item.ts};
}
async function openBatch(requested,{charge=true}={}){
  const cost=priceData.casePriceCents+priceData.keyPriceCents;
  let n=Math.max(0,Math.floor(requested));if(charge)n=Math.min(n,Math.floor(meta.balanceCents/cost));if(!n){toast('Not enough balance');return[]}
  const rng=new SourceRandom(),created=[];
  for(let i=0;i<n;i++){const item=createCaseItem(rng);created.push(item);updateBestPull(item);const d=defOf(item);if(d.rarity==='Special')meta.golds++;if(item.st)meta.statTrakDrops++}
  if(charge){meta.balanceCents-=cost*n;meta.spentCents+=cost*n;meta.opened+=n}
  items.push(...created);items.sort((a,b)=>b.ts-a.ts);
  await Promise.all([DB.putItems(created),DB.addHistory(created.map(historyRowFor),500),saveMeta()]);
  history=await DB.getHistory(100);renderAll();return created;
}

function ensureAudio(){try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume()}catch{}}
function blip(freq=700,dur=.025,gain=.02){if(!audioCtx)return;try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}catch{}}
function scheduleTicks(duration=4800){tickTimers.forEach(clearTimeout);tickTimers=[];ensureAudio();let t=90,i=0;while(t<duration-150&&i<44){tickTimers.push(setTimeout(()=>blip(610+Math.random()*80,.018,.017),t));const p=t/duration;t+=72+Math.pow(p,2.15)*250;i++}}
function revealSound(r){ensureAudio();const seq=r==='Special'?[520,660,880,1100]:r==='Covert'?[440,620,820]:r==='Classified'?[420,560,700]:[420,500];seq.forEach((f,i)=>setTimeout(()=>blip(f,.10,.03),i*90))}
function rollCard(def){const img=imageFor(def);return `<div class="roll-card" style="--rar:${rarityColor(def.rarity)}">${img?`<img src="${h(img)}" alt="">`:`<div style="height:88px;display:grid;place-items:center;font-size:32px">${def.rarity==='Special'?'🔪':'🔫'}</div>`}<div class="tiny-name">${h(def.name)}</div></div>`}
function animateOpen(item){
  const actual=defOf(item),rng=new SourceRandom(),cards=[];for(let i=0;i<47;i++)cards.push(randomCaseDef(rng));const target=39;cards[target]=actual;
  $('#rollTrack').innerHTML=cards.map(rollCard).join('');$('#rollTrack').style.transition='none';$('#rollTrack').style.transform='translate3d(0,0,0)';$('#rollShell').classList.add('show');$('#rollText').textContent='Decrypting container…';rolling=true;renderOpenButton();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{const card=132+8,windowW=$('#rollShell').clientWidth,center=windowW/2-card/2,offset=target*card-center+(Math.random()*.54-.27)*132;$('#rollTrack').style.transition='transform 4.8s cubic-bezier(.08,.60,.10,1)';$('#rollTrack').style.transform=`translate3d(${-offset}px,0,0)`;scheduleTicks(4800)}));
  pendingReveal=item;clearTimeout(rollTimer);rollTimer=setTimeout(finishRoll,4920);
}
function finishRoll(){if(!rolling)return;clearTimeout(rollTimer);tickTimers.forEach(clearTimeout);rolling=false;$('#rollText').textContent='Container opened';renderOpenButton();if(pendingReveal){const x=pendingReveal;pendingReveal=null;showReveal(x)}}
function finishRollNow(){if(!rolling)return;$('#rollTrack').style.transition='none';finishRoll()}

async function sellItems(list,{toastText=true}={}){
  const priced=[];let gross=0,net=0;
  for(const item of list){const p=val(item);if(p.cents==null)continue;priced.push(item);gross+=p.cents;net+=p.netCents}
  if(!priced.length){toast('No matching items have a sellable Steam snapshot');return {count:0,gross:0,net:0}}
  const ids=new Set(priced.map(x=>x.id));items=items.filter(x=>!ids.has(x.id));for(const id of ids)tradeSelected.delete(id);
  meta.balanceCents+=net;meta.soldGrossCents+=gross;meta.soldNetCents+=net;
  await Promise.all([DB.deleteItems([...ids]),saveMeta()]);renderAll();if(toastText)toast(`Sold ${priced.length} for ${money(net)} Steam net`);return {count:priced.length,gross,net};
}
async function sellOne(item){await sellItems([item])}

function showReveal(item){
  const d=defOf(item),p=val(item),g=p.cents,n=p.netCents,img=imageFor(d),cost=priceData.casePriceCents+priceData.keyPriceCents;
  const isCase=item.origin==='Case Opening';
  const delta=isCase?(n==null?null:n-cost):(g==null||!Number.isFinite(item.tradeInputGrossCents)?null:g-item.tradeInputGrossCents);
  const deltaLabel=isCase?'Case net result':'Contract market value change';
  revealSound(d.rarity);$('#revealSheet').scrollTop=0;$('#reveal').style.setProperty('--rar',rarityColor(d.rarity));
  $('#reveal').innerHTML=`<div class="reveal-art" style="--rar:${rarityColor(d.rarity)}">${img?`<img src="${h(img)}" alt="${h(d.name)}">`:`<div style="font-size:68px">${d.rarity==='Special'?'🔪':'🔫'}</div>`}</div><div class="eyebrow" style="margin-top:12px">${item.st?'StatTrak™ · ':''}${h(d.rarity)}</div><h2 class="reveal-title">${h(d.name)}</h2><div class="finish">${h(wearName(item.float))}</div><div class="detailgrid"><div class="detail"><small>Float</small><b>${Number(item.float).toFixed(8)}</b></div><div class="detail"><small>Pattern seed</small><b>#${item.pattern}</b></div><div class="detail"><small>Steam gross snapshot</small><b>${g==null?'—':money(g)}</b></div><div class="detail"><small>Steam net if sold</small><b>${n==null?'—':money(n)}</b></div></div>${delta==null?'':`<div class="moneylabel">${deltaLabel}</div><div class="moneybig ${delta>=0?'good':'bad'}">${delta>=0?'+':''}${money(delta)}</div>`}<p class="note">Value uses the exact wear + StatTrak market variant. v0.6 no longer invents a within-wear float premium.</p><div class="actions"><button class="secondary" id="keepBtn">KEEP</button><button class="openbtn" style="margin:0" id="sellReveal" ${n==null?'disabled':''}>SELL · ${n==null?'—':money(n)}</button><button class="inspectLaunch" id="inspect3D">INSPECT 3D</button></div>`;
  $('#revealModal').classList.add('show');$('#keepBtn').onclick=()=>$('#revealModal').classList.remove('show');$('#sellReveal').onclick=async()=>{await sellOne(item);$('#revealModal').classList.remove('show')};$('#inspect3D').onclick=()=>openInspector(item);
}

function filterST(item,v){return v==='all'||(v==='st'&&item.st)||(v==='normal'&&!item.st)}
function sortItems(arr,sort){
  if(sort==='rarity')arr.sort((a,b)=>(RARITY_ORDER[defOf(b)?.rarity]||0)-(RARITY_ORDER[defOf(a)?.rarity]||0)||((grossCents(b)||0)-(grossCents(a)||0)));
  else if(sort==='value')arr.sort((a,b)=>(grossCents(b)||-1)-(grossCents(a)||-1));
  else if(sort==='float')arr.sort((a,b)=>a.float-b.float);else arr.sort((a,b)=>b.ts-a.ts);return arr;
}
function itemHTML(item,{trade=false,compatible=true}={}){
  const d=defOf(item),p=val(item),img=imageFor(d),selected=tradeSelected.has(item.id);
  return `<div class="item ${selected?'selected':''} ${trade&&!compatible?'disabled':''}" style="--rar:${rarityColor(d.rarity)}" data-item="${h(item.id)}" ${trade?`data-trade="1"`:''}><div class="weapon-art">${img?`<img src="${h(img)}" alt="">`:`<div style="font-size:28px">${d.rarity==='Special'?'🔪':'🔫'}</div>`}</div><div><h3>${item.st?'StatTrak™ ':''}${h(d.name)}</h3><div class="meta">${wearName(item.float)} · ${Number(item.float).toFixed(8)}<br>Pattern #${item.pattern} · ${d.rarity}</div></div><div class="value"><b>${p.cents==null?'—':money(p.cents)}</b><small>${p.confidence==='wear-snapshot'?'Steam snapshot':p.confidence?.includes('approx')?'approx. snapshot':p.source}</small>${trade?'':`<button class="sell" data-sell="${h(item.id)}" ${p.cents==null?'disabled':''}>Sell ${p.netCents==null?'—':money(p.netCents)}</button>`}</div></div>`;
}
function inventoryFiltered(){
  const rf=$('#rarityFilter').value,sf=$('#stFilter').value,sort=$('#sortFilter').value;let arr=items.filter(x=>{const d=defOf(x);return d&&(rf==='all'||d.rarity===rf)&&filterST(x,sf)});return sortItems(arr,sort);
}
function renderInventory(){
  const arr=inventoryFiltered(),shown=arr.slice(0,invLimit);$('#invCount').textContent=`${items.length.toLocaleString()} items · ${arr.length.toLocaleString()} shown by filter`;$('#inventory').innerHTML=shown.length?shown.map(x=>itemHTML(x)).join(''):'<div class="card empty">No matching skins.</div>';$('#invMore').hidden=shown.length>=arr.length;
  $$('[data-sell]').forEach(b=>b.onclick=e=>{e.stopPropagation();const it=items.find(x=>x.id===b.dataset.sell);if(it)sellOne(it)});
  $$('#inventory .item').forEach(el=>el.onclick=()=>{const it=items.find(x=>x.id===el.dataset.item);if(it)showReveal(it)});renderBulkPreview();
}
function bulkMatches(){const r=$('#bulkRarity').value,s=$('#bulkST').value;return items.filter(x=>defOf(x)?.rarity===r&&filterST(x,s))}
function renderBulkPreview(){
  const list=bulkMatches();let gross=0,net=0,unpriced=0;for(const x of list){const p=val(x);if(p.cents==null)unpriced++;else{gross+=p.cents;net+=p.netCents}}
  $('#bulkPreview').textContent=`${list.length.toLocaleString()} items · ${money(gross)} gross · ${money(net)} net${unpriced?` · ${unpriced} unpriced`:''}`;$('#bulkSell').disabled=!list.some(x=>val(x).cents!=null);
}
async function bulkSell(){
  const list=bulkMatches(),priced=list.filter(x=>val(x).cents!=null);if(!priced.length)return toast('Nothing priced to sell');let gross=0,net=0;for(const x of priced){const p=val(x);gross+=p.cents;net+=p.netCents}
  const rarity=$('#bulkRarity').value,warning=(rarity==='Covert'||rarity==='Special')?'\n\nHIGH-RARITY WARNING: this permanently removes Covert/Gold items from the simulated inventory.':'';
  const ok=await askConfirm('Bulk sell',`Sell every matching ${rarity==='Special'?'Gold':rarity} item?${warning}`,`${priced.length.toLocaleString()} items\nGross market value: ${money(gross)}\nSteam net: ${money(net)}`,rarity==='Covert'||rarity==='Special');if(ok)await sellItems(priced);
}

function contractSelectedItems(){return items.filter(x=>tradeSelected.has(x.id))}
function resetAutoTradeFilters(){if(tradeAuto.rarity){$('#tradeRarityFilter').value='all';tradeAuto.rarity=false}if(tradeAuto.st){$('#tradeSTFilter').value='all';tradeAuto.st=false}}
function tradeCompatibility(item,selected){
  const d=defOf(item);if(!d||d.rarity==='Special')return false;if(!selected.length)return collectionOutputsFor(d,d.rarity,defsById,collectionById,goldPools).length>0;
  const fd=defOf(selected[0]);return d.rarity===fd.rarity&&item.st===selected[0].st&&collectionOutputsFor(d,d.rarity,defsById,collectionById,goldPools).length>0;
}
function toggleTrade(item){
  const selected=contractSelectedItems();if(tradeSelected.has(item.id)){tradeSelected.delete(item.id);if(!tradeSelected.size)resetAutoTradeFilters();renderTrade();return}
  if(!tradeCompatibility(item,selected))return toast('That skin is not compatible with this contract');
  const d=defOf(item),need=selected.length?requiredInputs(defOf(selected[0]).rarity):requiredInputs(d.rarity);if(tradeSelected.size>=need)return toast(`This contract needs exactly ${need} items`);
  if(!selected.length){if($('#tradeRarityFilter').value==='all'){$('#tradeRarityFilter').value=d.rarity;tradeAuto.rarity=true}if($('#tradeSTFilter').value==='all'){$('#tradeSTFilter').value=item.st?'st':'normal';tradeAuto.st=true}}
  tradeSelected.add(item.id);renderTrade();
}
function tradeFiltered(){
  const selected=contractSelectedItems(),rf=$('#tradeRarityFilter').value,sf=$('#tradeSTFilter').value,sort=$('#tradeSortFilter').value;let arr=items.filter(x=>{const d=defOf(x);return d&&d.rarity!=='Special'&&(rf==='all'||d.rarity===rf)&&filterST(x,sf)});sortItems(arr,sort);arr.sort((a,b)=>Number(tradeSelected.has(b.id))-Number(tradeSelected.has(a.id))||Number(tradeCompatibility(b,selected))-Number(tradeCompatibility(a,selected)));return arr;
}
function renderTrade(){
  const selected=contractSelectedItems(),first=selected[0],fd=first?defOf(first):null,need=fd?requiredInputs(fd.rarity):10;$('#tradeCount').textContent=`${selected.length} / ${need}`;$('#tradeRule').textContent=fd?`${fd.rarity} · ${first.st?'StatTrak™':'Non-StatTrak'} · ${need}-item contract`:'Select a skin to begin';$('#tradeAvg').textContent=selected.length?`Normalized input average ${(normalizedAverage(selected,defsById)*100).toFixed(4)}%`:'—';
  const finalData=contractOutcomes(selected,defsById,collectionById,goldPools),preview=previewContractOutcomes(selected,defsById,collectionById,goldPools);const valid=finalData.validation.ok;$('#tradeExecute').disabled=!valid;$('#tradeExecute').textContent=fd?.rarity==='Covert'?'COMPLETE 5-COVERT CONTRACT':'COMPLETE CONTRACT';
  if(selected.length&&preview.outcomes.length){$('#tradeOutcomes').innerHTML=`${!preview.complete?`<div class="preview-note">Current-input preview · probabilities and projected float update as you add skins.</div>`:''}`+preview.outcomes.map(o=>{const f=outputFloat(selected,o.def,defsById),tmp={skinId:o.def.id,float:f,wearIndex:wearIndex(f),st:first.st},p=val(tmp);return `<div class="outcome"><div><b style="color:${rarityColor(o.def.rarity)}">${h(o.def.name)}</b><small>${wearName(f)} · projected ${f.toFixed(8)} · ${p.cents==null?'unpriced':money(p.cents)}</small></div><b>${(o.p*100).toFixed(2)}%</b></div>`}).join('')}else $('#tradeOutcomes').innerHTML=`<div class="empty">${selected.length?(preview.error||finalData.validation.error||'Add more inputs to complete the contract.'):'Select contract inputs to preview outcomes.'}</div>`;
  const arr=tradeFiltered(),shown=arr.slice(0,tradeLimit),compat=arr.filter(x=>tradeCompatibility(x,selected)).length;$('#tradeEligible').textContent=`${compat.toLocaleString()} compatible · ${arr.length.toLocaleString()} filtered`;$('#tradeInventory').innerHTML=shown.length?shown.map(x=>itemHTML(x,{trade:true,compatible:tradeCompatibility(x,selected)})).join(''):'<div class="card empty">No matching trade-up inputs.</div>';$('#tradeMore').hidden=shown.length>=arr.length;
  $$('#tradeInventory .item').forEach(el=>el.onclick=()=>{const it=items.find(x=>x.id===el.dataset.item);if(it)toggleTrade(it)});
}
async function executeTrade(){
  const inputs=contractSelectedItems(),o=contractOutcomes(inputs,defsById,collectionById,goldPools);if(!o.validation.ok)return toast(o.validation.error);const rng=new SourceRandom(),outDef=chooseOutcome(rng,o.outcomes);if(!outDef)return toast('No valid output');
  let inputGross=0,inputNet=0,allPriced=true;for(const x of inputs){const p=val(x);if(p.cents==null){allPriced=false;continue}inputGross+=p.cents;inputNet+=p.netCents}
  const item=makeTradeOutput(rng,inputs,outDef,defsById,market,o.validation.rarity==='Covert'?'Covert Trade-Up':'Trade-Up');
  if(allPriced){item.tradeInputGrossCents=inputGross;item.tradeInputNetCents=inputNet}
  const ids=new Set(inputs.map(x=>x.id));items=items.filter(x=>!ids.has(x.id));items.push(item);items.sort((a,b)=>b.ts-a.ts);tradeSelected.clear();resetAutoTradeFilters();await Promise.all([DB.deleteItems([...ids]),DB.putItems([item]),DB.addHistory([historyRowFor(item)],500)]);history=await DB.getHistory(100);renderAll();showReveal(item);toast(o.validation.rarity==='Covert'?'Covert contract completed':'Trade-Up completed');
}

function renderStats(){
  let invGross=0,invNet=0,unpriced=0;for(const x of items){const p=val(x);if(p.cents==null)unpriced++;else{invGross+=p.cents;invNet+=p.netCents}}
  const grossReturned=invGross+Number(meta.soldGrossCents||0),netReturned=invNet+Number(meta.soldNetCents||0),grossROI=meta.spentCents?grossReturned/meta.spentCents*100:null,netROI=meta.spentCents?netReturned/meta.spentCents*100:null;
  $('#openedStat').textContent=Number(meta.opened||0).toLocaleString();$('#spentStat').textContent=money(meta.spentCents);$('#grossRoiStat').textContent=grossROI==null?'—':`${grossROI.toFixed(1)}%`;$('#roiStat').textContent=netROI==null?'—':`${netROI.toFixed(1)}%`;
  $('#sCases').textContent=Number(meta.opened||0).toLocaleString();$('#sGold').textContent=Number(meta.golds||0).toLocaleString();$('#sST').textContent=Number(meta.statTrakDrops||0).toLocaleString();$('#sSold').textContent=money(meta.soldNetCents);$('#invValue').textContent=money(invGross);$('#netValue').textContent=money(invNet);$('#bestStat').textContent=meta.bestPull?.grossCents?money(meta.bestPull.grossCents):'—';$('#theoryRoi').textContent=theoretical.gross==null?'—':`${theoretical.gross.toFixed(1)}%${theoretical.coverage<.999?'*':''}`;const cov=theoretical.gross==null?'pricing coverage —':`pricing coverage ${(theoretical.coverage*100).toFixed(1)}%`;$('#theoryCoverage').textContent=cov;$('#dataTheoryCoverage').textContent=theoretical.gross==null?'—':`${(theoretical.coverage*100).toFixed(1)}%`;
  $('#history').innerHTML=history.length?history.map(r=>`<div class="history-row"><span style="color:${rarityColor(r.rarity)}">${h(r.name)}<br><small style="color:var(--muted)">${h(r.wear||'')}${r.origin?` · ${h(r.origin)}`:''}</small></span><b>${r.grossCents?money(r.grossCents):'—'}</b></div>`).join(''):'<div class="empty">No acquisitions yet.</div>';
  if(unpriced)$('#netValue').title=`${unpriced} inventory items currently lack a price snapshot`;
}
function renderOpenButton(){const cost=priceData.casePriceCents+priceData.keyPriceCents;$('#openBtn').disabled=rolling||meta.balanceCents<cost;$('#openBtn').textContent=rolling?'OPENING…':`OPEN KILOWATT · ${money(cost)}`}
function renderPriceStatus(){const s=market.status;$('#priceMode').textContent=s.mode==='live'?'Steam live':s.mode==='live-partial'?'Steam live (partial)':`Snapshot · ${s.label}`;$('#priceTime').textContent=s.lastUpdated?new Date(s.lastUpdated).toLocaleString():'—';$('#priceNote').textContent=s.error||'Steam live refresh succeeded. Exact wear + StatTrak variants override the baked snapshot for this session.'}
function renderAll(){if(!market)return;$('#balance').textContent=money(meta.balanceCents);renderOpenButton();renderInventory();renderTrade();renderStats();renderPriceStatus()}

function computeTheoretical(){
  if(!market)return;const rng=new SourceRandom(7750),N=50000,cost=priceData.casePriceCents+priceData.keyPriceCents;let gross=0,net=0,known=0;
  for(let i=0;i<N;i++){const d=randomCaseDef(rng),f=rollUnboxFloat(rng,d),item={skinId:d.id,float:f,wearIndex:wearIndex(f),st:rollStatTrak(rng,OPEN_ST_CHANCE)},p=val(item);if(p.cents!=null){gross+=p.cents;net+=p.netCents;known++}}
  theoretical={gross:(gross/N)/cost*100,net:(net/N)/cost*100,coverage:known/N};$('#theoryRoi').textContent=`${theoretical.gross.toFixed(1)}%${theoretical.coverage<.999?'*':''}`;$('#theoryCoverage').textContent=`pricing coverage ${(theoretical.coverage*100).toFixed(1)}%`;$('#dataTheoryCoverage').textContent=`${(theoretical.coverage*100).toFixed(1)}%`;
}

async function loadImages(){
  try{
    const r=await fetch(caseData.case.imageApi,{cache:'force-cache'});if(!r.ok)throw new Error('crate api');const crates=await r.json(),k=crates.find(x=>x.id===caseData.case.crateApiId||x.name===caseData.case.name);if(!k)throw new Error('Kilowatt not found');caseImage=k.image||'';const byName=new Map();[...(k.contains||[]),...(k.contains_rare||[])].forEach(x=>{if(x?.name&&x?.image)byName.set(x.name,x.image)});for(const d of allDefs()){let img=byName.get(d.name)||byName.get(d.name.replace('★ ',''))||'';if(img)images.set(d.id,img)}
    if(caseImage)$('#caseArtWrap').innerHTML=`<img class="case-img" src="${h(caseImage)}" alt="Kilowatt Case">`;
    const missing=allDefs().filter(d=>!images.has(d.id));if(missing.length){const sr=await fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json',{cache:'force-cache'});if(sr.ok){const list=await sr.json(),m=new Map(list.map(x=>[x.name,x.image]));for(const d of missing){const img=m.get(d.name)||m.get(d.name.replace('★ ',''));if(img)images.set(d.id,img)}}}
    renderAll();
  }catch(e){console.warn('image API',e);toast('CS2 image API unavailable; using fallbacks')}
}

function skinshotterURL(item){const d=defOf(item),raw=d.name.replace('★ ','');const [weapon,finishRaw='']=raw.split(' | '),slug=x=>x.toLowerCase().replace(/™/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const cats={'Dual Berettas':'pistols','Glock-18':'pistols','Five-SeveN':'pistols','Tec-9':'pistols','USP-S':'pistols','Zeus x27':'pistols','MAC-10':'smgs','UMP-45':'smgs','MP7':'smgs','Nova':'heavy','XM1014':'heavy','Sawed-Off':'heavy','SSG 08':'rifles','M4A4':'rifles','M4A1-S':'rifles','AWP':'rifles','AK-47':'rifles','Kukri Knife':'knives'};return `https://skinshotter.com/${cats[weapon]||'rifles'}/${weapon==='Kukri Knife'?'kukri':slug(weapon)}/${slug(finishRaw||'vanilla')}`}
function openInspector(item){
  const d=defOf(item);$('#viewerName').textContent=(item.st?'StatTrak™ ':'')+d.name;$('#viewerMeta').textContent=`${wearName(item.float)} · ${Number(item.float).toFixed(8)} · Pattern #${item.pattern}`;$('#viewerExterior').textContent=`${wearName(item.float)} (${market.wearAbbr(item.float)})`;$('#viewerFloat').textContent=Number(item.float).toFixed(8);$('#viewerPattern').textContent=`#${item.pattern}${item.st?' · StatTrak™':''}`;$('#viewerExternal').dataset.url=skinshotterURL(item);$('#viewerModal').classList.add('show');viewer.open(item);
}

function askConfirm(title,text,summary,danger=false){
  if(confirmResolve)confirmResolve(false);$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;$('#confirmSummary').textContent=summary;$('#confirmGo').textContent=danger?'YES, SELL THEM':'CONFIRM';$('#confirmGo').className=danger?'dangerbtn':'secondary';$('#confirmModal').classList.add('show');return new Promise(resolve=>confirmResolve=resolve)
}
function closeConfirm(value){$('#confirmModal').classList.remove('show');const r=confirmResolve;confirmResolve=null;r?.(value)}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(window.__caseToast);window.__caseToast=setTimeout(()=>el.classList.remove('show'),1800)}

function bindUI(){
  $('#openBtn').onclick=async()=>{if(rolling)return;const [item]=await openBatch(1);if(item)animateOpen(item)};$('#skipRoll').onclick=finishRollNow;
  $('#open10').onclick=async()=>{const a=await openBatch(10);if(a.length)toast(`Opened ${a.length}; best ${money(Math.max(...a.map(x=>grossCents(x)||0)))}`)};$('#open100').onclick=async()=>{const a=await openBatch(100);if(a.length)toast(`Opened ${a.length} cases`)};$('#add100').onclick=async()=>{meta.balanceCents+=10000;await saveMeta();renderAll();toast('Added $100 test balance')};$('#add10k').onclick=async()=>{meta.balanceCents+=1000000;await saveMeta();renderAll();toast('Added $10,000 test balance')};
  $('#devToggle').onclick=()=>{const p=$('#devPanel');p.hidden=!p.hidden;$('#devToggle').textContent=p.hidden?'SHOW':'HIDE'};
  $('#resetSave').onclick=async()=>{const ok=await askConfirm('Reset CaseLab save','Delete the IndexedDB inventory, history, statistics, and migrated balance? Your old v0.5.x localStorage copy is left untouched as a backup.','This cannot be undone inside CaseLab.',true);if(!ok)return;await DB.resetDatabase();meta={balanceCents:50000,opened:0,spentCents:0,soldNetCents:0,soldGrossCents:0,golds:0,statTrakDrops:0,bestPull:null};await DB.setMeta('legacyMigrationDone',true);items=[];history=[];tradeSelected.clear();renderAll();toast('CaseLab save reset')};
  $('#rarityFilter').onchange=()=>{invLimit=PAGE;renderInventory()};$('#stFilter').onchange=()=>{invLimit=PAGE;renderInventory()};$('#sortFilter').onchange=()=>{invLimit=PAGE;renderInventory()};$('#invMore').onclick=()=>{invLimit+=PAGE;renderInventory()};
  $('#bulkRarity').onchange=renderBulkPreview;$('#bulkST').onchange=renderBulkPreview;$('#bulkSell').onclick=bulkSell;
  $('#tradeRarityFilter').onchange=()=>{tradeAuto.rarity=false;tradeLimit=PAGE;renderTrade()};$('#tradeSTFilter').onchange=()=>{tradeAuto.st=false;tradeLimit=PAGE;renderTrade()};$('#tradeSortFilter').onchange=()=>{tradeLimit=PAGE;renderTrade()};$('#tradeMore').onclick=()=>{tradeLimit+=PAGE;renderTrade()};$('#clearTrade').onclick=()=>{tradeSelected.clear();resetAutoTradeFilters();renderTrade()};$('#tradeExecute').onclick=executeTrade;
  $('#revealModal').onclick=e=>{if(e.target===$('#revealModal'))$('#revealModal').classList.remove('show')};$('#confirmCancel').onclick=()=>closeConfirm(false);$('#confirmGo').onclick=()=>closeConfirm(true);$('#confirmModal').onclick=e=>{if(e.target===$('#confirmModal'))closeConfirm(false)};
  $('#viewerClose').onclick=()=>{$('#viewerModal').classList.remove('show');viewer.close()};$('#viewerReset').onclick=()=>viewer.reset();$('#viewerExternal').onclick=()=>{const u=$('#viewerExternal').dataset.url;if(u)window.open(u,'_blank','noopener,noreferrer')};
  $('#priceRefresh').onclick=async()=>{$('#priceRefresh').disabled=true;$('#priceNote').textContent='Attempting direct Steam Community Market refresh…';await market.refreshLivePrices({onProgress:t=>$('#priceNote').textContent=t});$('#priceRefresh').disabled=false;renderPriceStatus();computeTheoretical();renderAll()};
  $$('.tab').forEach(b=>b.onclick=()=>{if(rolling)return toast('Finish the opening first');$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.view').forEach(v=>v.classList.remove('active'));$('#'+b.dataset.view).classList.add('active');if(b.dataset.view==='inventoryView')renderInventory();if(b.dataset.view==='tradeView')renderTrade();if(b.dataset.view==='statsView')renderStats()});
  installMobileShell();
}

function installMobileShell(){
  const viewport=document.querySelector('meta[name="viewport"]'),content='width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,viewport-fit=cover,user-scalable=no';let last={t:0,x:0,y:0};const inViewer=t=>!!t?.closest?.('#native3d');
  document.addEventListener('touchstart',e=>{if(inViewer(e.target))return;if(!e.touches)return;if(e.touches.length>1){e.preventDefault();return}const t=e.touches[0],now=Date.now(),dt=now-last.t,dx=t.clientX-last.x,dy=t.clientY-last.y;if(dt>0&&dt<430&&dx*dx+dy*dy<3600){e.preventDefault();last.t=0;viewport?.setAttribute('content',content);return}last={t:now,x:t.clientX,y:t.clientY}},{passive:false,capture:true});
  document.addEventListener('touchmove',e=>{if(inViewer(e.target))return;if(e.touches?.length>1)e.preventDefault()},{passive:false,capture:true});
  for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,e=>{if(inViewer(e.target))return;e.preventDefault();viewport?.setAttribute('content',content)},{passive:false,capture:true});
  document.addEventListener('dblclick',e=>{if(inViewer(e.target))return;e.preventDefault();viewport?.setAttribute('content',content)},{passive:false,capture:true});document.addEventListener('contextmenu',e=>{if(!e.target.closest('input,select,textarea'))e.preventDefault()});
}

init();
