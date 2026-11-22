import {KEYS,DC,HOURS,recipeTier} from './engine.mjs';
import {reagentKeyFromName} from './directories.mjs';
import {recipeDC,recipeHours,recipeTest,validateRecipe,parseRecipeImport,exportRecipeLibrary,recipeComparison,mergeRecipeLibraries,importMissingDefaults,restoreDefault,recipeWarnings} from './recipes.mjs';
import {findMatchedInventory} from './inventory.mjs';
const esc=v=>foundry.utils.escapeHTML(String(v??''));
const label=s=>String(s).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const btn=(action,content,props='')=>'<button type="button" data-action="'+action+'" '+props+'>'+content+'</button>';
const makeId=()=> 'custom-'+foundry.utils.randomID(14);
function initialise(app){
 app.recipeFilter??='all';app.recipeSort??='name';app.recipeSearch??='';app.recipeTestBatch??=1;
 if(!app.recipeDraft && app.services.recipes.length){
  const r=app.services.recipes.find(x=>x.id===app.recipeId)||app.services.recipes[0];
  app.recipeId=r.id;app.recipeDraft=structuredClone(r);app.recipeDirty=false;
 }
}
function outputImage(app,r){return r.outputUuid?app._templateImage(r.outputUuid):'icons/consumables/potions/potion-bottle-corked-red.webp';}
function recipeList(app){
 const issues=new Set(recipeWarnings(app.services.recipes).map(x=>x.id));
 const list=app.services.recipes.filter(r=>{
  if(!(r.name+' '+Object.keys(r.cost).join(' ')).toLowerCase().includes(app.recipeSearch.toLowerCase()))return false;
  const f=app.recipeFilter;
  return f==='all'||f==='enabled'&&r.enabled||f==='disabled'&&!r.enabled||
    f==='default'&&r.source==='default'||f==='custom'&&r.source==='custom'||f==='issues'&&issues.has(r.id);
 });
 list.sort((a,b)=>app.recipeSort==='tier'?['common','rare','exotic'].indexOf(recipeTier(a))-['common','rare','exotic'].indexOf(recipeTier(b))||a.name.localeCompare(b.name):
  app.recipeSort==='reverse'?b.name.localeCompare(a.name):a.name.localeCompare(b.name));
 return {list,issueCount:issues.size};
}
function editor(app){
 const r=app.recipeDraft;
 if(!r)return '<p class="awb-empty">Select a recipe or drop a potion Item to create one.</p>';
 const tier=recipeTier(r),maps=app.services.mappings();
 const ingredientRows=Object.entries(r.cost).map(([key,qty])=>
  '<div class="awb-recipe-ingredient"><img class="awb-art" src="'+esc(app._templateImage(maps.reagents?.[key]))+'" alt="">'+
  '<span><strong>'+esc(label(key))+'</strong><small>Per potion</small></span>'+
  '<input data-recipe-qty="'+esc(key)+'" aria-label="'+esc(label(key))+' quantity" type="number" min="1" max="1000" value="'+qty+'">'+
  btn('gm-recipe-remove','<i class="fas fa-trash"></i>','data-key="'+esc(key)+'" title="Remove ingredient"')+'</div>').join('');
 const remaining=KEYS.filter(key=>!Object.hasOwn(r.cost,key));
 const palette=remaining.length?'<div class="awb-recipe-palette"><select data-recipe-add-select>'+remaining.map(key=>
  '<option value="'+key+'">'+label(key)+(maps.reagents?.[key]?'':' (unmapped)')+'</option>').join('')+'</select>'+
  btn('gm-recipe-add','Add reagent')+'</div>':'';
 const test=app.recipeTestResult;
 const testPanel=test?'<div class="awb-recipe-test-result"><p><strong>'+test.batch+' potion dry run:</strong> DC '+test.dc+', '+test.hours+
  ' hours; '+test.maximumCraftable+' craftable from selected character inventory.</p>'+
  '<p>Required: '+esc(Object.entries(test.requirements).map(([k,v])=>label(k)+' ×'+v).join(', '))+'</p>'+
  (test.craftable?'<p>Consume: '+esc(test.plan.consume.map(x=>app.actor.items.get(x.id)?.name+' ×'+x.quantity).join(', '))+
  '; change: '+esc(Object.entries(test.plan.return).map(([k,v])=>label(k)+' ×'+v).join(', ')||'none')+'</p>':
  '<p class="awb-alert awb-alert-warn">'+esc(test.reason)+'</p>')+'</div>':'';
 return '<div class="awb-recipe-editor"><h2>'+esc(r.name)+'</h2>'+
  '<p class="awb-muted">'+label(tier)+' · DC '+recipeDC(r)+' · '+recipeHours(r)+' hours</p>'+
  '<label class="awb-field"><span>Recipe name</span><input data-recipe-name maxlength="120" value="'+esc(r.name)+'"></label>'+
  '<h3>Potion output</h3><div class="awb-recipe-drop awb-recipe-output" data-recipe-drop="output">'+
  '<img class="awb-art awb-featured" src="'+esc(outputImage(app,r))+'" alt=""><div><strong>'+
  (r.outputUuid?esc(r.outputName||'Linked potion Item')+' — drop to change':'Drop potion Item here')+'</strong><small>'+esc(r.outputUuid||'Preserve Foundry activities and effects')+'</small></div></div>'+
  '<h3>Required reagents per potion</h3><div class="awb-recipe-ingredient-list">'+ingredientRows+'</div>'+
  '<div class="awb-recipe-drop" data-recipe-drop="reagent"><i class="fas fa-flask"></i> Drop reagent Item here</div>'+palette+
  '<div class="awb-recipe-overrides"><label><input data-recipe-enabled type="checkbox" '+(r.enabled?'checked':'')+'> Available to players</label>'+
  '<label><input data-recipe-override-dc type="checkbox" '+(r.dcOverride!==null?'checked':'')+'> Custom DC</label>'+
  '<input data-recipe-dc type="number" min="1" max="40" step="1" '+(r.dcOverride===null?'disabled':'')+' value="'+(r.dcOverride??DC[tier])+'">'+
  '<label><input data-recipe-override-hours type="checkbox" '+(r.hoursOverride!==null?'checked':'')+'> Custom hours</label>'+
  '<input data-recipe-hours type="number" min=".25" max="72" step=".25" '+(r.hoursOverride===null?'disabled':'')+' value="'+(r.hoursOverride??HOURS[tier])+'"></div>'+
  '<div class="awb-recipe-toolbar">'+btn('gm-recipe-save','Save Recipe','class="awb-primary"')+
  (r.source==='default'?btn('gm-recipe-restore','Restore Default Formula'):'')+
  (app.services.recipes.some(x=>x.id===r.id)?btn('gm-recipe-duplicate','Duplicate')+btn('gm-recipe-delete','Delete','class="awb-danger"'):'')+'</div>'+
  '<details class="awb-recipe-dry-run"><summary>Test recipe without rolling or changing inventory</summary>'+
  '<label>Batch size <input data-recipe-test-batch type="number" min="1" max="100" value="'+app.recipeTestBatch+'"></label>'+
  btn('gm-recipe-test','Test current inventory')+testPanel+'</details>'+
  (app.recipeDirty?'<p class="awb-muted">Unsaved changes</p>':'')+'</div>';
}
export function recipeEditorView(app){
 initialise(app);
 const {list,issueCount}=recipeList(app);
 return '<div class="awb-recipe-workspace"><section class="awb-recipe-library">'+
  '<div class="awb-recipe-library-head"><h3>World recipes ('+app.services.recipes.length+')</h3>'+
  btn('gm-recipe-new','<i class="fas fa-plus"></i> New Recipe','class="awb-primary"')+'</div>'+
  '<div class="awb-library-toolbar"><label class="awb-search-wrap"><i class="fas fa-search"></i>'+
  '<input data-recipe-search placeholder="Search recipes…" value="'+esc(app.recipeSearch)+'"></label>'+
  '<select data-recipe-filter>'+['all','enabled','disabled','default','custom','issues'].map(k=>
  '<option value="'+k+'" '+(k===app.recipeFilter?'selected':'')+'>'+label(k)+'</option>').join('')+'</select>'+
  '<select data-recipe-sort>'+[['name','Name A–Z'],['reverse','Name Z–A'],['tier','Tier']].map(([k,v])=>
  '<option value="'+k+'" '+(k===app.recipeSort?'selected':'')+'>'+v+'</option>').join('')+'</select></div>'+
  '<div class="awb-recipe-drop awb-recipe-create" data-recipe-drop="new"><i class="fas fa-plus-circle"></i> Drop potion Item to add a recipe</div>'+
  '<div class="awb-recipe-library-list">'+list.map(r=>btn('gm-recipe-select',
  '<img class="awb-art" src="'+esc(outputImage(app,r))+'" alt=""><span><strong>'+esc(r.name)+'</strong><small>'+
  label(recipeTier(r))+' · DC '+recipeDC(r)+' · '+(r.enabled?'Enabled':'Disabled')+' · '+r.source+'</small></span>',
  'data-id="'+esc(r.id)+'" class="awb-recipe-library-card '+(app.recipeId===r.id?'selected':'')+'"')).join('')+'</div>'+
  '<div class="awb-recipe-library-tools">'+btn('gm-recipe-import-missing','Import Missing Defaults')+
  btn('gm-recipe-export','Export JSON')+
  '<label class="awb-recipe-import">Import JSON <input type="file" data-recipe-import accept=".json,application/json"></label>'+
  '<small>'+issueCount+' output warnings</small></div></section>'+
  '<section class="awb-panel awb-recipe-editor-panel">'+editor(app)+'</section></div>';
}

