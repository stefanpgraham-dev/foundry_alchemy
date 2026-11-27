import assert from 'node:assert/strict';
import {compendiumItemReference,templateImage,hydrateTemplateImages,FALLBACK_ITEM_IMAGE} from '../scripts/item-images.mjs';

const compUuid='Compendium.dnd5e.equipment24.Item.dmgPotionOfHeali';
assert.deepEqual(compendiumItemReference(compUuid),{
 collection:'dnd5e.equipment24',id:'dmgPotionOfHeali'
});
assert.deepEqual(compendiumItemReference('Compendium.world.potions.Item.healing'),{
 collection:'world.potions',id:'healing'
});
assert.equal(compendiumItemReference('Item.world-healing'),null);
assert.equal(compendiumItemReference('Compendium.world.potions.Actor.healing'),null);
assert.equal(compendiumItemReference('Compendium.world.potions.Item.healing.ActiveEffect.effect'),null);

const compImage='icons/consumables/potions/potion-tube-corked-red.webp';
const worldImage='icons/consumables/potions/custom-world.webp';
const potionCatalogImage='icons/consumables/potions/catalog.webp';
const herbImage='icons/herbs/moss.webp';
const reagentImage='icons/reagents/curative.webp';
const worldItems=new Map([['customPotion',{img:worldImage}]]);
const packs=new Map([['dnd5e.equipment24',{
 index:new Map([['dmgPotionOfHeali',{img:compImage}]])
}]]);
assert.equal(templateImage(compUuid,{packs}),compImage,
 'Compendium Item UUID must resolve through dnd5e.equipment24, not dnd5e.equipment24.Item');
assert.equal(templateImage('Item.customPotion',{worldItems}),worldImage,
 'World Item artwork remains available');
assert.equal(templateImage(compUuid,{packs:new Map(),
 potions:[{uuid:compUuid,img:potionCatalogImage}]}),potionCatalogImage,
 'Scanned full Item image must work even if the compendium index is not loaded');
assert.equal(templateImage(compUuid,{packs,
 potions:[{uuid:compUuid,img:potionCatalogImage}]}),potionCatalogImage,
 'Scanned source wins over the lightweight index');
assert.equal(templateImage('Compendium.world.herbs.Item.moss',{
 herbs:[{sourceUuid:'Compendium.world.herbs.Item.moss',img:herbImage}]
}),herbImage);
assert.equal(templateImage('Compendium.world.reagents.Item.curative',{
 mappings:{reagents:{common_curative:'Compendium.world.reagents.Item.curative'},
 reagentImages:{common_curative:reagentImage}}
}),reagentImage,'Scanned reagent artwork remains available on recipe ingredient cards');
assert.equal(templateImage(compUuid,{packs:new Map()}),FALLBACK_ITEM_IMAGE,
 'Missing index uses a known Foundry core icon rather than a broken external path');
assert.equal(templateImage(''),FALLBACK_ITEM_IMAGE);

// A previously saved world image works on a player client with NO compendium access.
assert.equal(templateImage(compUuid,{packs:new Map(),mappings:{
 outputImages:{[compUuid]:compImage}
}}),compImage,'persistent output image should not depend on viewing a compendium');

// When the selected source is valid but the local pack index is missing img,
// the new renderer explicitly requests the img index field.
let getIndexCalls=0;
const lazyPack={
 index:new Map([['dmgPotionOfHeali',{_id:'dmgPotionOfHeali'}]]),
 async getIndex(options){
  getIndexCalls++;
  assert.deepEqual(options,{fields:['img']});
  this.index.get('dmgPotionOfHeali').img=compImage;
  return this.index;
 }
};
const lazyResolved=await hydrateTemplateImages([compUuid,compUuid],{
 packs:new Map([['dnd5e.equipment24',lazyPack]]),
 resolveUuid:()=>{throw Error('Full Item should not be needed if index has img');}
});
assert.equal(lazyResolved.get(compUuid),compImage);
assert.equal(getIndexCalls,1,'index requested once, even when the same UUID repeats');

// If the index fails or contains no artwork, the exact mapped Item is fetched.
// No cross-name search or inferred alternative template is permitted.
let fetched=[];
const fullImage='icons/consumables/potions/from-real-item.webp';
const noImgPack={index:new Map(),async getIndex(){return this.index;}};
const fullResolved=await hydrateTemplateImages([compUuid],{
 packs:new Map([['dnd5e.equipment24',noImgPack]]),
 resolveUuid:async uuid=>{
  fetched.push(uuid);return {documentName:'Item',img:fullImage};
 }
});
assert.deepEqual(fetched,[compUuid]);
assert.equal(fullResolved.get(compUuid),fullImage);

// A missing or inaccessible Item must not prevent the rest of the UI rendering.
const missing=await hydrateTemplateImages([compUuid],{
 packs:new Map(),resolveUuid:async()=>{throw Error('Not accessible');}
});
assert.equal(missing.has(compUuid),false);

console.log('World, compendium, potion catalogue, reagent and herb artwork resolution passed.');
