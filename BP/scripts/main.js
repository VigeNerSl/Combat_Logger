import { world, system } from "@minecraft/server";
import { config } from "./config";
import { ItemRules, Settings, Offenders } from "./storage";
import { Sessions } from "./sessions";
import {
	blockInteractionOnCooldown,
	blockItemOnCooldown,
	blockPickupBeforeDeath,
	blockRestrictedInteraction,
	blockRestrictedItem,
	cancelDeath,
	clearCombat,
	endReasons,
	forgetCombat,
	forgetConsumption,
	handleCombatEvent,
	handleLeave,
	leaseBlockedCooldowns,
	logCombatLeave,
	punishOnJoin,
	registerHit,
	releaseConsumption,
	serveDeath,
	startCooldownAfterBlockUse,
	startCooldownAfterConsume,
	startCooldownAfterUse,
	trackConsumption,
	updateCombat
} from "./systems/index";
import "./commands";

const releaseEveryone = () => {
	world.getPlayers({ tags: [config.general.combatTag] }).forEach(player => clearCombat({ player, reason: endReasons.disabled }));
};

const tick = () => {
	if (!Settings.get("isEnabled")) {
		releaseEveryone();
		return;
	}

	for (const player of world.getPlayers()) {
		updateCombat({ player, session: Sessions.of(player.id) });
		leaseBlockedCooldowns(player);
	}
};

const death = vigenersl => {
	const { deadEntity, damageSource } = vigenersl;
	logCombatLeave(deadEntity);
	clearCombat({ player: deadEntity, reason: endReasons.death, damageSource });
	serveDeath(deadEntity.id);
};

const left = vigenersl => {
	const { playerId } = vigenersl;
	forgetCombat(playerId);
	cancelDeath(playerId);
	forgetConsumption(playerId);
};

world.afterEvents.worldLoad.subscribe(() => {
	Settings.initialize();
	ItemRules.initialize();
	Offenders.initialize();
});

world.afterEvents.entityHurt.subscribe(registerHit, { entityTypes: ["minecraft:player"] });
world.afterEvents.entityDie.subscribe(death, { entityTypes: ["minecraft:player"] });
world.beforeEvents.playerLeave.subscribe(handleLeave);
world.afterEvents.playerLeave.subscribe(left);
world.afterEvents.playerSpawn.subscribe(punishOnJoin);
system.afterEvents.scriptEventReceive.subscribe(handleCombatEvent, { namespaces: ["vigenersl"] });

world.beforeEvents.entityItemPickup.subscribe(blockPickupBeforeDeath);
world.beforeEvents.itemUse.subscribe(blockRestrictedItem);
world.beforeEvents.playerInteractWithBlock.subscribe(blockRestrictedInteraction);
world.beforeEvents.itemUse.subscribe(blockItemOnCooldown);
world.beforeEvents.playerInteractWithBlock.subscribe(blockInteractionOnCooldown);
world.afterEvents.itemUse.subscribe(startCooldownAfterUse);
world.afterEvents.itemStartUse.subscribe(trackConsumption);
world.afterEvents.itemStopUse.subscribe(releaseConsumption);
world.afterEvents.itemCompleteUse.subscribe(startCooldownAfterConsume);
world.afterEvents.itemReleaseUse.subscribe(startCooldownAfterConsume);
world.afterEvents.playerInteractWithBlock.subscribe(startCooldownAfterBlockUse);

system.runInterval(tick, config.general.tickInterval);
