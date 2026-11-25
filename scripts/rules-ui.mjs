/* GM rules editor — the complete world brewing policy, with validated save/reset. */
import {defaultRules,validateRules,rulesClone} from './rules.mjs';
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const tiers=['common','rare','exotic'];
const opt=(value,text,selected)=>'<option value="'+value+'" '+(String(value)===String(selected)?'selected':'')+'>'+text+'</option>';
const dice=[4,6,8,10,12,20,40];
const numbers=(field,value,{min=0,max=100,step=1}={})=>
 '<input type="number" data-rule-field="'+field+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+esc(value)+'" inputmode="decimal">';
const selects=(field,value,options)=>
 '<select data-rule-field="'+field+'">'+options.map(([v,label])=>opt(v,label,value)).join('')+'</select>';
const field=(name,helper,control)=>'<label class="awb-rule-field"><span><strong>'+name+'</strong><small>'+helper+'</small></span>'+control+'</label>';
const sheet=(heading,intro,content)=>'<section class="awb-rule-section"><h3>'+heading+'</h3><p class="awb-muted">'+intro+'</p>'+content+'</section>';
function ensure(app){
 if(!app.rulesDraft)app.rulesDraft=rulesClone(app.services.rules());
 return app.rulesDraft;
}
export function rulesView(app){
 const r=ensure(app),base=defaultRules();
 const tierTable=tiers.map(tier=>
  '<div class="awb-rule-tier"><strong>'+tier[0].toUpperCase()+tier.slice(1)+'</strong>'+
  numbers('dc.'+tier,r.dc[tier],{min:1,max:40})+
  numbers('hours.'+tier,r.hours[tier],{min:.25,max:72,step:.25})+'</div>').join('');
 const critical=sheet('Critical success',
  'A natural d20 at or above the threshold triggers independent Alchemist’s Supplies follow-up checks. Each successful check can grant bonus potions.',
  '<div class="awb-rule-fields">'+
  field('Natural d20 threshold','20 is the existing rule; 19 grants criticals on 19–20.',numbers('critical.naturalThreshold',r.critical.naturalThreshold,{min:2,max:20}))+
  field('Follow-up checks','0–2 independent native tool checks, not advantage.',numbers('critical.followUps',r.critical.followUps,{min:0,max:2}))+
  field('Bonus die','1d40 is simulated with a d10 and d4 for Dice So Nice.',selects('critical.dieSides',r.critical.dieSides,dice.map(x=>[x,'d'+x])))+
  field('Dice on one passed check','Default 1 bonus die.',numbers('critical.onePassDice',r.critical.onePassDice,{min:0,max:4}))+
  field('Dice on two passed checks','Default 2 bonus dice.',numbers('critical.twoPassDice',r.critical.twoPassDice,{min:0,max:4}))+
  field('Bonus percentage per die point','Default 10%; integer extra potions plus d100 for remainder.',numbers('critical.percentPerPoint',r.critical.percentPerPoint,{min:1,max:25}))+
  '</div>');
 const failure=sheet('Failed brewing',
  'After an unsuccessful first check, the system makes independent follow-up checks. The outcome depends on how many pass.',
  '<div class="awb-rule-fields">'+
  field('Follow-up checks','0–2 rolls. Zero passes uses the fixed yield setting below.',numbers('failure.followUps',r.failure.followUps,{min:0,max:2}))+
  field('Yield if no checks pass','0% consumes reagents and awards nothing (existing rule); otherwise roll d100 for fractional yield.',numbers('failure.zeroPassPercent',r.failure.zeroPassPercent,{min:0,max:100}))+
  field('Partial yield die','Existing rule is 1d8 × 10%.',selects('failure.partialDieSides',r.failure.partialDieSides,dice.map(x=>[x,'d'+x])))+
  field('Yield percentage per die point','Applied when exactly one follow-up succeeds or immediate completion is chosen.',numbers('failure.partialPercentPerPoint',r.failure.partialPercentPerPoint,{min:1,max:25}))+
  field('Two-pass outcome','Choose whether the player decides, or enforce one resolution for the world.',
   selects('failure.twoPassMode',r.failure.twoPassMode,[['choice','Player chooses'],['extra','Full yield after extra time'],['immediate','Immediate partial yield']]))+
  field('Additional time for full yield','Percent of the original brewing time; default +50%.',numbers('failure.extraTimePercent',r.failure.extraTimePercent,{min:0,max:300}))+
  '</div>');
 return '<div class="awb-rules"><div class="awb-rule-heading"><div><h2>Brewing rules</h2>'+
  '<p class="awb-muted">World-wide rules. Every change affects future brewing attempts; pending batches retain their original reward and time.</p></div>'+
  '<div class="awb-rule-toolbar"><button type="button" class="awb-primary" data-action="gm-rules-save">Save rules</button>'+
  '<button type="button" data-action="gm-rules-reset">Restore default rules</button></div></div>'+
  sheet('Difficulty and brewing time','The highest ingredient tier selects this DC and duration. Individual recipes can override either.',
    '<div class="awb-rule-tiers"><div class="awb-rule-tier awb-rule-tier-header"><span>Tier</span><span>DC</span><span>Hours</span></div>'+tierTable+'</div>'+
    '<div class="awb-rule-fields">'+field('Maximum batch size','Maximum 100. Every batch still makes one brewing check and takes the same time as a single potion.',numbers('maxBatch',r.maxBatch,{min:1,max:100}))+'</div>')+
  '<div class="awb-rules-grid">'+critical+failure+'</div>'+
  sheet('Fixed crafting fundamentals','These are intentionally not toggles: modifying them requires changes to the item economy and check pipeline, not just configuration.',
    '<div class="awb-rule-static"><p><strong>Tool check:</strong> Intelligence + Alchemist’s Supplies, requiring both tools and proficiency (or expertise).</p>'+
    '<p><strong>Dice:</strong> Initial and follow-up d20s use native D&D 5e checks. Bonus, partial and percentile rolls appear in Foundry chat / Dice So Nice.</p>'+
    '<p><strong>Herb extraction:</strong> 1 herb → 1 chosen reagent; no check.</p>'+
    '<p><strong>Reagent value:</strong> Common 1, Rare 3, Exotic 9; downgrades only, with unspent change returned. No check.</p>'+
    '<p><strong>Timing:</strong> GM manages elapsed time; extra-time jobs are completed by GM action. No automatic calendar advancement.</p></div>')+
  '<p class="awb-muted">Defaults: '+tiers.map(t=>t+': DC '+base.dc[t]+', '+base.hours[t]+' h').join(' · ')+
   '. No settings are applied until Save rules.</p></div>';
}
export function rulesEditorInput(app,event){
 const el=event.target;
 if(!el.matches?.('[data-rule-field]'))return false;
 const draft=ensure(app),path=el.dataset.ruleField.split('.');
 let node=draft;
 while(path.length>1)node=node[path.shift()];
 const key=path[0];
 node[key]=el.tagName==='SELECT'&&key==='twoPassMode'?el.value:Number(el.value);
 app.rulesDirty=true;
 return true;
}
export async function rulesEditorAction(app,action){
 if(!game.user?.isGM)throw Error('GM privileges required.');
 if(action==='gm-rules-save'){
  const valid=validateRules(ensure(app));
  await app.services.saveRules(valid);
  app.rulesDraft=rulesClone(valid);app.rulesDirty=false;
  app.notice={text:'World brewing rules saved and applied to future attempts.',kind:'good'};
  return true;
 }
 if(action==='gm-rules-reset'){
  const confirm=await foundry.applications.api.DialogV2.confirm({
   window:{title:'Restore Alchemy Rules'},
   content:'Restore all global DCs, brewing times, critical and failure mechanics, and batch-size limit to their original defaults? Individual recipe ingredient formulas and overrides are preserved.',
   yes:{label:'Restore defaults'},no:{label:'Cancel'},rejectClose:false
  });
  if(confirm){
   const restored=defaultRules();
   await app.services.saveRules(restored);
   app.rulesDraft=rulesClone(restored);app.rulesDirty=false;
   app.notice={text:'Default global brewing rules restored.',kind:'good'};
  }
  return true;
 }
 return false;
}
