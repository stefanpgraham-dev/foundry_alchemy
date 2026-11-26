/* World-folder and compendium Item discovery for Foundry v14.
 * Pure scanDirectories handles supplied Item documents; scanConfiguredSources
 * loads selected packs and resolves external Item links when a GM refreshes. */
import {KEYS} from './engine.mjs';

const CATEGORIES=new Set(KEYS);
const normalize=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const list=value=>[...new Set(Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.trim()):[])];
// Maps familiar D&D 5e item rarities to alchemical ingredient tiers.
export const defaultRarityMap=()=>({
 common:'common',uncommon:'common',rare:'rare',
 veryrare:'exotic',legendary:'exotic',artifact:'exotic'
});
export const defaultDirectoryConfig=()=>({
 herbFolderId:'',reagentFolderId:'',potionFolderId:'',herbPackIds:[],reagentPackIds:[],potionPackIds:[],
 includeSubfolders:true,rarityMap:defaultRarityMap()
});
export const normalizeDirectoryConfig=config=>({
 ...defaultDirectoryConfig(),...(config||{}),
 herbPackIds:list(config?.herbPackIds),reagentPackIds:list(config?.reagentPackIds),potionPackIds:list(config?.potionPackIds),
 rarityMap:Object.fromEntries(Object.entries({
  ...defaultRarityMap(),...(config?.rarityMap||{})
 }).map(([key,value])=>[key,['common','rare','exotic','unknown'].includes(value)?value:defaultRarityMap()[key]||'unknown']))
});
/** Resolve dnd5e's system.rarity and system.rarities without inventing a reagent type. */
export function herbRarity(item,config={}){
 const sys=item?.system||{},tiers=new Set(['common','rare','exotic']);
 const explicit=[sys.alchemyTier,sys.alchemy?.tier].find(v=>typeof v==='string'&&tiers.has(normalize(v).replace(/ /g,'')));
 if(explicit)return {rarity:normalize(explicit).replace(/ /g,''),sourceRarity:''};
 const input=[sys.rarities,sys.rarity,sys.type?.rarity].find(v=>
  typeof v==='string'&&v.trim()||Array.isArray(v)&&v.length||
  v&&typeof v==='object'&&typeof v.value==='string');
 const values=Array.isArray(input)?input:[input?.value||input];
 const tokens=values.filter(v=>typeof v==='string'&&v.trim()).map(v=>normalize(v).replace(/ /g,''));
 if(!tokens.length)return {rarity:'unknown',sourceRarity:''};
 const map=normalizeDirectoryConfig(config).rarityMap;
 const mapped=tokens.map(v=>tiers.has(v)?v:map[v]||'unknown');
 const rank={unknown:0,common:1,rare:2,exotic:3};
 const rarity=mapped.sort((a,b)=>rank[b]-rank[a])[0];
 const pretty=v=>({veryrare:'Very Rare',uncommon:'Uncommon',common:'Common',rare:'Rare',legendary:'Legendary',artifact:'Artifact',exotic:'Exotic'}[v]||
  v.replace(/(^|\s)\w/g,x=>x.toUpperCase()));
 return {rarity,sourceRarity:tokens.map(pretty).join(', ')};
}
export function reagentKeyFromName(name){
 const text=normalize(name).replace(/^(?:alchemical )?reagent /,'').replace(/ reagent$/,'');
 const match=/^(common|rare|exotic) (curative|poisonous|reactive)$/.exec(text);
 if(!match)return null;
 const key=match[1]+'_'+match[2];
 return CATEGORIES.has(key)?key:null;
}
export function itemFolders(world){
 return [...(world?.folders?.contents||[])].filter(folder=>folder.type==='Item');
}
export function folderLabel(folder,world){
 const byId=new Map(itemFolders(world).map(item=>[item.id,item]));
 let name=folder.name,parent=folder.folder?.id||folder.folder;
 const visited=new Set([folder.id]);
 while(parent&&byId.has(parent)&&!visited.has(parent)){
  const ancestor=byId.get(parent);
  name=ancestor.name+' / '+name;
  visited.add(parent);parent=ancestor.folder?.id||ancestor.folder;
 }
 return name;
}
export function folderItems(world,folderId,recursive=true){
 const byId=new Map(itemFolders(world).map(folder=>[folder.id,folder]));
 if(!folderId||!byId.has(folderId))return [];
 const ids=new Set([folderId]);
 if(recursive){
  let added=true;
  while(added){
   added=false;
   for(const folder of byId.values()){
    const parent=folder.folder?.id||folder.folder;
    if(parent&&ids.has(parent)&&!ids.has(folder.id)){ids.add(folder.id);added=true;}
   }
  }
 }
 return [...(world?.items?.contents||[])].filter(item=>ids.has(item.folder?.id||item.folder));
}
/** Read explicit Foundry links; ordinary description words never create an output. */
export function descriptionLinks(html){
 const content=String(html||''),links=[],seen=new Set();
 const add=(uuid,label='')=>{
  const raw=String(uuid||'').trim();
  if(!raw||seen.has(raw))return;
  seen.add(raw);
  links.push({uuid:raw,label:String(label||'').replace(/<[^>]*>/g,'').trim()});
 };
 for(const match of content.matchAll(/@UUID\[([^\]]+)\](?:\{([^}]*)\})?/g))add(match[1],match[2]);
 for(const match of content.matchAll(/@Item\[([^\]]+)\](?:\{([^}]*)\})?/g))add('Item.'+match[1],match[2]);
 for(const match of content.matchAll(/@Compendium\[([^\]]+)\](?:\{([^}]*)\})?/g)){
  const name=match[1],parts=name.split('.');
  if(parts.length>=3)add('Compendium.'+parts.slice(0,-1).join('.')+'.Item.'+parts.at(-1),match[2]);
 }
 for(const match of content.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)){
  const attributes=match[1];
  let uuid=/\bdata-uuid\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
  if(!uuid&&/\bcontent-link\b/i.test(attributes)){
   const id=/\bdata-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
   const pack=/\bdata-pack\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
   const type=/\bdata-type\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]||'Item';
   if(id)uuid=pack?'Compendium.'+pack+'.'+type+'.'+id:'Item.'+id;
  }
  if(uuid)add(uuid,match[2]);
 }
 return links;
}
/** Supported provenance fields of compendium imports and module-created copies. */
export function sourceAliases(item){
 const entries=[
  item?.uuid,item?.flags?.core?.sourceId,item?._stats?.compendiumSource,
  item?.system?.source?.uuid,item?.flags?.['alchemy-workbench']?.sourceUuid
 ].filter(x=>typeof x==='string'&&/^(Item|Compendium)\./.test(x));
 return [...new Set(entries)];
}
const issue=(type,item,problem,severity='error')=>({
 type,itemUuid:item?.uuid||'',name:item?.name||type,problem,severity
});
const equalHerb=(a,b)=>a.name===b.name&&a.rarity===b.rarity&&a.sourceRarity===b.sourceRarity&&a.sourceUuid===b.sourceUuid
 &&JSON.stringify(a.reagents)===JSON.stringify(b.reagents);
