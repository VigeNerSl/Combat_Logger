import { system, world } from "@minecraft/server";
import { config } from "../config";
import { warn } from "../logger";
import { Settings, Offenders } from "../storage";
import { equipmentSlots, getBelongings, spawnExperienceOrbs, toChestPoint } from "../utils";
import { clearCombat } from "./combat";
import { endReasons } from "./signals";

const pendingReturns = new Map();

const clearBelongings = player => {
	const belongings = getBelongings(player);
	if (!belongings) return false;

	const { container, equippable, cursor } = belongings;
	container.clearAll();
	equipmentSlots.forEach(slot => equippable.setEquipment(slot));
	cursor?.clear();
	player.resetLevel();

	return true;
};

const toEatenExperience = ({ player, record }) => (record.hasDropped && record.savedExperience !== null
	? Math.max(0, player.getTotalXp() - record.savedExperience)
	: 0);

const shouldPunish = () => Settings.get("isEnabled") && Settings.get("shouldPunishOnReturn");

const releaseWithoutDeath = ({ player, record, eatenExperience }) => {
	Offenders.remove(record.id);
	if (eatenExperience > 0) player.addExperience(eatenExperience);
};

const forgetReturn = playerId => {
	const handle = pendingReturns.get(playerId);
	if (handle === undefined) return false;

	system.clearRun(handle);
	pendingReturns.delete(playerId);

	return true;
};

const scheduleReturn = ({ playerId, ticks, action }) => {
	forgetReturn(playerId);

	pendingReturns.set(playerId, system.runTimeout(() => {
		pendingReturns.delete(playerId);
		action();
	}, ticks));
};

const killLater = ({ playerId, eatenExperience }) => scheduleReturn({
	playerId,
	ticks: config.limits.punishDelayTicks,
	action: () => {
		const record = Offenders.get(playerId);
		const target = world.getEntity(playerId);
		if (!record || !target) return;
		if (!shouldPunish()) {
			releaseWithoutDeath({ player: target, record, eatenExperience });
			return;
		}

		const pointsEatenAfterJoin = record.hasDropped ? target.getTotalXp() : 0;
		const points = Math.min(config.limits.maxExperienceDropped, eatenExperience + pointsEatenAfterJoin);
		const { dimension } = target;
		const location = toChestPoint(target.location);

		if (record.hasDropped) target.resetLevel();
		if (!target.kill() && !clearBelongings(target)) {
			warn(`${target.name} could not be killed or cleared; the record is kept for the next join`);
			return;
		}

		Offenders.remove(record.id);
		spawnExperienceOrbs({ dimension, points, location });
		// Sent with the death, not on the join tick: then the client may still be loading and shows the raw key.
		target.sendMessage({ translate: config.messages.punished });
	}
});

const finishReturn = ({ player, record, eatenExperience }) => {
	if (!shouldPunish()) {
		releaseWithoutDeath({ player, record, eatenExperience });
		return;
	}

	killLater({ playerId: player.id, eatenExperience });
};

const retryClearing = ({ playerId, eatenExperience, attempt }) => scheduleReturn({
	playerId,
	ticks: config.limits.clearRetryTicks,
	action: () => {
		const record = Offenders.get(playerId);
		const player = world.getEntity(playerId);
		if (!record || !player) return;

		if (clearBelongings(player)) {
			finishReturn({ player, record, eatenExperience });
			return;
		}

		if (attempt >= config.limits.clearRetries) {
			warn(`${player.name}'s belongings could not be cleared after ${attempt} retries; the record is kept`);
			return;
		}

		retryClearing({ playerId, eatenExperience, attempt: attempt + 1 });
	}
});

export const blockPickupBeforeDeath = vigenersl => {
	const { entity } = vigenersl;
	if (!Offenders.hasAny()) return;

	if (Offenders.get(entity.id)?.hasDropped) vigenersl.cancel = true;
};

export const cancelDeath = playerId => {
	forgetReturn(playerId);
};

export const serveDeath = playerId => {
	if (!forgetReturn(playerId)) return;

	Offenders.remove(playerId);
};

export const punishOnJoin = vigenersl => {
	const { player, initialSpawn } = vigenersl;
	if (!initialSpawn) return;

	clearCombat({ player, reason: endReasons.logout });

	const record = Offenders.get(player.id);
	if (!record) return;

	Offenders.markReturned(player.id);
	const eatenExperience = toEatenExperience({ player, record });

	if (record.hasDropped && !clearBelongings(player)) {
		retryClearing({ playerId: player.id, eatenExperience, attempt: 1 });
		return;
	}

	finishReturn({ player, record, eatenExperience });
};
