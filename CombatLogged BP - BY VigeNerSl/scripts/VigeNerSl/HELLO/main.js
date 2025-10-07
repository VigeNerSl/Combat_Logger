import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";
import VIGENERSL_CONFIG from "../.././combatlog_config.js";
import "./cooldowns.js";

const VigeNerSlCombatState = { NONE: 0, ACTIVE: 1, COOLDOWN: 2 }
const VIGENERSL_DP_META = VIGENERSL_CONFIG.DP_BASE + ":meta"
const VIGENERSL_DP_LOCK = VIGENERSL_CONFIG.DP_BASE + ":lock"
const VIGENERSL_DP_LOCK_TS = VIGENERSL_CONFIG.DP_BASE + ":lockTs"

function vigeNerSlValidateConfig() {
  const C = VIGENERSL_CONFIG
  if (C.COMBAT_TICKS < 20) return false
  if (C.MAIN_LOOP_INTERVAL < 1) return false
  if (C.HUD_INTERVAL < 1) return false
  if (C.SNAP_INTERVAL_IDLE < 1 || C.SNAP_INTERVAL_COMBAT < 1) return false
  if (C.DP_CHUNK_SIZE <= 0 || C.DP_CHUNK_SIZE > 32000) return false
  if (C.MIN_XP_ORBS < 0) return false
  if (C.MAX_XP_ORBS < C.MIN_XP_ORBS) return false
  return true
}

function vigeNerSlHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h >>> 0
}

function vigeNerSlDpRead() {
  try {
    const m = world.getDynamicProperty(VIGENERSL_DP_META)
    if (typeof m !== "string" || !m.length) return {}
    const meta = JSON.parse(m)
    const parts = Number(meta?.parts) || 0
    if (!parts) return {}
    let s = ""
    for (let i = 0; i < parts; i++) {
      const part = world.getDynamicProperty(`${VIGENERSL_CONFIG.DP_BASE}:${i}`)
      if (typeof part === "string") s += part
    }
    if (!s.length) return {}
    if ((meta?.hash | 0) !== (vigeNerSlHash(s) | 0)) return {}
    return JSON.parse(s) || {}
  } catch {
    return {}
  }
}

