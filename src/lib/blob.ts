// Blob outlines for the page decoration (components/blobs.tsx) and the goal
// illustrations (components/goal-art.tsx). Pure.

// Seeded random, so the shapes are the same on every render (and server = client).
export function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// A closed blob through `points` points around a circle, each pushed in or out a
// little, smoothed with Catmull-Rom curves. Same seed → same point count and
// command structure, which is what lets <animate> morph between variants.
export function blob(seed: number, points = 8, radius = 70, wobble = 14) {
  const rnd = random(seed)
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2
    const r = radius + (rnd() * 2 - 1) * wobble
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
  const p = (i: number) => pts[(i + points) % points]
  const f = (n: number) => n.toFixed(1)
  let d = `M${f(p(0)[0])},${f(p(0)[1])}`
  for (let i = 0; i < points; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`
  }
  return d + "Z"
}
