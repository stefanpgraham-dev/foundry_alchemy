/* GM folder setup and directory-based catalogue (Foundry v14). */
import {itemFolders,folderLabel} from './directories.mjs';
import {KEYS} from './engine.mjs';
import {recipeEditorView,recipeEditorAction} from './recipe-ui.mjs';

const esc=value=>foundry.utils.escapeHTML(String(value??''));
const label=value=>String(value||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const image=item=>'<img class="awb-art" src="'+esc(item?.img||'icons/svg/item-bag.svg')+'" alt="">';
const button=(action,text,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+esc(text)+'</button>';
const mappings=(app)=>app.mappingDraft||structuredClone(app.services.mappings());
const config=(app)=>app.directoryDraft||app.services.directories();
const report=(app)=>app.services.directoryReport()||{issues:[]};

function folderName(id){
 const f=itemFolders(game).find(x=>x.id===id);
 return f?folderLabel(f,game):'Not configured';
}
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
  button('gm-refresh','Refresh from directory')+'</div>';
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
 const current=config(app),r=report(app),map=mappings(app),kind=app.gmKind;
 const issues=r.issues||[];
 const foldersBar='<div class="awb-folder-switches">'+
  '<div><strong>Herb folder</strong><span>'+esc(folderName(current.herbFolderId))+'</span>'+button('gm-pick-herbs','Pick herb directory')+'</div>'+
  '<div><strong>Reagent folder</strong><span>'+esc(folderName(current.reagentFolderId))+'</span>'+button('gm-pick-reagents','Pick reagent directory')+'</div>'+
  '</div>';
 const recursive='<label class="awb-directory-recursive"><input type="checkbox" data-directory-recursive '+(current.includeSubfolders?'checked':'')+'> Include subfolders recursively</label>';
 const nav='<div class="awb-subtabs">'+[
  ['directories','Directories'],['herbs','Herbs ('+app.services.herbs.length+')'],
  ['reagents','Reagents ('+Object.keys(map.reagents||{}).length+'/9)'],
  ['recipes','Recipes ('+app.services.recipes.length+')']
 ].map(([id,name])=>'<button type="button" data-gm-kind="'+id+'" class="'+(kind===id?'active':'')+'">'+esc(name)+'</button>').join('')+'</div>';
 let body='';
 if(kind==='recipes')body=recipeEditorView(app);
 else if(kind==='directories'){
  body='<p class="awb-muted">Select World Item folders. Herbs must link to their permitted reagent Items in Description using Foundry content links. A refresh previews additions, changes and problems before replacing the world catalogue.</p>'+
   foldersBar+recursive+
   '<div class="awb-folder-summary">'+
   '<span><strong>'+Number(r.validHerbs||0)+'</strong> herbs imported</span>'+
   '<span><strong>'+Number(r.mappedReagents||0)+'/9</strong> reagents mapped</span>'+
   '<span><strong>'+issues.length+'</strong> notices</span></div>'+
   '<div class="awb-bottom"><small>Refresh never deletes Items from any character inventory.</small>'+button('gm-refresh','Refresh from directory','class="awb-primary"')+'</div>'+
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
      '<div class="awb-mapping-name"><strong>'+esc(herb.name)+'</strong><small>'+esc(linked)+'</small><small>'+esc(label(herb.rarity))+' herb · '+esc(herb.sourceUuid)+'</small></div>'+
      '<button type="button" data-action="gm-open-item" data-uuid="'+esc(herb.sourceUuid)+'">Open Item</button></div>';
    }).join('')+'</div>';
   }
   if(app.gmFilter==='issues'||issues.some(i=>i.type==='herb'))body+='<h3>Herbs requiring review</h3>'+noteList(issues.filter(i=>i.type==='herb'));
   body+='<p class="awb-muted">Herb entries are generated from the selected folder. Edit the Item or its linked reagents, then refresh.</p>';
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
   body+='<div class="awb-bottom"><small>'+(kind==='reagents'?'Automatically mapped from directory names; manual overrides are permitted. Refresh afterwards to update herb links.':'Existing potion outputs are mapped independently of the two folders.')+
     '</small>'+button('gm-save','Save '+kind+' mappings','class="awb-primary"')+'</div>';
  }
 }
 return '<section class="awb-panel awb-gm"><div class="awb-panel-heading"><div><h2>Alchemy world configuration</h2><p>Directory-driven herbs and reagents · GM-only</p></div>'+
  button('gm-pending','Pending brews')+'</div>'+nav+body+'</section>';
}

