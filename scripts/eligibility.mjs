/** Brewing prerequisites for the dnd5e system: a carried tool and trained use. */
export const ALCHEMIST_TOOL_ID = 'alchemist';
export const ALCHEMIST_SOURCE_UUID = 'Compendium.dnd5e.equipment24.Item.phbtulAlchemists';

const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const quantity = item => Math.max(0, Math.floor(Number(item?.system?.quantity ?? 1)));

export function isAlchemistSupplies(item) {
  if (!item || quantity(item) < 1) return false;
  const type = item.system?.type;
  if (item.type === 'tool' && (type?.baseItem === ALCHEMIST_TOOL_ID || type?.value === ALCHEMIST_TOOL_ID)) return true;
  const source = item.flags?.core?.sourceId ?? item._stats?.compendiumSource;
  if (source === ALCHEMIST_SOURCE_UUID) return true;
  // Covers existing custom or renamed in-world tool copies lacking a source UUID.
  const name = normalize(item.name);
  return item.type === 'tool' && (name.includes('alchemistssupplies') || name.includes('alchemistsupplies'));
}

export function brewingEligibility(actor) {
  const tools = Array.from(actor?.items ?? []);
  const item = tools.find(isAlchemistSupplies) ?? null;
  const data = actor?.system?.tools?.[ALCHEMIST_TOOL_ID];
  const multiplier = Number(data?.prof?.multiplier ?? data?.value ?? 0);
  const itemMultiplier = Number(item?.system?.proficiencyMultiplier ?? item?.system?.proficient);
  const hasProficiency = Boolean(data?.prof?.hasProficiency || (Number.isFinite(multiplier) && multiplier >= 1)
    || (Number.isFinite(itemMultiplier) && itemMultiplier >= 1));
  const errors = [];
  if (!item) errors.push('Requires Alchemist’s Supplies in the character inventory.');
  if (!hasProficiency) errors.push('Requires proficiency with Alchemist’s Supplies (or expertise).');
  if (actor && typeof actor.rollToolCheck !== 'function') errors.push('Native D&D 5e Alchemist’s Supplies checks are unavailable.');
  return {ok:errors.length===0, item, hasProficiency, errors};
}

/** Use the dnd5e native tool pipeline to include modifiers, effects and 3D dice. */
export async function rollAlchemyToolCheck(actor, dc, {followUp=false}={}) {
  const eligible=brewingEligibility(actor);
  if (!eligible.ok) throw new Error(eligible.errors.join(' '));
  const config={tool:ALCHEMIST_TOOL_ID, ability:'int', item:eligible.item, target:dc};
  // The two post-result checks represent two separate d20s, not one advantage/disadvantage test.
  if (followUp) {config.advantage=false; config.disadvantage=false;}
  const rolls = await actor.rollToolCheck(config, {configure:false}, {
    create:true,
    data:{flavor:`Alchemy · Intelligence (Alchemist's Supplies) · DC ${dc}${followUp?' · Follow-up':''}`}
  });
  const result=Array.isArray(rolls)?rolls[0]:rolls;
  if (!result || !Number.isFinite(Number(result.total))) throw new Error('Alchemist’s Supplies check was cancelled or did not return a roll.');
  return result;
}

export function naturalD20Result(roll) {
  const die=roll?.d20 ?? roll?.dice?.find(d=>Number(d.faces)===20);
  const active=die?.results?.find(r=>r.active!==false && !r.discarded)
    ?? die?.results?.find(r=>r.active!==false)
    ?? die?.results?.[0];
  return Number(active?.result ?? 0);
}
