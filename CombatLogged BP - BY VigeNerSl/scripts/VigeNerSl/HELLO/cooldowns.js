import { world, system, Player } from "@minecraft/server"
import VIGENERSL_TAG from "../.././combatlog_config.js"
import VIGENERSL_CONFIG from "../.././cooldown_config.js"

const VIGENERSL_COOLDOWNS = new Map()
const VIGENERSL_LASTMESSAGE = new Map()

const FOOD_SET = new Set(Object.keys(VIGENERSL_CONFIG.food_cooldown || {}))
const FAST_SET = new Set(Object.keys(VIGENERSL_CONFIG.fast_cooldown || {}))

const META = {
  KEY_META: VIGENERSL_CONFIG.DP_BASE + ":meta",
  KEY_LOCK: VIGENERSL_CONFIG.DP_BASE + ":lock",
  KEY_LOCK_TS: VIGENERSL_CONFIG.DP_BASE + ":lockTs"
}

function okCfg() {
  const C = VIGENERSL_CONFIG
  if (typeof C.globalMode !== "boolean") return false
  if (!Number.isFinite(C.messageInterval) || C.messageInterval < 100) return false
  if (!Number.isFinite(C.DP_CHUNK_SIZE) || C.DP_CHUNK_SIZE <= 0 || C.DP_CHUNK_SIZE > 32000) return false
  if (!Number.isFinite(C.LOCK_TIMEOUT_TICKS) || C.LOCK_TIMEOUT_TICKS <= 0) return false
  for (const o of [C.food_cooldown || {}, C.fast_cooldown || {}]) {
    if (typeof o !== "object") return false
    for (const [k, v] of Object.entries(o)) {
      if (typeof k !== "string" || !k.startsWith("minecraft:")) return false
      if (!Number.isFinite(v) || v <= 0 || v > 3600) return false
    }
  }
  return true
}

const h = s => { let x=0; for (let i=0;i<s.length;i++) x=(x*31+s.charCodeAt(i))|0; return x>>>0 }

function dpRead() {
  try {
    const rawMeta = world.getDynamicProperty(META.KEY_META)
    if (typeof rawMeta !== "string" || !rawMeta.length) return {}
    const meta = JSON.parse(rawMeta)
    const parts = Number(meta?.parts) || 0
    if (!parts) return {}
    let s = ""
    for (let i = 0; i < parts; i++) {
      const part = world.getDynamicProperty(`${VIGENERSL_CONFIG.DP_BASE}:${i}`)
      if (typeof part === "string") s += part
    }
    if (!s.length) return {}
    if ((meta?.hash|0) !== (h(s)|0)) return {}
    const obj = JSON.parse(s) || {}
    return sanitizeLoaded(obj)
  } catch { return {} }
}

function dpWrite(obj) {
  try {
    const s = JSON.stringify(obj)
    if (!s) return false
    const hash = h(s) | 0
    const prevRaw = world.getDynamicProperty(META.KEY_META)
    const prev = typeof prevRaw === "string" && prevRaw.length ? JSON.parse(prevRaw) : { parts: 0, ver: 0 }
    const oldParts = Number(prev?.parts) || 0
    const parts = Math.ceil(s.length / VIGENERSL_CONFIG.DP_CHUNK_SIZE)
    for (let i = 0; i < parts; i++) {
      const chunk = s.slice(i * VIGENERSL_CONFIG.DP_CHUNK_SIZE, (i + 1) * VIGENERSL_CONFIG.DP_CHUNK_SIZE)
      world.setDynamicProperty(`${VIGENERSL_CONFIG.DP_BASE}:${i}`, chunk)
    }
    for (let i = parts; i < oldParts; i++) world.setDynamicProperty(`${VIGENERSL_CONFIG.DP_BASE}:${i}`, undefined)
    world.setDynamicProperty(META.KEY_META, JSON.stringify({ parts, hash, ver: (Number(prev?.ver)||0)+1 }))
    return true
  } catch { return false }
}

const nowTick = () => system.currentTick

function safeWrite(obj) {
  const lockTs = Number(world.getDynamicProperty(META.KEY_LOCK_TS)) || 0
  const tick = nowTick()
  if (lockTs && tick - lockTs > VIGENERSL_CONFIG.LOCK_TIMEOUT_TICKS) {
    world.setDynamicProperty(META.KEY_LOCK, 0)
    world.setDynamicProperty(META.KEY_LOCK_TS, 0)
  }
  if ((world.getDynamicProperty(META.KEY_LOCK) | 0) === 1) return false
  world.setDynamicProperty(META.KEY_LOCK, 1)
  world.setDynamicProperty(META.KEY_LOCK_TS, tick)
  try {
    const backup = dpRead()
    const s = JSON.stringify(obj)
    const ok = dpWrite(obj)
    const cur = dpRead()
    const valid = ok && s.length === JSON.stringify(cur).length && h(s) === h(JSON.stringify(cur))
    if (!valid) dpWrite(backup)
    return valid
  } catch { return false }
  finally {
    world.setDynamicProperty(META.KEY_LOCK, 0)
    world.setDynamicProperty(META.KEY_LOCK_TS, 0)
  }
}

