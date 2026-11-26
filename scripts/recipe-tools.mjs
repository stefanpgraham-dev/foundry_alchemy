/* dnd5e CONFIG.DND5E.tools IDs and defaults for the shipped alchemy formulas.
 * An allowed-tools list means EITHER tool is sufficient, never all of them. */
export const BREW_TOOLS=Object.freeze({
 alchemist:{label:"Alchemist's Supplies",display:"Alchemist's Supplies"},
 herb:{label:"Herbalism Kit",display:"Herbalism Kit"},
 pois:{label:"Poisoner's Kit",display:"Poisoner's Kit"}
});
export const BREW_TOOL_IDS=Object.freeze(Object.keys(BREW_TOOLS));
const BOTH=['alchemist','herb'];
const ALCHEMIST=['alchemist'];
const POISON=['pois'];
const TOXIN=['pois','alchemist'];
const ALL=['alchemist','herb','pois'];
const HERBAL=['herb','alchemist'];
const defaults=Object.freeze({
 'potion-of-healing':BOTH,
 'potion-of-greater-healing':BOTH,
 'potion-of-superior-healing':BOTH,
 'potion-of-supreme-healing':BOTH,
 'philtre-of-love':HERBAL,
 'potion-of-poison':TOXIN,
 'potion-of-climbing':BOTH,
 'potion-of-heroism':BOTH,
 'potion-of-invisibility':ALCHEMIST,
 'potion-of-mind-reading':ALCHEMIST,
 'potion-of-water-breathing':BOTH,
 'potion-of-animal-friendship':HERBAL,
 'potion-of-diminution':ALCHEMIST,
 'potion-of-growth':ALCHEMIST,
 'potion-of-gaseous-form':ALCHEMIST,
 'potion-of-acid-resistance':ALCHEMIST,
 'potion-of-cold-resistance':ALCHEMIST,
 'potion-of-fire-resistance':ALCHEMIST,
 'potion-of-force-resistance':ALCHEMIST,
 'potion-of-lightning-resistance':ALCHEMIST,
 'potion-of-necrotic-resistance':ALCHEMIST,
 'potion-of-poison-resistance':BOTH,
 'potion-of-psychic-resistance':ALCHEMIST,
 'potion-of-radiant-resistance':ALCHEMIST,
 'potion-of-thunder-resistance':ALCHEMIST,
 'potion-of-speed':ALCHEMIST,
 'potion-of-flying':ALCHEMIST,
 'potion-of-clairvoyance':ALCHEMIST,
 antitoxin:ALL,
 acid:TOXIN,
 'basic-poison':POISON,
 'truth-serum':TOXIN,
 'assassins-blood':POISON,
 'burnt-othur-fumes':POISON,
 'carrion-crawler-mucus':POISON,
 'drow-poison':POISON,
 'essence-of-ether':POISON,
 malice:POISON,
 'midnight-tears':POISON,
 'oil-of-taggit':POISON,
 'pale-tincture':POISON,
 'purple-worm-poison':POISON,
 torpor:POISON,
 'wyvern-poison':POISON
});
export const DEFAULT_RECIPE_TOOLS=defaults;
export function defaultToolsForRecipe(id){
 return [...(defaults[id]||ALCHEMIST)];
}
export function validateBrewingTools(input){
 if(!Array.isArray(input)||input.length<1||input.length>BREW_TOOL_IDS.length)
  throw new Error('A recipe must allow at least one of Alchemist’s Supplies, Herbalism Kit or Poisoner’s Kit.');
 if(new Set(input).size!==input.length||input.some(id=>!BREW_TOOL_IDS.includes(id)))
  throw new Error('Recipe brewing tools must be distinct supported D&D 5e tool IDs.');
 return BREW_TOOL_IDS.filter(id=>input.includes(id));
}
export const brewingToolsForRecipe=recipe=>validateBrewingTools(
 recipe?.brewingTools===undefined?defaultToolsForRecipe(recipe?.id):recipe.brewingTools
);
export const brewToolLabel=id=>BREW_TOOLS[id]?.label||String(id);
export const brewToolSummary=recipe=>brewingToolsForRecipe(recipe).map(brewToolLabel).join(' / ');
