import { LAYERS } from './config'
import { parse } from './hex'
import type { Piece, State } from './types'

export const SAVE_VERSION = 1
const SAVE_KEY = 'evercraft3-save'
export const MAX_OFFLINE_SECONDS = 7 * 24 * 60 * 60

export function layerBoard(layer: number): { lit: Record<string, boolean>; board: Record<string, Piece> } {
  const L = LAYERS[layer]
  const lit: Record<string, boolean> = {}
  for (const k of L.startLit) lit[k] = true
  const board: Record<string, Piece> = {}
  for (const w of L.wells) board[w.at] = { kind: 'well', fixed: true, dir: w.dir, color: w.color, base: w.base }
  if (L.twinAt) board[L.twinAt] = { kind: 'twin', fixed: true }
  return { lit, board }
}

export function defaultState(): State {
  const { lit, board } = layerBoard(1)
  board['0,0'] = { kind: 'foundry', recipe: 'shard' }
  return {
    v: SAVE_VERSION,
    layer: 1,
    wellOpen: false,
    lit,
    board,
    tray: { foundry: 0, basin: 0, prism: 0, yprism: 0, mirror: 0, glass: 0, lectern: 0, relic: 0, keystone: 0 },
    stock: { shard: 0, lozenge: 0, brilliant: 0, twin: 0 },
    cut: { shard: 0, lozenge: 0, brilliant: 0, twin: 0 },
    mana: 0,
    banked: 0,
    insight: 0,
    autoShare: { shard: 0, lozenge: 0, brilliant: 0, twin: 0 },
    hexBought: 0,
    research: { keen: 0, bezel: 0, deep: 0, lantern: 0, bright: 0, ycut: 0 },
    unlocked: { auto: false, prism: false, mirror: false },
    bought: { foundry: 0, prism: 0, mirror: 0 },
    delve: {},
    delveDone: {},
    keystones: [],
    endSeen: false,
    time: 0,
    layerTime: 0,
    lastTs: Date.now(),
    sound: true,
  }
}

const isState = (x: unknown): x is State => {
  if (!x || typeof x !== 'object') return false
  const s = x as State
  if (s.v !== SAVE_VERSION || !LAYERS[s.layer] || typeof s.board !== 'object' || typeof s.lit !== 'object') return false
  for (const k in s.board) { const [q, r] = parse(k); if (!Number.isFinite(q) || !Number.isFinite(r)) return false }
  return typeof s.mana === 'number' && typeof s.stock === 'object' && typeof s.tray === 'object'
}

/** Fill in any fields a newer build added, so old saves keep loading. */
const merge = (s: State): State => {
  const d = defaultState()
  return {
    ...d, ...s,
    tray: { ...d.tray, ...s.tray }, stock: { ...d.stock, ...s.stock }, cut: { ...d.cut, ...s.cut },
    autoShare: { ...d.autoShare, ...s.autoShare }, research: { ...d.research, ...s.research },
    unlocked: { ...d.unlocked, ...s.unlocked }, bought: { ...d.bought, ...s.bought },
  }
}

export const encodeSave = (s: State): string => btoa(unescape(encodeURIComponent(JSON.stringify(s))))

export const decodeSave = (text: string): State | null => {
  try {
    const obj = JSON.parse(decodeURIComponent(escape(atob(text.trim()))))
    return isState(obj) ? merge(obj) : null
  } catch { return null }
}

export function saveLocal(s: State): boolean {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true } catch { return false }
}

export function loadLocal(): State | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    return isState(obj) ? merge(obj) : null
  } catch { return null }
}

export function clearLocal(): void {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* storage unavailable */ }
}