function sanitizeLoaded(raw) {
  const now = Date.now()
  const data = (raw && typeof raw==="object" && raw.__data) ? raw.__data : raw
  if (!data || typeof data !== "object") return {}
  const out = {}
  for (const [pid, rec] of Object.entries(data)) {
    if (!rec || typeof rec !== "object") continue
    const clean = {}
    for (const [type, ts] of Object.entries(rec)) {
      const t = Number(ts) || 0
      if (t <= now) continue
      if (t - now > 2 * 60 * 60 * 1000) continue
      clean[type] = t
    }
    if (Object.keys(clean).length) out[pid] = clean
  }
  return out
}

function loadCooldowns() {
  const parsed = dpRead()
  for (const [pid, data] of Object.entries(parsed)) VIGENERSL_COOLDOWNS.set(pid, data)
}

function saveCooldowns() {
  const data = {}
  for (const [pid, map] of VIGENERSL_COOLDOWNS) if (map && Object.keys(map).length) data[pid] = map
  safeWrite({ __data: data })
}

function hasAnyActiveCd(player, now) {
  const rec = VIGENERSL_COOLDOWNS.get(player.id)
  if (!rec) return false
  for (const v of Object.values(rec)) if (now < v) return true
  return false
}

function shouldStart(player, now) {
  return VIGENERSL_CONFIG.globalMode || player.hasTag(VIGENERSL_TAG.COMBAT_TAG) || hasAnyActiveCd(player, now)
}

function getSeconds(type) {
  if (FOOD_SET.has(type)) return VIGENERSL_CONFIG.food_cooldown[type]
  if (FAST_SET.has(type)) return VIGENERSL_CONFIG.fast_cooldown[type]
  return 0
}

system.run(() => {
  try { loadCooldowns() } catch { safeWrite({ __data: {} }) }
})

world.afterEvents.playerLeave.subscribe(() => saveCooldowns())

world.beforeEvents.itemUse.subscribe(ev => {
  const player = ev.source
  if (!(player instanceof Player)) return
  const type = ev.itemStack?.typeId
  if (!type) return
  const seconds = getSeconds(type)
  if (!seconds) return

  const now = Date.now()
  const rec = VIGENERSL_COOLDOWNS.get(player.id) ?? {}
  const expire = Number(rec[type]) || 0
  if (now < expire) {
    ev.cancel = true
    const sec = Math.ceil((expire - now) / 1000)
    const last = VIGENERSL_LASTMESSAGE.get(player.id) ?? 0
    if (now - last > VIGENERSL_CONFIG.messageInterval) {
      player.sendMessage([
        { translate: "vigenersl.combat.cooldowns" },
        { text: " " },
        { text: String(sec) },
        { text: " " },
        { translate: "vigenersl.combat.wait" }
      ])
      VIGENERSL_LASTMESSAGE.set(player.id, now)
    }
    system.run(() => {
      const inv = player.getComponent("minecraft:inventory")?.container
      const slot = Number(player.selectedSlot ?? 0)
      if (!inv) return
      const item = inv.getItem(slot)
      if (item && item.typeId === type) inv.setItem(slot, item)
    })
  }
})

world.afterEvents.itemUse.subscribe(ev => {
  const player = ev.source
  if (!(player instanceof Player)) return
  const type = ev.itemStack?.typeId
  if (!type || !FAST_SET.has(type)) return
  const seconds = VIGENERSL_CONFIG.fast_cooldown[type]
  if (!seconds) return

  const now = Date.now()
  if (!shouldStart(player, now)) return

  const rec = VIGENERSL_COOLDOWNS.get(player.id) ?? {}
  const cur = Number(rec[type]) || 0
  const next = now + seconds * 1000
  if (next > cur) rec[type] = next
  VIGENERSL_COOLDOWNS.set(player.id, rec)
  saveCooldowns()
})

world.afterEvents.itemCompleteUse.subscribe(ev => {
  const player = ev.source
  if (!(player instanceof Player)) return
  const type = ev.itemStack?.typeId
  if (!type || !FOOD_SET.has(type)) return
  const seconds = VIGENERSL_CONFIG.food_cooldown[type]
  if (!seconds) return

  const now = Date.now()
  if (!shouldStart(player, now)) return

  const rec = VIGENERSL_COOLDOWNS.get(player.id) ?? {}
  const cur = Number(rec[type]) || 0
  const next = now + seconds * 1000
  if (next > cur) rec[type] = next
  VIGENERSL_COOLDOWNS.set(player.id, rec)
  saveCooldowns()
})

system.runInterval(() => {
  const now = Date.now()
  let dirty = false
  for (const [id, data] of VIGENERSL_COOLDOWNS) {
    for (const key in data) if (now >= data[key]) delete data[key]
    if (!Object.keys(data).length) { VIGENERSL_COOLDOWNS.delete(id); dirty = true }
  }
  if (dirty) saveCooldowns()
  for (const [id, t] of VIGENERSL_LASTMESSAGE) if (now - t > 5000) VIGENERSL_LASTMESSAGE.delete(id)
}, 200)

const VIGENERSL_ADDON = {
  ADDON: "VigeNerSl Cooldowns",
  VERSION: "1.0.0",
  STATUS: "GLOBAL",
  AUTHOR: "VigeNerSl",
  GITHUB: "github.com/VigeNerSl",
  TELEGRAM: "@VigeNerSl",
  PROTECT: "CC BY-NC-SA 4.0"
}

if (okCfg()) console.warn(`[${VIGENERSL_ADDON.ADDON}] v${VIGENERSL_ADDON.VERSION} by ${VIGENERSL_ADDON.AUTHOR} initialized`)
else console.error(`[${VIGENERSL_ADDON.ADDON}] failed to initialize`)
