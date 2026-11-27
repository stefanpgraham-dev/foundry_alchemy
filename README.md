# Alchemy Workbench — Foundry VTT v14 / D&D 5e

**v0.5.9 — complete biome gathering, illustrated herb import and source-link fixes.** This release has automated tests, but has not been tested interactively in a running Foundry v14 world. Back up the world before installing or updating; alchemy operations modify actor inventories.

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

## v0.5.8 — herb gathering and balanced biomes

The installed PoE Herbs Notion catalogue contains **43 existing herbs**. `data/herb-registry.json` preserves their names, 10 environment tags, rarity, reagents and Notion URLs (including three pre-existing mismatches in herb rarity vs reagent tier). The registry now contains **23 additional biome-specific herbs**, each with unique lore, reagent links, a dedicated SVG botanical illustration and a matching Notion entry. After installation there are **66 eligible herbs**, spanning **9 of 9 reagent combinations in each of 10 biomes**. Existing 43 World/compendium Items are never overwritten.

**GM preparation:** Configure the nine reagent sources and the original herb folder and/or compendium in `GM Setup → Directories`, then open `GM Setup → Gathering` and select **Install missing biome herbs**. This is an explicit, idempotent operation, creating Item templates in the selected World herb folder (or a new “Alchemy Biome Herbs” folder when only compendiums are selected). It adds @UUID reagent references to each description, includes botanical art, and refreshes source mappings. A pure compendium source does not need editing. A manual directory refresh updates any source changes.

**Gather Herbs tab:** Select one of ten biomes and make a native **Wisdom (Herbalism Kit)** check with a carried, proficient kit. The active GM resolves it and awards real source Item copies to the selected actor. Failure gives zero; success gives one; **DC+5 gives two** and **DC+10 gives three**. A separate weighted random draw is made per herb, with 2×d100 to preserve standard dice support and an exact uniform 1–10,000 random range. Sources are selected from mapped, scanned herb Items only. Items without a source or with 0 weight are excluded. Herb processing still yields exactly one *chosen* reagent per herb, even when an herb lists two potential properties.

**GM Setup → Rules:** Default gathering DC 15, the +5/+10 thresholds, yield counts and Common/Rare/Exotic tier weights **60/30/10**, all adjustable. **GM Setup → Gathering** exposes per-biome DC overrides, per-herb relative weights and a coverage report. Zero herb weight disables that herb without deleting its Item. World settings are validated and shown in the existing dark and light themes.

**Security:** Players cannot supply unverified Item templates, yields, source UUIDs or dice outcomes. The active GM revalidates actor ownership, herb sources, selected biome, proficiency and inventory updates. If a source is missing, the roll cannot fabricate a reward. Gathering time remains GM-controlled; repeated-use site depletion is not yet enforced.

## v0.5.7 — actor selection entry points

**GM macro:** `game.modules.get("alchemy-workbench").api.open()` now lists only D&D 5e **Character** actors. NPCs, vehicles and other actor types are excluded from the GM's macro picker. A selected PC token (or the user's assigned character) retains its existing preference over a manual selection, but a selected NPC token is ignored. Non-GM actor visibility and permissions are unchanged.

**Actor sheet:** The Alchemy button in the sheet's header opens the workbench for **that exact World Actor**, bypassing the picker, whether the actor is a PC or NPC. The API also supports `api.open({actor: game.actors.get("ACTOR_ID")})` or `api.open({actorId: "ACTOR_ID"})` for explicit launches. The server-side GM permission and inventory checks still apply. Unlinked/synthetic token actor sheets do not silently redirect inventory mutations to the corresponding base NPC; open that NPC's World Actor sheet instead.

**GM Setup:** `api.setup()` remains usable in an empty world or in a world containing only NPCs, without requiring a player character. The previous `api.open()` macro continues to work.

## v0.5.6 — reliable artwork for recipes and Brew Potions

The image display code can no longer rely exclusively on a client's saved catalogue and lightweight compendium index. When a mapped Item displays Foundry's default bag icon, the workbench first requests the compendium's `img` index field, then resolves the exact mapped Item UUID if needed. Image lookups are cached and bounded in parallel; missing compendium permissions do not break the rest of the UI.

A GM directory refresh also saves an `outputImages` mapping from actual source documents so players can display item artwork without loading the full source compendium. Explicitly saving a recipe captures its output artwork too. The 44 formulas, ingredient calculations, stored UUID mappings and GM crafting transactions are unchanged.

**After update:** close and reopen the workbench. If artwork is still missing, open **GM Setup → Directories → Refresh from sources → Apply scan** once on the GM account to persist the source artwork for players.

## v0.5.5 — compendium artwork in Recipes and Brew Potions

