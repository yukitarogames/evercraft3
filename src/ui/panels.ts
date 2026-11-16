// DOM panels: HUD, status strip, goals, selection, tray, inventory, Cut Book, dialogs.
// Each section is rebuilt only when its HTML changes, and never while a button is being pressed,
// so a re-render can not swallow a click.
import {
  GEMS, GEM_ORDER, LAYERS, RESEARCH, PIECE_NAME, SHARE_STEPS, VEIN_MULT, RELIC_MULT, GLASS_RATIO,
  AUTO_UNLOCK_SHARDS, PRISM_UNLOCK_SHARDS, MIRROR_UNLOCK_LOZENGES, LOZENGE_MULT, TWIN_MULT, BRILLIANT_RESONANCE, SHARD_ADD, SET_EXP,
} from '../config'
import { ring } from '../hex'
import { G, act, hold, remove, rotate, setState, toast, undo } from '../game'
import * as A from '../sim/actions'
import { resonanceMult, settingMult } from '../sim/rates'
import { lensMult, lensShardAdd, wellPower } from '../sim/trace'
import { clearLocal, decodeSave, defaultState, encodeSave } from '../state'
import type { GemId, Piece, ResearchId, TrayKind } from '../types'
import { GEM_COLOR, GEM_TIER, drawGem, drawKeystone, drawPiece } from './draw'
import { fmt, fmtInt, fmtTime, pct, signed } from './format'
import { unlockAudio } from './audio'

declare const __APP_VERSION__: string

const $ = (id: string): HTMLElement => document.getElementById(id)!
const last: Record<string, string> = {}
let pressing = false

function put(id: string, html: string, live = false): void {
  // `live` sections hold no buttons, so they may update mid-press (the preview strip must follow a drag)
  if (last[id] === html || (pressing && !live)) return
  const el = $(id)
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.fid
  el.innerHTML = html
  last[id] = html
  if (focused) (el.querySelector(`[data-fid="${focused}"]`) as HTMLElement | null)?.focus()
}

const btn = (label: string, actName: string, arg = '', opts: { dis?: boolean; cls?: string; title?: string } = {}): string =>
  `<button type="button" data-act="${actName}" data-arg="${arg}" data-fid="${actName}:${arg}"${opts.dis ? ' disabled' : ''}${opts.cls ? ` class="${opts.cls}"` : ''}${opts.title ? ` title="${opts.title}"` : ''}>${label}</button>`

const plural = (g: GemId): string => (g === 'twin' ? 'Twinned gems' : GEMS[g].name + 's')

// ---------- icons ----------
const iconCache: Record<string, string> = {}
function icon(id: string): string {
  if (iconCache[id]) return iconCache[id]
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const c = cv.getContext('2d')!
  if (id in GEMS) drawGem(c, 32, 32, 22, GEM_TIER[id as GemId], GEM_COLOR[id as GemId])
  else drawPiece(c, { kind: id as TrayKind, turn: 1, recipe: 'shard' }, 32, 32, 58)
  return (iconCache[id] = cv.toDataURL())
}

// ---------- HUD and status strip ----------
function hud(): string {
  const s = G.s, r = G.r, L = LAYERS[s.layer]
  const total = ring(L.R).length, lit = Object.keys(s.lit).length
  const parts = [
    `<div><span>Mana</span><b class="mana">${fmt(s.mana)}</b><i>${signed(r.mana)}/s</i></div>`,
    `<div><span>Trunk beam</span><b>${fmt(r.tr.peak)}/s</b></div>`,
  ]
  if (s.insight > 0 || r.insight > 0) parts.push(`<div><span>Insight</span><b class="amber">${fmt(s.insight)}</b><i>${signed(r.insight)}/s</i></div>`)
  parts.push(`<div><span>${L.name}</span><b>${lit}/${total}</b><span>hexes lit</span></div>`)
  if (r.tr.waste > 0.005) parts.push(`<div class="warn"><span>Wasted light</span><b>${fmt(r.tr.waste)}/s</b></div>`)
  return parts.join('')
}