function vigeNerSlDpWrite(obj) {
  try {
    const s = JSON.stringify(obj)
    if (!s) return false
    const hash = vigeNerSlHash(s) | 0
    const metaPrevRaw = world.getDynamicProperty(VIGENERSL_DP_META)
    const metaPrev = typeof metaPrevRaw === "string" && metaPrevRaw.length ? JSON.parse(metaPrevRaw) : { parts: 0, ver: 0 }
    const nOld = Number(metaPrev?.parts) || 0
    const parts = Math.ceil(s.length / VIGENERSL_CONFIG.DP_CHUNK_SIZE)
    for (let i = 0; i < parts; i++) {
      const chunk = s.slice(i * VIGENERSL_CONFIG.DP_CHUNK_SIZE, (i + 1) * VIGENERSL_CONFIG.DP_CHUNK_SIZE)
      world.setDynamicProperty(`${VIGENERSL_CONFIG.DP_BASE}:${i}`, chunk)
    }
    for (let i = parts; i < nOld; i++) world.setDynamicProperty(`${VIGENERSL_CONFIG.DP_BASE}:${i}`, undefined)
    const meta = { parts, hash, ver: (Number(metaPrev?.ver) || 0) + 1 }
    world.setDynamicProperty(VIGENERSL_DP_META, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

function vigeNerSlNow() {
  return system.currentTick
}

function vigeNerSlSafeWrite(obj) {
  const lockTs = Number(world.getDynamicProperty(VIGENERSL_DP_LOCK_TS)) || 0
  const now = vigeNerSlNow()
  if (lockTs && now - lockTs > VIGENERSL_CONFIG.LOCK_TIMEOUT_TICKS) {
    world.setDynamicProperty(VIGENERSL_DP_LOCK, 0)
    world.setDynamicProperty(VIGENERSL_DP_LOCK_TS, 0)
  }
  if ((world.getDynamicProperty(VIGENERSL_DP_LOCK) | 0) === 1) return false
  world.setDynamicProperty(VIGENERSL_DP_LOCK, 1)
  world.setDynamicProperty(VIGENERSL_DP_LOCK_TS, now)
  try {
    const backup = vigeNerSlDpRead()
    const s = JSON.stringify(obj)
    const ok = vigeNerSlDpWrite(obj)
    const cur = vigeNerSlDpRead()
    const s2 = JSON.stringify(cur)
    const valid = ok && s.length === s2.length && vigeNerSlHash(s) === vigeNerSlHash(s2)
    if (!valid) vigeNerSlDpWrite(backup)
    return valid
  } catch {
    return false
  } finally {
    world.setDynamicProperty(VIGENERSL_DP_LOCK, 0)
    world.setDynamicProperty(VIGENERSL_DP_LOCK_TS, 0)
  }
}

const vigeNerSlOffendersLoad = () => vigeNerSlDpRead()
const vigeNerSlOffendersSave = db => vigeNerSlSafeWrite(db)
const vigeNerSlKeyByName = n => `name:${n}`

function vigeNerSlMarkOffenderByName(name, dueTick) {
  try {
    const db = vigeNerSlOffendersLoad()
    const now = vigeNerSlNow()
    const ttl = Number(dueTick)
    const due = Number.isFinite(ttl) && ttl > 0 ? ttl : now + VIGENERSL_CONFIG.STATE_CLEANUP_THRESHOLD_TICKS
    db[vigeNerSlKeyByName(name)] = { name, dueTick: due, system: "VigeNerSl" }
    vigeNerSlOffendersSave(db)
  } catch {}
}

function vigeNerSlPopOffenderByName(name) {
  try {
    const db = vigeNerSlOffendersLoad()
    const k = vigeNerSlKeyByName(name)
    const has = !!db[k]
    if (has) {
      delete db[k]
      vigeNerSlOffendersSave(db)
    }
    return has
  } catch {
    return false
  }
}

function vigeNerSlPeekOffenderByName(name) {
  try {
    return vigeNerSlOffendersLoad()[vigeNerSlKeyByName(name)]
  } catch {
    return undefined
  }
}

const VIGENERSL_STATE = new Map()
const VIGENERSL_NAME2ID = new Map()
const VIGENERSL_PENDING_ANNOUNCE = new Map()
let VIGENERSL_COMMAND_BUDGET = VIGENERSL_CONFIG.COMMAND_RATE_LIMIT

function vigeNerSlDimKey(d) {
  const id = d?.id || "minecraft:overworld"
  if (id.endsWith("nether")) return "nether"
  if (id.endsWith("the_end")) return "the_end"
  return "overworld"
}

function vigeNerSlGetDim(key) {
  try {
    switch (key) {
      case "nether": return world.getDimension("nether")
      case "the_end": return world.getDimension("the_end")
      default: return world.getDimension("overworld")
    }
  } catch {
    return null
  }
}

function vigeNerSlGetState(p) {
  let s = VIGENERSL_STATE.get(p.id)
  if (!s) {
    s = {
      lastSeen: vigeNerSlNow(),
      lastHit: -9999,
      lastSnap: -9999,
      lastHud: -9999,
      lastHudKey: "",
      lastHudSec: -1,
      pos: null,
      dim: "overworld",
      inv: [],
      armor: [],
      off: null,
      combat: VigeNerSlCombatState.NONE,
      endMsg: -1,
      lvl: 0,
      name: p.name,
      snapJitter: vigeNerSlHash(p.id) % 7
    }
    VIGENERSL_STATE.set(p.id, s)
  }
  s.lastSeen = vigeNerSlNow()
  s.name = p.name
  VIGENERSL_NAME2ID.set(p.name, p.id)
  return s
}

const vigeNerSlInCombat = s => vigeNerSlNow() - s.lastHit <= VIGENERSL_CONFIG.COMBAT_TICKS
const vigeNerSlSanitizeName = n => n.replace(/[^a-zA-Z0-9_\- ]/g, "").substring(0, VIGENERSL_CONFIG.MAX_PLAYER_NAME_LENGTH)

function vigeNerSlEnsureTag(e, tag) {
  if (!e || !e.isValid()) return false
  if (!e.hasTag(tag)) {
    try { e.addTag(tag); return true } catch {}
  }
  return false
}

function vigeNerSlRemoveTag(e, tag) {
  if (!e || !e.isValid()) return false
  if (e.hasTag(tag)) {
    try { e.removeTag(tag); return true } catch {}
  }
  return false
}

function vigeNerSlReadLevel(p) {
  try {
    if (typeof p.level === "number") return Math.max(0, p.level | 0)
  } catch {}
  try {
    const c = p.getComponent("minecraft:experience")
    const lvl = c?.level
    if (typeof lvl === "number") return Math.max(0, lvl | 0)
  } catch {}
  return 0
}

function vigeNerSlSerializeItem(it) {
  try {
    return it ? { id: it.typeId, amount: it.amount | 0, data: it.getComponents ? it.getComponents().map(c => ({ id: c.typeId })) : [] } : null
  } catch {
    return it ? { id: it.typeId, amount: it.amount | 0 } : null
  }
}

function vigeNerSlDeserializeItem(desc) {
  try {
    if (!desc || !desc.id) return null
    const stack = new ItemStack(desc.id, Math.max(1, desc.amount | 0))
    return stack
  } catch {
    return null
  }
}

function vigeNerSlSnapshot(p, s) {
  if (!p || !p.isValid()) return false
  try {
    const inv = p.getComponent("minecraft:inventory")?.container
    const eq = p.getComponent("minecraft:equippable")
    s.inv.length = 0
    s.armor.length = 0
    s.off = null
    if (inv) {
      for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i)
        if (it) {
          const d = vigeNerSlSerializeItem(it)
          if (d) s.inv.push(d)
        }
      }
    }
    if (eq) {
      for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
        const it = eq.getEquipment(slot)
        if (it) {
          const d = vigeNerSlSerializeItem(it)
          if (d) s.armor.push(d)
        }
      }
      const off = eq.getEquipment(EquipmentSlot.Offhand)
      if (off) s.off = vigeNerSlSerializeItem(off)
    }
    s.lvl = vigeNerSlReadLevel(p)
    return true
  } catch {
    return false
  }
}

