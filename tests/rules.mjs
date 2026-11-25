import assert from 'node:assert/strict';
import {defaultRules,validateRules,criticalDiceCount,partialPercent,bonusRollFormula,partialRollFormula,extraTimeHours,rulesClone} from '../scripts/rules.mjs';
import {recipeDC,recipeHours,recipeTest} from '../scripts/recipes.mjs';
import {percentageYield,maximumCraftableBatch} from '../scripts/engine.mjs';
const defaults=defaultRules();
assert.deepEqual(validateRules(defaults),defaults,'all original mechanics are the defaults');
assert.deepEqual(validateRules({}),defaults,'old worlds with no settings use original rules');
assert.equal(defaults.critical.naturalThreshold,20);
assert.equal(defaults.critical.followUps,2);
assert.equal(defaults.failure.followUps,2);
assert.equal(defaults.failure.zeroPassPercent,0);
assert.equal(defaults.failure.twoPassMode,'choice');
assert.equal(defaults.failure.partialDieSides,8);
assert.equal(defaults.critical.dieSides,40);
assert.equal(defaults.maxBatch,100);
assert.equal(defaults.failure.extraTimePercent,50);
const copy=rulesClone(defaults);copy.dc.common=16;
assert.equal(defaults.dc.common,10,'clone never changes original defaults');
const recipe={id:'sample',name:'Sample',cost:{rare_curative:1},dcOverride:null,hoursOverride:null};
assert.equal(recipeDC(recipe,defaults),12);
assert.equal(recipeHours(recipe,defaults),4);
const custom=validateRules({
 ...defaults,dc:{common:11,rare:15,exotic:20},hours:{common:1.5,rare:3.25,exotic:9},
 maxBatch:7,critical:{...defaults.critical,naturalThreshold:19,followUps:1,dieSides:20,onePassDice:2,twoPassDice:3,percentPerPoint:15},
 failure:{...defaults.failure,followUps:1,zeroPassPercent:30,partialDieSides:12,partialPercentPerPoint:20,twoPassMode:'immediate',extraTimePercent:75}
});
assert.equal(recipeDC(recipe,custom),15);
assert.equal(recipeHours(recipe,custom),3.25);
assert.equal(recipeDC({...recipe,dcOverride:17},custom),17,'recipe DC override wins');
assert.equal(recipeHours({...recipe,hoursOverride:2},custom),2,'recipe time override wins');
assert.equal(extraTimeHours(3.25,custom),2.4375);
assert.equal(criticalDiceCount(0,custom),0);
assert.equal(criticalDiceCount(1,custom),2);
assert.equal(criticalDiceCount(2,custom),3);
assert.equal(partialPercent(10,custom),200);
assert.equal(bonusRollFormula(40,2),'((1d10-1)*4+1d4) + ((1d10-1)*4+1d4)');
assert.equal(bonusRollFormula(12,3),'1d12 + 1d12 + 1d12');
assert.equal(partialRollFormula(8),'1d8');
assert.equal(partialRollFormula(40),'((1d10-1)*4+1d4)');
assert.equal(bonusRollFormula(40,0),null);
assert.equal(percentageYield(100,1600).guaranteed,1600,'multiple integer bonuses remain allowed');
assert.equal(percentageYield(7,135).fractional,45);
const inventory=[{id:'r',key:'rare_curative',quantity:10}];
const test=recipeTest(recipe,3,inventory,custom);
assert.equal(test.dc,15);
assert.equal(test.hours,3.25);
assert.equal(test.maximumCraftable,7);
assert.throws(()=>recipeTest(recipe,8,inventory,custom),/1–7/);
assert.equal(maximumCraftableBatch(recipe,inventory,custom.maxBatch),7);
const bad=[
 [{maxBatch:101},/Maximum batch/],
 [{dc:{common:0}},/common brewing DC/],
 [{hours:{rare:1.3}},/quarter-hour/],
 [{critical:{naturalThreshold:21}},/Critical natural/],
 [{critical:{followUps:3}},/Critical follow-up/],
 [{critical:{dieSides:17}},/Critical bonus die/],
 [{critical:{onePassDice:-1}},/Critical dice/],
 [{failure:{followUps:3}},/Failure follow-up/],
 [{failure:{zeroPassPercent:-1}},/No-pass/],
 [{failure:{partialPercentPerPoint:0}},/Partial yield/],
 [{failure:{twoPassMode:'skip'}},/Both-success/],
 [{failure:{extraTimePercent:301}},/Extra brewing/]
];
for(const [partial,error] of bad)assert.throws(()=>validateRules({...defaults,...partial}),error);
assert.throws(()=>validateRules(null),/configuration object/);
assert.deepEqual(validateRules({dc:{common:13}}).hours,defaults.hours);
console.log('Global brewing defaults, overrides, configurable dice/yields, batch cap and validation passed.');
