/** D&D 5e tool prerequisites and native Intelligence tool checks. */
import {BREW_TOOLS,BREW_TOOL_IDS,brewToolLabel,brewingToolsForRecipe} from './recipe-tools.mjs';

export const ALCHEMIST_TOOL_ID='alchemist';
export const ALCHEMIST_SOURCE_UUID='Compendium.dnd5e.equipment24.Item.phbtulAlchemists';
export const TOOL_SOURCES=Object.freeze({
 alchemist:ALCHEMIST_SOURCE_UUID,
 herb:'Compendium.dnd5e.equipment24.Item.phbtulHerbalismK',
 pois:'Compendium.dnd5e.equipment24.Item.phbtulPoisonersK'
});
const names=Object.freeze({
 alchemist:['alchemistssupplies','alchemistsupplies','alchemistskit'],
 herb:['herbalismkit','herbalistskit','herbalismtools'],
 pois:['poisonerskit','poisonerkit','poisonerssupplies']
});
const aliases=Object.freeze({alchemist:['alchemist'],herb:['herb','herbalism'],pois:['pois','poisoner']});
const normalize=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const quantity=item=>Math.max(0,Math.floor(Number(item?.system?.quantity??1)));
const toolType=item=>[item?.system?.type?.baseItem,item?.system?.type?.value,
 item?.system?.type?.subtype,item?.system?.toolType,item?.system?.baseItem]
 .filter(x=>typeof x==='string').map(normalize);
const sourceIds=item=>[item?.flags?.core?.sourceId,item?._stats?.compendiumSource,
 item?.flags?.['alchemy-workbench']?.sourceUuid,item?.system?.source?.uuid]
 .filter(x=>typeof x==='string');
export function isBrewingToolItem(item,toolId){
 if(!BREW_TOOL_IDS.includes(toolId)||!item||quantity(item)<1)return false;
 const itemToolTypes=toolType(item);
 if(item.type==='tool'&&itemToolTypes.some(t=>aliases[toolId].includes(t)))return true;
 if(sourceIds(item).includes(TOOL_SOURCES[toolId]))return true;
 // Renamed or custom-world tools remain usable when they have the correct tool type/name.
 const name=normalize(item.name);
 return item.type==='tool'&&names[toolId].some(n=>name===n||name.includes(n));
}
export const isAlchemistSupplies=item=>isBrewingToolItem(item,'alchemist');
export const isHerbalismKit=item=>isBrewingToolItem(item,'herb');
export const isPoisonersKit=item=>isBrewingToolItem(item,'pois');

export function hasBrewingToolProficiency(actor,toolId,item){
 if(!BREW_TOOL_IDS.includes(toolId))return false;
 const data=actor?.system?.tools?.[toolId];
 const prof=data?.prof;
 const values=[prof?.multiplier,prof?.value,data?.value,data?.proficiency,
  item?.system?.proficiencyMultiplier,item?.system?.proficient?.multiplier,
  item?.system?.proficient?.value,item?.system?.proficient];
 return Boolean(prof?.hasProficiency||data?.hasProficiency||
  values.some(value=>value===true||(typeof value==='string'&&['proficient','expertise'].includes(value.toLowerCase()))||
   Number.isFinite(Number(value))&&Number(value)>=1));
}
export function brewingEligibility(actor,recipe=null){
 const allowed=brewingToolsForRecipe(recipe||{id:'legacy',brewingTools:['alchemist']});
 const items=Array.from(actor?.items??[]);
 const options=allowed.map(id=>{
  const item=items.find(document=>isBrewingToolItem(document,id))||null;
  const hasProficiency=hasBrewingToolProficiency(actor,id,item);
  return {id,label:brewToolLabel(id),item,hasProficiency,ok:Boolean(item&&hasProficiency)};
 });
 const eligible=options.filter(option=>option.ok);
 const errors=[];
 if(!eligible.length){
  errors.push('Requires a carried, proficient brewing tool: '+allowed.map(brewToolLabel).join(' OR ')+'.');
  for(const option of options){
   if(!option.item)errors.push(option.label+' is missing from inventory.');
   else if(!option.hasProficiency)errors.push('No proficiency with '+option.label+'.');
  }
 }
 if(actor&&typeof actor.rollToolCheck!=='function')errors.push('Native D&D 5e tool checks are unavailable.');
 const ok=Boolean(eligible.length&&!(actor&&typeof actor.rollToolCheck!=='function'));
 return {ok,allowed,options,eligible,item:eligible[0]?.item||null,
  hasProficiency:eligible.length>0,errors};
}
/** A requested tool must be permitted by recipe AND possessed and proficient.
 * The GM revalidates every request before dice or ingredient consumption. */
export function selectBrewingTool(actor,recipe,toolId=null){
 const result=brewingEligibility(actor,recipe);
 if(!result.ok)throw Error(result.errors.join(' '));
 if(toolId!==null&&toolId!==undefined&&toolId!==''&&!result.allowed.includes(toolId))
  throw Error('The selected tool is not permitted by this recipe.');
 const chosen=result.eligible.find(option=>option.id===(toolId||result.eligible[0].id));
 if(!chosen)throw Error('Requires the selected brewing tool and proficiency: '+brewToolLabel(toolId)+'.');
 return chosen;
}
/** Use the native D&D 5e tool pipeline (including item/actor modifiers).
 * Follow-ups remain separate rolls, not advantage. All post to chat / Dice So Nice. */
export async function rollAlchemyToolCheck(actor,dc,{followUp=false,toolId='alchemist',recipe=null}={}){
 const chosen=selectBrewingTool(actor,recipe||{brewingTools:[toolId],id:'legacy'},toolId);
 const config={tool:chosen.id,ability:'int',item:chosen.item,target:dc};
 if(followUp){config.advantage=false;config.disadvantage=false;}
 const rolls=await actor.rollToolCheck(config,{configure:false},{
  create:true,
  data:{flavor:'Alchemy · Intelligence ('+chosen.label+') · DC '+dc+(followUp?' · Follow-up':'')}
 });
 const result=Array.isArray(rolls)?rolls[0]:rolls;
 if(!result||!Number.isFinite(Number(result.total)))
  throw Error(chosen.label+' check was cancelled or did not return a roll.');
 return result;
}
export function naturalD20Result(roll){
 const die=roll?.d20??roll?.dice?.find(d=>Number(d.faces)===20);
 const active=die?.results?.find(r=>r.active!==false&&!r.discarded)
  ??die?.results?.find(r=>r.active!==false)
  ??die?.results?.[0];
 return Number(active?.result??0);
}