function previewText(): string {
  const a = G.r, b = G.preview!.r
  const items: [string, number, number][] = [['Mana', a.mana, b.mana], ['Insight', a.insight, b.insight]]
  for (const g of GEM_ORDER) items.push([plural(g), a.gross[g], b.gross[g]])
  for (const d of LAYERS[G.s.layer].delves) items.push([`Delve`, a.delve[d.id] || 0, b.delve[d.id] || 0])
  items.push(['Wasted', a.tr.waste, b.tr.waste])
  const changed = items.filter(([, x, y]) => Math.abs(y - x) > 1e-6 + 0.002 * Math.max(x, y))
  if (!changed.length) return '<span class="dim">Preview: no rate changes</span>'
  return 'Preview: ' + changed.map(([n, x, y]) => {
    const good = n === 'Wasted' ? y < x : y > x
    return `<span class="${good ? 'up' : 'down'}">${n} ${fmt(x)} → ${fmt(y)}/s</span>`
  }).join(' ')
}

const turnText = (t: number): string => `${Math.abs(t) * 60}° ${t > 0 ? 'left' : 'right'}`

function hint(): string {
  const s = G.s, r = G.r
  const on = (kind: string, pred?: (p: Piece) => boolean) => Object.values(s.board).some(p => p.kind === kind && (!pred || pred(p)))
  if (!s.wellOpen) return 'Click the Well to open it.'
  if (G.held) return 'Move over the board to preview. Release or click on a lit, empty hex to place. Esc cancels.'
  if (s.tray.keystone > 0) return 'Set your Keystone in the beam, after the Shards. Then place a Foundry and the rest of your tools from the tray.'
  if (s.layer > 1 && !on('foundry')) return 'New board. Place a Foundry from the tray where the beam ends.'
  if (!on('stack')) return s.stock.shard >= 3 ? 'Drag Shards from the tray onto the empty socket in the beam. Watch the preview before you let go.' : 'The Foundry is cutting Shards. Wait for three.'
  if (s.tray.prism > 0 && !on('prism')) return 'Place the Prism in the beam, then the Foundry and the Basin where the two beams land. Click a selected Prism to rotate it.'
  if (s.tray.basin > 0) return 'Place the Basin where a beam ends to bank mana.'
  if (s.tray.glass > 0 || s.tray.lectern > 0) return 'Send a beam through the Tinting Glass and into the Lectern to earn Insight.'
  if (s.tray.relic > 0) return 'Place the Burning Glass on your strongest beam.'
  if (s.tray.yprism > 0) return 'The Y-prism splits a beam into two turned beams. Good where the trunk meets the edge.'
  if (r.tr.waste > 0.005) return 'Some light leaves the board unused. Aim it at a Foundry, a Basin or a delve site.'
  if (s.unlocked.prism && s.hexBought === 0 && s.mana >= A.hexPrice(s)) return 'Click a dim hex next to the board, then click it again to light it. The dotted hex is a Vein.'
  if (A.recipeUnlocked(s, 'lozenge') && !on('foundry', p => p.recipe === 'lozenge') && s.cut.lozenge === 0) return 'Lozenges unlocked. Buy a second Foundry, select it and switch its recipe to Lozenge.'
  if (s.stock.lozenge >= 1 && !on('stack', p => p.gem === 'lozenge')) return 'Set Lozenges in the beam after the Shards: add first, then multiply.'
  if (Object.values(r.starved).some(Boolean)) return 'A Foundry is starved. Lower the auto-set share of its ingredient, or give the ingredient more light.'
  if (s.stock.brilliant >= 1 && !on('stack', p => p.gem === 'brilliant')) return 'Set Brilliants on a hex that touches your Foundries. They do not need the beam.'
  if (s.research.bezel > 0 && !on('foundry', p => !!p.setGem)) return 'Bezel researched. Drag gems from the tray onto a Foundry to set them inside it.'
  return ''
}

function hoverText(k: string): string {
  const s = G.s, p = s.board[k], L = LAYERS[s.layer]
  const into = G.r.tr.into[k]
  const beam = into ? ' · beam in ' + Object.entries(into).map(([c, v]) => `${fmt(v!)}/s ${c === 'mana' ? 'blue' : c}`).join(' + ') : ''
  const vein = L.veins.includes(k) ? ` · Vein: a Foundry here cuts x${VEIN_MULT}` : ''
  if (!s.lit[k]) {
    const d = L.delves.find(x => x.at === k && !s.delveDone[x.id])
    if (d) {
      const rate = G.r.delve[d.id] || 0
      return `Delve site · ${d.name} · ${fmt(s.delve[d.id] || 0)}/${fmt(d.need)} light` + (rate > 0 ? ` · ETA ${fmtTime((d.need - (s.delve[d.id] || 0)) / rate)}` : ' · aim a beam off the board at it')
    }
    if (!A.onBoard(s, k)) return ''
    const cache = L.caches[k] ? ' · holds ' + Object.keys(L.caches[k]).map(x => PIECE_NAME[x]).join(' and ') : ''
    const fixed = p ? ` · ${PIECE_NAME[p.kind]}` : ''
    return (A.canLight(s, k) ? `Dark hex · light it for ${fmt(A.hexPrice(s))} mana` : 'Dark hex · light a neighbour first') + fixed + cache + vein
  }
  if (!p) return 'Empty socket' + beam + vein
  return pieceTitle(p) + beam + vein
}

