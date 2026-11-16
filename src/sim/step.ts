// Advances the simulation. Mutates state; renders nothing.
import {
  GEM_ORDER, LAYERS, AUTO_UNLOCK_SHARDS, PRISM_UNLOCK_SHARDS, MIRROR_UNLOCK_LOZENGES, DEFAULT_AUTO_SHARE, PIECE_NAME,
} from '../config'
import type { Rates, State } from '../types'
import { computeRates, stackKeys } from './rates'

const ONLINE_STEP = 0.2
const MAX_STEPS = 4000

export type Events = string[]

export function checkUnlocks(s: State, ev?: Events): void {
  if (!s.unlocked.auto && s.cut.shard >= AUTO_UNLOCK_SHARDS) {
    s.unlocked.auto = true
    for (const g of GEM_ORDER) s.autoShare[g] = DEFAULT_AUTO_SHARE
    ev?.push('Auto-set unlocked: half of every new gem now flows into its stack on the board')
  }
  if (!s.unlocked.prism && s.cut.shard >= PRISM_UNLOCK_SHARDS) {
    s.unlocked.prism = true
    s.tray.prism += 1
    s.tray.basin += 1
    for (const k of LAYERS[s.layer].prismLit) s.lit[k] = true
    ev?.push('Prism and Basin unlocked: split the beam and bank mana')
  }
  if (!s.unlocked.mirror && s.cut.lozenge >= MIRROR_UNLOCK_LOZENGES) {
    s.unlocked.mirror = true
    s.tray.mirror += 1
    ev?.push('Mirror unlocked: bend a beam without losing light')
  }
}

function stepOnce(s: State, h: number, ev?: Events): Rates {
  const r = computeRates(s)
  for (const g of GEM_ORDER) {
    s.stock[g] = Math.max(0, s.stock[g] + r.net[g] * h)
    s.cut[g] += r.gross[g] * h
    if (r.toStack[g] > 0) {
      const ks = stackKeys(s, g)
      for (const k of ks) s.board[k].n = (s.board[k].n ?? 0) + (r.toStack[g] * h) / ks.length
    }
  }
  s.mana += r.mana * h
  s.banked += r.mana * h
  s.insight += r.insight * h
  for (const d of LAYERS[s.layer].delves) {
    if (s.delveDone[d.id] || !r.delve[d.id]) continue
    s.delve[d.id] = (s.delve[d.id] || 0) + r.delve[d.id] * h
    if (s.delve[d.id] >= d.need) {
      s.delveDone[d.id] = true
      s.tray[d.reward] += 1
      ev?.push(`Delve complete: ${d.name} added to your tray (${PIECE_NAME[d.reward]})`)
    }
  }
  s.time += h
  s.layerTime += h
  checkUnlocks(s, ev)
  return r
}

/** Advance by dt seconds. Long gaps (offline time) are split into at most MAX_STEPS steps. */
export function advance(s: State, dt: number, ev?: Events): Rates {
  if (!(dt > 0)) return computeRates(s)
  const n = Math.max(1, Math.min(MAX_STEPS, Math.ceil(dt / ONLINE_STEP)))
  const h = dt / n
  let r!: Rates
  for (let i = 0; i < n; i++) r = stepOnce(s, h, ev)
  return r
}
