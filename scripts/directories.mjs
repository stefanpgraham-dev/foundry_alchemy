/* Folder-driven herb/reagent discovery. Pure logic for Foundry v14 and Node tests. */
import {KEYS} from './engine.mjs';

const CATEGORIES=new Set(KEYS);
const normalize=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');

export const defaultDirectoryConfig=()=>({herbFolderId:'',reagentFolderId:'',includeSubfolders:true});

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
  let name=folder.name, parent=folder.folder?.id||folder.folder;
  const visited=new Set([folder.id]);
  while(parent && byId.has(parent) && !visited.has(parent)){
    const ancestor=byId.get(parent);
    name=ancestor.name+' / '+name;
    visited.add(parent);
    parent=ancestor.folder?.id||ancestor.folder;
  }
  return name;
}

export function folderItems(world,folderId,recursive=true){
  const byId=new Map(itemFolders(world).map(folder=>[folder.id,folder]));
  if(!folderId || !byId.has(folderId))return [];
  const ids=new Set([folderId]);
  if(recursive){
    let added=true;
    while(added){
      added=false;
      for(const folder of byId.values()){
        const parent=folder.folder?.id||folder.folder;
        if(parent && ids.has(parent) && !ids.has(folder.id)){
          ids.add(folder.id);
          added=true;
        }
      }
    }
  }
  return [...(world?.items?.contents||[])].filter(item=>ids.has(item.folder?.id||item.folder));
}

/** Extract explicit links, not incidental text mentioning reagent categories. */
export function descriptionLinks(html){
  const content=String(html||''), links=[], seen=new Set();
  const add=(uuid,label='')=>{
    const raw=String(uuid||'').trim();
    if(!raw)return;
    const canonical=raw.startsWith('Item.')||raw.startsWith('Compendium.')?raw:raw;
    const key=canonical+'|'+String(label);
    if(seen.has(key))return;
    seen.add(key);
    links.push({uuid:canonical,label:String(label||'').replace(/<[^>]*>/g,'').trim()});
  };
  for(const match of content.matchAll(/@UUID\[([^\]]+)\](?:\{([^}]*)\})?/g))add(match[1],match[2]);
  for(const match of content.matchAll(/@Item\[([^\]]+)\](?:\{([^}]*)\})?/g))add('Item.'+match[1],match[2]);
  for(const match of content.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)){
    const attributes=match[1];
    let uuid=/\bdata-uuid\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if(!uuid && /\bcontent-link\b/i.test(attributes)){
      const id=/\bdata-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
      if(id)uuid='Item.'+id;
    }
    if(uuid)add(uuid,match[2]);
  }
  return links;
}

const issue=(type,item,problem,severity='error')=>({
  type,itemUuid:item?.uuid||'',name:item?.name||type,problem,severity
});
const equalHerb=(a,b)=>a.name===b.name&&a.rarity===b.rarity&&a.sourceUuid===b.sourceUuid
  &&JSON.stringify(a.reagents)===JSON.stringify(b.reagents);

/**
 * @param {object} world {folders:{contents:Folder[]}, items:{contents:Item[]}}
 * @param {object} config chosen world Item folders
 * @param {object} previous {herbs:[],mappings:{reagents:{...}}}
 */
