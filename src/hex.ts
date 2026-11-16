// Axial hex coordinates, pointy-top. Direction 0 is east; +1 turns 60° counter-clockwise on screen.
export const DIRS: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

export const key = (q: number, r: number): string => `${q},${r}`

export const parse = (k: string): [number, number] => {
  const i = k.indexOf(',')
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))]
}

export const hexDist = (q: number, r: number): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2

export const ring = (R: number): [number, number][] => {
  const out: [number, number][] = []
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (Math.abs(q + r) <= R) out.push([q, r])
  return out
}

export const neighbors = (k: string): string[] => {
  const [q, r] = parse(k)
  return DIRS.map(d => key(q + d[0], r + d[1]))
}

export const turnDir = (dir: number, turn: number): number => (((dir + turn) % 6) + 6) % 6
