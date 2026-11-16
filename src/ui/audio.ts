// Glass chimes: each finished craft plays a note pitched by gem tier on a pentatonic scale.
const NOTES = [523.25, 659.25, 783.99, 1046.5, 1174.66]
const MIN_GAP = 0.16
let ctx: AudioContext | null = null
let last = 0

/** Call from a user gesture: browsers only start audio after one. */
export function unlockAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return }
  try { ctx = new AudioContext() } catch { ctx = null }
}

export function chime(tier: number): void {
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  if (now - last < MIN_GAP) return
  last = now
  const osc = ctx.createOscillator(), gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = NOTES[(tier - 1) % NOTES.length] * (Math.random() < 0.25 ? 2 : 1)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.05, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 1)
}