function syncDraft(app){
 if(!app.recipeDraft)return;
 const r=app.recipeDraft,root=app.element;
 r.name=root.querySelector('[data-recipe-name]')?.value??r.name;
 for(const input of root.querySelectorAll('[data-recipe-qty]'))r.cost[input.dataset.recipeQty]=Number(input.value);
 r.enabled=root.querySelector('[data-recipe-enabled]')?.checked??r.enabled;
 r.dcOverride=root.querySelector('[data-recipe-override-dc]')?.checked?Number(root.querySelector('[data-recipe-dc]')?.value):null;
 r.hoursOverride=root.querySelector('[data-recipe-override-hours]')?.checked?Number(root.querySelector('[data-recipe-hours]')?.value):null;
 app.recipeTestBatch=Number(root.querySelector('[data-recipe-test-batch]')?.value)||1;
}
async function discard(app){
 if(!app.recipeDirty)return true;
 return foundry.applications.api.DialogV2.confirm({
  window:{title:'Unsaved recipe changes'},content:'Discard changes to this recipe?',
  yes:{label:'Discard'},no:{label:'Keep editing'},rejectClose:false
 });
}
async function saveDraft(app){
 syncDraft(app);
 const next=validateRecipe(app.recipeDraft,{allowMissingOutput:app.recipeDraft.source==='default'});
 if(next.outputUuid && (await fromUuid(next.outputUuid))?.documentName!=='Item')throw Error('Potion output Item no longer exists.');
 const list=structuredClone(app.services.recipes),idx=list.findIndex(r=>r.id===next.id);
 if(idx>=0)list[idx]=next;else list.push(next);
 await app.services.saveRecipes(list);
 app.recipeDraft=structuredClone(next);app.recipeId=next.id;app.recipeDirty=false;app.recipeTestResult=null;
 app.notice={text:next.name+' saved for this world.',kind:'good'};
}
export function recipeEditorInput(app,event){
 const el=event.target;
 if(el.matches?.('[data-recipe-search]')){app.recipeSearch=el.value;void app.render();return true;}
 if(el.matches?.('[data-recipe-filter]')){app.recipeFilter=el.value;void app.render();return true;}
 if(el.matches?.('[data-recipe-sort]')){app.recipeSort=el.value;void app.render();return true;}
 if(el.matches?.('[data-recipe-test-batch]')){app.recipeTestBatch=Number(el.value);return true;}
 if(el.matches?.('[data-recipe-name],[data-recipe-qty],[data-recipe-dc],[data-recipe-hours],[data-recipe-enabled],[data-recipe-override-dc],[data-recipe-override-hours]')){
  syncDraft(app);app.recipeDirty=true;app.recipeTestResult=null;
  if(el.matches('[data-recipe-override-dc],[data-recipe-override-hours]'))void app.render();
  return true;
 }
 return false;
}
export async function recipeEditorAction(app,action,target){
 if(!game.user?.isGM)throw Error('GM privileges required.');
 initialise(app);
 if(action==='gm-recipe-select'){
  if(!await discard(app))return true;
  const r=app.services.recipes.find(x=>x.id===target.dataset.id);
  if(r){app.recipeId=r.id;app.recipeDraft=structuredClone(r);app.recipeDirty=false;app.recipeTestResult=null;}
  return true;
 }
 if(action==='gm-recipe-new'){
  if(!await discard(app))return true;
  app.recipeDraft={id:makeId(),name:'New Potion',cost:{},outputUuid:'',outputName:'',source:'custom',enabled:true,dcOverride:null,hoursOverride:null};
  app.recipeId=app.recipeDraft.id;app.recipeDirty=true;app.recipeTestResult=null;return true;
 }
 if(action==='gm-recipe-add'){
  syncDraft(app);
  const key=app.element.querySelector('[data-recipe-add-select]')?.value;
  if(!KEYS.includes(key))throw Error('Select a valid reagent.');
  app.recipeDraft.cost[key]=1;app.recipeDirty=true;return true;
 }
 if(action==='gm-recipe-remove'){
  syncDraft(app);delete app.recipeDraft.cost[target.dataset.key];app.recipeDirty=true;return true;
 }
 if(action==='gm-recipe-save'){await saveDraft(app);return true;}
 if(action==='gm-recipe-duplicate'){
  if(!await discard(app))return true;
  const r=app.services.recipes.find(x=>x.id===app.recipeId);
  if(!r)throw Error('Save this recipe before duplicating.');
  app.recipeDraft={...structuredClone(r),id:makeId(),name:r.name+' (Variant)',source:'custom'};
  app.recipeId=app.recipeDraft.id;app.recipeDirty=true;app.recipeTestResult=null;return true;
 }
 if(action==='gm-recipe-delete'){
  const r=app.services.recipes.find(x=>x.id===app.recipeId);
  if(!r)throw Error('Recipe must be saved before deletion.');
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Delete recipe'},
   content:'Delete '+esc(r.name)+' from this world? Existing pending brews retain their snapshots.',
   yes:{label:'Delete'},no:{label:'Cancel'},rejectClose:false});
  if(yes){
   await app.services.saveRecipes(app.services.recipes.filter(x=>x.id!==r.id));
   app.recipeId=null;app.recipeDraft=null;app.recipeDirty=false;initialise(app);
  }
  return true;
 }
 if(action==='gm-recipe-restore'){
  const r=app.recipeDraft;
  if(r.source!=='default')throw Error('Only bundled default formulas can be restored.');
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Restore default formula'},
   content:'Restore original ingredients and DC/time for '+esc(r.name)+'? Your output Item stays linked.',
   yes:{label:'Restore'},no:{label:'Cancel'},rejectClose:false});
  if(yes){
   const restored=restoreDefault(r,app.services.defaultRecipes);
   await app.services.saveRecipes(app.services.recipes.map(x=>x.id===restored.id?restored:x));
   app.recipeDraft=structuredClone(restored);app.recipeDirty=false;
  }
  return true;
 }
 if(action==='gm-recipe-import-missing'){
  const merged=importMissingDefaults(app.services.recipes,app.services.defaultRecipes);
  if(merged.length===app.services.recipes.length){app.notice={text:'All default recipes are already present.',kind:'good'};return true;}
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Import missing defaults'},
   content:'Add '+(merged.length-app.services.recipes.length)+' missing recipes without changing existing formulas?',
   yes:{label:'Import'},no:{label:'Cancel'},rejectClose:false});
  if(yes)await app.services.saveRecipes(merged);
  return true;
 }
 if(action==='gm-recipe-export'){
  const save=foundry.utils?.saveDataToFile??(typeof saveDataToFile==='function'?saveDataToFile:null);
  if(!save)throw Error('Foundry file-export helper is unavailable.');
  save(exportRecipeLibrary(app.services.recipes),'application/json','alchemy-recipes.json');return true;
 }
 if(action==='gm-recipe-test'){
  syncDraft(app);
  const clean=validateRecipe(app.recipeDraft,{allowMissingOutput:true});
  app.recipeTestResult=recipeTest(clean,app.recipeTestBatch,findMatchedInventory(app.actor,app.services.mappings()));
  return true;
 }
 return false;
}
export async function recipeEditorImport(app,file){
 if(!game.user?.isGM)throw Error('GM access required.');
 if(!file)return;
 if(file.size>2000000)throw Error('Recipe import exceeds 2 MB.');
 const imported=parseRecipeImport(await file.text()),current=app.services.recipes;
 let missing=0;
 for(const recipe of imported){
  if(!recipe.outputUuid)continue;
  let source=null;
  try{source=await fromUuid(recipe.outputUuid);}catch{/* Other-world UUIDs may be unresolvable. */}
  const title=recipe.outputName||recipe.name;
  if(source?.documentName==='Item'&&source.name.toLowerCase()===title.toLowerCase())continue;
  const matches=game.items.contents.filter(item=>item.name.toLowerCase()===title.toLowerCase());
  if(matches.length===1)recipe.outputUuid=matches[0].uuid;
  else{
   recipe.outputUuid='';recipe.enabled=false;missing++;
  }
 }
 const comparison=recipeComparison(current,imported);
 const strategy=await foundry.applications.api.DialogV2.wait({window:{title:'Import world recipes'},
  content:'<p>'+imported.length+' recipes: '+comparison.added.length+' new, '+comparison.changed.length+
   ' changed, '+comparison.removed.length+' absent from import. '+missing+' outputs require remapping and will be disabled.</p><p>Choose an import strategy. Pending brews retain snapshots.</p>',
  buttons:[
   {action:'merge',label:'Add Missing',default:true,callback:()=> 'merge'},
   {action:'overwrite',label:'Update & Add',callback:()=> 'overwrite'},
   {action:'replace',label:'Replace All',callback:()=> 'replace'},
   {action:'cancel',label:'Cancel',callback:()=>null}
  ],rejectClose:false
 });
 if(!strategy)return;
 if(strategy==='replace'){
  const yes=await foundry.applications.api.DialogV2.confirm({window:{title:'Replace world recipes'},
   content:'Replace all recipes? Export your current library first if you need a backup.',
   yes:{label:'Replace'},no:{label:'Cancel'},rejectClose:false});
  if(!yes)return;
 }
 const merged=mergeRecipeLibraries(current,imported,{replace:strategy==='replace',overwrite:strategy==='overwrite'});
 await app.services.saveRecipes(merged);
 app.recipeId=null;app.recipeDraft=null;app.recipeDirty=false;app.recipeTestResult=null;initialise(app);
 app.notice={text:'Imported recipe library ('+merged.length+' entries). '+missing+' outputs need a new Item mapping.',kind:missing?'warn':'good'};
}
export async function recipeEditorDrop(app,event){
 const zone=event.target.closest?.('[data-recipe-drop]');
 if(!zone)return false;
 if(!game.user?.isGM)throw Error('GM privileges required.');
 event.preventDefault();
 const raw=event.dataTransfer?.getData('text/plain');
 if(!raw)throw Error('Drop a Foundry Item from the Items directory.');
 const data=JSON.parse(raw);
 const uuid=data.uuid||(data.type==='Item'&&data.id?'Item.'+data.id:'');
 const doc=uuid?await fromUuid(uuid):null;
 if(doc?.documentName!=='Item')throw Error('Drop a World Item or compendium Item.');
 if(zone.dataset.recipeDrop==='new'){
  if(!await discard(app))return true;
  app.recipeDraft={id:makeId(),name:doc.name,cost:{},outputUuid:uuid,outputName:doc.name,source:'custom',
    enabled:true,dcOverride:null,hoursOverride:null};
  app.recipeId=app.recipeDraft.id;app.recipeDirty=true;
 }else if(zone.dataset.recipeDrop==='output'){
  if(!app.recipeDraft)throw Error('Select a recipe first.');
  syncDraft(app);app.recipeDraft.outputUuid=uuid;app.recipeDraft.outputName=doc.name;app.recipeDirty=true;
 }else if(zone.dataset.recipeDrop==='reagent'){
  if(!app.recipeDraft)throw Error('Select a recipe first.');
  syncDraft(app);
  const map=app.services.mappings();
  const match=Object.entries(map.reagents||{}).find(([,source])=>source===uuid);
  const key=match?.[0]||reagentKeyFromName(doc.name);
  if(!KEYS.includes(key))throw Error('Item is not a recognised reagent. Map its classification first.');
  if(map.reagents?.[key]&&map.reagents[key]!==uuid)throw Error('Use the mapped '+label(key)+' Item.');
  app.recipeDraft.cost[key]=(app.recipeDraft.cost[key]||0)+1;app.recipeDirty=true;
 }
 app.recipeTestResult=null;
 return true;
}
