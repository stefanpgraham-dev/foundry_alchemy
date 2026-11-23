/* World-folder and compendium Item discovery for Foundry v14.
 * Pure scanDirectories handles supplied Item documents; scanConfiguredSources
 * loads selected packs and resolves external Item links when a GM refreshes. */
import {KEYS} from './engine.mjs';

const CATEGORIES=new Set(KEYS);
const normalize=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const list=value=>[...new Set(Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.trim()):[])];
export const defaultDirectoryConfig=()=>({herbFolderId:'',reagentFolderId:'',herbPackIds:[],reagentPackIds:[],includeSubfolders:true});
export const normalizeDirectoryConfig=config=>({
 ...defaultDirectoryConfig(),...(config||{}),
 herbPackIds:list(config?.herbPackIds),reagentPackIds:list(config?.reagentPackIds)
});
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
const equalHerb=(a,b)=>a.name===b.name&&a.rarity===b.rarity&&a.sourceUuid===b.sourceUuid
 &&JSON.stringify(a.reagents)===JSON.stringify(b.reagents);
/** Return selectable Item compendiums. Never scan all packs implicitly. */
export function itemPacks(packs){
 const collection=packs?.contents||[...(packs||[])];
 return [...collection].filter(pack=>pack.documentName==='Item'||pack.metadata?.type==='Item'||pack.metadata?.documentName==='Item');
}
export function packLabel(pack){
 return pack?.metadata?.label||pack?.title||pack?.collection||'Unnamed Item compendium';
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
  [selected.reagentFolderId,'reagent',selected.reagentPackIds]
 ]){
  if(id&&!folders.has(id))throw new Error('Selected '+type+' World Item folder no longer exists.');
  if(!id&&!packs.length)throw new Error('Choose a World Item folder and/or an Item compendium for '+type+'s.');
 }
 const plants=[...folderItems(world,selected.herbFolderId,selected.includeSubfolders),...(sources.herbs||[])];
 const materials=[...folderItems(world,selected.reagentFolderId,selected.includeSubfolders),...(sources.reagents||[])];
 const references=new Map([...(world?.items?.contents||[]),...plants,...materials,...(sources.references||[])]
   .filter(x=>x?.uuid).map(x=>[x.uuid,x]));
 const issues=[...(sources.issues||[])];
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
 // Do not show the same imported Item twice when its original compendium
 // document and its World Item copy are both selected.
 const groupKey=item=>sourceAliases(item).find(x=>x.startsWith('Compendium.'))||item.uuid;
 const dedup=new Map();
 for(const item of plants){
  const group=groupKey(item);
  const existing=dedup.get(group);
  if(!existing||(!existing.uuid.startsWith('Item.')&&item.uuid.startsWith('Item.')))dedup.set(group,item);
 }
 for(const item of dedup.values()){
  const found=new Set(),broken=[];
  const links=descriptionLinks(item.system?.description?.value);
  for(const link of links){
   const referenced=references.get(link.uuid);
   let matches=new Set(byAlias.get(link.uuid)||[]);
   if(referenced?.documentName==='Item'||referenced?.system){
    for(const alias of sourceAliases(referenced)){
     for(const key of byAlias.get(alias)||[])matches.add(key);
    }
    const byName=reagentKeyFromName(referenced.name);
    if(byName&&reagentMappings[byName])matches.add(byName);
    // Custom-named linked Items can still resolve via the saved mapping name,
    // but only after the actual linked UUID has resolved to an Item.
    for(const [key,name] of Object.entries(reagentNames)){
     if(normalize(name)===normalize(referenced.name))matches.add(key);
    }
   }
   if(matches.size===1){found.add([...matches][0]);continue;}
   if(matches.size>1){
    broken.push('Ambiguous reagent reference '+(link.label||link.uuid));
    continue;
   }
   if(reagentKeyFromName(link.label)||reagentKeyFromName(referenced?.name)||/\breagent\b/i.test(link.label))
    broken.push('Unmapped or broken reagent link '+(link.label||link.uuid));
  }
  for(const problem of broken)issues.push(issue('herb',item,problem,'error'));
  if(!found.size){
   issues.push(issue('herb',item,links.length?'No linked reagent resolves to a configured reagent Item.':'No linked reagent Items found in Description.','error'));
   continue;
  }
  const rarity=normalize(item.system?.rarity||item.system?.type?.rarity||'unknown')||'unknown';
  const id=item.uuid.startsWith('Item.')?'world-'+item.id:
   'pack-'+item.uuid.replace(/[^A-Za-z0-9_-]/g,'_');
  const aliases=[...new Set(plants.filter(x=>groupKey(x)===groupKey(item)).flatMap(sourceAliases))];
  const herb={id,name:item.name,rarity,reagents:KEYS.filter(key=>found.has(key)),sourceUuid:item.uuid,img:item.img||''};
  herbs.push(herb);herbMappings[id]=item.uuid;herbNames[id]=item.name;herbAliases[id]=aliases;
 }
 herbs.sort((a,b)=>a.name.localeCompare(b.name));
 const oldById=new Map((previous.herbs||[]).map(h=>[h.id,h])),newById=new Map(herbs.map(h=>[h.id,h]));
 const added=herbs.filter(h=>!oldById.has(h.id)).map(h=>h.name);
 const changed=herbs.filter(h=>oldById.has(h.id)&&!equalHerb(h,oldById.get(h.id))).map(h=>h.name);
 const removed=(previous.herbs||[]).filter(h=>!newById.has(h.id)).map(h=>h.name);
 return{
  herbs,herbMappings,herbNames,herbAliases,reagentMappings,reagentNames,reagentAliases,
  report:{
   herbFolderId:selected.herbFolderId,reagentFolderId:selected.reagentFolderId,
   herbPackIds:selected.herbPackIds,reagentPackIds:selected.reagentPackIds,
   herbItems:plants.length,reagentItems:materials.length,validHerbs:herbs.length,
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
 const worldHerbs=folderItems(world,selected.herbFolderId,selected.includeSubfolders);
 const pool=[...herbs,...reagents,...worldHerbs,...folderItems(world,selected.reagentFolderId,selected.includeSubfolders)];
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
 return scanDirectories(world,selected,previous,{herbs,reagents,references});
}
