# Alchemy Workbench — Foundry VTT v14 / D&D 5e

**v0.4.0 — fully editable, world-scoped recipe library.** This release has automated tests, but has not been tested interactively in a running Foundry v14 world. Back up the world before installing or updating; alchemy operations modify actor inventories.

## Installation

Use the permanent manifest in **Foundry Setup → Add-on Modules → Install Module**:

`https://github.com/stefanpgraham-dev/foundry_alchemy/releases/latest/download/module.json`

Or extract the `alchemy-workbench` folder from the release ZIP to `Data/modules/`, then restart Foundry and enable the module in your world.

## Opening and using the workbench

- Open a character sheet and choose **Alchemy** in its window header, or use a Script macro: `game.modules.get("alchemy-workbench").api.open()`.
- A single resizable ApplicationV2 workbench provides **Brew Potions**, **Prepare Herbs**, **Refine Reagents**, **Inventory**, and **GM Setup** (GM only).
- Brew Potions lists only recipes currently craftable using the actor's recognised reagent inventory. An optional toggle reveals unavailable recipes. Cards show artwork, DC and maximum batch size; batch size updates the ingredient allocation and returned change live.
- Prepare Herbs displays directory-discovered herbs, prompts for one of each herb's reagent properties, then converts exactly 1 herb to 1 reagent without a check.
- Refine Reagents lists Rare and Exotic stacks only and offers legal destinations dynamically: **Rare → Common (×3)**; **Exotic → Rare (×3) or Common (×9)**. Common reagents cannot be downgraded. The UI previews the exact outcome.
- Inventory shows all nine reagent balances and recognised herbs. It also lists likely unmatched herbs/reagents with suggestions for the GM to review mappings.
- A GM must be connected when players craft. The active GM validates and executes inventory transactions and rolls. Dice So Nice is optional and integrates via normal Foundry Roll chat messages.
- When both follow-up checks succeed after an initial failure, the player is prompted **after those dice have rolled** to choose full batch at +50% brewing time or partial batch immediately.

## GM setup — directory-driven

Open **GM Setup** from the workbench or run `game.modules.get("alchemy-workbench").api.setup()`.

1. In **Directories**, click **Pick herb directory** and select a World Item folder (for example, *Grassland* or a parent folder called *Herbs*).
2. Click **Pick reagent directory** and select the folder containing your nine reagent World Items (Common/Rare/Exotic × Curative/Poisonous/Reactive).
3. Leave **Include subfolders recursively** selected if herbs are organised into biome subfolders.
4. Review the scan preview showing added, changed and removed definitions, missing links, unknown reagent names and duplicate classifications. Click **Apply scan** to update this world's catalogue.
5. Whenever items or descriptions change, click **Refresh from directory**. An explicit refresh is required; ordinary inventory actions don't rescan the directory.
6. Use **Herbs** and **Reagents** in GM Setup to search, filter and sort imported definitions. Each herb retains its Item name, rarity and a readable list of reagent properties. Entries link back to their original Items.
7. In **Reagents**, manually map any specially named reagent World Items if automatic classification by Item name is not possible. Refresh again to resolve herbs that link to these mappings. **Potion outputs** are independently mappable as before.

**Herb format:** Each herb is a normal Foundry Item whose Description contains actual Foundry links to one or more reagent Items, for example:
`@UUID[Item.ABCD1234]{Rare Curative Reagent}` and `@UUID[Item.EFGH5678]{Rare Reactive Reagent}`.
The scanner reads the Item UUIDs from the stored description, including legacy `@Item[…]` and rendered `data-uuid` content links. Plain mentions of reagent names are *not* interpreted as ingredient properties. Every valid herb produces exactly one chosen reagent per consumed herb. Unresolved reagent links are reported rather than guessed.

**No bundled herb catalogue:** This version removes the previous 43 hard-coded herbs. Your world folder is the sole herb source. Before the first directory scan, no herbs will be recognised for extraction; potion recipes remain available once their reagents are mapped.

**Inventory copies:** World Item UUIDs do not match Actor-embedded Item UUIDs. The module uses original source metadata, persistent classification flags and template-name matching; refreshing a directory doesn't remove items from player inventories. The scan updates the world catalogue, not actor Item definitions.

**Validation:** A scan preview and the persistent Validation list identify unknown reagent names, duplicate classifications, missing reagent categories, broken/missing links, and items removed from the selected folder. The module skips herbs with no valid linked output; valid outputs on other herbs remain usable. A GM can click **Open Item** on a validation entry for correction.

