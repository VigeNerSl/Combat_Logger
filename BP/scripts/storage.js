import { world, TicksPerSecond } from "@minecraft/server";
import { config } from "./config";
import { warn } from "./logger";

class Storage {
	static read(key) {
		try {
			const raw = world.getDynamicProperty(key);
			return typeof raw === "string" && raw.length ? JSON.parse(raw) : null;
		} catch {
			// Corrupt JSON or an unreadable property: treated as no data instead of crashing on startup.
			return null;
		}
	}

	static write(key, value) {
		try {
			world.setDynamicProperty(key, JSON.stringify(value));
			return true;
		} catch {
			// The world rejected the write (for example the value is too long); the result tells the caller.
			return false;
		}
	}

	static delete(key) {
		world.setDynamicProperty(key, undefined);
	}
}

const toSeconds = (value, fallback) => (Number.isFinite(value)
	? Math.round(Math.min(config.limits.maxCombatSeconds, Math.max(config.limits.minCombatSeconds, value)))
	: fallback);

const toFlag = (value, fallback) => (typeof value === "boolean" ? value : fallback);

const normalizers = { combatSeconds: toSeconds };

const normalize = ({ values, fallback }) => Object.fromEntries(
	Object.keys(config.defaults).map(name => [name, (normalizers[name] ?? toFlag)(values[name], fallback[name])])
);

export class Settings {
	static #values = { ...config.defaults };

	static initialize() {
		const saved = Storage.read(config.general.settingsKey);
		if (!saved) return;

		this.#values = normalize({ values: saved, fallback: config.defaults });
	}

	static get(name) {
		return this.#values[name];
	}

	static all() {
		return { ...this.#values };
	}

	static combatTicks() {
		return this.#values.combatSeconds * TicksPerSecond;
	}

	static apply(values) {
		this.#values = normalize({ values, fallback: this.#values });

		return Storage.write(config.general.settingsKey, this.#values);
	}
}

const itemModes = ["instant", "charged"];

export const cooldownRange = { min: 1, max: Math.floor(config.limits.maxCooldownTicks / TicksPerSecond) };

const toTypeId = value => (typeof value === "string" && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value) ? value : null);

const toRule = value => {
	const isValid = typeof value?.category === "string" && value.category.length > 0
		&& itemModes.includes(value.mode) && Number.isFinite(value.seconds);
	if (!isValid) return null;

	return {
		category: value.category,
		mode: value.mode,
		seconds: Math.min(cooldownRange.max, Math.max(cooldownRange.min, Math.round(value.seconds)))
	};
};

const defaultRules = () => ({
	blocked: [...config.restrictions.blockedItems],
	cooldowns: Object.fromEntries(itemModes.flatMap(mode => (
		Object.entries(config.cooldowns[mode])
			.filter(([, rule]) => rule.seconds > 0)
			.map(([typeId, rule]) => [typeId, { ...rule, mode }])
	)))
});

const normalizeRules = values => {
	const { maxItemRules } = config.limits;
	const blocked = Array.isArray(values.blocked) ? values.blocked.map(toTypeId).filter(typeId => typeId !== null) : [];
	const cooldowns = Object.entries(values.cooldowns ?? {})
		.map(([typeId, rule]) => [toTypeId(typeId), toRule(rule)])
		.filter(([typeId, rule]) => typeId !== null && rule !== null);

	return {
		blocked: [...new Set(blocked)].slice(0, maxItemRules),
		cooldowns: Object.fromEntries(cooldowns.slice(0, maxItemRules))
	};
};

export class ItemRules {
	static #values = normalizeRules(defaultRules());

	static initialize() {
		const saved = Storage.read(config.general.itemRulesKey);
		if (saved === null || typeof saved !== "object") return;

		this.#values = normalizeRules(saved);
	}

	static isBlocked(typeId) {
		return this.#values.blocked.includes(typeId);
	}