const pieceTitle = (p: Piece): string =>
  p.kind === 'stack' ? `${plural(p.gem!)} x${fmtInt(p.n ?? 0)}` : p.kind === 'foundry' ? `Foundry · ${GEMS[p.recipe ?? 'shard'].name}` : PIECE_NAME[p.kind]

function strip(): string {
  if (G.preview) return previewText()
  if (G.hover && !G.held) { const t = hoverText(G.hover); if (t) return `<span class="dim">${t}</span>` }
  const h = hint()
  return h ? `<span class="hint">${h}</span>` : '<span class="dim">Hover a hex for details. Drag pieces to move them.</span>'
}

// ---------- goals ----------
interface Goal { label: string; have: number; need: number; unit: string; rate?: number; note?: string }
function goalList(): Goal[] {
  const s = G.s, r = G.r, L = LAYERS[s.layer], out: Goal[] = []
  if (!s.unlocked.auto) out.push({ label: 'Auto-set', have: s.cut.shard, need: AUTO_UNLOCK_SHARDS, unit: 'Shards cut', rate: r.gross.shard })
  if (!s.unlocked.prism) out.push({ label: 'Prism and Basin', have: s.cut.shard, need: PRISM_UNLOCK_SHARDS, unit: 'Shards cut', rate: r.gross.shard })
  for (const g of ['lozenge', 'brilliant'] as GemId[]) {
    const u = GEMS[g].unlock!
    if (!A.recipeUnlocked(s, g)) { out.push({ label: `${GEMS[g].name} recipe`, have: s.cut[u[0]], need: u[1], unit: `${plural(u[0])} cut`, rate: r.gross[u[0]] }); break }
  }
  if (!s.unlocked.mirror) out.push({ label: 'Mirror', have: s.cut.lozenge, need: MIRROR_UNLOCK_LOZENGES, unit: 'Lozenges cut', rate: r.gross.lozenge })
  for (const k in L.caches) if (!s.lit[k]) out.push({ label: Object.keys(L.caches[k]).map(x => PIECE_NAME[x]).join(' and '), have: 0, need: 0, unit: '', note: 'light the marked hex' })
  for (const d of L.delves) if (!s.delveDone[d.id]) out.push({ label: `Delve: ${d.name}`, have: s.delve[d.id] || 0, need: d.need, unit: 'light', rate: r.delve[d.id] || 0 })
  return out
}

function goalRow(g: Goal, extra = ''): string {
  if (g.note) return `<li><div class="grow"><span>${g.label}</span><span class="req">${g.note}</span></div></li>`
  const f = Math.max(0, Math.min(1, g.have / g.need))
  const eta = g.have >= g.need ? 'ready' : g.rate && g.rate > 0 ? `ETA ${fmtTime((g.need - g.have) / g.rate)}` : ''
  return `<li><div class="grow"><span>${g.label}</span><span class="req">${fmt(Math.min(g.have, g.need))}/${fmt(g.need)} ${g.unit}${eta ? ` · ${eta}` : ''}</span></div><div class="bar"><div style="width:${(f * 100).toFixed(1)}%"></div></div>${extra}</li>`
}

function goals(): string {
  const s = G.s, r = G.r, L = LAYERS[s.layer]
  const rows = goalList().slice(0, 4).map(g => goalRow(g))
  if (A.hasNextLayer(s)) {
    const ready = A.canCrystallize(s)
    rows.push(goalRow({ label: 'Crystallize', have: s.mana, need: L.goal, unit: 'mana', rate: r.mana },
      `<div class="row">${btn(`Crystallize into a Keystone (grade x${A.previewGrade(s)})`, 'crystallize', '', { dis: !ready, cls: ready ? 'primary' : '' })}</div>`))
  } else {
    rows.push(goalRow({ label: 'End of this build', have: s.banked, need: L.goal, unit: 'mana banked', rate: r.mana }))
  }
  return `<h2>Next</h2><ul class="goals">${rows.join('')}</ul>`
}

