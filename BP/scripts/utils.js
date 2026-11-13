import { BlockTypes, EquipmentSlot } from "@minecraft/server";
import { config } from "./config";
import { Sessions } from "./sessions";

export const equipmentSlots = [
	EquipmentSlot.Head,
	EquipmentSlot.Chest,
	EquipmentSlot.Legs,
	EquipmentSlot.Feet,
	EquipmentSlot.Offhand
];

export const getBelongings = player => {
	const container = player.getComponent("minecraft:inventory")?.container;
	const equippable = player.getComponent("minecraft:equippable");
	if (!container || !equippable) return null;

	return { container, equippable, cursor: player.getComponent("minecraft:cursor_inventory") };
};

export const getHeldItem = player => player.getComponent("minecraft:equippable").getEquipment(EquipmentSlot.Mainhand) ?? null;

const isUsedOnBlocks = typeId => BlockTypes.get(typeId) !== undefined || config.restrictions.blockUseItems.includes(typeId);

const isOpenedByClick = ({ player, block }) => {
	if (player.isSneaking) return false;

	const { typeId } = block;
	if (config.restrictions.notOpeningBlocks.some(part => typeId.includes(part))) return false;

	return config.restrictions.openingBlocks.some(part => typeId.includes(part))
		|| config.restrictions.openingComponents.some(componentId => block.hasComponent(componentId));
};

export const isItemUsedOnBlock = ({ player, itemStack, block }) => itemStack !== undefined
	&& isUsedOnBlocks(itemStack.typeId)
	&& !isOpenedByClick({ player, block });

export const toChestPoint = ({ x, y, z }) => ({ x, y: y + 1, z });

export const spawnExperienceOrbs = ({ dimension, points, location }) => {
	let spawned = 0;
	while (spawned < points) {
		try {
			dimension.spawnEntity("minecraft:xp_orb", location);
		} catch {
			// The location is outside the world (a player in the void) or its chunk is not loaded: no
			// further orb will land either, so the loop stops and the caller gets the count that landed.
			break;
		}
		spawned++;
	}

	return spawned;
};

export const toTranslation = ({ key, substitutions = [] }) => (substitutions.length
	? { translate: key, with: substitutions }
	: { translate: key });

const incidentKeys = {
	[config.incidentKinds.enterHit]: config.messages.logEnterHit,
	[config.incidentKinds.enterHurt]: config.messages.logEnterHurt,
	[config.incidentKinds.enterForced]: config.messages.logEnterForced,
	[config.incidentKinds.leave]: config.messages.logLeave
};

export const toIncidentLines = entries => (entries.length
	? entries.map(entry => toTranslation({
		key: incidentKeys[entry.kind],
		substitutions: [entry.time, entry.name, entry.opponents.join(", ")]
	}))
	: [toTranslation({ key: config.messages.logEmpty })]);

export const joinLines = (lines, gap = "\n") => lines.flatMap(line => [line, { text: gap }]).slice(0, -1);

export const reply = ({ player, key, substitutions }) => player.sendMessage(toTranslation({ key, substitutions }));

export const replyLines = ({ player, lines }) => player.sendMessage({ rawtext: joinLines(lines) });

export const notify = ({ player, key, substitutions }) => {
	const session = Sessions.of(player.id);
	if (!session.isMessageAllowed()) return;

	session.markMessageSent();
	reply({ player, key, substitutions });
};
