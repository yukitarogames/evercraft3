// Headless pacing check: a scripted player follows a sensible build order on layer 1
// and prints when each milestone lands. Run with `npm run bot`.
import { defaultState } from '../src/state'
import { advance } from '../src/sim/step'
import { computeRates } from '../src/sim/rates'
import * as A from '../src/sim/actions'
import { RESEARCH, LAYERS } from '../src/config'
import type { State, TrayKind, GemId } from '../src/types'

const s: State = defaultState()
const log = (msg: string) => {
  const t = Math.round(s.time)
  console.log(`${String(Math.floor(t / 60)).padStart(2)}:${String(t % 60).padStart(2, '0')}  ${msg}`)
}

const clear = (k: string) => { if (s.board[k] && !s.board[k].fixed) A.removePiece(s, k) }
const put = (kind: TrayKind, k: string, turn?: number, recipe?: GemId) => {
  clear(k)
  if (!A.placePiece(s, kind, k)) throw new Error(`cannot place ${kind} at ${k} (tray ${s.tray[kind]}, lit ${s.lit[k]})`)
  if (turn !== undefined) s.board[k].turn = turn
  if (recipe) s.board[k].recipe = recipe
}
const gem = (g: GemId, k: string) => { if (!s.board[k]) A.placeGem(s, g, k) }
/** lift every tool off the board (stacks stay) so a layout can be rebuilt */
const liftTools = () => { for (const k of Object.keys(s.board)) if (s.board[k].kind !== 'stack') clear(k) }
const light = (k: string) => s.lit[k] || A.lightHex(s, k)
const lightAll = (ks: string[]) => { for (const k of ks) if (!light(k)) return false; return true }

interface Step { name: string; when: () => boolean; run: () => void }
const steps: Step[] = [
  { name: 'open the Well', when: () => s.time >= 3, run: () => A.openWell(s) },
  { name: 'set first Shards', when: () => s.stock.shard >= 3, run: () => gem('shard', '-1,0') },
  { name: 'prism + basin', when: () => s.unlocked.prism, run: () => {
    liftTools(); put('prism', '0,0', 1); put('foundry', '1,0'); put('basin', '1,-1')
  } },
  { name: 'light the vein, foundry on it', when: () => light('0,-1'), run: () => {
    liftTools(); put('prism', '0,0', 2); put('basin', '1,0'); put('foundry', '0,-1')
  } },
  { name: 'lozenge foundry online', when: () => A.recipeUnlocked(s, 'lozenge') && lightAll(['2,0', '1,-2']) &&
      (s.tray.prism + 1 >= 2 || A.buyPiece(s, 'prism')) && (s.tray.foundry >= 1 || A.buyPiece(s, 'foundry')), run: () => {
    liftTools()
    put('prism', '1,0', 2); put('basin', '2,0'); put('prism', '1,-1', 1); put('foundry', '1,-2', undefined, 'lozenge'); put('foundry', '0,-1')
  } },
  { name: 'set first Lozenges', when: () => s.stock.lozenge >= 5, run: () => gem('lozenge', '0,0') },
  { name: 'mirror into the lower half', when: () => s.unlocked.mirror && light('1,1'), run: () => {
    clear('2,0'); put('mirror', '2,0', -2); put('basin', '1,1')
  } },
  { name: 'amber: glass + lectern', when: () => lightAll(['0,1', '-1,1', '0,2']) && (s.tray.prism >= 1 || A.buyPiece(s, 'prism')), run: () => {
    clear('1,1'); put('prism', '1,1', -1); put('basin', '0,2'); put('glass', '0,1'); put('lectern', '-1,1')
  } },
  { name: 'delve: half the trunk leaves the board', when: () => s.research.bezel >= 1 && (s.tray.prism >= 1 || A.buyPiece(s, 'prism')), run: () => {
    clear('2,0'); put('prism', '2,0', -2)
  } },
  { name: 'relic + Y-prism: final layout', when: () => s.tray.relic >= 1 && s.tray.yprism >= 1 && lightAll(['2,-1', '2,-2']), run: () => {
    liftTools()
    put('relic', '1,0'); put('yprism', '2,0', 2)
    put('prism', '2,-1', 1); put('basin', '2,-2'); put('prism', '1,-1', -1); put('foundry', '0,-1'); put('foundry', '1,-2', undefined, 'lozenge')
    put('prism', '1,1', -1); put('glass', '0,1'); put('lectern', '-1,1')
  } },
  { name: 'brilliant foundry', when: () => s.board['2,0']?.kind === 'yprism' && A.recipeUnlocked(s, 'brilliant') && (s.tray.foundry >= 1 || A.buyPiece(s, 'foundry')), run: () => {
    put('foundry', '0,2', undefined, 'brilliant')
  } },
  { name: 'set Brilliants beside two foundries', when: () => s.stock.brilliant >= 1 && light('0,-2'), run: () => gem('brilliant', '0,-2') },
  { name: 'CRYSTALLIZE', when: () => A.canCrystallize(s), run: () => {
    const r = computeRates(s)
    log(`  before: trunk ${r.tr.peak.toFixed(0)}/s, mana ${r.mana.toFixed(0)}/s, banked ${s.banked.toExponential(2)}, grade x${A.previewGrade(s)}`)
    A.crystallize(s)
  } },
]

