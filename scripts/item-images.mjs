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
