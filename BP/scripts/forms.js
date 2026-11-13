import { ItemStack, system } from "@minecraft/server";
import {
	CustomForm,
	DataDrivenScreenClosedReason,
	ObservableBoolean,
	ObservableString,
	ObservableUIRawMessage
} from "@minecraft/server-ui";
import { config } from "./config";
import { warn } from "./logger";
import { Settings, Incidents, ItemRules, cooldownRange } from "./storage";
import { findCooldownTraits, isAdmin } from "./systems/index";
import { joinLines, reply, toIncidentLines, toTranslation } from "./utils";

const settingsFields = [
	{ name: "isEnabled", kind: "toggle", label: config.messages.fields.enabled },
	{ name: "combatSeconds", kind: "number", label: config.messages.fields.seconds },
	{ name: "shouldDropOnLeave", kind: "toggle", label: config.messages.fields.drop },
	{ name: "shouldPunishOnReturn", kind: "toggle", label: config.messages.fields.punish },
	{ name: "shouldBlockItemsInCombat", kind: "toggle", label: config.messages.fields.blockItems },
	{ name: "isCooldownOnlyInCombat", kind: "toggle", label: config.messages.fields.cooldownsInCombat },
	{ name: "isCreativeExempt", kind: "toggle", label: config.messages.fields.exemptCreative },
	{ name: "isOperatorExempt", kind: "toggle", label: config.messages.fields.exemptOperators },
	{ name: "shouldLogIncidents", kind: "toggle", label: config.messages.fields.log },
	{ name: "shouldShowActionBar", kind: "toggle", label: config.messages.fields.actionBar }
];

const toObservable = ({ field, value }) => (field.kind === "number"
	? new ObservableString(String(value), { clientWritable: true })
	: new ObservableBoolean(value, { clientWritable: true }));

const normalizeText = text => text.trim().replace(",", ".");

const toNumber = text => {
	const normalized = normalizeText(text);
	const number = Number(normalized);

	return normalized.length > 0 && Number.isFinite(number) ? number : null;
};

const hasFraction = text => /\.\d*[1-9]/.test(normalizeText(text));

const shortenText = text => (text.length > config.limits.shownNumberLength
	? `${text.slice(0, config.limits.shownNumberLength)}…`
	: text);

const combatRange = { min: config.limits.minCombatSeconds, max: config.limits.maxCombatSeconds };

const clampSeconds = ({ number, min, max }) => Math.min(max, Math.max(min, Math.round(number)));

const readField = ({ field, observable, current }) => {
	const data = observable.getData();
	if (field.kind !== "number") return data;

	const number = toNumber(data);
	return number === null ? current[field.name] : clampSeconds({ number, ...combatRange });
};

const describeSeconds = ({ text, current, min, max }) => {
	const number = toNumber(text);

	if (text.trim().length > 0 && number === null) {
		return toTranslation({ key: config.messages.secondsInvalid, substitutions: [String(current)] });
	}

	if (number !== null && (number < min || number > max)) {
		const saved = clampSeconds({ number, min, max });
		return toTranslation({
			key: config.messages.secondsClamped,
			substitutions: [String(min), String(max), String(saved)]
		});
	}

	if (number !== null && hasFraction(text)) {
		return toTranslation({
			key: config.messages.secondsRounded,
			substitutions: [shortenText(normalizeText(text)), String(Math.round(number))]
		});
	}

	return { rawtext: [{ text: `${min}–${max} — ` }, { translate: config.messages.secondsHint }] };
};

const addField = ({ form, field, observable, description }) => {
	const label = toTranslation({ key: field.label });

	if (field.kind === "number") {
		form.textField(label, observable, { description });
		return;
	}

	form.toggle(label, observable);
};

const closeForm = form => {
	try {
		form.close();
	} catch {
		// The form is already closed (the click closed it, or the player left): nothing is left to close.
	}
};

const toRoomyLabel = key => ({ rawtext: [toTranslation({ key }), { text: "\n" }] });

const addCloseButton = ({ form, goTo }) => form.spacer().button(
	toTranslation({ key: config.messages.buttons.close }),
	() => goTo(null)
);