export function scanDirectories(world,config,previous={}){
  const selected={...defaultDirectoryConfig(),...(config||{})};
  const folders=new Map(itemFolders(world).map(folder=>[folder.id,folder]));
  if(!folders.has(selected.herbFolderId))throw new Error('Choose an existing World Item folder for herbs.');
  if(!folders.has(selected.reagentFolderId))throw new Error('Choose an existing World Item folder for reagents.');
  const plants=folderItems(world,selected.herbFolderId,selected.includeSubfolders);
  const materials=folderItems(world,selected.reagentFolderId,selected.includeSubfolders);
  const issues=[];
  if(selected.herbFolderId===selected.reagentFolderId)issues.push(
    issue('folders',folders.get(selected.herbFolderId),'Herbs and reagents use the same folder; separate folders are recommended.','warning')
  );

  const candidates=new Map(KEYS.map(key=>[key,[]]));
  const byUUID=new Map(materials.map(item=>[item.uuid,item]));
  for(const item of materials){
    const key=reagentKeyFromName(item.name);
    if(key)candidates.get(key).push(item);
    else issues.push(issue('reagent',item,'Name does not identify a Common/Rare/Exotic Curative/Poisonous/Reactive reagent. Use manual reagent mapping or rename the Item.','warning'));
  }
  const old=previous.mappings?.reagents||{};
  const reagentMappings={},reagentNames={};
  const known=new Set();
  for(const key of KEYS){
    const candidatesForKey=candidates.get(key);
    const manual=old[key]&&byUUID.has(old[key])?byUUID.get(old[key]):null;
    let chosen;
    if(candidatesForKey.length===1)chosen=candidatesForKey[0];
    else if(candidatesForKey.length>1){
      chosen=candidatesForKey.find(item=>item.uuid===old[key]);
      issues.push(issue('reagent',chosen||candidatesForKey[0],'Multiple reagent Items classify as '+key.replace('_',' ')+'. Choose an authoritative Item in Reagent Mappings.','warning'));
    }else if(manual)chosen=manual;
    if(chosen && known.has(chosen.uuid)){
      issues.push(issue('reagent',chosen,'This Item is assigned to multiple reagent classifications.','error'));
      chosen=null;
    }
    if(chosen){
      known.add(chosen.uuid);
      reagentMappings[key]=chosen.uuid;
      reagentNames[key]=chosen.name;
    }else issues.push(issue('reagent',{name:key.replace('_',' ')},'No Item mapped to this required reagent classification.','warning'));
  }

  const byMappedUuid=new Map(Object.entries(reagentMappings).map(([key,uuid])=>[uuid,key]));
  const herbs=[],herbMappings={},herbNames={};
  for(const item of plants){
    const links=descriptionLinks(item.system?.description?.value);
    const found=new Set(),broken=[];
    for(const link of links){
      const key=byMappedUuid.get(link.uuid);
      if(key){found.add(key);continue;}
      // Links to unrelated lore or non-reagent Items need not be ingredient properties.
      const referenced=byUUID.get(link.uuid);
      const hint=reagentKeyFromName(link.label)||reagentKeyFromName(referenced?.name)
        ||/\breagent\b/i.test(link.label);
      if(hint)broken.push(link.label||link.uuid);
    }
    for(const label of broken)issues.push(issue('herb',item,'Unmapped or broken reagent Item link: '+label+'.','error'));
    if(!found.size){
      issues.push(issue('herb',item,links.length?'No linked reagent resolves to a mapped reagent Item.':'No linked reagent Items found in Description.','error'));
      continue;
    }
    const rarity=normalize(item.system?.rarity||item.system?.type?.rarity||'unknown')||'unknown';
    const id='world-'+item.id;
    const herb={id,name:item.name,rarity,reagents:KEYS.filter(key=>found.has(key)),sourceUuid:item.uuid,img:item.img||''};
    herbs.push(herb);
    herbMappings[id]=item.uuid;
    herbNames[id]=item.name;
  }
  herbs.sort((a,b)=>a.name.localeCompare(b.name));
  const oldById=new Map((previous.herbs||[]).map(h=>[h.id,h]));
  const newById=new Map(herbs.map(h=>[h.id,h]));
  const added=herbs.filter(h=>!oldById.has(h.id)).map(h=>h.name);
  const changed=herbs.filter(h=>oldById.has(h.id)&&!equalHerb(h,oldById.get(h.id))).map(h=>h.name);
  const removed=(previous.herbs||[]).filter(h=>!newById.has(h.id)).map(h=>h.name);
  return {
    herbs,herbMappings,herbNames,reagentMappings,reagentNames,
    report:{
      herbFolderId:selected.herbFolderId,reagentFolderId:selected.reagentFolderId,
      herbItems:plants.length,reagentItems:materials.length,validHerbs:herbs.length,
      mappedReagents:Object.keys(reagentMappings).length,
      added,changed,removed,issues,
      scannedAt:new Date().toISOString()
    }
  };
}
