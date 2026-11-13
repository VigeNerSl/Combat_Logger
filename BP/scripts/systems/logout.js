import { system, world } from "@minecraft/server";
import { config } from "../config";
import { warn } from "../logger";
import { Settings, Offenders } from "../storage";
import { Sessions } from "../sessions";
import { equipmentSlots, getBelongings, spawnExperienceOrbs, toChestPoint } from "../utils";
import { isExempt } from "./exemptions";
import { logLeave } from "./incidents";

const readLoot = player => {
	const belongings = getBelongings(player);
	if (!belongings) return;

	const { container, equippable, cursor } = belongings;
	const items = [
		...Array.from({ length: container.size }, (_, slotIndex) => container.getItem(slotIndex)),
		...equipmentSlots.map(slot => equippable.getEquipment(slot)),
		cursor?.item?.clone()
	].filter(item => item !== undefined);

	return {
		playerId: player.id,
		dimensionId: player.dimension.id,
		location: toChestPoint(player.location),
		items,
		levels: player.level,
		totalExperience: player.getTotalXp()
	};
};

const toDroppedExperience = levels => Math.min(
	config.limits.maxExperienceDropped,
	Math.max(0, levels) * config.limits.experiencePerLevel
);

const spawnItem = ({ dimension, item, location }) => {
	try {
		dimension.spawnItem(item, location);
		return true;
	} catch {
		// The location is outside the world (a player in the void) or its chunk is not loaded.
		return false;
	}
};

const placeLoot = ({ dimension, location, items, points }) => ({
	items: items.filter(item => !spawnItem({ dimension, item, location })),
	points: points - spawnExperienceOrbs({ dimension, points, location })
});

const isAnyPlaced = ({ left, loot }) => left.items.length < loot.items.length || left.points < loot.points;

const isEmptyLoot = loot => loot.items.length === 0 && loot.points === 0;

const isDropPending = playerId => Offenders.has(playerId) && !Offenders.hasReturned(playerId);

const placeUnderTickingArea = async ({ playerId, dimension, location, loot, place }) => {
	const manager = world.tickingAreaManager;
	const identifier = `${config.general.tickingAreaPrefix}${playerId}_${system.currentTick}`;
	const corner = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
	const area = { dimension, from: corner, to: corner };

	if (!manager.hasCapacity(area)) return loot;

	try {
		await manager.createTickingArea(identifier, area);

		if (!isDropPending(playerId)) return loot;

		return place(loot);
	} finally {
		// The area is temporary and must go on every exit; after a failed creation there is none.
		if (manager.hasTickingArea(identifier)) manager.removeTickingArea(identifier);
	}
};

const dropLoot = async ({ playerId, dimensionId, location, items, levels, totalExperience }) => {
	const dimension = world.getDimension(dimensionId);
	const loot = { items, points: toDroppedExperience(levels) };
	const place = source => {
		const left = placeLoot({ dimension, location, ...source });
		if (isAnyPlaced({ left, loot: source })) Offenders.markDropped({ id: playerId, savedExperience: totalExperience });

		return left;
	};

	let left = dimension.isChunkLoaded(location) ? place(loot) : loot;
	if (!isEmptyLoot(left)) left = await placeUnderTickingArea({ playerId, dimension, location, loot: left, place });

	if (isEmptyLoot(left)) return;

	const message = isAnyPlaced({ left, loot })
		? `${left.items.length} items and ${left.points} experience points could not be dropped and are lost`
		: `${left.items.length} items could not be dropped at the logout point; the inventory will be kept`;
	warn(message);
};

export const handleLeave = vigenersl => {
	const { player } = vigenersl;
	if (!Settings.get("isEnabled")) return;

	const session = Sessions.find(player.id);
	if (!session?.isInCombat()) return;

	if (isExempt(player)) return;

	const isPending = Offenders.has(player.id);
	if (Settings.get("shouldPunishOnReturn") || Settings.get("shouldDropOnLeave")) {
		Offenders.add({ id: player.id, name: player.name });
	}
	logLeave({ player, session });

	if (!Settings.get("shouldDropOnLeave") || isPending) return;

	const loot = readLoot(player);
	if (!loot) {
		warn(`${player.name} left with an unreadable inventory; nothing dropped, the inventory will be kept`);
		return;
	}

	system.run(() => dropLoot(loot).catch(error => {
		// An unhandled rejection from an async function leaves no trace in the log, and a silent
		// failure here would hide a drop that did not happen.
		warn(`the drop failed: ${error}`);
	}));
};
