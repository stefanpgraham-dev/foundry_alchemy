import {KEYS, TIERS, COLOURS, DC, HOURS,recipeTier,percentageYield,chanceSucceeds,classifyHerbs,assertQty} from './engine.mjs';
import {MID,getQty,normal,setting,findMatchedInventory,findHerbs,planBrew,planExtract,planDowngrade,applyInventory,changeOutputs,template} from './inventory.mjs';

const DIALOG=()=>foundry.applications.api.DialogV2;
const esc=v=>foundry.utils.escapeHTML(String(v??''));
const slug=s=>String(s).replace(/_/g,' ');
const actors=()=>game.actors.contents.filter(a=>a.testUserPermission(game.user,'OWNER'));
const blankMappings=()=>({reagents:{},herbs:{},outputs:{}});
let recipes=[],herbs=[];
const locks=new Set(),waiting=new Map();
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
async function hub(){
 if(!recipes.length){ui.notifications.warn('Alchemy data are not ready.');return;}
 try{
  const actor=await selectActor();if(!actor)return;
  const modes=[{id:'brew',label:'Brew Potions',desc:'44 potion, poison and alchemical recipes'},{id:'extract',label:'Prepare Reagents',desc:'Turn one herb into one reagent'},{id:'refine',label:'Refine Reagents',desc:'Downgrade to three of the next tier'},{id:'audit',label:'Inspect Inventory',desc:'Show recognised reagents and herbs'}];
  if(game.user.isGM)modes.push({id:'setup',label:'GM Item Mapping',desc:'Map World Items, herbs, potion outputs and pending batches'});
  const content=`<div class="awb"><p><strong>${esc(actor.name)}</strong></p>${listHtml(modes.map((x,i)=>`<label class="awb-mode"><input type="radio" name="mode" value="${x.id}" ${i===0?'checked':''}><span><strong>${esc(x.label)}</strong><small>${esc(x.desc)}</small></span></label>`))}</div>`;
  const choice=await wait('Alchemy Workbench',content,[button('open','Open',(e,b)=>b.form.elements.mode.value,true)]);
  if(!choice)return;
  if(choice==='brew')await brewDialog(actor);
  if(choice==='extract')await extractDialog(actor);
  if(choice==='refine')await refineDialog(actor);
  if(choice==='audit')await auditActor(actor);
  if(choice==='setup'&&game.user.isGM)await setupHub();
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
 const map=setting();const list=recipes.map(r=>({value:r.id,label:`${r.name} — ${recipeTier(r)} (DC ${DC[recipeTier(r)]})`}));
 const chosen=await wait('Alchemy — Select Recipe',`<div class="awb">${field('Recipe (all 44 available)',sel('recipe',list))}${field('Batch size',qtyInput(1,100))}${note('One brewing check for the full batch; brewing time does not increase with batch size.')}</div>`,[button('next','Choose Reagents',(e,b)=>({recipeId:b.form.elements.recipe.value,batch:Number(b.form.elements.quantity.value)}),true)]);
 if(!chosen)return;
 const recipe=recipeBy(chosen.recipeId),batch=assertQty(chosen.batch);
 if(!recipe)throw new Error('Unknown recipe.');
 const reagents=findMatchedInventory(actor,map);
 const cost=Object.entries(recipe.cost).map(([k,v])=>`${batch*v} ${slug(k)}`).join(' · ');
 let plan;
 try{plan=planBrew(actor,recipe,batch,map,null,'highest');}catch(err){throw new Error(`${err.message} Required: ${cost}`);}
 const content=`<div class="awb"><p><strong>${esc(recipe.name)}</strong> × ${batch} · DC ${DC[recipeTier(recipe)]} · ${HOURS[recipeTier(recipe)]} hours</p><p><strong>Recipe cost:</strong> ${esc(cost)}</p>
 <details><summary>Eligible reagent stacks (uncheck to exclude)</summary>${listHtml(reagents.map(x=>`<label class="awb-check"><input type="checkbox" name="ingredient" value="${esc(x.id)}" checked>${esc(x.item.name)} × ${x.quantity} — ${esc(slug(x.key))}</label>`))}</details>
 <p><strong>Default allocation:</strong> ${esc(plan.consume.map(x=>`${actor.items.get(x.id)?.name} × ${x.quantity}`).join(', '))||'None'}</p>
 <p><strong>Default returned change:</strong> ${esc(fmt(changeOutputs(plan)))}</p>
 ${field('Return change as',sel('change',[{value:'highest',label:'Highest possible tier'},{value:'common',label:'Common tier whenever possible'}]))}
 ${field('If both failure follow-up dice pass',sel('doublePass',[{value:'extra',label:'Full yield after 50% extra brewing time (GM completes later)'},{value:'immediate',label:'Immediate partial yield, 1d8 × 10%'}]))}
 ${note('Confirm that the GM has allowed the required brewing time to pass. Ingredient quantities and mappings are revalidated before rolling. All dice appear in chat and Dice So Nice.')}</div>`;
 const response=await wait('Alchemy — Brewing Ingredients',content,[button('brew','Brew',(e,b)=>({selectedIds:[...b.form.querySelectorAll('input[name="ingredient"]:checked')].map(x=>x.value),change:b.form.elements.change.value,doublePass:b.form.elements.doublePass.value}),true)]);
 if(!response)return;
 // Recompute preview after player filters sources; no inventory change here.
 const selectedPlan=planBrew(actor,recipe,batch,map,response.selectedIds,response.change);
 const confirm=await DIALOG().confirm({window:{title:'Confirm Brewing'},content:`<div class="awb"><p>${esc(recipe.name)} × ${batch}</p><p>Consume: ${esc(selectedPlan.consume.map(x=>`${actor.items.get(x.id)?.name} × ${x.quantity}`).join(', '))}</p><p>Return change: ${esc(fmt(changeOutputs(selectedPlan)))}</p><p>Time: ${HOURS[recipeTier(recipe)]} hours. Reagents may be lost on failure.</p></div>`,yes:{label:'Roll & Consume'},no:{label:'Cancel'},rejectClose:false});
 if(confirm)await submitAction({mode:'brew',actorId:actor.id,recipeId:recipe.id,batch,selectedIds:response.selectedIds,change:response.change,doublePass:response.doublePass});
}

const uuidValid=async value=>{try{return Boolean(value && (await template(value)));}catch{return false;}};
function suggest(name){
 const n=normal(name);
 const exact=game.items.contents.find(i=>normal(i.name)===n);
 if(exact)return exact.uuid;
 const extra=game.items.contents.find(i=>normal(i.name)===n.replace('potionof','')||normal(i.name)===n+'reagent'||normal(i.name)===n.replace('potionof','potion'));
 return extra?.uuid||'';
}
async function setupHub(){
 if(!game.user.isGM)throw new Error('GM access required.');
 const maps=setting(), audit=classifyHerbs(herbs);
 const modes=[['reagents',`Reagents (${Object.values(maps.reagents).filter(Boolean).length}/9 mapped)`],['herbs',`Herbs (${Object.values(maps.herbs).filter(Boolean).length}/43 mapped)`],['outputs',`Potion outputs (${Object.values(maps.outputs).filter(Boolean).length}/44 mapped)`],['pending','Pending extra-time brews'],['audit','View herb data discrepancies']];
 const result=await wait('Alchemy — GM Configuration',`<div class="awb">${field('Configuration',sel('tab',modes.map(([value,label])=>({value,label}))))}${note('Mappings are stored per world. Map each category to the actual World Item UUID; compendium Item UUIDs are also supported.')}</div>`,[button('next','Open',(e,b)=>b.form.elements.tab.value,true)]);
 if(!result)return;
 if(['reagents','herbs','outputs'].includes(result))await mappingScreen(result);
 if(result==='pending')await pendingDialog();
 if(result==='audit')await wait('Alchemy — Herb Audit',`<div class="awb">${listHtml(audit.map(h=>`<p><strong>${esc(h.name)}</strong> — herb rarity ${esc(h.rarity)}; reagent properties ${esc(h.reagents.join(', '))}</p>`))}</div>`,[button('ok','Close',()=>true,true)]);
}
async function mappingScreen(kind){
 if(!game.user.isGM)throw new Error('GM access required.');
 const m=structuredClone(setting()||blankMappings());
 const source=kind==='reagents'?KEYS.map(k=>({id:k,name:slug(k)})):kind==='herbs'?herbs:recipes;
 const options=game.items.contents.slice().sort((a,b)=>a.name.localeCompare(b.name));
 const datalist=`<datalist id="awb-source-items">${options.map(x=>`<option value="${esc(x.uuid)}" label="${esc(x.name)}"></option>`).join('')}</datalist>`;
 const cells=source.map(x=>{
  const value=m[kind]?.[x.id]||suggest(x.name);
  return `<label class="awb-mapping"><strong>${esc(x.name)}</strong><input name="map-${esc(x.id)}" value="${esc(value)}" list="awb-source-items" autocomplete="off" placeholder="Item UUID or blank"></label>`;
 });
 const content=`<div class="awb"><p>Choose World Items from the suggestions, or paste Item/Compendium UUIDs. Empty entries are allowed, but required reagents must be mapped for crafting.</p>${datalist}<div class="awb-mapping-scroll">${cells.join('')}</div></div>`;
 const result=await wait(`Alchemy — Map ${kind}`,content,[button('save','Save Mappings',(e,b)=>Object.fromEntries(source.map(x=>[x.id,String(b.form.elements[`map-${x.id}`]?.value||'').trim()])),true)]);
 if(!result)return;
 let invalid=[];
 for(const [id,uuid] of Object.entries(result))if(uuid&&!await uuidValid(uuid))invalid.push(`${id}: ${uuid}`);
 if(invalid.length)throw new Error(`Invalid item UUID(s): ${invalid.slice(0,4).join('; ')}${invalid.length>4?'…':''}`);
 m[kind]=Object.fromEntries(Object.entries(result).filter(([,v])=>v));
 await game.settings.set(MID,'mappings',m);
 ui.notifications.info(`Alchemy: ${kind} mappings saved (${Object.keys(m[kind]).length}).`);
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
 if(gm.id===game.user.id){await executeRequest(message,game.user.id);return;}
 const answer=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{waiting.delete(message.nonce);reject(new Error('The GM did not respond within 30 seconds. Check connection and retry.'));},30000);
  waiting.set(message.nonce,{resolve,reject,timeout});
 });
 game.socket.emit(SOCKET,message);
 try{const result=await answer;ui.notifications.info(result);}catch(err){notifyError(err);}
}
async function roll(formula,flavor,actor){
 const r=await new Roll(formula).evaluate();
 await r.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:`Alchemy · ${flavor}`});
 return r;
}
function toolModifier(actor){
 const t=actor.system.tools?.alchemist||{};
 const ability=Number(actor.system.abilities?.int?.mod)||0;
 const prof=Number(actor.system.attributes?.prof)||0;
 const value=Number(t.value??t.profMultiplier??0);
 // Use system-prepared total if present (to retain tool-related bonuses).
 if(Number.isFinite(Number(t.total)) && t.total!==undefined && t.total!==null)return Number(t.total);
 const multiplier=Number.isFinite(value)?value:0;
 const staticBonus=Number(t.bonus??0);
 return ability+Math.floor(prof*multiplier)+(Number.isFinite(staticBonus)?staticBonus:0);
}
function firstDie(rollObj){
 const term=rollObj.dice?.find(d=>Number(d.faces)===20);
 return Number(term?.results?.[0]?.result||0);
}
async function fractionalRoll(yieldData,actor,label){
 if(!yieldData.fractional)return yieldData.guaranteed;
 const r=await roll('1d100',`${label} · ${yieldData.fractional}% chance of one more potion`,actor);
 return yieldData.guaranteed+Number(chanceSucceeds(r.total,yieldData.fractional));
}
function checkFormula(mod){return `1d20 ${mod<0?`- ${-mod}`:`+ ${mod}`}`;}
async function brewOutcome(actor,recipe,batch,doublePass){
 const tier=recipeTier(recipe),dc=DC[tier],mod=toolModifier(actor);
 const initial=await roll(checkFormula(mod),`Intelligence (Alchemist’s Supplies) · DC ${dc}`,actor);
 const natural=firstDie(initial);
 if(natural===20){
  const a=await roll(checkFormula(mod),'Critical bonus — first d20',actor);
  const b=await roll(checkFormula(mod),'Critical bonus — second d20',actor);
  const passes=Number(a.total>=dc)+Number(b.total>=dc);
  let bonusPct=0;
  if(passes){
    // A virtual d40 is (1d10-1)*4+1d4; both physical dice are animated by Dice So Nice.
    const formula=passes===1?'(1d10-1)*4 + 1d4':'(1d10-1)*4 + 1d4 + (1d10-1)*4 + 1d4';
    const r=await roll(formula,`${passes} bonus d40 (virtual d10+d4 each)`,actor);
    bonusPct=r.total*10;
  }
  const bonus=await fractionalRoll(percentageYield(batch,bonusPct),actor,'Critical bonus');
  return {status:'critical',produced:batch+bonus,bonus,bonusPct,passes};
 }
 if(initial.total>=dc)return {status:'success',produced:batch};
 const a=await roll(checkFormula(mod),'Failure follow-up — first d20',actor);
 const b=await roll(checkFormula(mod),'Failure follow-up — second d20',actor);
 const passes=Number(a.total>=dc)+Number(b.total>=dc);
 if(passes===0)return {status:'lost',produced:0,passes};
 if(passes===2&&doublePass==='extra')return {status:'pending',produced:0,passes,extraHours:HOURS[tier]/2};
 const r=await roll('1d8','Partial yield — 1d8 × 10%',actor);
 const pct=r.total*10;
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
  respond(p,senderId,true,result);
 }catch(err){console.error(`${MID} request error`,err);respond(p,senderId,false,err.message||'Crafting failed.');}
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
  const job=pending[index],recipe=recipeBy(job.recipeId);
  if(!recipe)throw new Error('Recipe no longer exists.');
  // Mark non-redeemable before the reward; a failed save must never enable duplicate completion.
  await game.settings.set(MID,'pending',pending.map(x=>x.id===job.id?{...x,status:'completing'}:x));
  try {
   await applyInventory(actor,[],[{kind:'potion',id:recipe.id,name:recipe.name,quantity:job.batch}],map);
  }catch(err){
   // Reward transaction failed and rolled back, so allow a later retry.
   try{const current=game.settings.get(MID,'pending');await game.settings.set(MID,'pending',current.map(x=>x.id===job.id?{...x,status:'ready'}:x));}catch(e){console.error('Pending brew status restore failed',e);}
   throw err;
  }
  // If removal fails, record stays non-redeemable; manual reconciliation is safer than double-awarding.
  await game.settings.set(MID,'pending',game.settings.get(MID,'pending').filter(x=>x.id!==job.id));
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><strong>Alchemy completed:</strong> ${esc(recipe.name)} × ${job.batch}. Additional ${job.extraHours} hours elapsed.</p>`});
  return `${recipe.name} × ${job.batch} awarded.`;
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
 const recipe=recipeBy(p.recipeId),batch=assertQty(p.batch);
 if(!recipe)throw new Error('Unrecognised recipe.');
 if(!['immediate','extra'].includes(p.doublePass)||!['highest','common'].includes(p.change))throw new Error('Invalid brewing options.');
 if(!Array.isArray(p.selectedIds)||p.selectedIds.length>200||p.selectedIds.some(x=>typeof x!=='string'))throw new Error('Invalid ingredient selection.');
 const plan=planBrew(actor,recipe,batch,map,p.selectedIds,p.change);
 // Verify all change output templates before taking any dice or inventory changes.
 for(const key of Object.keys(plan.return))if(!await template(map.reagents?.[key]))throw new Error(`Reagent change item is unmapped: ${key}`);
 const result=await brewOutcome(actor,recipe,batch,p.doublePass);
 const outputs=changeOutputs(plan);
 if(result.produced)outputs.push({kind:'potion',id:recipe.id,name:recipe.name,quantity:result.produced});
 if(result.status==='pending'){
  const jobs=game.settings.get(MID,'pending');
  const job={id:nonce(),actorId:actor.id,actorName:actor.name,recipeId:recipe.id,recipeName:recipe.name,batch,extraHours:result.extraHours,createdAt:Date.now(),status:'reserving'};
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
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<article class="awb-chat"><h3>${esc(recipe.name)} × ${batch}</h3><p><strong>Result:</strong> ${esc(result.status)} · Produced ${result.produced} · ${esc(extra)}</p><p><strong>Change returned:</strong> ${esc(fmt(changeOutputs(plan)))}</p>${result.bonusPct!==undefined?`<p>Critical bonus: +${result.bonusPct}%, ${result.bonus} additional potions</p>`:''}${result.percent!==undefined?`<p>Partial yield: ${result.percent}%</p>`:''}</article>`});
 return `${recipe.name}: ${result.status}; ${result.produced} potions made.${extra?' '+extra:''}`;
}
function onSocket(payload,senderId){
 if(!payload || typeof payload!=='object')return;
 if(payload.type==='request'){
  // Foundry appends the authenticated sender's user ID to module socket callbacks.
  if(typeof senderId!=='string'||!game.users.get(senderId))return;
  void executeRequest(payload,senderId);
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
 game.settings.register(MID,'mappings',{name:'Alchemy item mappings',scope:'world',config:false,type:Object,default:blankMappings()});
 game.settings.register(MID,'pending',{name:'Pending alchemy brews',scope:'world',config:false,type:Array,default:[]});
 const api={open:hub,setup:setupHub,getRecipes:()=>structuredClone(recipes),getHerbs:()=>structuredClone(herbs)};
 game.modules.get(MID).api=api;
 Hooks.on('renderActorSheetV2',addSheetButton);
 Hooks.on('renderActorSheet',addSheetButton);
});
Hooks.once('ready',async()=>{
 if(game.system.id!=='dnd5e'){ui.notifications.warn('Alchemy Workbench requires the dnd5e system.');return;}
 try{
  const base=`modules/${MID}/data/`;
  const [r,h]=await Promise.all([fetch(`${base}recipes.json`).then(x=>{if(!x.ok)throw Error('Recipes missing');return x.json();}),fetch(`${base}herbs.json`).then(x=>{if(!x.ok)throw Error('Herbs missing');return x.json();})]);
  recipes=r;herbs=h;
  game.socket.on(SOCKET,onSocket);
  ui.notifications.info('Alchemy Workbench ready. Open from any owned character sheet, or via the module API.',{permanent:false});
 }catch(err){notifyError(err);}
});
