// =======================================
// VigeNerSl Cooldowns Configuration File
// =======================================
//
// This configuration defines cooldown settings for specific Minecraft items.
// Each entry controls the delay (in seconds) before a player can reuse an item.
//
// The system supports two operation modes:
//  • globalMode = true  → cooldowns apply to all players.
//  • globalMode = false → cooldowns apply only to players with the "combatlog" tag.
//
// Author: VigeNerSl
// License: CC BY-NC-SA 4.0
// Version: 1.0.0
// =======================================

export default {
  // Base key prefix for storing dynamic properties in the world database.
  DP_BASE: "vigenersl:cooldowns",

  // Maximum length of each JSON chunk stored in dynamic properties.
  DP_CHUNK_SIZE: 32000,

  // Time (in ticks) after which a player's cooldown data is automatically removed if inactive.
  LOCK_TIMEOUT_TICKS: 200, 
  // Determines whether cooldowns apply globally or only to tagged players.
  // true  = cooldowns affect all players
  // false = cooldowns affect only players with the "combatlog" tag
  globalMode: false,

    // Minimum time (in milliseconds) between repeated chat messages
  // that notify players they are still on cooldown.
  messageInterval: 1000,

  // Defines cooldown duration (in seconds) for each item type.
  // Key = item identifier, Value = cooldown in seconds
  food_cooldown: {
    "minecraft:enchanted_golden_apple": 80,
    "minecraft:golden_apple": 45,
    "minecraft:chorus_fruit": 30
    //"your:item_id": cooldown_in_seconds     // Example entry
  },
  fast_cooldown: {
    "minecraft:ender_pearl": 30
    //"your:item_id": cooldown_in_seconds     // Example entry
  }
}