function vigeNerSlUpdateLoc(p, s) {
  if (!p || !p.isValid()) return
  try {
    const l = p.location
    s.pos = { x: l.x, y: l.y, z: l.z }
    s.dim = vigeNerSlDimKey(p.dimension)
  } catch {}
}

function vigeNerSlTryCmd(emit) {
  if (VIGENERSL_COMMAND_BUDGET <= 0) return false
  const ok = emit()
  if (ok) VIGENERSL_COMMAND_BUDGET--
  return ok
}

function vigeNerSlDimCmd(dim, cmd) {
  return vigeNerSlTryCmd(() => {
    try { if (!dim || typeof dim.runCommand !== "function") return false; dim.runCommand(cmd); return true } catch { return false }
  })
}

function vigeNerSlPlayerCmd(p, cmd) {
  return vigeNerSlTryCmd(() => {
    try { if (!p?.isValid() || typeof p.runCommand !== "function") return false; p.runCommand(cmd); return true } catch { return false }
  })
}

function vigeNerSlDropItems(dim, items, base) {
  if (!dim || !items?.length) return false
  try {
    system.runJob((function* () {
      let i = 0
      while (i < items.length) {
        const end = Math.min(i + VIGENERSL_CONFIG.ITEMS_PER_TICK, items.length)
        for (; i < end; i++) {
          const it = vigeNerSlDeserializeItem(items[i])
          if (it) {
            try { dim.spawnItem(it, base) } catch {}
          }
        }
        yield
      }
    })())
    return true
  } catch {
    return false
  }
}

function vigeNerSlDropSnapshot(s) {
  if (!s?.pos || !s.dim) return false
  const dim = vigeNerSlGetDim(s.dim)
  if (!dim) return false
  const base = {
    x: Math.floor(s.pos.x) + 0.5,
    y: Math.floor(s.pos.y) + VIGENERSL_CONFIG.HEAD_Y_OFFSET,
    z: Math.floor(s.pos.z) + 0.5
  }
  const items = [...s.inv, ...s.armor, ...(s.off ? [s.off] : [])]
  return vigeNerSlDropItems(dim, items, base)
}

