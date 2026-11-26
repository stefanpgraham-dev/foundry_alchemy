import assert from 'node:assert/strict';
import {
 defaultDirectoryConfig,normalizeDirectoryConfig,matchPotionRecipes,potionNameKey,
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


assert.equal(potionNameKey('Potion of Healing (Greater)'),potionNameKey('Potion of Greater Healing'));
assert.equal(potionNameKey('Potion of Healing (Superior)'),potionNameKey('Potion of Superior Healing'));
assert.equal(potionNameKey('Potion of Healing (Supreme)'),potionNameKey('Potion of Supreme Healing'));
assert.equal(potionNameKey('Philter of Love'),potionNameKey('Philtre of Love'));
assert.equal(potionNameKey('Poison, Basic'),potionNameKey('Basic Poison'));
assert.equal(potionNameKey('Assassin\'s Blood'),potionNameKey('Assassins Blood'));
assert.equal(potionNameKey('Crawler Mucus'),potionNameKey('Carrion Crawler Mucus'));
// Foundry 2024 equipment compendium contains two same-named Healing potions,
// one DMG magic potion and another PHB adventuring gear item.
const dmg=docPotion('dmgPotionOfHeali','Potion of Healing','dnd5e.equipment24','2024');
const phb=docPotion('phbagPotionofHea','Potion of Healing','dnd5e.equipment24','2024');
function docPotion(id,name,pack,year='2024'){
 return {id,name,uuid:'Compendium.'+pack+'.Item.'+id,type:'consumable',documentName:'Item',
  system:{source:{rules:year},activities:{consume:{type:'heal'}}}};
}
const dmgChoice=matchPotionRecipes([healing],[phb,dmg]);
assert.equal(dmgChoice.outputs.healing,dmg.uuid,'DMG magic potion preferred to duplicated PHB gear item');
assert.equal(dmgChoice.ambiguousPotions,0);
assert.equal(dmgChoice.automaticPotions,1);
const variants=[
 recipe('greater','Potion of Greater Healing'),
 recipe('superior','Potion of Superior Healing'),
 recipe('supreme','Potion of Supreme Healing'),
 recipe('philtre','Philtre of Love'),
 recipe('mucus','Carrion Crawler Mucus'),
 recipe('basic','Basic Poison'),
 recipe('blood','Assassins Blood'),
 recipe('acid','Acid')
];
const alternateNames=[
 'Potion of Healing (Greater)','Potion of Healing (Superior)',
 'Potion of Healing (Supreme)','Philter of Love',
 'Crawler Mucus','Poison, Basic',"Assassin's Blood",'Acid'
];
const variantCandidates=alternateNames.map((name,i)=>docPotion('dmgFixture'+i,name,'dnd5e.equipment24'));
const variantResults=matchPotionRecipes(variants,variantCandidates);
assert.equal(variantResults.mappedPotions,8,'all safe published D&D naming variants link');
assert.equal(variantResults.missingPotions,0);
for(const entry of variantResults.updatedRecipes)assert(entry.outputUuid.startsWith('Compendium.'));
const unknownResist=matchPotionRecipes([recipe('cold','Potion of Cold Resistance')],
 [docPotion('dmgGenericResistance','Potion of Resistance','dnd5e.equipment24')]);
assert.equal(unknownResist.mappedPotions,0,'do not replace a typed resistance potion with generic selectable resistance');
assert.equal(unknownResist.missingPotions,1);
const legacy=docPotion('legacyHealing','Potion of Healing','dnd5e.items','2014');
const modern=matchPotionRecipes([healing],[legacy,dmg]);
assert.equal(modern.outputs.healing,dmg.uuid,'prefer modern version when both legacy and 2024 packs are selected');
const ambiguousPacks=matchPotionRecipes([healing],[
 docPotion('one','Potion of Healing','custom.one'),
 docPotion('two','Potion of Healing','custom.two')
]);
assert.equal(ambiguousPacks.ambiguousPotions,1,'unrelated compendium copies remain ambiguous');
assert.equal(ambiguousPacks.mappedPotions,0);
// Idempotence: an automatic link must not become a manual override on refresh.
const secondPass=matchPotionRecipes(dmgChoice.updatedRecipes,[phb,dmg],
 {outputs:dmgChoice.outputs,autoOutputs:dmgChoice.autoOutputs});
assert.equal(secondPass.outputs.healing,dmg.uuid);
assert.equal(secondPass.automaticPotions,1);


const typedResistFromLegacy=docPotion('legacyColdResistance','Potion of Cold Resistance','dnd5e.items','2014');
const typedResistWithBoth=matchPotionRecipes([recipe('cold','Potion of Cold Resistance')],[
 docPotion('dmgGenericResistance','Potion of Resistance','dnd5e.equipment24'),typedResistFromLegacy
]);
assert.equal(typedResistWithBoth.outputs.cold,typedResistFromLegacy.uuid,
 'selecting the 2014 SRD Items pack supplies the distinct resistance item absent from the 2024 pack');
assert.equal(typedResistWithBoth.missingPotions,0);
console.log('Potion source discovery, optional config, auto/explicit mappings and ambiguity passed.');
