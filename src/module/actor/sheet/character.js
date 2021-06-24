import { SFRPG } from "../../config.js"
import { ActorSheetSFRPG } from "./base.js"
import { computeCompoundBulkForItem } from "../actor-inventory.js"

export class ActorSheetSFRPGCharacter extends ActorSheetSFRPG {
    static get defaultOptions() {
        const options = super.defaultOptions;
        mergeObject(options, {
            classes: ['sfrpg', 'sheet', 'actor', 'character'],
            width: 715,
            //height: 830
        });

        return options;
    }

    get template() {
        const path = "systems/sfrpg/templates/actors/";
        if (!game.user.isGM && this.actor.limited) return path + "limited-sheet.html";
        return path + "character-sheet.html";
    }

    getData() {
        const sheetData = super.getData();

        let hp = sheetData.data.attributes.hp;
        if (hp.temp === 0) delete hp.temp;
        if (hp.tempmax === 0) delete hp.tempmax;

        sheetData["disableExperience"] = game.settings.get("sfrpg", "disableExperienceTracking");

        return sheetData;
    }

    /**
     * Organize and classify items for character sheets.
     * 
     * @param {Object} data Data for the sheet
     * @private
     */
    _prepareItems(data) {

        const actorData = data.data;

        const inventory = {
            weapon: { label: game.i18n.format(SFRPG.itemTypes["weapon"]), items: [], dataset: { type: "weapon" }, allowAdd: true },
            shield: { label: game.i18n.format(SFRPG.itemTypes["shield"]), items: [], dataset: { type: "shield" }, allowAdd: true },
            equipment: { label: game.i18n.format(SFRPG.itemTypes["equipment"]), items: [], dataset: { type: "equipment" }, allowAdd: true },
            ammunition: { label: game.i18n.format(SFRPG.itemTypes["ammunition"]), items: [], dataset: { type: "ammunition" }, allowAdd: true },
            consumable: { label: game.i18n.format(SFRPG.itemTypes["consumable"]), items: [], dataset: { type: "consumable" }, allowAdd: true },
            goods: { label: game.i18n.format(SFRPG.itemTypes["goods"]), items: [], dataset: { type: "goods" }, allowAdd: true },
            container: { label: game.i18n.format(SFRPG.itemTypes["container"]), items: [], dataset: { type: "container" }, allowAdd: true },
            technological: { label: game.i18n.format("SFRPG.ActorSheet.Inventory.Interface.SpecialItems"), items: [], dataset: { type: "technological,magic,hybrid" }, allowAdd: true },
            fusion: { label: game.i18n.format("SFRPG.ActorSheet.Inventory.Interface.EquipmentEnhancements"), items: [], dataset: { type: "fusion,upgrade,weaponAccessory" }, allowAdd: true },
            augmentation: { label: game.i18n.format(SFRPG.itemTypes["augmentation"]), items: [], dataset: { type: "augmentation" }, allowAdd: true }
        };

        let physicalInventoryItems = [];
        for (const [key, value] of Object.entries(inventory)) {
            const datasetType = value.dataset.type;
            const types = datasetType.split(',');
            physicalInventoryItems = physicalInventoryItems.concat(types);
        }

        let [items, spells, feats, classes, races, themes, archetypes, conditionItems, asis] = data.items.reduce((arr, item) => {
            item.img = item.img || DEFAULT_TOKEN;
            item.isStack = item.data.quantity ? item.data.quantity > 1 : false;
            item.isOnCooldown = item.data.recharge && !!item.data.recharge.value && (item.data.recharge.charged === false);
            item.hasAttack = ["mwak", "rwak", "msak", "rsak"].includes(item.data.actionType) && (!["weapon", "shield"].includes(item.type) || item.data.equipped);
            item.hasDamage = item.data.damage?.parts && item.data.damage.parts.length > 0 && (!["weapon", "shield"].includes(item.type) || item.data.equipped);
            item.hasUses = item.data.uses && (item.data.uses.max > 0);
            item.isCharged = !item.hasUses || item.data.uses?.value <= 0 || !item.isOnCooldown;

            item.hasCapacity = item.document.hasCapacity();
            if (item.hasCapacity) {
                item.capacityCurrent = item.document.getCurrentCapacity();
                item.capacityMaximum = item.document.getMaxCapacity();
            }

            if (item.type === "spell") {
                const container = data.items.find(x => x.data.container?.contents?.find(x => x.id === item._id) || false);
                if (!container) {
                    arr[1].push(item);
                } else {
                    arr[0].push(item);
                }
            }
            else if (item.type === "feat") {
                if ((item.data.requirements?.toLowerCase() || "") === "condition") {
                    arr[7].push(item);
                } else {
                    arr[2].push(item);
                }
                item.isFeat = true;
            }
            else if (item.type === "class") arr[3].push(item);
            else if (item.type === "race") arr[4].push(item);
            else if (item.type === "theme") arr[5].push(item);
            else if (item.type === "archetypes") arr[6].push(item);
            else if (item.type === "asi") arr[8].push(item);
            else if (physicalInventoryItems.includes(item.type)) arr[0].push(item);
            else arr[0].push(item);
            return arr;
        }, [[], [], [], [], [], [], [], [], []]);
        
        const spellbook = this._prepareSpellbook(data, spells);

        let totalValue = 0;
        for (const i of items) {
            i.img = i.img || DEFAULT_TOKEN;

            if (!physicalInventoryItems.includes(i.type)) {
                continue;
            }

            i.data.quantity = i.data.quantity || 0;
            i.data.price = i.data.price || 0;
            i.data.bulk = i.data.bulk || "-";
            i.isOpen = i.data.container?.isOpen === undefined ? true : i.data.container.isOpen;

            let weight = 0;
            if (i.data.bulk === "L") {
                weight = 0.1;
            } else if (i.data.bulk === "-") {
                weight = 0;
            } else {
                weight = parseFloat(i.data.bulk);
            }

            // Compute number of packs based on quantityPerPack, provided quantityPerPack is set to a value.
            let packs = 1;
            if (i.data.quantityPerPack === null || i.data.quantityPerPack === undefined) {
                packs = i.data.quantity;
            } else {
                if (i.data.quantityPerPack <= 0) {
                    packs = 0;
                } else {
                    packs = Math.floor(i.data.quantity / i.data.quantityPerPack);
                }
            }

            i.totalWeight = packs * weight;
            if (i.data.equippedBulkMultiplier !== undefined && i.data.equipped) {
                i.totalWeight *= i.data.equippedBulkMultiplier;
            }
            i.totalWeight = i.totalWeight < 1 && i.totalWeight > 0 ? "L" : 
                            i.totalWeight === 0 ? "-" : Math.floor(i.totalWeight);

            totalValue += (i.data.price * packs);
        }

        this.processItemContainment(items, function (itemType, itemData) {
            let targetItemType = itemType;
            if (!(itemType in inventory)) {
                for (let [key, entry] of Object.entries(inventory)) {
                    if (entry.dataset.type.includes(itemType)) {
                        targetItemType = key;
                        break;
                    }
                }
            }

            if (!(targetItemType in inventory)) {
                let label = "SFRPG.Items.Categories.MiscellaneousItems";
                if (targetItemType in SFRPG.itemTypes) {
                    label = SFRPG.itemTypes[targetItemType];
                } else {
                    console.log(`Item '${itemData.item.name}' with type '${targetItemType}' is not a registered item type!`);
                }
                inventory[targetItemType] = { label: game.i18n.format(label), items: [], dataset: { }, allowAdd: false };
            }
            inventory[targetItemType].items.push(itemData);
        });

        let totalWeight = 0;
        for (const section of Object.entries(inventory)) {
            for (const sectionItem of section[1].items) {
                if (!(sectionItem.item.type in inventory)) {
                    continue;
                }

                const itemBulk = computeCompoundBulkForItem(sectionItem.item, sectionItem.contents);
                totalWeight += itemBulk;
            }
        }
        totalWeight = Math.floor(totalWeight / 10); // Divide bulk by 10 to correct for integer-space bulk calculation.
        data.encumbrance = this._computeEncumbrance(totalWeight, actorData);
        data.inventoryValue = Math.floor(totalValue);

        const features = {
            classes: { label: game.i18n.format("SFRPG.ActorSheet.Features.Categories.Classes"), items: [], hasActions: false, dataset: { type: "class" }, isClass: true },
            race: { label: game.i18n.format("SFRPG.ActorSheet.Features.Categories.Race"), items: [], hasActions: false, dataset: { type: "race" }, isRace: true },
            theme: { label: game.i18n.format("SFRPG.ActorSheet.Features.Categories.Theme"), items: [], hasActions: false, dataset: { type: "theme" }, isTheme: true },
            asi: { label: game.i18n.format("SFRPG.Items.Categories.AbilityScoreIncrease"), items: asis, hasActions: false, dataset: { type: "asi" }, isASI: true },
            archetypes: { label: game.i18n.format("SFRPG.ActorSheet.Features.Categories.Archetypes"), items: [], dataset: { type: "archetypes" }, isArchetype: true },
            active: { label: game.i18n.format("SFRPG.ActorSheet.Features.Categories.ActiveFeats"), items: [], hasActions: true, dataset: { type: "feat", "activation.type": "action" } },
            passive: { label: game.i18n.format("SFRPG.ActorSheet.Features.Categories.PassiveFeats"), items: [], hasActions: false, dataset: { type: "feat" } }
        };

        for (let f of feats) {
            if (f.data.activation.type) features.active.items.push(f);
            else features.passive.items.push(f);
        }

        classes.sort((a, b) => b.levels - a.levels);
        features.classes.items = classes;
        features.race.items = races;
        features.theme.items = themes;
        features.archetypes.items = archetypes;

        data.inventory = Object.values(inventory);
        data.spellbook = spellbook;
        data.features = Object.values(features);

        const modifiers = {
            conditions: { label: "SFRPG.ModifiersConditionsTabLabel", modifiers: [], dataset: { subtab: "conditions" }, isConditions: true },
            permanent: { label: "SFRPG.ModifiersPermanentTabLabel", modifiers: [], dataset: { subtab: "permanent" } },
            temporary: { label: "SFRPG.ModifiersTemporaryTabLabel", modifiers: [], dataset: { subtab: "temporary" } }
        };

        let [permanent, temporary, itemModifiers, conditions, misc] = actorData.modifiers.reduce((arr, modifier) => {
            if (modifier.subtab === "permanent") arr[0].push(modifier);
            else if (modifier.subtab === "conditions") arr[3].push(modifier);
            else arr[1].push(modifier); // Any unspecific categories go into temporary.

            return arr;
        }, [[], [], [], [], []]);

        modifiers.conditions.items = conditionItems;
        modifiers.permanent.modifiers = permanent;
        modifiers.temporary.modifiers = temporary.concat(conditions);

        data.modifiers = Object.values(modifiers);
    }

