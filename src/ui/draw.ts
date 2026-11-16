// Canvas drawing primitives. Everything is procedural: polygons, lines, additive glow.
import type { GemId, Piece } from '../types'

export const COLORS = {
  void: '#04060b', panel: '#0a0f18', line: '#1b2637', lineLit: '#2c3d57', ink: '#dde6f3', dim: '#8b98ad',
  mana: '#3ea8ff', amber: '#ffc24a', violet: '#b388ff', white: '#ffffff', ember: '#ff5d73', lime: '#9be564',
}
export const MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace'
export const GEM_TIER: Record<GemId, number> = { shard: 1, lozenge: 2, brilliant: 3, twin: 4 }
export const GEM_COLOR: Record<GemId, string> = { shard: COLORS.mana, lozenge: COLORS.mana, brilliant: COLORS.mana, twin: COLORS.violet }

type Ctx = CanvasRenderingContext2D

export function poly(c: Ctx, x: number, y: number, r: number, n: number, rot: number, sx = 1): void {
  c.beginPath()
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n
    const px = x + r * Math.cos(a) * sx, py = y + r * Math.sin(a)
    if (i) c.lineTo(px, py)
    else c.moveTo(px, py)
  }
  c.closePath()
}

/** A faceted gem. Tier sets the silhouette: more sides and facets per tier. */
export function drawGem(c: Ctx, x: number, y: number, r: number, tier: number, col: string): void {
  const sides = [3, 4, 6, 8, 10, 12, 16, 20][tier - 1], sx = tier === 2 ? 0.68 : 1, rot = -Math.PI / 2
  if (tier === 1) y += r * 0.12
  c.save()
  c.lineJoin = 'round'
  poly(c, x, y, r, sides, rot, sx)
  c.globalAlpha *= 0.16; c.fillStyle = col; c.fill(); c.globalAlpha /= 0.16
  c.shadowColor = col; c.shadowBlur = r * 0.7; c.strokeStyle = col; c.lineWidth = Math.max(1.2, r * 0.09); c.stroke(); c.shadowBlur = 0
  const ri = r * (tier < 3 ? 0.42 : 0.5), step = Math.PI / sides
  c.globalAlpha *= 0.75; c.lineWidth = Math.max(0.8, r * 0.05)
  poly(c, x, y, ri, sides, rot + step, sx); c.stroke()
  c.beginPath()
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides, ox = x + r * Math.cos(a) * sx, oy = y + r * Math.sin(a)
    for (const d of [-1, 1]) { const b = a + d * step; c.moveTo(ox, oy); c.lineTo(x + ri * Math.cos(b) * sx, y + ri * Math.sin(b)) }
  }
  c.stroke()
  c.restore()
}

export function glowDisc(c: Ctx, x: number, y: number, r: number, col: string, alpha = 0.55): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)')
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= alpha; c.fillStyle = g
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.restore()
}

