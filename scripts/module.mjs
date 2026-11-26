import {KEYS, TIERS, COLOURS, DC, HOURS,recipeTier,percentageYield,chanceSucceeds,classifyHerbs,assertQty} from './engine.mjs';
import {MID,getQty,normal,setting,findMatchedInventory,findHerbs,markActorInventory,planBrew,planExtract,planDowngrade,applyInventory,changeOutputs,template,outputData} from './inventory.mjs';
import {AlchemyWorkbench} from './workbench.mjs';
import {scanConfiguredSources,defaultDirectoryConfig,normalizeDirectoryConfig,sourceAliases} from './directories.mjs';
import {recipeDC,recipeHours,seedDefaults,validateLibrary,migrateRecipeTools} from './recipes.mjs';
import {brewToolSummary} from './recipe-tools.mjs';
import {brewingEligibility,selectBrewingTool,rollAlchemyToolCheck,naturalD20Result} from './eligibility.mjs';
import {defaultRules,validateRules,criticalDiceCount,bonusRollFormula,partialRollFormula,extraTimeHours} from './rules.mjs';

const DIALOG=()=>foundry.applications.api.DialogV2;
const esc=v=>foundry.utils.escapeHTML(String(v??''));
const slug=s=>String(s).replace(/_/g,' ');
const actors=()=>game.actors.contents.filter(a=>a.testUserPermission(game.user,'OWNER'));
const blankMappings=()=>({reagents:{},herbs:{},reagentAliases:{},herbAliases:{},reagentOverrides:{},outputs:{}});
const worldRules=()=>validateRules(game.settings.get(MID,'rules')||defaultRules());
const openWorkbenches=new Set();
let recipes=[],herbs=[],defaultRecipes=[];
const locks=new Set(),waiting=new Map(),decisions=new Map();
const SOCKET=`module.${MID}`;
const pickGM=()=>game.users.filter(u=>u.active&&u.isGM).sort((a,b)=>a.id.localeCompare(b.id))[0];
const owns=(actor,user)=>user?.isGM||actor?.testUserPermission(user,'OWNER');
const recipeBy=id=>recipes.find(r=>r.id===id);
const herbBy=id=>herbs.find(h=>h.id===id);
const fmt=arr=>arr.map(x=>`${x.quantity} × ${x.id.replace(/_/g,' ')}`).join(', ')||'None';
const button=(action,label,callback,def=false)=>({action,label,default:def,callback});
const btnCancel={action:'cancel',label:'Cancel'};
const wait=(title,content,buttons)=>DIALOG().wait({window:{title},classes:[MID],content,buttons:[...buttons,btnCancel],rejectClose:false});
const sel=(name,options,chosen='')=>`<select name="${esc(name)}">${options.map(o=>`<option value="${esc(o.value)}" ${o.value===chosen?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
const itemOptions=(items)=>items.map(x=>({value:x.id,label:`${x.name} (×${getQty(x)})`}));
const qtyInput=(value=1,max=100)=>`<input type="number" name="quantity" min="1" max="${max}" step="1" value="${value}" required>`;
const note=t=>`<p class="awb-note">${esc(t)}</p>`;
const field=(label,html)=>`<label class="awb-field"><span>${esc(label)}</span>${html}</label>`;
const listHtml=(rows)=>`<div class="awb-rows">${rows.join('')}</div>`;
const summary=(title,description)=>`<div class="awb"><h3>${esc(title)}</h3><p>${esc(description)}</p>`;

async function selectActor(){
 const possible=actors();
 if(!possible.length)throw new Error('You do not control a character with an inventory.');
 const preferred=canvas?.tokens?.controlled?.find(t=>possible.some(a=>a.id===t.actor?.id))?.actor||game.user.character;
 if(preferred&&possible.some(a=>a.id===preferred.id))return preferred;
 if(possible.length===1)return possible[0];
 const result=await wait('Alchemy — Select Character',`<div class="awb">${field('Character',sel('actor',possible.map(a=>({value:a.id,label:a.name}))))}</div>`,[button('choose','Choose',(e,b)=>b.form.elements.actor.value,true)]);
 return result?game.actors.get(result):null;
}
function workbench(actor){
 const app=new AlchemyWorkbench(actor,{
  get recipes(){return recipes;},get defaultRecipes(){return defaultRecipes;},get herbs(){return herbs;},mappings:setting,submit:submitAction,saveMappings,saveRecipes,
  directories:()=>game.settings.get(MID,'directoryConfig'),
  directoryReport:()=>game.settings.get(MID,'directoryReport'),
  rules:worldRules,saveRules,previewDirectories,refreshDirectories,pending:pendingDialog,brewingEligibility
 });
 openWorkbenches.add(app);
 return app;
}
async function hub({tab='brew'}={}){
 if(!recipes.length){ui.notifications.warn('Alchemy data are not ready.');return;}
 try{
  // GM setup must also work in a new world before any Actor has been created.
  const actor=tab==='gm' && !actors().length
    ? {id:'world-setup',name:'World Setup',system:{},items:{contents:[],get:()=>null,*[Symbol.iterator](){}}}
    : await selectActor();
  if(!actor)return;
  const app=workbench(actor);app.tab=tab;await app.render(true);
  return app;
 }catch(err){notifyError(err);}
}
async function auditActor(actor){
 const map=setting(), r=findMatchedInventory(actor,map),h=findHerbs(actor,map,herbs);
 const html=`<div class="awb"><h3>Recognised reagents</h3>${listHtml(r.map(x=>`<p>${esc(x.item.name)} × ${x.quantity} — ${esc(slug(x.key))}</p>`))||note('No mapped reagents found.')}
 <h3>Recognised herbs</h3>${listHtml(h.map(x=>`<p>${esc(x.item.name)} × ${x.quantity} — ${esc(x.herb.reagents.map(slug).join(' / '))}</p>`))||note('No mapped herbs found.')}</div>`;
 await wait('Alchemy — Inventory',html,[button('ok','Close',()=>true,true)]);
}
async function extractDialog(actor){
 const m=setting(), available=findHerbs(actor,m,herbs);
 if(!available.length)throw new Error('No mapped herbs in this character inventory. Ask the GM to map herbs first.');
 const selected=await wait('Prepare Reagents — Select Herb',`<div class="awb">${field('Herb',sel('item',available.map(x=>({value:x.item.id,label:`${x.item.name} × ${x.quantity}`}))))}</div>`,[button('next','Next',(e,b)=>b.form.elements.item.value,true)]);
 if(!selected)return;
 const row=available.find(x=>x.item.id===selected);
 if(!row)throw new Error('Herb selection is no longer available.');
 const content=`<div class="awb"><p>${esc(row.item.name)} · ${esc(row.herb.rarity)} herb</p>${field('Produce one of',sel('reagent',row.herb.reagents.map(k=>({value:k,label:slug(k)}))))}${field('Number of herbs',qtyInput(1,Math.min(1000,row.quantity)))}${note('No check or brewing time. One consumed herb produces one selected reagent. Cannot produce both properties from a single unit.')}</div>`;
 const chosen=await wait('Prepare Reagents — Extract',content,[button('extract','Extract',(e,b)=>({reagentKey:b.form.elements.reagent.value,quantity:Number(b.form.elements.quantity.value)}),true)]);
 if(chosen)await submitAction({mode:'extract',actorId:actor.id,herbId:row.herb.id,itemId:row.item.id,...chosen});
}
async function refineDialog(actor){
 const m=setting();const available=findMatchedInventory(actor,m).filter(x=>!x.key.startsWith('common_'));
 if(!available.length)throw new Error('No mapped Rare or Exotic reagents in the character inventory.');
 const result=await wait('Downgrade Reagents',`<div class="awb">${field('Reagent',sel('item',available.map(x=>({value:x.id,label:`${x.item.name} × ${x.quantity} (${slug(x.key)})`})) ))}${field('Target tier',sel('tier',[{value:'rare',label:'Rare (3 per Exotic)'},{value:'common',label:'Common (3 per Rare or 9 per Exotic)'}]))}${field('Quantity to downgrade',qtyInput(1,1000))}${note('Instantaneous, no check. Only within the same reagent colour; upgrades are not allowed.')}</div>`,[button('refine','Downgrade',(e,b)=>({itemId:b.form.elements.item.value,targetTier:b.form.elements.tier.value,quantity:Number(b.form.elements.quantity.value)}),true)]);
 if(!result)return;
 const selected=available.find(x=>x.id===result.itemId);
 if(!selected)throw new Error('Reagent unavailable.');
 if(selected.key.startsWith('rare_')&&result.targetTier!=='common')throw new Error('Rare reagents can only downgrade to Common.');
 await submitAction({mode:'refine',actorId:actor.id,...result});
}
async function brewDialog(actor){
 const map=setting();const list=recipes.filter(r=>r.enabled!==false).map(r=>({value:r.id,label:`${r.name} — ${recipeTier(r)} (DC ${recipeDC(r,worldRules())})`}));
 const chosen=await wait('Alchemy — Select Recipe',`<div class="awb">${field('Recipe',sel('recipe',list))}${field('Batch size',qtyInput(1,worldRules().maxBatch))}${note('One brewing check for the full batch; brewing time does not increase with batch size.')}</div>`,[button('next','Choose Reagents',(e,b)=>({recipeId:b.form.elements.recipe.value,batch:Number(b.form.elements.quantity.value)}),true)]);
 if(!chosen)return;
 const recipe=recipeBy(chosen.recipeId),batch=assertQty(chosen.batch,worldRules().maxBatch);
 if(!recipe)throw new Error('Unknown recipe.');
 const qualified=brewingEligibility(actor,recipe);
 if(!qualified.ok)throw new Error(qualified.errors.join(' '));
 const reagents=findMatchedInventory(actor,map);
 const cost=Object.entries(recipe.cost).map(([k,v])=>`${batch*v} ${slug(k)}`).join(' · ');
 let plan;
 try{plan=planBrew(actor,recipe,batch,map,null,'highest');}catch(err){throw new Error(`${err.message} Required: ${cost}`);}
 const content=`<div class="awb"><p><strong>${esc(recipe.name)}</strong> × ${batch} · DC ${recipeDC(recipe,worldRules())} · ${recipeHours(recipe,worldRules())} hours</p><p><strong>Recipe cost:</strong> ${esc(cost)}</p>
 <details><summary>Eligible reagent stacks (uncheck to exclude)</summary>${listHtml(reagents.map(x=>`<label class="awb-check"><input type="checkbox" name="ingredient" value="${esc(x.id)}" checked>${esc(x.item.name)} × ${x.quantity} — ${esc(slug(x.key))}</label>`))}</details>
 <p><strong>Default allocation:</strong> ${esc(plan.consume.map(x=>`${actor.items.get(x.id)?.name} × ${x.quantity}`).join(', '))||'None'}</p>
 <p><strong>Default returned change:</strong> ${esc(fmt(changeOutputs(plan)))}</p>
 ${field('Brewing tool (any one approved)',sel('brewTool',qualified.eligible.map(x=>({value:x.id,label:x.label}))))}
 ${note('Allowed tools: '+brewToolSummary(recipe)+'. The same proficient kit is used for all checks.')}
 ${field('Return change as',sel('change',[{value:'highest',label:'Highest possible tier'},{value:'common',label:'Common tier whenever possible'}]))}
 ${worldRules().failure.followUps===2&&worldRules().failure.twoPassMode==='choice'?field('If both failure follow-up dice pass',sel('doublePass',[{value:'extra',label:`Full yield after ${worldRules().failure.extraTimePercent}% extra brewing time (GM completes later)`},{value:'immediate',label:`Immediate partial yield, 1d${worldRules().failure.partialDieSides} × ${worldRules().failure.partialPercentPerPoint}%`}])):''}
 ${note('Confirm that the GM has allowed the required brewing time to pass. Ingredient quantities and mappings are revalidated before rolling. All dice appear in chat and Dice So Nice.')}</div>`;
 const response=await wait('Alchemy — Brewing Ingredients',content,[button('brew','Brew',(e,b)=>({selectedIds:[...b.form.querySelectorAll('input[name="ingredient"]:checked')].map(x=>x.value),change:b.form.elements.change.value,toolId:b.form.elements.brewTool.value,doublePass:b.form.elements.doublePass?.value}),true)]);
 if(!response)return;
 // Recompute preview after player filters sources; no inventory change here.
 const selectedPlan=planBrew(actor,recipe,batch,map,response.selectedIds,response.change);
 const confirm=await DIALOG().confirm({window:{title:'Confirm Brewing'},content:`<div class="awb"><p>${esc(recipe.name)} × ${batch}</p><p>Consume: ${esc(selectedPlan.consume.map(x=>`${actor.items.get(x.id)?.name} × ${x.quantity}`).join(', '))}</p><p>Return change: ${esc(fmt(changeOutputs(selectedPlan)))}</p><p>Time: ${recipeHours(recipe,worldRules())} hours. Reagents may be lost on failure.</p></div>`,yes:{label:'Roll & Consume'},no:{label:'Cancel'},rejectClose:false});
 if(confirm)await submitAction({mode:'brew',actorId:actor.id,recipeId:recipe.id,batch,selectedIds:response.selectedIds,change:response.change,toolId:response.toolId,doublePass:response.doublePass});
}

async function saveRules(raw){
 if(!game.user?.isGM)throw new Error('Only a GM can change alchemy rules.');
 const validated=validateRules(raw);
 await game.settings.set(MID,'rules',validated);
 for(const app of openWorkbenches){
  if(!app?.rendered)continue;
  if(!app.rulesDirty)app.rulesDraft=null;
  try{await app.render({force:true});}catch(error){console.warn(MID+': rules refresh failed',error);}
 }
 ui.notifications.info('Alchemy: Global brewing rules saved. Pending batches are unchanged.');
 return validated;
}
async function saveRecipes(entries){
 if(!game.user.isGM)throw new Error('Only a GM can edit the recipe library.');
 const validated=validateLibrary(entries,{allowMissingOutput:true});
 for(const r of validated){
  if(r.source==='custom'&&r.enabled&&!r.outputUuid)throw new Error('Enabled custom recipe '+r.name+' requires a potion output Item.');
  if(r.outputUuid && !await template(r.outputUuid))throw new Error('Missing potion output for '+r.name+': '+r.outputUuid);
 }
 const oldLibrary=structuredClone(game.settings.get(MID,'recipeLibrary'));
 const oldMappings=structuredClone(setting()||blankMappings());
 const outputMap=Object.fromEntries(validated.filter(r=>r.outputUuid).map(r=>[r.id,r.outputUuid]));
 const updatedMappings={...oldMappings,outputs:outputMap};
 try{
  await game.settings.set(MID,'mappings',updatedMappings);
  await game.settings.set(MID,'recipeLibrary',{initialized:true,recipes:validated});
 }catch(err){
  try{
   await game.settings.set(MID,'mappings',oldMappings);
   await game.settings.set(MID,'recipeLibrary',oldLibrary);
  }catch(rollback){console.error(MID+': failed to roll back recipe settings',rollback);}
  throw err;
 }
 recipes.splice(0,recipes.length,...validated);
 for(const app of openWorkbenches)if(app?.rendered){
  try{await app.render({force:true});}catch(error){console.warn(MID+': recipe UI refresh failed',error);}
 }
 ui.notifications.info('Alchemy: '+validated.length+' world recipes saved.');
 return validated.length;
}
async function setupHub(){return hub({tab:'gm'});}
async function saveMappings(kind,values){
 if(!game.user.isGM)throw new Error('GM access required.');
 if(!['reagents','outputs'].includes(kind))throw new Error('Herbs are discovered from selected World Item folders and/or Item compendiums, not mapped individually.');
 const map=structuredClone(setting()||blankMappings());
 const source=kind==='reagents'?KEYS.map(key=>({id:key})):recipes;
 const accepted=new Set(source.map(x=>x.id));
 const result=Object.fromEntries(Object.entries(values||{}).filter(([key,uuid])=>accepted.has(key)&&typeof uuid==='string'&&uuid.trim()).map(([key,uuid])=>[key,uuid.trim()]));
 const names={},aliases={};
 for(const [key,uuid] of Object.entries(result)){
  const item=await template(uuid);
  if(!item)throw new Error('Invalid Item UUID for '+key+': '+uuid);
  names[key]=item.name;
  if(kind==='reagents')aliases[key]=[...new Set([...sourceAliases(item),...(map.reagentAliases?.[key]||[])])];
 }
 map[kind]=result;
 if(kind==='reagents'){
  map.reagentNames=names;
  map.reagentOverrides={...result}; // Explicit GM mappings remain authoritative on refresh.
  map.reagentAliases=aliases;
 }
 await game.settings.set(MID,'mappings',map);
 if(kind==='reagents'){
  let marked=0;
  for(const actor of game.actors.contents){
   try{marked+=await markActorInventory(actor,map,herbs);}
   catch(error){console.warn(MID+': cannot classify '+actor.name,error);}
  }
  ui.notifications.info('Alchemy: Saved '+Object.keys(result).length+' reagent mappings; classified '+marked+' actor Items.');
 }else ui.notifications.info('Alchemy: Saved '+Object.keys(result).length+' potion output mappings.');
 return Object.keys(result).length;
}
async function previewDirectories(config){
 if(!game.user.isGM)throw new Error('GM access required.');
 return scanConfiguredSources({folders:game.folders,items:game.items},config,{herbs,mappings:setting()},{
  packs:game.packs,resolveUuid:uuid=>fromUuid(uuid)
 });
}
async function refreshDirectories(config){
 if(!game.user.isGM)throw new Error('GM access required.');
 const selection=normalizeDirectoryConfig(config||game.settings.get(MID,'directoryConfig'));
 const scan=await previewDirectories(selection);
 const oldMap=structuredClone(setting()||blankMappings()),oldHerbs=herbs;
 const oldConfig=game.settings.get(MID,'directoryConfig'),oldReport=game.settings.get(MID,'directoryReport');
 const nextMap={...oldMap,
  reagents:scan.reagentMappings,reagentNames:scan.reagentNames,reagentAliases:scan.reagentAliases,
  herbs:scan.herbMappings,herbNames:scan.herbNames,herbAliases:scan.herbAliases
 };
 try{
  await game.settings.set(MID,'mappings',nextMap);
  await game.settings.set(MID,'herbCatalog',scan.herbs);
  await game.settings.set(MID,'directoryConfig',selection);
  await game.settings.set(MID,'directoryReport',scan.report);
  herbs=scan.herbs;
 }catch(error){
  console.error(MID+': folder refresh failed; restoring previous settings',error);
  try{
   await game.settings.set(MID,'mappings',oldMap);
   await game.settings.set(MID,'herbCatalog',oldHerbs);
   await game.settings.set(MID,'directoryConfig',oldConfig);
   await game.settings.set(MID,'directoryReport',oldReport);
  }catch(rollbackError){console.error(MID+': rollback failed',rollbackError);}
  throw error;
 }
 let marked=0;
 for(const actor of game.actors.contents){
  try{marked+=await markActorInventory(actor,nextMap,herbs);}
  catch(error){console.warn(MID+': cannot classify '+actor.name,error);}
 }
 ui.notifications.info('Alchemy: '+scan.report.validHerbs+' herbs and '+scan.report.mappedReagents+'/9 reagents discovered; '+scan.report.issues.length+' notices. '+marked+' actor Items classified.');
 return scan.report;
}
async function pendingDialog(){
 if(!game.user.isGM)throw new Error('GM access required.');
 const pending=game.settings.get(MID,'pending');
 if(!pending.length){ui.notifications.info('No pending alchemy brews.');return;}
 const result=await wait('Alchemy — Complete Pending Batch',`<div class="awb">${field('Pending brew',sel('pending',pending.map(p=>({value:p.id,label:`${p.actorName}: ${p.recipeName} × ${p.batch} (+${p.extraHours}h)`}))))}${note('Complete only after the GM has advanced the agreed extra brewing time. Ingredients were already consumed when brewing began.')}</div>`,[button('finish','Complete',(e,b)=>b.form.elements.pending.value,true)]);
 if(result)await submitAction({mode:'finish',pendingId:result,actorId:pending.find(x=>x.id===result)?.actorId});
}
function notifyError(err){console.error(`${MID}:`,err);ui.notifications.error(`Alchemy: ${err?.message||err}`);}
function nonce(){return foundry.utils.randomID(20);}
async function submitAction(data){
 const gm=pickGM();if(!gm)throw new Error('An active GM is required to perform inventory transactions and dice rolls.');
 const message={type:'request',nonce:nonce(),...data};
 if(gm.id===game.user.id)return await executeRequest(message,game.user.id);
 const answer=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{waiting.delete(message.nonce);reject(new Error('The GM did not respond within 120 seconds. Check connection and retry.'));},120000);
  waiting.set(message.nonce,{resolve,reject,timeout});
 });
 game.socket.emit(SOCKET,message);
 const result=await answer;ui.notifications.info(result);return result;
}
async function roll(formula,flavor,actor){
 const r=await new Roll(formula).evaluate();
 await r.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`Alchemy · ${flavor}`});
 return r;
}
async function fractionalRoll(yieldData,actor,label){
 if(!yieldData.fractional)return yieldData.guaranteed;
 const r=await roll('1d100',`${label} · ${yieldData.fractional}% chance of one more potion`,actor);
 return yieldData.guaranteed+Number(chanceSucceeds(r.total,yieldData.fractional));
}
async function choiceDialog(actor,rules=worldRules()){
 const policy=validateRules(rules);
 const f=policy.failure;
 const full='Full batch · +'+f.extraTimePercent+'% time';
 const partial='Partial batch · now';
 const content='<div class="awb"><h3>'+esc(actor.name)+': choose how to finish brewing</h3>'+
  '<p>Both independent follow-up checks succeeded after a failed initial check.</p>'+
  '<p><strong>Option A:</strong> Full intended batch after '+f.extraTimePercent+'% additional brewing time (GM approves completion).</p>'+
  '<p><strong>Option B:</strong> Resolve immediately using 1d'+f.partialDieSides+' × '+f.partialPercentPerPoint+
  '% of the batch; a d100 resolves any fractional potion.</p></div>';
 const answer=await DIALOG().wait({window:{title:'Alchemy — Both Follow-up Checks Succeeded'},classes:[MID],content,
  buttons:[{action:'extra',label:full,default:true,callback:()=> 'extra'},
   {action:'immediate',label:partial,callback:()=> 'immediate'}],rejectClose:false});
 return answer==='immediate'?'immediate':'extra';
}
async function requestFailureChoice(actor,senderId,rules){
 if(senderId===game.user.id)return choiceDialog(actor,rules);
 const requestId=nonce();
 return new Promise(resolve=>{
  const timeout=setTimeout(()=>{decisions.delete(requestId);resolve('extra');},60000);
  decisions.set(requestId,{resolve,timeout,senderId});
  game.socket.emit(SOCKET,{type:'choiceRequest',requestId,targetUserId:senderId,actorName:actor.name,
   rules:{failure:rules.failure}});
 });
}
async function brewOutcome(actor,recipe,batch,{senderId,doublePass,rules=worldRules(),toolId='alchemist'}={}){
 const policy=validateRules(rules),dc=recipeDC(recipe,policy);
 const initial=await rollAlchemyToolCheck(actor,dc,{toolId,recipe});
 const natural=naturalD20Result(initial);
 if(natural>=policy.critical.naturalThreshold){
  let passes=0;
  for(let i=0;i<policy.critical.followUps;i++){
   const check=await rollAlchemyToolCheck(actor,dc,{followUp:true,toolId,recipe});
   passes+=Number(check.total>=dc);
  }
  const diceCount=criticalDiceCount(passes,policy);
  const formula=bonusRollFormula(policy.critical.dieSides,diceCount);
  let bonusPct=0;
  if(formula){
   const r=await roll(formula,diceCount+' bonus d'+policy.critical.dieSides+
    ' ('+policy.critical.percentPerPoint+'% each point)',actor);
   bonusPct=r.total*policy.critical.percentPerPoint;
  }
  const bonus=await fractionalRoll(percentageYield(batch,bonusPct),actor,'Critical bonus');
  return {status:'critical',produced:batch+bonus,bonus,bonusPct,passes};
 }
 if(initial.total>=dc)return {status:'success',produced:batch};
 let passes=0;
 for(let i=0;i<policy.failure.followUps;i++){
  const check=await rollAlchemyToolCheck(actor,dc,{followUp:true,toolId,recipe});
  passes+=Number(check.total>=dc);
 }
 if(passes===0){
  const pct=policy.failure.zeroPassPercent;
  const produced=pct?await fractionalRoll(percentageYield(batch,pct),actor,'No-pass yield'):0;
  return {status:produced?'partial':'lost',produced,passes,percent:pct};
 }
 if(passes===2){
  const option=policy.failure.twoPassMode;
  const choice=option==='choice'
   ?(['extra','immediate'].includes(doublePass)?doublePass:await requestFailureChoice(actor,senderId,policy))
   :option;
  if(choice==='extra'){
   const extraHours=extraTimeHours(recipeHours(recipe,policy),policy);
   if(extraHours===0)return {status:'success',produced:batch,passes};
   return {status:'pending',produced:0,passes,extraHours};
  }
 }
 const formula=partialRollFormula(policy.failure.partialDieSides);
 const r=await roll(formula,'Partial yield — '+formula+' × '+policy.failure.partialPercentPerPoint+'%',actor);
 const pct=r.total*policy.failure.partialPercentPerPoint;
 const produced=await fractionalRoll(percentageYield(batch,pct),actor,'Partial yield');
 return {status:'partial',produced,percent:pct,passes};
}
function validActor(actorId,senderId){
 const actor=game.actors.get(actorId),user=game.users.get(senderId);
 if(!actor||!user||!owns(actor,user))throw new Error('You do not have permission to craft for that actor.');
 return actor;
}
async function executeRequest(p,senderId){
 if(!game.user.isGM || pickGM()?.id!==game.user.id)return;
 const id=String(p.actorId||'');
 const key=`${id}`;
 if(locks.has(key)){respond(p,senderId,false,'Another alchemy transaction is already in progress.');return;}
 locks.add(key);
 try{
  const result=await performAction(p,senderId);
  respond(p,senderId,true,result);return result;
 }catch(err){console.error(`${MID} request error`,err);respond(p,senderId,false,err.message||'Crafting failed.');if(senderId===game.user.id)throw err;}
 finally{locks.delete(key);}
}
function respond(p,userId,ok,message){
 if(userId===game.user.id){ui.notifications[ok?'info':'error'](`Alchemy: ${message}`);return;}
 game.socket.emit(SOCKET,{type:'result',nonce:p.nonce,targetUserId:userId,ok,message});
}
async function performAction(p,senderId){
 if(!['brew','extract','refine','finish'].includes(p.mode))throw new Error('Invalid crafting mode.');
 const actor=validActor(p.actorId,senderId),map=setting();
 if(p.mode==='finish'){
  if(!game.users.get(senderId)?.isGM)throw new Error('Only the GM can complete pending brewing time.');
  const pending=game.settings.get(MID,'pending');const index=pending.findIndex(x=>x.id===p.pendingId&&x.actorId===actor.id);
  if(index<0 || pending[index].status!=='ready')throw new Error('Pending brew is not ready or already completed.');
  const job=pending[index],recipe=job.recipeSnapshot||recipeBy(job.recipeId);
  if(!recipe && !job.outputSnapshot)throw new Error('Legacy pending brew output is missing; GM intervention required.');
  // Mark non-redeemable before the reward; a failed save must never enable duplicate completion.
  await game.settings.set(MID,'pending',pending.map(x=>x.id===job.id?{...x,status:'completing'}:x));
  try {
   await applyInventory(actor,[],[{kind:'potion',id:job.recipeId,name:job.recipeName,quantity:job.batch,...(job.outputSnapshot?{snapshot:job.outputSnapshot}:{})}],map);
  }catch(err){
   // Reward transaction failed and rolled back, so allow a later retry.
   try{const current=game.settings.get(MID,'pending');await game.settings.set(MID,'pending',current.map(x=>x.id===job.id?{...x,status:'ready'}:x));}catch(e){console.error('Pending brew status restore failed',e);}
   throw err;
  }
  // If removal fails, record stays non-redeemable; manual reconciliation is safer than double-awarding.
  await game.settings.set(MID,'pending',game.settings.get(MID,'pending').filter(x=>x.id!==job.id));
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>Alchemy completed:</strong> ${esc(job.recipeName)} × ${job.batch}. Additional ${job.extraHours} hours elapsed.</p>`});
  return `${job.recipeName} × ${job.batch} awarded.`;
 }
 if(p.mode==='extract'){
  const plan=planExtract(actor,p.herbId,p.itemId,p.quantity,herbs,map,p.reagentKey);
  await applyInventory(actor,plan.consume,plan.outputs,map);
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>Reagents prepared:</strong> ${esc(fmt(plan.outputs))}. No check required.</p>`});
  return `Extracted ${fmt(plan.outputs)}.`;
 }
 if(p.mode==='refine'){
  const plan=planDowngrade(actor,p.itemId,p.quantity,p.targetTier,map);
  await applyInventory(actor,plan.consume,plan.outputs,map);
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>Reagents downgraded:</strong> ${esc(fmt(plan.outputs))}. No check required.</p>`});
  return `Downgraded: ${fmt(plan.outputs)}.`;
 }
 const policy=worldRules();
  const recipe=recipeBy(p.recipeId),batch=assertQty(p.batch,policy.maxBatch);
 if(!recipe)throw new Error('Unrecognised recipe.');
 if(recipe.enabled===false)throw new Error('That recipe is disabled by the GM.');
 if((p.doublePass!==undefined&&!['immediate','extra'].includes(p.doublePass))||!['highest','common'].includes(p.change))throw new Error('Invalid brewing options.');
 if(!Array.isArray(p.selectedIds)||p.selectedIds.length>200||p.selectedIds.some(x=>typeof x!=='string'))throw new Error('Invalid ingredient selection.');
 // GM verifies the exact permitted, equipped, proficient kit.
 const selectedTool=selectBrewingTool(actor,recipe,p.toolId);
 const plan=planBrew(actor,recipe,batch,map,p.selectedIds,p.change);
 // Verify all change output templates before taking any dice or inventory changes.
 for(const key of Object.keys(plan.return))if(!await template(map.reagents?.[key]))throw new Error(`Reagent change item is unmapped: ${key}`);
 // Snapshot the exact output template before dice are rolled, protecting delayed rewards from later edits.
 const outputSnapshot=await outputData('potion',recipe.id,map,recipe.name);
 const result=await brewOutcome(actor,recipe,batch,{senderId,doublePass:p.doublePass,rules:policy,toolId:selectedTool.id});
 const outputs=changeOutputs(plan);
 if(result.produced)outputs.push({kind:'potion',id:recipe.id,name:recipe.name,quantity:result.produced,snapshot:outputSnapshot});
 if(result.status==='pending'){
  const jobs=game.settings.get(MID,'pending');
  const job={id:nonce(),actorId:actor.id,actorName:actor.name,recipeId:recipe.id,recipeName:recipe.name,batch,extraHours:result.extraHours,createdAt:Date.now(),status:'reserving',recipeSnapshot:structuredClone(recipe),rulesSnapshot:structuredClone(policy),brewToolId:selectedTool.id,outputSnapshot};
  // Record as non-redeemable first. It becomes ready only after all ingredients were consumed.
  await game.settings.set(MID,'pending',[...jobs,job]);
  try {
   await applyInventory(actor,plan.consume,outputs,map);
   const current=game.settings.get(MID,'pending');
   await game.settings.set(MID,'pending',current.map(x=>x.id===job.id?{...x,status:'ready'}:x));
  }catch(err){
   // A failure after consumption may need GM reconciliation; never leave a redeemable job.
   try{const current=game.settings.get(MID,'pending');await game.settings.set(MID,'pending',current.filter(x=>x.id!==job.id));}catch(e){console.error('Failed to cancel reservation',e);}
   throw err;
  }
 }else await applyInventory(actor,plan.consume,outputs,map);
 const extra=result.status==='pending'?`Ready after an additional ${result.extraHours} hours; ingredients reserved/consumed.`:'';
 const outputItem=await template(map.outputs?.[recipe.id]);
 const art=outputSnapshot?.img||outputItem?.img||'icons/consumables/potions/potion-bottle-corked-red.webp';
 const outcomeLabels={critical:'Critical Success',success:'Successful Brew',partial:'Partial Success',pending:'Awaiting Extra Brewing Time',lost:'Failed Brew'};
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<article class="awb-chat awb-result awb-result-${esc(result.status)}"><header><img src="${esc(art)}" alt=""><div><small>ALCHEMICAL BREWING · ${esc(outcomeLabels[result.status]||result.status)}</small><h3>${esc(recipe.name)}</h3></div></header><div class="awb-result-counters"><span><strong>${batch}</strong> attempted</span><span><strong>${result.produced}</strong> produced</span></div>${extra?`<p>${esc(extra)}</p>`:''}<p><strong>Brewing check:</strong> Intelligence (${esc(selectedTool.label)})</p><p><strong>Reagents returned:</strong> ${esc(fmt(changeOutputs(plan)))}</p>${result.bonusPct!==undefined?`<p><strong>Critical bonus:</strong> +${result.bonusPct}% — ${result.bonus} additional potions</p>`:''}${result.percent!==undefined?`<p><strong>Partial yield:</strong> ${result.percent}%</p>`:''}</article>`});
 return `${recipe.name}: ${result.status}; ${result.produced} potions made.${extra?' '+extra:''}`;
}
function onSocket(payload,senderId){
 if(!payload || typeof payload!=='object')return;
 if(payload.type==='request'){
  // Foundry appends the authenticated sender's user ID to module socket callbacks.
  if(typeof senderId!=='string'||!game.users.get(senderId))return;
  void executeRequest(payload,senderId);
  }else if(payload.type==='choiceRequest' && payload.targetUserId===game.user.id && senderId===pickGM()?.id){
   void choiceDialog({name:payload.actorName},payload.rules).then(choice=>{
    game.socket.emit(SOCKET,{type:'choiceResponse',requestId:payload.requestId,choice,targetUserId:senderId});
   }).catch(err=>console.warn('Alchemy choice dialog failed',err));
  }else if(payload.type==='choiceResponse' && payload.targetUserId===game.user.id){
   const item=decisions.get(payload.requestId);
   if(!item||item.senderId!==senderId||!['extra','immediate'].includes(payload.choice))return;
   clearTimeout(item.timeout);decisions.delete(payload.requestId);item.resolve(payload.choice);
  }else if(payload.type==='result' && payload.targetUserId===game.user.id){
  const pending=waiting.get(payload.nonce);if(!pending)return;
  clearTimeout(pending.timeout);waiting.delete(payload.nonce);
  if(payload.ok)pending.resolve(payload.message);else pending.reject(new Error(payload.message));
 }
}
function addSheetButton(app,html){
 const actor=app.actor||app.document;if(!actor||actor.documentName!=='Actor'||!owns(actor,game.user))return;
 const root=html instanceof HTMLElement?html:html?.[0]||app.element;
 const header=root?.querySelector?.('.window-header');if(!header||header.querySelector('.awb-header-button'))return;
 const el=document.createElement('button');el.className='awb-header-button';el.type='button';el.title='Alchemy Workbench';el.innerHTML='<i class="fas fa-flask" aria-hidden="true"></i> Alchemy';
 el.addEventListener('click',e=>{e.preventDefault();void hub();});
 header.insertBefore(el,header.querySelector('.window-title')?.nextSibling||header.firstChild);
}
Hooks.once('init',()=>{
 game.settings.register(MID,'rules',{name:'Alchemy world brewing rules',scope:'world',config:false,type:Object,default:defaultRules()});
  game.settings.register(MID,'mappings',{name:'Alchemy item mappings',scope:'world',config:false,type:Object,default:blankMappings()});
 game.settings.register(MID,'directoryConfig',{name:'Alchemy item folders',scope:'world',config:false,type:Object,default:defaultDirectoryConfig()});
 game.settings.register(MID,'herbCatalog',{name:'Discovered herb catalogue',scope:'world',config:false,type:Array,default:[]});
 game.settings.register(MID,'recipeLibrary',{name:'World recipe library',scope:'world',config:false,type:Object,default:{initialized:false,recipes:[]}});
 game.settings.register(MID,'directoryReport',{name:'Alchemy directory validation',scope:'world',config:false,type:Object,default:{issues:[],added:[],changed:[],removed:[],herbItems:0,reagentItems:0,validHerbs:0,mappedReagents:0}});
 game.settings.register(MID,'pending',{name:'Pending alchemy brews',scope:'world',config:false,type:Array,default:[]});
 const api={open:hub,setup:()=>hub({tab:'gm'}),legacySetup:setupHub,getRecipes:()=>structuredClone(recipes),getDefaultRecipes:()=>structuredClone(defaultRecipes),saveRecipes,getRules:worldRules,saveRules,recipeTest:()=>hub({tab:'gm'}),getHerbs:()=>structuredClone(herbs),previewDirectories,refreshDirectories};
 game.modules.get(MID).api=api;
 Hooks.on('renderActorSheetV2',addSheetButton);
 Hooks.on('renderActorSheet',addSheetButton);
 Hooks.on('updateSetting',setting=>{
  if(setting.key===MID+'.herbCatalog')herbs=game.settings.get(MID,'herbCatalog')||[];
  if(setting.key===MID+'.recipeLibrary'){
   const data=game.settings.get(MID,'recipeLibrary');
   if(data?.initialized)recipes.splice(0,recipes.length,...migrateRecipeTools(data.recipes).recipes);
  }
  if([MID+'.herbCatalog',MID+'.mappings',MID+'.recipeLibrary',MID+'.rules'].includes(setting.key)){
   for(const app of openWorkbenches){
    if(!app?.rendered)continue;
    void app.render({force:true}).catch(error=>console.warn(MID+': window refresh failed',error));
   }
  }
 });
 Hooks.on('createItem',async item=>{
  if(!game.user.isGM || !item?.parent || item.parent.documentName!=='Actor'||!herbs.length)return;
  try{await markActorInventory(item.parent,setting(),herbs);}catch(err){console.warn(`${MID}: automatic item classification failed`,err);}
 });
});
Hooks.once('ready',async()=>{
 if(game.system.id!=='dnd5e'){ui.notifications.warn('Alchemy Workbench requires the dnd5e system.');return;}
 try{
  const base=`modules/${MID}/data/`;
  defaultRecipes=await fetch(`${base}recipes.json`).then(x=>{if(!x.ok)throw Error('Default recipes missing');return x.json();});
  const library=game.settings.get(MID,'recipeLibrary');
  if(library?.initialized){
    const migrated=migrateRecipeTools(library.recipes);
    recipes.splice(0,recipes.length,...migrated.recipes);
    if(game.user.isGM&&migrated.changed)
      await game.settings.set(MID,'recipeLibrary',{initialized:true,recipes:migrated.recipes});
   }
  else{
   const seeded=seedDefaults(defaultRecipes,setting()?.outputs||{});
   recipes.splice(0,recipes.length,...seeded);
   if(game.user.isGM){
    await game.settings.set(MID,'recipeLibrary',{initialized:true,recipes:seeded});
   }
  }
  herbs=game.settings.get(MID,'herbCatalog')||[];
  game.socket.on(SOCKET,onSocket);
  ui.notifications.info('Alchemy Workbench ready. Open from any owned character sheet, or via the module API.',{permanent:false});
 }catch(err){notifyError(err);}
});
