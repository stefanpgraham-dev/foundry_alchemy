import json,re,pathlib
D=pathlib.Path(__file__).parent
fields=['common_curative','rare_curative','exotic_curative','common_poisonous','rare_poisonous','exotic_poisonous','common_reactive','rare_reactive','exotic_reactive']
raw='''Potion of Healing|3
Potion of Greater Healing|,1
Potion of Superior Healing|,,1
Potion of Supreme Healing|,,3
Philtre of Love|3,,,,,,2
Potion of Poison|1,,,3,,,1
Potion of Climbing|1,,,1,,,,1
Potion of Heroism|,1,,,,,2
Potion of Invisibility|,2,,,,,,1
Potion of Mind Reading|1,,,1,,,,1
Potion of Water Breathing|,1,,,1,,1
Potion of Animal Friendship|,1,,,,,1
Potion of Diminution|,1,,,,,,1
Potion of Growth|,2,,,,,1
Potion of Gaseous Form|2,,,2,,,,2
Potion of Acid Resistance|,1,,,,,,1
Potion of Cold Resistance|,1,,,,,,1
Potion of Fire Resistance|,1,,,,,,1
Potion of Force Resistance|,1,,,,,,1
Potion of Lightning Resistance|,1,,,,,,1
Potion of Necrotic Resistance|,1,,,,,,1
Potion of Poison Resistance|,1,,,,,,1
Potion of Psychic Resistance|,1,,,,,,1
Potion of Radiant Resistance|,1,,,,,,1
Potion of Thunder Resistance|,1,,,,,,1
Potion of Speed|,1,,,1,,,1
Potion of Flying|2,,,,,,,,1
Potion of Clairvoyance|,,,,1,,,2
Antitoxin|2,,,1
Acid|,,,2,,,1
Basic Poison|,,,3
Truth Serum|1,,,,,,,1
Assassins Blood|,,,,1,,1
Burnt Othur Fumes|,,,,,1,1
Carrion Crawler Mucus|,,,,1,,2
Drow Poison|,,,,1,,2
Essence of Ether|,,,,2,,1
Malice|,,,,1,,,1
Midnight Tears|,,,,,3,,1
Oil of Taggit|,,,,2,,,1
Pale Tincture|,,,,1,,,2
Purple Worm Poison|,,,,,3,,,1
Torpor|,,,,,1,,1
Wyvern Poison|,,,,,2,,,1'''
recipes=[]
for row in raw.splitlines():
    name,quant=row.split('|');vals=quant.split(',');assert len(vals)<=9,(name,len(vals))
    costs={k:int(v) for k,v in zip(fields,vals) if v.strip() and int(v)>0}
    assert costs,name
    key=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')
    recipes.append({'id':key,'name':name,'cost':costs})
assert len(recipes)==44
(D/'recipes.json').write_text(json.dumps(recipes,ensure_ascii=False,indent=2)+'\n')
herbs='''Dripstone Bloom|Exotic|exotic_reactive
Cave Moss|Common|common_curative
Echoflower|Rare|rare_poisonous,rare_reactive
Stalagtide Sprout|Rare|rare_curative,rare_reactive
Gloomroot|Rare|rare_reactive
Dreadcap|Exotic|exotic_poisonous
Swampthorn|Exotic|exotic_reactive,exotic_poisonous
Mireweed|Common|common_reactive,common_poisonous
Fenflower|Rare|rare_curative
Bogmoss|Rare|rare_reactive
Coralweed|Exotic|exotic_curative
Stormleaf|Rare|rare_poisonous,rare_reactive
Saltvine|Common|common_reactive,common_curative
Tideblossom|Rare|rare_reactive
Foamroot|Rare|rare_curative
Shadowleaf|Rare|rare_reactive
Sunberry Bush|Common|common_curative
Ironwood Sprig|Common|common_poisonous
Mistvine|Rare|rare_curative,rare_reactive
Frostfern|Common|common_reactive
Whisperweed|Rare|rare_poisonous,rare_reactive
Heartroot|Exotic|exotic_curative
Canopy Thistle|Exotic|rare_poisonous
Ironshroud Mold|Exotic|common_reactive,common_curative
Echo Fungus|Exotic|exotic_reactive,exotic_curative
Sporepuff|Rare|rare_poisonous
Glowcap|Common|common_reactive
Thundersprout|Exotic|exotic_poisonous,exotic_reactive
Blazing Star|Exotic|exotic_curative
Frostnip|Common|common_reactive
Earthtongue|Rare|rare_reactive,rare_curative
Prairie Sage|Common|common_poisonous
Skybloom|Rare|rare_reactive,rare_curative
Goldenrod|Rare|rare_curative
Windwhisper Grass|Common|common_reactive
Nightshade Cactus|Exotic|exotic_poisonous,exotic_reactive
Searing Thistle|Common|common_poisonous,common_reactive
Dustbloom|Common|common_poisonous
Quicksand Root|Rare|rare_reactive,rare_curative
Cinderstem|Exotic|rare_poisonous
Mirage Mint|Rare|rare_poisonous,rare_reactive
Dunebrush|Common|common_reactive
Sunscorch Bloom|Common|common_curative'''
h=[]
for row in herbs.splitlines():
    name,rarity,properties=row.split('|')
    h.append({'id':re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-'),'name':name,'rarity':rarity.lower(),'reagents':properties.split(',')})
assert len(h)==43
(D/'herbs.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
print('recipes',len(recipes),'herbs',len(h))
