import { config } from "../config";
import { ItemRules, Settings } from "../storage";
import { isItemUsedOnBlock, notify } from "../utils";
import { isInCombat } from "./combat";
import { findCooldownTraits } from "./cooldowns";

const categories = new Map();

const readCategory = typeId => findCooldownTraits(typeId)?.category ?? null;

const categoryOf = typeId => {
	if (!categories.has(typeId)) categories.set(typeId, readCategory(typeId));

	return categories.get(typeId);
};

const shouldBlockItems = () => Settings.get("isEnabled") && Settings.get("shouldBlockItemsInCombat");

const block = ({ vigenersl, player, itemStack }) => {
	if (vigenersl.cancel || itemStack === undefined) return;
	if (!shouldBlockItems()) return;

	if (!ItemRules.isBlocked(itemStack.typeId)) return;
	if (!isInCombat(player)) return;

	vigenersl.cancel = true;
	notify({ player, key: config.messages.blocked });
};

export const blockRestrictedItem = vigenersl => {
	const { source, itemStack } = vigenersl;
	block({ vigenersl, player: source, itemStack });
};

export const blockRestrictedInteraction = vigenersl => {
	const { player, itemStack } = vigenersl;
	if (!isItemUsedOnBlock(vigenersl)) return;

	block({ vigenersl, player, itemStack });
};

export const leaseBlockedCooldowns = player => {
	if (!shouldBlockItems() || !isInCombat(player)) return;

	for (const typeId of ItemRules.blocked()) {
		const category = categoryOf(typeId);
		if (category !== null) player.startItemCooldown(category, config.limits.blockLeaseTicks);
	}
};
