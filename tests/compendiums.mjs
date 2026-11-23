import assert from 'node:assert/strict';
import {scanConfiguredSources,scanDirectories,sourceAliases,normalizeDirectoryConfig,itemPacks} from '../scripts/directories.mjs';
import {identity,findHerbs,findMatchedInventory} from '../scripts/inventory.mjs';

const doc=(id,name,uuid,description='',rarity='rare',more={})=>({
 id,name,uuid,documentName:'Item',img:'icons/svg/item-bag.svg',type:'loot',
 system:{rarity,quantity:1,description:{value:description}},...more
});
const compRare=doc('rr','Rare Reactive Reagent','Compendium.my-world.reagents.Item.rr');
const compCurative=doc('rc','Rare Curative Reagent','Compendium.my-world.reagents.Item.rc');
const compHerb=doc('earth','Earthtongue','Compendium.my-world.herbs.Item.earth',
 '<p>@UUID[Compendium.my-world.reagents.Item.rc]{Rare Curative Reagent}</p>'+
 '<p>@UUID[Compendium.my-world.reagents.Item.rr]{Rare Reactive Reagent}</p>');
const world={folders:{contents:[]},items:{contents:[]}};
const packs=[{
 collection:'my-world.herbs',documentName:'Item',metadata:{type:'Item',label:'Campaign Herbs'},
 getDocuments:async()=>[compHerb]
},{
 collection:'my-world.reagents',documentName:'Item',metadata:{type:'Item',label:'Alchemy Reagents'},
 getDocuments:async()=>[compRare,compCurative]
}];
const getPack=id=>packs.find(x=>x.collection===id);
const resolver=async uuid=>[compRare,compCurative,compHerb,...world.items.contents].find(x=>x.uuid===uuid)||null;
const scan=async cfg=>scanConfiguredSources(world,cfg,{
 herbs:[],mappings:{reagents:{}}},{packs:{contents:packs},resolveUuid:resolver});

const onlyPacks=await scan({herbPackIds:['my-world.herbs'],reagentPackIds:['my-world.reagents']});
assert.equal(onlyPacks.report.validHerbs,1,'compendium-only herb library');
assert.equal(onlyPacks.report.mappedReagents,2,'compendium-only reagent discovery');
assert.equal(onlyPacks.report.herbItems,1);
assert.equal(onlyPacks.report.reagentItems,2);
assert.deepEqual(onlyPacks.herbs[0].reagents,['rare_curative','rare_reactive']);
assert.equal(onlyPacks.reagentMappings.rare_reactive,compRare.uuid);
assert.equal(onlyPacks.herbMappings[onlyPacks.herbs[0].id],compHerb.uuid);
assert(onlyPacks.herbs[0].id.startsWith('pack-'));
assert.equal(onlyPacks.report.issues.filter(x=>x.type==='herb').length,0);

const folder={id:'herbs',name:'Herbs',type:'Item',folder:null};
const reagentsFolder={id:'reagents',name:'Reagents',type:'Item',folder:null};
world.folders.contents.push(folder,reagentsFolder);
const worldHerb=doc('earthWorld','Earthtongue','Item.earthWorld',
 '<p>@UUID[Compendium.my-world.reagents.Item.rc]{Rare Curative Reagent}</p>'+
 '<p>@UUID[Compendium.my-world.reagents.Item.rr]{Rare Reactive Reagent}</p>',
 'rare',{folder:{id:'herbs'},flags:{core:{sourceId:compHerb.uuid}}});
const worldRare=doc('rrWorld','Rare Reactive Reagent','Item.rrWorld','','rare',
 {folder:{id:'reagents'},flags:{core:{sourceId:compRare.uuid}}});
const worldCurative=doc('rcWorld','Rare Curative Reagent','Item.rcWorld','','rare',
 {folder:{id:'reagents'},flags:{core:{sourceId:compCurative.uuid}}});
world.items.contents.push(worldHerb,worldRare,worldCurative);

// World herb with links into a compendium, and only World reagents configured.
const worldOnly=await scan({herbFolderId:'herbs',reagentFolderId:'reagents'});
assert.deepEqual(worldOnly.herbs[0].reagents,['rare_curative','rare_reactive']);
assert.equal(worldOnly.report.mappedReagents,2);
assert(worldOnly.reagentAliases.rare_reactive.includes(compRare.uuid),'imported reagent retains compendium origin');
assert(worldOnly.herbAliases['world-earthWorld'].includes(compHerb.uuid));

// World reagent, compendium herb; linked compendium reagent is resolved even if
// its original pack is NOT a selected reagent source.
const mixed=await scan({herbPackIds:['my-world.herbs'],reagentFolderId:'reagents'});
assert.deepEqual(mixed.herbs[0].reagents,['rare_curative','rare_reactive']);
assert.equal(mixed.reagentMappings.rare_curative,'Item.rcWorld');

