import { GameMode, PlayerPermissionLevel } from "@minecraft/server";
import { config } from "../config";
import { Settings } from "../storage";

const isOperator = player => player.playerPermissionLevel === PlayerPermissionLevel.Operator;

const isCreativeOrSpectator = player => {
	const gameMode = player.getGameMode();
	return gameMode === GameMode.Creative || gameMode === GameMode.Spectator;
};

export const isExempt = player => {
	if (player.hasTag(config.general.bypassTag)) return true;
	if (Settings.get("isCreativeExempt") && isCreativeOrSpectator(player)) return true;

	return Settings.get("isOperatorExempt") && isOperator(player);
};

export const isAdmin = player => player.hasTag(config.general.adminTag) || isOperator(player);
