import {KEYS,TIERS,COLOURS,DC,HOURS,recipeTier,maximumCraftableBatch,availableRefinementTargets,planRefine} from './engine.mjs';
import {getQty,findMatchedInventory,findHerbs,inventoryAudit,planBrew,setting,normal} from './inventory.mjs';
import {captureWorkbenchViewport,restoreWorkbenchViewport} from './viewport.mjs';
import {directoryView,directoryAction} from './directory-ui.mjs';
import {recipeEditorInput,recipeEditorImport,recipeEditorDrop} from './recipe-ui.mjs';
import {brewToolLabel,brewToolSummary} from './recipe-tools.mjs';
import {rulesEditorInput} from './rules-ui.mjs';
import {recipeDC,recipeHours} from './recipes.mjs';

const esc=value=>foundry.utils.escapeHTML(String(value??''));
const label=key=>String(key).replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const defaultImage='icons/consumables/potions/potion-bottle-corked-red.webp';
const icon=(src,alt='',cls='')=>`<img class="awb-art ${cls}" src="${esc(src||defaultImage)}" alt="${esc(alt)}" loading="lazy">`;
const titleCase=s=>String(s).replace(/\b\w/g,x=>x.toUpperCase());
const styleClass=k=>`awb-${String(k).split('_').at(-1)}`;
const small=(text)=>`<span class="awb-muted">${esc(text)}</span>`;
const fmt=(rows)=>rows?.length?rows.map(x=>`${x.quantity} × ${label(x.id)}`).join(', '):'None';
const tag=(text,type='')=>`<span class="awb-tag ${esc(type)}">${esc(text)}</span>`;
const marker=(key,quantity)=>`<span class="awb-material ${styleClass(key)}"><span class="awb-dot"></span><strong>${esc(label(key))}</strong><span>× ${quantity}</span></span>`;
const message=(text,kind='info')=>`<div class="awb-alert awb-alert-${kind}" role="status">${esc(text)}</div>`;