// Both sources selected: World copy and compendium original should not appear as
// duplicate herb entries; World is preferred as primary mapping.
const both=await scan({herbFolderId:'herbs',herbPackIds:['my-world.herbs'],
 reagentFolderId:'reagents',reagentPackIds:['my-world.reagents']});
assert.equal(both.herbs.length,1);
assert.equal(both.herbs[0].sourceUuid,'Item.earthWorld');
assert(both.herbAliases[both.herbs[0].id].includes(compHerb.uuid));

// The real Foundry game collection exists when matching Actor Items.
globalThis.game={items:{get:id=>world.items.contents.find(item=>item.id===id)||null}};

// Actor-inventory copies are recognised by compendium provenance rather than
// requiring actor Item UUID == reference Item UUID.
const actorReagent={...doc('actorR','Rare Reactive Reagent','Actor.hero.Item.actorR','','rare',
 {flags:{core:{sourceId:compRare.uuid}},system:{quantity:4,rarity:'rare'}}),
 getFlag:()=>null};
const actorHerb={...doc('actorH','Earthtongue','Actor.hero.Item.actorH','','rare',
 {flags:{core:{sourceId:compHerb.uuid}},system:{quantity:3,rarity:'rare'}}),
 getFlag:()=>null};
const actor={items:{contents:[actorReagent,actorHerb],
 [Symbol.iterator](){return this.contents[Symbol.iterator]();}}};
const mappings={reagents:both.reagentMappings,reagentNames:both.reagentNames,
 reagentAliases:both.reagentAliases,herbs:both.herbMappings,herbNames:both.herbNames,herbAliases:both.herbAliases};
assert.equal(findMatchedInventory(actor,mappings).length,1);
assert.equal(findMatchedInventory(actor,mappings)[0].quantity,4);
assert.equal(findHerbs(actor,mappings,both.herbs)[0].quantity,3);
assert(identity(actorReagent,'Item.rrWorld','rare_reactive',both.reagentNames.rare_reactive,
 both.reagentAliases.rare_reactive));

// Two genuinely different compendium herbs with the same name must not both
// recognise one provenance-less inventory copy by name alone.
const otherEarth=doc('otherEarth','Earthtongue','Compendium.my-world.herbs.Item.otherEarth',
 '<p>@UUID[Compendium.my-world.reagents.Item.rc]{Rare Curative Reagent}</p>');
packs[0].getDocuments=async()=>[compHerb,otherEarth];
const duplicated=await scan({herbPackIds:['my-world.herbs'],reagentPackIds:['my-world.reagents']});
assert.equal(duplicated.herbs.length,2);
assert(duplicated.report.issues.some(x=>/same name/.test(x.problem)));
const unidentified={...doc('unidentified','Earthtongue','Actor.hero.Item.unidentified','','rare',
 {system:{quantity:1}}),getFlag:()=>null};
const dupeMap={...mappings,herbs:duplicated.herbMappings,herbNames:duplicated.herbNames,
 herbAliases:duplicated.herbAliases};
assert.equal(findHerbs({items:{contents:[unidentified],
 [Symbol.iterator](){return this.contents[Symbol.iterator]();}}},dupeMap,duplicated.herbs).length,0);
const identified={...unidentified,flags:{core:{sourceId:otherEarth.uuid}}};
const matchHerb=findHerbs({items:{contents:[identified],
 [Symbol.iterator](){return this.contents[Symbol.iterator]();}}},dupeMap,duplicated.herbs);
assert.equal(matchHerb.length,1);
assert.equal(matchHerb[0].herb.sourceUuid,otherEarth.uuid);

// Broken compendium UUID must not infer a valid reagent from its label alone.
const broken=doc('broken','Broken','Compendium.my-world.herbs.Item.broken',
 '@UUID[Compendium.my-world.reagents.Item.absent]{Rare Curative Reagent}');
packs[0].getDocuments=async()=>[compHerb,broken];
const report=await scan({herbPackIds:['my-world.herbs'],reagentPackIds:['my-world.reagents']});
assert.equal(report.report.validHerbs,1);
assert(report.report.issues.some(x=>x.name==='Broken'));
assert.equal(itemPacks({contents:[...packs,{collection:'bad.pack',metadata:{type:'JournalEntry'}}]}).length,2);
assert.deepEqual(normalizeDirectoryConfig({herbPackIds:['x','x'],reagentFolderId:'y'}).herbPackIds,['x']);
await assert.rejects(
 ()=>scanConfiguredSources(world,{herbPackIds:['not-installed'],reagentPackIds:['my-world.reagents']},{},{packs:{contents:packs},resolveUuid:resolver}),
 /unavailable/
);
console.log('Compendium-only, World-only, mixed sources, links, aliases, inventory and errors passed.');
