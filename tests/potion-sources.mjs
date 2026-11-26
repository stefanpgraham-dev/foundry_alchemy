import assert from 'node:assert/strict';
import {
 defaultDirectoryConfig,normalizeDirectoryConfig,matchPotionRecipes,
 scanDirectories,scanConfiguredSources
} from '../scripts/directories.mjs';

const item=(id,name,folder,extra={})=>({
 id,name,uuid:'Item.'+id,type:'consumable',documentName:'Item',
 folder:{id:folder},img:'icons/consumables/potions/potion-bottle-corked-red.webp',
 system:{description:{value:''}},...extra
});
const recipe=(id,name,outputUuid='')=>({
 id,name,outputUuid,outputName:'',cost:{common_curative:1},source:'default',enabled:true
});
const healing=recipe('healing','Potion of Healing');
const antitoxin=recipe('antitoxin','Antitoxin');
const folders=[
 {id:'herbs',type:'Item',name:'Herbs'},
 {id:'reagents',type:'Item',name:'Reagents'},
 {id:'potions',type:'Item',name:'Potions'},
 {id:'potionSub',type:'Item',name:'Magical Potions',folder:{id:'potions'}}
];
const worldPotion=item('healing','Potion of Healing','potionSub');
const world={folders:{contents:folders},items:{contents:[
 item('curative','Common Curative Reagent','reagents'),
 item('herb','Healing Herb','herbs',{system:{description:{value:'@UUID[Item.curative]{Common Curative Reagent}'}}}),
 worldPotion
]}};
const cfg={herbFolderId:'herbs',reagentFolderId:'reagents',potionFolderId:'potions'};
assert.equal(defaultDirectoryConfig().potionFolderId,'');
assert.deepEqual(normalizeDirectoryConfig({potionPackIds:['first','first','second']}).potionPackIds,['first','second']);
const scan=scanDirectories(world,cfg,{recipes:[healing,antitoxin],mappings:{outputs:{}}});
assert.equal(scan.report.validHerbs,1);
assert.equal(scan.report.mappedReagents,1);
assert.equal(scan.report.potionItems,1);
assert.equal(scan.report.mappedPotions,1);
assert.equal(scan.potionMappings.healing,'Item.healing');
assert.equal(scan.updatedRecipes.find(r=>r.id==='healing').outputUuid,'Item.healing');
assert(scan.report.issues.some(i=>i.type==='potion'&&i.name==='Antitoxin'));
assert.equal(scan.potionCatalog[0].uuid,'Item.healing');
const noPots=scanDirectories(world,{herbFolderId:'herbs',reagentFolderId:'reagents'},
 {recipes:[healing],mappings:{outputs:{}}});
assert.equal(noPots.report.potionItems,0);
assert.deepEqual(noPots.potionMappings,{});

const manual=matchPotionRecipes([recipe('healing','Potion of Healing','Item.manual')],[worldPotion]);
assert.equal(manual.outputs.healing,'Item.manual');
assert.deepEqual(manual.autoOutputs,{});
const updated=matchPotionRecipes([recipe('healing','Potion of Healing','Item.healing')],
 [item('newHealing','Potion of Healing','potions')],
 {autoOutputs:{healing:'Item.healing'},outputs:{healing:'Item.healing'}});
assert.equal(updated.outputs.healing,'Item.newHealing','automatically linked source changes can rebind');
const nameCollision=matchPotionRecipes([healing],[
 worldPotion,item('other','Potion of Healing','potions')
]);
assert.equal(nameCollision.mappedPotions,0,'unrelated same-name potions must not be guessed');
assert(nameCollision.issues.some(i=>/Several selected/.test(i.problem)));
const original={
 id:'packHeal',name:'Potion of Healing',uuid:'Compendium.campaign.potions.Item.packHeal',
 documentName:'Item',type:'consumable'
};
const imported=item('worldCopy','Potion of Healing','potions',{flags:{core:{sourceId:original.uuid}}});
const matchedCopy=matchPotionRecipes([healing],[original,imported]);
assert.equal(matchedCopy.outputs.healing,imported.uuid,'World import wins over its compendium original');

// Pack-only setup: no World potion folder is required.
const pack={collection:'campaign.potions',documentName:'Item',metadata:{type:'Item',label:'Campaign Potions'},getDocuments:async()=>[original]};
const packOnly=await scanConfiguredSources(world,{
 herbFolderId:'herbs',reagentFolderId:'reagents',potionPackIds:[pack.collection]
},{recipes:[healing],mappings:{outputs:{}}},{
 packs:{contents:[pack]},resolveUuid:async()=>null
});
assert.equal(packOnly.report.potionItems,1);
assert.equal(packOnly.potionMappings.healing,original.uuid);
await assert.rejects(()=>scanConfiguredSources(world,{
 herbFolderId:'herbs',reagentFolderId:'reagents',potionPackIds:['missing.pack']
},{recipes:[healing]},{packs:{contents:[pack]}}),/unavailable/);

console.log('Potion source discovery, optional config, auto/explicit mappings and ambiguity passed.');
