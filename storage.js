(()=>{
'use strict';
const DB_NAME='caselab';
const DB_VERSION=3;
const STATE_STORE='state';
const META_STORE='meta';
const CURRENT_KEY='current';
const LEGACY_KEY='caselab-kilowatt-v01';
const SCHEMA_VERSION=3;
let dbPromise=null;

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STATE_STORE))db.createObjectStore(STATE_STORE);
      if(!db.objectStoreNames.contains(META_STORE))db.createObjectStore(META_STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
    req.onblocked=()=>console.warn('CaseLab IndexedDB upgrade blocked by another tab');
  });
  return dbPromise;
}
function reqPromise(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function get(store,key){const db=await openDB();const tx=db.transaction(store,'readonly');return reqPromise(tx.objectStore(store).get(key));}
async function put(store,key,value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(clone(value),key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));});}
function normalize(defaultState,value){
  const src=(value&&typeof value==='object')?value:{};
  const out={...clone(defaultState),...src};
  out.inventory=Array.isArray(src.inventory)?src.inventory:[];
  out.history=Array.isArray(src.history)?src.history:[];
  return out;
}
async function bootstrap(defaultState){
  const existing=await get(STATE_STORE,CURRENT_KEY);
  if(existing){
    await put(META_STORE,'lastOpenedAt',new Date().toISOString());
    return {state:normalize(defaultState,existing),migrated:false,source:'indexeddb'};
  }
  let legacy=null;
  try{const raw=localStorage.getItem(LEGACY_KEY);if(raw)legacy=JSON.parse(raw);}catch(e){console.warn('Legacy CaseLab save could not be read',e);}
  const state=normalize(defaultState,legacy);
  await put(STATE_STORE,CURRENT_KEY,state);
  await put(META_STORE,'schemaVersion',SCHEMA_VERSION);
  await put(META_STORE,'createdAt',new Date().toISOString());
  if(legacy){
    await put(META_STORE,'migration',{from:'localStorage',key:LEGACY_KEY,at:new Date().toISOString(),legacyPreserved:true});
  }
  // Deliberately preserve the v0.5.6 localStorage key as a rollback backup.
  return {state,migrated:!!legacy,source:legacy?'legacy-localStorage':'fresh'};
}
async function saveState(state){
  await put(STATE_STORE,CURRENT_KEY,state);
  await put(META_STORE,'lastSavedAt',new Date().toISOString());
}
async function debugInfo(){return {schemaVersion:await get(META_STORE,'schemaVersion'),migration:await get(META_STORE,'migration'),lastSavedAt:await get(META_STORE,'lastSavedAt')};}
window.CaseLabStorage={bootstrap,saveState,debugInfo,DB_NAME,SCHEMA_VERSION};
})();