Compendium Item UUIDs are resolved to the proper pack identifier, excluding the `.Item` document-type segment. The Recipes list, selected potion output and Brew Potions cards now use images saved in the scanned **Potion Sources** catalogue first; this works even if Foundry's compendium index is not populated with `img`. Reagent image paths are saved on refresh for ingredient previews. World Item artwork continues to be read directly from its Item. An unavailable template image shows Foundry's standard Item icon rather than a broken image.

**Update procedure:** Install v0.5.5, reload Foundry, then select **GM Setup → Directories → Refresh from sources → Apply scan** to save reagent artwork. Previously selected potion images are already present in the Potion Sources catalogue. Recipe outputs, activities, effects and inventory transactions are unchanged.

## v0.5.4 — source matching and all 44 formulas

**Potion Sources now understand Foundry 2024 equipment naming:** `Potion of Healing (Greater/Superior/Supreme)`, `Philter of Love`, `Poison, Basic`, `Crawler Mucus` and `Assassin's Blood` resolve to the corresponding legacy-named world recipes. For the duplicate `Potion of Healing` templates in `dnd5e.equipment24`, the actual DMG potion is preferred over the PHB adventuring-gear copy. Distinct same-name World Items remain ambiguous; previous explicit mappings are never replaced.

**The 2024 equipment pack does not contain a separate Item for every default formula.** Its `Potion of Resistance` contains selectable damage types and is **not automatically substituted** for ten recipes that specify separate resistance types. The older `dnd5e.items` compendium contains specific resistance Items (and Drow Poison). Select **both** `dnd5e.equipment24` and `dnd5e.items` under **GM Setup → Directories → Potion Sources**, or use the **Add SRD 5.1 Items as potion source** shortcut when offered. Refresh, preview the linked/unlinked counts, and apply. Current-world explicit links are preserved, and modern 2024 Items are preferred for same-named compendium alternatives.

The recipe library lists whether each output is linked automatically, linked explicitly or unlinked. Selecting a potion source and refreshing updates the selected recipe's output display unless the GM has unsaved changes. Missing or ambiguous outputs remain visible as warnings rather than silently crafting the wrong potion. Regression tests cover the published naming differences and distinct resistance outputs.

## v0.5.3 — potion source mapping

Under **Alchemy → GM Setup → Directories**, a third source, **Potion Sources**, can use a World Item folder, one or more Item compendiums, or both. Herb and reagent sources remain required; potion sources are optional for existing worlds. Folder recursion applies to all three categories.

Choose the source and **Refresh from sources**. A recipe without an explicit output link is automatically mapped when exactly one selected potion Item has the same name (case/punctuation-insensitive). A World Item imported from a selected compendium original is preferred over its original. Different same-named Items are reported as ambiguous and not silently chosen. Previously configured manual recipe-output links remain authoritative. Auto-mapped links can follow a replacement Item on a later refresh.

Under **GM Setup → Recipes**, each recipe's Potion Output includes a picker populated from the saved Potion Sources catalogue. Use this when names differ, or continue dragging a World/compendium Item into the output slot. Brewing copies the mapped source Item's activities and effects rather than a generic placeholder. Scanning never deletes items from actor inventories, and existing pending brews retain their saved output snapshots. Back up your Foundry world before updating and verify the new picker inside Foundry v14.

## GM setup — World Items and compendium support (v0.4.3)

Open **Alchemy → GM Setup → Directories**, then independently choose sources for **Herbs** and **Reagents**. Each category can use:

- A World Item folder, optionally including its subfolders.
- One or more **Item compendium packs**, chosen using **Choose herb compendiums** and **Choose reagent compendiums**.
- **Both** a World Item folder and compendium packs at once. Clear a folder using **Clear folder** for a compendium-only setup.

**There is no need to move current World Items into compendiums.** The previous herb/reagent folder settings are retained on upgrade. The pack selections default to empty. After choosing sources, click **Refresh from sources**, review additions/changes/removals and validation warnings, then **Apply scan**. Scans are explicit; they do not change existing character inventory Items.

A herb is any selected Item with actual Foundry document links in its Description to one or more reagent Items. Supported references include:

- World Items: `@UUID[Item.ABCD1234]{Rare Curative Reagent}`.
- Compendium Items: `@UUID[Compendium.my-module.reagents.Item.ABCD1234]{Rare Curative Reagent}`.
- Existing rendered `data-uuid` links and legacy `@Item[…]` / `@Compendium[…]` content links.

Links can point to reagents in the opposite source type, including a compendium Item not itself selected for automatic reagent discovery. The scanner resolves the real linked document; **a broken link or plain text mentioning a reagent does not create a valid property**.

