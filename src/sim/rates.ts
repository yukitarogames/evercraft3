// Turns a beam trace into production rates. Pure.
import { neighbors } from '../hex'
import {
  GEMS, GEM_ORDER, LAYERS, VEIN_MULT, SET_EXP, BRILLIANT_RESONANCE, DEEP_MULT, LANTERN_MULT, STARVE_WINDOW,
} from '../config'
import type { GemId, Piece, Rates, State } from '../types'
import { trace } from './trace'

export const settingMult = (p: Piece): number =>
  p.setGem && p.setN ? 1 + GEMS[p.setGem].setK * Math.pow(p.setN, SET_EXP) : 1

export const resonanceMult = (s: State, k: string): number => {
  let m = 1
  for (const nk of neighbors(k)) {
    const p = s.board[nk]
    if (p && p.kind === 'stack' && p.gem === 'brilliant' && s.lit[nk]) m *= 1 + BRILLIANT_RESONANCE * Math.log10(1 + (p.n ?? 0))
  }
  return m
}

export const stackKeys = (s: State, gem: GemId): string[] =>
  Object.keys(s.board).filter(k => s.board[k].kind === 'stack' && s.board[k].gem === gem)

export const effectiveShare = (s: State, gem: GemId): number =>
  s.unlocked.auto && stackKeys(s, gem).length > 0 ? s.autoShare[gem] : 0

const zero = (): Record<GemId, number> => ({ shard: 0, lozenge: 0, brilliant: 0, twin: 0 })

export function computeRates(s: State): Rates {
  const tr = trace(s)
  const layer = LAYERS[s.layer]
  const r: Rates = { tr, out: {}, starved: {}, gross: zero(), use: zero(), toStack: zero(), net: zero(), mana: 0, insight: 0, delve: {} }
  const want: { k: string; gem: GemId; crafts: number }[] = []
  for (const k in s.board) {
    const p = s.board[k]
    const t = tr.term[k]
    if (p.kind === 'foundry') {
      const gem = p.recipe ?? 'shard'
      const crafts = ((t?.mana || 0) / GEMS[gem].light) * (layer.veins.includes(k) ? VEIN_MULT : 1) * settingMult(p) * resonanceMult(s, k)
      want.push({ k, gem, crafts })
    } else if (p.kind === 'twin') {
      want.push({ k, gem: 'twin', crafts: (Math.sqrt((t?.mana || 0) * (t?.violet || 0)) / GEMS.twin.light) * resonanceMult(s, k) })
    } else if (p.kind === 'basin') {
      r.out[k] = (t?.mana || 0) * Math.pow(DEEP_MULT, s.research.deep)
      r.mana += r.out[k]
    } else if (p.kind === 'lectern') {
      r.out[k] = t?.amber || 0
      r.insight += r.out[k]
    }
  }
  // Lower tiers first, so a starved foundry passes its reduced output up the chain.
  for (const gem of GEM_ORDER) {
    const list = want.filter(w => w.gem === gem)
    if (!list.length) continue
    const input = GEMS[gem].input
    let factor = 1
    if (input) {
      const [ig, qty] = input
      const demand = list.reduce((a, w) => a + w.crafts * qty, 0)
      const supply = r.gross[ig] * (1 - effectiveShare(s, ig))
      if (demand > 0 && s.stock[ig] < demand * STARVE_WINDOW && demand > supply) factor = supply / demand
      r.use[ig] += demand * factor
    }
    for (const w of list) {
      r.out[w.k] = w.crafts * factor
      r.gross[gem] += w.crafts * factor
      if (factor < 1) r.starved[w.k] = true
    }
  }
  for (const gem of GEM_ORDER) {
    r.toStack[gem] = r.gross[gem] * effectiveShare(s, gem)
    r.net[gem] = r.gross[gem] - r.toStack[gem] - r.use[gem]
  }
  for (const id in tr.delve) r.delve[id] = tr.delve[id] * Math.pow(LANTERN_MULT, s.research.lantern)
  return r
}
