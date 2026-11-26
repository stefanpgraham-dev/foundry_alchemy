import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {TIERS,COLOURS,KEYS,recipeTier,DC,HOURS,requirements,planRecipe,planRefine,percentageYield,chanceSucceeds,assertQty,classifyHerbs,maximumCraftableBatch,availableRefinementTargets} from '../scripts/engine.mjs';
import {getQty,planExtract,planDowngrade,applyInventory,identity,findMatchedInventory,inventoryAudit,markActorInventory} from '../scripts/inventory.mjs';
import {brewingEligibility,isAlchemistSupplies,rollAlchemyToolCheck,naturalD20Result} from '../scripts/eligibility.mjs';
import {BREW_TOOL_IDS,brewingToolsForRecipe} from '../scripts/recipe-tools.mjs';
import {captureWorkbenchViewport,restoreWorkbenchViewport} from '../scripts/viewport.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const recipes=JSON.parse(fs.readFileSync(path.join(root,'data/recipes.json'),'utf8'));
const herbs=[{id:'world-CaveMoss',name:'Cave Moss',rarity:'common',reagents:['common_curative'],sourceUuid:'Item.CaveMoss'}];
const manifest=JSON.parse(fs.readFileSync(path.join(root,'module.json'),'utf8'));
const recipe=name=>recipes.find(x=>x.name===name);
let checks=0;const check=(condition,message)=>{checks++;assert.ok(condition,message);};
check(manifest.id==='alchemy-workbench'&&manifest.compatibility.minimum==='14','valid v14 module');
check(manifest.socket===true&&manifest.esmodules.includes('scripts/module.mjs'),'socket and script registered');
check(manifest.relationships.systems[0].id==='dnd5e','D&D 5e required');
check(recipes.length===44 && new Set(recipes.map(x=>x.id)).size===44,'44 unique potion recipes');
check(!fs.existsSync(path.join(root,'data/herbs.json')),'legacy 43-herb file is removed');
check(KEYS.length===9 && TIERS.length===3 && COLOURS.length===3,'nine reagent kinds');
for(const r of recipes){
 check(Object.keys(r.cost).every(k=>KEYS.includes(k)&&Number.isSafeInteger(r.cost[k])&&r.cost[k]>0),`valid recipe ${r.name}`);
 check(DC[recipeTier(r)]&&HOURS[recipeTier(r)],`tier for ${r.name}`);
 check(brewingToolsForRecipe(r).length>0&&brewingToolsForRecipe(r).every(id=>BREW_TOOL_IDS.includes(id)),`valid brew tools for ${r.name}`);
}
for(const h of herbs)check(h.reagents.length>0&&h.reagents.every(k=>KEYS.includes(k)),`herb ${h.name} has valid properties`);
check(classifyHerbs(herbs).length===0,'world catalogue has no tier anomalies');
check(recipe('Potion of Healing').cost.common_curative===3,'Healing recipe 3 Common Curative');
check(recipe('Potion of Supreme Healing').cost.exotic_curative===3,'Supreme Healing 3 Exotic Curative');
check(recipe('Potion of Speed').cost.rare_poisonous===1&&recipe('Potion of Speed').cost.rare_reactive===1,'Speed formula');
check(recipe('Potion of Flying').cost.exotic_reactive===1,'Flying formula');
check(recipe('Purple Worm Poison').cost.exotic_poisonous===3,'Purple Worm Poison formula');
check(Object.keys(requirements(recipe('Potion of Healing'),5)).length===1&&requirements(recipe('Potion of Healing'),5).common_curative===15,'multiply batch recipe');
check(recipeTier(recipe('Potion of Flying'))==='exotic','tier determined by highest recipe reagent');
check(HOURS[recipeTier(recipe('Potion of Healing'))]===2,'batch time remains recipe time');
check(planRefine('exotic_curative',1,'rare').quantity===3,'exotic to 3 rare');
check(planRefine('exotic_curative',1,'common').quantity===9,'exotic to 9 common');
check(planRefine('rare_reactive',2,'common').quantity===6,'rare to 3 common');
assert.throws(()=>planRefine('rare_reactive',1,'exotic'));
assert.throws(()=>planRefine('common_curative',1,'rare'));
assert.throws(()=>assertQty(0));
assert.throws(()=>assertQty(1.25));
const inv=(...args)=>args.map(([id,key,quantity])=>({id,key,quantity}));
check(maximumCraftableBatch(recipe('Potion of Healing'),inv(['c','common_curative',6]))===2,'craftable-only list uses reagent counts');
check(maximumCraftableBatch(recipe('Potion of Healing'),inv(['r','rare_curative',2]))===2,'craftable count allows downward substitutions');
check(maximumCraftableBatch(recipe('Potion of Greater Healing'),inv(['c','common_curative',99]))===0,'not craftable: lower tiers cannot be upgraded');
check(JSON.stringify(availableRefinementTargets('rare_curative'))===JSON.stringify(['common']),'rare reagent only offers common destination');
check(JSON.stringify(availableRefinementTargets('exotic_curative'))===JSON.stringify(['rare','common']),'exotic offers both lower destinations');
check(availableRefinementTargets('common_curative').length===0,'common offers no destination');
let plan=planRecipe(recipe('Potion of Healing'),1,inv(['e','exotic_curative',1]));
check(JSON.stringify(plan.consume)===JSON.stringify([{id:'e',quantity:1}]),'one exotic consumed');
check(plan.return.rare_curative===2,'break exotic to rare and return 2 rare');
check(!plan.return.common_curative,'no common waste');
plan=planRecipe(recipe('Potion of Healing'),1,inv(['e','exotic_curative',1]),{change:'common'});
check(plan.return.common_curative===6,'optional lower-tier change');
plan=planRecipe(recipe('Potion of Healing'),1,inv(['r','rare_curative',1]));
check(plan.consume[0].id==='r'&&Object.keys(plan.return).length===0,'rare exactly covers 3 common');
plan=planRecipe(recipe('Potion of Healing'),2,inv(['c','common_curative',3],['r','rare_curative',1]));
check(plan.consume.length===2&&plan.consume.reduce((n,v)=>n+v.quantity,0)===4,'consume exact common and rare');
plan=planRecipe(recipe('Potion of Healing'),1,inv(['c','common_curative',5]));
check(plan.consume[0].quantity===3&&Object.keys(plan.return).length===0,'consume only 3 of 5 common');
assert.throws(()=>planRecipe(recipe('Potion of Healing'),1,inv(['p','exotic_poisonous',9])),'cross-colour substitution forbidden');
assert.throws(()=>planRecipe(recipe('Potion of Greater Healing'),1,inv(['c','common_curative',100])),'cannot upgrade 3 common to rare');
// Substituting an exotic for both a rare and common requirement cannot reuse the same unit.
const mixed={id:'mixed',name:'Mixed',cost:{rare_curative:1,common_curative:1}};
plan=planRecipe(mixed,1,inv(['e','exotic_curative',1]));
check(plan.consume.length===1 && plan.return.rare_curative===1 && plan.return.common_curative===2,'single exotic split across rare/common with exact change');
for(const qty of [1,2,5,100])for(const pct of [0,10,30,70,100,150,350,800]){
 const y=percentageYield(qty,pct);
 check(y.guaranteed*100+y.fractional===qty*pct,`conserves expected yield ${qty} @ ${pct}%`);
 check(y.fractional>=0&&y.fractional<100,'at most one fractional d100');
}
check(percentageYield(1,400).guaranteed===4,'400% gives four critical bonus potions, not capped');
check(percentageYield(5,70).guaranteed===3&&percentageYield(5,70).fractional===50,'5 at 70% => 3 + 50% chance');
check(chanceSucceeds(43,50)===true&&chanceSucceeds(51,50)===false,'d100 equal or below');
check(chanceSucceeds(100,100)===true,'100% guaranteed');
// Show virtual d40 mapping is uniform and bounded 1–40.
let combinations=[];for(let d10=1;d10<=10;d10++)for(let d4=1;d4<=4;d4++)combinations.push((d10-1)*4+d4);
check(new Set(combinations).size===40&&Math.min(...combinations)===1&&Math.max(...combinations)===40,'virtual d40 is exactly uniform');