const openScreen = ({ user, title, build, fallback = null }) => {
	const form = new CustomForm(user, title);
	let target = null;

	build({
		form,
		goTo: (screen, ticks = 0) => {
			target = { screen, ticks };
			closeForm(form);
		}
	});

	form.show().then(reason => {
		const isClosedByClient = reason === DataDrivenScreenClosedReason.ClientClosed;
		const chosen = target ?? (isClosedByClient ? { screen: fallback, ticks: 0 } : null);
		if (!chosen?.screen) return;

		const open = () => {
			if (user.isValid) chosen.screen(user);
		};

		if (chosen.ticks > 0) {
			system.runTimeout(open, chosen.ticks);
			return;
		}

		system.run(open);
	}, error => warn(`the form could not be shown: ${error}`));
};

const isAllowed = user => user.isValid && isAdmin(user);

const settings = user => {
	const current = Settings.all();
	const observables = settingsFields.map(field => toObservable({ field, value: current[field.name] }));
	const isChanged = new ObservableBoolean(false);

	const describeField = ({ field, text }) => describeSeconds({ text, current: current[field.name], ...combatRange });

	const descriptions = settingsFields.map((field, index) => (field.kind === "number"
		? new ObservableUIRawMessage(describeField({ field, text: observables[index].getData() }))
		: null));

	settingsFields.forEach((field, index) => {
		if (field.kind !== "number") return;

		observables[index].subscribe(text => descriptions[index].setData(describeField({ field, text })));
	});

	const readValues = () => Object.fromEntries(settingsFields.map((field, index) => (
		[field.name, readField({ field, observable: observables[index], current })]
	)));

	observables.forEach(observable => observable.subscribe(() => {
		const values = readValues();
		isChanged.setData(settingsFields.some(field => values[field.name] !== current[field.name]));
	}));

	openScreen({
		user,
		title: toTranslation({ key: config.messages.settingsTitle }),
		fallback: menu,
		build: ({ form, goTo }) => {
			settingsFields.forEach((field, index) => addField({
				form,
				field,
				observable: observables[index],
				description: descriptions[index]
			}));

			form.spacer().button(toTranslation({ key: config.messages.confirm }), () => {
				if (!isAllowed(user)) return goTo(null);

				const isSaved = Settings.apply(readValues());

				reply({ player: user, key: isSaved ? config.messages.applied : config.messages.saveFailed });
				goTo(menu, config.limits.menuReopenTicks);
			}, { visible: isChanged });
			form.spacer().button(toTranslation({ key: config.messages.buttons.back }), () => goTo(menu));
		}
	});
};

const windowOf = entry => entry.time.slice(0, -1);

const groupByWindow = entries => entries.reduce((groups, entry) => {
	const last = groups.at(-1);
	if (last && windowOf(last[0]) === windowOf(entry)) last.push(entry);
	else groups.push([entry]);
	return groups;
}, []);

const log = user => openScreen({
	user,
	title: toTranslation({ key: config.messages.logTitle }),
	fallback: menu,
	build: ({ form, goTo }) => {
		const groups = groupByWindow(Incidents.all());

		if (groups.length === 0) form.label(toRoomyLabel(config.messages.logEmpty));
		groups.forEach((group, index) => {
			if (index > 0) form.divider();
			form.label({ rawtext: joinLines(toIncidentLines(group), "\n\n") });
		});
		form
			.spacer()
			.button(toTranslation({ key: config.messages.buttons.back }), () => goTo(menu));
	}
});

const describeItem = typeId => {
	try {
		return { translate: new ItemStack(typeId).localizationKey };
	} catch {
		// The type is unknown (the addon that added it is gone): the raw id stands in for the name.
		return { rawtext: [{ text: `${typeId} ` }, toTranslation({ key: config.messages.items.unknown })] };
	}
};

const reportSaved = ({ user, isSaved }) => reply({
	player: user,
	key: isSaved ? config.messages.items.saved : config.messages.items.saveFailed,
	substitutions: isSaved ? [] : [String(config.limits.maxItemRules)]
});

const addExitButton = ({ form, goTo, back }) => (back === null
	? addCloseButton({ form, goTo })
	: form.spacer().button(toTranslation({ key: config.messages.buttons.back }), () => goTo(back)));

