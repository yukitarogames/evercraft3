import './styles.css'
import { LAYERS } from './config'
import { G, hold, refresh, remove, rotate, setState, toast, undo, updatePreview } from './game'
import { advance } from './sim/step'
import { MAX_OFFLINE_SECONDS, loadLocal, saveLocal } from './state'
import { Board } from './ui/board'
import { closeModal, endDialog, initPanels, modalOpen, offlineDialog, renderPanels } from './ui/panels'

const SAVE_EVERY_MS = 5000
const PANEL_EVERY_MS = 250
const PREVIEW_EVERY_MS = 500
const OFFLINE_NOTICE_SECONDS = 60

// ---- load, then catch up on time away ----
const loaded = loadLocal()
if (loaded) {
  const away = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - loaded.lastTs) / 1000))
  const before = loaded.banked
  const ev: string[] = []
  advance(loaded, away, ev)
  loaded.lastTs = Date.now()
  setState(loaded)
  ev.forEach(e => toast(e, 10))
  if (away >= OFFLINE_NOTICE_SECONDS && loaded.wellOpen) offlineDialog(away, loaded.banked - before)
} else refresh()

const board = new Board(document.getElementById('board') as HTMLCanvasElement)
initPanels()

// Debug hook for playtesting from the console: __ec3.G.s is the live state, __ec3.skip(60) advances a minute.
;(window as unknown as Record<string, unknown>).__ec3 = { G, skip: (seconds: number) => { advance(G.s, seconds); refresh() } }

const save = (): void => { G.s.lastTs = Date.now(); saveLocal(G.s) }
window.addEventListener('beforeunload', save)
document.addEventListener('visibilitychange', () => { if (document.hidden) save() })

window.addEventListener('keydown', e => {
  const t = e.target as HTMLElement
  if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
  if (e.key === 'Escape') { if (modalOpen()) closeModal(); else if (G.held) hold(null); else { G.sel = null; G.dirty = true } }
  else if (modalOpen()) return
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
  else if (e.ctrlKey || e.metaKey || e.altKey) return
  else if (e.key.toLowerCase() === 'r' && G.sel) rotate(G.sel)
  else if ((e.key === 'Delete' || e.key === 'Backspace') && G.sel) { e.preventDefault(); remove(G.sel) }
})

// ---- game loop: simulate, then draw. Time away from the tab is caught up from the wall clock. ----
let lastWall = Date.now()
let lastSave = performance.now()
let lastPanels = 0
let lastPreview = 0

function frame(ts: number): void {
  const wall = Date.now()
  const dt = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (wall - lastWall) / 1000))
  lastWall = wall
  const ev: string[] = []
  G.r = advance(G.s, dt, ev)
  if (ev.length) { ev.forEach(e => toast(e, 9)); G.dirty = true }

  const L = LAYERS[G.s.layer]
  if (!LAYERS[G.s.layer + 1] && !G.s.endSeen && G.s.banked >= L.goal) { G.s.endSeen = true; endDialog() }

  if (G.held && G.hover && ts - lastPreview > PREVIEW_EVERY_MS) { lastPreview = ts; updatePreview() }
  board.draw(ts, Math.min(dt, 0.25))
  if (G.dirty || ts - lastPanels > PANEL_EVERY_MS) { lastPanels = ts; renderPanels() }
  if (ts - lastSave > SAVE_EVERY_MS) { lastSave = ts; save() }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
