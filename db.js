const DB_NAME='caselab-v060';
const DB_VERSION=1;
const OLD_SAVE_KEY='caselab-kilowatt-v01';
let dbPromise=null;

function reqP(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Transaction aborted'));tx.onerror=()=>reject(tx.error||new Error('Transaction failed'))})}

export function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('items')){
        const s=db.createObjectStore('items',{keyPath:'id'});
        s.createIndex('ts','ts');
        s.createIndex('rarity','rarity');
        s.createIndex('skinId','skinId');
        s.createIndex('st','st');
      }
      if(!db.objectStoreNames.contains('history')){
        const s=db.createObjectStore('history',{keyPath:'id',autoIncrement:true});
        s.createIndex('ts','ts');
      }
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}

export async function getMeta(key,fallback=null){
  const db=await openDB();
  const tx=db.transaction('meta','readonly');
  const row=await reqP(tx.objectStore('meta').get(key));
  await txDone(tx);
  return row?.value??fallback;
}
export async function setMeta(key,value){
  const db=await openDB();
  const tx=db.transaction('meta','readwrite');
  tx.objectStore('meta').put({key,value});
  await txDone(tx);
}
export async function setMetaMany(entries){
  const db=await openDB();
  const tx=db.transaction('meta','readwrite');
  const s=tx.objectStore('meta');
  for(const [key,value] of Object.entries(entries))s.put({key,value});
  await txDone(tx);
}
export async function getAllItems(){
  const db=await openDB();
  const tx=db.transaction('items','readonly');
  const rows=await reqP(tx.objectStore('items').getAll());
  await txDone(tx);
  return rows||[];
}
export async function putItems(items){
  if(!items?.length)return;
  const db=await openDB();
  const tx=db.transaction('items','readwrite');
  const s=tx.objectStore('items');
  for(const item of items)s.put(item);
  await txDone(tx);
}
export async function deleteItems(ids){
  if(!ids?.length)return;
  const db=await openDB();
  const tx=db.transaction('items','readwrite');
  const s=tx.objectStore('items');
  for(const id of ids)s.delete(id);
  await txDone(tx);
}
export async function clearItems(){
  const db=await openDB();
  const tx=db.transaction('items','readwrite');
  tx.objectStore('items').clear();
  await txDone(tx);
}
export async function addHistory(rows,maxKeep=500){
  if(!rows?.length)return;
  const db=await openDB();
  let tx=db.transaction('history','readwrite');
  const s=tx.objectStore('history');
  for(const row of rows)s.add(row);
  await txDone(tx);
  const all=await getHistory(maxKeep+250);
  if(all.length<=maxKeep)return;
  const remove=all.slice(maxKeep).map(x=>x.id);
  tx=db.transaction('history','readwrite');
  const hs=tx.objectStore('history');
  for(const id of remove)hs.delete(id);
  await txDone(tx);
}
export async function getHistory(limit=100){
  const db=await openDB();
  const tx=db.transaction('history','readonly');
  const s=tx.objectStore('history').index('ts');
  const rows=[];
  await new Promise((resolve,reject)=>{
    const req=s.openCursor(null,'prev');
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const cur=req.result;
      if(!cur||rows.length>=limit)return resolve();
      rows.push({...cur.value,id:cur.primaryKey});
      cur.continue();
    };
  });
  await txDone(tx);
  return rows;
}
export async function clearHistory(){
  const db=await openDB();
  const tx=db.transaction('history','readwrite');
  tx.objectStore('history').clear();
  await txDone(tx);
}
export async function resetDatabase(){
  const db=await openDB();
  const tx=db.transaction(['items','history','meta'],'readwrite');
  tx.objectStore('items').clear();
  tx.objectStore('history').clear();
  tx.objectStore('meta').clear();
  await txDone(tx);
}

export async function migrateLegacy(defByName,wearIndexFor){
  const done=await getMeta('legacyMigrationDone',false);
  if(done)return {migrated:false,count:0};
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(OLD_SAVE_KEY)||'null')}catch{}
  if(!raw){await setMeta('legacyMigrationDone',true);return {migrated:false,count:0}}

  const oldItems=Array.isArray(raw.inventory)?raw.inventory:[];
  const migrated=[];
  for(const x of oldItems){
    const def=defByName.get(x.name);
    if(!def)continue;
    const f=Number.isFinite(Number(x.float))?Math.fround(Number(x.float)):Math.fround(def.minFloat);
    migrated.push({
      id:String(x.id||crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`),
      skinId:def.id,
      float:f,
      pattern:Number.isFinite(Number(x.pattern))?Number(x.pattern):0,
      st:!!x.st,
      ts:Number(x.ts)||Date.now(),
      origin:x.origin||'Legacy v0.5.x',
      migrated:true,
      legacyValueCents:Number.isFinite(Number(x.value))?Math.round(Number(x.value)*100):null,
      wearIndex:wearIndexFor(f)
    });
  }
  await putItems(migrated);
  const hist=Array.isArray(raw.history)?raw.history.map(h=>({
    ts:Number(h.ts)||Date.now(),
    name:String(h.name||'Unknown'),rarity:String(h.rarity||''),wear:String(h.wear||''),
    grossCents:Number.isFinite(Number(h.value))?Math.round(Number(h.value)*100):0,
    origin:h.origin||'Legacy v0.5.x'
  })):[];
  await addHistory(hist,500);
  const historyCandidates=Array.isArray(raw.history)?raw.history:[];
  const bestCandidate=[...oldItems,...historyCandidates].sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0))[0];
  const oldBalance=Number(raw.balance),oldSpent=Number(raw.spent),oldSoldNet=Number(raw.soldNet);
  await setMetaMany({
    balanceCents:Math.round((Number.isFinite(oldBalance)?oldBalance:500)*100),
    opened:Number(raw.opened)||0,
    spentCents:Math.round((Number.isFinite(oldSpent)?oldSpent:0)*100),
    soldNetCents:Math.round((Number.isFinite(oldSoldNet)?oldSoldNet:0)*100),
    // v0.5.x only stored net sales and displayed gross as net / 0.85.
    // Preserve that historical accounting during migration; all v0.6+ sales use cent-aware fees.
    soldGrossCents:Math.round(((Number.isFinite(oldSoldNet)?oldSoldNet:0)/.85)*100),
    golds:Number(raw.golds)||0,
    statTrakDrops:Number(raw.stCount)||0,
    bestPull:bestCandidate?{name:bestCandidate.name,grossCents:Math.round((Number(bestCandidate.value)||0)*100),ts:Number(bestCandidate.ts)||Date.now(),migrated:true}:null,
    legacyMigrationDone:true,
    migratedAt:new Date().toISOString()
  });
  return {migrated:true,count:migrated.length};
}