A World Item imported from a compendium can be recognised as the same reagent or herb through its original compendium-source metadata. If the same herb exists in both selected sources with matching provenance, the World Item is preferred for the displayed entry and the original compendium UUID remains a recognised alias. Source ambiguity and duplicate reagent classifications are reported to the GM. Reagent names that do not match the standard nine classifications can still be mapped manually using a dragged World/compendium Item or its UUID; explicit manual mappings survive refresh.

**Inventory copies and permissions:** The module matches actor Items against source provenance, stored classification flags and stable mapped names. Item templates and potion output effects can be copied from either source. Scanning a selected pack reads its Item documents only when the GM clicks Refresh; the pack must be installed and readable by the GM. Other clients need the normal world permissions to access source content directly, but the saved world catalogue is used for crafting and does not require each player to import compendium Items.

**Validation:** Preview and GM Herbs/Reagents lists report broken links, unknown reagent types, duplicate classifications and missing/unavailable packs. Fix the source Item and refresh again. Existing character Items and pending brews are never deleted or silently rewritten by a scan.

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

## v0.5.2 — recipe-specific brewing tools

**Each recipe now lists the permitted kits (EITHER / OR):** Alchemist's Supplies (`alchemist`), Herbalism Kit (`herb`), and Poisoner's Kit (`pois`). These are the native Foundry D&D 5e tool identifiers.

Open **Alchemy → GM Setup → Recipes** and select a formula. Under **Permitted brewing tools**, tick one or more kits and **Save Recipe**. All 44 shipped recipes have researched/sensible default allocations appropriate to their effects: healing and nature remedies generally permit Herbalism Kit or Alchemist's Supplies; magical transformations and resistance potions generally use Alchemist's Supplies; most toxins require Poisoner's Kit, with mixed choices for antitoxin, acids and chemical poisons. The defaults are editable per world, and **Restore Default Formula** also restores its default tool selection.

The **Brew Potions** list now checks both reagents **and** whether the character carries and is proficient with at least one tool allowed by that formula. **Show recipes missing ingredients** also reveals formulas unavailable due to missing tools or proficiency. Recipe cards show the permitted tools. When multiple qualified kits are available, the player can select which to use. A recipe is craftable with **any one** of its approved kits; proficiency in all listed kits is not required. If no approved equipped/proficient kit is available, the Brew button is disabled.

All brewing checks use **Intelligence + the chosen native D&D 5e tool check**, including the initial roll and both independent critical/failure follow-ups. Proficiency or expertise is detected from the actor's D&D 5e tool data, alongside the inventory tool Item. The GM validates recipe permissions, inventory and proficiency before any dice or reagents are consumed. The chosen kit appears on the brewing result chat card.

