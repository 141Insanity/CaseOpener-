// Valve Source SDK-style uniform RNG, ported from the public Source-compatible
// implementation documented by CSFloat/Step7750. We seed each stream from
// crypto randomness, then generate case attributes from a deterministic stream.
const NTAB=32,IA=16807,IM=2147483647,IQ=127773,IR=2836,NDIV=1+Math.floor((IM-1)/NTAB),MAX_RANDOM_RANGE=0x7fffffff,AM=1/IM,EPS=1.2e-7,RNMX=1-EPS;

function secureSeed(){
  const a=new Uint32Array(1);
  crypto.getRandomValues(a);
  const n=(a[0]&0x7fffffff)||1;
  return n;
}

export class SourceRandom{
  constructor(seed=secureSeed()){
    this.iv=new Int32Array(NTAB);
    this.setSeed(seed);
  }
  setSeed(seed){this.idum=seed>=0?-seed:seed;this.iy=0;this.iv.fill(0)}
  randomNumber(){
    let j,k;
    if(this.idum<=0||this.iy===0){
      this.idum=(-this.idum<1)?1:-this.idum;
      for(j=NTAB+7;j>=0;j--){
        k=Math.trunc(this.idum/IQ);
        this.idum=IA*(this.idum-k*IQ)-IR*k;
        if(this.idum<0)this.idum+=IM;
        if(j<NTAB)this.iv[j]=this.idum;
      }
      this.iy=this.iv[0];
    }
    k=Math.trunc(this.idum/IQ);
    this.idum=IA*(this.idum-k*IQ)-IR*k;
    if(this.idum<0)this.idum+=IM;
    j=Math.trunc(this.iy/NDIV);
    this.iy=this.iv[j];
    this.iv[j]=this.idum;
    return this.iy;
  }
  float(low=0,high=1){
    let f=Math.fround(AM*Math.fround(this.randomNumber()));
    if(f>RNMX)f=RNMX;
    return Math.fround(Math.fround(f*Math.fround(high-low))+low);
  }
  int(low,high){
    const x=high-low+1;
    if(x<=1||MAX_RANDOM_RANGE<x-1)return low;
    const maxAcceptable=MAX_RANDOM_RANGE-((MAX_RANDOM_RANGE+1)%x);
    let n;
    do{n=this.randomNumber()}while(n>maxAcceptable);
    return low+(n%x);
  }
}

// Empirical unbox/drop wear buckets for a 0-1 base float. The 0.01 gaps are
// intentionally preserved for crate/drop generation. Capped skin ranges are
// applied afterward using final = base*(max-min)+min.
export const UNBOX_BUCKETS=[
  {p:.03,low:0,high:.07,label:'FN'},
  {p:.24,low:.08,high:.15,label:'MW'},
  {p:.33,low:.16,high:.38,label:'FT'},
  {p:.24,low:.39,high:.45,label:'WW'},
  {p:.16,low:.46,high:1,label:'BS'}
];

export function rollBaseUnboxFloat(rng){
  let r=rng.float(0,1),acc=0,b=UNBOX_BUCKETS.at(-1);
  for(const x of UNBOX_BUCKETS){acc+=x.p;if(r<acc){b=x;break}}
  return rng.float(b.low,b.high);
}
export function mapFloatToDefinition(baseFloat,def){
  return Math.fround(Math.fround(baseFloat*Math.fround(def.maxFloat-def.minFloat))+def.minFloat);
}
export function rollUnboxFloat(rng,def){return mapFloatToDefinition(rollBaseUnboxFloat(rng),def)}
export function rollUnboxPaintSeed(rng){return rng.int(0,999)}
export function rollTradePaintSeed(rng){return rng.int(0,1000)}
export function rollStatTrak(rng,chance=.10){return rng.float(0,1)<chance}

export function weightedChoice(rng,entries,weightKey='p'){
  const total=entries.reduce((s,x)=>s+Number(x[weightKey]||0),0);
  let r=rng.float(0,total),acc=0;
  for(const x of entries){acc+=Number(x[weightKey]||0);if(r<acc)return x}
  return entries.at(-1);
}
