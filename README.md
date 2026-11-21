# Alchemy Workbench — Foundry VTT v14 / D&D 5e

**Version 0.1.0: source build / first in-world test candidate.** No live Foundry runtime has been available for this release. Always back up the world before first use, particularly because brewing changes actor inventories.

## Install

In Foundry Setup → Add-on Modules → Install Module, paste the manifest URL above. Restart Foundry and enable **Alchemy Workbench** in your world. For manual installation, copy the `alchemy-workbench` directory containing `module.json` to Foundry user-data `Data/modules/`. For Foundry setup, use the permanent **Manifest URL**: `https://github.com/stefanpgraham-dev/foundry_alchemy/releases/latest/download/module.json`. Alternatively download the release ZIP and extract its `alchemy-workbench` folder into `Data/modules/`.

## Use

- Open a character sheet: an **Alchemy** button is added to the window header for owned actors (also for GM).
- Alternatively create a **Script** macro: `game.modules.get("alchemy-workbench").api.open()`.
- GM setup macro: `game.modules.get("alchemy-workbench").api.setup()`.
- A GM must be connected while crafting, because the GM client verifies item ownership and inventory and executes all transactions and dice rolls. Only one active GM (alphabetically first user ID) processes a request.

## GM setup

In **GM Item Mapping**, configure:

1. **Reagents** — map your nine World Items (Common/Rare/Exotic × Curative/Poisonous/Reactive) by UUID. Auto-suggested name matches are provided.
2. **Herbs** — map your 43 existing World Items to the supplied Notion-based catalogue. Multi-property herbs prompt the player to choose exactly one output.
3. **Potion outputs** — map up to 44 recipes to existing World Items or Compendium Item UUIDs. If unmapped, brewing creates a basic consumable item **without mechanically defined activities or effects**, so map your preferred D&D 5e items for full automation.
4. **Pending** — complete batches for which the player chose the +50% extra-time option on the double-success-after-failure branch.
5. **Audit** — flags Canopy Thistle, Ironshroud Mold and Cinderstem: herb rarity and effective reagent tier do not match. The specific Notion reagent types are authoritative.

Mapping is **world-scoped**. World Item templates and Compendium Item templates use their UUIDs. Existing actor items are recognised by source UUID, original source flags, or matching the mapped World Item name. A source item's UUID itself normally differs from an embedded actor item's UUID. It is not necessary to remake existing items. Reagents that come from conversion inherit module metadata.

## Rules

- Herb extraction: **one herb → one chosen reagent**, no check, instantaneous.
- Refinement: **1 Exotic → 3 Rare → 9 Common** of the same colour, no check or time; no reverse upgrading. Item-level conversion prevents losing excess; brewing returns reagent change, by default in the highest available denomination.
- Brewing: all 44 recipes from the Notion Alchemy page. **Intelligence + Alchemist's Supplies** against DC Common 10 / Rare 12 / Exotic 14; time Common 2h / Rare 4h / Exotic 6h; based on the recipe's highest tier (not any substitute). Batch size 1–100, **same time as solo**, **one initial check for the whole batch**.
- Initial fail: roll two independent d20s against the DC. Neither succeeds = no potions, ingredients consumed. One succeeds = `1d8×10%` partial batch. Both succeed = either full batch with 50% extra brewing time (stored as a pending GM-completed batch) or immediate `1d8×10%` partial batch.
- Natural 20 on the initial check: roll two more independent d20s. One succeeds → `1d40×10%` bonus, both succeed → `2d40×10%` bonus. **This bonus is in addition to the full base batch.** Bonuses can exceed 100% even for a one-potion brew; there is no two-potion cap.
- Yields: guaranteed full potions = `floor(batch × percentage / 100)`; roll one d100 against the fractional remainder (if nonzero), awarding one more on equal or lower. The same algorithm applies to critical bonuses and partial results.
- All rolls are ordinary Foundry `Roll` objects sent to chat, triggering Dice So Nice automatically if installed and enabled. Virtual **d40** is rolled as `(1d10-1)×4+1d4` to animate physical dice in Dice So Nice; this has exactly uniform outcomes 1–40. Each follow-up d20 is separate.

## Inventory & concurrency

The active GM validates the authenticated socket sender, ownership of the actor, recipe IDs, ingredient availability and the item UUID mappings before applying transactions. A per-actor GM execution lock prevents overlapping requests on the active GM. Ingredients are consumed even if brewing yields nothing. Pending extra-time batches consume the ingredients when created; the GM adds the reserved potions later. Normal crafting produces its potion items immediately.

Inventory updates are applied after all mappings are checked, with rollback attempts if intermediate updates fail; zero-quantity input stacks are only deleted after successful updates. No extra ingredients are required for critical bonus potions.

**Warning:** The GM tool check uses the actor's system-prepared `tools.alchemist.total` when available, otherwise calculates Intelligence modifier plus proficiency multiplier and static bonus. Some custom modifiers, modules and alternate dnd5e check pipelines may not be represented in the fallback. Verify the shown modifier on first use. Full native system Tool Check API integration should be tested with your exact D&D5e version.

## Limitations / initial runtime tests

- Foundry VTT v14 and the installed dnd5e system have **not** yet been tested interactively. This is a first test build, not a verified stable release.
- GM-authoritative socket requests and the v14 DialogV2 callbacks need an in-world smoke test with a GM and player client.
- GM's 3D dice styles will be used for GM-executed rolls; Dice So Nice is optional.
- The module does not advance Simple Calendar or the Foundry world clock.
- The output mapping form currently accepts UUIDs and World Item auto-suggestions; searching Compendium text is not automatic, but Compendium UUIDs can be pasted.
- No custom effects are invented when potion templates are missing. Item mappings must be configured to use fully functional existing potions.
- This module does not implement the separate random-effects **Brewing (alcohol)** Notion page.

## Source reference

- Alchemy (44 recipe matrix, DC/time/failure/critical): https://app.notion.com/p/2ed1a67cccff41889725d18909c75c35
- Herbs (43 definitions): https://app.notion.com/p/402e4aae6fd542f5b2db533bd07a385e