function vigeNerSlDropExperience(s) {
  if (!s?.pos || !s.lvl) return false
  const dim = vigeNerSlGetDim(s.dim)
  if (!dim) return false
  const total = Math.max(VIGENERSL_CONFIG.MIN_XP_ORBS, Math.min(VIGENERSL_CONFIG.MAX_XP_ORBS, s.lvl | 0))
  const perTick = Math.max(1, VIGENERSL_CONFIG.XP_ORBS_PER_TICK | 0)
  const scatter = Math.max(0, VIGENERSL_CONFIG.XP_ORB_SCATTER)
  system.runJob((function* () {
    let left = total
    while (left > 0) {
      const n = Math.min(perTick, left)
      for (let i = 0; i < n; i++) {
        const dx = (Math.random() * 2 - 1) * scatter
        const dy = (Math.random() * 2 - 1) * scatter
        const dz = (Math.random() * 2 - 1) * scatter
        const x = (s.pos.x | 0) + 0.5 + dx
        const y = (s.pos.y | 0) + VIGENERSL_CONFIG.HEAD_Y_OFFSET + dy
        const z = (s.pos.z | 0) + 0.5 + dz
        vigeNerSlDimCmd(dim, `summon xp_orb ${x} ${y} ${z}`)
      }
      left -= n
      yield
    }
  })())
  return true
}

