// Player actions. Each validates, mutates state, and returns true if it happened.
import { hexDist, neighbors, parse } from '../hex'
import { GEMS, LAYERS, PIECE_COST, RESEARCH, PIECE_NAME, keystoneGrade } from '../config'
import type { GemId, Piece, ResearchId, State, TrayKind } from '../types'
import { layerBoard } from '../state'
import { trace } from './trace'
import type { Events } from './step'

const TURN_CYCLE = [1, 2, -2, -1]

export const recipeUnlocked = (s: State, gem: GemId): boolean => {
  if (gem === 'twin') return false
  const u = GEMS[gem].unlock
  return !u || s.cut[u[0]] >= u[1]
}

export const hexPrice = (s: State): number => {
  const L = LAYERS[s.layer]
  return Math.round(L.hexBase * Math.pow(L.hexGrowth, s.hexBought))
}

export const onBoard = (s: State, k: string): boolean => {
  const [q, r] = parse(k)
  return hexDist(q, r) <= LAYERS[s.layer].R
}

export const canLight = (s: State, k: string): boolean =>
  onBoard(s, k) && !s.lit[k] && neighbors(k).some(n => s.lit[n])

export function lightHex(s: State, k: string, ev?: Events): boolean {
  const price = hexPrice(s)
  if (!canLight(s, k) || s.mana < price) return false
  s.mana -= price
  s.hexBought += 1
  s.lit[k] = true
  const cache = LAYERS[s.layer].caches[k]
  if (cache) {
    const names: string[] = []
    for (const kind in cache) { s.tray[kind as TrayKind] += cache[kind as TrayKind]!; names.push(PIECE_NAME[kind]) }
    ev?.push(`Found in the dark: ${names.join(' and ')}`)
  }
  return true
}

export const pieceCost = (s: State, kind: 'foundry' | 'prism' | 'mirror'): number => {
  const c = PIECE_COST[kind]
  return Math.round(c.base * Math.pow(c.growth, s.bought[kind]))
}

export const canBuyPiece = (s: State, kind: 'foundry' | 'prism' | 'mirror'): boolean => {
  if (kind === 'mirror' ? !s.unlocked.mirror : !s.unlocked.prism) return false
  const c = PIECE_COST[kind]
  const have = c.currency === 'mana' ? s.mana : s.stock[c.currency]
  return have >= pieceCost(s, kind)
}

export function buyPiece(s: State, kind: 'foundry' | 'prism' | 'mirror'): boolean {
  if (!canBuyPiece(s, kind)) return false
  const c = PIECE_COST[kind], cost = pieceCost(s, kind)
  if (c.currency === 'mana') s.mana -= cost
  else s.stock[c.currency] -= cost
  s.bought[kind] += 1
  s.tray[kind] += 1
  return true
}

export const researchCost = (s: State, id: ResearchId): number => {
  const c = RESEARCH.find(x => x.id === id)!
  return Math.round(c.base * Math.pow(c.growth, s.research[id]))
}

export function buyResearch(s: State, id: ResearchId): boolean {
  const c = RESEARCH.find(x => x.id === id)!
  const cost = researchCost(s, id)
  if (s.research[id] >= c.max || s.insight < cost) return false
  s.insight -= cost
  s.research[id] += 1
  if (id === 'ycut') s.tray.yprism += 1
  return true
}

export function openWell(s: State): boolean {
  if (s.wellOpen) return false
  s.wellOpen = true
  return true
}

const newPiece = (s: State, kind: TrayKind): Piece => {
  switch (kind) {
    case 'foundry': return { kind, recipe: 'shard' }
    case 'prism': return { kind, turn: 1 }
    case 'mirror': return { kind, turn: 2 }
    case 'yprism': return { kind, turn: 2 }
    case 'keystone': {
      const used = new Set(Object.values(s.board).filter(p => p.kind === 'keystone').map(p => p.ks))
      let i = 0
      while (used.has(i)) i++
      return { kind, ks: i }
    }
    default: return { kind }
  }
}

export const canPlaceAt = (s: State, k: string): boolean => !!s.lit[k] && !s.board[k]

export function placePiece(s: State, kind: TrayKind, k: string): boolean {
  if (s.tray[kind] < 1 || !canPlaceAt(s, k)) return false
  s.tray[kind] -= 1
  s.board[k] = newPiece(s, kind)
  return true
}

/** Set every whole gem of this type from stock into an empty socket. */
export function placeGem(s: State, gem: GemId, k: string): boolean {
  const n = Math.floor(s.stock[gem])
  if (n < 1 || !canPlaceAt(s, k)) return false
  s.stock[gem] -= n
  s.board[k] = { kind: 'stack', gem, n }
  return true
}