// ---------- selection ----------
function selection(): string {
  const s = G.s, r = G.r, L = LAYERS[s.layer]
  if (G.held) {
    const name = G.held.src === 'tray' ? PIECE_NAME[G.held.kind] : G.held.src === 'gem' ? plural(G.held.gem) : 'piece'
    return `<h2>Holding: ${name}</h2><p class="dim">Release or click on a lit, empty hex. Gems can also go onto a matching stack${s.research.bezel ? ' or into a Foundry' : ''}.</p><div class="row">${btn('Cancel (Esc)', 'cancel-hold')}</div>`
  }
  const k = G.sel
  if (!k) return '<h2>Selected</h2><p class="dim">Nothing selected. Click a piece or a hex.</p>'
  const p = s.board[k]
  const vein = L.veins.includes(k) ? `<p>Vein: a Foundry here cuts x${VEIN_MULT}.</p>` : ''
  if (!s.lit[k]) {
    if (!A.canLight(s, k)) return `<h2>Dark hex</h2><p class="dim">Light a hex next to it first.</p>${vein}`
    const price = A.hexPrice(s)
    const cache = L.caches[k] ? `<p>Holds: ${Object.keys(L.caches[k]).map(x => PIECE_NAME[x]).join(' and ')}.</p>` : ''
    return `<h2>Dark hex</h2>${cache}${vein}<p class="dim">Each hex you light raises the price of the next.</p><div class="row">${btn(`Light for ${fmt(price)} mana`, 'light', k, { dis: s.mana < price, cls: 'primary' })}</div>`
  }
  if (!p) return `<h2>Empty socket</h2>${vein}<p class="dim">Pick a piece or gems from the tray and place them here.</p>`
  const back = p.fixed ? '' : btn(p.kind === 'stack' ? 'Take all back (Del)' : 'Back to tray (Del)', 'remove', k)
  const into = r.tr.into[k]
  const lightIn = into ? `<p>Light in: ${Object.entries(into).map(([c, v]) => `${fmt(v!)}/s ${c === 'mana' ? 'blue' : c}`).join(' + ')}</p>` : '<p class="dim">No beam reaches this hex.</p>'
  let body = ''
  switch (p.kind) {
    case 'well':
      body = `<p>Emits ${fmt(wellPower(s, p))} ${p.color === 'violet' ? 'violet' : 'blue'} light per second. It can not be moved.</p>` + (s.wellOpen ? '' : `<div class="row">${btn('Open the Well', 'open-well', '', { cls: 'primary' })}</div>`)
      break
    case 'stack': {
      const n = p.n ?? 0, g = p.gem!
      const effect = g === 'shard' ? `Adds <b>+${fmt(lensShardAdd(s, n))}</b> to any beam through this hex.<br><span class="dim">${SHARD_ADD} × √n${s.research.keen ? ` × ${1 + 0.5 * s.research.keen} (Keen Edge)` : ''}</span>`
        : g === 'brilliant' ? `Foundries touching this hex cut <b>x${(1 + BRILLIANT_RESONANCE * Math.log10(1 + n)).toFixed(2)}</b>. It does not need a beam.<br><span class="dim">1 + ${BRILLIANT_RESONANCE} × log10(1 + n)</span>`
        : `Multiplies any beam through this hex by <b>x${lensMult(g as 'lozenge' | 'twin', n).toFixed(2)}</b>.<br><span class="dim">1 + ${g === 'lozenge' ? LOZENGE_MULT : TWIN_MULT} × log10(1 + n)</span>`
      const stock = Math.floor(s.stock[g])
      body = `<p>${effect}</p>${g === 'brilliant' ? '' : lightIn}<p class="dim">In stock: ${fmtInt(s.stock[g])}</p>
        <div class="row">${btn('+10% of stock', 'stack-add', '0.1', { dis: stock < 10 })}${btn('+50%', 'stack-add', '0.5', { dis: stock < 2 })}${btn('+All', 'stack-add', '1', { dis: stock < 1 })}${btn('Take half', 'stack-take', '0.5', { dis: n < 2 })}</div>`
      break
    }
    case 'foundry': {
      const g = p.recipe ?? 'shard', cfg = GEMS[g]
      const recipes = (['shard', 'lozenge', 'brilliant'] as GemId[]).map(x => {
        const ok = A.recipeUnlocked(s, x), u = GEMS[x].unlock
        return btn(GEMS[x].name, 'recipe', x, { dis: !ok, cls: x === g ? 'on' : '', title: ok || !u ? '' : `Requires ${u[1]} ${plural(u[0])} cut on this layer` })
      }).join('')
      const mults: string[] = []
      if (L.veins.includes(k)) mults.push(`Vein x${VEIN_MULT}`)
      if (p.setGem) mults.push(`Setting x${settingMult(p).toFixed(2)}`)
      const res = resonanceMult(s, k)
      if (res > 1) mults.push(`Brilliants x${res.toFixed(2)}`)
      let setting = '<p class="dim">Setting: research Bezel in the Cut Book.</p>'
      if (s.research.bezel) {
        const cur = p.setGem ? `${fmtInt(p.setN ?? 0)} ${plural(p.setGem)} → x${settingMult(p).toFixed(2)} output` : 'empty'
        const opts = GEM_ORDER.filter(x => Math.floor(s.stock[x]) >= 2 && (!p.setGem || p.setGem === x)).map(x => btn(`Set 50% of ${plural(x)}`, 'set-gem', x)).join('')
        setting = `<p>Setting: ${cur}<br><span class="dim">1 + k × n^${SET_EXP}, k = ${GEM_ORDER.map(x => `${GEMS[x].setK} ${GEMS[x].name}`).join(', ')}</span></p><div class="row">${opts}${p.setGem ? btn('Take setting back', 'set-clear') : ''}</div>`
      }
      body = `<div class="row">${recipes}</div>
        <p>Recipe: ${cfg.light} light${cfg.input ? ` + ${cfg.input[1]} ${plural(cfg.input[0])}` : ''} per ${cfg.name}</p>
        ${lightIn}<p>Cuts: <b class="${r.starved[k] ? 'down' : 'up'}">${fmt(r.out[k] || 0)} ${plural(g)}/s</b>${r.starved[k] ? ' · starved of ' + plural(cfg.input![0]) : ''}${mults.length ? ' · ' + mults.join(' · ') : ''}</p>${setting}`
      break
    }
    case 'prism': body = `<p>Half the beam goes straight on, half turns <b>${turnText(p.turn ?? 1)}</b>.</p>${lightIn}<div class="row">${btn('Rotate (R)', 'rotate', k)}</div>`; break
    case 'yprism': body = `<p>Splits the beam in two, turned <b>${Math.abs(p.turn ?? 2) * 60}°</b> left and right. Nothing goes straight on.</p>${lightIn}<div class="row">${btn('Rotate (R)', 'rotate', k)}</div>`; break
    case 'mirror': body = `<p>Turns the whole beam <b>${turnText(p.turn ?? 2)}</b>.</p>${lightIn}<div class="row">${btn('Rotate (R)', 'rotate', k)}</div>`; break
    case 'basin': body = `<p>Banks blue light as mana: <b class="up">${signed(r.out[k] || 0)}/s</b>.</p>${lightIn}`; break
    case 'glass': body = `<p>Turns blue light amber at ${GLASS_RATIO}:1. Amber feeds the Lectern.</p>${lightIn}`; break
    case 'lectern': body = `<p>Turns amber light into Insight: <b class="up">${signed(r.out[k] || 0)}/s</b>. Blue light is wasted here.</p>${lightIn}`; break
    case 'relic': body = `<p>Burning Glass. Any beam through this hex is multiplied by x${RELIC_MULT}.</p>${lightIn}`; break
    case 'keystone': body = `<p>Your crystallized lattice. Any beam through this hex is multiplied by <b>x${s.keystones[p.ks ?? 0]?.grade ?? 1}</b>.</p>${lightIn}`; break
    case 'twin': body = `<p>Needs blue and violet light together. Cuts √(blue × violet) ÷ ${GEMS.twin.light} Twinned gems per second, so balance beats brute force.</p>${lightIn}<p>Cuts: <b class="up">${fmt(r.out[k] || 0)}/s</b></p>`; break
  }
  return `<h2>${pieceTitle(p)}</h2>${body}${vein}${back ? `<div class="row">${back}</div>` : ''}`
}

