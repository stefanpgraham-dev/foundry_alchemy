/* Pure world-recipe model; no Foundry globals or mutations. */
import {KEYS,DC,HOURS,recipeTier,planRecipe,maximumCraftableBatch} from './engine.mjs';
import {brewingToolsForRecipe} from './recipe-tools.mjs';

const has=Object.prototype.hasOwnProperty;
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id);
const uuidOK=uuid=>typeof uuid==='string'&&(!uuid||/^(Item|Compendium)\.[a-zA-Z0-9_.-]+$/.test(uuid));
const numberOrNull=value=>value===null||value===undefined||value===''?null:Number(value);
const safeClone=value=>JSON.parse(JSON.stringify(value));

export function recipeDC(recipe,rules=null){return recipe.dcOverride??rules?.dc?.[recipeTier(recipe)]??DC[recipeTier(recipe)];}
export function recipeHours(recipe,rules=null){return recipe.hoursOverride??rules?.hours?.[recipeTier(recipe)]??HOURS[recipeTier(recipe)];}
export function validateRecipe(raw,{allowMissingOutput=false}={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Recipe must be an object.');
  if(!validId(raw.id))throw Error('Recipe ID must use letters, numbers, dashes or underscores.');
  const name=String(raw.name??'').trim();
  if(!name||name.length>120)throw Error('Recipe name must be 1–120 characters.');
  if(!raw.cost||typeof raw.cost!=='object'||Array.isArray(raw.cost))throw Error('Add at least one reagent.');
  const pairs=Object.entries(raw.cost);
  if(!pairs.length||pairs.length>KEYS.length)throw Error('Recipe must use between 1 and 9 reagent types.');
  const cost={};
  for(const [key,q] of pairs){
    if(!KEYS.includes(key))throw Error('Unknown reagent: '+key);
    const amount=Number(q);
    if(!Number.isSafeInteger(amount)||amount<1||amount>1000)throw Error('Reagent quantities must be whole numbers from 1 to 1000.');
    cost[key]=amount;
  }
  const outputUuid=String(raw.outputUuid??'').trim();
  if(!uuidOK(outputUuid))throw Error('Output must reference a valid Foundry Item UUID.');
  const source=raw.source==='default'?'default':'custom';
  if(!allowMissingOutput && source==='custom' && raw.enabled!==false && !outputUuid)throw Error('Drag a potion Item into the output slot before enabling this recipe.');
  const dcOverride=numberOrNull(raw.dcOverride);
  if(dcOverride!==null&&(!Number.isSafeInteger(dcOverride)||dcOverride<1||dcOverride>40))
    throw Error('Override DC must be an integer from 1 to 40.');
  const hoursOverride=numberOrNull(raw.hoursOverride);
  if(hoursOverride!==null&&(!Number.isFinite(hoursOverride)||hoursOverride<0.25||hoursOverride>72||Math.round(hoursOverride*4)!==hoursOverride*4))
    throw Error('Override brewing time must be a quarter-hour increment between 0.25 and 72 hours.');
  const outputName=String(raw.outputName??(outputUuid?name:'')).trim().slice(0,120);
  return {id:raw.id,name,cost,outputUuid,outputName,source,enabled:raw.enabled!==false,dcOverride,hoursOverride,brewingTools:brewingToolsForRecipe(raw)};
}

export function validateLibrary(entries,{allowMissingOutput=false,max=500}={}){
  if(!Array.isArray(entries)||entries.length>max)throw Error('Invalid recipe library or too many recipes (maximum '+max+').');
  const seen=new Set(),valid=[];
  for(const value of entries){
    const r=validateRecipe(value,{allowMissingOutput});
    if(seen.has(r.id))throw Error('Duplicate recipe ID: '+r.id);
    seen.add(r.id);valid.push(r);
  }
  return valid;
}
/** Upgrade older world formulas without overwriting their ingredients, outputs,
 * recipe-specific overrides or previously configured tool choices. */
export function migrateRecipeTools(entries){
 const validated=validateLibrary(entries,{allowMissingOutput:true});
 const changed=entries.some((r,i)=>JSON.stringify(r)!==JSON.stringify(validated[i]));
 return {recipes:validated,changed};
}
export function seedDefaults(defaults,outputMappings={}){
  return validateLibrary(defaults.map(r=>({...r,source:'default',enabled:true,
    outputUuid:outputMappings[r.id]||'',outputName:r.name,dcOverride:null,hoursOverride:null,brewingTools:brewingToolsForRecipe(r)
  })),{allowMissingOutput:true});
}
/** Restore an original formula without breaking the world's output Item mapping. */
export function restoreDefault(current,defaults){
  const original=defaults.find(r=>r.id===current.id);
  if(!original)throw Error('This is a custom recipe; no bundled default exists.');
  return validateRecipe({...original,source:'default',enabled:true,
    outputUuid:current.outputUuid||'',outputName:current.outputName||current.name,dcOverride:null,hoursOverride:null,brewingTools:brewingToolsForRecipe(original)},{allowMissingOutput:true});
}
export function importMissingDefaults(current,defaults){
  const seen=new Set(current.map(r=>r.id));
  return [...current,...seedDefaults(defaults).filter(r=>!seen.has(r.id))];
}
export function recipeComparison(current,incoming){
  const old=new Map(current.map(x=>[x.id,x])),next=new Map(incoming.map(x=>[x.id,x]));
  return {
    added:incoming.filter(x=>!old.has(x.id)).map(x=>x.name),
    changed:incoming.filter(x=>old.has(x.id)&&JSON.stringify(x)!==JSON.stringify(old.get(x.id))).map(x=>x.name),
    removed:current.filter(x=>!next.has(x.id)).map(x=>x.name)
  };
}
export function mergeRecipeLibraries(current,incoming,{replace=false,overwrite=false}={}){
  const safe=validateLibrary(incoming,{allowMissingOutput:true});
  if(replace)return safe;
  const merged=new Map(current.map(r=>[r.id,safeClone(r)]));
  for(const r of safe)if(overwrite||!merged.has(r.id))merged.set(r.id,r);
  return validateLibrary([...merged.values()],{allowMissingOutput:true});
}
export function exportRecipeLibrary(recipes){
  return JSON.stringify({format:'alchemy-workbench-recipes',schema:1,exportedAt:new Date().toISOString(),
    recipes:validateLibrary(recipes,{allowMissingOutput:true})},null,2);
}
export function parseRecipeImport(input){
  const data=typeof input==='string'?JSON.parse(input):input;
  if(!data||data.format!=='alchemy-workbench-recipes'||data.schema!==1)throw Error('Not a compatible Alchemy recipe library export.');
  return validateLibrary(data.recipes,{allowMissingOutput:true});
}
export function recipeWarnings(recipes,outputMappings={}){
  const warnings=[];
  const outputs=new Map();
  for(const r of recipes){
    const uuid=r.outputUuid||outputMappings[r.id]||'';
    if(!uuid)warnings.push({id:r.id,name:r.name,reason:'No output Item linked; crafting uses a basic consumable fallback.'});
    else if(outputs.has(uuid))warnings.push({id:r.id,name:r.name,reason:'Shares output Item with '+outputs.get(uuid)+'.'});
    else outputs.set(uuid,r.name);
  }
  return warnings;
}
export function recipeTest(recipe,batch,inventory,rules=null){
  const size=Number(batch);
  const cap=rules?.maxBatch??100;
  if(!Number.isSafeInteger(size)||size<1||size>cap)throw Error('Test batch size must be 1–'+cap+'.');
  const required=Object.fromEntries(Object.entries(recipe.cost).map(([k,q])=>[k,q*size]));
  const base={batch:size,requirements:required,tier:recipeTier(recipe),dc:recipeDC(recipe,rules),hours:recipeHours(recipe,rules),
    maximumCraftable:maximumCraftableBatch(recipe,inventory,cap)};
  try{return {...base,craftable:true,plan:planRecipe(recipe,size,inventory)};}
  catch(error){return {...base,craftable:false,reason:error.message,plan:null};}
}
