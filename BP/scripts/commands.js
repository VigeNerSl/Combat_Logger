import {
	system,
	CommandPermissionLevel,
	CustomCommandParamType,
	CustomCommandStatus
} from "@minecraft/server";
import { config } from "./config";
import { Incidents } from "./storage";
import { Sessions } from "./sessions";
import { isAdmin } from "./systems/index";
import { getHeldItem, reply, replyLines, toIncidentLines, toTranslation } from "./utils";
import { itemMenu, menu } from "./forms";

const actionEnum = "vigenersl:combat_action";

const sendStatus = player => {
	const session = Sessions.find(player.id);

	if (session?.isInCombat()) {
		reply({ player, key: config.messages.statusIn, substitutions: [String(session.getSecondsLeft())] });
		return;
	}

	reply({ player, key: config.messages.statusOut });
};

const subcommands = {
	log: ({ user }) => {
		if (!isAdmin(user)) return reply({ player: user, key: config.messages.noPermission });

		const entries = Incidents.all();
		const title = entries.length ? [toTranslation({ key: config.messages.logTitle })] : [];
		replyLines({ player: user, lines: [...title, ...toIncidentLines(entries)] });
	},

	menu: ({ user }) => {
		if (!isAdmin(user)) return sendStatus(user);
		menu(user);
	}
};

const open = ({ user, action }) => {
	const itemStack = action == null && isAdmin(user) ? getHeldItem(user) : null;
	if (itemStack) {
		itemMenu({ user, itemStack });
		return;
	}

	subcommands[action ?? "menu"]({ user });
};

const register = vigenersl => {
	const { customCommandRegistry } = vigenersl;

	customCommandRegistry.registerEnum(actionEnum, Object.keys(subcommands));

	const handleCommand = (origin, action) => {
		const user = origin.sourceEntity;
		if (user?.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };

		system.run(() => {
			if (user.isValid) open({ user, action });
		});

		return { status: CustomCommandStatus.Success };
	};

	customCommandRegistry.registerCommand({
		name: "vigenersl:combat",
		description: config.messages.commandDescription,
		permissionLevel: CommandPermissionLevel.Any,
		cheatsRequired: false,
		optionalParameters: [
			{ name: actionEnum, type: CustomCommandParamType.Enum }
		]
	}, handleCommand);
};

system.beforeEvents.startup.subscribe(register);
