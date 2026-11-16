export type GemId = 'shard' | 'lozenge' | 'brilliant' | 'twin'
export type Color = 'mana' | 'amber' | 'violet'
export type TrayKind = 'foundry' | 'basin' | 'prism' | 'yprism' | 'mirror' | 'glass' | 'lectern' | 'relic' | 'keystone'
export type PieceKind = TrayKind | 'well' | 'stack' | 'twin'
export type ResearchId = 'keen' | 'bezel' | 'deep' | 'lantern' | 'bright' | 'ycut'
export type UnlockId = 'auto' | 'prism' | 'mirror'

export interface Piece {
  kind: PieceKind
  fixed?: boolean
  /** prism / mirror / yprism: how far the turned beam bends, in 60° steps */
  turn?: number
  /** stack */
  gem?: GemId
  n?: number
  /** foundry */
  recipe?: GemId
  setGem?: GemId
  setN?: number
  /** well */
  dir?: number
  color?: Color
  base?: number
  /** keystone: index into state.keystones */
  ks?: number
}

export interface Keystone {
  grade: number
  /** beam layout of the lattice it was made from: [q1, r1, q2, r2] per segment */
  segs: number[][]
}

export interface State {
  v: number
  layer: number
  wellOpen: boolean
  lit: Record<string, boolean>
  board: Record<string, Piece>
  tray: Record<TrayKind, number>
  stock: Record<GemId, number>
  /** gems cut on this layer (drives recipe unlocks) */
  cut: Record<GemId, number>
  mana: number
  /** mana banked on this layer, spent or not (drives Keystone grade) */
  banked: number
  insight: number
  /** share of newly cut gems that flows into stacks set on the board */
  autoShare: Record<GemId, number>
  hexBought: number
  research: Record<ResearchId, number>
  unlocked: Record<UnlockId, boolean>
  bought: { foundry: number; prism: number; mirror: number }
  delve: Record<string, number>
  delveDone: Record<string, boolean>
  keystones: Keystone[]
  endSeen: boolean
  time: number
  layerTime: number
  lastTs: number
  sound: boolean
}

export interface Seg {
  a: [number, number]
  b: [number, number]
  pw: number
  col: Color
  /** beam leaves lit hexes on this segment */
  exit?: boolean
  delve?: boolean
}

export interface Trace {
  segs: Seg[]
  term: Record<string, Partial<Record<Color, number>>>
  delve: Record<string, number>
  waste: number
  peak: number
  /** light arriving at each hex, by colour (for hover readouts) */
  into: Record<string, Partial<Record<Color, number>>>
}

export interface Rates {
  tr: Trace
  /** output per second of each terminal piece, by hex key */
  out: Record<string, number>
  starved: Record<string, boolean>
  gross: Record<GemId, number>
  use: Record<GemId, number>
  toStack: Record<GemId, number>
  net: Record<GemId, number>
  mana: number
  insight: number
  delve: Record<string, number>
}