**Migration:** On the first GM startup after update, old saved world recipes with no `brewingTools` field receive the new shipped default for that recipe ID (custom recipes default to Alchemist's Supplies). Existing recipe ingredients, output mappings, disabled state, rarity tier, DC/time overrides, and active pending batches remain untouched. Recipes that already specify allowed tools keep them. JSON recipe exports include the tool assignments; older imports with no assignments are upgraded by the same defaulting rule. Custom recipes must allow at least one supported kit.

**Other unchanged rules:** One brewing check per batch; the same batch time as one potion; global DCs/time, existing critical percentages, no-check herb extraction and reagent downgrading, and Dice So Nice.

## v0.5.1 — herb source and rarity corrections

**Different herbs keep their own World Item UUIDs.** Previously the folder scanner could merge Weeping Ink Vine and Canopy Thistle if both inherited the same "Original Source" when one Item was duplicated. The scanner now resolves the actual linked reagents first and treats each distinct World Item independently. An equivalent World import and its selected compendium original are still consolidated *only when their names, alchemy tiers and reagent output sets match*.

If two distinct herbs have the same inherited original UUID, the GM sees a warning in **GM Setup → Herbs / Directories**. Conflicting source aliases are not used to identify actor inventory copies. The herb's actual Item name is also checked, preventing stale flags or an inherited core.sourceId from making Weeping Ink Vine appear as Canopy Thistle. A player's existing Item is not renamed or deleted.

**Foundry item rarity:** The scanner reads \`system.rarities\` (including \`veryRare\`), falling back to \`system.rarity\`; a herb's optional \`system.alchemyTier\` is authoritative. In **GM Setup → Directories → D&D item rarity → Alchemy tier**, GMs can define how Common, Uncommon, Rare, Very Rare, Legendary and Artifact map to Common/Rare/Exotic (or unclassified) for this world. Defaults: Common/Uncommon → Common; Rare → Rare; Very Rare/Legendary/Artifact → Exotic. The Herbs catalogue shows both the D&D source rarity and the interpreted alchemy tier. These classifications affect herb catalogue/filter display, **not** the linked reagent outputs or brewing difficulty.

After updating, click **GM Setup → Directories → Refresh from sources** and apply the scan to reclassify your world's herbs. A herb still needs at least one valid linked reagent Item in its Description. Refreshing does not modify actor inventory quantities.

## GM Setup → Rules (v0.5.0)

Global brewing mechanics are now **world settings**, editable by the GM from **Alchemy → GM Setup → Rules**. Existing worlds retain all the original values until the GM changes them. A **Restore default rules** button resets every global rule after confirmation; it does **not** reset or overwrite custom recipes.

- **Difficulty by tier:** Common DC 10, Rare DC 12, Exotic DC 14 by default. Each can be set from 1–40. Recipe-specific DC overrides take precedence.
- **Brewing time by tier:** Common 2 hours, Rare 4 hours, Exotic 6 hours by default. Set each in quarter-hour increments (0.25–72 hours). The same time applies to a single potion and a batch. Recipe-specific time overrides take precedence.
- **Maximum batch:** Configurable 1–100 (default 100). Player craftability, preview tests and GM-authoritative transactions honour the cap; all batches roll just one initial check.
- **Critical threshold:** Natural 20 by default, configurable 2–20. Critical checks run 0–2 additional **independent** native d20 Alchemist’s Supplies checks (default 2). Successful follow-ups grant configurable bonus dice (default 1 die if one passes, 2 dice if two pass); selectable dice are d4, d6, d8, d10, d12, d20 or virtual d40. Each die point earns a configurable percentage (default 10%). E.g. an original 5-potion batch with +150% earns 7 guaranteed extra potions and 50% chance of one more.
- **Failure resolution:** Following a failed initial check, roll 0–2 independent native d20 follow-ups (default 2). With **zero passes**, the default output is 0% (all reagents lost), but a GM can specify 0–100% fixed batch yield. With **one pass**, the player rolls a configurable partial-yield die (default d8) times a percentage per point (default 10%). Whole yields are guaranteed; any remainder uses one d100. With **two passes**, choose whether the player selects **full yield after additional time** or **immediate partial yield**, or enforce one choice for the whole world. Extra time defaults to 50% of normal time (0–300% configurable). Immediate resolution uses the same partial-yield formula.
- All additional brewing dice appear in Foundry chat and Dice So Nice. A virtual d40 is still represented by d10+d4, as in previous releases. Values are validated before being saved; only the GM can change them.

**Fixed mechanical safeguards**, displayed read-only in the Rules tab: Intelligence + Alchemist’s Supplies (requires carried tools and proficiency); 1 herb → 1 chosen reagent without a check; one-way 3:1 Rare→Common, Exotic→Rare (or 9:1 Exotic→Common) with change preserved; no automatic advancement of time. These are not editable without explicitly revising the core economy, tool-check implementation or inventory transactions.

**Live changes** affect subsequent brewing attempts only. Brews already awaiting GM completion retain their output Item, recipe and recorded time; rule snapshots are stored for new pending jobs. A backup of the Foundry world is recommended before upgrading. These changes are verified with Node regression tests; manual UI verification in a running Foundry v14 instance is still needed.

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

## v0.4.3 — compendiums and mixed-source alchemy

- Optional Item compendium pack pickers for herbs and reagents alongside existing World Item folders.
- World-only, compendium-only, and combined sources with support for several packs.
- Resolve World/compendium reagent links across source types; source provenance aliases recognise imported Item copies.
- Compendium reagent drag-and-drop in the GM recipe editor, even when the mapped equivalent is a World Item.
- Preserve explicit GM reagent mapping overrides and provide validation previews before applying scans.
- Added regression tests for mixed sources, imported Item identity, broken links, duplicate herbs, and unavailable packs.

## v0.5.0 — global GM rules

- Added GM Rules tab with validated editing, save, and restore defaults.
- Wired DC/time, maximum batch, natural critical thresholds, critical dice and bonuses, failure outcomes, partial yields and delayed brewing time into the server-authoritative brewing path.
- Preserved recipe-specific difficulty/time overrides, Dice So Nice, source mapping and existing pending jobs.
- Added model, UI and GM transaction regression tests for changed values.

## v0.5.2 release highlights

- Native recipe-level tool eligibility, carried-kit recognition and proficiency/expertise validation.
- GM-selectable allowed kits for every recipe and player selection when multiple are qualified.
- Migrated 44 default recipe formulas with tool assignments, keeping world overrides intact.
- Added tests for the D&D5e `alchemist`, `herb` and `pois` IDs, tool permissions, progression and GM-side denial before reagent consumption.
