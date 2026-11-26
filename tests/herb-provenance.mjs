import assert from 'node:assert/strict';
import {scanDirectories,scanConfiguredSources,herbRarity,normalizeDirectoryConfig} from '../scripts/directories.mjs';
import {findHerbs,planExtract,herbIdentity} from '../scripts/inventory.mjs';

const rare='Item.rare',reactive='Item.reactive';
const copy=(id,name,description,origin=null,folder='herbs')=>({
 id,name,uuid:'Item.'+id,documentName:'Item',img:'icons/svg/item-bag.svg',
 folder:{id:folder},
 flags:origin?{core:{sourceId:origin}}:{},
 system:{rarity:'rare',quantity:1,description:{value:description}}
});
const original='Compendium.test.herbs.Item.canopy';
const canopy=copy('canopy','Canopy Thistle','@UUID[Item.rare]{Rare Curative Reagent}',original);
const inkVine=copy('inkVine','Weeping Ink Vine','@UUID[Item.reactive]{Rare Reactive Reagent}',original);
const reagentA=copy('rare','Rare Curative Reagent','',null,'reagents');
const reagentB=copy('reactive','Rare Reactive Reagent','',null,'reagents');
const world={
 folders:{contents:[{id:'herbs',name:'Herbs',type:'Item'},{id:'reagents',name:'Reagents',type:'Item'}]},
 items:{contents:[canopy,inkVine,reagentA,reagentB]}
};
const config={herbFolderId:'herbs',reagentFolderId:'reagents'};
const first=scanDirectories(world,config,{herbs:[],mappings:{reagents:{}}});
assert.equal(first.herbs.length,2,'World herbs with shared Original Source remain separate');
assert.deepEqual(first.herbs.map(h=>h.name),['Canopy Thistle','Weeping Ink Vine']);
assert.deepEqual(first.herbs.map(h=>h.sourceUuid),['Item.canopy','Item.inkVine']);
assert.deepEqual(first.herbs.find(h=>h.name==='Canopy Thistle').reagents,['rare_curative']);
assert.deepEqual(first.herbs.find(h=>h.name==='Weeping Ink Vine').reagents,['rare_reactive']);
assert(first.report.issues.some(x=>x.name==='Weeping Ink Vine'&&/Original Source is shared/.test(x.problem)));
assert(!first.herbAliases['world-inkVine'].includes(original),'conflicting Original Source alias is excluded');
assert(!first.herbAliases['world-canopy'].includes(original),'same Original Source alias excluded from both');
assert.equal(first.report.added.length,2);
const second=scanDirectories(world,config,{herbs:first.herbs,mappings:{reagents:first.reagentMappings}});
assert.equal(second.report.added.length,0);
assert.equal(second.report.changed.length,0);
assert.equal(second.report.removed.length,0);

// A stale classification from the older module must not override the distinct
// actual herb in player inventory, even if it was copied from the same source.
const actorItem={
 id:'actorInk',name:'Weeping Ink Vine',uuid:'Actor.hero.Item.actorInk',
 system:{quantity:3},flags:{core:{sourceId:original}},
 getFlag:(_module,key)=>key==='category'?'world-canopy':key==='sourceUuid'?'Item.canopy':null
};
const actor={items:{contents:[actorItem],get:id=>id==='actorInk'?actorItem:null,
 [Symbol.iterator](){return this.contents[Symbol.iterator]();}}};
globalThis.game={items:{get:id=>world.items.contents.find(x=>x.id===id)||null}};
const mappings={reagents:first.reagentMappings,reagentNames:first.reagentNames,
 reagentAliases:first.reagentAliases,herbs:first.herbMappings,
 herbNames:first.herbNames,herbAliases:first.herbAliases};
const matched=findHerbs(actor,mappings,first.herbs);
assert.equal(matched.length,1,'old stale flags cannot classify as Canopy Thistle');
assert.equal(matched[0].herb.name,'Weeping Ink Vine');
assert.equal(matched[0].quantity,3);
assert.equal(herbIdentity(actorItem,first.herbs.find(h=>h.name==='Canopy Thistle'),mappings),false);
const extraction=planExtract(actor,'world-inkVine','actorInk',1,first.herbs,mappings,'rare_reactive');
assert.equal(extraction.outputs[0].id,'rare_reactive');
assert.throws(()=>planExtract(actor,'world-canopy','actorInk',1,first.herbs,mappings,'rare_curative'),/not mapped/);

// When selected Compendium original and World import are provably equivalent,
// retain old de-duplication behaviour, keeping the preferred World item.
const compCanopy={...canopy,id:'compCanopy',uuid:original,folder:null};
const compPack={collection:'test.herbs',documentName:'Item',metadata:{type:'Item'},
 getDocuments:async()=>[compCanopy]};
const combined=await scanConfiguredSources(world,{...config,herbPackIds:['test.herbs']},
 {herbs:[],mappings:{reagents:{}}},{packs:{contents:[compPack]},
 resolveUuid:async uuid=>uuid===original?compCanopy:null});
assert.equal(combined.herbs.length,2,'equivalent source only merges with its own World import');
assert.equal(combined.herbs.find(x=>x.name==='Canopy Thistle').sourceUuid,'Item.canopy');
assert.deepEqual(combined.herbs.find(x=>x.name==='Weeping Ink Vine').reagents,['rare_reactive']);

// A World herb renamed from its compendium origin must never be merged.
world.items.contents.splice(world.items.contents.indexOf(canopy),1);
const renamed=await scanConfiguredSources(world,{...config,herbPackIds:['test.herbs']},
 {herbs:[],mappings:{reagents:{}}},{packs:{contents:[compPack]},
 resolveUuid:async uuid=>uuid===original?compCanopy:null});
assert.equal(renamed.herbs.length,2,'renamed World herb and original compendium herb are distinct');
assert(renamed.report.issues.some(x=>x.name==='Weeping Ink Vine'&&/Original Source/.test(x.problem)));

// D&D rarity metadata maps to a configurable alchemy tier without affecting
// ingredient requirements. Native dnd5e rarities are checked first.
const rareList={system:{rarities:['veryRare'],description:{value:''}}};
assert.deepEqual(herbRarity(rareList),{rarity:'exotic',sourceRarity:'Very Rare'});
assert.equal(herbRarity(rareList,{rarityMap:{veryrare:'rare'}}).rarity,'rare');
assert.equal(herbRarity({system:{rarity:'veryRare'}}).rarity,'exotic');
assert.equal(herbRarity({system:{rarity:'exotic'}}).rarity,'exotic');
assert.equal(herbRarity({system:{rarities:['uncommon']}}).rarity,'common');
assert.equal(herbRarity({system:{rarities:['legendary']}}).rarity,'exotic');
assert.equal(herbRarity({system:{rarities:['madeup']}}).rarity,'unknown');
assert.equal(normalizeDirectoryConfig({rarityMap:{veryrare:'rare'}}).rarityMap.veryrare,'rare');
// An explicit alchemy tier has priority over the D&D rarity tag.
assert.equal(herbRarity({system:{alchemyTier:'common',rarities:['veryRare']}}).rarity,'common');

console.log('Herb source identity, stale flags, mixed-origin imports and rarity mapping passed.');