    /**
     * Compute the level and percentage of encumbrance for an Actor.
     * 
     * @param {Number} totalWeight The cumulative item weight from inventory items
     * @param {Object} actorData The data object for the Actor being rendered
     * @returns {Object} An object describing the character's encumbrance level
     * @private
     */
    _computeEncumbrance(totalWeight, actorData) {
        const enc = {
            max: actorData.attributes.encumbrance.max,
            tooltip: actorData.attributes.encumbrance.tooltip,
            value: totalWeight
        };

        enc.pct = Math.min(enc.value * 100 / enc.max, 99);
        enc.encumbered = enc.pct > 50;
        return enc;
    }

    /**
     * Activate event listeners using the prepared sheet HTML
     * 
     * @param {JQuery} html The prepared HTML object ready to be rendered into the DOM
     */
    activateListeners(html) {
        super.activateListeners(html);

        if (!this.options.editable) return;

        //html.find('.toggle-prepared').click(this._onPrepareItem.bind(this));
        html.find('.reload').on('click', this._onReloadWeapon.bind(this));

        html.find('.short-rest').on('click', this._onShortRest.bind(this));
        html.find('.long-rest').on('click', this._onLongRest.bind(this));
        html.find('.modifier-create').on('click', this._onModifierCreate.bind(this));
        html.find('.modifier-edit').on('click', this._onModifierEdit.bind(this));
        html.find('.modifier-delete').on('click', this._onModifierDelete.bind(this));
        html.find('.modifier-toggle').on('click', this._onToggleModifierEnabled.bind(this));
    }

