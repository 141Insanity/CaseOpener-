export function steamFeesFromSellerReceive(receiveCents){
  receiveCents=Math.max(0,Math.trunc(receiveCents));
  if(receiveCents<=0)return {receiveCents:0,steamFeeCents:0,gameFeeCents:0,buyerPaysCents:0};
  const steamFeeCents=Math.max(1,Math.floor(receiveCents*.05));
  const gameFeeCents=Math.max(1,Math.floor(receiveCents*.10));
  return {receiveCents,steamFeeCents,gameFeeCents,buyerPaysCents:receiveCents+steamFeeCents+gameFeeCents};
}
export function sellerNetFromBuyerPrice(buyerCents){
  buyerCents=Math.max(0,Math.trunc(buyerCents));
  if(buyerCents<=0)return 0;
  let lo=0,hi=buyerCents,best=0;
  while(lo<=hi){
    const mid=(lo+hi)>>1;
    const total=steamFeesFromSellerReceive(mid).buyerPaysCents;
    if(total<=buyerCents){best=mid;lo=mid+1}else hi=mid-1;
  }
  return best;
}
export function cents(n){return Math.round(Number(n||0)*100)}
export function money(centsValue){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(centsValue)||0)/100)}
