import { world } from "@minecraft/server";
import { config } from "../config";
import { warn } from "../logger";
import { Sessions } from "../sessions";
import { clearCombat, forceCombat } from "./combat";
import { announceMissing, announceState, endReasons } from "./signals";

const { enter, leave, query } = config.general.scriptEvents;

const isPlayer = entity => entity?.typeId === "minecraft:player";

const findById = reference => {
	if (!/^-?\d+$/.test(reference)) return undefined;

	try {
		return world.getEntity(reference);
	} catch {
		// A number outside the 64-bit id range is rejected by the engine; the reference is then tried as a name.
		return undefined;
	}
};

const findPlayer = reference => {
	const byId = findById(reference);
	if (isPlayer(byId)) return byId;

	return world.getPlayers({ name: reference })[0];
};

const readFields = text => {
	if (!text.startsWith("{")) return { player: text };

	try {
		return JSON.parse(text);
	} catch {
		// Malformed JSON from another add-on: it is reported as a missing player instead of breaking the handler.
		return null;
	}
};

const readRequest = ({ message, sourceEntity }) => {
	const text = message.trim();
	const fields = text.length > 0 ? readFields(text) : {};
	if (fields === null) return { reference: text };

	const reference = fields.player == null ? "" : String(fields.player);
	const hasReference = reference.length > 0;
	const sourcePlayer = isPlayer(sourceEntity) ? sourceEntity : undefined;

	return {
		reference: hasReference ? reference : text,
		player: hasReference ? findPlayer(reference) : sourcePlayer,
		opponent: fields.opponent == null ? null : findPlayer(String(fields.opponent)),
		requestId: fields.requestId
	};
};

const actions = {
	[enter]: ({ player, opponent }) => {
		if (opponent === undefined) return false;

		forceCombat({ player, opponent });
		return true;
	},

	[leave]: ({ player }) => {
		clearCombat({ player, reason: endReasons.command });
		return true;
	},

	[query]: ({ player, requestId }) => {
		announceState({ player, session: Sessions.find(player.id), requestId });
		return true;
	}
};

export const handleCombatEvent = vigenersl => {
	const { id, message, sourceEntity } = vigenersl;
	const action = actions[id];
	if (!action) return;

	const request = readRequest({ message, sourceEntity });
	if (request.player && action(request)) return;

	if (id === query) announceMissing({ reference: request.reference, requestId: request.requestId });
	warn(`${id}: player or opponent not found in "${message}"`);
};