let i = 0
let lastSet = 0
const seen: Record<string, boolean> = {}
const mark = (id: string, cond: boolean, msg: string) => { if (cond && !seen[id]) { seen[id] = true; log(msg) } }
const LIMIT = 90 * 60
while (s.time < LIMIT && i < steps.length) {
  advance(s, 1)
  while (i < steps.length && steps[i].when()) { steps[i].run(); log(steps[i].name); i++ }
  // research: cheapest first, but save for the Y-cut once the rest gets pricey
  if (s.layer === 1) {
    const opts = RESEARCH.filter(c => s.research[c.id] < c.max).map(c => ({ c, cost: A.researchCost(s, c.id) })).sort((a, b) => a.cost - b.cost)
    for (const o of opts) {
      if (!s.research.ycut && o.c.id !== 'ycut' && o.cost > 2500) continue
      if (A.buyResearch(s, o.c.id)) log(`  research ${o.c.name} ${s.research[o.c.id]}`)
    }
    if (s.research.bezel && s.time - lastSet > 45) {
      lastSet = s.time
      for (const k in s.board) {
        const p = s.board[k]
        if (p.kind === 'foundry' && p.recipe !== 'brilliant') A.setInFoundry(s, k, p.recipe === 'lozenge' ? 'lozenge' : 'shard', 0.2)
      }
    }
  }
  mark('auto', s.unlocked.auto, 'auto-set unlocked')
  mark('loz', A.recipeUnlocked(s, 'lozenge'), 'Lozenge recipe unlocked')
  mark('mir', s.unlocked.mirror, 'Mirror unlocked')
  mark('bri', A.recipeUnlocked(s, 'brilliant'), 'Brilliant recipe unlocked')
  mark('rel', !!s.delveDone.burning, 'relic delved')
  if (Math.round(s.time) % 180 === 0 && s.layer === 1) {
    const r = computeRates(s)
    log(`  · trunk ${r.tr.peak.toFixed(1)}/s  mana ${s.mana.toFixed(0)} (+${r.mana.toFixed(1)}/s)  insight ${s.insight.toFixed(0)} (+${r.insight.toFixed(1)}/s)  shards ${s.stock.shard.toFixed(0)} loz ${s.stock.lozenge.toFixed(0)} bri ${s.stock.brilliant.toFixed(0)} hexes ${s.hexBought}`)
  }
}
if (i < steps.length) console.log(`STUCK before: ${steps[i].name} (goal ${LAYERS[1].goal})`)
else console.log(`layer 1 done at ${(s.time / 60).toFixed(1)} min; keystone x${s.keystones[0]?.grade}`)
