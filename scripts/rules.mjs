/* World-scoped alchemy rules. Pure validation, defaults and yield rules.
 * Old worlds adopt this configuration unchanged until the GM saves overrides. */
export const defaultRules=()=>({
 schema:1,
 dc:{common:10,rare:12,exotic:14},
 hours:{common:2,rare:4,exotic:6},
 maxBatch:100,
 gathering:{
  dc:15,plusFive:5,plusTen:10,yield2:2,yield3:3,
  tierWeights:{common:60,rare:30,exotic:10}
 },
 critical:{
  naturalThreshold:20,
  followUps:2,
  dieSides:40,
  onePassDice:1,
  twoPassDice:2,
  percentPerPoint:10
 },
 failure:{
  followUps:2,
  zeroPassPercent:0,
  partialDieSides:8,
  partialPercentPerPoint:10,
  twoPassMode:'choice',
  extraTimePercent:50
 }
});
const pureCopy=v=>JSON.parse(JSON.stringify(v));
const integer=(value,name,low,high)=>{
 const number=Number(value);
 if(!Number.isSafeInteger(number)||number<low||number>high)throw Error(name+' must be a whole number from '+low+' to '+high+'.');
 return number;
};
const quarterHours=(value,name)=>{
 const n=Number(value);
 if(!Number.isFinite(n)||n<0.25||n>72||Math.round(n*4)!==n*4)throw Error(name+' must be 0.25–72 hours in quarter-hour increments.');
 return n;
};
const die=(value,name,valid)=>{
 const n=Number(value);
 if(!valid.includes(n))throw Error(name+' must be one of: '+valid.join(', ')+'.');
 return n;
};
const DIE_OPTIONS=[4,6,8,10,12,20,40];
/** Normalise old/partially configured worlds without mutating stored settings.
 * On save strict validation rejects malformed values rather than silently losing edits. */
export function validateRules(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Rules must be a configuration object.');
 const d=defaultRules();
 const dc=input.dc??d.dc,hours=input.hours??d.hours;
 const c=input.critical??d.critical,f=input.failure??d.failure,g=input.gathering??d.gathering;
 const checked={
  schema:1,dc:{},hours:{},
  maxBatch:integer(input.maxBatch??d.maxBatch,'Maximum batch',1,100),
  gathering:{
   dc:integer(g.dc??d.gathering.dc,'Herb gathering DC',1,40),
   plusFive:integer(g.plusFive??d.gathering.plusFive,'Second herb margin',1,20),
   plusTen:integer(g.plusTen??d.gathering.plusTen,'Third herb margin',2,30),
   yield2:integer(g.yield2??d.gathering.yield2,'Second herb yield',1,10),
   yield3:integer(g.yield3??d.gathering.yield3,'Third herb yield',1,10),
   tierWeights:Object.fromEntries(['common','rare','exotic'].map(t=>[
    t,integer(g.tierWeights?.[t]??d.gathering.tierWeights[t],t+' gathering weight',0,100)]))
  },
  critical:{
   naturalThreshold:integer(c.naturalThreshold??d.critical.naturalThreshold,'Critical natural d20 threshold',2,20),
   followUps:integer(c.followUps??d.critical.followUps,'Critical follow-up checks',0,2),
   dieSides:die(c.dieSides??d.critical.dieSides,'Critical bonus die',DIE_OPTIONS),
   onePassDice:integer(c.onePassDice??d.critical.onePassDice,'Critical dice for one pass',0,4),
   twoPassDice:integer(c.twoPassDice??d.critical.twoPassDice,'Critical dice for two passes',0,4),
   percentPerPoint:integer(c.percentPerPoint??d.critical.percentPerPoint,'Critical percent per die point',1,25)
  },
  failure:{
   followUps:integer(f.followUps??d.failure.followUps,'Failure follow-up checks',0,2),
   zeroPassPercent:integer(f.zeroPassPercent??d.failure.zeroPassPercent,'No-pass yield percent',0,100),
   partialDieSides:die(f.partialDieSides??d.failure.partialDieSides,'Partial yield die',DIE_OPTIONS),
   partialPercentPerPoint:integer(f.partialPercentPerPoint??d.failure.partialPercentPerPoint,'Partial yield percent per die point',1,25),
   twoPassMode:['choice','extra','immediate'].includes(f.twoPassMode??d.failure.twoPassMode)?
    (f.twoPassMode??d.failure.twoPassMode):null,
   extraTimePercent:integer(f.extraTimePercent??d.failure.extraTimePercent,'Extra brewing time percent',0,300)
  }
 };
 if(!checked.failure.twoPassMode)throw Error('Both-success failure outcome must be player choice, extra time or immediate yield.');
 if(checked.gathering.plusTen<=checked.gathering.plusFive)
  throw Error('Third herb margin must exceed second herb margin.');
 if(checked.gathering.yield3<checked.gathering.yield2)
  throw Error('Higher gathering margin must not award fewer herbs.');
 if(!Object.values(checked.gathering.tierWeights).some(x=>x>0))
  throw Error('At least one gathering rarity weight must be positive.');
 for(const tier of ['common','rare','exotic']){
  checked.dc[tier]=integer(dc[tier]??d.dc[tier],tier+' brewing DC',1,40);
  checked.hours[tier]=quarterHours(hours[tier]??d.hours[tier],tier+' brewing time');
 }
 if(checked.critical.dieSides*checked.critical.twoPassDice*checked.critical.percentPerPoint>10000||
    checked.critical.dieSides*checked.critical.onePassDice*checked.critical.percentPerPoint>10000)throw Error('Critical bonus cannot exceed 10,000%.');
 return checked;
}
export const rulesClone=rules=>pureCopy(validateRules(rules||defaultRules()));
export function criticalDiceCount(passes,rules){
 const c=validateRules(rules).critical;
 return passes>=2?c.twoPassDice:passes===1?c.onePassDice:0;
}
export function partialPercent(dieTotal,rules){
 const f=validateRules(rules).failure;
 return integer(dieTotal,'Partial roll',1,f.partialDieSides)*f.partialPercentPerPoint;
}
/** Dice So Nice renders virtual d40 as a d10 and a d4. */
export function bonusRollFormula(sides,count){
 const n=integer(count,'Bonus dice count',0,4),size=die(sides,'Bonus die',DIE_OPTIONS);
 if(!n)return null;
 const term=size===40?'((1d10-1)*4+1d4)':'1d'+size;
 return Array.from({length:n},()=>term).join(' + ');
}
export function partialRollFormula(sides){
 return bonusRollFormula(sides,1);
}
export function extraTimeHours(base,rules){
 return Number((Number(base)*validateRules(rules).failure.extraTimePercent/100).toFixed(4));
}