// ---------- tray ----------
function tray(): string {
  const s = G.s
  const items: string[] = []
  const held = G.held
  for (const kind of Object.keys(s.tray) as TrayKind[]) {
    if (s.tray[kind] < 1) continue
    const on = held?.src === 'tray' && held.kind === kind
    items.push(`<button type="button" class="tool${on ? ' on' : ''}" data-hold="tray:${kind}" data-fid="hold:${kind}"><img draggable="false" src="${icon(kind)}" alt=""><span>${PIECE_NAME[kind]}</span><b>x${s.tray[kind]}</b></button>`)
  }
  for (const g of GEM_ORDER) {
    if (Math.floor(s.stock[g]) < 1) continue
    const on = held?.src === 'gem' && held.gem === g
    items.push(`<button type="button" class="tool${on ? ' on' : ''}" data-hold="gem:${g}" data-fid="hold:${g}"><img draggable="false" src="${icon(g)}" alt=""><span>${plural(g)}</span><b>x${fmtInt(s.stock[g])}</b></button>`)
  }
  let buy = ''
  if (s.unlocked.prism) {
    const b = (kind: 'prism' | 'mirror' | 'foundry') => btn(`${PIECE_NAME[kind]} · ${fmt(A.pieceCost(s, kind))} mana`, 'buy', kind, { dis: !A.canBuyPiece(s, kind) })
    buy = `<div class="row buy"><span class="dim">Buy</span>${b('foundry')}${b('prism')}${s.unlocked.mirror ? b('mirror') : ''}</div>`
  }
  return `<h2>Tray</h2><div class="tray">${items.join('') || '<p class="dim">Empty. New pieces and cut gems appear here.</p>'}</div>${buy}`
}