export class AlchemyWorkbench extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS={
    id:'alchemy-workbench',
    classes:['alchemy-workbench','awb-app'],
    window:{title:'Alchemy Workbench',resizable:true},
    position:{width:965,height:740}
  };

  constructor(actor,services,options={}){
    super({...options,id:`alchemy-workbench-${actor.id}`});
    this.actor=actor;
    this.services=services;
    this.tab='brew';this.search='';this.showUnavailable=false;this.recipeId=null;this.batch=1;this.brewToolId=null;
    this.selectedHerbId=null;this.herbKey=null;this.herbQty=1;
    this.selectedRefineId=null;this.refineTier=null;this.refineQty=1;
    this.change='highest';this.selectedIds=null;
    this.gmKind='directories';this.gmSearch='';this.gmFilter='all';this.gmSort='name';this.mappingDraft=null;this.directoryDraft=null;
     this.rulesDraft=null;this.rulesDirty=false;
     this.herbQuery='';this.herbFilter='all';this.herbSort='name';
    this.busy=false;this.notice=null;
  }
  async _renderHTML(){return this._layout();}
  _replaceHTML(html,content){
    const editing=this.element?.ownerDocument?.activeElement ?? null;
    const state=captureWorkbenchViewport(content,editing);
    content.innerHTML=html;
    restoreWorkbenchViewport(content,state);
  }
  _onRender(context,options){
    super._onRender(context,options);
    const root=this.element;
    if(root?.dataset.awbBound)return;
    if(!root)return;
    root.dataset.awbBound='1';
    root.addEventListener('click',event=>void this._click(event));
    root.addEventListener('input',event=>this._input(event));
    root.addEventListener('change',event=>this._change(event));
    root.addEventListener('dragover',event=>this._dragOver(event));
    root.addEventListener('drop',event=>void this._drop(event));
  }
  _inventory(){return findMatchedInventory(this.actor,this.services.mappings());}
  _herbs(){return findHerbs(this.actor,this.services.mappings(),this.services.herbs);}
  _readyRecipes(){
    const inventory=this._inventory();
    return this.services.recipes.filter(recipe=>recipe.enabled!==false).map(recipe=>({
      recipe,
      max:maximumCraftableBatch(recipe,inventory,this.services.rules?.().maxBatch??100),
      qualification:this.services.brewingEligibility(this.actor,recipe)
    }));
  }
  _templateImage(uuid){
    if(!uuid)return defaultImage;
    if(uuid.startsWith('Item.'))return game.items.get(uuid.slice(5))?.img||defaultImage;
    if(uuid.startsWith('Compendium.')){
      const bits=uuid.split('.'),id=bits.at(-1),pack=game.packs.get(bits.slice(1,-1).join('.'));
      return pack?.index?.get(id)?.img||defaultImage;
    }
    return defaultImage;
  }
  _layout(){
    const mapping=this.services.mappings(),reagentRows=this._inventory(),herbRows=this._herbs();
    const tabs=[['brew','fa-flask','Brew Potions'],['extract','fa-leaf','Prepare Herbs'],['refine','fa-arrows-down-to-line','Refine Reagents'],['inventory','fa-boxes-stacked','Inventory']];
    if(game.user.isGM)tabs.push(['gm','fa-gear','GM Setup']);
    return `<div class="awb-shell">
      <header class="awb-hero">
        <div><p class="awb-eyebrow">APOTHECARY · ${esc(this.actor.name)}</p><h1>Alchemy Workbench</h1><p>Reagents, tinctures and complex preparations</p></div>
        <div class="awb-hero-stats"><span><strong>${reagentRows.reduce((n,x)=>n+x.quantity,0)}</strong> reagents</span><span><strong>${herbRows.reduce((n,x)=>n+x.quantity,0)}</strong> herbs</span></div>
      </header>
      <nav class="awb-tabs" aria-label="Alchemy sections">${tabs.map(([id,fa,text])=>`<button type="button" data-tab="${id}" class="${this.tab===id?'active':''}" aria-current="${this.tab===id?'page':'false'}"><i class="fas ${fa}" aria-hidden="true"></i> ${esc(text)}</button>`).join('')}</nav>
      ${this.notice?message(this.notice.text,this.notice.kind):''}
      <main class="awb-main">${this.tab==='brew'?this._brew():this.tab==='extract'?this._extract():this.tab==='refine'?this._refine():this.tab==='inventory'?this._inventoryTab():this._gm()}</main>
    </div>`;
  }
  _toolOptions(qualification){
    if(!qualification?.eligible?.length)return '';
    return '<select data-brew-tool>'+qualification.eligible.map(o=>
      '<option value="'+esc(o.id)+'" '+(this.brewToolId===o.id?'selected':'')+'>'+esc(o.label)+'</option>'
    ).join('')+'</select>';
  }
  _brew(){
    const entries=this._readyRecipes(),eligible=entries.filter(x=>x.max>0&&x.qualification.ok);
    const visible=this.showUnavailable?entries:eligible;
    const chosen=entries.find(x=>x.recipe.id===this.recipeId && x.max>0&&x.qualification.ok)||eligible[0];
    if(chosen){
      this.recipeId=chosen.recipe.id;
      this.batch=Math.max(1,Math.min(chosen.max,this.batch));
      if(!chosen.qualification.eligible.some(x=>x.id===this.brewToolId))
        this.brewToolId=chosen.qualification.eligible[0]?.id||null;
    }
    const search=this.search.toLowerCase();
    const mapping=this.services.mappings();
    const items=visible.filter(x=>x.recipe.name.toLowerCase().includes(search));
    let plan=null,issue='';
    if(chosen)try{plan=planBrew(this.actor,chosen.recipe,this.batch,mapping,this.selectedIds,this.change);}catch(err){issue=err.message;}
    const cards=items.map(({recipe,max,qualification})=>{
      const rarity=recipeTier(recipe),selected=chosen?.recipe.id===recipe.id,canBrew=max>0&&qualification.ok;
      const artwork=this._templateImage(mapping.outputs?.[recipe.id]);
      return `<button class="awb-recipe-card ${selected?'selected':''} ${canBrew?'':'disabled'}" type="button" data-recipe="${esc(recipe.id)}" ${canBrew?'':'disabled'}>
        ${icon(artwork,recipe.name)}<span class="awb-recipe-content"><strong>${esc(recipe.name)}</strong><small>${titleCase(rarity)} · DC ${recipeDC(recipe,this.services.rules?.())} · ${esc(brewToolSummary(recipe))}</small></span>
        <span class="awb-max">${canBrew?`×${max}`:max?'Tool required':'Unavailable'}</span></button>`;
    }).join('');
    const recipe=chosen?.recipe,tier=recipe?recipeTier(recipe):'common';
    const eligibility=chosen?.qualification||null;
    const accessNotice=eligibility?.ok?'':message(entries.find(x=>x.max>0)?.qualification.errors.join(' ')||'Obtain ingredients and a proficient, recipe-approved brewing kit.','warn');
    return `<div class="awb-brew-layout">
      <section class="awb-panel awb-browser"><div class="awb-panel-heading"><h2>Formulae</h2>${tag(`${eligible.length} craftable`,'awb-available')}</div>
        <label class="awb-search-wrap"><i class="fas fa-search" aria-hidden="true"></i><input data-search="recipes" placeholder="Search potions and poisons…" value="${esc(this.search)}"></label>
        <label class="awb-switch"><input type="checkbox" data-show-unavailable ${this.showUnavailable?'checked':''}><span>Show recipes missing ingredients</span></label>
        <div class="awb-recipe-list">${cards||'<p class="awb-empty">No recipes match your search.</p>'}</div>
      </section>
      <section class="awb-panel awb-detail">${accessNotice}${recipe?`
        <div class="awb-detail-head">${icon(this._templateImage(mapping.outputs?.[recipe.id]),recipe.name,'awb-featured')}<div><p class="awb-eyebrow">${esc(titleCase(tier))} formula</p><h2>${esc(recipe.name)}</h2><div class="awb-pills">${tag(`DC ${recipeDC(recipe,this.services.rules?.())}`)}${tag(`${recipeHours(recipe,this.services.rules?.())} hours`)}${tag(`Max ${chosen.max}`)}</div></div></div>
        <h3>Brewing tool</h3><label class="awb-brew-tool-selector"><span>Use one qualified kit</span>${this._toolOptions(eligibility)}</label><p class="awb-muted">Allowed: ${esc(brewToolSummary(recipe))}. The selected kit performs the initial and follow-up checks.</p>
        <h3>Ingredients per potion</h3><div class="awb-material-list">${Object.entries(recipe.cost).map(([k,q])=>marker(k,q)).join('')}</div>
        <div class="awb-batch-control"><div><strong>Batch size</strong><small>One brew check · same preparation time</small></div><div class="awb-stepper"><button type="button" data-action="batch-minus" ${this.batch<=1?'disabled':''}>−</button><output>${this.batch}</output><button type="button" data-action="batch-plus" ${this.batch>=chosen.max?'disabled':''}>+</button></div></div>
        <h3>Ingredient allocation</h3>
        ${plan?`<div class="awb-summary"><div class="awb-summary-row"><span>Consumed</span><strong>${esc(plan.consume.map(x=>`${this.actor.items.get(x.id)?.name} × ${x.quantity}`).join(', ')||'None')}</strong></div><div class="awb-summary-row"><span>Returned as change</span><strong>${esc(fmt(Object.entries(plan.return).map(([id,quantity])=>({id,quantity}))))}</strong></div></div>`:message(issue,'warn')}
        <details class="awb-advanced"><summary>Advanced allocation options</summary>
          <label class="awb-field"><span>Change denomination</span><select data-change><option value="highest" ${this.change==='highest'?'selected':''}>Highest available tier</option><option value="common" ${this.change==='common'?'selected':''}>Common reagents</option></select></label>
          <div class="awb-ingredient-picks">${this._inventory().map(x=>`<label><input type="checkbox" data-stack="${esc(x.id)}" ${this.selectedIds===null||this.selectedIds.includes(x.id)?'checked':''}> ${esc(x.item.name)} ×${x.quantity}</label>`).join('')}</div>
        </details>
        <div class="awb-bottom"><div>${small('Reagents are consumed after the GM resolves the brew.')}<br>${small('Critical and partial yields use animated dice.')}</div><button class="awb-primary" type="button" data-action="brew" ${this.busy||!plan||!eligibility.ok?'disabled':''}><i class="fas fa-flask"></i> Brew ${this.batch} potion${this.batch===1?'':'s'}</button></div>
      `:`<div class="awb-empty-state"><i class="fas fa-flask-vial"></i><h2>No potions currently craftable</h2><p>Extract herbs or obtain reagents first. Check Inventory to see what the module recognises.</p><button type="button" data-tab="inventory">Inspect inventory</button></div>`}</section>
    </div>`;
  }
  _extract(){
    const plants=this._herbs().filter(row=>(this.herbFilter==='all'||row.herb.rarity===this.herbFilter)&&row.item.name.toLowerCase().includes(this.herbQuery.toLowerCase())).sort((a,b)=>{
       if(this.herbSort==='quantity')return b.quantity-a.quantity||a.item.name.localeCompare(b.item.name);
       if(this.herbSort==='rarity')return ({common:0,rare:1,exotic:2}[a.herb.rarity]??3)-({common:0,rare:1,exotic:2}[b.herb.rarity]??3)||a.item.name.localeCompare(b.item.name);
       return a.item.name.localeCompare(b.item.name);
     });
    const selected=plants.find(x=>x.item.id===this.selectedHerbId)||plants[0];
    if(selected){this.selectedHerbId=selected.item.id;this.herbKey=selected.herb.reagents.includes(this.herbKey)?this.herbKey:selected.herb.reagents[0];this.herbQty=Math.max(1,Math.min(selected.quantity,this.herbQty));}
    return `<div class="awb-two-col"><section class="awb-panel"><div class="awb-panel-heading"><h2>Herb satchel</h2>${tag(`${plants.length} varieties`)}</div>
    <div class="awb-library-toolbar"><label class="awb-search-wrap"><i class="fas fa-search"></i><input data-search="herbs" value="${esc(this.herbQuery)}" placeholder="Search carried herbs…"></label><button type="button" data-action="herb-filter">Filter: ${esc(titleCase(this.herbFilter))}</button><button type="button" data-action="herb-sort">Sort: ${esc(titleCase(this.herbSort))}</button></div>
     <div class="awb-item-list">${plants.map(({item,herb,quantity})=>`<button type="button" class="awb-item-row ${selected?.item.id===item.id?'selected':''}" data-herb="${esc(item.id)}">${icon(item.img,item.name)}<span><strong>${esc(item.name)}</strong><small>${esc(titleCase(herb.rarity))} · ${herb.reagents.length} property${herb.reagents.length===1?'':'ies'}</small></span><b>×${quantity}</b></button>`).join('')||'<p class="awb-empty">No mapped herbs are recognised.</p>'}</div></section>
    <section class="awb-panel awb-detail">${selected?`<div class="awb-detail-head">${icon(selected.item.img,selected.item.name,'awb-featured')}<div><p class="awb-eyebrow">Herbal extraction</p><h2>${esc(selected.item.name)}</h2><p>Choose exactly one reagent property per herb.</p></div></div>
      <h3>Extract as</h3><div class="awb-choice-grid">${selected.herb.reagents.map(k=>`<button type="button" data-herb-key="${esc(k)}" class="awb-choice ${k===this.herbKey?'selected':''}">${marker(k,1)}</button>`).join('')}</div>
      <div class="awb-batch-control"><div><strong>Herbs to process</strong><small>1 herb → 1 reagent, without a check</small></div><div class="awb-stepper"><button type="button" data-action="herb-minus" ${this.herbQty<=1?'disabled':''}>−</button><output>${this.herbQty}</output><button type="button" data-action="herb-plus" ${this.herbQty>=selected.quantity?'disabled':''}>+</button></div></div>
      <div class="awb-summary">${marker(this.herbKey,this.herbQty)} will be added to the character's inventory.</div>
      <div class="awb-bottom"><span>${small('Instantaneous, no skill check.')}</span><button type="button" class="awb-primary" data-action="extract" ${this.busy?'disabled':''}>Prepare ${this.herbQty} reagent${this.herbQty===1?'':'s'}</button></div>`:`<div class="awb-empty-state"><i class="fas fa-leaf"></i><h2>No recognised herbs</h2><p>The GM may need to map the herb templates in Setup.</p></div>`}</section></div>`;
  }
  _refine(){
    const eligible=this._inventory().filter(x=>availableRefinementTargets(x.key).length);
    const selected=eligible.find(x=>x.item.id===this.selectedRefineId)||eligible[0];
    if(selected){
      this.selectedRefineId=selected.item.id;
      const choices=availableRefinementTargets(selected.key);
      if(!choices.includes(this.refineTier))this.refineTier=choices[0];
      this.refineQty=Math.max(1,Math.min(selected.quantity,this.refineQty));
    }
    const result=selected?planRefine(selected.key,this.refineQty,this.refineTier):null;
    return `<div class="awb-two-col"><section class="awb-panel"><div class="awb-panel-heading"><h2>Refine reagents</h2>${tag(`${eligible.length} eligible stacks`)}</div>
    <div class="awb-item-list">${eligible.map(x=>`<button type="button" data-refine="${esc(x.id)}" class="awb-item-row ${selected?.id===x.id?'selected':''}">${icon(x.item.img,x.item.name)}<span><strong>${esc(x.item.name)}</strong><small>${esc(label(x.key))}</small></span><b>×${x.quantity}</b></button>`).join('')||'<p class="awb-empty">Only Rare and Exotic reagents can be downgraded.</p>'}</div></section>
    <section class="awb-panel awb-detail">${selected?`<p class="awb-eyebrow">Simple refinement · No skill check</p><h2>${esc(selected.item.name)}</h2><h3>Target reagent tier</h3><div class="awb-choice-grid">${availableRefinementTargets(selected.key).map(tier=>`<button class="awb-choice ${tier===this.refineTier?'selected':''}" type="button" data-refine-tier="${esc(tier)}">${tag(titleCase(tier))}<strong>×${tier==='common'&&selected.key.startsWith('exotic')?9:3}</strong></button>`).join('')}</div>
    <div class="awb-batch-control"><div><strong>Quantity to downgrade</strong><small>Only lower tiers of the same colour</small></div><div class="awb-stepper"><button type="button" data-action="refine-minus" ${this.refineQty<=1?'disabled':''}>−</button><output>${this.refineQty}</output><button type="button" data-action="refine-plus" ${this.refineQty>=selected.quantity?'disabled':''}>+</button></div></div>
    <div class="awb-conversion"><div>${icon(selected.item.img,selected.item.name)}<p>×${this.refineQty}</p></div><i class="fas fa-arrow-right" aria-hidden="true"></i><div>${icon(this._templateImage(this.services.mappings().reagents?.[result.key]),label(result.key))}<p>×${result.quantity}</p></div></div><p class="awb-center">${esc(label(result.key))} · All reagent value preserved</p>
    <div class="awb-bottom"><span>${small('Immediate inventory conversion.')}</span><button class="awb-primary" type="button" data-action="refine" ${this.busy?'disabled':''}>Downgrade reagents</button></div>`:`<div class="awb-empty-state"><i class="fas fa-arrow-down-wide-short"></i><h2>No reagents to refine</h2><p>Common reagents cannot be downgraded.</p></div>`}</section></div>`;
  }
  _inventoryTab(){
    const map=this.services.mappings();const {reagents,herbs,unmapped}=inventoryAudit(this.actor,map,this.services.herbs);
    const mapped=Object.values(map.reagents||{}).filter(Boolean).length;
    const relevant=unmapped.filter(x=>/herb|moss|root|leaf|flower|reagent|bloom|thistle|stem|weed/i.test(x.name));
    return `<div class="awb-two-col"><section class="awb-panel"><div class="awb-panel-heading"><h2>Recognised reagents</h2>${tag(`${mapped}/9 template mappings`,mapped===9?'awb-available':'awb-warning')}</div>
    <div class="awb-stock-grid">${KEYS.map(k=>{const matched=reagents.filter(x=>x.key===k),amount=matched.reduce((n,x)=>n+x.quantity,0),uuid=map.reagents?.[k];return `<div class="awb-stock ${styleClass(k)}">${icon(this._templateImage(uuid),label(k))}<span><strong>${esc(label(k))}</strong><small>${amount} available</small></span>${!uuid?tag('Unmapped','awb-warning'):''}</div>`;}).join('')}</div></section>
    <section class="awb-panel"><h2>Recognised herbs</h2><div class="awb-item-list">${herbs.map(x=>`<div class="awb-item-row">${icon(x.item.img,x.item.name)}<span><strong>${esc(x.item.name)}</strong><small>${esc(x.herb.reagents.map(label).join(' / '))}</small></span><b>×${x.quantity}</b></div>`).join('')||'<p class="awb-empty">None recognised.</p>'}</div>
    <h3>Items requiring a mapping review</h3><p class="awb-muted">These look like herbs or reagents but are not recognised. A source UUID, template name or saved category must match.</p><div class="awb-item-list">${relevant.map(x=>`<div class="awb-item-row">${icon(x.img,x.name)}<span><strong>${esc(x.name)}</strong><small>No matching saved mapping or source metadata</small></span><b>×${getQty(x)}</b></div>`).join('')||'<p class="awb-empty">No likely unmatched herbs or reagents.</p>'}</div></section></div>`;
  }
  _gm(){return directoryView(this);}
  _filterInput(node,query){
    const parent=node.closest('.awb-panel'),selector=query==='recipes'?'.awb-recipe-card':'.awb-mapping-card';
    parent?.querySelectorAll(selector).forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(node.value.toLowerCase());});
  }
  _input(event){
    const el=event.target;
    if(el.matches?.('[data-search="recipes"]')){this.search=el.value;this._filterInput(el,'recipes');}
    if(rulesEditorInput(this,event))return;
    if(recipeEditorInput(this,event))return;
    if(el.matches?.('[data-search="gm"]')){this.gmSearch=el.value;this._filterInput(el,'gm');}
    if(el.matches?.('[data-search="herbs"]')){
      this.herbQuery=el.value;
      const q=el.value.toLowerCase();
      this.element.querySelectorAll('[data-herb]').forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(q);});
    }
    if(el.matches?.('[data-mapping]')){
      this.mappingDraft??=structuredClone(this.services.mappings());
      this.mappingDraft[this.gmKind]??={};
      this.mappingDraft[this.gmKind][el.dataset.mapping]=el.value.trim();
    }
  }
  _change(event){
    const el=event.target;
    if(el.matches?.('[data-rule-field]')){rulesEditorInput(this,event);return;}
    if(el.matches?.('[data-recipe-filter],[data-recipe-sort]')){recipeEditorInput(this,event);return;}
    if(el.matches?.('[data-recipe-import]')){
      const file=el.files?.[0];
      if(file){
        void recipeEditorImport(this,file).then(()=>this.render()).catch(err=>{
          this.notice={text:err.message||String(err),kind:'warn'};
          ui.notifications.error('Alchemy recipe import: '+(err.message||err));
          void this.render();
        });
      }
      return;
    }
    if(el.matches?.('[data-rarity-map]')){
      const current=this.directoryDraft||this.services.directories();
      this.directoryDraft={...current,rarityMap:{...(current.rarityMap||{}),[el.dataset.rarityMap]:el.value}};
      // Mapping changes are staged for Refresh from sources; never auto-apply.
      return;
    }
    if(el.matches?.('[data-directory-recursive]')){
      this.directoryDraft={...(this.directoryDraft||this.services.directories()),includeSubfolders:el.checked};
      void this.render();
    }
    if(el.matches?.('[data-show-unavailable]')){this.showUnavailable=el.checked;void this.render();}
    if(el.matches?.('[data-change]')){this.change=el.value;void this.render();}
    if(el.matches?.('[data-brew-tool]')){this.brewToolId=el.value;void this.render();}
    if(el.matches?.('[data-stack]')){
      this.selectedIds=[...this.element.querySelectorAll('[data-stack]:checked')].map(x=>x.dataset.stack);void this.render();
    }
  }
  async _click(event){
    const target=event.target.closest?.('[data-tab],[data-recipe],[data-herb],[data-herb-key],[data-refine],[data-refine-tier],[data-gm-kind],[data-action]');
    if(!target||this.busy)return;
    if(target.dataset.tab){this.tab=target.dataset.tab;this.notice=null;await this.render();return;}
    if(target.dataset.recipe){this.recipeId=target.dataset.recipe;this.batch=1;this.selectedIds=null;await this.render();return;}
    if(target.dataset.herb){this.selectedHerbId=target.dataset.herb;this.herbKey=null;this.herbQty=1;await this.render();return;}
    if(target.dataset.herbKey){this.herbKey=target.dataset.herbKey;await this.render();return;}
    if(target.dataset.refine){this.selectedRefineId=target.dataset.refine;this.refineQty=1;this.refineTier=null;await this.render();return;}
    if(target.dataset.refineTier){this.refineTier=target.dataset.refineTier;await this.render();return;}
    if(target.dataset.gmKind){this.gmKind=target.dataset.gmKind;this.gmSearch='';this.gmFilter='all';await this.render();return;}
    const action=target.dataset.action;
    if(action==='herb-filter'){const list=['all','common','rare','exotic'];this.herbFilter=list[(list.indexOf(this.herbFilter)+1)%list.length];this.herbQuery='';await this.render();return;}
    if(action==='herb-sort'){const list=['name','rarity','quantity'];this.herbSort=list[(list.indexOf(this.herbSort)+1)%list.length];await this.render();return;}
    if(['batch-minus','batch-plus'].includes(action)){this.batch+=action.endsWith('minus')?-1:1;await this.render();return;}
    if(['herb-minus','herb-plus'].includes(action)){this.herbQty+=action.endsWith('minus')?-1:1;await this.render();return;}
    if(['refine-minus','refine-plus'].includes(action)){this.refineQty+=action.endsWith('minus')?-1:1;await this.render();return;}
    try{
      this.busy=true;
      if(action==='brew')await this._doBrew();
      else if(action==='extract')await this._doExtract();
      else if(action==='refine')await this._doRefine();
      else if(action==='gm-save')await this._saveMappings();
      else if(action==='gm-pending')await this.services.pending();
      else if(action?.startsWith('gm-'))await directoryAction(this,action,target);
    }catch(err){console.error('Alchemy Workbench:',err);this.notice={text:err.message||String(err),kind:'warn'};ui.notifications.error(`Alchemy: ${err.message||err}`);}
    finally{this.busy=false;await this.render();}
  }
  async _doBrew(){
    const recipe=this.services.recipes.find(x=>x.id===this.recipeId);
    if(!recipe)throw new Error('Choose an available recipe.');
    const eligibility=this.services.brewingEligibility(this.actor,recipe);
    if(!eligibility.ok)throw new Error(eligibility.errors.join(' '));
    if(!eligibility.eligible.some(x=>x.id===this.brewToolId))throw new Error('Select a permitted brewing kit with proficiency.');
    const map=this.services.mappings(),plan=planBrew(this.actor,recipe,this.batch,map,this.selectedIds,this.change);
    const rarity=recipeTier(recipe);
    const confirmation=await foundry.applications.api.DialogV2.confirm({
      window:{title:'Confirm Alchemical Brewing'},
      content:`<div class="awb-confirm"><h2>${esc(recipe.name)} ×${this.batch}</h2><p>Intelligence (${esc(brewToolLabel(this.brewToolId))}) · DC ${recipeDC(recipe,this.services.rules?.())} · ${recipeHours(recipe,this.services.rules?.())} hours</p><p><strong>Ingredients:</strong> ${esc(plan.consume.map(x=>`${this.actor.items.get(x.id)?.name} ×${x.quantity}`).join(', '))}</p><p><strong>Returned change:</strong> ${esc(fmt(Object.entries(plan.return).map(([id,quantity])=>({id,quantity}))))}</p><p>Failure may consume the ingredients without producing potions.</p></div>`,
      yes:{label:'Roll & Brew'},no:{label:'Cancel'},rejectClose:false
    });
    if(!confirmation)return;
    const answer=await this.services.submit({mode:'brew',actorId:this.actor.id,recipeId:recipe.id,batch:this.batch,selectedIds:this.selectedIds??this._inventory().map(x=>x.id),change:this.change,toolId:this.brewToolId});
    this.notice={text:answer||'Brewing resolved. Review the chat log for dice and result details.',kind:'good'};
  }
  async _doExtract(){
    const selected=this._herbs().find(x=>x.item.id===this.selectedHerbId);
    if(!selected||!selected.herb.reagents.includes(this.herbKey))throw new Error('Select a recognised herb and reagent property.');
    const answer=await this.services.submit({mode:'extract',actorId:this.actor.id,herbId:selected.herb.id,itemId:selected.item.id,reagentKey:this.herbKey,quantity:this.herbQty});
    this.notice={text:answer||'Reagents prepared.',kind:'good'};
  }
  async _doRefine(){
    const selected=this._inventory().find(x=>x.id===this.selectedRefineId);
    if(!selected||!availableRefinementTargets(selected.key).includes(this.refineTier))throw new Error('Only lower tiers are valid refinement targets.');
    const answer=await this.services.submit({mode:'refine',actorId:this.actor.id,itemId:selected.id,targetTier:this.refineTier,quantity:this.refineQty});
    this.notice={text:answer||'Reagents refined.',kind:'good'};
  }
  async _saveMappings(){
    if(!game.user.isGM)throw new Error('GM privileges required.');
    if(!['reagents','outputs'].includes(this.gmKind))throw new Error('This catalogue is maintained from the selected Item directories.');
    this.mappingDraft??=structuredClone(this.services.mappings());
    for(const input of this.element.querySelectorAll('[data-mapping]'))this.mappingDraft[this.gmKind][input.dataset.mapping]=input.value.trim();
    const count=await this.services.saveMappings(this.gmKind,this.mappingDraft[this.gmKind]);
    this.mappingDraft=structuredClone(this.services.mappings());
    this.notice={text:`Saved ${count} ${this.gmKind} mappings. Inventory copies will match by source or template identity.`,kind:'good'};
  }
  _dragOver(event){if(event.target.closest?.('[data-drop-map],[data-recipe-drop]'))event.preventDefault();}
  async _drop(event){
    if(event.target.closest?.('[data-recipe-drop]')){
      try{await recipeEditorDrop(this,event);await this.render();}
      catch(err){this.notice={text:err.message||String(err),kind:'warn'};ui.notifications.error('Alchemy recipe drop: '+(err.message||err));await this.render();}
      return;
    }
    const zone=event.target.closest?.('[data-drop-map]');if(!zone||!game.user.isGM)return;
    event.preventDefault();
    try{
      const raw=event.dataTransfer.getData('text/plain');const data=JSON.parse(raw);
      const uuid=data.uuid||(data.type==='Item'&&data.id?`Item.${data.id}`:null);
      const doc=uuid?await fromUuid(uuid):null;
      if(doc?.documentName!=='Item')throw new Error('Drop an Item from the Foundry sidebar.');
      this.mappingDraft??=structuredClone(this.services.mappings());
      this.mappingDraft[this.gmKind]??={};
      this.mappingDraft[this.gmKind][zone.dataset.dropMap]=uuid;
      await this.render();
    }catch(err){ui.notifications.warn(`Alchemy mapping: ${err.message}`);}
  }
}
