import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {allowedActor,macroActors,preferredMacroActor,resolveRequestedActor} from '../scripts/actor-selection.mjs';

const gm={id:'gm',isGM:true};
const player={id:'player',isGM:false};
const make=(id,type,name,owner=true)=>({
 id,type,name,documentName:'Actor',isToken:false,
 testUserPermission:(_user,perm)=>perm==='OWNER'&&owner
});
const pcA=make('pc-a','character','Alira',true);
const pcB=make('pc-b','character','Zana',true);
const pcUnowned=make('pc-c','character','Sister Divinia',false);
const npc=make('npc','npc','Gravicius',true);
const vehicle=make('vehicle','vehicle','Cart',true);
const all=[npc,pcB,vehicle,pcUnowned,pcA];
const world=new Map(all.map(x=>[x.id,x]));

assert.deepEqual(macroActors(all,gm).map(x=>x.id),['pc-a','pc-c','pc-b'],
 'GM macro must show only character actors, sorted by name');
assert.deepEqual(macroActors(all,player).map(x=>x.id),['pc-a','npc','pc-b','vehicle'],
 'Non-GM actor permissions/selection remain unchanged');
assert.equal(allowedActor(npc,gm),true,'GM may deliberately open an NPC sheet');
assert.equal(allowedActor(pcUnowned,player),false,'players cannot bypass ownership');
assert.equal(allowedActor(pcA,player),true);

const choices=macroActors(all,gm);
assert.equal(preferredMacroActor(choices,{
 controlled:[{actor:npc},{actor:pcB}],character:pcA
}),pcB,'controlled PCs preferred but selected NPC ignored by GM macro');
assert.equal(preferredMacroActor(choices,{
 controlled:[{actor:npc}],character:pcA
}),pcA,'selected NPC does not override preferred PC');
assert.equal(preferredMacroActor(choices,{
 controlled:[{actor:npc}],character:null
}),null,'NPC selection does not auto-select NPC');
assert.equal(preferredMacroActor(choices,{
 controlled:[],character:null
}),null,'multiple PCs should show the picker');

assert.equal(resolveRequestedActor({actor:npc},world,gm),npc,
 'actor-sheet route explicitly permits a GM to craft on an NPC');
assert.equal(resolveRequestedActor({actor:pcA},world,gm),pcA);
assert.equal(resolveRequestedActor({actorId:'npc'},world,gm),npc,
 'API accepts a specific World Actor ID');
assert.equal(resolveRequestedActor({actor:pcA},world,player),pcA);
assert.throws(()=>resolveRequestedActor({actor:pcUnowned},world,player),/permission/);
assert.throws(()=>resolveRequestedActor({actorId:'missing'},world,gm),/not available/);
assert.throws(()=>resolveRequestedActor({actor:vehicle},new Map(),gm),/not a World Actor/);
assert.throws(()=>resolveRequestedActor({
 actor:{...npc,isToken:true}
},world,gm),/not a World Actor/,
 'Unlinked-token sheets must not silently craft into base NPC inventory');
assert.equal(resolveRequestedActor({},world,gm),null);
assert.deepEqual(macroActors([npc,vehicle],gm),[],
 'Worlds without PCs have no eligible GM macro crafting actor');

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=readFileSync(path.join(root,'scripts/module.mjs'),'utf8');
assert.match(source,/void hub\(\{actor\}\)/,
 'Foundry actor-sheet header must pass its exact Actor into the workbench');
assert.match(source,/const possible=macroChoices\(\)/,
 'Macro selection must use PC-filtered actors, not all owned actors');
assert.match(source,/resolveRequestedActor\(\{actor:explicitActor,actorId\},game\.actors,game\.user\)/,
 'Workbench must validate explicit selection before opening');
assert.match(source,/tab==='gm'&&!macroChoices\(\)\.length/,
 'GM setup remains accessible when there are no PC actors');
console.log('GM macro PC filtering, sheet context, ownership and empty-world regression tests passed.');
