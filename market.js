import {sellerNetFromBuyerPrice} from './fees.js';

const WEAR_NAMES=['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred'];
const WEAR_ABBR=['FN','MW','FT','WW','BS'];

export class MarketService{
  constructor(priceData,defsById,db){
    this.data=priceData;this.defsById=defsById;this.db=db;
    this.live=new Map();
    this.status={mode:'snapshot',label:priceData.snapshotLabel,lastUpdated:priceData.snapshotCapturedAt,error:null};
  }
  wearIndex(float){return float<.07?0:float<.15?1:float<.38?2:float<.45?3:4}
  wearName(float){return WEAR_NAMES[this.wearIndex(float)]}
  wearAbbr(float){return WEAR_ABBR[this.wearIndex(float)]}
  priceKey(skinId,wearIndex,st){return `${skinId}|${wearIndex}|${st?'st':'normal'}`}
  getGrossCents(item){
    const wi=Number.isInteger(item.wearIndex)?item.wearIndex:this.wearIndex(item.float);
    const live=this.live.get(this.priceKey(item.skinId,wi,item.st));
    if(Number.isFinite(live))return {cents:live,source:'live',confidence:'steam-live'};
    const row=this.data.items[item.skinId];
    if(!row)return {cents:null,source:'missing',confidence:'missing'};
    const arr=item.st?row.st:row.normal;
    let v=Array.isArray(arr)?arr[wi]:null;
    if(v==null&&item.st){
      // Do not invent a StatTrak multiplier. If no ST snapshot exists, price remains unknown.
      return {cents:null,source:'snapshot',confidence:'missing-st'};
    }
    if(v==null&&Array.isArray(arr))v=arr.find(Number.isFinite);
    return {cents:Number.isFinite(v)?Math.round(v):null,source:'snapshot',confidence:row.confidence||'snapshot'};
  }
  getNetCents(item){const p=this.getGrossCents(item);return {...p,netCents:p.cents==null?null:sellerNetFromBuyerPrice(p.cents)}}
  marketHashName(def,wearIndex,st){
    const prefix=st?'StatTrak™ ':'';
    const wear=WEAR_NAMES[wearIndex];
    const base=def.name.replace(' | Vanilla','');
    return `${prefix}${base} (${wear})`;
  }
  parseUsd(s){if(typeof s!=='string')return null;const n=Number(s.replace(/[^0-9.]/g,''));return Number.isFinite(n)?Math.round(n*100):null}
  async refreshLivePrices({onProgress}={}){
    // Steam Community Market's priceoverview endpoint usually blocks browser CORS.
    // We still make the requested automatic attempt; if it fails, we stop immediately
    // and remain on the baked snapshot instead of routing through an untrusted proxy.
    const probeDef=[...this.defsById.values()].find(x=>x.rarity==='Mil-Spec');
    if(!probeDef)return this.status;
    try{
      const probeName=this.marketHashName(probeDef,2,false);
      const probeURL=`https://steamcommunity.com/market/priceoverview/?country=US&currency=1&appid=730&market_hash_name=${encodeURIComponent(probeName)}`;
      const r=await fetch(probeURL,{cache:'no-store',mode:'cors'});
      if(!r.ok)throw new Error(`Steam HTTP ${r.status}`);
      const j=await r.json();
      const p=this.parseUsd(j.median_price||j.lowest_price);
      if(!p)throw new Error('Steam returned no usable USD price');
      this.live.set(this.priceKey(probeDef.id,2,false),p);
      this.status={mode:'live-partial',label:'Steam priceoverview',lastUpdated:new Date().toISOString(),error:null};
      onProgress?.('Steam probe succeeded; refreshing exact variants…');
      const defs=[...this.defsById.values()];
      let done=0,total=0;
      for(const d of defs){for(let wi=0;wi<5;wi++)for(const st of [false,true]){
        if(d.rarity==='Special'&&st&&d.finish!=='Vanilla'){} // keep normal flow; may simply return no listing
        total++;
      }}
      for(const d of defs){
        for(let wi=0;wi<5;wi++)for(const st of [false,true]){
          // Skip impossible wear bands.
          const bounds=[[0,.07],[.07,.15],[.15,.38],[.38,.45],[.45,1]][wi];
          if(d.maxFloat<=bounds[0]||d.minFloat>=bounds[1]){done++;continue}
          try{
            const name=this.marketHashName(d,wi,st);
            const url=`https://steamcommunity.com/market/priceoverview/?country=US&currency=1&appid=730&market_hash_name=${encodeURIComponent(name)}`;
            const rr=await fetch(url,{cache:'no-store',mode:'cors'});
            if(rr.ok){const jj=await rr.json();const pp=this.parseUsd(jj.median_price||jj.lowest_price);if(pp)this.live.set(this.priceKey(d.id,wi,st),pp)}
          }catch{}
          done++;onProgress?.(`Refreshing Steam variants ${done}/${total}`);
          await new Promise(res=>setTimeout(res,125));
        }
      }
      this.status={mode:'live',label:'Steam priceoverview',lastUpdated:new Date().toISOString(),error:null};
    }catch(e){
      this.status={mode:'snapshot',label:this.data.snapshotLabel,lastUpdated:this.data.snapshotCapturedAt,error:`Live Steam refresh unavailable in this browser (${e?.message||e}). Snapshot retained.`};
    }
    return this.status;
  }
}
