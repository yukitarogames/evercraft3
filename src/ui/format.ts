const SUFFIX = ['', 'k', 'M', 'B', 'T']

/** Short number: 3 significant digits, k/M/B/T suffixes, exponent past that. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  const a = Math.abs(n)
  if (a < 0.005) return '0'
  if (a < 10) return String(+n.toFixed(2))
  if (a < 100) return String(+n.toFixed(1))
  if (a < 1000) return String(Math.round(n))
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(a) / 3))
  if (a >= 1e15) return n.toExponential(2).replace('+', '')
  const v = n / Math.pow(1000, e)
  return (Math.abs(v) < 10 ? v.toFixed(2) : Math.abs(v) < 100 ? v.toFixed(1) : v.toFixed(0)) + SUFFIX[e]
}

/** Whole gems, as the player counts them. */
export const fmtInt = (n: number): string => fmt(Math.floor(n + 1e-9))

export const signed = (n: number): string => (n < -0.005 ? '' : '+') + fmt(n)

export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'never'
  const s = Math.max(0, Math.round(seconds))
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

export const pct = (v: number): string => `${Math.round(v * 100)}%`
