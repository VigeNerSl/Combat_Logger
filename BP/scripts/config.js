export const config = {
	general: {
		// Тег боя. Его читают clan, region, system и другие аддоны.
		// Переименуешь — они ослепнут, и из боя можно будет ливнуть телепортом, /home, /spawn и т.д.
		combatTag: "combatlog",

		// С этим тегом в бой не попадаешь и лив из серверка во время боя не накажет. Для админов и ивентов.
		bypassTag: "nocombat",

		// Тег админа. Без него менюшкам и командам не будет доступа, кроме операторов.
		adminTag: "admin",

		// Префикс в логе консоли.
		logPrefix: "[vigenersl:combatlog]",

		tickInterval: 10,
		tickingAreaPrefix: "vigenersl_combat_drop_",
		settingsKey: "vigenersl_combat_settings",
		offenderKeyPrefix: "vigenersl_combat_offender_",
		itemRulesKey: "vigenersl_combat_items",

		// /scriptevent для других аддонов, формат описан в API.md. Это контракт: переименуешь — чужие аддоны перестанут работать.
		// enter, leave, query — команды аддону; started, ended, state — что аддон сообщает сам.
		scriptEvents: {
			enter: "vigenersl:combat_enter",
			leave: "vigenersl:combat_leave",
			query: "vigenersl:combat_query",
			started: "vigenersl:combat_started",
			ended: "vigenersl:combat_ended",
			state: "vigenersl:combat_state"
		}
	},

	defaults: {
		// Аддон включён или нет.
		isEnabled: true, // false

		// Сколько длится бой после последнего удара.
		combatSeconds: 30,

		// Ронять вещи и опыт в точке лива из сервака.
		shouldDropOnLeave: true,

		// Убивать при входе на сервак, если ливнул в бою.
		shouldPunishOnReturn: true,

		// Блокировать предметы из restrictions.blockedItems в бою.
		shouldBlockItemsInCombat: true,

		// Кулдаун, только если предмет юзнули в бою. false — всегда, даже вне боя. Начатый кулдаун доходит до конца и вне боя.
		isCooldownOnlyInCombat: true,

		// Креатив и спектатор вне боя: удар по ним или от них бой не начинает. Если игрок ударил в выживании и переключился в креатив или спектатор, бой с него снимается сразу: тег, таймер и наказание.
		isCreativeExempt: true,

		// Операторы вне боя: удар по ним или от них бой не начинает.
		isOperatorExempt: true,

		// Лог инцидентов (/combat log). Время в нём UTC.
		shouldLogIncidents: true,

		// Таймер боя в actionbar.
		shouldShowActionBar: true
	},

	limits: {
		minCombatSeconds: 5,
		maxCombatSeconds: 600,
		shownNumberLength: 16,
		maxIncidents: 50,
		punishDelayTicks: 20,
		clearRetries: 5,
		clearRetryTicks: 2,
		experiencePerLevel: 7,
		maxExperienceDropped: 100,
		messageCooldownTicks: 20,
		timerRefreshTicks: 40,
		menuReopenTicks: 5,
		maxCooldownTicks: 32767,
		maxItemRules: 50,
		newCooldownSeconds: 30,
		blockLeaseTicks: 30
	},

	cooldowns: {
		// category — ванильная категория из minecraft:cooldown (у перла "ender_pearl", у хоруса "chorusfruit").
		// seconds — сколько ждать, максимум 1638. 0 или нет в списке — без кулдауна.
		// instant — кулдаун начинается сразу при использовании: бросок перла, снежка, заряда ветра; у лука — на выстреле.
		// charged — кулдаун начинается, когда предмет съеден или выпит: яблоки, хорус, зелья.
		// Момент старта задаёт сам предмет, список только подписывает его в меню.
		instant: {
			"minecraft:ender_pearl": {
				category: "ender_pearl",
				seconds: 30
			}
		},
		charged: {
			"minecraft:enchanted_golden_apple": {
				category: "golden_apple",
				seconds: 80
			},
			"minecraft:golden_apple": {
				category: "golden_apple",
				seconds: 45
			},
			"minecraft:chorus_fruit": {
				category: "chorusfruit",
				seconds: 30
			}
		}
	},

	restrictions: {
		// Какие предметы нельзя в бою. 
		blockedItems: [/**"minecraft:iron_sword", "minecraft:diamond_sword", "minecraft:bow"*/],
		openingComponents: ["minecraft:inventory", "minecraft:sign"],
		openingBlocks: [
			"_door",
			"trapdoor",
			"_button",
			"fence_gate",
			"lever",
			"noteblock",
			"crafting_table",
			"crafter",
			"ender_chest",
			"_bed",
			"anvil",
			"bell",
			"enchanting_table",
			"grindstone",
			"loom",
			"stonecutter",
			"cartography_table",
			"smithing_table",
			"beacon",
			"brewing_stand",
			"cauldron",
			"respawn_anchor",
			"lectern",
			"composter",
			"decorated_pot",
			"command_block"
		],
		notOpeningBlocks: ["iron_door", "iron_trapdoor"],
		blockUseItems: [
			"minecraft:firework_rocket",
			"minecraft:flint_and_steel",
			"minecraft:fire_charge",
			"minecraft:lava_bucket",
			"minecraft:water_bucket",
			"minecraft:powder_snow_bucket",
			"minecraft:cod_bucket",
			"minecraft:salmon_bucket",
			"minecraft:pufferfish_bucket",
			"minecraft:tropical_fish_bucket",
			"minecraft:axolotl_bucket",
			"minecraft:tadpole_bucket",
			"minecraft:end_crystal",
			"minecraft:ender_eye",
			"minecraft:bone_meal",
			"minecraft:armor_stand",
			"minecraft:minecart",
			"minecraft:tnt_minecart"
		]
	},

	messages: {
		timer: "vigenersl.combat.timer",
		endedChat: "vigenersl.combat.ended.chat",
		endedBar: "vigenersl.combat.ended.bar",
		punished: "vigenersl.combat.punished",
		cooldown: "vigenersl.combat.cooldown",
		blocked: "vigenersl.combat.blocked",
		statusIn: "vigenersl.combat.status.in",
		statusOut: "vigenersl.combat.status.out",

		commandDescription: "vigenersl.command.description",
		noPermission: "vigenersl.command.noPermission",

		secondsHint: "vigenersl.ui.field.secondsHint",
		secondsInvalid: "vigenersl.ui.field.secondsInvalid",
		secondsRounded: "vigenersl.ui.field.secondsRounded",
		secondsClamped: "vigenersl.ui.field.secondsClamped",

		menuBody: "vigenersl.ui.menu.body",
		buttons: {
			settings: "vigenersl.ui.button.settings",
			log: "vigenersl.ui.button.log",
			items: "vigenersl.ui.button.items",
			close: "vigenersl.ui.button.close",
			back: "vigenersl.ui.button.back"
		},

		settingsTitle: "vigenersl.ui.settings.title",
		confirm: "vigenersl.ui.settings.confirm",
		applied: "vigenersl.ui.settings.applied",
		saveFailed: "vigenersl.ui.settings.saveFailed",
		fields: {
			enabled: "vigenersl.ui.field.enabled",
			seconds: "vigenersl.ui.field.seconds",
			drop: "vigenersl.ui.field.drop",
			punish: "vigenersl.ui.field.punish",
			blockItems: "vigenersl.ui.field.blockItems",
			cooldownsInCombat: "vigenersl.ui.field.cooldownsInCombat",
			exemptCreative: "vigenersl.ui.field.exemptCreative",
			exemptOperators: "vigenersl.ui.field.exemptOperators",
			log: "vigenersl.ui.field.log",
			actionBar: "vigenersl.ui.field.actionBar"
		},

		logTitle: "vigenersl.ui.log.title",
		logEmpty: "vigenersl.ui.log.empty",
		logEnterHit: "vigenersl.ui.log.enterHit",
		logEnterHurt: "vigenersl.ui.log.enterHurt",
		logEnterForced: "vigenersl.ui.log.enterForced",
		logLeave: "vigenersl.ui.log.leave",

		items: {
			title: "vigenersl.ui.items.title",
			empty: "vigenersl.ui.items.empty",
			blockedHeader: "vigenersl.ui.items.blockedHeader",
			cooldownHeader: "vigenersl.ui.items.cooldownHeader",
			cooldownLine: "vigenersl.ui.items.cooldownLine",
			unknown: "vigenersl.ui.items.unknown",
			saved: "vigenersl.ui.items.saved",
			saveFailed: "vigenersl.ui.items.saveFailed",
			block: "vigenersl.ui.item.block",
			unblock: "vigenersl.ui.item.unblock",
			cooldown: "vigenersl.ui.item.cooldown",
			removeCooldown: "vigenersl.ui.item.removeCooldown",
			blockingOff: "vigenersl.ui.item.blockingOff",
			seconds: "vigenersl.ui.cooldown.seconds",
			modeInstant: "vigenersl.ui.cooldown.modeInstant",
			modeCharged: "vigenersl.ui.cooldown.modeCharged"
		}
	},

	incidentKinds: {
		enterHit: "enterHit",
		enterHurt: "enterHurt",
		enterForced: "enterForced",
		leave: "leave"
	},

	ui: {
		title: "§l§cCombat Logger",
		unknownOpponent: "?",
		forcedOpponent: "/scriptevent"
	}
};
