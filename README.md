# Combat Logger

Add-on for Minecraft Bedrock Edition (1.26.50 and newer) that punishes players who log out during combat.

## What it does

- **Combat tag.** A hit between two players puts both into combat. The timer is shown in the actionbar and restarts with every hit.
- **Logout punishment.** A player who leaves during combat drops their items and experience where they left, and is killed on the next join.
- **Blocked items.** Any item can be blocked in combat from the menu (none are blocked by default).
- **Cooldowns.** Ender pearl, golden apples and chorus fruit get a cooldown in combat.
- **Incident log.** Every combat logout is recorded.
- **Settings menu.** Combat time, punishments, cooldowns and per-item restrictions are set in game, no file editing needed.

Players in creative or spectator mode and operators don't enter combat by default; both can be changed in the settings.

## Commands

| Command | What it does |
|---|---|
| `/combat` | Settings menu. A player without access sees how long their combat lasts. |
| `/combat` with an item in hand | Block the item in combat or give it a cooldown. |
| `/combat log` | Combat logout log. |

## Tags

| Tag | What it means |
|---|---|
| `admin` | Access to the menu and the log (operators have it anyway). |
| `nocombat` | The player never enters combat: for lobbies, spawn and events. |
| `combatlog` | Set on a player in combat. Other add-ons can read it to block teleports, `/home`, `/spawn`. |

## For add-on developers

Other add-ons can put a player into combat, take them out, ask for their state and receive combat start and end events
through `/scriptevent`. See [API.md](API.md).

## Install

Download `CombatLogger-<version>.mcaddon` from [Releases](https://github.com/VigeNerSl/Combat_Logger/releases) and open it,
or copy `BP` and `RP` into your world's packs. Enable both packs on the world.

## License

[CC BY-NC-SA 4.0](LICENSE.md). Credit must state "Created by VigeNerSl".
