import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BREW_TOOL_IDS,DEFAULT_RECIPE_TOOLS,brewingToolsForRecipe,brewToolSummary,validateBrewingTools} from '../scripts/recipe-tools.mjs';
import {brewingEligibility,selectBrewingTool,rollAlchemyToolCheck,isHerbalismKit,isPoisonersKit,hasBrewingToolProficiency} from '../scripts/eligibility.mjs';
import {validateLibrary,validateRecipe,migrateRecipeTools,seedDefaults,restoreDefault,exportRecipeLibrary,parseRecipeImport} from '../scripts/recipes.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaults=JSON.parse(fs.readFileSync(path.join(root,'data/recipes.json'),'utf8'));
assert.equal(defaults.length,44);
assert.deepEqual(BREW_TOOL_IDS,['alchemist','herb','pois'],'uses D&D5e system keys rather than tool names');
for(const recipe of defaults){
 assert.deepEqual(recipe.brewingTools,DEFAULT_RECIPE_TOOLS[recipe.id],'default tool classification for '+recipe.id);
 assert.deepEqual(brewingToolsForRecipe(recipe),recipe.brewingTools);
}
assert.deepEqual(defaults.find(r=>r.id==='potion-of-healing').brewingTools,['alchemist','herb']);
assert.deepEqual(defaults.find(r=>r.id==='basic-poison').brewingTools,['pois']);
assert.deepEqual(defaults.find(r=>r.id==='antitoxin').brewingTools,['alchemist','herb','pois']);
assert.deepEqual(defaults.find(r=>r.id==='potion-of-invisibility').brewingTools,['alchemist']);
assert.equal(brewToolSummary(defaults[0]),"Alchemist's Supplies / Herbalism Kit");
for(const input of [[],['herbalism'],['alchemist','alchemist'],['pois','unknown'],['alchemist','herb','pois','extra']])
 assert.throws(()=>validateBrewingTools(input),/recipe|Recipe/i);
assert.deepEqual(validateBrewingTools(['pois','alchemist']),['alchemist','pois']);
const library=seedDefaults(defaults,{'potion-of-healing':'Item.healing'});
assert(library.every(r=>r.brewingTools?.length));
const original=library.find(r=>r.id==='potion-of-healing');
const customised={...original,cost:{rare_reactive:5},brewingTools:['herb'],dcOverride:16,outputUuid:'Item.custom'};
const legacy=library.map(r=>r.id==='potion-of-healing'?
 (({brewingTools,...rest})=>rest)(customised):
 (({brewingTools,...rest})=>rest)(r));
const upgraded=migrateRecipeTools(legacy);
assert(upgraded.changed);
assert.equal(upgraded.recipes.length,44);
assert.deepEqual(upgraded.recipes.find(r=>r.id==='potion-of-healing').cost,{rare_reactive:5});
assert.equal(upgraded.recipes.find(r=>r.id==='potion-of-healing').dcOverride,16);
assert.equal(upgraded.recipes.find(r=>r.id==='potion-of-healing').outputUuid,'Item.custom');
assert.deepEqual(upgraded.recipes.find(r=>r.id==='potion-of-healing').brewingTools,['alchemist','herb']);
assert.equal(migrateRecipeTools(upgraded.recipes).changed,false,'the migration is idempotent');
const explicit=validateRecipe(customised);
assert.deepEqual(explicit.brewingTools,['herb']);
assert.deepEqual(restoreDefault(explicit,defaults).brewingTools,['alchemist','herb']);
const imported=parseRecipeImport(exportRecipeLibrary([explicit]));
assert.deepEqual(imported[0].brewingTools,['herb']);
assert.deepEqual(validateRecipe({...explicit,brewingTools:undefined}).brewingTools,['alchemist','herb']);
assert.deepEqual(validateRecipe({id:'new-potion',name:'Potion',cost:{common_curative:1},source:'custom',outputUuid:'Item.potion'}).brewingTools,['alchemist']);
assert.throws(()=>validateLibrary([{...explicit,brewingTools:[]}]),/recipe must|recipe/i);

