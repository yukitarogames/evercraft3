// Controller: owns the live state, the current rates, and transient UI state (selection, held piece, preview).
import * as A from './sim/actions'
import { computeRates } from './sim/rates'
import { defaultState } from './state'
import type { GemId, Piece, Rates, State, TrayKind } from './types'

export type Held = { src: 'tray'; kind: TrayKind } | { src: 'gem'; gem: GemId } | { src: 'board'; from: string }
export interface Toast { id: number; text: string; until: number }

const first = defaultState()
export const G = {
  s: first,
  r: computeRates(first) as Rates,
  sel: null as string | null,
  held: null as Held | null,
  hover: null as string | null,
  /** the board as it would be if the held piece were dropped on the hovered hex */
  preview: null as { s: State; r: Rates } | null,
  toasts: [] as Toast[],
  undo: [] as (() => void)[],
  /** panels re-render when this is set */
  dirty: true,
}

let toastId = 0
export function toast(text: string, seconds = 6): void {
  G.toasts.push({ id: ++toastId, text, until: performance.now() + seconds * 1000 })
  if (G.toasts.length > 4) G.toasts.shift()
  G.dirty = true
}

export function refresh(): void {
  G.r = computeRates(G.s)
  updatePreview()
  G.dirty = true
}

export function setState(s: State): void {
  G.s = s
  G.sel = null
  G.held = null
  G.hover = null
  G.undo = []
  refresh()
}

const pushUndo = (fn: () => void): void => { G.undo.push(fn); if (G.undo.length > 30) G.undo.shift() }

export function undo(): void {
  const fn = G.undo.pop()
  if (fn) { fn(); refresh() }
}

/** What dropping `held` on hex `k` does. Used on a clone for the preview and on the live state for the drop. */
export function applyDrop(s: State, held: Held, k: string): boolean {
  if (held.src === 'tray') return A.placePiece(s, held.kind, k)
  if (held.src === 'board') return A.movePiece(s, held.from, k)
  const t = s.board[k]
  if (!t) return A.placeGem(s, held.gem, k)
  if (t.kind === 'stack' && t.gem === held.gem) return A.addToStack(s, k, 0.5)
  if (t.kind === 'foundry') return A.setInFoundry(s, k, held.gem, 0.5)
  return false
}

export function updatePreview(): void {
  G.preview = null
  if (!G.held || !G.hover) return
  if (G.held.src === 'board' && G.held.from === G.hover) return
  const clone: State = structuredClone(G.s)
  if (applyDrop(clone, G.held, G.hover)) G.preview = { s: clone, r: computeRates(clone) }
}

export function setHover(k: string | null): void {
  if (k === G.hover) return
  G.hover = k
  updatePreview()
  G.dirty = true
}

export function hold(h: Held | null): void {
  G.held = h
  updatePreview()
  G.dirty = true
}

/** Drop the held piece on hex k. Returns true if it landed. */
export function drop(k: string): boolean {
  const held = G.held
  if (!held) return false
  const wasEmpty = !G.s.board[k]
  if (!applyDrop(G.s, held, k)) return false
  if (held.src === 'board') { const from = held.from; pushUndo(() => { A.movePiece(G.s, k, from) }) }
  else if (wasEmpty) pushUndo(() => { A.removePiece(G.s, k) })
  G.held = null
  G.sel = k
  refresh()
  return true
}

export function rotate(k: string): void {
  if (A.rotatePiece(G.s, k)) { pushUndo(() => { A.rotatePiece(G.s, k, true) }); refresh() }
}

export function remove(k: string): void {
  const p = G.s.board[k]
  if (!p || p.fixed) return
  const copy: Piece = { ...p }
  if (!A.removePiece(G.s, k)) return
  pushUndo(() => {
    if (G.s.board[k] || !G.s.lit[k]) return
    if (copy.kind === 'stack') {
      const n = Math.min(copy.n ?? 0, Math.floor(G.s.stock[copy.gem!]))
      if (n >= 1) { G.s.stock[copy.gem!] -= n; G.s.board[k] = { ...copy, n } }
    } else if (G.s.tray[copy.kind as TrayKind] >= 1) {
      G.s.tray[copy.kind as TrayKind] -= 1
      const back: Piece = { ...copy }
      if (back.setGem) {
        const n = Math.min(back.setN ?? 0, Math.floor(G.s.stock[back.setGem]))
        if (n >= 1) { G.s.stock[back.setGem] -= n; back.setN = n } else { delete back.setGem; delete back.setN }
      }
      G.s.board[k] = back
    }
  })
  if (G.sel === k) G.sel = null
  refresh()
}

/** Run a simple action against the live state and refresh if it happened. */
export function act(fn: (s: State) => boolean): boolean {
  const ok = fn(G.s)
  if (ok) refresh()
  return ok
}

/** A click (press and release on the same hex, no drag). */
export function clickHex(k: string): void {
  const s = G.s
  const p = s.board[k]
  if (p?.kind === 'well' && !s.wellOpen) { act(A.openWell); G.sel = k; return }
  if (p && s.lit[k]) {
    if (G.sel === k && A.isRotatable(p)) rotate(k)
    else G.sel = k
  } else if (A.canLight(s, k)) {
    if (G.sel === k) { const ev: string[] = []; if (act(st => A.lightHex(st, k, ev))) ev.forEach(e => toast(e)) }
    else G.sel = k
  } else if (s.lit[k] || A.onBoard(s, k)) G.sel = k
  else G.sel = null
  G.dirty = true
}
