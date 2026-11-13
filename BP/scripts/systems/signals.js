import { system } from "@minecraft/server";
import { config } from "../config";

export const startReasons = { hit: "hit", command: "command" };

export const endReasons = {
	timeout: "timeout",
	death: "death",
	logout: "logout",
	command: "command",
	exempt: "exempt",
	disabled: "disabled"
};

const send = ({ id, payload }) => system.sendScriptEvent(id, JSON.stringify(payload));

const toKiller = damageSource => {
	const killer = damageSource.damagingEntity;

	return killer ? { killerId: killer.id, killerTypeId: killer.typeId } : {};
};

export const announceStart = ({ player, reason, opponent }) => send({
	id: config.general.scriptEvents.started,
	payload: { playerId: player.id, reason, ...(opponent ? { opponentId: opponent.id } : {}) }
});

export const announceEnd = ({ playerId, reason, damageSource }) => send({
	id: config.general.scriptEvents.ended,
	payload: {
		playerId,
		reason,
		...(damageSource ? { cause: damageSource.cause, ...toKiller(damageSource) } : {})
	}
});

export const announceState = ({ player, session, requestId }) => {
	const isInCombat = session?.shouldAnnounceEnd() ?? false;

	send({
		id: config.general.scriptEvents.state,
		payload: {
			requestId,
			playerId: player.id,
			isInCombat,
			secondsLeft: isInCombat ? session.getSecondsLeft() : 0,
			opponents: isInCombat ? session.getOpponents() : []
		}
	});
};

export const announceMissing = ({ reference, requestId }) => send({
	id: config.general.scriptEvents.state,
	payload: { requestId, error: "playerNotFound", player: reference }
});
