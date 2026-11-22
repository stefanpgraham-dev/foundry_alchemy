import assert from 'node:assert/strict';
import {folderItems,descriptionLinks,reagentKeyFromName,scanDirectories} from '../scripts/directories.mjs';

const item=(id,name,folder,description='',rarity='common')=>({
 id,uuid:'Item.'+id,name,img:'icons/svg/item-bag.svg',folder:{id:folder},
 system:{rarity,description:{value:description}}
});
const folders=[
 {id:'herbs',name:'Herbs',type:'Item',folder:null},
 {id:'grassland',name:'Grassland',type:'Item',folder:{id:'herbs'}},
 {id:'reagents',name:'Reagents',type:'Item',folder:null},
 {id:'notes',name:'Notes',type:'JournalEntry',folder:null}
];
const materials=[
 item('rc','Rare Curative Reagent','reagents'),
 item('rr','Rare Reactive Reagent','reagents'),
 item('cp','Common Poisonous Reagent','reagents')
];
const earthtongue=item('earth','Earthtongue','grassland',
 '<p>Earthtongue grows low to the ground.</p><p>@UUID[Item.rc]{Rare Curative Reagent}</p><p>@UUID[Item.rr]{Rare Reactive Reagent}</p>','rare');
const thorn=item('thorn','Thornleaf','herbs',
 '<p><a class="content-link" draggable="true" data-uuid="Item.cp"><i class="fas fa-suitcase"></i>Common Poisonous Reagent</a></p>','common');
const broken=item('broken','Brokenleaf','grassland','<p>@UUID[Item.missing]{Rare Reactive Reagent}</p>','rare');
const plain=item('plain','Not a link','grassland','<p>Common Curative Reagent</p>','common');
const world={folders:{contents:folders},items:{contents:[...materials,earthtongue,thorn,broken,plain]}};
const config={herbFolderId:'herbs',reagentFolderId:'reagents',includeSubfolders:true};
assert.equal(reagentKeyFromName('Rare Reactive Reagent'),'rare_reactive');
assert.equal(reagentKeyFromName('Reactive herb'),null);
assert.equal(folderItems(world,'herbs',false).length,1);
assert.equal(folderItems(world,'herbs',true).length,4);
assert.deepEqual(descriptionLinks(earthtongue.system.description.value).map(x=>x.uuid),['Item.rc','Item.rr']);
assert.deepEqual(descriptionLinks(thorn.system.description.value).map(x=>x.uuid),['Item.cp']);
const scan=scanDirectories(world,config,{herbs:[],mappings:{reagents:{}}});
assert.equal(scan.report.herbItems,4);
assert.equal(scan.report.reagentItems,3);
assert.equal(scan.report.validHerbs,2);
assert.equal(scan.report.mappedReagents,3);
assert.equal(scan.herbs.length,2);
assert.deepEqual(scan.herbs.find(x=>x.name==='Earthtongue').reagents,['rare_curative','rare_reactive']);
assert.equal(scan.herbMappings['world-earth'],'Item.earth');
assert.equal(scan.herbs.find(x=>x.name==='Earthtongue').rarity,'rare');
assert(scan.report.issues.some(x=>x.name==='Brokenleaf' && /broken|unmapped/i.test(x.problem)));
assert(scan.report.issues.some(x=>x.name==='Not a link' && /No linked reagent/i.test(x.problem)));
assert.equal(scan.report.added.length,2);
const previous={herbs:scan.herbs,mappings:{reagents:scan.reagentMappings}};
const rerun=scanDirectories(world,config,previous);
assert.equal(rerun.report.added.length,0);
assert.equal(rerun.report.removed.length,0);
assert.equal(rerun.report.changed.length,0);
// Missing or altered property links are reported; the old item is no longer craftable.
earthtongue.system.description.value='<p>@UUID[Item.cp]{Common Poisonous Reagent}</p>';
const changed=scanDirectories(world,config,previous);
assert.equal(changed.report.changed.length,1);
assert.deepEqual(changed.herbs.find(x=>x.name==='Earthtongue').reagents,['common_poisonous']);
// Duplicated classifications must not be selected arbitrarily.
world.items.contents.push(item('rr2','Rare Reactive Reagent','reagents'));
const duplicate=scanDirectories(world,config,previous);
assert(duplicate.report.issues.some(x=>/Multiple reagent Items/.test(x.problem)));
assert.equal(duplicate.reagentMappings.rare_reactive,'Item.rr','prior authoritative mapping should prevail');
// If a herb's only linked reagent cannot be resolved, it must not appear.
world.items.contents=world.items.contents.filter(x=>x.id!=='cp');
const missing=scanDirectories(world,config,previous);
assert(!missing.herbs.some(x=>x.name==='Thornleaf'));
assert(missing.report.removed.includes('Thornleaf'));
console.log('Directory discovery, links, change detection and validation passed.');