function vigeNerSlKillPlayer(p) {
  try {
    const raw = p?.name ?? ""
    const safe = raw.replace(/["\\]/g, "\\$&")
    const dim = p?.dimension
    if (dim && vigeNerSlDimCmd(dim, `kill @a[name="${safe}",c=1]`)) return true
  } catch {}
  try {
    if (p?.isValid() && typeof p.applyDamage === "function") {
      p.applyDamage(1000)
      return true
    }
  } catch {}
  return false
}

function vigeNerSlMarkCombat(p, s, t) {
  if (t !== s.lastHit) {
    s.lastHit = t
    vigeNerSlEnsureTag(p, VIGENERSL_CONFIG.COMBAT_TAG)
    vigeNerSlUpdateLoc(p, s)
    vigeNerSlSnapshot(p, s)
  }
}

function vigeNerSlMelee(att, vic, t) {
  const sv = vigeNerSlGetState(vic)
  const sa = vigeNerSlGetState(att)
  vigeNerSlMarkCombat(vic, sv, t)
  vigeNerSlMarkCombat(att, sa, t)
}

function vigeNerSlRanged(sh, vic, t) {
  const sv = vigeNerSlGetState(vic)
  const ss = vigeNerSlGetState(sh)
  vigeNerSlMarkCombat(vic, sv, t)
  vigeNerSlMarkCombat(sh, ss, t)
}

function vigeNerSlTagByDamage(ev) {
  try {
    const v = ev.hurtEntity
    const src = ev.damageSource
    const atk = src?.damagingEntity
    const owner = src?.projectile?.owner
    const t = vigeNerSlNow()
    if (atk?.typeId === "minecraft:player" && v?.typeId === "minecraft:player" && atk.isValid() && v.isValid()) return vigeNerSlMelee(atk, v, t)
    if (owner?.typeId === "minecraft:player" && v?.typeId === "minecraft:player" && owner.isValid() && v.isValid()) return vigeNerSlRanged(owner, v, t)
  } catch {}
}

function vigeNerSlClearInv(p) {
  if (!p || !p.isValid()) return
  try {
    const inv = p.getComponent("minecraft:inventory")?.container
    if (inv) for (let i = 0; i < inv.size; i++) try { inv.setItem(i) } catch {}
  } catch {}
  try {
    const eq = p.getComponent("minecraft:equippable")
    if (eq) for (const s of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) try { eq.setEquipment(s) } catch {}
  } catch {}
}

function vigeNerSlClearXP(p) {
  if (!p || !p.isValid()) return
  try {
    const e = p.getComponent("minecraft:experience")
    if (e) { e.level = 0; e.experience = 0 }
  } catch {}
  const n = p.name.replace(/["\\]/g, "\\$&")
  if (n) {
    vigeNerSlPlayerCmd(p, `xp -2147483647L "${n}"`)
    vigeNerSlPlayerCmd(p, `xp -2147483647 "${n}"`)
  }
}

function vigeNerSlUpdateHUD(p, s, inC) {
  const t = vigeNerSlNow()
  if (t - s.lastHud < VIGENERSL_CONFIG.HUD_INTERVAL) return
  s.lastHud = t
  if (!p || !p.isValid()) return
  try {
    if (inC) {
      const sec = Math.ceil(Math.max(0, VIGENERSL_CONFIG.COMBAT_TICKS - (t - s.lastHit)) / 20)
      if (s.lastHudKey !== "combat" || s.lastHudSec !== sec) {
        s.lastHudKey = "combat"
        s.lastHudSec = sec
        p.onScreenDisplay.setActionBar({
          rawtext: [
            { translate: "vigenersl.combat.timer" },
            { text: " " },
            { text: String(sec) },
            { text: " " },
            { translate: "vigenersl.combat.wait" }
          ]
        })
      }
    } else if (s.combat === VigeNerSlCombatState.COOLDOWN) {
      if (s.lastHudKey !== "ended") {
        s.lastHudKey = "ended"
        s.lastHudSec = -1
        p.onScreenDisplay.setActionBar({ translate: "vigenersl.combat.ended.bar" })
      }
    }
  } catch {}
}

world.afterEvents.entityHurt.subscribe(vigeNerSlTagByDamage)

world.afterEvents.entityDie.subscribe(ev => {
  try {
    const e = ev.deadEntity
    if (e?.typeId !== "minecraft:player") return
    const name = e.name
    const cnt = VIGENERSL_PENDING_ANNOUNCE.get(name) | 0
    if (cnt > 0) {
      for (let i = 0; i < cnt; i++) {
        try { e.sendMessage({ translate: "vigenersl.combat.relog.killed" }) } catch {}
      }
      VIGENERSL_PENDING_ANNOUNCE.delete(name)
    }
    const s = VIGENERSL_STATE.get(e.id)
    if (s) {
      s.lastHit = -9999
      s.combat = VigeNerSlCombatState.NONE
    }
    vigeNerSlRemoveTag(e, VIGENERSL_CONFIG.COMBAT_TAG)
  } catch {}
})

world.afterEvents.playerLeave.subscribe(ev => {
  try {
    const id = ev.playerId ?? VIGENERSL_NAME2ID.get(ev.playerName)
    const s = id ? VIGENERSL_STATE.get(id) : null
    const name = ev.playerName || s?.name
    if (!name) return
    if (s && vigeNerSlInCombat(s)) {
      try { vigeNerSlDropSnapshot(s) } catch {}
      try { vigeNerSlDropExperience(s) } catch {}
      vigeNerSlMarkOffenderByName(name, 0)
      s.lastHit = -9999
      s.combat = VigeNerSlCombatState.NONE
    }
    VIGENERSL_PENDING_ANNOUNCE.delete(id || name)
  } catch {}
})

world.afterEvents.playerSpawn.subscribe(ev => {
  try {
    if (!ev.initialSpawn) return
    const p = ev.player
    if (!p?.isValid()) return
    const name = p.name
    const rec = vigeNerSlPeekOffenderByName(name)
    if (!rec) return
    vigeNerSlClearInv(p)
    vigeNerSlClearXP(p)
    VIGENERSL_PENDING_ANNOUNCE.set(name, 3)
    vigeNerSlPopOffenderByName(name)
    vigeNerSlRemoveTag(p, VIGENERSL_CONFIG.COMBAT_TAG)
    const s = vigeNerSlGetState(p)
    s.lastHit = -9999
    s.combat = VigeNerSlCombatState.NONE
    system.runTimeout(() => { try { if (p.isValid()) vigeNerSlKillPlayer(p) } catch {} }, VIGENERSL_CONFIG.RESPAWN_KILL_DELAY_TICKS)
  } catch {}
})

system.runInterval(() => {
  const t = vigeNerSlNow()
  for (const p of world.getPlayers()) {
    if (!p?.isValid()) continue
    try {
      const s = vigeNerSlGetState(p)
      vigeNerSlUpdateLoc(p, s)
      const inC = vigeNerSlInCombat(s)
      const prev = s.combat
      if (inC) {
        s.combat = VigeNerSlCombatState.ACTIVE
        vigeNerSlEnsureTag(p, VIGENERSL_CONFIG.COMBAT_TAG)
        const base = VIGENERSL_CONFIG.SNAP_INTERVAL_COMBAT
        const snapInt = base + s.snapJitter
        if (t - s.lastSnap >= snapInt) {
          s.lastSnap = t
          vigeNerSlSnapshot(p, s)
        }
      } else {
        if (prev === VigeNerSlCombatState.ACTIVE) {
          s.combat = VigeNerSlCombatState.COOLDOWN
          try { p.sendMessage({ translate: "vigenersl.combat.ended.chat" }) } catch {}
          s.endMsg = t + VIGENERSL_CONFIG.END_MESSAGE_DURATION
        }
        if (s.combat === VigeNerSlCombatState.COOLDOWN && t > s.endMsg) s.combat = VigeNerSlCombatState.NONE
        vigeNerSlRemoveTag(p, VIGENERSL_CONFIG.COMBAT_TAG)
        const base = VIGENERSL_CONFIG.SNAP_INTERVAL_IDLE
        const snapInt = base + s.snapJitter
        if (t - s.lastSnap >= snapInt) {
          s.lastSnap = t
          vigeNerSlSnapshot(p, s)
        }
      }
      vigeNerSlUpdateHUD(p, s, inC)
    } catch {}
  }
}, VIGENERSL_CONFIG.MAIN_LOOP_INTERVAL)

system.runInterval(() => {
  try {
    const t = vigeNerSlNow()
    const thr = VIGENERSL_CONFIG.STATE_CLEANUP_THRESHOLD_TICKS
    for (const [id, s] of VIGENERSL_STATE) {
      if (t - s.lastSeen > thr) {
        VIGENERSL_STATE.delete(id)
        if (VIGENERSL_NAME2ID.get(s.name) === id) VIGENERSL_NAME2ID.delete(s.name)
      }
    }
    for (const [k] of VIGENERSL_PENDING_ANNOUNCE) {
      if (!VIGENERSL_NAME2ID.has(k) && ![...VIGENERSL_STATE.values()].some(s => s.name === k)) VIGENERSL_PENDING_ANNOUNCE.delete(k)
    }
    const db = vigeNerSlOffendersLoad()
    let changed = false
    for (const key of Object.keys(db)) {
      const rec = db[key]
      const due = Number(rec?.dueTick) || 0
      if (due > 0 && t >= due) {
        delete db[key]
        changed = true
      }
    }
    if (changed) vigeNerSlOffendersSave(db)
  } catch {}
}, VIGENERSL_CONFIG.CLEAN_INTERVAL)

system.runInterval(() => {
  try { VIGENERSL_COMMAND_BUDGET = VIGENERSL_CONFIG.COMMAND_RATE_LIMIT } catch {}
}, 20)

/* --- META DATA --- */
const VIGENERSL_ADDON = {
  ADDON: "VigeNerSl CombatLogger",
  VERSION: "1.2.0",
  STATUS: "GLOBAL",
  AUTHOR: "VigeNerSl",
  GITHUB: "github.com/VigeNerSl",
  TELEGRAM: "@VigeNerSl",
  PROTECT: "CC BY-NC-SA 4.0"
}

if (vigeNerSlValidateConfig()) console.warn(`[${VIGENERSL_ADDON.ADDON}] v${VIGENERSL_ADDON.VERSION} by ${VIGENERSL_ADDON.AUTHOR} initialized`)
else console.error(`[${VIGENERSL_ADDON.ADDON}] failed to initialize`)