// New tool eligibility and native check regression tests.
const supplies={type:'tool',name:"Alchemist's Supplies",system:{quantity:1,type:{baseItem:'alchemist'}}};
const trained={items:[supplies],system:{tools:{alchemist:{value:1,prof:{hasProficiency:true,multiplier:1}}}},rollToolCheck:async()=>[]};
check(isAlchemistSupplies(supplies),'dnd5e alchemist tool item recognised');
check(brewingEligibility(trained).ok,'supplies and proficiency permit brewing');
check(!brewingEligibility({...trained,items:[]}).ok,'missing supplies block brewing');
check(!brewingEligibility({...trained,system:{tools:{alchemist:{value:0}}}}).ok,'missing proficiency blocks brewing');
const checksNative=[];
trained.rollToolCheck=async(config,dialog,message)=>{checksNative.push({config,dialog,message});return [{total:17,d20:{results:[{result:20,active:true}]}}];};
check(naturalD20Result(await rollAlchemyToolCheck(trained,12))===20,'native alchemist tool check retains critical d20');
await rollAlchemyToolCheck(trained,12,{followUp:true});
check(checksNative[0].config.tool==='alchemist'&&checksNative[0].config.ability==='int'&&checksNative[0].config.item===supplies,'native check uses intelligence and carried tool');
check(checksNative[0].config.target===12&&checksNative[0].dialog.configure===false,'native check applies DC and bypasses GM-only roll dialog');
check(checksNative[1].config.advantage===false&&checksNative[1].config.disadvantage===false,'independent d20 follow-up');
const beforeNodes={'.awb-main':{scrollTop:32,scrollLeft:0},'.awb-mapping-list':{scrollTop:550,scrollLeft:0}};
const viewport=captureWorkbenchViewport({querySelector:x=>beforeNodes[x]}, {dataset:{mapping:'some-herb'},selectionStart:2,selectionEnd:4});
const afterNodes={'.awb-main':{scrollTop:0,scrollLeft:0},'.awb-mapping-list':{scrollTop:0,scrollLeft:0}};
let focused=false,sel=[];
restoreWorkbenchViewport({querySelector:x=>afterNodes[x],querySelectorAll:()=>[{dataset:{mapping:'some-herb'},focus:()=>{focused=true;},setSelectionRange:(a,b)=>{sel=[a,b];}}]},viewport);
check(afterNodes['.awb-mapping-list'].scrollTop===550&&afterNodes['.awb-main'].scrollTop===32,'mapping scroll positions persist across rendering');
check(focused&&sel[0]===2&&sel[1]===4,'mapping input focus and selection restored');

