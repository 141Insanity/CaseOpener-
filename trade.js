import {rollTradePaintSeed} from './rng.js';

export const RARITY_ORDER={'Mil-Spec':1,'Restricted':2,'Classified':3,'Covert':4,'Special':5};
export const NEXT_RARITY={'Mil-Spec':'Restricted','Restricted':'Classified','Classified':'Covert','Covert':'Special'};

export function requiredInputs(rarity){return rarity==='Covert'?5:10}
export function normalizedInputFloat(item,def){
  const span=Math.max(1e-12,def.maxFloat-def.minFloat);
  return Math.max(0,Math.min(1,(Number(item.float)-def.minFloat)/span));
}
export function normalizedAverage(inputs,defsById){
  if(!inputs.length)return 0;
  return inputs.reduce((sum,item)=>sum+normalizedInputFloat(item,defsById.get(item.skinId)),0)/inputs.length;
}
export function outputFloat(inputs,outDef,defsById){
  const avg=normalizedAverage(inputs,defsById);
  return Math.fround(avg*(outDef.maxFloat-outDef.minFloat)+outDef.minFloat);
}

export function collectionOutputsFor(def,rarity,defsById,collectionById,goldPools){
  if(rarity==='Covert'){
    const c=collectionById.get(def.collectionId);
    return c?.goldPoolId?(goldPools.get(c.goldPoolId)||[]):[];
  }
  const next=NEXT_RARITY[rarity];
  if(!next)return[];
  return [...defsById.values()].filter(x=>x.collectionId===def.collectionId&&x.rarity===next);
}

export function validateContract(inputs,defsById,collectionById,goldPools){
  if(!inputs.length)return {ok:false,error:'Select contract inputs'};
  const first=inputs[0],firstDef=defsById.get(first.skinId);
  if(!firstDef)return {ok:false,error:'Unknown input skin'};
  const need=requiredInputs(firstDef.rarity);
  if(inputs.length!==need)return {ok:false,error:`Select exactly ${need} skins`};
  if(inputs.some(x=>{const d=defsById.get(x.skinId);return !d||d.rarity!==firstDef.rarity||x.st!==first.st}))return {ok:false,error:'Inputs must match rarity and StatTrak type'};
  if(firstDef.rarity==='Special')return {ok:false,error:'Rare Special items cannot be traded up'};
  for(const item of inputs){
    const d=defsById.get(item.skinId);
    if(!collectionOutputsFor(d,firstDef.rarity,defsById,collectionById,goldPools).length){
      return {ok:false,error:firstDef.rarity==='Covert'?`${d.name} belongs to a collection with no eligible gold pool`:`${d.name} belongs to a collection with no next-rarity output`};
    }
  }
  return {ok:true,need,rarity:firstDef.rarity,st:first.st};
}

// Current collection weighting: each input contributes an equal slice of collection
// probability. That collection's slice is divided evenly across its eligible outputs.

// Preview output probabilities before the contract is full. This intentionally
// validates only properties that are already knowable (rarity, StatTrak type,
// and whether each represented collection has an eligible output). The final
// contract still goes through validateContract().
export function previewContractOutcomes(inputs,defsById,collectionById,goldPools){
  if(!inputs.length)return {ok:false,error:'Select contract inputs',outcomes:[]};
  const first=inputs[0],firstDef=defsById.get(first.skinId);
  if(!firstDef)return {ok:false,error:'Unknown input skin',outcomes:[]};
  if(firstDef.rarity==='Special')return {ok:false,error:'Rare Special items cannot be traded up',outcomes:[]};
  const need=requiredInputs(firstDef.rarity);
  if(inputs.length>need)return {ok:false,error:`This contract accepts ${need} skins`,outcomes:[]};
  if(inputs.some(x=>{const d=defsById.get(x.skinId);return !d||d.rarity!==firstDef.rarity||x.st!==first.st}))
    return {ok:false,error:'Inputs must match rarity and StatTrak type',outcomes:[]};
  const map=new Map(),inputWeight=1/inputs.length;
  for(const item of inputs){
    const d=defsById.get(item.skinId),outs=collectionOutputsFor(d,firstDef.rarity,defsById,collectionById,goldPools);
    if(!outs.length)return {ok:false,error:firstDef.rarity==='Covert'?`${d.name} belongs to a collection with no eligible gold pool`:`${d.name} belongs to a collection with no next-rarity output`,outcomes:[]};
    const each=inputWeight/outs.length;
    for(const out of outs){const prev=map.get(out.id)||{def:out,p:0};prev.p+=each;map.set(out.id,prev)}
  }
  return {ok:true,need,rarity:firstDef.rarity,st:first.st,complete:inputs.length===need,outcomes:[...map.values()].sort((a,b)=>b.p-a.p)};
}

export function contractOutcomes(inputs,defsById,collectionById,goldPools){
  const v=validateContract(inputs,defsById,collectionById,goldPools);
  if(!v.ok)return {validation:v,outcomes:[]};
  const map=new Map();
  const inputWeight=1/inputs.length;
  for(const item of inputs){
    const d=defsById.get(item.skinId);
    const outs=collectionOutputsFor(d,v.rarity,defsById,collectionById,goldPools);
    const each=inputWeight/outs.length;
    for(const out of outs){
      const prev=map.get(out.id)||{def:out,p:0};prev.p+=each;map.set(out.id,prev);
    }
  }
  return {validation:v,outcomes:[...map.values()].sort((a,b)=>b.p-a.p)};
}

export function chooseOutcome(rng,outcomes){
  let r=rng.float(0,1),acc=0;
  for(const o of outcomes){acc+=o.p;if(r<acc)return o.def}
  return outcomes.at(-1)?.def||null;
}

export function makeTradeOutput(rng,inputs,outDef,defsById,market,origin='Trade-Up'){
  const f=outputFloat(inputs,outDef,defsById);
  const item={
    id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,
    skinId:outDef.id,
    float:f,
    wearIndex:market.wearIndex(f),
    pattern:rollTradePaintSeed(rng),
    st:!!inputs[0]?.st,
    ts:Date.now(),
    origin
  };
  return item;
}
