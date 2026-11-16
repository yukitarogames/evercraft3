// The board canvas: draws the lattice and turns pointer input into game actions.
import { key, parse, ring } from '../hex'
import { LAYERS, RELIC_MULT, GLASS_RATIO } from '../config'
import { G, clickHex, drop, hold, setHover } from '../game'
import * as A from '../sim/actions'
import { lensMult, lensShardAdd, wellPower } from '../sim/trace'
import { resonanceMult } from '../sim/rates'
import type { Piece, Rates, State } from '../types'
import { COLORS, GEM_COLOR, GEM_TIER, MONO, drawGem, drawPiece, label, poly } from './draw'
import { chime, unlockAudio } from './audio'
import { fmt } from './format'

const DRAG_PX = 6
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

export class Board {
  private ctx: CanvasRenderingContext2D
  private W = 0
  private H = 0
  private S = 40
  private phases: Record<string, number> = {}
  private down: { k: string; x: number; y: number } | null = null
  private pointer: { x: number; y: number } | null = null

  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!
    new ResizeObserver(() => this.resize()).observe(cv)
    this.resize()
    cv.addEventListener('pointerdown', e => this.onDown(e))
    window.addEventListener('pointermove', e => this.onMove(e))
    window.addEventListener('pointerup', e => this.onUp(e))
    window.addEventListener('pointercancel', () => { this.down = null; if (G.held?.src === 'board') hold(null) })
    cv.addEventListener('contextmenu', e => { e.preventDefault(); hold(null) })
  }

  private resize(): void {
    const r = this.cv.getBoundingClientRect()
    if (!r.width) return
    this.W = r.width
    this.H = r.height
    const d = Math.min(2, window.devicePixelRatio || 1)
    this.cv.width = Math.round(this.W * d)
    this.cv.height = Math.round(this.H * d)
  }

  private layout(): void {
    const Rv = LAYERS[G.s.layer].R + 0.85
    this.S = Math.min(this.W / (Math.sqrt(3) * (2 * Rv + 1)), this.H / (3 * Rv + 2))
  }

  private P(q: number, r: number): [number, number] {
    return [this.W / 2 + this.S * Math.sqrt(3) * (q + r / 2), this.H / 2 + this.S * 1.5 * r]
  }

  /** Hex under a client-space point, or null if the point is outside the canvas. */
  private hexAt(clientX: number, clientY: number): string | null {
    const rect = this.cv.getBoundingClientRect()
    const x = clientX - rect.left, y = clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
    this.pointer = { x, y }
    const fx = (x - this.W / 2) / this.S, fy = (y - this.H / 2) / this.S
    const fq = (Math.sqrt(3) / 3) * fx - fy / 3, fr = (2 / 3) * fy
    let q = Math.round(fq), r = Math.round(fr)
    const s = Math.round(-fq - fr)
    const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s + fq + fr)
    if (dq > dr && dq > ds) q = -r - s
    else if (dr > ds) r = -q - s
    return key(q, r)
  }

  private onDown(e: PointerEvent): void {
    unlockAudio()
    if (e.button !== 0) return
    const k = this.hexAt(e.clientX, e.clientY)
    this.down = k ? { k, x: e.clientX, y: e.clientY } : null
  }

  private onMove(e: PointerEvent): void {
    const k = this.hexAt(e.clientX, e.clientY)
    if (!k) this.pointer = null
    if (this.down && !G.held && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > DRAG_PX) {
      const p = G.s.board[this.down.k]
      if (p && !p.fixed && G.s.lit[this.down.k]) hold({ src: 'board', from: this.down.k })
    }
    setHover(k)
    this.cv.style.cursor = G.held ? 'grabbing' : k && (G.s.board[k] || A.canLight(G.s, k)) ? 'pointer' : 'default'
  }

  private onUp(e: PointerEvent): void {
    const k = this.hexAt(e.clientX, e.clientY)
    const down = this.down
    this.down = null
    if (G.held) {
      if (G.held.src === 'board') {
        if (k) drop(k)
        hold(null)
      } else if (k) {
        // A tray piece is dropped by releasing over the board. A miss on a piece selects that piece instead.
        if (!drop(k) && G.s.board[k]) { hold(null); clickHex(k) }
      }
      return
    }
    if (k && down && down.k === k) clickHex(k)
  }

  draw(ts: number, dt: number): void {
    if (!this.W) return
    this.layout()
    const c = this.ctx, S = this.S
    const dpr = this.cv.width / this.W
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.fillStyle = COLORS.void
    c.fillRect(0, 0, this.W, this.H)

    const s: State = G.preview?.s ?? G.s
    const r: Rates = G.preview?.r ?? G.r
    const L = LAYERS[s.layer]
    const fs = Math.max(9, Math.min(13, S * 0.23))
    const price = A.hexPrice(s)

    // hexes
    for (const [q, rr] of ring(L.R)) {
      const k = key(q, rr), [x, y] = this.P(q, rr), on = !!s.lit[k], buyable = !on && A.canLight(s, k)
      poly(c, x, y, S * 0.94, 6, Math.PI / 6)
      if (on) { c.fillStyle = COLORS.panel; c.fill() }
      c.strokeStyle = on ? COLORS.lineLit : COLORS.line
      c.lineWidth = 1
      c.stroke()
      if (L.veins.includes(k)) {
        c.save(); c.setLineDash([2, 5]); c.strokeStyle = COLORS.white; c.globalAlpha = on ? 0.6 : 0.3
        poly(c, x, y, S * 0.78, 6, Math.PI / 6); c.stroke(); c.restore()
      }
      const cache = L.caches[k]
      if (cache && !on) {
        c.save(); c.globalAlpha = 0.4
        drawPiece(c, { kind: 'glass' }, x, y - S * 0.12, S * 0.7)
        c.restore()
      }
      if (buyable) {
        c.font = `${fs}px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle'
        c.fillStyle = s.mana >= price ? COLORS.ink : COLORS.dim
        c.fillText(fmt(price), x, y + (cache || s.board[k] ? S * 0.52 : 0))
      }
      if (G.held && G.held.src !== 'board' && on && !s.board[k] && !G.preview) {
        c.save(); c.strokeStyle = COLORS.white; c.globalAlpha = 0.22; poly(c, x, y, S * 0.84, 6, Math.PI / 6); c.stroke(); c.restore()
      }
    }

    // beams
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.lineCap = 'round'
    r.tr.segs.forEach((g, i) => {
      const a = this.P(g.a[0], g.a[1]), b = this.P(g.b[0], g.b[1])
      const col = COLORS[g.col], w = Math.min(S * 0.3, (1.2 + Math.log10(g.pw + 1) * 1.5) * (S / 44))
      let stroke: string | CanvasGradient = col
      if (g.exit) { const gr = c.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); stroke = gr }
      const line = () => { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke() }
      c.strokeStyle = stroke
      c.globalAlpha = 0.22; c.lineWidth = w * 3.6; line()
      c.globalAlpha = 0.9; c.lineWidth = w; line()
      c.strokeStyle = g.exit ? stroke : '#fff'; c.lineWidth = Math.max(0.6, w * 0.28); line()
      if (!still) {
        const f = (ts / 900 + i * 0.37) % 1
        c.globalAlpha = g.exit ? 1 - f : 1
        c.fillStyle = '#fff'
        c.beginPath(); c.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.max(1.4, w * 0.8), 0, 7); c.fill()
      }
    })
    c.restore()

    // delve sites
    for (const d of L.delves) {
      if (s.delveDone[d.id]) continue
      const [q, rr] = parse(d.at), [x, y] = this.P(q, rr), have = s.delve[d.id] || 0
      c.save()
      c.setLineDash([4, 5]); c.strokeStyle = COLORS.dim; c.lineWidth = 1.2
      c.beginPath(); c.arc(x, y, S * 0.5, 0, 7); c.stroke()
      c.setLineDash([])
      c.strokeStyle = COLORS.mana; c.lineWidth = 2.4
      c.beginPath(); c.arc(x, y, S * 0.5, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, have / d.need)); c.stroke()
      c.font = `500 ${fs + 3}px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = COLORS.dim
      c.fillText('?', x, y)
      c.restore()
      label(c, x, y + S * 0.74, `${fmt(have)}/${fmt(d.need)}`, COLORS.dim, fs)
    }

    // pieces
    for (const k in s.board) {
      const p = s.board[k], [q, rr] = parse(k), [x, y] = this.P(q, rr), on = !!s.lit[k]
      let phase: number | undefined
      if ((p.kind === 'foundry' || p.kind === 'twin') && on && !G.preview) {
        const rate = G.r.out[k] || 0
        if (rate > 3) phase = 1
        else if (rate > 0) {
          let ph = (this.phases[k] || 0) + rate * dt
          if (ph >= 1) { ph %= 1; if (G.s.sound) chime(p.kind === 'twin' ? 4 : GEM_TIER[p.recipe ?? 'shard']) }
          this.phases[k] = ph
          phase = ph
        }
      }
      c.save()
      if (!on) c.globalAlpha = 0.4
      if (G.held?.src === 'board' && G.held.from === k && !G.preview) c.globalAlpha = 0.35
      drawPiece(c, p, x, y, S, { open: s.wellOpen, phase })
      c.restore()
      if (!on) continue
      const [txt, col] = this.pieceLabel(s, r, k, p)
      if (txt) label(c, x, y + S * 0.66, txt, col, fs)
    }

    // selection and hover rings
    const ringAt = (k: string, col: string, alpha: number) => {
      const [q, rr] = parse(k), [x, y] = this.P(q, rr)
      c.save(); c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = 1.6; poly(c, x, y, S * 0.94, 6, Math.PI / 6); c.stroke(); c.restore()
    }
    if (G.sel) ringAt(G.sel, COLORS.white, 0.9)
    if (G.hover && G.hover !== G.sel && (A.onBoard(s, G.hover) || s.lit[G.hover])) ringAt(G.hover, G.preview ? COLORS.lime : COLORS.ink, 0.5)

    // a held tray piece follows the pointer until it has a valid target
    if (G.held && G.held.src !== 'board' && !G.preview && this.pointer) {
      c.save(); c.globalAlpha = 0.75
      if (G.held.src === 'gem') drawGem(c, this.pointer.x, this.pointer.y, S * 0.36, GEM_TIER[G.held.gem], GEM_COLOR[G.held.gem])
      else drawPiece(c, { kind: G.held.kind, turn: 1 }, this.pointer.x, this.pointer.y, S * 0.85)
      c.restore()
    }
    if (!s.wellOpen) {
      const [q, rr] = parse(L.wells[0].at), [x, y] = this.P(q, rr)
      const pulse = still ? 0.6 : 0.5 + 0.5 * Math.sin(ts / 300)
      c.save(); c.strokeStyle = COLORS.mana; c.globalAlpha = 0.3 + 0.6 * pulse; c.lineWidth = 2
      c.beginPath(); c.arc(x, y, S * (0.55 + 0.12 * pulse), 0, 7); c.stroke(); c.restore()
      label(c, x, y + S * 0.66, 'click', COLORS.mana, fs)
    }
  }

  private pieceLabel(s: State, r: Rates, k: string, p: Piece): [string, string] {
    switch (p.kind) {
      case 'well': return s.wellOpen ? [`${fmt(wellPower(s, p))}/s`, COLORS[p.color ?? 'mana']] : ['', '']
      case 'stack': {
        const n = p.n ?? 0
        if (p.gem === 'shard') return [`+${fmt(lensShardAdd(s, n))}`, COLORS.mana]
        if (p.gem === 'brilliant') return [`x${resonanceLabel(n)} adj`, COLORS.mana]
        return [`x${lensMult(p.gem as 'lozenge' | 'twin', n).toFixed(2)}`, GEM_COLOR[p.gem!]]
      }
      case 'relic': return [`x${RELIC_MULT}`, COLORS.ink]
      case 'keystone': return [`x${s.keystones[p.ks ?? 0]?.grade ?? 1}`, COLORS.ink]
      case 'glass': return [`${GLASS_RATIO}:1`, COLORS.amber]
      case 'foundry':
      case 'twin': {
        if (r.starved[k]) return [`${fmt(r.out[k] || 0)}/s starved`, COLORS.ember]
        if (!r.out[k]) return ['no light', COLORS.dim]
        return [`${fmt(r.out[k])}/s`, COLORS.lime]
      }
      case 'basin':
      case 'lectern': return r.out[k] ? [`+${fmt(r.out[k])}/s`, COLORS.lime] : ['no light', COLORS.dim]
      default: return ['', '']
    }
  }
}

const resonanceLabel = (n: number): string => resonanceMult({ board: { '0,0': { kind: 'stack', gem: 'brilliant', n } }, lit: { '0,0': true } } as unknown as State, '1,0').toFixed(2)