// Mock actor Item operations (no Foundry runtime required) to verify real inventory changes and rollback.
let serial=0;
class Item {
 constructor(id,name,key,quantity){this.id=id;this.name=name;this.system={quantity};this.flags={core:{sourceId:`Item.${id}`},'alchemy-workbench':{category:key,sourceUuid:`Item.${id}`}};this.uuid=`Actor.test.Item.${id}`;}
 getFlag(ns,k){return this.flags[ns]?.[k];}
 toObject(){return {name:this.name,type:'consumable',system:{quantity:this.system.quantity},flags:structuredClone(this.flags)};}
}
class Actor {
 constructor(...items){this.id='test';this.name='Test';this.system={tools:{alchemist:{total:0}},abilities:{int:{mod:0}},attributes:{prof:2}};this.items={contents:items,get(id){return this.contents.find(x=>x.id===id)},*[Symbol.iterator](){yield* this.contents;}};this.failCreation=false;}
 async updateEmbeddedDocuments(type,updates){for(const u of updates){const item=this.items.get(u._id);if(!item)throw new Error('Bad item ID');if('system.quantity' in u)item.system.quantity=u['system.quantity'];for(const [k,v] of Object.entries(u))if(k.startsWith('flags.alchemy-workbench.')){item.flags['alchemy-workbench']??={};item.flags['alchemy-workbench'][k.split('.').at(-1)]=v;}}return updates;}
 async createEmbeddedDocuments(type,list){if(this.failCreation)throw Error('Simulated create failed');const docs=list.map(s=>{const item=new Item(`new${++serial}`,s.name,s.flags?.['alchemy-workbench']?.category,s.system?.quantity||1);item.flags=s.flags;this.items.contents.push(item);return item;});return docs;}
 async deleteEmbeddedDocuments(type,ids){this.items.contents=this.items.contents.filter(x=>!ids.includes(x.id));}
}
const templates={
 'Item.common_curative':new Item('common_curative','Common Curative','common_curative',1),
 'Item.rare_curative':new Item('rare_curative','Rare Curative','rare_curative',1),
 'Item.exotic_curative':new Item('exotic_curative','Exotic Curative','exotic_curative',1),
};
globalThis.fromUuid=async id=>Object.assign(templates[id]||null,{documentName:'Item'});
globalThis.game={items:{get:id=>templates[`Item.${id}`]||null},settings:{get:()=>({})}};
const map={reagents:Object.fromEntries(Object.keys(templates).map(x=>[x.replace('Item.',''),x])),outputs:{}};
const act=new Actor(new Item('e','Exotic Curative','exotic_curative',2));
const p=planRecipe(recipe('Potion of Healing'),1,inv(['e','exotic_curative',2]));
await applyInventory(act,p.consume,[...Object.entries(p.return).map(([id,quantity])=>({kind:'reagent',id,quantity}))],map);
check(getQty(act.items.get('e'))===1,'one exotic reagent consumed, second remains');
check(act.items.contents.some(x=>x.name==='Rare Curative'&&getQty(x)===2),'two rare returned to actor inventory');
const rollback=new Actor(new Item('e','Exotic Curative','exotic_curative',1));rollback.failCreation=true;
await assert.rejects(()=>applyInventory(rollback,[{id:'e',quantity:1}],[{kind:'reagent',id:'rare_curative',quantity:3}],map));
check(getQty(rollback.items.get('e'))===1,'on create failure original item restored');
check(rollback.items.contents.length===1,'no duplicate items after rollback');
console.log(`Alchemy Workbench smoke tests passed: ${checks} assertions; herb catalogue comes from world folders.`);
// Check that Foundry's init/ready hooks can register module settings and load both catalogues.
const hooks={};
globalThis.Hooks={once(name,fn){hooks[name]=fn;},on(){}};
const moduleEntry={};const registered=[];let socketChannel='',socketHandler;
const {defaultRules}=await import('../scripts/rules.mjs');
let startupRules=defaultRules();
let startupLibrary={initialized:false,recipes:[]};
globalThis.game={
 modules:new Map([['alchemy-workbench',moduleEntry]]),
 settings:{
    register:(id,key,config)=>registered.push({id,key,config}),
    get:(_id,key)=>key==='rules'?startupRules:key==='herbCatalog'?herbs:key==='recipeLibrary'?startupLibrary:key==='mappings'?{reagents:{},herbs:{},outputs:{}}:{issues:[]},
    set:async(_id,key,value)=>{if(key==='recipeLibrary')startupLibrary=value;if(key==='rules')startupRules=value;return value;}
  },
 system:{id:'dnd5e'},
 socket:{on:(id,fn)=>{socketChannel=id;socketHandler=fn;}},
 items:{contents:[],get:id=>templates[`Item.${id}`]||null}
};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:e=>{throw Error(e)}}};
globalThis.foundry={utils:{escapeHTML:s=>String(s),randomID:()=>`job-${++serial}`},applications:{api:{ApplicationV2:class{constructor(options){this.options=options;}}}}};
const fetchNative=globalThis.fetch;
globalThis.fetch=async url=>{
 const file=url.endsWith('recipes.json')?'recipes.json':null;
 return file?{ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'data',file),'utf8'))}:{ok:false};
};
await import('../scripts/module.mjs');
check(typeof hooks.init==='function'&&typeof hooks.ready==='function','Foundry startup hooks registered');
await hooks.init();
check(registered.length===7,'world rules, recipe, directory, catalogue, report, mappings and pending settings registered');
check(typeof moduleEntry.api.open==='function'&&typeof moduleEntry.api.setup==='function','UI API available');
game.user={id:'gm',isGM:true};
await hooks.ready();
check(startupLibrary.initialized&&startupLibrary.recipes.length===44,'first GM startup seeds 44 world-editable recipes');
check(startupLibrary.recipes.every(r=>r.source==='default'),'default recipe source metadata is retained');
check(moduleEntry.api.getRecipes().length===44&&moduleEntry.api.getHerbs().length===1,'recipes and world herb catalogue load in ready hook');
check(socketChannel==='module.alchemy-workbench','module socket event registered');
// A drag-copied World Item has a new actor UUID and may lack flags. Name fallback must still identify it.
const worldReagent=new Item('world-common','Common Curative Reagent','common_curative',1);
worldReagent.img='icons/consumables/potions/potion-bottle-corked-red.webp';
templates['Item.world-common']=worldReagent;
const copied=new Item('actor-copy','Common Curative Reagent','common_curative',6);
copied.flags={};
const actorCopied=new Actor(copied);
const mappedCopies={reagents:{common_curative:'Item.world-common'},reagentNames:{common_curative:'Common Curative Reagent'},herbs:{},outputs:{}};
check(identity(copied,'Item.world-common','common_curative'),'matching template name recognises copied World Item with different UUID');
check(findMatchedInventory(actorCopied,mappedCopies).length===1,'copied reagent appears in actor inventory');
check(maximumCraftableBatch(recipe('Potion of Healing'),findMatchedInventory(actorCopied,mappedCopies))===2,'copied reagents unlock a two-potion batch');
await markActorInventory(actorCopied,mappedCopies,herbs);
check(copied.getFlag('alchemy-workbench','category')==='common_curative','matched copy receives persistent reagent classification');
check(copied.getFlag('alchemy-workbench','sourceUuid')==='Item.world-common','matched copy receives mapped template source UUID');
const mismatched={...mappedCopies,reagents:{common_curative:'Item.another-world-item'},reagentNames:{}};
check(!identity(copied,'Item.another-world-item','common_curative'),'old category source flag must not impersonate an unrelated reagent template');
check(inventoryAudit(actorCopied,{...mappedCopies,reagents:{}},herbs).unmapped.length===1,'inventory audit identifies unmatched copies');
const {AlchemyWorkbench}=await import('../scripts/workbench.mjs');
const uiServices={recipes:startupLibrary.recipes,defaultRecipes:recipes,herbs,mappings:()=>mappedCopies,rules:()=>startupRules,saveRules:async()=>0,submit:async()=>'',saveMappings:async()=>0,saveRecipes:async()=>0,pending:async()=>null,brewingEligibility:()=>({ok:true,errors:[],eligible:[{id:'alchemist',label:"Alchemist's Supplies"}]}),directories:()=>({herbFolderId:'',reagentFolderId:'',includeSubfolders:true}),directoryReport:()=>({issues:[]})};
game.user={id:'gm',isGM:true};
const panel=new AlchemyWorkbench(actorCopied,uiServices);
const html=await panel._renderHTML();
check(html.includes('Potion of Healing')&&!html.includes('Potion of Greater Healing'),'workbench hides unavailable recipes by default');
check(html.includes('Max 2'),'workbench displays max craftable batch');
check(html.includes('data-brew-tool')&&html.includes('Alchemist'),'brew interface offers an eligible kit');
check(!html.includes('<select name="recipe"'),'workbench uses cards rather than recipe dropdown');
const rareItem=new Item('rare-ui','Rare Curative Reagent','rare_curative',1);rareItem.img=worldReagent.img;
rareItem.flags['alchemy-workbench'].sourceUuid='Item.rare_curative';
const rareActor=new Actor(rareItem);
const rareMap={reagents:{rare_curative:'Item.rare_curative'},herbs:{},outputs:{}};
const refinePanel=new AlchemyWorkbench(rareActor,{...uiServices,mappings:()=>rareMap});
refinePanel.tab='refine';
const refineHtml=await refinePanel._renderHTML();
check(refineHtml.includes('data-refine-tier="common"')&&!refineHtml.includes('data-refine-tier="rare"'),'Rare reagent refinement UI never offers Rare as a target');