/** Return selectable Item compendiums. Never scan all packs implicitly. */
export function itemPacks(packs){
 const collection=packs?.contents||[...(packs||[])];
 return [...collection].filter(pack=>pack.documentName==='Item'||pack.metadata?.type==='Item'||pack.metadata?.documentName==='Item');
}
export function packLabel(pack){
 return pack?.metadata?.label||pack?.title||pack?.collection||'Unnamed Item compendium';
}
/** A narrow, explicit set of equivalent published D&D item names.
 * No fuzzy substring matching: a fire-resistance formula must never silently
 * produce an unspecialised Potion of Resistance. */
export function potionNameKey(name){
 let key=normalize(String(name??'').replace(/[\u2018\u2019']/g,''));
 key=key.replace(/\bphilter\b/g,'philtre');
 if(key==='poison basic')return 'basic poison';
 if(key==='crawler mucus')return 'carrion crawler mucus';
 const healing=/^potion of healing (greater|superior|supreme)$/.exec(key);
 if(healing)return 'potion of '+healing[1]+' healing';
 const resistance=/^potion of resistance (acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)$/.exec(key);
 if(resistance)return 'potion of '+resistance[1]+' resistance';
 return key;
}
/** A large equipment pack is not a potion catalogue. Include consumables plus
 * non-consumable homebrew Items that are clearly named for alchemy outputs. */
const alchemyItem=item=>item?.type==='consumable'||!item?.type||
 /\b(potion|poison|antitoxin|acid|philtre|philter|serum|venom|tincture|mucus|fumes)\b/i.test(item.name||'');
/** Resolve a *real* duplicate only when one source is demonstrably preferred:
 * a proven World import; modern SRD over legacy SRD; or the DMG magic potion
 * over the separate PHB adventuring-gear version in the same equipment24 pack. */
export function selectPotionCandidate(matches,previousUuid=''){
 if(matches.length<=1)return matches[0]||null;
 const known=matches.find(item=>item.uuid===previousUuid);
 if(known)return known;
 const worlds=matches.filter(item=>item.uuid.startsWith('Item.'));
 if(worlds.length===1&&matches.every(item=>item===worlds[0]||sourceAliases(worlds[0]).includes(item.uuid)))
  return worlds[0];
 if(worlds.length)return null; // Distinct World templates must not be guessed.
 let eligible=matches.filter(item=>item.type==='consumable');
 if(!eligible.length)eligible=matches;
 if(eligible.length===1)return eligible[0];
 const modern=eligible.filter(item=>String(item.system?.source?.rules||'').trim()==='2024');
 if(modern.length===1)return modern[0];
 if(modern.length>1)eligible=modern;
 const pack=uuid=>uuid.replace(/^Compendium\./,'').split('.').slice(0,2).join('.');
 const onePack=new Set(eligible.map(item=>pack(item.uuid))).size===1;
 if(onePack&&eligible.length===2&&pack(eligible[0].uuid)==='dnd5e.equipment24'){
  const dmg=eligible.filter(item=>/^dmg/i.test(item.id||item._id||item.uuid.split('.').at(-1)));
  const phb=eligible.filter(item=>/^phb/i.test(item.id||item._id||item.uuid.split('.').at(-1)));
  if(dmg.length===1&&phb.length===1)return dmg[0];
 }
 return null;
}
/** Match existing recipes to selected potion templates without inventing
 * missing Items or replacing explicit GM output choices. */
export function matchPotionRecipes(recipes=[],items=[],mappings={}){
 const candidates=new Map(),issues=[],updatedRecipes=[],outputs={},autoOutputs={};
 const results=[],unique=new Map(items.filter(x=>x?.uuid&&x?.name).map(x=>[x.uuid,x]));
 const available=[...unique.values()].filter(alchemyItem);
 const catalog=available.map(item=>({uuid:item.uuid,name:item.name,img:item.img||'',type:item.type||''}))
  .sort((a,b)=>a.name.localeCompare(b.name)||a.uuid.localeCompare(b.uuid));
 for(const item of available){
  const key=potionNameKey(item.name);
  if(!candidates.has(key))candidates.set(key,[]);
  candidates.get(key).push(item);
 }
 for(const recipe of recipes){
  const oldUuid=recipe.outputUuid||mappings.outputs?.[recipe.id]||'';
  const tracked=Boolean(oldUuid&&mappings.autoOutputs?.[recipe.id]===oldUuid);
  if(oldUuid&&!tracked){
   outputs[recipe.id]=oldUuid;
   updatedRecipes.push({...recipe,outputUuid:oldUuid});
   results.push({id:recipe.id,name:recipe.name,status:'manual',uuid:oldUuid});
   continue;
  }
  const matches=candidates.get(potionNameKey(recipe.name))||[];
  const found=selectPotionCandidate(matches,tracked?oldUuid:'');
  if(found){
   outputs[recipe.id]=found.uuid;
   autoOutputs[recipe.id]=found.uuid;
   updatedRecipes.push({...recipe,outputUuid:found.uuid,outputName:found.name});
   results.push({id:recipe.id,name:recipe.name,status:'automatic',uuid:found.uuid});
  }else{
   if(oldUuid){outputs[recipe.id]=oldUuid;autoOutputs[recipe.id]=oldUuid;}
   updatedRecipes.push({...recipe,outputUuid:oldUuid});
   const status=matches.length>1?'ambiguous':oldUuid?'retained':'missing';
   results.push({id:recipe.id,name:recipe.name,status,uuid:oldUuid});
   if(status==='ambiguous')
    issues.push(issue('potion',{name:recipe.name},
     'Multiple different Item templates match this recipe. Choose the intended output explicitly in Recipes.','warning'));
   else issues.push(issue('potion',{name:recipe.name},
    oldUuid?'No matching Item in the new potion sources; the previously linked output was retained.':
    'No matching potion Item in the selected sources. Choose another Item compendium or link an output manually.','warning'));
  }
 }
 const counts={
  mappedPotions:Object.keys(outputs).length,
  automaticPotions:results.filter(x=>x.status==='automatic').length,
  manualPotions:results.filter(x=>x.status==='manual').length,
  retainedPotions:results.filter(x=>x.status==='retained'||x.status==='ambiguous'&&x.uuid).length,
  missingPotions:results.filter(x=>!x.uuid).length,
  ambiguousPotions:results.filter(x=>x.status==='ambiguous').length
 };
 return {catalog,outputs,autoOutputs,updatedRecipes,issues,recipeResults:results,...counts};
}
/**
 * Pure scan. "sources" contains documents already loaded from the chosen
 * compendiums and document refs resolved from herb descriptions.
 */
export function scanDirectories(world,config,previous={},sources={}){
 const selected=normalizeDirectoryConfig(config);
 const folders=new Map(itemFolders(world).map(folder=>[folder.id,folder]));
 for(const [id,type,packs] of [
  [selected.herbFolderId,'herb',selected.herbPackIds],
  [selected.reagentFolderId,'reagent',selected.reagentPackIds],
  [selected.potionFolderId,'potion',selected.potionPackIds]
 ]){
  if(id&&!folders.has(id))throw new Error('Selected '+type+' World Item folder no longer exists.');
  if(type!=='potion'&&!id&&!packs.length)throw new Error('Choose a World Item folder and/or an Item compendium for '+type+'s.');
 }
 const plants=[...folderItems(world,selected.herbFolderId,selected.includeSubfolders),...(sources.herbs||[])];
 const materials=[...folderItems(world,selected.reagentFolderId,selected.includeSubfolders),...(sources.reagents||[])];
 const potions=[...folderItems(world,selected.potionFolderId,selected.includeSubfolders),...(sources.potions||[])];
 const potionSourceSelected=Boolean(selected.potionFolderId||selected.potionPackIds.length);
 const references=new Map([...(world?.items?.contents||[]),...plants,...materials,...(sources.references||[])]
   .filter(x=>x?.uuid).map(x=>[x.uuid,x]));
 const issues=[...(sources.issues||[])];
 if(potionSourceSelected&&selected.potionFolderId&&
  [selected.herbFolderId,selected.reagentFolderId].includes(selected.potionFolderId))
  issues.push(issue('folders',folders.get(selected.potionFolderId),'Potion source shares a herb/reagent folder; distinct folders are recommended.','warning'));
 const matchedPotions=potionSourceSelected?
  matchPotionRecipes(previous.recipes||[],potions,previous.mappings||{}):
  {catalog:[],outputs:{},autoOutputs:{},updatedRecipes:previous.recipes||[],issues:[],
   mappedPotions:(previous.recipes||[]).filter(r=>r.outputUuid||previous.mappings?.outputs?.[r.id]).length,
    automaticPotions:0,manualPotions:0,retainedPotions:0,missingPotions:0,ambiguousPotions:0,
    recipeResults:[]};
 issues.push(...matchedPotions.issues);
 if(selected.herbFolderId&&selected.herbFolderId===selected.reagentFolderId)issues.push(
  issue('folders',folders.get(selected.herbFolderId),'Herbs and reagents share a folder; separate folders are recommended.','warning')
 );
 const old=previous.mappings?.reagents||{};
 const overrides=previous.mappings?.reagentOverrides||{};
 const candidates=new Map(KEYS.map(key=>[key,[]]));
 const byUUID=new Map(materials.filter(x=>x?.uuid).map(x=>[x.uuid,x]));
 for(const material of materials){
  const key=reagentKeyFromName(material.name)||
   (CATEGORIES.has(material.getFlag?.('alchemy-workbench','category'))?material.getFlag('alchemy-workbench','category'):null);
  if(key)candidates.get(key).push(material);
  else issues.push(issue('reagent',material,'Unclassified reagent Item. Map it manually or give it a standard reagent name.','warning'));
 }
 const reagentMappings={},reagentNames={},reagentAliases={},used=new Set();
 for(const key of KEYS){
  const found=candidates.get(key);
  const manualUuid=overrides[key];
  const manual=manualUuid&&(references.get(manualUuid)||byUUID.get(manualUuid));
  const mapped=old[key]&&(byUUID.get(old[key])||references.get(old[key]));
  let chosen=manual||found.find(item=>item.uuid===old[key])||mapped;
  // Deterministic world-first default, preserving explicit GM mappings.
  if(!chosen)chosen=found.find(item=>item.uuid?.startsWith('Item.'))||found[0];
  if(found.length>1)issues.push(issue('reagent',chosen||found[0],
   'Multiple reagent Items classify as '+key.replace('_',' ')+'. Kept the authoritative mapping; other copies are accepted as aliases.','warning'));
  if(chosen&&used.has(chosen.uuid)){
   issues.push(issue('reagent',chosen,'This Item was mapped to multiple reagent types.','error'));chosen=null;
  }
  if(chosen){
   used.add(chosen.uuid);
   reagentMappings[key]=chosen.uuid;
   reagentNames[key]=chosen.name;
   reagentAliases[key]=[...new Set([...
    sourceAliases(chosen),
    ...found.flatMap(sourceAliases)
   ])];
  }else issues.push(issue('reagent',{name:key.replace('_',' ')},'No Item mapped to this reagent classification.','warning'));
 }
 // The actual link or its resolved Item must agree with an authoritative type.
 const byAlias=new Map();
 const addAlias=(uuid,key)=>{
  if(!uuid)return;
  if(!byAlias.has(uuid))byAlias.set(uuid,new Set());
  byAlias.get(uuid).add(key);
 };
 for(const [key,uuids] of Object.entries(reagentAliases))for(const uuid of uuids)addAlias(uuid,key);
 const herbs=[],herbMappings={},herbNames={},herbAliases={};
 // Parse each real Item first. A duplicated "Original Source" is not an
 // identity: World Item UUIDs distinguish newly created herbs.
 const prepared=[];
 const uniquePlants=new Map(plants.filter(item=>item?.uuid).map(item=>[item.uuid,item]));
 for(const item of uniquePlants.values()){
  const found=new Set(),broken=[],links=descriptionLinks(item.system?.description?.value);
  for(const link of links){
   const referenced=references.get(link.uuid);
   let matches=new Set(byAlias.get(link.uuid)||[]);
   if(referenced?.documentName==='Item'||referenced?.system){
    for(const alias of sourceAliases(referenced)){
     for(const key of byAlias.get(alias)||[])matches.add(key);
    }
    const byName=reagentKeyFromName(referenced.name);
    if(byName&&reagentMappings[byName])matches.add(byName);
    for(const [key,name] of Object.entries(reagentNames)){
     if(normalize(name)===normalize(referenced.name))matches.add(key);
    }
   }
   if(matches.size===1){found.add([...matches][0]);continue;}
   if(matches.size>1){broken.push('Ambiguous reagent reference '+(link.label||link.uuid));continue;}
   if(reagentKeyFromName(link.label)||reagentKeyFromName(referenced?.name)||/\breagent\b/i.test(link.label))
    broken.push('Unmapped or broken reagent link '+(link.label||link.uuid));
  }
  for(const problem of broken)issues.push(issue('herb',item,problem,'error'));
  if(!found.size){
   issues.push(issue('herb',item,links.length?'No linked reagent resolves to a configured reagent Item.':'No linked reagent Items found in Description.','error'));
   continue;
  }
  const rarity=herbRarity(item,selected);
  const id=item.uuid.startsWith('Item.')?'world-'+item.id:'pack-'+item.uuid.replace(/[^A-Za-z0-9_-]/g,'_');
  const herb={id,name:item.name,rarity:rarity.rarity,sourceRarity:rarity.sourceRarity,
   reagents:KEYS.filter(key=>found.has(key)),sourceUuid:item.uuid,img:item.img||''};
  prepared.push({item,herb,aliases:sourceAliases(item)});
 }
 // Consolidate only an actual World import with its selected Compendium original
 // when name, tiers AND outputs match. Never consolidate two World Items,
 // and never consolidate different herbs solely for sharing provenance.
 const matchingProfile=(a,b)=>normalize(a.name)===normalize(b.name)&&a.rarity===b.rarity
  &&JSON.stringify(a.reagents)===JSON.stringify(b.reagents);
 const byPrepared=new Map(prepared.map(entry=>[entry.item.uuid,entry]));
 const suppressed=new Set(),combined=new Map();
 for(const source of prepared.filter(p=>p.item.uuid.startsWith('Compendium.'))){
  const matches=prepared.filter(candidate=>candidate.item.uuid.startsWith('Item.')&&
   candidate.aliases.includes(source.item.uuid)&&matchingProfile(candidate.herb,source.herb));
  if(matches.length!==1)continue;
  // A World Item should only absorb one compendium original.
  const target=matches[0];
  if(combined.has(target.item.uuid))continue;
  suppressed.add(source.item.uuid);
  combined.set(target.item.uuid,source);
 }
 const retained=prepared.filter(entry=>!suppressed.has(entry.item.uuid));
 const usedAliases=new Map();
 for(const entry of retained){
  const extra=combined.get(entry.item.uuid)?.aliases||[];
  entry.aliases=[...new Set([...entry.aliases,...extra])];
  for(const alias of entry.aliases){
   if(!usedAliases.has(alias))usedAliases.set(alias,new Set());
   usedAliases.get(alias).add(entry.item.uuid);
  }
 }
 for(const entry of retained){
  const contested=entry.aliases.filter(alias=>usedAliases.get(alias)?.size>1);
  if(contested.length){
   issues.push(issue('herb',entry.item,
    'Original Source is shared with another distinct herb ('+contested.join(', ')+'). Kept this Item separately; ambiguous source aliases will not be used for inventory matching.','warning'));
  }
  // A conflicting provenance must not map one copied Item to two herbs.
  const aliases=entry.aliases.filter(alias=>alias===entry.item.uuid||usedAliases.get(alias)?.size===1);
  herbs.push(entry.herb);
  herbMappings[entry.herb.id]=entry.item.uuid;
  herbNames[entry.herb.id]=entry.item.name;
  herbAliases[entry.herb.id]=aliases;
 }
 herbs.sort((a,b)=>a.name.localeCompare(b.name));
 // Same-named but unrelated Items require provenance: name-only matching
 // would count one inventory stack multiple times.
 const names=new Map();
 for(const herb of herbs){
  const name=normalize(herb.name);
  names.set(name,[...(names.get(name)||[]),herb]);
 }
 for(const entries of names.values())if(entries.length>1){
  for(const entry of entries)issues.push(issue('herb',{uuid:entry.sourceUuid,name:entry.name},
   'Another selected herb has the same name but a different source. Actor copies require source metadata for unambiguous matching.','warning'));
 }
 const oldById=new Map((previous.herbs||[]).map(h=>[h.id,h])),newById=new Map(herbs.map(h=>[h.id,h]));
 const added=herbs.filter(h=>!oldById.has(h.id)).map(h=>h.name);
 const changed=herbs.filter(h=>oldById.has(h.id)&&!equalHerb(h,oldById.get(h.id))).map(h=>h.name);
 const removed=(previous.herbs||[]).filter(h=>!newById.has(h.id)).map(h=>h.name);
 return{
  herbs,herbMappings,herbNames,herbAliases,reagentMappings,reagentNames,reagentAliases,
  potionCatalog:matchedPotions.catalog,potionMappings:matchedPotions.outputs,
   potionRecipeResults:matchedPotions.recipeResults,
  autoPotionMappings:matchedPotions.autoOutputs,updatedRecipes:matchedPotions.updatedRecipes,
  report:{
   herbFolderId:selected.herbFolderId,reagentFolderId:selected.reagentFolderId,potionFolderId:selected.potionFolderId,
   herbPackIds:selected.herbPackIds,reagentPackIds:selected.reagentPackIds,potionPackIds:selected.potionPackIds,
   herbItems:plants.length,reagentItems:materials.length,potionItems:matchedPotions.catalog.length,
   potionSourceItems:potions.length,recipeResults:matchedPotions.recipeResults,
   mappedPotions:matchedPotions.mappedPotions,automaticPotions:matchedPotions.automaticPotions,
   manualPotions:matchedPotions.manualPotions,missingPotions:matchedPotions.missingPotions,
   retainedPotions:matchedPotions.retainedPotions,ambiguousPotions:matchedPotions.ambiguousPotions,
   validHerbs:herbs.length,
   mappedReagents:Object.keys(reagentMappings).length,added,changed,removed,issues,
   scannedAt:new Date().toISOString()
  }
 };
}
/** Foundry adapter: load selected Item packs, resolve external UUID references,
 * then let the pure scanner validate and map the full collection. */
export async function scanConfiguredSources(world,config,previous={}, {packs,resolveUuid}={}){
 const selected=normalizeDirectoryConfig(config);
 const available=itemPacks(packs);
 const map=new Map(available.map(p=>[p.collection,p]));
 async function load(ids,type){
  const docs=[];
  for(const id of ids){
   const pack=map.get(id);
   if(!pack)throw new Error(type+' Item compendium is unavailable: '+id);
   if(typeof pack.getDocuments!=='function')throw new Error('Cannot load Item compendium '+id);
   let loaded;
   try{loaded=await pack.getDocuments();}
   catch(error){throw new Error('Unable to read '+id+': '+(error?.message||error));}
   docs.push(...loaded.filter(item=>item?.documentName==='Item'||item?.system));
  }
  return docs;
 }
 const herbs=await load(selected.herbPackIds,'Herb');
 const reagents=await load(selected.reagentPackIds,'Reagent');
 const potions=await load(selected.potionPackIds,'Potion');
 const worldHerbs=folderItems(world,selected.herbFolderId,selected.includeSubfolders);
 const pool=[...herbs,...reagents,...potions,...worldHerbs,...folderItems(world,selected.reagentFolderId,selected.includeSubfolders),...folderItems(world,selected.potionFolderId,selected.includeSubfolders)];
 const have=new Map(pool.filter(x=>x?.uuid).map(x=>[x.uuid,x]));
 const uuids=new Set([
  ...pool.flatMap(x=>sourceAliases(x)),
  ...[...worldHerbs,...herbs].flatMap(item=>descriptionLinks(item.system?.description?.value).map(x=>x.uuid)),
  ...Object.values(previous.mappings?.reagents||{}),
  ...Object.values(previous.mappings?.reagentOverrides||{})
 ].filter(Boolean));
 const references=[];
 const resolver=resolveUuid||globalThis.fromUuid;
 for(const uuid of uuids){
  if(have.has(uuid))continue;
  if(typeof resolver!=='function')continue;
  try{
   const doc=await resolver(uuid);
   if(doc?.documentName==='Item'||doc?.system){references.push(doc);have.set(uuid,doc);}
  }catch{/* Broken references are exposed by the pure scan validation. */}
 }
 return scanDirectories(world,selected,previous,{herbs,reagents,potions,references});
}
