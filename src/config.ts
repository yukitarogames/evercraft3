// All tuning numbers live here. Nothing in sim/ or ui/ should hard-code a balance value.
import type { GemId, ResearchId, TrayKind, Color } from './types'

export interface GemConfig {
  name: string
  tier: number
  /** light needed per gem */
  light: number
  input?: [GemId, number]
  /** cut this many of another gem on the current layer to unlock the recipe */
  unlock?: [GemId, number]
  /** as a foundry setting: output x(1 + setK * n^SET_EXP) */
  setK: number
  lens: string
}

export const GEM_ORDER: GemId[] = ['shard', 'lozenge', 'brilliant', 'twin']

export const GEMS: Record<GemId, GemConfig> = {
  shard: { name: 'Shard', tier: 1, light: 2, setK: 0.3, lens: 'adds to the beam' },
  lozenge: { name: 'Lozenge', tier: 2, light: 20, input: ['shard', 10], unlock: ['shard', 100], setK: 0.6, lens: 'multiplies the beam' },
  brilliant: { name: 'Brilliant', tier: 3, light: 2000, input: ['lozenge', 20], unlock: ['lozenge', 500], setK: 1.2, lens: 'boosts foundries next to it' },
  twin: { name: 'Twinned gem', tier: 4, light: 100, setK: 2, lens: 'multiplies the beam' },
}

// Lens formulas (gems set in the path of a beam).
// Growth budget: the only power laws are the Shard lens and foundry settings, and SHARD_EXP + SET_EXP
// must stay below 1 or production blows up in finite time. Every multiplier is logarithmic in gem count,
// so stacking more sockets of the same cut is always worth it but can never run away. Board space is the cap.
export const SHARD_ADD = 0.5 // beam += SHARD_ADD * n^SHARD_EXP * (1 + KEEN_BONUS * keen)
export const SHARD_EXP = 0.5
export const KEEN_BONUS = 0.5
export const LOZENGE_MULT = 1 // beam *= 1 + LOZENGE_MULT * log10(1 + n)
export const TWIN_MULT = 2 // beam *= 1 + TWIN_MULT * log10(1 + n)
export const BRILLIANT_RESONANCE = 0.5 // adjacent foundries x(1 + BRILLIANT_RESONANCE * log10(1 + n))
export const SET_EXP = 0.25 // foundry setting: output x(1 + setK * n^SET_EXP)

export const VEIN_MULT = 2
export const RELIC_MULT = 3
export const GLASS_RATIO = 10 // blue light per amber light
export const DEEP_MULT = 1.5
export const LANTERN_MULT = 2
export const BRIGHT_MULT = 2
export const AUTO_UNLOCK_SHARDS = 10
export const PRISM_UNLOCK_SHARDS = 25
export const MIRROR_UNLOCK_LOZENGES = 20
export const DEFAULT_AUTO_SHARE = 0.5
export const SHARE_STEPS = [0, 0.25, 0.5, 0.75, 1]
/** a foundry is throttled to its ingredient inflow when stock covers less than this many seconds of demand */
export const STARVE_WINDOW = 0.5

export const keystoneGrade = (banked: number): number => Math.max(2, Math.round(2 * Math.log10(Math.max(banked, 10)) * 10) / 10)

export interface PieceCost { currency: 'mana' | GemId; base: number; growth: number }
export const PIECE_COST: Record<'foundry' | 'prism' | 'mirror', PieceCost> = {
  foundry: { currency: 'mana', base: 100, growth: 12 },
  prism: { currency: 'mana', base: 60, growth: 4 },
  mirror: { currency: 'mana', base: 500, growth: 5 },
}

export interface ResearchConfig { id: ResearchId; name: string; desc: string; max: number; base: number; growth: number }
export const RESEARCH: ResearchConfig[] = [
  { id: 'keen', name: 'Keen Edge', desc: 'Shard lenses add +50% per level', max: 5, base: 60, growth: 5 },
  { id: 'bezel', name: 'Bezel', desc: 'Foundries gain a setting: gems set inside raise output', max: 1, base: 300, growth: 1 },
  { id: 'deep', name: 'Deep Basin', desc: 'Basins bank x1.5 mana per level', max: 5, base: 150, growth: 4 },
  { id: 'lantern', name: 'Lantern', desc: 'Delves gain x2 light per level', max: 3, base: 400, growth: 5 },
  { id: 'bright', name: 'Bright Well', desc: 'Wells emit x2 light per level', max: 4, base: 1500, growth: 8 },
  { id: 'ycut', name: 'Y-cut', desc: 'Gain a Y-prism: one beam in, two turned beams out', max: 1, base: 6000, growth: 1 },
]

export interface WellConfig { at: string; dir: number; color: Color; base: number }
export interface DelveConfig { id: string; at: string; need: number; reward: TrayKind; name: string }
export interface LayerConfig {
  name: string
  R: number
  wells: WellConfig[]
  startLit: string[]
  veins: string[]
  /** hexes lit for free when the Prism unlocks, so there is room to use it */
  prismLit: string[]
  /** lighting these hexes grants pieces */
  caches: Record<string, Partial<Record<TrayKind, number>>>
  twinAt?: string
  delves: DelveConfig[]
  hexBase: number
  hexGrowth: number
  /** layer 1: mana cost to Crystallize. layer 2: mana banked that ends the playtest build */
  goal: number
}

export const LAYERS: Record<number, LayerConfig> = {
  1: {
    name: 'Layer 1',
    R: 2,
    wells: [{ at: '-2,0', dir: 0, color: 'mana', base: 1 }],
    startLit: ['-2,0', '-1,0', '0,0'],
    veins: ['0,-1'],
    prismLit: ['1,0', '1,-1'],
    caches: { '0,1': { glass: 1, lectern: 1 } },
    delves: [{ id: 'burning', at: '3,0', need: 150000, reward: 'relic', name: 'Burning Glass' }],
    hexBase: 40,
    hexGrowth: 1.6,
    goal: 1e6,
  },
  2: {
    name: 'Layer 2',
    R: 3,
    wells: [
      { at: '-3,0', dir: 0, color: 'mana', base: 1 },
      { at: '1,-3', dir: 5, color: 'violet', base: 5 },
    ],
    startLit: ['-3,0', '-2,0', '-1,0', '0,0', '-1,1', '0,1', '1,-3', '1,-2'],
    veins: ['-1,1', '2,-1', '0,2'],
    prismLit: [],
    caches: {},
    twinAt: '1,0',
    delves: [],
    hexBase: 400,
    hexGrowth: 1.42,
    goal: 1e8,
  },
}

export const PIECE_NAME: Record<string, string> = {
  well: 'Well', foundry: 'Foundry', basin: 'Basin', stack: 'Gems', prism: 'Prism', yprism: 'Y-prism', mirror: 'Mirror',
  glass: 'Tinting Glass', lectern: 'Lectern', relic: 'Burning Glass', keystone: 'Keystone', twin: 'Twin Foundry',
}