const editingPanel=new AlchemyWorkbench(actorCopied,uiServices);
editingPanel.tab='gm';editingPanel.gmKind='recipes';
const editHtml=await editingPanel._renderHTML();
check(editHtml.includes('data-recipe-drop="output"')&&editHtml.includes('data-recipe-drop="reagent"'),'recipe editor includes Item drop zones');
check(editHtml.includes('data-action="gm-recipe-save"'),'GM can save edited recipes');
check(editHtml.includes('data-recipe-tool="alchemist"')&&editHtml.includes('data-recipe-tool="herb"')&&editHtml.includes('data-recipe-tool="pois"'),'GM recipe setup permits all three tools');
check(editHtml.includes('Import Missing Defaults')&&editHtml.includes('Export JSON'),'recipe library supports reimport and JSON export');
const rulesPanel=new AlchemyWorkbench(actorCopied,uiServices);
rulesPanel.tab='gm';rulesPanel.gmKind='rules';
const rulesHtml=await rulesPanel._renderHTML();
check(rulesHtml.includes('data-rule-field="dc.common"')&&rulesHtml.includes('data-rule-field="critical.naturalThreshold"'),'GM rules editor has DC and critical threshold');
check(rulesHtml.includes('data-rule-field="failure.partialDieSides"')&&rulesHtml.includes('data-rule-field="failure.twoPassMode"'),'GM rules editor exposes failure mechanism');
check(rulesHtml.includes('data-action="gm-rules-reset"')&&rulesHtml.includes('data-action="gm-rules-save"'),'GM rules editor offers save and reset');
globalThis.fetch=fetchNative;
console.log('Foundry startup mock passed.');