// ---------- inventory ----------
function inventory(): string {
  const s = G.s, r = G.r
  const rows: string[] = []
  for (const g of GEM_ORDER) {
    const visible = s.cut[g] > 0 || s.stock[g] >= 1 || (g !== 'twin' && A.recipeUnlocked(s, g)) || (g === 'twin' && !!LAYERS[s.layer].twinAt)
    if (!visible) continue
    let set = 0
    for (const p of Object.values(s.board)) { if (p.kind === 'stack' && p.gem === g) set += p.n ?? 0; if (p.kind === 'foundry' && p.setGem === g) set += p.setN ?? 0 }
    const share = s.unlocked.auto ? btn(pct(s.autoShare[g]), 'share', g, { title: 'Share of newly cut gems that flows into stacks of this gem on the board. Click to change.' }) : '<span class="dim">locked</span>'
    rows.push(`<tr><td><i class="sw" style="background:${GEM_COLOR[g]}"></i>${GEMS[g].name}</td><td>${fmtInt(s.stock[g])}</td><td>${fmtInt(set)}</td><td>${fmt(r.gross[g])}</td><td class="${r.net[g] < -0.005 ? 'down' : 'up'}">${signed(r.net[g])}</td><td>${share}</td></tr>`)
  }
  const next = (['lozenge', 'brilliant'] as GemId[]).find(g => !A.recipeUnlocked(s, g))
  if (next) { const u = GEMS[next].unlock!; rows.push(`<tr class="next"><td colspan="6">Next: ${GEMS[next].name} · requires ${fmtInt(Math.min(s.cut[u[0]], u[1]))}/${u[1]} ${plural(u[0])} cut</td></tr>`) }
  return `<h2>Gems</h2><div class="tablewrap"><table class="inv"><thead><tr><th>Gem</th><th>Stock</th><th>Set</th><th>Cut /s</th><th>Net /s</th><th title="Share of new gems that flows into stacks on the board">Auto-set</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
}

// ---------- Cut Book ----------
function cutbook(): string {
  const s = G.s
  const found = s.insight > 0 || s.tray.lectern > 0 || Object.values(s.board).some(p => p.kind === 'lectern') || RESEARCH.some(c => s.research[c.id] > 0)
  if (!found) return '<h2>Cut Book</h2><p class="dim">Research. Find the Tinting Glass and Lectern in the dark to start earning Insight.</p>'
  const rows = RESEARCH.map(c => {
    const lvl = s.research[c.id], maxed = lvl >= c.max, cost = A.researchCost(s, c.id)
    return `<tr><td><b>${c.name}</b><br><span class="dim">${c.desc}</span></td><td>${lvl}/${c.max}</td><td>${maxed ? '<span class="dim">done</span>' : btn(`${fmt(cost)}`, 'research', c.id, { dis: s.insight < cost })}</td></tr>`
  }).join('')
  return `<h2>Cut Book <span class="amber">${fmt(s.insight)} Insight</span></h2><div class="tablewrap"><table class="inv book"><tbody>${rows}</tbody></table></div>`
}

function footer(): string {
  const s = G.s
  return `<div class="row">${btn('Undo (Ctrl+Z)', 'undo', '', { dis: !G.undo.length })}${btn(`Sound: ${s.sound ? 'on' : 'off'}`, 'sound')}${btn('Save / Load', 'save')}${btn('Reset', 'reset')}</div>
    <p class="dim small">EverCraft 3: Lattice · playtest build v${__APP_VERSION__} · played ${fmtTime(s.time)} · saves to this browser every 5 seconds</p>`
}

function toasts(): string {
  return G.toasts.map(t => `<div class="toast">${t.text}</div>`).join('')
}

export function renderPanels(): void {
  const now = performance.now()
  G.toasts = G.toasts.filter(t => t.until > now)
  put('hud', hud(), true)
  put('strip', strip(), true)
  put('p-goals', goals())
  put('p-selection', selection())
  put('p-tray', tray())
  put('p-inventory', inventory())
  put('p-cutbook', cutbook())
  put('p-footer', footer())
  put('toasts', toasts(), true)
  G.dirty = false
}

// ---------- dialogs ----------
function modal(html: string): void {
  const m = $('modal')
  m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`
  m.hidden = false
  ;(m.querySelector('button.primary') as HTMLElement | null)?.focus()
}
export function closeModal(): void { $('modal').hidden = true; $('modal').innerHTML = '' }
export const modalOpen = (): boolean => !$('modal').hidden