Output Item mappings remain optional. Without one, the module awards a basic consumable without bespoke D&D 5e activities/effects. Pending extra-time brews remain manageable from **GM Setup → Pending brews**.

## GM Recipe Library (v0.4.0)

The 44 shipped formulas are imported once into a **world-scoped recipe library** on first GM startup. They are editable, not re-imported on every module update. Existing potion-output mappings from v0.3.0 are preserved during migration. Editing a formula affects only that world.

Open **Alchemy → GM Setup → Recipes**:

- **Drop a potion Item** onto **Drop potion Item to add a recipe** to create a new recipe, or press **New Recipe**. Drag any other World Item or compendium Item into the **Potion output** area to replace it.
- **Drop reagent Items** into the ingredient area; the module maps each Item to its recognised category (Common/Rare/Exotic and Curative/Poisonous/Reactive). Repeated drops increase the quantity. Alternatively, use **Add reagent** and edit the quantity numerically.
- **Save Recipe** to publish changes. Players only see enabled formulas, and the normal workbench still shows only recipes supported by their carried reagents.
- **Duplicate**, **Delete**, and **Enable/Disable** are available. For shipped formulas, **Restore Default Formula** resets ingredient quantities and brewing settings while keeping the mapped output Item.
- **Import Missing Defaults** restores deleted shipped formulas without overwriting edited recipes.
- Search and filter recipes by status, origin or mapping warnings; sort by name or reagent tier.
- **Custom DC and brewing-time overrides** are optional. Without overrides, the highest required reagent determines DC (10/12/14) and hours (2/4/6). One brewing check and the same brewing time apply to every batch size.
- **Test current inventory** checks an example batch without rolling dice, changing Items or advancing time. It lists required reagents, actual consumption, available substitutions and change.
- **Export JSON / Import JSON** transfers formulas across worlds. Imports offer **Add Missing**, **Update & Add**, or **Replace All**, with an additional confirmation before replacing. Exported reagent categories are portable. An output Item UUID that cannot be resolved in the destination world is matched by name if unambiguous; otherwise that recipe is disabled until the GM drops in an appropriate output Item.

Existing default recipes can function without a linked potion Item using the pre-existing basic-consumable fallback. New custom recipes require a real output Item before they can be enabled.

**Pending brew safety:** When a brew requires additional time, the GM stores the complete recipe and a snapshot of the output Item. Editing/deleting the formula or changing the output mapping later will not alter that pending reward. Pending jobs created by earlier releases without a snapshot retain the best-effort legacy lookup.

**Backups and limitations:** Before first updating to v0.4.0, back up the Foundry world. Automated simulation tests exercise recipe validation, migration, import/export, dry runs and pending-brew snapshots. The drag-and-drop UI and true multiplayer flows still need testing inside Foundry v14.

## Rules

- **Reagents:** Three colours (Curative, Poisonous, Reactive), three tiers (Common, Rare, Exotic), nine mapped item types.
- **Conversions:** 1 Exotic = 3 Rare = 9 Common (same colour only). Higher-tier reagents may be broken down to satisfy recipe requirements; all unconsumed value returns to the player's inventory in a chosen denomination.
- **Brewing check:** Intelligence + Alchemist's Supplies, against recipe-highest-tier DC 10/12/14. Base times are 2/4/6 hours. A batch of 1–100 requires one check and the **same brewing time as a single potion**.
- **Initial failure:** Roll two independent d20s. No follow-up successes loses all ingredients. One success uses 1d8 × 10% of batch. Two successes allow +50% brewing time for full yield, or immediate 1d8 × 10% partial batch.
- **Natural 20 on initial check:** Roll two independent d20s. One passing follow-up grants 1d40 × 10% additional batch yield; two passing grants 2d40 × 10%; no passing follow-ups grant no extra.
- **Yield calculation:** `floor(batch × percentage / 100)` guaranteed potions plus one d100 roll against the fractional remainder. No two-potion cap. The same method applies to critical and partial yields.
- **Dice So Nice:** Each check and yield roll is a standard Foundry Roll sent to chat. The virtual d40 is `(1d10−1)×4+1d4`, uniformly distributed 1–40 and compatible with d10/d4 animations.

## Transaction handling and limitations

The authenticated active GM authorises actor ownership and ingredients, preventing player-authored arbitrary inventory modifications. Per-actor locks prevent simultaneous crafting transactions on the active GM. Items are deducted and rewards awarded at resolution; on failure of an intermediate inventory operation the module attempts to roll back. Pending extra-time batches reserve ingredients and become GM-completable; final rewards cannot be claimed twice via the module. The module does not advance Simple Calendar or the game clock.

