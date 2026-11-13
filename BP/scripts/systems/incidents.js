import { config } from "../config";
import { Incidents, Settings } from "../storage";

const toTwoDigits = value => String(value).padStart(2, "0");

const formatUtcTime = () => {
	const now = new Date();
	const day = toTwoDigits(now.getUTCDate());
	const month = toTwoDigits(now.getUTCMonth() + 1);
	const hours = toTwoDigits(now.getUTCHours());
	const minutes = toTwoDigits(now.getUTCMinutes());
	const seconds = toTwoDigits(now.getUTCSeconds());

	return `${day}.${month} ${hours}:${minutes}:${seconds}`;
};

export const logCombatEvent = ({ kind, name, opponents }) => {
	if (!Settings.get("shouldLogIncidents")) return;

	const known = opponents.filter(opponent => opponent.length > 0);

	Incidents.add({
		kind,
		name,
		opponents: known.length ? known : [config.ui.unknownOpponent],
		time: formatUtcTime()
	});
};

export const logLeave = ({ player, session }) => logCombatEvent({
	kind: config.incidentKinds.leave,
	name: player.name,
	opponents: session.getOpponents()
});
