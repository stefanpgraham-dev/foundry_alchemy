import {KEYS,planRecipe,planRefine,assertQty} from './engine.mjs';
export const MID='alchemy-workbench';
export const setting=()=>game.settings.get(MID,'mappings');
export const getQty=item=>Math.max(0,Math.floor(Number(item?.system?.quantity??1)));
export const normal=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const templateId=doc=>doc?.uuid||'';
export async function template(uuid){
  if(!uuid)return null;
  const doc=await fromUuid(uuid);
  return doc?.documentName==='Item'?doc:null;
}
/** Copy-safe identity: actor Item UUIDs are intentionally never compared to their World Item UUID alone. */
export function identity(item,configured,key=null,mappedName='',aliases=[],allowNameFallback=true){
  if(!configured || !item)return false;
  const allowed=new Set([configured,...(Array.isArray(aliases)?aliases:[])]);
  // A stale classification from another world/template must not override the new mapping.
  const previousCategory=item.getFlag?.(MID,'category');
  const previousSource=item.getFlag?.(MID,'sourceUuid');
  if(key && previousCategory===key && (!previousSource || allowed.has(previousSource)))return true;
  const provenance=[
    item.getFlag?.(MID,'sourceUuid'),item.flags?.core?.sourceId,
    item._stats?.compendiumSource,item.system?.source?.uuid
  ];
  if(provenance.some(p=>p && allowed.has(p)))return true;
  if(allowed.has(item.uuid))return true;
  // Never use a non-unique name to classify items from distinct sources.
  if(!allowNameFallback)return false;
  // World Items gain different actor IDs. Use their stable template name as fallback.
  const source=configured.startsWith('Item.')?game.items?.get(configured.slice(5)):null;
  const names=[mappedName,source?.name].filter(Boolean);
  return names.some(n=>normal(n)===normal(item.name));
}
export function findMatchedInventory(actor,mappings,{selectedIds=null}={}){
  const chosen=selectedIds?new Set(selectedIds):null,found=[];
  for(const item of actor.items){
    if(getQty(item)<1 || (chosen&&!chosen.has(item.id)))continue;
    for(const [key,uuid] of Object.entries(mappings.reagents||{})){
      if(KEYS.includes(key)&&identity(item,uuid,key,mappings.reagentNames?.[key],mappings.reagentAliases?.[key])){
        found.push({id:item.id,key,quantity:getQty(item),item});break;
      }
    }
  }
  return found;
}
/**
 * Herb identity is stricter than reagent identity: duplicated/renamed World
 * herbs can inherit stale "Original Source" and old module classification
 * flags. The inventory name must match this herb, even when legacy
 * provenance points to another herb. Distinct same-name herbs still require
 * an unambiguous source match.
 */
