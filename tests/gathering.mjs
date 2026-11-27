import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BIOMES,REAGENTS,linkBiomeRegistry,biomeCoverage,biomeTable,
 weightedPick,gatherYield,validateGatherConfig,registryDiscrepancies} from '../scripts/gathering.mjs';
import {defaultRules,validateRules} from '../scripts/rules.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const registry=JSON.parse(fs.readFileSync(path.join(root,'data/herb-registry.json'),'utf8'));
assert.equal(registry.herbs.length,66);
assert.equal(registry.herbs.filter(h=>!h.new).length,43,'Notion baseline unchanged');
assert.equal(registry.herbs.filter(h=>h.new).length,23,'new region-specific herbs');
assert.deepEqual([...registry.biomes].sort(),[...BIOMES].sort());
assert.equal(new Set(registry.herbs.map(h=>h.name.toLowerCase())).size,66);
for(const h of registry.herbs){
 assert(h.name&&h.biomes.length&&h.reagents.length);
 assert(['common','rare','exotic'].includes(h.rarity));
 assert(h.reagents.every(key=>REAGENTS.includes(key)),h.name+' needs known reagents');
 if(h.new){
  assert.equal(h.biomes.length,1,'new herbs remain biome-specific');
  assert(h.description.length>=60,'new plants have real flavour descriptions');
  assert(h.img?.endsWith('.svg'));
  const target=path.join(root,h.img.replace('modules/alchemy-workbench/',''));
  assert(fs.existsSync(target),'missing illustration for '+h.name+': '+target);
  assert(fs.readFileSync(target,'utf8').includes('<svg'));
 }else assert(h.notionUrl.startsWith('https://'),'existing Notion source preserved');
}
// Simulate the linked 66 World/compendium Items and ensure every category is
// represented in every environment without reassigning original 43 herbs.
const scanned=registry.herbs.map((h,i)=>({
 id:'herb'+i,name:h.name,sourceUuid:'Item.herb'+i,
 rarity:h.rarity,reagents:h.reagents,img:h.img||'',biomes:[],gatherWeight:1
}));
const catalog=linkBiomeRegistry(scanned,registry);
assert.equal(catalog.length,66);
for(const biome of BIOMES){
 const coverage=biomeCoverage(catalog,biome);
 assert.equal(coverage.available.length,9,biome+' missing category '+coverage.missing.join(','));
 const table=biomeTable(catalog,biome,{common:60,rare:30,exotic:10});
 assert(table.length>0,biome+' table must contain mapped Items');
 assert(Math.abs(table.reduce((sum,entry)=>sum+entry.probability,0)-100)<1e-7);
 assert(table.every(row=>row.herb.sourceUuid&&row.probability>0));
 assert(BIOMES.includes(weightedPick(table,1).herb.biomes[0]));
 assert(BIOMES.includes(weightedPick(table,10000).herb.biomes[0]));
}
assert.equal(gatherYield(14,15),0);
assert.equal(gatherYield(15,15),1);
assert.equal(gatherYield(19,15),1);
assert.equal(gatherYield(20,15),2);
assert.equal(gatherYield(24,15),2);
assert.equal(gatherYield(25,15),3);
assert.equal(gatherYield(30,15,{plusFive:3,plusTen:7,yield2:2,yield3:4}),4);
assert.throws(()=>weightedPick([],1),/No source-linked/);
assert.throws(()=>weightedPick([],10001),/1–10000/);
const none=linkBiomeRegistry([],registry);
assert.deepEqual(biomeTable(none,'Tundra'),[]);
assert.equal(biomeCoverage(none,'Tundra').available.length,0,
 'unimported definitions must not be selectable or awarded');

const first=catalog.find(h=>h.name==='Rimeberry');
const overrides=validateGatherConfig({biomeDC:{Tundra:19},herbs:{
 [first.sourceUuid]:{weight:0}
}});
assert.equal(overrides.biomeDC.Tundra,19);
const customized=linkBiomeRegistry(scanned,registry,overrides.herbs);
assert(!biomeTable(customized,'Tundra').some(x=>x.herb.name==='Rimeberry'));
assert.throws(()=>validateGatherConfig({biomeDC:{Tundra:41}}),/1–40/);
assert.throws(()=>validateGatherConfig({herbs:{'nonsense':{weight:5}}}),/UUID/);
assert.throws(()=>validateGatherConfig({herbs:{'Item.one':{weight:101}}}),/0 to 100/);
assert.equal(defaultRules().gathering.dc,15);
assert.deepEqual(defaultRules().gathering.tierWeights,{common:60,rare:30,exotic:10});
assert.equal(validateRules({}).gathering.plusFive,5);
assert.equal(validateRules({}).gathering.plusTen,10);
assert.throws(()=>validateRules({gathering:{plusFive:10,plusTen:5}}),/exceed/);
assert.throws(()=>validateRules({gathering:{tierWeights:{common:0,rare:0,exotic:0}}}),/positive/);
const discrepancies=registryDiscrepancies(catalog);
assert.equal(discrepancies.length,0,'exact source definitions match the Notion registry');
const anomalies=registry.herbs.filter(h=>h.reagents.some(k=>!k.startsWith(h.rarity+'_')));
assert.equal(anomalies.length,3,'three existing Notion herb/reagent tier conflicts remain visible');
assert(anomalies.every(x=>['Canopy Thistle','Cinderstem','Ironshroud Mold'].includes(x.name)));
const moduleText=fs.readFileSync(path.join(root,'scripts/module.mjs'),'utf8');
assert(moduleText.includes("mode:'gather'" )===false || moduleText.includes("p.mode==='gather'"), 'mode wired');
assert(moduleText.includes("p.mode==='gather'"),'GM-authoritative gathering transaction wired');
assert(moduleText.includes('applyInventory(actor,[],outputs,map)'),'gathered Items awarded via inventory transaction');
console.log('Biome coverage (10×9), 43 Notion items, 23 new illustrations, weights, overrides and DC +5/+10 gathering passed.');
