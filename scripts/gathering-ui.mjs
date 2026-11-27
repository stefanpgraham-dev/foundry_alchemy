/* Herb-gathering screens share the existing ApplicationV2 event delegation. */
import {BIOMES,biomeCoverage,biomeTable,registryDiscrepancies} from './gathering.mjs';
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const nice=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
const art=herb=>'<img class="awb-art" alt="" src="'+esc(herb.img||'icons/svg/item-bag.svg')+'">';
const sourceList=app=>app.services.herbs||[];
const settings=app=>app.gatherOverridesDraft||structuredClone(app.services.gatherConfig());
const button=(action,name,cls='')=>'<button type="button" '+(cls?'class="'+cls+'" ':'')+'data-action="'+action+'">'+esc(name)+'</button>';

export function gatherView(app){
 const biome=BIOMES.includes(app.gatherBiome)?app.gatherBiome:BIOMES[0],herbs=sourceList(app);
 const rules=app.services.rules().gathering,overrides=app.services.gatherConfig();
 const table=biomeTable(herbs,biome,rules.tierWeights),coverage=biomeCoverage(herbs,biome);
 const dc=overrides.biomeDC?.[biome]||rules.dc;
 const options=BIOMES.map(x=>'<option value="'+esc(x)+'" '+(x===biome?'selected':'')+'>'+esc(x)+'</option>').join('');
 const rows=table.map(row=>'<div class="awb-gather-row">'+art(row.herb)+
  '<div><strong>'+esc(row.herb.name)+'</strong><small>'+nice(row.tier)+' · '+row.herb.reagents.map(nice).join(' / ')+'</small></div>'+
  '<b>'+row.probability.toFixed(1)+'%</b></div>').join('');
 const checkStatus=table.length?'':'<div class="awb-alert awb-alert-warn">No source-linked herbs with positive weights are available in this biome. Ask the GM to import or map the herb templates and refresh the herb sources.</div>';
 const kit=app.services.herbalismEligibility?.(app.actor)||{ok:false,errors:['Herbalism Kit proficiency is required.']};
 return '<div class="awb-two-col awb-gather-layout">'+
  '<section class="awb-panel"><div class="awb-panel-heading"><div><h2>Gather Herbs</h2><p class="awb-muted">Find plants in the current environment. Only mapped World/compendium Items can be awarded.</p></div></div>'+
  '<label class="awb-field"><span>Environment</span><select data-gather-biome>'+options+'</select></label>'+
  '<div class="awb-gather-stats"><span><strong>'+coverage.count+'</strong> herb varieties</span><span><strong>'+coverage.available.length+'/9</strong> reagent types</span><span><strong>DC '+dc+'</strong> Wisdom (Herbalism Kit)</span></div>'+
  '<div class="awb-gather-steps"><p><b>Success</b> 1 herb</p><p><b>DC +'+rules.plusFive+'</b> '+rules.yield2+' herbs</p><p><b>DC +'+rules.plusTen+'</b> '+rules.yield3+' herbs</p></div>'+
  (kit.ok?'':'<div class="awb-alert awb-alert-warn">'+esc(kit.errors?.join(' ')||'Herbalism Kit check unavailable.')+'</div>')+
  checkStatus+
  '<div class="awb-bottom"><small>Each herb is a separate weighted draw. The GM resolves the check and adds actual source Items to the actor.</small>'+
  '<button class="awb-primary" type="button" data-action="gather-roll" '+(!table.length||!kit.ok||app.busy?'disabled':'')+'>Roll Herbalism &amp; Gather</button></div>'+
  '</section>'+
  '<section class="awb-panel"><div class="awb-panel-heading"><h2>'+esc(biome)+' · Herb Table</h2><span class="awb-tag">'+table.length+' Items</span></div>'+
  '<div class="awb-item-list awb-gather-list">'+(rows||'<p class="awb-empty">No configured herb templates in this biome.</p>')+'</div>'+
  '<h3>Reagent access</h3><p class="awb-muted">'+(coverage.missing.length?'Missing: '+esc(coverage.missing.map(nice).join(', ')):'All nine reagent combinations can be harvested in this biome.')+'</p>'+
  '<p class="awb-muted">Tier weighting: Common '+rules.tierWeights.common+' · Rare '+rules.tierWeights.rare+' · Exotic '+rules.tierWeights.exotic+'.</p>'+
  '</section></div>';
}
export function gatherSetupView(app){
 const available=sourceList(app),d=settings(app),registry=app.services.herbRegistry||{herbs:[]};
 const rules=app.services.rules(),chosen=BIOMES.includes(app.gatherBiome)?app.gatherBiome:BIOMES[0];
 const rows=BIOMES.map(biome=>{
  const coverage=biomeCoverage(available,biome),dc=d.biomeDC?.[biome]||'';
  return '<div class="awb-gather-biome-row"><button type="button" data-gather-pick="'+esc(biome)+'" class="'+(chosen===biome?'selected':'')+'">'+esc(biome)+'</button>'+
   '<strong class="'+(coverage.missing.length?'awb-text-warning':'')+'">'+coverage.available.length+'/9</strong>'+
   '<label>DC <input type="number" min="1" max="40" placeholder="'+rules.gathering.dc+'" data-gather-dc="'+esc(biome)+'" value="'+esc(dc)+'"></label></div>';
 }).join('');
 const linked=new Set(available.map(h=>h.name.toLowerCase()));
 const newHerbs=(registry.herbs||[]).filter(h=>h.new);
 const missing=newHerbs.filter(h=>!linked.has(h.name.toLowerCase()));
 const caveats=registryDiscrepancies(available);
 const originalTierConflicts=(registry.herbs||[]).filter(h=>h.reagents?.some(key=>!key.startsWith(h.rarity+'_')));
 const list=biomeTable(available,chosen,rules.gathering.tierWeights);
 const weightRows=list.map(({herb,probability})=>
  '<div class="awb-gather-weight-row">'+art(herb)+'<span><strong>'+esc(herb.name)+'</strong><small>'+esc(nice(herb.rarity))+' · '+probability.toFixed(1)+'% effective chance</small></span>'+
  '<label>Weight <input type="number" min="0" max="100" step="1" data-gather-weight="'+esc(herb.sourceUuid)+'" value="'+esc(d.herbs?.[herb.sourceUuid]?.weight??herb.gatherWeight??1)+'"></label></div>'
 ).join('');
 return '<section class="awb-panel awb-gm awb-gather-setup">'+
  '<div class="awb-panel-heading"><div><h2>Herb gathering by biome</h2><p class="awb-muted">Biome data follows the Notion PoE Herbs registry; only scanned, mapped source Items enter a weighted table. Set the global +5/+10 yields in Rules.</p></div>'+
  button('gm-gather-save','Save biome tables','awb-primary')+'</div>'+
  '<div class="awb-folder-summary"><span><strong>'+available.length+'</strong> linked herb Items</span>'+
  '<span><strong>'+missing.length+'</strong> suggested herbs not imported</span>'+
  '<span><strong>'+caveats.length+'</strong> Notion/source differences</span>'+ 
  '<span><strong>'+originalTierConflicts.length+'</strong> canonical tier inconsistencies</span></div>'+
  '<div class="awb-two-col"><div><h3>Biome coverage &amp; optional DC overrides</h3><div class="awb-gather-biomes">'+rows+'</div></div>'+
  '<div><h3>Relative herb weights · '+esc(chosen)+'</h3>'+
  '<p class="awb-muted">0 removes a herb from this biome table. Tier weights (Common/Rare/Exotic) are in Rules.</p>'+
  '<div class="awb-gather-weights">'+(weightRows||'<p class="awb-empty">No linked herbs in this biome yet.</p>')+'</div></div></div>'+
  '<div class="awb-bottom"><div><strong>New regional plants ('+newHerbs.length+')</strong><p class="awb-muted">'+esc(missing.map(h=>h.name).join(', ')||'All proposed herb names are present in the linked catalogue.')+'</p>'+
  '<p class="awb-muted">Import creates World Items with reagent UUID links, pictures and descriptions. It never replaces existing Items. Refresh herb sources after importing.</p></div>'+
  button('gm-gather-import','Install missing biome herbs','awb-primary')+'</div>'+
  '<details><summary>Notion herb tiers ('+originalTierConflicts.length+' anomalies)</summary><p class="awb-muted">These are pre-existing Notion definitions where the herb rarity differs from the reagent tier; no automatic changes are made.</p>'+
  originalTierConflicts.map(h=>'<p><strong>'+esc(h.name)+'</strong> · Herb '+esc(h.rarity)+' → '+esc(h.reagents.join(' / '))+'</p>').join('')+'</details>'+
  '<details><summary>Notion/source comparison ('+caveats.length+')</summary>'+
  '<div class="awb-folder-issues">'+(caveats.map(c=>'<p><strong>'+esc(c.name)+'</strong> · '+esc(c.message)+'</p>').join('')||'<p>No property differences detected for matched herbs.</p>')+'</div></details>'+
  '</section>';
}
export function gatherInput(app,event){
 const el=event.target;
 if(el.matches?.('[data-gather-biome]')){app.gatherBiome=el.value;void app.render();return true;}
 if(el.matches?.('[data-gather-dc]')){
  app.gatherOverridesDraft??=structuredClone(app.services.gatherConfig());
  app.gatherOverridesDraft.biomeDC??={};
  const n=el.value===''?null:Number(el.value);
  if(n===null)delete app.gatherOverridesDraft.biomeDC[el.dataset.gatherDc];
  else app.gatherOverridesDraft.biomeDC[el.dataset.gatherDc]=n;
  return true;
 }
 if(el.matches?.('[data-gather-weight]')){
  app.gatherOverridesDraft??=structuredClone(app.services.gatherConfig());
  app.gatherOverridesDraft.herbs??={};
  app.gatherOverridesDraft.herbs[el.dataset.gatherWeight]??={};
  app.gatherOverridesDraft.herbs[el.dataset.gatherWeight].weight=Number(el.value);
  return true;
 }
 return false;
}
export async function gatherAction(app,action){
 if(action==='gather-roll'){
  const result=await app.services.submit({mode:'gather',actorId:app.actor.id,biome:app.gatherBiome});
  app.notice={text:result||'Gathering resolved. Review the chat log.',kind:'good'};
  return true;
 }
 if(!game.user.isGM)throw Error('Only the GM can configure gathering tables.');
 if(action==='gm-gather-save'){
  const valid=await app.services.saveGatherConfig(settings(app));
  app.gatherOverridesDraft=structuredClone(valid);
  app.notice={text:'Biome DC overrides and herb weights saved.',kind:'good'};return true;
 }
 if(action==='gm-gather-import'){
  const confirmed=await foundry.applications.api.DialogV2.confirm({
   window:{title:'Import new biome herbs'},
   content:'Import the suggested 23 endemic herbs as World Items? Existing named Items will not be replaced. Reagent mappings must be configured first. The module will add a herb World folder source if needed.',
   yes:{label:'Import missing herbs'},no:{label:'Cancel'},rejectClose:false
  });
  if(!confirmed)return true;
  const result=await app.services.importGatherHerbs();
  app.notice={text:result,kind:'good'};return true;
 }
 return false;
}
