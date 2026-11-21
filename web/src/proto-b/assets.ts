// Assetlar build vaqtida aniqlanadi: assets/ papkasida qaysi fayl bo'lsa, o'shani ishlatamiz.
// Egasi keyinroq <rol>-mouth-0/1/2, <rol>-blink, <rol>-idle/-talk.mp4 qo'shsa — `tools/prepare_assets.py`
// ni ishga tushirish kifoya: kod o'zi yuqori rejimga o'tadi (video > og'iz rasmlari > prosedural).
import faces from './faces.json'

const files = import.meta.glob('./assets/*.{webp,jpg,png,mp3,mp4}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export function asset(name: string): string | undefined {
  return files[`./assets/${name}`]
}

export type Role = 'sudya' | 'prokuror' | 'kotib' | 'guvoh' | 'himoyachi' | 'sudlanuvchi'
export const ROLES: Role[] = ['sudya', 'prokuror', 'kotib', 'guvoh', 'himoyachi', 'sudlanuvchi']

/** Animatsiya manbasini majburlash (solishtirish uchun): ?anim=video | variants | procedural */
export type AnimMode = 'auto' | 'video' | 'variants' | 'procedural'
const animParam = new URLSearchParams(location.search).get('anim')
export const ANIM: AnimMode =
  animParam === 'video' || animParam === 'variants' || animParam === 'procedural' ? animParam : 'auto'

/** guvoh-think-shake.mp4: bosh chayqash ~1,8–3,1 s, gapira boshlashi ~3,1 s (kadrlar tahlili) */
export const THINK_SPEAK_AT = 3.1

export type FaceRig = {
  eyes: [number, number, number, number][]
  mouth: { x: number; seam: number; w: number; chin: number; jawW: number; curve: number }
  focus: [number, number]
  variantOffset: [number, number]
}

export type RoleAssets = {
  portrait: string
  mouth: [string, string, string] | null
  blink: string | null
  idleVideo: string | null
  talkVideo: string | null
  thinkVideo: string | null
  rig: FaceRig
}

function pick(...names: string[]): string | null {
  for (const n of names) {
    const u = asset(n)
    if (u) return u
  }
  return null
}

export function roleAssets(role: Role): RoleAssets {
  const m0 = pick(`${role}-mouth-0.webp`, `${role}-mouth-0.jpg`, `${role}-mouth-0.png`)
  const m1 = pick(`${role}-mouth-1.webp`, `${role}-mouth-1.jpg`, `${role}-mouth-1.png`)
  const m2 = pick(`${role}-mouth-2.webp`, `${role}-mouth-2.jpg`, `${role}-mouth-2.png`)
  const portrait = pick(`${role}-portret.webp`, `${role}-portret.jpg`)
  if (!portrait) throw new Error(`portret topilmadi: ${role}`)
  const useVideo = ANIM === 'auto' || ANIM === 'video'
  const useImages = ANIM !== 'procedural'
  return {
    portrait,
    // 3 holatning hammasi bo'lsagina variant rejimi; aks holda prosedural
    mouth: !useImages ? null : m0 && m1 && m2 ? [m0, m1, m2] : m1 && m2 ? [portrait, m1, m2] : null,
    blink: useImages ? pick(`${role}-blink.webp`, `${role}-blink.jpg`, `${role}-blink.png`) : null,
    idleVideo: useVideo ? pick(`${role}-idle.mp4`) : null,
    talkVideo: useVideo ? pick(`${role}-talk.mp4`) : null,
    thinkVideo: useVideo ? pick(`${role}-think-shake.mp4`) : null,
    rig: (faces as unknown as Record<Role, FaceRig>)[role],
  }
}

export const PANO = {
  small: asset('zal-360-2048.jpg')!,
  large: asset('zal-360-4096.jpg')!,
  introVideo: asset('zal-intro.mp4') ?? null,
}

export type WideId = 'majlis' | 'majlis-guvoh' | 'majlis-sudya' | 'himoyachidan' | 'yon'
type Wide = { src: string; focus: string; from: number; to: number; label: string }
const majlis = asset('zal-majlis.webp')
const himoyachidan = asset('zal-himoyachidan.webp')!
const yon = asset('zal-yon.webp')!
// odamlar o'tirgan kadr bo'lmasa — bo'sh zal kadrlariga tushamiz
export const WIDE: Record<WideId, Wide> = {
  majlis: { src: majlis ?? himoyachidan, focus: '50% 45%', from: 1, to: 1.06, label: 'Sud majlisi, himoyachi o‘rnidan' },
  'majlis-guvoh': { src: majlis ?? himoyachidan, focus: '84% 48%', from: 1.04, to: 1.12, label: 'Guvoh minbar ortida' },
  'majlis-sudya': { src: majlis ?? yon, focus: '50% 38%', from: 1.1, to: 1.18, label: 'Raislik qiluvchi' },
  himoyachidan: { src: himoyachidan, focus: '50% 45%', from: 1, to: 1.07, label: 'Bo‘sh zal, himoyachi o‘rnidan' },
  yon: { src: yon, focus: '70% 45%', from: 1, to: 1.07, label: 'Bo‘sh zal, yon tomondan' },
}

export const AUDIO = {
  savol: asset('himoyachi-savol.mp3') ?? null,
  javob: asset('guvoh-javob.mp3') ?? null,
  sudya: asset('sudya-soz.mp3') ?? null,
}