// Exercise the player-to-GM command path with a synthetic Foundry socket and Roll interface.
let mappings={reagents:{common_curative:'Item.common_curative'},herbs:{},outputs:{}};
let pendingRecords=[];
const gmUser={id:'gm',active:true,isGM:true},playerUser={id:'player',active:true,isGM:false};
const actorGame=equipBrewer(new Actor(new Item('c','Common Curative','common_curative',6)));
actorGame.testUserPermission=()=>true;
const responses=[];
let rollValues=[],postedRolls=[],nativeCalls=[];
globalThis.Roll=class{
 constructor(formula){this.formula=formula;this.total=null;this.dice=[];}
 async evaluate(){
  if(!rollValues.length)throw Error('Unexpected dice roll: '+this.formula);
  const value=rollValues.shift();
  if(this.formula.includes('1d20')){
   this.dice=[{faces:20,results:[{result:value}]}];
   const m=this.formula.match(/1d20\s*([+-])\s*(\d+)/); const bonus=m?(m[1]==='-'?-1:1)*Number(m[2]):0;
   this.total=value+bonus;
  }else this.total=value;
  return this;
 }
 async toMessage(data){postedRolls.push({formula:this.formula,flavor:data.flavor,total:this.total});}
};
globalThis.ChatMessage={getSpeaker:()=>({alias:'Test Actor'}),create:async()=>({})};
function equipBrewer(actor){
 const supplies=new Item('alchemy-tool', "Alchemist's Supplies", null,1);
 supplies.type='tool';supplies.system.type={baseItem:'alchemist'};
 actor.items.contents.push(supplies);
 actor.system.tools.alchemist={value:1,prof:{multiplier:1,hasProficiency:true}};
 actor.rollToolCheck=async(config,dialog,message)=>{
   nativeCalls.push({config,dialog,message});
   const roll=await new Roll('1d20 + 2').evaluate();
   await roll.toMessage({flavor:message.data.flavor});
   return [roll];
 };
 return actor;
}