function crystallizeDialog(): void {
  const s = G.s, L = LAYERS[s.layer]
  modal(`<h2>Crystallize ${L.name}?</h2>
    <p>The whole board fuses into <b>Keystone ${roman(s.keystones.length + 1)}</b>, grade <b>x${A.previewGrade(s)}</b>. Set it in a beam on the next layer to multiply that beam.</p>
    <p class="dim">Grade = 2 × log10(mana banked on this layer). You have banked ${fmt(s.banked)}. Waiting longer raises the grade a little.</p>
    <table class="inv"><tbody>
      <tr><td>Kept</td><td class="left">Foundries, prisms, mirrors and other tools · Cut Book research · Insight</td></tr>
      <tr><td>Fused</td><td class="left">All gems (stock, stacks, settings) · mana · lit hexes · recipe progress</td></tr>
    </tbody></table>
    <div class="row">${btn('Crystallize', 'crystallize-yes', '', { cls: 'primary' })}${btn('Not yet', 'close')}</div>`)
}

const roman = (n: number): string => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][n - 1] ?? String(n)

function keystoneDialog(): void {
  const ks = G.s.keystones[G.s.keystones.length - 1]
  modal(`<h2>Keystone ${roman(G.s.keystones.length)}</h2><canvas id="ks-canvas" width="520" height="440"></canvas>
    <p>Its facets are the beam layout you built. Grade <b>x${ks.grade}</b>.</p>
    <p class="dim">${LAYERS[G.s.layer].name} is a larger board with a second, violet Well. Your tools and the Keystone are in the tray.</p>
    <div class="row">${btn('Continue', 'close', '', { cls: 'primary' })}</div>`)
  const cv = $('ks-canvas') as HTMLCanvasElement
  drawKeystone(cv.getContext('2d')!, 260, 220, 170, ks.segs)
}

export function endDialog(): void {
  modal(`<h2>End of the playtest build</h2>
    <p>You banked ${fmt(LAYERS[G.s.layer].goal)} mana on ${LAYERS[G.s.layer].name}. That is all the content in this build. The board keeps running if you want to keep optimising.</p>
    <p class="dim">Played ${fmtTime(G.s.time)}.</p><div class="row">${btn('Keep playing', 'close', '', { cls: 'primary' })}</div>`)
}

export function offlineDialog(seconds: number, mana: number): void {
  modal(`<h2>While you were away</h2><p>${fmtTime(seconds)} passed. The lattice banked <b class="up">+${fmt(mana)}</b> mana and kept cutting.</p><div class="row">${btn('Continue', 'close', '', { cls: 'primary' })}</div>`)
}

function saveDialog(): void {
  modal(`<h2>Save / Load</h2><p class="dim">Copy this text to keep a backup, or paste a save and press Load.</p>
    <textarea id="save-text" rows="6" spellcheck="false">${encodeSave(G.s)}</textarea><p id="save-msg" class="dim"></p>
    <div class="row">${btn('Copy', 'save-copy')}${btn('Load pasted save', 'save-load')}${btn('Close', 'close', '', { cls: 'primary' })}</div>`)
}

