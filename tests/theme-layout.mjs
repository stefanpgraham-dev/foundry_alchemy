import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css=readFileSync(path.join(root,'styles/theme-and-cards.css'),'utf8');
const original=readFileSync(path.join(root,'styles/alchemy.css'),'utf8');
const manifest=JSON.parse(readFileSync(path.join(root,'module.json'),'utf8'));
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const workbench=readFileSync(path.join(root,'scripts/workbench.mjs'),'utf8');
const recipeUi=readFileSync(path.join(root,'scripts/recipe-ui.mjs'),'utf8');

assert.equal(manifest.version,'0.5.4');
assert.equal(pkg.version,'0.5.4');
assert.deepEqual(manifest.styles,['styles/alchemy.css','styles/theme-and-cards.css']);
assert.match(css,/body\.theme-light \.alchemy-workbench\.awb-app/);
assert.match(css,/\.alchemy-workbench\.awb-app\.theme-light/);
assert.match(css,/\.alchemy-workbench\.awb-app\.theme-dark/);
assert.match(css,/--awb-ui-panel/);
assert.match(css,/--awb-ui-muted/);
assert.match(css,/color-scheme: light/);
assert.match(css,/color-scheme: dark/);

assert.match(css,/button\.awb-recipe-card,/);
assert.match(css,/button\.awb-recipe-library-card/);
assert.match(css,/min-height:\s*76px\s*!important/);
assert.match(css,/height:\s*auto\s*!important/);
assert.match(css,/flex:\s*0 0 auto\s*!important/);
assert.match(css,/grid-template-columns:\s*44px minmax\(0,1fr\) auto/);
assert.match(css,/\.awb-recipe-card \.awb-recipe-content strong/);
assert.match(css,/\.awb-recipe-library-card > span > small/);
assert.match(css,/white-space:\s*normal\s*!important/);
assert.match(css,/\.awb-recipe-card > \.awb-max/);
assert.match(css,/@media \(max-width: 540px\)/);
assert.match(workbench,/class="awb-recipe-card/);
assert.match(workbench,/class="awb-recipe-content"/);
assert.match(recipeUi,/class="awb-recipe-library-card/);
assert.match(recipeUi,/class="awb-art"/);

function luminance(hex){
 const values=hex.replace('#','').match(/.{2}/g).map(n=>parseInt(n,16)/255);
 const rgb=values.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function contrast(first,second){
 const l1=luminance(first),l2=luminance(second);
 return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
}
const dark={panel:'#303438',text:'#f1eee6',muted:'#c3c3c0',accent:'#e2bc75',onAccent:'#2e2315'};
const light={panel:'#fffdf9',text:'#282d32',muted:'#4a535c',accent:'#785521',onAccent:'#ffffff'};
for(const [theme,palette] of Object.entries({dark,light})){
 assert(contrast(palette.text,palette.panel)>=7,theme+' primary text contrast is at least AAA');
 assert(contrast(palette.muted,palette.panel)>=4.5,theme+' secondary text meets WCAG AA');
 assert(contrast(palette.accent,palette.onAccent)>=4.5,theme+' primary button label meets WCAG AA');
}
const strip=css.replace(/\/\*[\s\S]*?\*\//g,'');
let braces=0;
for(const char of strip){
 if(char==='{')braces++;
 if(char==='}')braces--;
 assert(braces>=0,'No closing CSS brace without opener');
}
assert.equal(braces,0,'CSS braces balanced');
console.log('Theme switching, readable card structure, palette contrast and manifest checks passed.');


// v0.4.2 regression checks: all item rows now use the same non-shrinking
// card layout as the repaired recipe browser and GM recipe catalogue.
assert.match(css,/\.awb-shell \.awb-item-list > \.awb-item-row/);
assert.match(css,/grid-template-columns: 44px minmax\(0,1fr\) auto/);
assert.match(css,/\.awb-shell \.awb-item-list > \.awb-item-row > img\.awb-art/);
assert.match(css,/\.awb-shell \.awb-item-list > \.awb-item-row > span > strong/);
assert.match(css,/\.awb-shell \.awb-item-list > \.awb-item-row > span > small/);
assert.match(css,/\.awb-shell \.awb-item-list > \.awb-item-row > b/);
assert.match(css,/\.awb-shell \.awb-item-list > \.awb-item-row\[hidden\]/);
assert.match(css,/\.awb-item-list > \.awb-item-row \{[\s\S]*?flex: 0 0 auto !important/);
assert.match(css,/\.awb-item-list > \.awb-item-row \{[\s\S]*?min-height: 76px !important/);
assert.match(css,/\.awb-item-list > \.awb-item-row \{[\s\S]*?height: auto !important/);

// Check previously unthemed areas shown in screenshots and other module tabs.
for(const selector of [
 '.awb-library-toolbar > button', '.awb-folder-switches button',
 '.awb-directory-recursive', '.awb-folder-switches span',
 '.awb-folder-summary span', '.awb-folder-issue',
 '.awb-item-list', '.awb-recipe-import', '.awb-recipe-palette',
 '.awb-recipe-ingredient', '.awb-stock', '.awb-choice',
 '.awb-empty', '.awb-empty-state', '.awb-recipe-drop',
 '.awb-mapping-target', '.awb-recipe-overrides',
 '.awb-result-counters', '.awb-gm .awb-panel-heading'
])assert(css.includes(selector),'Theme sheet covers '+selector);
assert.match(css,/\.awb-shell \.awb-search-wrap input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\)/);
assert.match(css,/border: 0 !important/);
assert.match(css,/\.awb-search-wrap:focus-within/);
assert.match(css,/body\.theme-light \.awb-chat\.awb-result/);

// Both theme palettes must keep toolbar button labels and warning text readable.
const actions={
 dark:{bg:'#414044',text:'#f1eee6',warn:'#ffe0ac',warnBg:'#503c2c'},
 light:{bg:'#eae1d4',text:'#282d32',warn:'#73501f',warnBg:'#fff0d6'}
};
for(const [name,colors] of Object.entries(actions)){
 assert(contrast(colors.bg,colors.text)>=4.5,name+' action button contrast meets AA');
 assert(contrast(colors.warn,colors.warnBg)>=4.5,name+' warning controls contrast meets AA');
}

console.log('Complete workbench theme audit and herb/refinement card regression checks passed.');