const activeUsers=[gmUser,playerUser];
game.user=gmUser;
game.users={filter:fn=>activeUsers.filter(fn),get:id=>activeUsers.find(x=>x.id===id)};
game.actors={get:id=>id==='test'?actorGame:null};
game.socket.emit=(channel,p)=>{responses.push(p)};
game.settings.get=(id,key)=>key==='rules'?startupRules:key==='mappings'?mappings:key==='pending'?pendingRecords:key==='recipeLibrary'?startupLibrary:{issues:[]};
game.settings.set=async(id,key,value)=>{
 if(key==='pending')pendingRecords=value;
 else if(key==='mappings')mappings=value;
 else if(key==='recipeLibrary')startupLibrary=value;
 else if(key==='rules')startupRules=value;
 return value;
};
function eventuallyResponse(){
 return new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>{if(responses.length)return resolve(responses.shift());if(Date.now()-started>2000)return reject(Error('No response'));setTimeout(poll,1);};poll();});
}
// Missing tools or proficiency are GM-side errors; neither dice nor reagents are spent.
const untrained=new Actor(new Item('untrained','Common Curative','common_curative',3));
untrained.testUserPermission=()=>true;
game.actors.get=id=>id==='test'?untrained:null;
socketHandler({type:'request',nonce:'untrained',mode:'brew',actorId:'test',recipeId:'potion-of-healing',batch:1,selectedIds:['untrained'],change:'highest'},'player');
let denied=await eventuallyResponse();
check(!denied.ok&&/Supplies/.test(denied.message),'brew rejected without supplies');
check(getQty(untrained.items.get('untrained'))===3&&postedRolls.length===0,'missing supplies cannot consume or roll');
equipBrewer(untrained);
untrained.system.tools.alchemist={value:0,prof:{hasProficiency:false,multiplier:0}};
untrained.items.contents.find(x=>x.type==='tool').system.proficient=0;
socketHandler({type:'request',nonce:'no-proficiency',mode:'brew',actorId:'test',recipeId:'potion-of-healing',batch:1,selectedIds:['untrained'],change:'highest'},'player');
denied=await eventuallyResponse();
check(!denied.ok&&/proficiency/.test(denied.message),'brew rejected without proficiency');
check(getQty(untrained.items.get('untrained'))===3&&postedRolls.length===0,'missing proficiency cannot consume or roll');
game.actors.get=id=>id==='test'?actorGame:null;
// Changing the GM world DC affects the server's next native Alchemist's Supplies check.
await moduleEntry.api.saveRules({...startupRules,dc:{...startupRules.dc,common:14},maxBatch:3});
check(moduleEntry.api.getRules().dc.common===14,'GM save exposes new world DC');
rollValues=[15];
socketHandler({type:'request',nonce:'success',mode:'brew',actorId:'test',recipeId:'potion-of-healing',batch:2,selectedIds:['c'],change:'highest',doublePass:'extra'},'player');
let reply=await eventuallyResponse();
check(reply.ok===true,'authenticated player can request a brew from active GM');
check(postedRolls.length===1&&postedRolls[0].formula.startsWith('1d20'),'one native tool check triggers Dice So Nice chat');
check(nativeCalls[0].config.tool==='alchemist'&&nativeCalls[0].config.ability==='int','brew uses native Intelligence (Alchemist Supplies) check');
check(nativeCalls[0].config.target===14,'GM-configured DC reaches native tool check');
await moduleEntry.api.saveRules(defaultRules());
check(moduleEntry.api.getRules().dc.common===10,'GM restore returns default DC');
check(actorGame.items.contents.some(x=>x.name==='Potion of Healing'&&getQty(x)===2),'successful brew awards 2 potion items');
check(!actorGame.items.get('c'),'initial two-potion batch consumed 6 curatives');
// Simulate a failed brew with both follow-up dice succeeding: ingredients consumed, job pending.
const actorPending=equipBrewer(new Actor(new Item('p','Common Curative','common_curative',3)));
actorPending.testUserPermission=()=>true;
game.actors.get=id=>id==='test'?actorPending:null;
postedRolls=[];
rollValues=[2,18,19];
socketHandler({type:'request',nonce:'pending',mode:'brew',actorId:'test',recipeId:'potion-of-healing',batch:1,selectedIds:['p'],change:'highest',doublePass:'extra'},'player');
reply=await eventuallyResponse();
check(reply.ok===true,'double-success after failure enters extra-time branch');
check(postedRolls.length===3,'initial and two independent d20s sent to chat');
check(pendingRecords.length===1&&pendingRecords[0].status==='ready','pending batch recorded and ready for GM approval');
check(pendingRecords[0].outputSnapshot?.name==='Potion of Healing','pending brew preserves the original output Item data');
check(pendingRecords[0].recipeSnapshot?.cost.common_curative===3,'pending brew preserves recipe requirements');
check(!actorPending.items.get('p'),'pending batch ingredients are consumed exactly once');
// Removing a recipe after brewing begins must not change or prevent a pending reward.
const earlierLibrary=moduleEntry.api.getRecipes();
await moduleEntry.api.saveRecipes(earlierLibrary.filter(r=>r.id!=='potion-of-healing'));
check(!moduleEntry.api.getRecipes().some(r=>r.id==='potion-of-healing'),'recipe can be removed without erasing a pending brew');
socketHandler({type:'request',nonce:'finish',mode:'finish',actorId:'test',pendingId:pendingRecords[0].id},'gm');
await new Promise(resolve=>setTimeout(resolve,20));
check(pendingRecords.length===0,'GM completes pending batch and clears it');
check(actorPending.items.contents.some(x=>x.name==='Potion of Healing'&&getQty(x)===1),'pending completion awards original potion even after deletion');
await moduleEntry.api.saveRecipes(earlierLibrary);
console.log('Multiplayer request / brewing / pending-completion mocks passed.');
// Two successful follow-ups on initial failure trigger a live player choice, not a preselected dropdown.
const actorChoice=equipBrewer(new Actor(new Item('choice','Common Curative','common_curative',3)));actorChoice.testUserPermission=()=>true;
game.actors.get=id=>id==='test'?actorChoice:null;
postedRolls=[];rollValues=[2,18,19,5,40];
socketHandler({type:'request',nonce:'choice',mode:'brew',actorId:'test',recipeId:'potion-of-healing',batch:1,selectedIds:['choice'],change:'highest'},'player');
const choiceRequest=await eventuallyResponse();
check(choiceRequest.type==='choiceRequest'&&choiceRequest.targetUserId==='player','GM prompts the player only after both follow-up checks succeed');
socketHandler({type:'choiceResponse',requestId:choiceRequest.requestId,targetUserId:'gm',choice:'immediate'},'player');
reply=await eventuallyResponse();
check(reply.ok===true,'player can choose immediate partial yield after seeing follow-up rolls');
check(postedRolls.length===5&&postedRolls.at(-1).formula==='1d100','immediate branch rolls d8 and fractional d100');
check(actorChoice.items.contents.some(x=>x.name==='Potion of Healing'&&getQty(x)===1),'player-selected immediate branch awards partial yield');