**Known live-test items:** ApplicationV2 rendering, Item sidebar drag/drop, actual D&D 5e tool modifiers, Dice So Nice display style, and socket choice prompt with separate GM/player browsers. A first-world backup and in-world smoke test are recommended. A separate random-effects alcohol Brewing page is outside this module's scope.

## Source data

- [Alchemy recipes and mechanics](https://app.notion.com/p/2ed1a67cccff41889725d18909c75c35)
- Herbs and reagents are configured entirely from the current Foundry world.

## v0.2.1 – tool checks and GM mapping usability

- **Prerequisites:** Potion brewing requires an Alchemist's Supplies item in the actor inventory and proficiency (or expertise) with Alchemist's Supplies. Missing requirements are displayed in the workbench, and GM-side validation also rejects the transaction before rolling or consuming ingredients. Herb preparation and reagent downgrading still need no tools or proficiency.
- **System-integrated checks:** Initial brewing and both independent follow-up rolls use the D&D 5e `Actor#rollToolCheck` API with Intelligence, the `alchemist` tool identifier and the carried tool item. The native check incorporates system bonuses, active effects and Dice So Nice chat rendering. Two follow-up checks each suppress advantage/disadvantage to preserve the explicitly agreed independent-d20 mechanic; the initial roll retains applicable roll-mode effects. As before, dice are rolled on the GM's client and posted to chat.
- **GM mapping:** Re-renders following selection, drag-and-drop or saving preserve scroll positions and, for an actively edited mapping input, keyboard focus and text-selection position.
- **Safety:** Back up the world before in-world testing. Foundry v14 / dnd5e v6.1 runtime UI and multiplayer behaviour have not been verified in a live Foundry world.

## v0.3.0 — directory catalogue upgrade

- Herb and reagent folder pickers with optional recursive scanning, GM review preview, change detection and persistent validation results.
- Automatic herb-name, rarity and linked reagent discovery from Foundry Items; no bundled herb JSON.
- GM library search/filter/sort and player herb-search/filter/sort controls.
- Retained manual reagent mapping for differently named Items and potion-output mapping for full effects.
- Folder changes do not consume or delete character inventory Items.

## v0.4.2 — full workbench theme audit

This is a presentation-only fix following the light-theme review in Foundry v14:

- **Refine Reagents** and **Prepare Herbs** item rows now use the same non-shrinking 76-pixel recipe cards used by Brew Potions and the GM Recipe Library. The icon, name, descriptive second line and stack quantity have separate columns and cannot overlap.
- **Inventory** item rows use the same styling, including unidentified herb/reagent items in the audit list.
- Corrected light/dark styling across **all five workbench tabs** and GM directories, herbs, reagents and recipe screens. Folder names, folder-selection controls, filter/sort/refresh buttons, recipe-editor controls, labels and empty states now use the theme palette.
- Fixed double-bordered search inputs in Prepare Herbs and GM lists; keyboard focus remains visible.
- Applied theme-appropriate colours to results sent to Foundry chat, which are outside the workbench window.
- Added automated checks for key screen selectors, CSS structure and action-button contrast.

No recipe formulas, inventory records, GM mappings, active brews or proficiency calculations are changed.

## v0.4.1 — theme-aware interface and readable recipe lists

- Automatically follows Foundry V14's application light/dark theme. No module theme setting or reload is needed when the user changes their Foundry theme.
- Adds a separate, last-loaded theme stylesheet with contrast-aware surfaces, borders, text, inputs, disabled states, buttons, and reagent/recipe editor panels.
- Fixes **Brew Potions** and **GM Setup → Recipes** cards: each row has an explicit minimum height, separate title/metadata lines, a consistently centred icon, and no flex-shrink compression.
- Provides a visible selected state, wrapped long item names, and right-aligned brewing quantity labels without covering the title.
- Applies responsive card dimensions for narrower module windows.
- These are interface-only changes. Stored world recipes, herb mappings, proficiency checks, inventory transactions and brewing probabilities are unchanged.

## v0.4.0 — world-editable alchemical recipes

- Imported the existing 44 formulas into persistent world settings, maintaining recipe IDs.
- Added GM drag-and-drop recipe editing, optional difficulty/time overrides, duplication, disabling and default restoration.
- Added JSON recipe-library export/import and a safe no-roll recipe test.
- Saved output Item and recipe snapshots on pending brews, independent of subsequent edits.
- Added regression tests for formula migration, invalid ingredients, and completing delayed brews after recipe deletion.