    onBeforeCreateNewItem(itemData) {
        super.onBeforeCreateNewItem(itemData);

        if (itemData["type"] === "asi") {
            const numASI = this.actor.items.filter(x => x.type === "asi").length;
            const level = 5 + numASI * 5;
            itemData.name = game.i18n.format("SFRPG.ItemSheet.AbilityScoreIncrease.ItemName", {level: level});
        }
    }

    /**
     * Add a modifer to this actor.
     * 
     * @param {Event} event The originating click event
     */
    _onModifierCreate(event) {
        event.preventDefault();
        const target = $(event.currentTarget);

        this.actor.addModifier({
            name: "New Modifier",
            subtab: target.data('subtab')
        });
    }

    /**
     * Delete a modifier from the actor.
     * 
     * @param {Event} event The originating click event
     */
    async _onModifierDelete(event) {
        event.preventDefault();
        const target = $(event.currentTarget);
        const modifierId = target.closest('.item.modifier').data('modifierId');
        
        await this.actor.deleteModifier(modifierId);
    }

    /**
     * Edit a modifier for an actor.
     * 
     * @param {Event} event The orginating click event
     */
    _onModifierEdit(event) {
        event.preventDefault();

        const target = $(event.currentTarget);
        const modifierId = target.closest('.item.modifier').data('modifierId');

        this.actor.editModifier(modifierId);
    }