// Critical bonus >100%: 5 base potions, 2 passing follow-up checks, 210% bonus
// => 10 guaranteed bonus + one 50% roll. A percentile of 40 awards an 11th bonus.
const actorCritical=equipBrewer(new Actor(new Item('crit','Common Curative','common_curative',15)));
actorCritical.testUserPermission=()=>true;
game.actors.get=id=>id==='test'?actorCritical:null;
postedRolls=[];
rollValues=[20,15,15,21,40];
socketHandler({type:'request',nonce:'critical',mode:'brew',actorId:'test',recipeId:'potion-of-healing',batch:5,selectedIds:['crit'],change:'highest',doublePass:'immediate'},'player');
reply=await eventuallyResponse();
check(reply.ok===true,'critical roll resolved by GM');
check(postedRolls.length===5&&postedRolls.at(-1).formula==='1d100','all critical follow-up, bonus, percentile dice sent to chat');
check(actorCritical.items.contents.some(x=>x.name==='Potion of Healing'&&getQty(x)===16),'critical yield uses integer bonus plus one percentile result above 100%');
// One failure-follow-up success: 50% of three potions gives one guaranteed, then 50% chance.
const actorPartial=equipBrewer(new Actor(new Item('partial','Common Curative','common_curative',9)));
actorPartial.testUserPermission=()=>true;
game.actors.get=id=>id==='test'?actorPartial:null;
postedRolls=[];
rollValues=[3,18,2,5,70];
socketHandler({type:'request',nonce:'partial',mode:'brew',actorId:'test',recipeId:'potion-of-healing',batch:3,selectedIds:['partial'],change:'highest',doublePass:'extra'},'player');
reply=await eventuallyResponse();
check(reply.ok===true&&postedRolls.length===5,'failure then one passing follow-up uses d8 and d100');
check(actorPartial.items.contents.some(x=>x.name==='Potion of Healing'&&getQty(x)===1),'partial yield 1.5 rounded by d100 70 => one potion');
check(!pendingRecords.length,'single follow-up success does not create pending job');
console.log('Critical and partial brewing mocked workflows passed.');
// GM-authoritative test: Herbalism Kit can brew Healing without Alchemist Supplies.
const herbBrewer=equipBrewer(new Actor(new Item('hc','Common Curative','common_curative',3)));
herbBrewer.testUserPermission=()=>true;
herbBrewer.items.contents=herbBrewer.items.contents.filter(i=>i.type!=='tool');
herbBrewer.system.tools.alchemist={value:0};
herbBrewer.system.tools.herb={prof:{multiplier:1,hasProficiency:true}};
const kit=new Item('kit','Herbalism Kit',null,1);kit.type='tool';kit.system.type={baseItem:'herb'};
herbBrewer.items.contents.push(kit);
game.actors.get=id=>id==='test'?herbBrewer:null;
nativeCalls=[];postedRolls=[];rollValues=[16];
socketHandler({type:'request',nonce:'herb-brew',mode:'brew',actorId:'test',
 recipeId:'potion-of-healing',batch:1,selectedIds:['hc'],change:'highest',toolId:'herb'},'player');
reply=await eventuallyResponse();
check(reply.ok&&nativeCalls[0].config.tool==='herb','GM rolls native Herbalism Kit rather than alchemist');
check(herbBrewer.items.contents.some(x=>x.name==='Potion of Healing'),'Herbalism Kit brewing produces a potion');

