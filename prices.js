(()=>{
'use strict';
const SNAPSHOT_LABEL='Bundled Steam wear snapshot';
const SNAPSHOT_BUILD='2026-09-02';
const STEAM_APPID=730;
function cents(n){return Math.max(0,Math.round(Number(n||0)*100));}
function sellerNetFromBuyerPrice(price){
  const total=cents(price); if(total<=0)return 0;
  // Steam buyer total = seller proceeds + 5% Steam fee + 10% CS2 fee.
  // Each fee has a 1-cent minimum; percentage components are floored to cents.
  let best=0;
  for(let receive=total; receive>=0; receive--){
    const steam=Math.max(1,Math.floor(receive*.05));
    const game=Math.max(1,Math.floor(receive*.10));
    const buyer=receive+steam+game;
    if(buyer<=total){best=receive;break;}
  }
  return best/100;
}
function marketHashName(item){
  const name=String(item.name||'');
  const wear=item.wear?` (${item.wear})`:'';
  if(item.st){
    if(name.startsWith('★ ')) return `★ StatTrak™ ${name.slice(2)}${wear}`;
    return `StatTrak™ ${name}${wear}`;
  }
  return `${name}${wear}`;
}
async function fetchSteamPrice(hashName,{timeoutMs=3500}={}){
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{
    const url=`https://steamcommunity.com/market/priceoverview/?appid=${STEAM_APPID}&currency=1&market_hash_name=${encodeURIComponent(hashName)}`;
    const r=await fetch(url,{cache:'no-store',signal:ctl.signal,credentials:'omit'});
    if(!r.ok)throw new Error(`Steam HTTP ${r.status}`);
    const j=await r.json();
    if(!j?.success)throw new Error('Steam returned no price');
    const raw=j.median_price||j.lowest_price;
    const num=Number(String(raw||'').replace(/[^0-9.]/g,''));
    if(!Number.isFinite(num)||num<=0)throw new Error('Steam price parse failed');
    return {price:num,volume:j.volume||null,hashName,at:new Date().toISOString()};
  }finally{clearTimeout(timer)}
}
async function probe(){
  try{const x=await fetchSteamPrice('Kilowatt Case',{timeoutMs:3000});return {ok:true,...x};}
  catch(error){return {ok:false,error:String(error?.message||error),at:new Date().toISOString()};}
}
window.CaseLabPrices={SNAPSHOT_LABEL,SNAPSHOT_BUILD,sellerNetFromBuyerPrice,marketHashName,fetchSteamPrice,probe};
})();
