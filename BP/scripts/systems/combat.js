import { config } from "../config";
import { Settings } from "../storage";
import { Sessions } from "../sessions";
import { isExempt } from "./exemptions";
import { logCombatEvent, logLeave } from "./incidents";
import { announceEnd, announceStart, endReasons, startReasons } from "./signals";

const addCombatTag = player => {
	player.addTag(config.general.combatTag);
};

const removeCombatTag = player => {
	player.removeTag(config.general.combatTag);
};

const showTimer = ({ player, session }) => {
	const seconds = session.getSecondsLeft();
	if (session.isSecondShown(seconds)) return;

	session.markSecondShown(seconds);
	player.onScreenDisplay.setActionBar({ translate: config.messages.timer, with: [String(seconds)] });
};

const finishCombat = ({ player, session }) => {
	logLeave({ player, session });
	session.endCombat();

	player.sendMessage({ translate: config.messages.endedChat });
	if (Settings.get("shouldShowActionBar")) player.onScreenDisplay.setActionBar({ translate: config.messages.endedBar });
	announceEnd({ playerId: player.id, reason: endReasons.timeout });
};

const enterCombat = ({ player, opponent, kind, reason }) => {
	const session = Sessions.of(player.id);
	const isEntering = !session.shouldAnnounceEnd();
	const opponentName = opponent?.name ?? config.ui.forcedOpponent;

	session.triggerCombat(opponentName);
	addCombatTag(player);
	if (!isEntering) return;

	logCombatEvent({ kind, name: player.name, opponents: [opponentName] });
	announceStart({ player, reason, opponent });
};

export const registerHit = vigenersl => {
	const { hurtEntity, damageSource } = vigenersl;
	if (!Settings.get("isEnabled")) return;

	const attacker = damageSource.damagingEntity;
	if (attacker?.typeId !== "minecraft:player") return;
	if (attacker.id === hurtEntity.id) return;
	if (isExempt(hurtEntity) || isExempt(attacker)) return;

	enterCombat({ player: attacker, opponent: hurtEntity, kind: config.incidentKinds.enterHit, reason: startReasons.hit });
	enterCombat({ player: hurtEntity, opponent: attacker, kind: config.incidentKinds.enterHurt, reason: startReasons.hit });
};

export const forceCombat = ({ player, opponent = null }) => {
	if (!Settings.get("isEnabled")) return;
	if (opponent?.id === player.id) return;
	if (isExempt(player) || (opponent && isExempt(opponent))) return;

	const kind = config.incidentKinds.enterForced;
	enterCombat({ player, opponent, kind, reason: startReasons.command });
	if (opponent) enterCombat({ player: opponent, opponent: player, kind, reason: startReasons.command });
};

export const logCombatLeave = player => {
	const session = Sessions.find(player.id);
	if (!session?.shouldAnnounceEnd()) return;

	logLeave({ player, session });
};

export const updateCombat = ({ player, session }) => {
	if (!session.isInCombat()) {
		removeCombatTag(player);
		if (session.shouldAnnounceEnd()) finishCombat({ player, session });
		return;
	}

	if (isExempt(player)) {
		clearCombat({ player, reason: endReasons.exempt });
		return;
	}

	addCombatTag(player);
	if (Settings.get("shouldShowActionBar")) showTimer({ player, session });
};

export const clearCombat = ({ player, reason, damageSource }) => {
	removeCombatTag(player);

	const session = Sessions.find(player.id);
	if (!session?.shouldAnnounceEnd()) return;

	session.endCombat();
	announceEnd({ playerId: player.id, reason, damageSource });
};

export const forgetCombat = playerId => {
	if (Sessions.find(playerId)?.shouldAnnounceEnd()) announceEnd({ playerId, reason: endReasons.logout });

	Sessions.forget(playerId);
};

export const isInCombat = player => Sessions.find(player.id)?.isInCombat() ?? false;