// Restrict poison-only recipes to a proficient, carried Poisoner's Kit.
mappings.reagents.common_poisonous='Item.common_poisonous';
const poisonBrewer=equipBrewer(new Actor(new Item('pc','Common Poisonous','common_poisonous',3)));
poisonBrewer.testUserPermission=()=>true;
poisonBrewer.system.tools.pois={prof:{multiplier:1,hasProficiency:true}};
const pKit=new Item('poison-kit',"Poisoner's Kit",null,1);pKit.type='tool';pKit.system.type={baseItem:'pois'};
poisonBrewer.items.contents.push(pKit);
game.actors.get=id=>id==='test'?poisonBrewer:null;
nativeCalls=[];postedRolls=[];rollValues=[];
socketHandler({type:'request',nonce:'wrong-kit',mode:'brew',actorId:'test',recipeId:'basic-poison',
 batch:1,selectedIds:['pc'],change:'highest',toolId:'alchemist'},'player');
denied=await eventuallyResponse();
check(!denied.ok&&/not permitted/.test(denied.message),'GM refuses non-approved kit');
check(getQty(poisonBrewer.items.get('pc'))===3&&postedRolls.length===0,'denied tool never spends reagents');
rollValues=[16];
socketHandler({type:'request',nonce:'poison-kit',mode:'brew',actorId:'test',recipeId:'basic-poison',
 batch:1,selectedIds:['pc'],change:'highest',toolId:'pois'},'player');
reply=await eventuallyResponse();
check(reply.ok&&nativeCalls.at(-1).config.tool==='pois','GM uses native Poisoner Kit roll');
check(poisonBrewer.items.contents.some(x=>x.name==='Basic Poison'),'correct kit produces poison');

// Initial and independent follow-ups use the exact same selected tool.
const followBrewer=equipBrewer(new Actor(new Item('fc','Common Curative','common_curative',3)));
followBrewer.testUserPermission=()=>true;
followBrewer.system.tools.herb={prof:{multiplier:1,hasProficiency:true}};
const hKit=new Item('follow-kit','Herbalism Kit',null,1);hKit.type='tool';hKit.system.type={baseItem:'herb'};
followBrewer.items.contents.push(hKit);
game.actors.get=id=>id==='test'?followBrewer:null;
nativeCalls=[];postedRolls=[];rollValues=[2,2,2];
socketHandler({type:'request',nonce:'follow-kit',mode:'brew',actorId:'test',
 recipeId:'potion-of-healing',batch:1,selectedIds:['fc'],change:'highest',toolId:'herb'},'player');
reply=await eventuallyResponse();
check(reply.ok&&nativeCalls.length===3&&nativeCalls.every(x=>x.config.tool==='herb'),'all follow-ups use chosen kit');

// Real socket branches for herb extraction and reagent downgrade (no rolls).
mappings.herbs={'world-CaveMoss':'Item.CaveMoss'};
mappings.herbNames={'world-CaveMoss':'Cave Moss'};
mappings.reagents.rare_curative='Item.rare_curative';
const actorHerb=new Actor(new Item('herb','Cave Moss','cave-moss',3));
actorHerb.testUserPermission=()=>true;
game.actors.get=id=>id==='test'?actorHerb:null;
postedRolls=[];
socketHandler({type:'request',nonce:'extract',mode:'extract',actorId:'test',herbId:'world-CaveMoss',itemId:'herb',quantity:2,reagentKey:'common_curative'},'player');
reply=await eventuallyResponse();
check(reply.ok===true,'herb extraction socket operation accepted');
check(getQty(actorHerb.items.get('herb'))===1,'two herbs consumed');
check(actorHerb.items.contents.some(x=>x.name==='Common Curative'&&getQty(x)===2),'two reagent items awarded');
check(postedRolls.length===0,'herb extraction does not roll dice');
const actorRefine=new Actor(new Item('rare','Rare Curative','rare_curative',2));
actorRefine.testUserPermission=()=>true;
game.actors.get=id=>id==='test'?actorRefine:null;
postedRolls=[];
socketHandler({type:'request',nonce:'refine',mode:'refine',actorId:'test',itemId:'rare',quantity:1,targetTier:'common'},'player');
reply=await eventuallyResponse();
check(reply.ok===true,'downgrade socket operation accepted');
check(getQty(actorRefine.items.get('rare'))===1,'only one of two Rare consumed');
check(actorRefine.items.contents.some(x=>x.name==='Common Curative'&&getQty(x)===3),'three Common returned by downgrade');
check(postedRolls.length===0,'downgrading does not roll dice');
actorRefine.testUserPermission=u=>u.isGM;
socketHandler({type:'request',nonce:'unauthorised',mode:'refine',actorId:'test',itemId:'rare',quantity:1,targetTier:'common'},'player');
reply=await eventuallyResponse();
check(reply.ok===false,'unauthorised player cannot modify another character inventory');
console.log('Herb, downgrade and permission mocks passed.');
