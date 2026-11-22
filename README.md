# Alchemy Workbench — Foundry VTT v14 / D&D 5e

**v0.3.0 — directory-driven herb and reagent catalogues.** This release has automated tests, but has not been tested interactively in a running Foundry v14 world. Back up the world before installing or updating; alchemy operations modify actor inventories.

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
