/* GM folder setup and directory-based catalogue (Foundry v14). */
import {itemFolders,folderLabel,itemPacks,packLabel,normalizeDirectoryConfig} from './directories.mjs';
import {KEYS} from './engine.mjs';
import {recipeEditorView,recipeEditorAction} from './recipe-ui.mjs';
import {rulesView,rulesEditorAction} from './rules-ui.mjs';

const esc=value=>foundry.utils.escapeHTML(String(value??''));
const label=value=>String(value||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const image=item=>'<img class="awb-art" src="'+esc(item?.img||'icons/svg/item-bag.svg')+'" alt="">';
const button=(action,text,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+esc(text)+'</button>';
const mappings=(app)=>app.mappingDraft||structuredClone(app.services.mappings());
const config=(app)=>app.directoryDraft||app.services.directories();
const report=(app)=>app.services.directoryReport()||{issues:[]};

function folderName(id){
 const f=itemFolders(game).find(x=>x.id===id);
 return f?folderLabel(f,game):'No World Item folder';
}
function packNames(ids){
 const packs=new Map(itemPacks(game.packs).map(pack=>[pack.collection,pack]));
 if(!ids?.length)return 'No Item compendium packs';
 return ids.map(id=>packs.has(id)?packLabel(packs.get(id))+' ('+id+')':id+' (unavailable)').join(' · ');
}
function hasSources(cfg,kind){return Boolean(cfg[kind+'FolderId']||cfg[kind+'PackIds']?.length);}
function noteList(issues){
 if(!issues?.length)return '<p class="awb-empty">No validation problems reported.</p>';
 return '<div class="awb-folder-issues">'+issues.map((issue)=>{
  const open=issue.itemUuid?'<button type="button" data-action="gm-open-item" data-uuid="'+esc(issue.itemUuid)+'" title="Open Item"><i class="fas fa-up-right-from-square"></i></button>':'';
  return '<div class="awb-folder-issue"><i class="fas fa-'+(issue.severity==='error'?'triangle-exclamation':'circle-info')+'"></i><div><strong>'+esc(issue.name)+'</strong><small>'+esc(issue.problem)+'</small></div>'+open+'</div>';
 }).join('')+'</div>';
}
function catalogueToolbar(app){
 const kind=app.gmKind, filters=kind==='herbs'?['all','issues']:['all','mapped','unmapped','issues'];
 if(!filters.includes(app.gmFilter))app.gmFilter='all';
 return '<div class="awb-library-toolbar">'+
  '<label class="awb-search-wrap"><i class="fas fa-search"></i><input data-search="gm" value="'+esc(app.gmSearch)+'" placeholder="Search '+esc(kind)+'…"></label>'+
  button('gm-filter','Filter: '+label(app.gmFilter))+
  button('gm-sort','Sort: '+({name:'A–Z',reverse:'Z–A',tier:'Tier'}[app.gmSort]||'A–Z'))+
  button('gm-refresh','Refresh from sources')+'</div>';
}
function sorted(rows,app){
 const list=[...rows];
 if(app.gmSort==='reverse')list.sort((a,b)=>b.name.localeCompare(a.name));
 else if(app.gmSort==='tier')list.sort((a,b)=>{
  const rank=name=>{const tier=String(name).match(/common|rare|exotic/i)?.[0]?.toLowerCase()||'';
    return {common:0,rare:1,exotic:2}[tier]??3;};
  return rank(a.rarity||a.name)-rank(b.rarity||b.name)||a.name.localeCompare(b.name);
 });
 else list.sort((a,b)=>a.name.localeCompare(b.name));
 return list.filter(x=>x.name.toLowerCase().includes(app.gmSearch.toLowerCase()));
}

export function directoryView(app){
 if(!game.user.isGM)return '<div class="awb-alert awb-alert-warn">Only a GM can configure the world.</div>';
 const current=normalizeDirectoryConfig(config(app)),r=report(app),map=mappings(app),kind=app.gmKind;
 const issues=r.issues||[];
 const foldersBar='<div class="awb-folder-switches">'+
  '<div><strong>Herb sources</strong><small>World Item folder (optional)</small><span>'+esc(folderName(current.herbFolderId))+'</span>'+
  '<div class="awb-source-buttons">'+button('gm-pick-herbs','Pick herb folder')+
  (current.herbFolderId?button('gm-clear-herbs','Clear folder'):'')+'</div>'+
  '<small>Item compendiums (optional)</small><span>'+esc(packNames(current.herbPackIds))+'</span>'+
  button('gm-pick-herb-packs','Choose herb compendiums')+'</div>'+
  '<div><strong>Reagent sources</strong><small>World Item folder (optional)</small><span>'+esc(folderName(current.reagentFolderId))+'</span>'+
  '<div class="awb-source-buttons">'+button('gm-pick-reagents','Pick reagent folder')+
  (current.reagentFolderId?button('gm-clear-reagents','Clear folder'):'')+'</div>'+
  '<small>Item compendiums (optional)</small><span>'+esc(packNames(current.reagentPackIds))+'</span>'+
  button('gm-pick-reagent-packs','Choose reagent compendiums')+'</div>'+
  '<div><strong>Potion sources</strong><small>World Item folder (optional)</small><span>'+esc(folderName(current.potionFolderId))+'</span>'+
  '<div class="awb-source-buttons">'+button('gm-pick-potions','Pick potion folder')+
  (current.potionFolderId?button('gm-clear-potions','Clear folder'):'')+'</div>'+
  '<small>Item compendiums (optional)</small><span>'+esc(packNames(current.potionPackIds))+'</span>'+
  button('gm-pick-potion-packs','Choose potion compendiums')+'</div>'+
  '</div>';
 const recursive='<label class="awb-directory-recursive"><input type="checkbox" data-directory-recursive '+(current.includeSubfolders?'checked':'')+'> Include subfolders recursively</label>';
 const rarityNames={common:'Common',uncommon:'Uncommon',rare:'Rare',veryrare:'Very Rare',legendary:'Legendary',artifact:'Artifact'};
 const choices=[['common','Common'],['rare','Rare'],['exotic','Exotic'],['unknown','Not categorised']];
 const rarityOptions=Object.entries(rarityNames).map(([type,name])=>
  '<label class="awb-rarity-rule"><span>'+esc(name)+'</span><select data-rarity-map="'+esc(type)+'">'+
   choices.map(([value,title])=>'<option value="'+value+'" '+(current.rarityMap[type]===value?'selected':'')+'>'+title+'</option>').join('')+
   '</select></label>').join('');
 const raritySetup='<details class="awb-rarity-setup"><summary>D&D item rarity → Alchemy tier</summary>'+
  '<p class="awb-muted">Controls how herbs are categorised from system.rarity or system.rarities. Does not change their linked reagent outputs or potion brewing DCs.</p>'+
  '<div class="awb-rarity-grid">'+rarityOptions+'</div></details>';
 const nav='<div class="awb-subtabs">'+[
  ['directories','Directories'],['herbs','Herbs ('+app.services.herbs.length+')'],
  ['reagents','Reagents ('+Object.keys(map.reagents||{}).length+'/9)'],
  ['recipes','Recipes ('+app.services.recipes.length+')'],['rules','Rules']
 ].map(([id,name])=>'<button type="button" data-gm-kind="'+id+'" class="'+(kind===id?'active':'')+'">'+esc(name)+'</button>').join('')+'</div>';
 let body='';
 if(kind==='recipes')body=recipeEditorView(app);
  else if(kind==='rules')body=rulesView(app);
 else if(kind==='directories'){
  body='<p class="awb-muted">Choose World Item folders, Item compendiums, or both. Herbs must link to their reagent Items. Potion sources are optional: matching recipe names are linked automatically; existing explicit output links remain authoritative.</p>'+
   foldersBar+recursive+raritySetup+
   '<div class="awb-folder-summary">'+
   '<span><strong>'+Number(r.validHerbs||0)+'</strong> herbs imported</span>'+
   '<span><strong>'+Number(r.mappedReagents||0)+'/9</strong> reagents mapped</span>'+
   '<span><strong>'+Number(r.mappedPotions||0)+'/'+app.services.recipes.length+'</strong> recipe outputs linked</span>'+
   '<span><strong>'+Number(r.missingPotions||0)+'</strong> unlinked recipes</span>'+ 
   '<span><strong>'+issues.length+'</strong> notices</span></div>'+
   '<div class="awb-bottom"><small>Refresh never deletes Items from any character inventory.</small>'+button('gm-refresh','Refresh from sources','class="awb-primary"')+'</div>'+
   '<h3>Last scan</h3><p class="awb-muted">'+esc(r.scannedAt||'No folder scan has been performed')+
   ' · Added '+(r.added?.length||0)+' · Changed '+(r.changed?.length||0)+' · Removed '+(r.removed?.length||0)+'</p>'+
   '<h3>Validation</h3>'+noteList(issues);
 }else{
  body=catalogueToolbar(app);
  if(kind==='herbs'){
   const herbs=sorted(app.services.herbs,app);
   if(app.gmFilter!=='issues'){
    body+='<div class="awb-mapping-list">'+herbs.map(herb=>{
     const linked=herb.reagents.map(label).join(' / ');
     return '<div class="awb-mapping-card awb-herb-definition" data-mapping-row="'+esc(herb.id)+'">'+
      '<div class="awb-mapping-name"><strong>'+esc(herb.name)+'</strong><small>'+esc(linked)+'</small><small>Alchemy: '+esc(label(herb.rarity))+(herb.sourceRarity?' · D&D: '+esc(herb.sourceRarity):'')+' · '+esc(herb.sourceUuid)+'</small></div>'+
      '<button type="button" data-action="gm-open-item" data-uuid="'+esc(herb.sourceUuid)+'">Open Item</button></div>';
    }).join('')+'</div>';
   }
   if(app.gmFilter==='issues'||issues.some(i=>i.type==='herb'))body+='<h3>Herbs requiring review</h3>'+noteList(issues.filter(i=>i.type==='herb'));
   body+='<p class="awb-muted">Herb entries are generated from selected World Items and compendiums. Different herbs keep their own Item UUIDs even if their Original Source matches. Edit an Item and refresh.</p>';
  }else{
   const data=kind==='reagents'?KEYS.map(id=>({id,name:label(id)})):app.services.recipes;
   const existing=[...game.items.contents].sort((a,b)=>a.name.localeCompare(b.name));
   const opts='<datalist id="awb-world-items">'+existing.map(item=>'<option value="'+esc(item.uuid)+'" label="'+esc(item.name)+'"></option>').join('')+'</datalist>';
   const visible=sorted(data,app).filter(x=>{
    const mapped=Boolean(map[kind]?.[x.id]);
    return !['mapped','unmapped'].includes(app.gmFilter)||(app.gmFilter==='mapped'?mapped:!mapped);
   });
   if(app.gmFilter!=='issues'){
    body+=opts+'<div class="awb-mapping-list">'+visible.map(entry=>{
     const uuid=map[kind]?.[entry.id]||'';
     const item=uuid.startsWith('Item.')?game.items.get(uuid.slice(5)):null;
     return '<div class="awb-mapping-card" data-mapping-row="'+esc(entry.id)+'">'+
      '<div class="awb-mapping-name"><strong>'+esc(entry.name)+'</strong><small>'+esc(uuid?'Mapped':'Unmapped')+'</small></div>'+
      '<div class="awb-mapping-target" data-drop-map="'+esc(entry.id)+'">'+image(item)+
      '<input type="text" list="awb-world-items" data-mapping="'+esc(entry.id)+'" value="'+esc(uuid)+'" placeholder="Drop Item or select UUID"><span class="awb-drop-indicator"><i class="fas fa-hand-point-down"></i></span></div></div>';
    }).join('')+'</div>';
   }
   if(kind==='reagents'&&(app.gmFilter==='issues'||issues.some(i=>i.type==='reagent'))){
    body+='<h3>Reagent warnings</h3>'+noteList(issues.filter(i=>i.type==='reagent'));
   }
   body+='<div class="awb-bottom"><small>'+(kind==='reagents'?'Discovered from selected World Items and compendiums. Drag a compendium Item or enter its UUID to override a classification; then refresh.':'Potion outputs can be selected from configured Potion Sources or linked directly to World/compendium Items in Recipes.')+
     '</small>'+button('gm-save','Save '+kind+' mappings','class="awb-primary"')+'</div>';
  }
 }
 return '<section class="awb-panel awb-gm"><div class="awb-panel-heading"><div><h2>Alchemy world configuration</h2><p>Directory-driven herbs, reagents and potion outputs · GM-only</p></div>'+
  button('gm-pending','Pending brews')+'</div>'+nav+body+'</section>';
}

export async function directoryAction(app,action,target){
 if(!game.user.isGM)throw new Error('GM privileges required.');
 if(action.startsWith('gm-recipe-'))return recipeEditorAction(app,action,target);
  if(action.startsWith('gm-rules-'))return rulesEditorAction(app,action);
 if(action==='gm-open-item'){
  const doc=target.dataset.uuid?await fromUuid(target.dataset.uuid):null;
  if(doc?.sheet)doc.sheet.render(true);
  return true;
 }
 if(action==='gm-filter'){
  const possible=app.gmKind==='herbs'?['all','issues']:['all','mapped','unmapped','issues'];
  app.gmFilter=possible[(possible.indexOf(app.gmFilter)+1)%possible.length];return true;
 }
 if(action==='gm-sort'){
  const possible=['name','reverse','tier'];
  app.gmSort=possible[(possible.indexOf(app.gmSort)+1)%possible.length];return true;
 }
 if(['gm-clear-herbs','gm-clear-reagents','gm-clear-potions'].includes(action)){
  const key=action==='gm-clear-herbs'?'herbFolderId':action==='gm-clear-reagents'?'reagentFolderId':'potionFolderId';
  app.directoryDraft={...normalizeDirectoryConfig(config(app)),[key]:''};
  return true;
 }
 if(['gm-pick-herb-packs','gm-pick-reagent-packs','gm-pick-potion-packs'].includes(action)){
  const isHerb=action==='gm-pick-herb-packs',isPotion=action==='gm-pick-potion-packs';
  const key=isHerb?'herbPackIds':isPotion?'potionPackIds':'reagentPackIds';
  const packs=itemPacks(game.packs).sort((a,b)=>packLabel(a).localeCompare(packLabel(b)));
  if(!packs.length)throw new Error('No accessible Item compendium packs are available.');
  const selected=new Set(normalizeDirectoryConfig(config(app))[key]);
  const choices=packs.map(pack=>'<label class="awb-pack-choice"><input type="checkbox" name="itemPacks" value="'+
   esc(pack.collection)+'" '+(selected.has(pack.collection)?'checked':'')+'><span>'+
   esc(packLabel(pack))+'</span><small>'+esc(pack.collection)+'</small></label>').join('');
  const chosen=await foundry.applications.api.DialogV2.wait({
   window:{title:isHerb?'Choose Herb Compendiums':isPotion?'Choose Potion Compendiums':'Choose Reagent Compendiums'},
   content:'<div class="awb awb-pack-picker"><p>Select any number of Item compendiums. Leave unchecked to use World Items only.</p>'+
    choices+'</div>',
   buttons:[{action:'choose',label:'Use selected packs',default:true,
    callback:(_event,button)=>[...button.form.querySelectorAll('input[name="itemPacks"]:checked')].map(x=>x.value)},
    {action:'cancel',label:'Cancel'}],rejectClose:false
  });
  if(!chosen)return true;
  app.directoryDraft={...normalizeDirectoryConfig(config(app)),[key]:chosen};
  return true;
 }
 if(['gm-pick-herbs','gm-pick-reagents','gm-pick-potions'].includes(action)){
  const folders=itemFolders(game).sort((a,b)=>folderLabel(a,game).localeCompare(folderLabel(b,game)));
  if(!folders.length)throw new Error('Create a World Item folder before selecting a directory.');
  const key=action==='gm-pick-herbs'?'herbFolderId':action==='gm-pick-reagents'?'reagentFolderId':'potionFolderId';
  const choices=folders.map(folder=>'<option value="'+esc(folder.id)+'" '+(config(app)[key]===folder.id?'selected':'')+'>'+esc(folderLabel(folder,game))+'</option>').join('');
  const choice=await foundry.applications.api.DialogV2.wait({
   window:{title:action==='gm-pick-herbs'?'Pick herb directory':action==='gm-pick-reagents'?'Pick reagent directory':'Pick potion directory'},
   content:'<div class="awb"><label class="awb-field"><span>World Item folder</span><select name="folder">'+choices+'</select></label><p>Subfolders can be included recursively from the main setup screen.</p></div>',
   buttons:[{action:'choose',label:'Select folder',default:true,callback:(_event,button)=>button.form.elements.folder.value},{action:'cancel',label:'Cancel'}],
   rejectClose:false
  });
  if(!choice)return true;
  app.directoryDraft={...config(app),[key]:choice};
  // Source selections are staged until the GM reviews Refresh from sources.
  return true;
 }
 if(action==='gm-refresh'){await refreshWithConfirmation(app);return true;}
 return false;
}

async function refreshWithConfirmation(app){
 const proposed=normalizeDirectoryConfig(config(app));
 if(!hasSources(proposed,'herb')||!hasSources(proposed,'reagent'))
  throw new Error('Choose at least one World Item folder or Item compendium for herbs and for reagents.');
 const scan=await app.services.previewDirectories(proposed),r=scan.report;
 const shortIssues=r.issues.slice(0,12).map(i=>'<li><strong>'+esc(i.name)+'</strong>: '+esc(i.problem)+'</li>').join('');
 const issueText=r.issues.length?'<h3>Validation notices ('+r.issues.length+')</h3><ul>'+shortIssues+'</ul>'+(r.issues.length>12?'<p>Additional issues will appear in GM validation.</p>':''):'<p>No validation notices.</p>';
 const content='<div class="awb awb-directory-preview"><p><strong>'+r.validHerbs+' valid herbs</strong> from '+r.herbItems+' Items; <strong>'+r.mappedReagents+'/9 reagents</strong> from '+r.reagentItems+' Items.</p>'+
  '<p><strong>'+r.mappedPotions+'/'+app.services.recipes.length+' recipe outputs linked</strong> ('+r.automaticPotions+
   ' automatically matched, '+r.manualPotions+' explicitly linked, '+r.retainedPotions+' retained) from '+
   r.potionItems+' alchemy Items in '+r.potionSourceItems+' scanned source Items.</p>'+
  '<p><strong>'+r.missingPotions+' unlinked</strong>; '+r.ambiguousPotions+
   ' ambiguous. A single equipment compendium may not include all 44 recipe-specific potions or poisons. Missing recipes are never assigned an unrelated Item.</p>'+
  '<p>Changes: '+r.added.length+' added, '+r.changed.length+' updated, '+r.removed.length+' removed.</p>'+
  '<p>Each herb must have at least one valid linked reagent Item. Invalid herbs will be excluded until corrected.</p>'+
  issueText+'<p>Apply this world/compendium catalogue? Existing character inventory Items are not deleted.</p></div>';
 const accepted=await foundry.applications.api.DialogV2.confirm({
  window:{title:'Alchemy — Preview Directory Refresh'},content,
  yes:{label:'Apply scan'},no:{label:'Cancel'},rejectClose:false
 });
 if(!accepted)return;
 const result=await app.services.refreshDirectories(proposed);
 app.directoryDraft=null;app.mappingDraft=null;
 app.notice={text:'Updated '+result.validHerbs+' herbs, '+result.mappedReagents+'/9 reagents and '+result.mappedPotions+'/'+app.services.recipes.length+' recipe output links ('+result.missingPotions+' unlinked).',kind:result.missingPotions?'warn':'good'};
}