function resetDialog(): void {
  modal(`<h2>Reset everything?</h2><p>This deletes your save in this browser and starts from the first Shard. It can not be undone.</p>
    <div class="row">${btn('Delete my save', 'reset-yes', '', { cls: 'danger' })}${btn('Cancel', 'close', '', { cls: 'primary' })}</div>`)
}

// ---------- actions ----------
const ACTIONS: Record<string, (arg: string) => void> = {
  'open-well': () => { act(A.openWell) },
  light: k => { const ev: string[] = []; if (act(s => A.lightHex(s, k, ev))) ev.forEach(e => toast(e)) },
  rotate: k => rotate(k),
  remove: k => remove(k),
  recipe: g => { if (G.sel) act(s => A.setRecipe(s, G.sel!, g as GemId)) },
  'stack-add': f => { if (G.sel) act(s => A.addToStack(s, G.sel!, Number(f))) },
  'stack-take': f => { if (G.sel) act(s => A.takeFromStack(s, G.sel!, Number(f))) },
  'set-gem': g => { if (G.sel) act(s => A.setInFoundry(s, G.sel!, g as GemId, 0.5)) },
  'set-clear': () => { if (G.sel) act(s => A.clearSetting(s, G.sel!)) },
  buy: kind => { act(s => A.buyPiece(s, kind as 'foundry' | 'prism' | 'mirror')) },
  research: id => { act(s => A.buyResearch(s, id as ResearchId)) },
  share: g => {
    const cur = G.s.autoShare[g as GemId]
    const i = SHARE_STEPS.findIndex(v => Math.abs(v - cur) < 0.01)
    act(s => A.setShare(s, g as GemId, SHARE_STEPS[(i + 1) % SHARE_STEPS.length]))
  },
  'cancel-hold': () => hold(null),
  undo: () => undo(),
  sound: () => { G.s.sound = !G.s.sound; if (G.s.sound) unlockAudio(); G.dirty = true },
  save: () => saveDialog(),
  reset: () => resetDialog(),
  crystallize: () => { if (A.canCrystallize(G.s)) crystallizeDialog() },
  'crystallize-yes': () => { if (A.crystallize(G.s)) { setState(G.s); keystoneDialog() } },
  close: () => closeModal(),
  'save-copy': () => {
    const ta = $('save-text') as HTMLTextAreaElement
    ta.select()
    navigator.clipboard?.writeText(ta.value).then(() => { $('save-msg').textContent = 'Copied.' }, () => { $('save-msg').textContent = 'Select the text and copy it by hand.' })
  },
  'save-load': () => {
    const loaded = decodeSave(($('save-text') as HTMLTextAreaElement).value)
    if (!loaded) { $('save-msg').textContent = 'That text is not a valid save.'; return }
    loaded.lastTs = Date.now()
    setState(loaded)
    closeModal()
    toast('Save loaded')
  },
  'reset-yes': () => { clearLocal(); setState(defaultState()); closeModal() },
}

export function initPanels(): void {
  document.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null
    if (el && !(el as HTMLButtonElement).disabled) {
      unlockAudio()
      ACTIONS[el.dataset.act!]?.(el.dataset.arg ?? '')
      G.dirty = true
      return
    }
    // keyboard activation of a tray item (pointer presses are handled on pointerdown)
    const h = (e.target as HTMLElement).closest('[data-hold]') as HTMLElement | null
    if (h && e.detail === 0) holdFrom(h)
  })
  document.addEventListener('pointerdown', e => {
    const t = e.target as HTMLElement
    if (t.closest('[data-act],[data-hold]')) pressing = true
    const h = t.closest('[data-hold]') as HTMLElement | null
    if (h) { unlockAudio(); holdFrom(h) }
  })
  // A native image drag would cancel the pointer stream mid-drag.
  document.addEventListener('dragstart', e => e.preventDefault())
  const release = () => setTimeout(() => { pressing = false; G.dirty = true }, 0)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
}

function holdFrom(el: HTMLElement): void {
  const [src, id] = el.dataset.hold!.split(':')
  const same = G.held && ((G.held.src === 'tray' && src === 'tray' && G.held.kind === id) || (G.held.src === 'gem' && src === 'gem' && G.held.gem === id))
  if (same) hold(null)
  else hold(src === 'tray' ? { src: 'tray', kind: id as TrayKind } : { src: 'gem', gem: id as GemId })
}