/** Move a piece. Dropping on another movable piece swaps them. */
export function movePiece(s: State, from: string, to: string): boolean {
  const p = s.board[from]
  if (!p || p.fixed || from === to || !s.lit[to]) return false
  const other = s.board[to]
  if (other?.fixed) return false
  s.board[to] = p
  if (other) s.board[from] = other
  else delete s.board[from]
  return true
}

/** Take a piece off the board. Gems go back to stock, tools back to the tray. */
export function removePiece(s: State, k: string): boolean {
  const p = s.board[k]
  if (!p || p.fixed) return false
  if (p.kind === 'stack') s.stock[p.gem!] += p.n ?? 0
  else {
    if (p.kind === 'foundry' && p.setGem) s.stock[p.setGem] += p.setN ?? 0
    s.tray[p.kind as TrayKind] += 1
  }
  delete s.board[k]
  return true
}

export const isRotatable = (p: Piece | undefined): boolean => !!p && (p.kind === 'prism' || p.kind === 'mirror' || p.kind === 'yprism')

export function rotatePiece(s: State, k: string, back = false): boolean {
  const p = s.board[k]
  if (!p || !isRotatable(p)) return false
  if (p.kind === 'yprism') p.turn = Math.abs(p.turn ?? 2) === 2 ? 1 : 2
  else {
    const i = TURN_CYCLE.indexOf(p.turn ?? 1)
    p.turn = TURN_CYCLE[(i + (back ? TURN_CYCLE.length - 1 : 1)) % TURN_CYCLE.length]
  }
  return true
}

export function setRecipe(s: State, k: string, gem: GemId): boolean {
  const p = s.board[k]
  if (!p || p.kind !== 'foundry' || !recipeUnlocked(s, gem)) return false
  p.recipe = gem
  return true
}

export function addToStack(s: State, k: string, frac: number): boolean {
  const p = s.board[k]
  if (!p || p.kind !== 'stack') return false
  const amt = Math.floor(s.stock[p.gem!] * frac)
  if (amt < 1) return false
  s.stock[p.gem!] -= amt
  p.n = (p.n ?? 0) + amt
  return true
}

export function takeFromStack(s: State, k: string, frac: number): boolean {
  const p = s.board[k]
  if (!p || p.kind !== 'stack') return false
  const amt = Math.floor((p.n ?? 0) * frac)
  if (amt < 1) return false
  p.n = (p.n ?? 0) - amt
  s.stock[p.gem!] += amt
  return true
}

export function setInFoundry(s: State, k: string, gem: GemId, frac: number): boolean {
  const p = s.board[k]
  if (!p || p.kind !== 'foundry' || !s.research.bezel) return false
  if (p.setGem && p.setGem !== gem && (p.setN ?? 0) > 0) return false
  const amt = Math.floor(s.stock[gem] * frac)
  if (amt < 1) return false
  s.stock[gem] -= amt
  p.setGem = gem
  p.setN = (p.setN ?? 0) + amt
  return true
}

export function clearSetting(s: State, k: string): boolean {
  const p = s.board[k]
  if (!p || p.kind !== 'foundry' || !p.setGem) return false
  s.stock[p.setGem] += p.setN ?? 0
  delete p.setGem
  delete p.setN
  return true
}

export function setShare(s: State, gem: GemId, v: number): boolean {
  if (!s.unlocked.auto) return false
  s.autoShare[gem] = Math.max(0, Math.min(1, v))
  return true
}

export const hasNextLayer = (s: State): boolean => !!LAYERS[s.layer + 1]
export const canCrystallize = (s: State): boolean => hasNextLayer(s) && s.mana >= LAYERS[s.layer].goal
export const previewGrade = (s: State): number => keystoneGrade(s.banked)

/** Fuse the board into a Keystone and open the next layer. Never called automatically. */
export function crystallize(s: State): boolean {
  if (!canCrystallize(s)) return false
  const segs = trace(s).segs.filter(g => !g.exit).map(g => [g.a[0], g.a[1], g.b[0], g.b[1]])
  s.keystones.push({ grade: previewGrade(s), segs })
  // Tools go back to the tray. Gems (stacks, settings, stock) are fused into the Keystone.
  for (const k in s.board) {
    const p = s.board[k]
    if (p.fixed || p.kind === 'stack') continue
    s.tray[p.kind as TrayKind] += 1
  }
  s.tray.keystone += 1
  s.layer += 1
  const next = layerBoard(s.layer)
  s.lit = next.lit
  s.board = next.board
  s.stock = { shard: 0, lozenge: 0, brilliant: 0, twin: 0 }
  s.cut = { shard: 0, lozenge: 0, brilliant: 0, twin: 0 }
  s.mana = 0
  s.banked = 0
  s.hexBought = 0
  s.delve = {}
  s.delveDone = {}
  s.layerTime = 0
  s.wellOpen = true
  return true
}
