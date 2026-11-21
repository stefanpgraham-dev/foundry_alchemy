// Pure crafting rules. All quantities are integer units; no inventory documents are modified here.
export const TIERS = ['common', 'rare', 'exotic'];
export const COLOURS = ['curative', 'poisonous', 'reactive'];
export const KEYS = TIERS.flatMap(t => COLOURS.map(c => `${t}_${c}`));
export const keyFor = (tier, colour) => `${tier}_${colour}`;
export const tierOf = key => String(key).split('_')[0];
export const colourOf = key => String(key).split('_')[1];
export const tierValue = {common:1, rare:3, exotic:9};
export const DC = {common:10, rare:12, exotic:14};
export const HOURS = {common:2, rare:4, exotic:6};
export function assertQty(qty, max=100) {
  const n=Number(qty);
  if (!Number.isSafeInteger(n)||n<1||n>max) throw new Error(`Quantity must be an integer between 1 and ${max}.`);
  return n;
}
export function recipeTier(recipe) {
  const ts=Object.keys(recipe.cost).map(tierOf);
  return TIERS[Math.max(0,...ts.map(t=>TIERS.indexOf(t)))];
}
export function requirements(recipe, batch) {
  const n=assertQty(batch);
  return Object.fromEntries(Object.entries(recipe.cost).map(([k,v])=>[k,v*n]));
}
export function percentageYield(batch, pct) {
  const n=assertQty(batch), p=Number(pct);
  if (!Number.isSafeInteger(p)||p<0||p>800) throw new Error('Invalid percentage yield.');
  const product=n*p;
  return {guaranteed:Math.floor(product/100), fractional:product%100};
}
export function chanceSucceeds(d100, percent) {
  const r=Number(d100);
  if(!Number.isSafeInteger(r)||r<1||r>100) throw new Error('Invalid percentile die.');
  return r<=percent;
}
/**
 * Inventory input: [{id, key, quantity}]. Optionally filter input before calling to honour selection.
 * Applies legal one-way conversions only; never recombines three lower-tier reagents into a higher tier.
 * Any freshly broken material not consumed by the recipe is returned as change.
 * Breaks exotic->rare->common one unit at a time; consumes exact tiers first.
 */
export function planRecipe(recipe, batch, inventory, {change='highest'}={}) {
  const n=assertQty(batch), req=requirements(recipe,n);
  if(!['highest','common'].includes(change)) throw new Error('Invalid change preference.');
  const pools=new Map(KEYS.map(k=>[k,[]]));
  const spent=new Map(), minted=Object.fromEntries(KEYS.map(k=>[k,0]));
  for(const row of inventory){
    if(!KEYS.includes(row.key))continue;
    const qty=Number(row.quantity);
    if (!Number.isSafeInteger(qty)||qty<0)throw new Error(`Invalid item quantity for ${row.id}`);
    if(qty) pools.get(row.key).push({id:String(row.id),left:qty});
  }
  function take(tier,colour){
    const k=keyFor(tier,colour), orig=pools.get(k);
    for(const entry of orig){
      if(entry.left>0){entry.left--;spent.set(entry.id,(spent.get(entry.id)||0)+1);return true;}
    }
    if(minted[k]>0){minted[k]--;return true;}
    return false;
  }
  function fetch(tier,colour){
    if(take(tier,colour))return;
    if(tier==='exotic')throw new Error(`Not enough Exotic ${colour} reagent.`);
    const above=tier==='common'?'rare':'exotic';
    fetch(above,colour);
    minted[keyFor(tier,colour)]+=3;
    if(!take(tier,colour))throw new Error('Internal conversion error.');
  }
  for(const colour of COLOURS)for(const tier of [...TIERS].reverse()){
    for(let i=0;i<(req[keyFor(tier,colour)]||0);i++)fetch(tier,colour);
  }
  if(change==='common')for(const colour of COLOURS){
    minted[keyFor('common',colour)] += 3*minted[keyFor('rare',colour)];
    minted[keyFor('rare',colour)] = 0;
  }
  const returned=Object.fromEntries(Object.entries(minted).filter(([,v])=>v>0));
  return {requirements:req,consume:[...spent].map(([id,quantity])=>({id,quantity})),return:returned};
}
export function planRefine(key,quantity,targetTier) {
  const n=assertQty(quantity,1000),from=tierOf(key),col=colourOf(key);
  if(!KEYS.includes(key)||!TIERS.includes(targetTier)||TIERS.indexOf(targetTier)>=TIERS.indexOf(from))throw new Error('Only downgrading within the same colour is allowed.');
  return {key:keyFor(targetTier,col),quantity:n*(tierValue[from]/tierValue[targetTier])};
}
export function classifyHerbs(herbs){
 return herbs.filter(h=>h.reagents.some(k=>!k.startsWith(`${h.rarity}_`))).map(h=>({name:h.name,rarity:h.rarity,reagents:h.reagents}));
}

/** Determine craftability from an actor's recognised reagent stacks.
 * Uses the same exact allocator as the GM transaction (including legal downward substitutions),
 * rather than adding incompatible tier balances together.
 */
export function maximumCraftableBatch(recipe, inventory, cap=100) {
  const limit=assertQty(cap,1000);
  let low=0, high=limit;
  while(low<high) {
    const mid=Math.ceil((low+high)/2);
    try { planRecipe(recipe,mid,inventory);low=mid; }
    catch (err) { if(!/Not enough/i.test(err.message))throw err; high=mid-1; }
  }
  return low;
}
export function availableRefinementTargets(key) {
  if(!KEYS.includes(key))return [];
  const tier=tierOf(key);
  return tier==='exotic'?['rare','common']:tier==='rare'?['common']:[];
}
