// "Kamera operatori": portretdan qaysi to'rtburchak ko'rinishini hisoblaydi (yuz kadrda yuqori uchdan birda).
export type Rect = { x: number; y: number; w: number; h: number }

export function frameRect(sw: number, sh: number, imgAspect: number, focus: [number, number], zoom: number): Rect {
  const as = sw / Math.max(1, sh)
  const portraitScreen = as < 1
  let w = portraitScreen ? 0.5 : 1
  let h = (w * imgAspect) / as
  if (h > 1) {
    h = 1
    w = as / imgAspect
  }
  if (w > 1) {
    w = 1
    h = imgAspect / as
  }
  w /= zoom
  h /= zoom
  const ty = portraitScreen ? 0.3 : 0.38
  const x = clamp(focus[0] - w / 2, 0, 1 - w)
  const y = clamp(focus[1] - ty * h, 0, 1 - h)
  return { x, y, w, h }
}

export function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v))
}

export function easeInOut(t: number) {
  const c = clamp(t, 0, 1)
  return c * c * (3 - 2 * c)
}
