/* Biome-linked herb gathering and weighted selection. Pure functions are
 * independent of Foundry; only scanned herb source UUIDs may be awarded. */
export const BIOMES=Object.freeze(['Forest','Grasslands','Desert','Marsh','Jungle','Caves','Mountains','Shore','Tundra','Underground']);
export const TIER_WEIGHTS=Object.freeze({common:60,rare:30,exotic:10});
export const REAGENTS=Object.freeze(['common_curative','common_poisonous','common_reactive','rare_curative','rare_poisonous','rare_reactive','exotic_curative','exotic_poisonous','exotic_reactive']);
export const herbNameKey=name=>String(name||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const safeWeight=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)))):1;
export function linkBiomeRegistry(scanned=[],registry={},overrides={}){
 const byName=new Map((registry.herbs||[]).map(h=>[herbNameKey(h.name),h]));
 return scanned.map(herb=>{
  const original=byName.get(herbNameKey(herb.name))||null;
  const override=overrides?.[herb.sourceUuid]||{};
  const biomes=Array.isArray(override.biomes)?override.biomes:
    Array.isArray(herb.biomes)&&herb.biomes.length?herb.biomes:
    original?.biomes||[];
  const clean=[...new Set(biomes.filter(x=>BIOMES.includes(x)))];
  return {...herb,biomes:clean,
   gatherWeight:safeWeight(override.weight??herb.gatherWeight??original?.weight??1),
   notionUrl:original?.notionUrl||'',registryMatched:Boolean(original),
   registryRarity:original?.rarity||'',
   registryReagents:original?.reagents||[]};
 });
}
export function biomeCoverage(herbs,biome){
 const entries=herbs.filter(h=>h.biomes?.includes(biome));
 const covered=new Set(entries.flatMap(h=>h.reagents||[]));
 return {biome,count:entries.length,available:REAGENTS.filter(k=>covered.has(k)),
  missing:REAGENTS.filter(k=>!covered.has(k)),byTier:Object.fromEntries(['common','rare','exotic'].map(t=>[t,entries.filter(h=>h.rarity===t).length]))};
}
/** Tier shares are fixed by GM world rules; per-herb gatherWeight adjusts
 * frequency only *within* its tier and biome. Empty tiers are excluded, and
 * remaining shares are renormalized to sum 100%. */
export function biomeTable(herbs,biome,tierWeights=TIER_WEIGHTS){
 if(!BIOMES.includes(biome))throw Error('Unknown herb-gathering biome: '+biome);
 const candidates=herbs.filter(h=>h.biomes?.includes(biome)&&
  ['common','rare','exotic'].includes(h.rarity)&&h.sourceUuid&&h.gatherWeight!==0);
 const tiers=['common','rare','exotic'],totalTier=tiers.reduce((n,t)=>n+
  (candidates.some(h=>h.rarity===t)?Math.max(0,Number(tierWeights?.[t]??0)):0),0);
 if(!totalTier)return [];
 const rows=[];
 for(const tier of tiers){
  const group=candidates.filter(h=>h.rarity===tier).sort((a,b)=>a.name.localeCompare(b.name));
  const sum=group.reduce((n,h)=>n+safeWeight(h.gatherWeight??1),0);
  if(!sum)continue;
  for(const herb of group){
   const weight=Math.max(0,Number(tierWeights?.[tier]??0))/totalTier*
    safeWeight(herb.gatherWeight??1)/sum;
   if(weight>0)rows.push({herb,tier,probability:weight*100});
  }
 }
 return rows;
}
export function weightedPick(entries,roll){
 const r=Number(roll);
 if(!Number.isFinite(r)||r<1||r>10000||!Number.isSafeInteger(r))throw Error('Weighted result must be 1–10000');
 if(!entries.length)throw Error('No source-linked herbs available in that biome.');
 const total=entries.reduce((n,x)=>n+x.probability,0);
 let marker=(r-0.5)/10000*total;
 for(const entry of entries){marker-=entry.probability;if(marker<0)return entry;}
 return entries.at(-1);
}
export function gatherYield(total,dc,{plusFive=5,plusTen=10,yield2=2,yield3=3}={}){
 if(!Number.isFinite(Number(total))||!Number.isFinite(Number(dc)))throw Error('Gathering check has no valid total.');
 const delta=Number(total)-Number(dc);
 if(delta<0)return 0;
 if(delta>=plusTen)return yield3;
 if(delta>=plusFive)return yield2;
 return 1;
}
/** Report canonical Notion-to-Item discrepancies; never silently rewrite
 * a GM's actual linked Item in order to force a database match. */
export function registryDiscrepancies(herbs){
 return herbs.flatMap(h=>{
  if(!h.registryMatched)return [{name:h.name,kind:'unknown',message:'No matching Notion registry entry'}];
  const errors=[];
  if(h.rarity!==h.registryRarity)errors.push({name:h.name,kind:'tier',message:'Foundry '+h.rarity+' vs Notion '+h.registryRarity});
  for(const k of h.registryReagents||[])if(!h.reagents.includes(k))
   errors.push({name:h.name,kind:'reagent',message:'Missing Foundry output '+k+' specified in Notion'});
  for(const k of h.reagents||[])if(!h.registryReagents.includes(k))
   errors.push({name:h.name,kind:'reagent',message:'Foundry has extra output '+k+' absent from Notion'});
  return errors;
 });
}
