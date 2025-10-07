// =========================================
// VigeNerSl CombatLogger Configuration File
// =========================================
// This file defines all core configuration values used by the CombatLogger addon.
// Each parameter controls timing, limits, or behavior of the system. 
// Adjust carefully — incorrect values can cause server instability.
//
// Author: VigeNerSl
// License: CC BY-NC-SA 4.0
// Version: 1.2.0
// ==============================

export default {
  // Duration (in ticks) during which a player remains in combat after being hit.
  COMBAT_TICKS: 600, // 30 seconds (20 ticks = 1 second)

  // Interval (in ticks) for snapshot updates when player is idle (not in combat).
  SNAP_INTERVAL_IDLE: 40,

  // Interval (in ticks) for snapshot updates during combat.
  SNAP_INTERVAL_COMBAT: 10,

  // Interval (in ticks) for updating the actionbar HUD.
  HUD_INTERVAL: 20,

  // Interval (in ticks) for cleaning up old states and database entries.
  CLEAN_INTERVAL: 200,

  // Tag applied to players while in combat. Used to identify combat state.
  COMBAT_TAG: "combatlog",

  // Height offset for spawning dropped items or XP orbs above player’s head.
  HEAD_Y_OFFSET: 1.62,

  // Duration (in ticks) that “Combat Ended” message stays visible.
  END_MESSAGE_DURATION: 40,

  // Interval (in ticks) between main logic loop iterations.
  MAIN_LOOP_INTERVAL: 10,

  // Base key prefix for storing dynamic properties in the world database.
  DP_BASE: "vigenersl:combatlogged",

  // Maximum length of each JSON chunk stored in dynamic properties.
  DP_CHUNK_SIZE: 32000,

  // Threshold (in ticks) after which inactive player states are automatically removed.
  STATE_CLEANUP_THRESHOLD_TICKS: 4000,

  // Maximum number of characters from a player's name to be stored.
  MAX_PLAYER_NAME_LENGTH: 16,

  // Maximum number of XP orbs to spawn on death/disconnect.
  MAX_XP_ORBS: 10000,

  // Minimum number of XP orbs to spawn.
  MIN_XP_ORBS: 1,

  // Number of XP orbs spawned per tick (controls spread speed).
  XP_ORBS_PER_TICK: 8,

  // Random horizontal/vertical spread for spawned XP orbs.
  XP_ORB_SCATTER: 0.6,

  // Maximum number of dropped items spawned per tick.
  ITEMS_PER_TICK: 24,

  // Delay (in ticks) after respawn before a relogged offender is killed.
  RESPAWN_KILL_DELAY_TICKS: 8,

  // Timeout (in ticks) before database write lock automatically expires.
  LOCK_TIMEOUT_TICKS: 100,

  // Maximum number of Minecraft commands allowed per tick to prevent overload.
  COMMAND_RATE_LIMIT: 150
}