export function herbIdentity(item,herb,mappings,allowNameFallback=true){
 const uuid=mappings.herbs?.[herb.id];
 if(!uuid||!item)return false;
 const expected=mappings.herbNames?.[herb.id]||herb.name;
 if(normal(item.name)!==normal(expected))return false;
 return identity(item,uuid,herb.id,expected,mappings.herbAliases?.[herb.id],allowNameFallback);
}
export function findHerbs(actor,mappings,herbs){
  const matched=[];
  const counts=new Map();
  for(const herb of herbs){
    const name=normal(mappings.herbNames?.[herb.id]||herb.name);
    counts.set(name,(counts.get(name)||0)+1);
  }
  for(const herb of herbs){
    const uuid=mappings.herbs?.[herb.id];if(!uuid)continue;
    for(const item of actor.items){
      if(getQty(item)>0 && herbIdentity(item,herb,mappings,
        counts.get(normal(mappings.herbNames?.[herb.id]||herb.name))===1)){
        matched.push({herb,item,quantity:getQty(item)});
      }
    }
  }
  return matched;
}
/** Explain unrecognised inventory records rather than showing an empty workbench. */
export function inventoryAudit(actor,mappings,herbs){
  const reagents=findMatchedInventory(actor,mappings);
  const foundHerbs=findHerbs(actor,mappings,herbs);
  const known=new Set([...reagents,...foundHerbs].map(x=>x.item.id));
  const unmapped=actor.items.contents.filter(it=>getQty(it)>0&&!known.has(it.id));
  return {reagents,herbs:foundHerbs,unmapped};
}
/** Stamp matched items with stable category metadata. GM-only and non-destructive. */
export async function markActorInventory(actor,mappings,herbs){
  const {reagents,herbs:plants}=inventoryAudit(actor,mappings,herbs);
  const updates=[];
  for(const row of [...reagents,...plants.map(x=>({...x,key:x.herb.id}))]){
    const sourceUuid=mappings.reagents?.[row.key]||mappings.herbs?.[row.key];
    if(row.item.getFlag?.(MID,'category')===row.key && row.item.getFlag?.(MID,'sourceUuid')===sourceUuid)continue;
    updates.push({_id:row.item.id,[`flags.${MID}.category`]:row.key,[`flags.${MID}.sourceUuid`]:sourceUuid});
  }
  if(updates.length)await actor.updateEmbeddedDocuments('Item',updates);
  return updates.length;
}
export async function sourceData(uuid, category=null){
 const t=await template(uuid);
 if(!t)throw new Error(`Mapped Item not found: ${uuid}`);
 const raw=t.toObject();for(const key of ['_id','id','_stats','folder','ownership','pack'])delete raw[key];
 raw.flags=raw.flags||{};
 raw.flags[MID]={...(raw.flags[MID]||{}),sourceUuid:uuid,...(category?{category}:{})};
 raw.system=raw.system||{};raw.system.quantity=1;
 return raw;
}
export async function outputData(kind,id,mappings,recipeName='') {
 const uuid=(kind==='reagent'?mappings.reagents?.[id]:
  kind==='herb'?mappings.herbs?.[id]:mappings.outputs?.[id])||'';
 if(uuid)return await sourceData(uuid,['reagent','herb'].includes(kind)?id:null);
 if(kind==='reagent'||kind==='herb')throw new Error(`Missing source Item mapping for ${kind}: ${id}`);
 // Item is deliberately mechanical-neutral when no configured world/compendium item exists.
 return {name:recipeName,type:'consumable',img:'icons/consumables/potions/potion-bottle-corked-red.webp',system:{quantity:1,description:{value:`Crafted using the Alchemy Workbench. Configure a potion output Item UUID in GM Setup for full activities and effects.`}},flags:{[MID]:{recipeId:id}}};
}
export function changeOutputs(plan){return Object.entries(plan.return||{}).map(([id,quantity])=>({kind:'reagent',id,quantity}));}
export function prepareItems(items,actor){
 const grouped=new Map();for(const entry of items){
  const item=actor.items.get(entry.id);if(!item)throw new Error('Ingredient item no longer exists.');
  grouped.set(entry.id,(grouped.get(entry.id)||0)+entry.quantity);
 }
 for(const [id,qty] of grouped){if(getQty(actor.items.get(id))<qty)throw new Error(`Insufficient quantity: ${actor.items.get(id).name}`);}
 return grouped;
}
/** Single-GM queued operation. No client-supplied item templates, quantities or arbitrary updates. */
export async function applyInventory(actor, consumed, outputs, mappings) {
 const qtyMap=prepareItems(consumed,actor);
 const originals=new Map([...qtyMap].map(([id])=>[id,getQty(actor.items.get(id))]));
 const staged=new Map();
 for(const out of outputs){
  const qty=Number(out.quantity);if(!Number.isSafeInteger(qty)||qty<0||qty>5000)throw new Error('Output exceeds safe quantity.');
  if(!qty)continue;
  const token=`${out.kind}:${out.id}`;
  if(staged.has(token))staged.get(token).quantity+=qty;
  else staged.set(token,{...out,quantity:qty});
 }
 const sources=[];
 for(const out of staged.values()){
  // Only GM-derived transactions supply snapshots. Pending brews keep their original output effects.
    const data=out.snapshot?structuredClone(out.snapshot):await outputData(out.kind,out.id,mappings,out.name||'Crafted Potion');
  sources.push({out,data,templateUuid:data.flags?.[MID]?.sourceUuid||'',id:out.id});
 }
 const updates=[];const created=[];let updated=false;
 // Depleted source items remain at zero until the transaction succeeds. This permits rollback.
 for(const [id,used] of qtyMap)updates.push({_id:id,'system.quantity':originals.get(id)-used});
 // Merge into unaffected matching stacks after accounting for input consumption.
 const additions=[];
 for(const {out,data,templateUuid,id} of sources){
  const matching=actor.items.contents.find(it=> !qtyMap.has(it.id) && getQty(it)>0 &&
    (templateUuid?identity(it,templateUuid,['reagent','herb'].includes(out.kind)?id:null,
      out.kind==='reagent'?mappings.reagentNames?.[id]:out.kind==='herb'?mappings.herbNames?.[id]:'',
      out.kind==='reagent'?mappings.reagentAliases?.[id]:out.kind==='herb'?mappings.herbAliases?.[id]:[]):it.getFlag?.(MID,'recipeId')===id));
  if(matching){
    const target=updates.find(u=>u._id===matching.id);
    if(target)target['system.quantity']+=out.quantity;
    else {originals.set(matching.id,getQty(matching));updates.push({_id:matching.id,'system.quantity':getQty(matching)+out.quantity});}
  }else {data.system.quantity=out.quantity;additions.push(data);}
 }
 try{
  if(updates.length){await actor.updateEmbeddedDocuments('Item',updates);updated=true;}
  if(additions.length){const docs=await actor.createEmbeddedDocuments('Item',additions);created.push(...docs.map(d=>d.id));}
 }catch(err){
  console.error(`${MID} inventory transaction failed`,err);
  if(created.length)try{await actor.deleteEmbeddedDocuments('Item',created);}catch(e){console.error('Rollback created items failed',e);}
  if(updated)try{await actor.updateEmbeddedDocuments('Item',[...originals].map(([id,q])=>({_id:id,'system.quantity':q})));}catch(e){console.error('Rollback quantities failed; GM intervention required',e);}
  throw err;
 }
 // Delete empty ingredient stacks only after all additions succeed.
 const empty=[...qtyMap].filter(([id])=>getQty(actor.items.get(id))===0).map(([id])=>id);
 if(empty.length)try{await actor.deleteEmbeddedDocuments('Item',empty);}catch(e){console.warn(`${MID}: empty ingredients left at zero`,e);}
 return {consumed:consumed.reduce((n,x)=>n+x.quantity,0),created:sources.map(s=>({id:s.out.id,quantity:s.out.quantity}))};
}
export function planBrew(actor,recipe,batch,mappings,selectedIds=null,change='highest'){
 return planRecipe(recipe,assertQty(batch),findMatchedInventory(actor,mappings,{selectedIds}),{change});
}
export function planExtract(actor,herbId,actorItemId,qty,herbs,mappings,reagentKey){
 const herb=herbs.find(h=>h.id===herbId);
 if(!herb || !herb.reagents.includes(reagentKey))throw new Error('This herb cannot produce the selected reagent.');
 const item=actor.items.get(actorItemId);
 const sameName=herbs.filter(h=>normal(mappings.herbNames?.[h.id]||h.name)===normal(mappings.herbNames?.[herb.id]||herb.name));
  if(!item || !herbIdentity(item,herb,mappings,sameName.length===1))throw new Error('That herb is not mapped to this item.');
 const quantity=assertQty(qty,1000);
 if(getQty(item)<quantity)throw new Error('Not enough herbs.');
 return {consume:[{id:item.id,quantity}],outputs:[{kind:'reagent',id:reagentKey,quantity}]};
}
export function planDowngrade(actor,itemId,qty,targetTier,mappings){
 const found=findMatchedInventory(actor,mappings).find(r=>r.id===itemId);
 if(!found)throw new Error('Choose a mapped reagent in your inventory.');
 const n=assertQty(qty,1000);
 if(n>found.quantity)throw new Error('Not enough reagents.');
 const result=planRefine(found.key,n,targetTier);
 return {consume:[{id:itemId,quantity:n}],outputs:[{kind:'reagent',id:result.key,quantity:result.quantity}]};
}