const kit=(id,name,quantity=1)=>({
 id,name,type:'tool',system:{quantity,type:{baseItem:id}},
 flags:{core:{}}
});
const kits={alchemist:kit('alchemist',"Alchemist's Supplies"),herb:kit('herb','Herbalism Kit'),
 pois:kit('pois',"Poisoner's Kit")};
assert(isHerbalismKit(kits.herb));
assert(isPoisonersKit(kits.pois));
assert(!isPoisonersKit(kits.herb));
assert(!isHerbalismKit({...kits.herb,system:{...kits.herb.system,quantity:0}}));
assert(isHerbalismKit({name:'Forest Kit',type:'tool',system:{quantity:1},
 flags:{core:{sourceId:'Compendium.dnd5e.equipment24.Item.phbtulHerbalismK'}}}));
const calls=[];
const actor=(items=[],trained=[])=>({
 name:'Tester',items,
 system:{tools:Object.fromEntries(trained.map(id=>[id,{value:1,prof:{hasProficiency:true,multiplier:1}}]))},
 async rollToolCheck(config,dialog,message){
  calls.push({config,dialog,message});
  return [{total:18,d20:{results:[{result:16,active:true}]}}];
 }
});
const heal=defaults.find(r=>r.id==='potion-of-healing'),poison=defaults.find(r=>r.id==='basic-poison'),antitoxin=defaults.find(r=>r.id==='antitoxin');
const herbalist=actor([kits.herb],['herb']);
assert(brewingEligibility(herbalist,heal).ok,'healing permitted by proficient Herbalism Kit');
assert.deepEqual(brewingEligibility(herbalist,heal).eligible.map(x=>x.id),['herb']);
assert(!brewingEligibility(herbalist,poison).ok,'herbalism cannot make a poisoner-only recipe');
assert.equal(selectBrewingTool(herbalist,heal,'herb').id,'herb');
assert.throws(()=>selectBrewingTool(herbalist,heal,'alchemist'),/Requires the selected/);
assert.throws(()=>selectBrewingTool(herbalist,heal,'pois'),/not permitted/);
await rollAlchemyToolCheck(herbalist,12,{toolId:'herb',recipe:heal});
await rollAlchemyToolCheck(herbalist,12,{toolId:'herb',recipe:heal,followUp:true});
assert(calls.every(x=>x.config.tool==='herb'&&x.config.ability==='int'&&x.config.item===kits.herb));
assert(calls[1].config.advantage===false&&calls[1].config.disadvantage===false);
assert.match(calls[1].message.data.flavor,/Herbalism Kit.*Follow-up/);
const poisoner=actor([kits.pois],['pois']);
assert(brewingEligibility(poisoner,poison).ok);
calls.length=0;
await rollAlchemyToolCheck(poisoner,14,{toolId:'pois',recipe:poison});
assert.equal(calls[0].config.tool,'pois');
assert.equal(calls[0].config.item,kits.pois);
const untrained=actor([kits.pois],[]);
assert(!brewingEligibility(untrained,poison).ok,'having the item but no proficiency blocks crafting');
assert.equal(calls.length,1,'untrained character does not roll');
const unequipped=actor([],['pois']);
assert(!brewingEligibility(unequipped,poison).ok,'proficiency alone is insufficient');
const expert=actor([kits.pois],[]);
expert.system.tools.pois={prof:{multiplier:2}};
assert(hasBrewingToolProficiency(expert,'pois',kits.pois));
assert(brewingEligibility(expert,poison).ok,'expertise qualifies');
const both=actor([kits.alchemist,kits.herb,kits.pois],['alchemist','herb','pois']);
assert.equal(brewingEligibility(both,antitoxin).eligible.length,3);
assert.equal(selectBrewingTool(both,heal,'herb').id,'herb');
assert.throws(()=>selectBrewingTool(both,heal,'pois'),/not permitted/);
console.log('All 44 default tool assignments, migration, native rolls, GM tool validation and inventory proficiency tests passed.');
