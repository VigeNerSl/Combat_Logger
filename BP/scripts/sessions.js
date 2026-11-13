import { system, TicksPerSecond } from "@minecraft/server";
import { config } from "./config";
import { Settings } from "./storage";

class CombatSession {
	#lastHitTick = -Infinity;
	#lastShownSecond = -1;
	#lastShownTick = -Infinity;
	#lastMessageTick = -Infinity;
	#opponents = new Set();
	#hasAnnouncedEnd = true;

	isInCombat() {
		return this.#getTicksLeft() > 0;
	}

	getSecondsLeft() {
		return Math.max(0, Math.ceil(this.#getTicksLeft() / TicksPerSecond));
	}

	getOpponents() {
		return [...this.#opponents];
	}

	triggerCombat(opponentName) {
		this.#lastHitTick = system.currentTick;
		this.#opponents.add(opponentName);
		this.#hasAnnouncedEnd = false;
	}

	endCombat() {
		this.#lastHitTick = -Infinity;
		this.#opponents.clear();
		this.#lastShownSecond = -1;
		this.#hasAnnouncedEnd = true;
	}

	shouldAnnounceEnd() {
		return !this.#hasAnnouncedEnd;
	}

	isSecondShown(second) {
		return this.#lastShownSecond === second
			&& (system.currentTick - this.#lastShownTick) < config.limits.timerRefreshTicks;
	}

	markSecondShown(second) {
		this.#lastShownSecond = second;
		this.#lastShownTick = system.currentTick;
	}

	isMessageAllowed() {
		return (system.currentTick - this.#lastMessageTick) >= config.limits.messageCooldownTicks;
	}

	markMessageSent() {
		this.#lastMessageTick = system.currentTick;
	}

	#getTicksLeft() {
		return Settings.combatTicks() - (system.currentTick - this.#lastHitTick);
	}
}

export class Sessions {
	static #sessions = new Map();

	static of(playerId) {
		const existing = this.#sessions.get(playerId);
		if (existing) return existing;

		const session = new CombatSession();
		this.#sessions.set(playerId, session);
		return session;
	}

	static find(playerId) {
		return this.#sessions.get(playerId) ?? null;
	}

	static forget(playerId) {
		this.#sessions.delete(playerId);
	}
}
