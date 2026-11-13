import { ItemStack, system, TicksPerSecond } from "@minecraft/server";
import { config } from "../config";
import { ItemRules, Settings } from "../storage";
import { isItemUsedOnBlock, notify } from "../utils";
import { isInCombat } from "./combat";

const consuming = new Set();

const startCooldown = ({ player, rule }) => {
	if (!player.isValid) return;
	if (Settings.get("isCooldownOnlyInCombat") && !isInCombat(player)) return;

	player.startItemCooldown(rule.category, rule.seconds * TicksPerSecond);
};

const findRule = itemStack => (Settings.get("isEnabled") && itemStack !== undefined
	? ItemRules.cooldown(itemStack.typeId)
	: null);

const start = ({ player, itemStack }) => {
	const rule = findRule(itemStack);
	if (rule) startCooldown({ player, rule });
};

const refuse = ({ vigenersl, player, itemStack }) => {
	if (vigenersl.cancel) return;

	const rule = findRule(itemStack);
	if (!rule) return;

	const remainingTicks = player.getItemCooldown(rule.category);
	if (remainingTicks <= 0) return;

	vigenersl.cancel = true;
	notify({
		player,
		key: config.messages.cooldown,
		substitutions: [String(Math.ceil(remainingTicks / TicksPerSecond))]
	});
};

const isSpent = ({ before, after }) => before !== undefined && (after === undefined || after.amount < before.amount);

const getCooldownTraits = itemStack => {
	const category = itemStack.getComponent("minecraft:cooldown")?.cooldownCategory;
	const isConsumed = itemStack.hasComponent("minecraft:food") || itemStack.typeId === "minecraft:potion";

	return { category: category?.length > 0 ? category : itemStack.typeId, mode: isConsumed ? "charged" : "instant" };
};

export const blockItemOnCooldown = vigenersl => {
	const { source, itemStack } = vigenersl;
	refuse({ vigenersl, player: source, itemStack });
};

export const blockInteractionOnCooldown = vigenersl => {
	const { player, itemStack } = vigenersl;
	if (!isItemUsedOnBlock(vigenersl)) return;

	refuse({ vigenersl, player, itemStack });
};

export const trackConsumption = vigenersl => {
	const { source } = vigenersl;
	consuming.add(source.id);
};

export const releaseConsumption = vigenersl => {
	const { source } = vigenersl;
	consuming.delete(source.id);
};

export const forgetConsumption = playerId => {
	consuming.delete(playerId);
};

export const startCooldownAfterUse = vigenersl => {
	const { source, itemStack } = vigenersl;
	system.run(() => {
		if (!consuming.has(source.id)) start({ player: source, itemStack });
	});
};

export const startCooldownAfterConsume = vigenersl => {
	const { source, itemStack } = vigenersl;
	start({ player: source, itemStack });
};

export const startCooldownAfterBlockUse = vigenersl => {
	const { player, itemStack, beforeItemStack } = vigenersl;
	if (isSpent({ before: beforeItemStack, after: itemStack })) start({ player, itemStack: beforeItemStack });
};

export const findCooldownTraits = typeId => {
	try {
		return getCooldownTraits(new ItemStack(typeId));
	} catch {
		// The type is unknown (the addon that added it is gone): there is nothing to read the traits from.
		return null;
	}
};