    /**
     * Toggle a modifier to be enabled or disabled.
     * 
     * @param {Event} event The originating click event
     */
    async _onToggleModifierEnabled(event) {
        event.preventDefault();
        const target = $(event.currentTarget);
        const modifierId = target.closest('.item.modifier').data('modifierId');

        const modifiers = duplicate(this.actor.data.data.modifiers);
        const modifier = modifiers.find(mod => mod._id === modifierId);
        modifier.enabled = !modifier.enabled;

        await this.actor.update({'data.modifiers': modifiers});
    }

    /**
     * Handle toggling the prepared status of an Owned Itme within the Actor
     * 
     * @param {Event} event The triggering click event
     */
    _onPrepareItem(event) {
        event.preventDefault();

        const itemId = event.currentTarget.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);

        return item.update({'data.preparation.prepared': !item.data.data.preparation.prepared});
    }

    /**
     * Take a short 10 minute rest, calling the relevant function on the Actor instance
     * @param {Event} event The triggering click event
     * @returns {Promise}
     * @private
     */
    async _onShortRest(event) {
        event.preventDefault();
        await this._onSubmit(event);
        return this.actor.shortRest();
    }

    /**
     * Take a long rest, calling the relevant function on the Actor instance
     * @param {Event} event   The triggering click event
     * @returns {Promise}
     * @private
     */
    async _onLongRest(event) {
        event.preventDefault();
        await this._onSubmit(event);
        return this.actor.longRest();
    }
}