export function label(c: Ctx, x: number, y: number, txt: string, col: string, size: number): void {
  c.font = `500 ${size}px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle'
  const w = c.measureText(txt).width + 6
  c.fillStyle = 'rgba(4,6,11,.82)'; c.fillRect(x - w / 2, y - size * 0.7, w, size * 1.4)
  c.fillStyle = col; c.fillText(txt, x, y)
}

const ring = (c: Ctx, x: number, y: number, r: number): void => { c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke() }

/** Draw one piece centred at (x, y). `S` is the hex size; `phase` is a foundry's craft progress 0..1. */
export function drawPiece(c: Ctx, p: Piece, x: number, y: number, S: number, opts: { open?: boolean; phase?: number; keystoneGrade?: number } = {}): void {
  const r = S * 0.42
  c.save()
  switch (p.kind) {
    case 'well': {
      const col = COLORS[p.color ?? 'mana']
      if (opts.open !== false) glowDisc(c, x, y, S * 1.15, col)
      c.fillStyle = opts.open !== false ? '#fff' : col; c.beginPath(); c.arc(x, y, r * 0.38, 0, 7); c.fill()
      c.strokeStyle = col; c.lineWidth = 2; ring(c, x, y, r * 0.75)
      break
    }
    case 'stack': drawGem(c, x, y, r, GEM_TIER[p.gem!], GEM_COLOR[p.gem!]); break
    case 'relic': {
      glowDisc(c, x, y, S * 0.8, COLORS.white)
      c.strokeStyle = COLORS.white; c.lineWidth = 1.6; c.beginPath()
      for (let i = 0; i < 16; i++) {
        const an = (i * Math.PI) / 8, rr = i % 2 ? r * 0.38 : r
        if (i) c.lineTo(x + rr * Math.cos(an), y + rr * Math.sin(an))
        else c.moveTo(x + rr * Math.cos(an), y + rr * Math.sin(an))
      }
      c.closePath(); c.stroke()
      break
    }
    case 'keystone': {
      glowDisc(c, x, y, S * 0.9, COLORS.mana)
      poly(c, x, y, r, 6, 0); c.fillStyle = 'rgba(62,168,255,.2)'; c.fill()
      c.strokeStyle = COLORS.white; c.lineWidth = 1.8; c.stroke()
      c.lineWidth = 0.9; c.beginPath()
      for (let i = 0; i < 6; i++) { const an = (i * Math.PI) / 3; c.moveTo(x, y); c.lineTo(x + r * Math.cos(an), y + r * Math.sin(an)) }
      c.stroke()
      break
    }
    case 'glass': {
      glowDisc(c, x, y, S * 0.7, COLORS.amber)
      c.strokeStyle = COLORS.amber; c.lineWidth = 2; ring(c, x, y, r * 0.7)
      c.globalAlpha *= 0.25; c.fillStyle = COLORS.amber; c.fill()
      break
    }
    case 'mirror': {
      const t = p.turn ?? 2, ang = (Math.sign(t) * (Math.abs(t) === 2 ? 30 : 60) * Math.PI) / 180
      c.translate(x, y); c.rotate(-ang)
      c.strokeStyle = COLORS.white; c.lineWidth = 2.4; c.shadowColor = COLORS.white; c.shadowBlur = r * 0.5
      c.beginPath(); c.moveTo(0, -r * 0.78); c.lineTo(0, r * 0.78); c.stroke()
      c.shadowBlur = 0; c.lineWidth = 1; c.globalAlpha *= 0.6
      for (const yy of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(0, yy * r); c.lineTo(-r * 0.22, yy * r + r * 0.18); c.stroke() }
      break
    }
    case 'prism':
    case 'yprism': {
      c.strokeStyle = COLORS.white; c.lineWidth = 1.8; c.lineJoin = 'round'; c.shadowColor = COLORS.white; c.shadowBlur = r * 0.5
      poly(c, x, y + r * 0.08, r * 0.72, 3, -Math.PI / 2); c.stroke(); c.shadowBlur = 0
      c.globalAlpha *= 0.12; c.fillStyle = COLORS.white; c.fill(); c.globalAlpha /= 0.12
      if (p.kind === 'yprism') { c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + r * 0.44); c.lineTo(x, y + r * 0.05); c.lineTo(x - r * 0.3, y - r * 0.2); c.moveTo(x, y + r * 0.05); c.lineTo(x + r * 0.3, y - r * 0.2); c.stroke() }
      break
    }
    case 'foundry': {
      c.strokeStyle = COLORS.ink; c.lineWidth = 1.4; c.strokeRect(x - r * 0.82, y - r * 0.82, r * 1.64, r * 1.64)
      const g = p.recipe ?? 'shard'
      drawGem(c, x, y, r * 0.5, GEM_TIER[g], GEM_COLOR[g])
      if (p.setGem && p.setN) {
        c.fillStyle = GEM_COLOR[p.setGem]
        for (const d of [-1, 1]) { c.save(); c.translate(x + d * r * 0.56, y - r * 0.82); c.rotate(Math.PI / 4); c.fillRect(-r * 0.11, -r * 0.11, r * 0.22, r * 0.22); c.restore() }
      }
      if (opts.phase !== undefined) {
        c.strokeStyle = COLORS.lime; c.lineWidth = 2
        c.beginPath(); c.arc(x, y, r * 1.2, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * opts.phase); c.stroke()
      }
      break
    }
    case 'basin': {
      c.strokeStyle = COLORS.mana; c.lineWidth = 1.6
      ring(c, x, y, r * 0.8); ring(c, x, y, r * 0.5)
      c.globalAlpha *= 0.3; c.fillStyle = COLORS.mana; c.beginPath(); c.arc(x, y, r * 0.5, 0, 7); c.fill()
      break
    }
    case 'lectern': {
      c.strokeStyle = COLORS.amber; c.lineWidth = 1.6
      poly(c, x, y, r * 0.82, 4, 0); c.stroke(); ring(c, x, y, r * 0.3)
      break
    }
    case 'twin': {
      glowDisc(c, x, y, S * 0.95, COLORS.white, 0.4)
      c.lineWidth = 2.2
      c.strokeStyle = COLORS.mana; c.beginPath(); c.arc(x, y, r * 0.75, Math.PI / 2, Math.PI * 1.5); c.stroke()
      c.strokeStyle = COLORS.violet; c.beginPath(); c.arc(x, y, r * 0.75, -Math.PI / 2, Math.PI / 2); c.stroke()
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r * 0.22, 0, 7); c.fill()
      if (opts.phase !== undefined) {
        c.strokeStyle = COLORS.lime; c.lineWidth = 2
        c.beginPath(); c.arc(x, y, r * 1.2, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * opts.phase); c.stroke()
      }
      break
    }
  }
  c.restore()
}

/** The Keystone as a large gem whose facets are the beam layout it was made from. */
export function drawKeystone(c: Ctx, cx: number, cy: number, R: number, segs: number[][]): void {
  glowDisc(c, cx, cy, R * 1.7, COLORS.mana)
  poly(c, cx, cy, R, 6, 0); c.fillStyle = 'rgba(62,168,255,.10)'; c.fill()
  c.save(); c.shadowColor = COLORS.mana; c.shadowBlur = 24; c.strokeStyle = COLORS.white; c.lineWidth = 2.2; c.stroke(); c.restore()
  c.save(); c.strokeStyle = COLORS.mana; c.globalAlpha = 0.4; c.lineWidth = 1
  poly(c, cx, cy, R * 0.86, 6, 0); c.stroke()
  c.beginPath()
  for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.moveTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); c.lineTo(cx + R * 0.86 * Math.cos(a), cy + R * 0.86 * Math.sin(a)) }
  c.stroke(); c.restore()
  let ext = 1
  for (const g of segs) for (const [q, r] of [[g[0], g[1]], [g[2], g[3]]]) ext = Math.max(ext, (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2)
  const S = (R * 0.78) / (Math.sqrt(3) * ext)
  const P = (q: number, r: number): [number, number] => [cx + S * Math.sqrt(3) * (q + r / 2), cy + S * 1.5 * r]
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.strokeStyle = COLORS.white
  for (const g of segs) {
    const a = P(g[0], g[1]), b = P(g[2], g[3])
    c.globalAlpha = 0.2; c.lineWidth = S * 0.34; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke()
    c.globalAlpha = 0.95; c.lineWidth = Math.max(1.5, S * 0.09); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke()
  }
  c.restore()
}