	static blocked() {
		return [...this.#values.blocked];
	}

	static cooldown(typeId) {
		const rule = this.#values.cooldowns[typeId];

		return rule ? { ...rule } : null;
	}

	static cooldowns() {
		return Object.entries(this.#values.cooldowns).map(([typeId, rule]) => ({ typeId, ...rule }));
	}

	static block(typeId) {
		const { blocked } = this.#values;
		if (blocked.includes(typeId)) return true;
		if (toTypeId(typeId) === null || blocked.length >= config.limits.maxItemRules) return false;

		return this.#keep({ ...this.#values, blocked: [...blocked, typeId] });
	}

	static unblock(typeId) {
		const { blocked } = this.#values;
		if (!blocked.includes(typeId)) return true;

		return this.#keep({ ...this.#values, blocked: blocked.filter(blockedId => blockedId !== typeId) });
	}

	static setCooldown({ typeId, rule }) {
		const { cooldowns } = this.#values;
		const checked = toRule(rule);
		if (checked === null || toTypeId(typeId) === null) return false;
		const isNew = cooldowns[typeId] === undefined;
		if (isNew && Object.keys(cooldowns).length >= config.limits.maxItemRules) return false;

		return this.#keep({ ...this.#values, cooldowns: { ...cooldowns, [typeId]: checked } });
	}

	static removeCooldown(typeId) {
		if (this.#values.cooldowns[typeId] === undefined) return true;

		const kept = Object.entries(this.#values.cooldowns).filter(([cooldownId]) => cooldownId !== typeId);
		return this.#keep({ ...this.#values, cooldowns: Object.fromEntries(kept) });
	}

	static #keep(values) {
		this.#values = values;

		return Storage.write(config.general.itemRulesKey, values);
	}
}

const toRecord = ({ id, name, hasDropped, savedExperience }) => ({
	id,
	name,
	hasDropped: hasDropped === true,
	savedExperience: Number.isFinite(savedExperience) ? savedExperience : null
});

export class Offenders {
	static #records = new Map();
	static #returnedIds = new Set();

	static initialize() {
		world.getDynamicPropertyIds()
			.filter(key => key.startsWith(config.general.offenderKeyPrefix))
			.map(key => Storage.read(key))
			.filter(saved => typeof saved?.id === "string" && typeof saved.name === "string")
			.forEach(saved => this.#records.set(saved.id, toRecord(saved)));
	}

	static add({ id, name }) {
		const existing = this.#records.get(id);
		if (!existing) {
			this.#store(toRecord({ id, name }));
			return;
		}

		if (existing.name !== name) this.#store({ ...existing, name });
	}

	static markReturned(id) {
		this.#returnedIds.add(id);
	}

	static hasReturned(id) {
		return this.#returnedIds.has(id);
	}

	static markDropped({ id, savedExperience }) {
		const record = this.#records.get(id);
		if (!record) return;

		this.#store(toRecord({ ...record, hasDropped: true, savedExperience }));
	}

	static has(id) {
		return this.#records.has(id);
	}

	static hasAny() {
		return this.#records.size > 0;
	}

	static get(id) {
		return this.#records.get(id) ?? null;
	}

	static remove(id) {
		if (!this.#records.delete(id)) return;

		this.#returnedIds.delete(id);
		Storage.delete(this.#keyOf(id));
	}

	static #store(record) {
		this.#records.set(record.id, record);
		if (Storage.write(this.#keyOf(record.id), record)) return;

		warn("offender record could not be saved; the punishment will be lost after a restart");
	}

	static #keyOf(id) {
		return `${config.general.offenderKeyPrefix}${id}`;
	}
}

export class Incidents {
	static #entries = [];

	static add(entry) {
		this.#entries.push(entry);
		if (this.#entries.length > config.limits.maxIncidents) this.#entries.shift();
	}

	static all() {
		return [...this.#entries];
	}
}
