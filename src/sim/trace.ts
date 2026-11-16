// Beam tracing. Pure: reads state, returns where light goes.
import { DIRS, key, parse, turnDir } from '../hex'
import {
  LAYERS, SHARD_ADD, SHARD_EXP, KEEN_BONUS, LOZENGE_MULT, TWIN_MULT,
  RELIC_MULT, GLASS_RATIO, BRIGHT_MULT,
} from '../config'
import type { Color, Piece, Seg, State, Trace } from '../types'

interface Beam { q: number; r: number; dir: number; pw: number; col: Color; seen: Set<string> }

export const wellPower = (s: State, p: Piece): number => (p.base ?? 1) * Math.pow(BRIGHT_MULT, s.research.bright)

/** What a stack of gems does to a beam of power `pw` passing through it. */
export const lensApply = (s: State, p: Piece, pw: number): number => {
  const n = p.n ?? 0
  switch (p.gem) {
    case 'shard': return pw + lensShardAdd(s, n)
    case 'lozenge': return pw * lensMult('lozenge', n)
    case 'twin': return pw * lensMult('twin', n)
    default: return pw
  }
}
export const lensShardAdd = (s: State, n: number): number => SHARD_ADD * Math.pow(n, SHARD_EXP) * (1 + KEEN_BONUS * s.research.keen)
export const lensMult = (gem: 'lozenge' | 'twin', n: number): number =>
  1 + (gem === 'lozenge' ? LOZENGE_MULT : TWIN_MULT) * Math.log10(1 + n)

const add = (rec: Record<string, Partial<Record<Color, number>>>, k: string, col: Color, pw: number) => {
  const t = rec[k] || (rec[k] = {})
  t[col] = (t[col] || 0) + pw
}

export function trace(s: State): Trace {
  const out: Trace = { segs: [], term: {}, delve: {}, waste: 0, peak: 0, into: {} }
  if (!s.wellOpen) return out
  const layer = LAYERS[s.layer]
  const delveAt: Record<string, string> = {}
  for (const d of layer.delves) if (!s.delveDone[d.id]) delveAt[d.at] = d.id

  const queue: Beam[] = []
  for (const k in s.board) {
    const p = s.board[k]
    if (p.kind === 'well' && s.lit[k]) {
      const [q, r] = parse(k)
      queue.push({ q, r, dir: p.dir ?? 0, pw: wellPower(s, p), col: p.color ?? 'mana', seen: new Set() })
    }
  }
  let guard = 0
  while (queue.length && guard++ < 400) {
    let b = queue.pop()!
    walk: for (;;) {
      const nq = b.q + DIRS[b.dir][0], nr = b.r + DIRS[b.dir][1], nk = key(nq, nr)
      const seg: Seg = { a: [b.q, b.r], b: [nq, nr], pw: b.pw, col: b.col }
      out.segs.push(seg)
      if (b.col === 'mana' && b.pw > out.peak) out.peak = b.pw
      if (!s.lit[nk]) {
        seg.exit = true
        if (delveAt[nk]) { seg.delve = true; out.delve[delveAt[nk]] = (out.delve[delveAt[nk]] || 0) + b.pw }
        else out.waste += b.pw
        break
      }
      // A beam that re-enters a hex in the same direction is in a loop: it ends there.
      const sk = nk + '|' + b.dir
      if (b.seen.has(sk)) { seg.exit = true; out.waste += b.pw; break }
      b.seen.add(sk)
      add(out.into, nk, b.col, b.pw)
      b = { ...b, q: nq, r: nr }
      const p = s.board[nk]
      if (!p) continue
      switch (p.kind) {
        case 'stack': b.pw = lensApply(s, p, b.pw); continue
        case 'relic': b.pw *= RELIC_MULT; continue
        case 'keystone': b.pw *= s.keystones[p.ks ?? 0]?.grade ?? 1; continue
        case 'glass': if (b.col === 'mana') { b.pw /= GLASS_RATIO; b.col = 'amber' } continue
        case 'mirror': b.dir = turnDir(b.dir, p.turn ?? 2); continue
        case 'prism':
          queue.push({ ...b, dir: turnDir(b.dir, p.turn ?? 1), pw: b.pw / 2, seen: new Set(b.seen) })
          b.pw /= 2
          continue
        case 'yprism': {
          const t = Math.abs(p.turn ?? 2)
          queue.push({ ...b, dir: turnDir(b.dir, t), pw: b.pw / 2, seen: new Set(b.seen) })
          queue.push({ ...b, dir: turnDir(b.dir, -t), pw: b.pw / 2, seen: new Set(b.seen) })
          break walk
        }
        default: { // terminals: foundry, basin, lectern, twin, well
          const accepts =
            (p.kind === 'foundry' && b.col === 'mana') || (p.kind === 'basin' && b.col === 'mana') ||
            (p.kind === 'lectern' && b.col === 'amber') || (p.kind === 'twin' && b.col !== 'amber')
          if (accepts) add(out.term, nk, b.col, b.pw)
          else out.waste += b.pw
          break walk
        }
      }
    }
  }
  return out
}