export async function directoryAction(app,action,target){
 if(!game.user.isGM)throw new Error('GM privileges required.');
 if(action.startsWith('gm-recipe-'))return recipeEditorAction(app,action,target);
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
 if(action==='gm-pick-herbs'||action==='gm-pick-reagents'){
  const folders=itemFolders(game).sort((a,b)=>folderLabel(a,game).localeCompare(folderLabel(b,game)));
  if(!folders.length)throw new Error('Create a World Item folder before selecting a directory.');
  const key=action==='gm-pick-herbs'?'herbFolderId':'reagentFolderId';
  const choices=folders.map(folder=>'<option value="'+esc(folder.id)+'" '+(config(app)[key]===folder.id?'selected':'')+'>'+esc(folderLabel(folder,game))+'</option>').join('');
  const choice=await foundry.applications.api.DialogV2.wait({
   window:{title:action==='gm-pick-herbs'?'Pick herb directory':'Pick reagent directory'},
   content:'<div class="awb"><label class="awb-field"><span>World Item folder</span><select name="folder">'+choices+'</select></label><p>Subfolders can be included recursively from the main setup screen.</p></div>',
   buttons:[{action:'choose',label:'Select folder',default:true,callback:(_event,button)=>button.form.elements.folder.value},{action:'cancel',label:'Cancel'}],
   rejectClose:false
  });
  if(!choice)return true;
  app.directoryDraft={...config(app),[key]:choice};
  // Automatically preview/apply once both directories have been chosen.
  if(app.directoryDraft.herbFolderId&&app.directoryDraft.reagentFolderId)await refreshWithConfirmation(app);
  return true;
 }
 if(action==='gm-refresh'){await refreshWithConfirmation(app);return true;}
 return false;
}

async function refreshWithConfirmation(app){
 const proposed=config(app),scan=app.services.previewDirectories(proposed),r=scan.report;
 const shortIssues=r.issues.slice(0,12).map(i=>'<li><strong>'+esc(i.name)+'</strong>: '+esc(i.problem)+'</li>').join('');
 const issueText=r.issues.length?'<h3>Validation notices ('+r.issues.length+')</h3><ul>'+shortIssues+'</ul>'+(r.issues.length>12?'<p>Additional issues will appear in GM validation.</p>':''):'<p>No validation notices.</p>';
 const content='<div class="awb awb-directory-preview"><p><strong>'+r.validHerbs+' valid herbs</strong> from '+r.herbItems+' Items; <strong>'+r.mappedReagents+'/9 reagents</strong> from '+r.reagentItems+' Items.</p>'+
  '<p>Changes: '+r.added.length+' added, '+r.changed.length+' updated, '+r.removed.length+' removed.</p>'+
  '<p>Each herb must have at least one valid linked reagent Item. Invalid herbs will be excluded until corrected.</p>'+
  issueText+'<p>Apply this directory snapshot? Existing character inventory Items are not deleted.</p></div>';
 const accepted=await foundry.applications.api.DialogV2.confirm({
  window:{title:'Alchemy — Preview Directory Refresh'},content,
  yes:{label:'Apply scan'},no:{label:'Cancel'},rejectClose:false
 });
 if(!accepted)return;
 const result=await app.services.refreshDirectories(proposed);
 app.directoryDraft=null;app.mappingDraft=null;
 app.notice={text:'Updated '+result.validHerbs+' herbs and '+result.mappedReagents+'/9 reagents. '+result.issues.length+' validation notice(s).',kind:result.issues.length?'warn':'good'};
}
