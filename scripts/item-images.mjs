/* Read-only artwork lookup for World Items and compendium templates.
 * Recipe output UUIDs stay authoritative; images never affect crafting. */
export const FALLBACK_ITEM_IMAGE='icons/svg/item-bag.svg';

/** Foundry's Item UUID is Compendium.scope.pack.Item.documentId.
 * The ".Item" segment identifies the document type, NOT the pack name. */
export function compendiumItemReference(uuid){
 if(typeof uuid!=='string')return null;
 const match=/^Compendium\.(.+)\.Item\.([^\.]+)$/.exec(uuid);
 return match?{collection:match[1],id:match[2]}:null;
}

const image=value=>typeof value==='string'&&value.trim()?value:'';

/** A pure lookup: prefer already-scanned source documents (whose img fields
 * are available even when Foundry's lightweight pack index omits img). */
export function templateImage(uuid,{worldItems,packs,potions=[],herbs=[],mappings={}}={}){
 if(typeof uuid!=='string'||!uuid)return FALLBACK_ITEM_IMAGE;
 if(uuid.startsWith('Item.')){
  return image(worldItems?.get?.(uuid.slice(5))?.img)||FALLBACK_ITEM_IMAGE;
 }
 const savedOutputImage=image(mappings.outputImages?.[uuid]);
 if(savedOutputImage&&savedOutputImage!==FALLBACK_ITEM_IMAGE)return savedOutputImage;
 const selectedPotion=potions.find?.(p=>p?.uuid===uuid);
 if(image(selectedPotion?.img))return selectedPotion.img;
 const selectedHerb=herbs.find?.(h=>h?.sourceUuid===uuid);
 if(image(selectedHerb?.img))return selectedHerb.img;
 const reagentId=Object.entries(mappings.reagents||{}).find(([,sourceUuid])=>sourceUuid===uuid)?.[0];
 if(reagentId&&image(mappings.reagentImages?.[reagentId]))return mappings.reagentImages[reagentId];
 const ref=compendiumItemReference(uuid);
 if(ref){
  return image(packs?.get?.(ref.collection)?.index?.get?.(ref.id)?.img)||FALLBACK_ITEM_IMAGE;
 }
 return FALLBACK_ITEM_IMAGE;
}

/** Load artwork when a client's compendium index has not been hydrated.
 * Never substitutes an Item with a similarly named document. The exact
 * recipe UUID is the only key; failures return the core icon without throwing. */
export async function hydrateTemplateImages(uuids,context={}){
 const unique=[...new Set(uuids.filter(uuid=>typeof uuid==='string'&&uuid))];
 const results=new Map();
 const findImage=uuid=>templateImage(uuid,context);
 for(const uuid of unique){
  const src=findImage(uuid);
  if(src!==FALLBACK_ITEM_IMAGE)results.set(uuid,src);
 }
 let unresolved=unique.filter(uuid=>!results.has(uuid));
 // One lightweight image-index load per selected compendium, not per recipe.
 const collections=[...new Set(unresolved.map(uuid=>compendiumItemReference(uuid)?.collection).filter(Boolean))];
 await Promise.all(collections.map(async id=>{
  const pack=context.packs?.get?.(id);
  if(typeof pack?.getIndex!=='function')return;
  try{await pack.getIndex({fields:['img']});}
  catch{/* Some packs omit index-image fields; full documents are the fallback. */}
 }));
 unresolved=unresolved.filter(uuid=>{
  const src=findImage(uuid);
  if(src===FALLBACK_ITEM_IMAGE)return true;
  results.set(uuid,src);
  return false;
 });
 const resolver=context.resolveUuid;
 if(typeof resolver!=='function')return results;
 // Bound simultaneous document fetches on worlds with hundreds of recipes.
 for(let offset=0;offset<unresolved.length;offset+=8){
  await Promise.all(unresolved.slice(offset,offset+8).map(async uuid=>{
   try{
    const doc=await resolver(uuid);
    if(doc?.documentName&&doc.documentName!=='Item')return;
    const src=image(doc?.img)||image(doc?._source?.img)||image(doc?.toObject?.()?.img);
    if(src&&src!==FALLBACK_ITEM_IMAGE)results.set(uuid,src);
   }catch{/* The rest of the recipe screen must remain usable. */}
  }));
 }
 return results;
}