const cooldownScreen = ({ user, typeId, base, back }) => {
	const rule = ItemRules.cooldown(typeId);
	const current = rule?.seconds ?? config.limits.newCooldownSeconds;
	const readSeconds = text => clampSeconds({ number: toNumber(text) ?? current, ...cooldownRange });
	const seconds = new ObservableString(String(current), { clientWritable: true });
	const describe = text => describeSeconds({ text, current, ...cooldownRange });
	const description = new ObservableUIRawMessage(describe(seconds.getData()));
	const isChanged = new ObservableBoolean(rule === null);

	seconds.subscribe(text => {
		description.setData(describe(text));
		isChanged.setData(rule === null || readSeconds(text) !== rule.seconds);
	});

	openScreen({
		user,
		title: describeItem(typeId),
		fallback: back,
		build: ({ form, goTo }) => {
			const { modeCharged, modeInstant } = config.messages.items;
			const modeKey = base.mode === "charged" ? modeCharged : modeInstant;
			const save = isSaved => {
				reportSaved({ user, isSaved });
				goTo(back, config.limits.menuReopenTicks);
			};

			form
				.label(toRoomyLabel(modeKey))
				.textField(toTranslation({ key: config.messages.items.seconds }), seconds, { description })
				.spacer()
				.button(toTranslation({ key: config.messages.confirm }), () => {
					if (!isAllowed(user)) return goTo(null);

					save(ItemRules.setCooldown({
						typeId,
						rule: { category: base.category, mode: base.mode, seconds: readSeconds(seconds.getData()) }
					}));
				}, { visible: isChanged });

			if (rule) {
				form.button(toTranslation({ key: config.messages.items.removeCooldown }), () => {
					if (!isAllowed(user)) return goTo(null);

					save(ItemRules.removeCooldown(typeId));
				});
			}
			form.spacer().button(toTranslation({ key: config.messages.buttons.back }), () => goTo(back));
		}
	});
};

const itemScreen = ({ user, typeId, back = null }) => openScreen({
	user,
	title: describeItem(typeId),
	fallback: back,
	build: ({ form, goTo }) => {
		const isBlocked = ItemRules.isBlocked(typeId);
		const base = ItemRules.cooldown(typeId) ?? findCooldownTraits(typeId);
		const reopen = () => itemScreen({ user, typeId, back });

		const toggleKey = isBlocked ? config.messages.items.unblock : config.messages.items.block;

		if (!Settings.get("shouldBlockItemsInCombat")) {
			form.label(toRoomyLabel(config.messages.items.blockingOff)).spacer();
		}

		form.button(toTranslation({ key: toggleKey }), () => {
			if (!isAllowed(user)) return goTo(null);

			reportSaved({ user, isSaved: isBlocked ? ItemRules.unblock(typeId) : ItemRules.block(typeId) });
			goTo(reopen, config.limits.menuReopenTicks);
		});

		if (base) {
			form.button(toTranslation({ key: config.messages.items.cooldown }), () => (
				goTo(() => cooldownScreen({ user, typeId, base, back: reopen }))
			));
		}
		addExitButton({ form, goTo, back });
	}
});

const toCooldownLine = ({ typeId, seconds }) => ({
	translate: config.messages.items.cooldownLine,
	with: { rawtext: [describeItem(typeId), { text: String(seconds) }] }
});

const itemList = user => openScreen({
	user,
	title: toTranslation({ key: config.messages.items.title }),
	fallback: menu,
	build: ({ form, goTo }) => {
		const blocked = ItemRules.blocked();
		const cooldowns = ItemRules.cooldowns();
		const openItem = typeId => goTo(() => itemScreen({ user, typeId, back: itemList }));

		if (blocked.length + cooldowns.length === 0) form.label(toRoomyLabel(config.messages.items.empty));
		if (blocked.length > 0) {
			form.label(toTranslation({ key: config.messages.items.blockedHeader }));
			blocked.forEach(typeId => form.button(describeItem(typeId), () => openItem(typeId)));
		}
		if (blocked.length > 0 && cooldowns.length > 0) form.divider();
		if (cooldowns.length > 0) {
			form.label(toTranslation({ key: config.messages.items.cooldownHeader }));
			cooldowns.forEach(entry => form.button(toCooldownLine(entry), () => openItem(entry.typeId)));
		}
		addExitButton({ form, goTo, back: menu });
	}
});

export const itemMenu = ({ user, itemStack }) => itemScreen({ user, typeId: itemStack.typeId });

export const menu = user => openScreen({
	user,
	title: config.ui.title,
	build: ({ form, goTo }) => {
		form
			.label(toRoomyLabel(config.messages.menuBody))
			.spacer()
			.button(toTranslation({ key: config.messages.buttons.settings }), () => goTo(settings))
			.button(toTranslation({ key: config.messages.buttons.log }), () => goTo(log))
			.button(toTranslation({ key: config.messages.buttons.items }), () => goTo(itemList));
		addCloseButton({ form, goTo });
	}
});
