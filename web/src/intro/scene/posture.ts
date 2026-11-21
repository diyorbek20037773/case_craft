// Qomat (posture) qatlami: Meshy idle klipi ustidan har kadr — personaj tik, viqorli tursin ("osilib qolgan latta" emas).
// Barcha burilishlar PERSONAJ RAMKASIDA (oldi +Z, yuqori +Y, chap qo'l +X) — suyak o'qlariga bog'liq emas:
//   local' = (P⁻¹ · R · Q · R⁻¹ · P) · local,  P — ota suyak dunyo kvaternioni, R — personaj ildizi, Q — delta.
// Ko'p tuzatishlar MOSLASHUVCHAN: klip pozasi o'lchanadi va nishonga tortiladi (cheklangan) — har modelda ishlaydi.
// three.js mixer suyakka faqat qiymat o'zgarganda yozadi, shuning uchun chaqiruvchi mixer.update dan OLDIN
// restorePosture() bilan klip pozasini tiklaydi — tuzatishlar to'planmaydi.
// Ierarxiya (6 GLB da bir xil): Hips > Spine02 > Spine01 > Spine > {neck > Head > headfront, L/R Shoulder > Arm > ForeArm > Hand}
import * as THREE from 'three'

const DEG = Math.PI / 180

/** Sozlash jadvali (gradus). Hammasi shu yerda. */
export const POSTURE = {
  /** Spine02→neck vektorining oldinga og'ishi nishoni — BIND ga nisbatan (manfiy = orqaga, ko'krak yuqoriga).
   *  Bind ga nisbatan, chunki ikki xil Meshy partiyasida suyak joylashuvi farq qiladi (absolyut og'ish -8,6° va +3°). */
  leanTarget: -2,
  leanFixMin: -10,
  leanFixMax: 2,
  /** og'ish tuzatishining qancha qismi qo'llanadi (qolgani — klipning tabiiy nafasi) */
  leanGain: 0.95,
  /** Bosh: bind dagi (tekis nigoh) pitch ga nisbatan shuncha yuqoriga; tuzatish chegarasi */
  headUp: 2,
  headFixMin: -4,
  headFixMax: 14,
  headGain: 0.9,
  /** tuzatishning bo'yin/bosh ulushi */
  neckShare: 0.4,
  /** O'mrov (Shoulder): orqaga va pastga (yelka ochiq, ko'tarilmagan) */
  clavBack: 4,
  clavDown: 3,
  /** Yelka (UpperArm) tanadan og'ishi (frontal tekislikda) nishoni; faqat KAMAYTIRILADI, ko'tarilmaydi */
  armAbdTarget: 11,
  armAbdFixMax: 26,
  /** Tirsak: oldinga tabiiy bukilish nishoni (sagittal), faqat qo'shiladi */
  elbowBend: 12,
  elbowFixMax: 14,
  /** Bilak (ForeArm→Hand) frontal og'ishi nishoni: A-pozadagi "qanot" ko'rinish asosan shundan (yelka o'zi ~8–10°).
   *  Tirsakda Z atrofida ichkariga (faqat kamaytirish) — kaft songa yaqinlashadi */
  foreAbdTarget: 5,
  foreAbdFixMax: 24,
  /** Kaftni sonlarga burish (bilak o'qi atrofida), bilak/qo'l o'rtasida bo'linadi.
   *  Chap/o'ng alohida: klipda o'ng kaft ko'proq oldinga-tashqariga burilgan (lineup skrinshotidan o'lchab tanlangan) */
  palmTwistL: 45,
  palmTwistR: 75,
  palmForeShare: 0.55,
  /** "erkin yon" (kaft ramkasi aniqlanganda): barmoqlar bilak davomidan biroz ichkariga/oldinga, kaft songa va biroz orqaga */
  sideFingerIn: 0.06,
  sideFingerFwd: 0.1,
  sidePalmBack: 0.25,
  /** idle klip tezligi ko'paytiruvchisi (tebranishni tinchlantirish) */
  idleTimeScale: 0.68,
  /** Tizza: bind ga nisbatan bukilish shundan oshsa to'g'rilanadi (son orqaga, boldir oldinga, tovon kompensatsiya),
   *  oyoq cho'zilgani uchun ildiz o'lchab ko'tariladi. Chegarasi — kneeFixMax. */
  kneeTarget: 6,
  kneeFixMax: 20,
  /** Tos: X atrofida oldinga (gradus; son suyaklari teskari — oyoqlar joyida). "Banan" qomat uchun. */
  hipPitch: 0,
} as const

export type PostureTuning = Partial<Record<keyof typeof POSTURE, number>>

/** Rolga xos yengil farqlar */
export const ROLE_POSTURE: Record<string, PostureTuning> = {
  // sudya/prokuror/guvoh — boshqa Meshy partiyasi (idle klipi boshqacha): kaftlar ko'proq oldinga qaragan
  sudya: { leanTarget: -2.5, headUp: 2.5, idleTimeScale: 0.6, palmTwistL: 70, palmTwistR: 90 }, // viqorli, sokin
  // "erkin yon": yelka 4,5°, tirsak 10°, kaft songa (o'ng kaft ~90° burilgan)
  prokuror: { leanTarget: -2, headUp: 3.5, palmTwistL: 75, palmTwistR: 90, armAbdTarget: 4.5, elbowBend: 10, foreAbdTarget: 3 },
  // klip umurtqani bind ga nisbatan ~6,5° orqaga egadi ("banan") — leanFixMax 6 bilan to'liq tortiladi
  himoyachi: { leanTarget: 1, leanFixMax: 8, clavBack: 5, palmTwistR: 88, armAbdTarget: 3.5, elbowBend: 14, foreAbdTarget: 3 }, // ishonchli, ko'krak ochiq
  guvoh: { clavDown: 1.5, headUp: 1.5, idleTimeScale: 0.75, palmTwistL: 75, palmTwistR: 90 }, // biroz tarang
  kotib: { headUp: 2, armAbdTarget: 9, leanTarget: 1, leanFixMax: 8 }, // ozoda
}

/**
 * Qo'l presetlari — applyPosture ichida, umumiy qomatdan KEYIN.
 *  side  — "erkin yon": umumiy qomat qatlami o'zi (ROLE_POSTURE dagi yelka/tirsak nishonlari bilan).
 *  clasp — "qo'llar oldinda birlashgan": yuqori qo'l ~4° yon, ~18° oldinga; tirsak ~76° (gorizontal kesimda bilak
 *          ichkariga — yelkaning ichki burilishi bilan, tirsak o'z o'qida bukiladi); kaftlar tanaga, o'ng qo'l chap ustida.
 * Qo'l HECH QACHON yelkadan baland ko'tarilmaydi (Meshy yelka nuqsoni): yuqori qo'l doim pastga qaragan.
 */
export type ArmPreset = 'side' | 'clasp'
export const CLASP = {
  /** yuqori qo'l: yon (frontal) va oldinga (sagittal) og'ish, gradus */
  abd: 4,
  flex: 5,
  /** o'ng qo'l biroz oldinroq (chap qo'l ustida turishi uchun), gradus */
  rightFlexAdd: 3,
  /** tirsak bukilishi (yuqori qo'l va bilak orasidagi burchak), gradus */
  elbow: 76,
  /** bilak uchi (wrist) o'rta chiziqdan shuncha yonda (m) — kaftlar o'rtada ustma-ust tushadi */
  wristX: 0.06,
  /** ichki burilish chegarasi, gradus */
  innerMax: 80,
  /** kaft yo'nalishi (personaj ramkasida, chap qo'l uchun; o'ngda X teskari): barmoqlar ichkariga va pastga */
  fingerIn: 0.8,
  fingerDown: 0.6,
  fingerFwd: 0.05,
  /** bilakdan kaft yo'nalishiga qancha ergashadi (0 — bilak davomi, 1 — to'liq nishon); bilak bo'g'imini asraydi */
  wristFollow: 0.5,
  /** kaft tekisligi normali: tanaga (orqaga) va biroz yuqoriga */
  palmUp: 0.25,
  /** kaft burilishining bilakka o'tkaziladigan ulushi (bilak bo'g'imi "o'ralib" ketmasin) */
  twistToFore: 0.65,
}
export type ClaspTuning = Partial<typeof CLASP>

/** Rol: qo'l preseti, son yaw (umurtqa qarama-qarshi ~60%) va clasp nozik sozlamalari */
export const ROLE_PRESET: Record<string, { arms: ArmPreset; hipYaw: number; clasp?: ClaspTuning }> = {
  // raund 2 (profil QA): qo'llar tanaga yaqin, kamar/qorin pastida — sim2 (offline) va profil kadri bilan tanlangan
  sudya: { arms: 'clasp', hipYaw: 2.5, clasp: { flex: 0, elbow: 68 } },
  prokuror: { arms: 'side', hipYaw: -2 },
  himoyachi: { arms: 'side', hipYaw: 3 },
  // guvoh: qorin oldinda — tirsak biroz yonga (abd 8) bilaklar qoringa kirmasin
  guvoh: { arms: 'clasp', hipYaw: -3, clasp: { abd: 8, flex: 4, elbow: 60, wristX: 0.065 } },
  // kotib: tos oldinda — bel chizig'ida; o'ng kaft osilib turadi (yassi "silash" emas)
  kotib: { arms: 'clasp', hipYaw: 2, clasp: { flex: 5, elbow: 56, wristX: 0.05, fingerDown: 0.8, fingerIn: 0.6 } },
  sudlanuvchi: { arms: 'side', hipYaw: -2.5 },
}

/** Kaft ramkasi qo'l suyagi LOKAL fazosida: f — barmoqlar yo'nalishi, n — kaft normali (kaft tomonga) */
export type PalmFrame = { f: THREE.Vector3; n: THREE.Vector3 }
type Leg = { up: THREE.Object3D | null; leg: THREE.Object3D | null; foot: THREE.Object3D | null; knee0: number }
type Side = { sign: 1 | -1; clav: THREE.Object3D | null; arm: THREE.Object3D | null; fore: THREE.Object3D | null; hand: THREE.Object3D | null; palm: PalmFrame | null }

export type PostureRig = {
  root: THREE.Object3D
  hips: THREE.Object3D | null
  spine: THREE.Object3D[] // pastdan yuqoriga: Spine02, Spine01, Spine
  neck: THREE.Object3D | null
  head: THREE.Object3D | null
  headfront: THREE.Object3D | null
  sides: Side[]
  legs: Leg[]
  /** ildizning boshlang'ich balandligi (tizza to'g'rilanganda ko'tariladi) */
  rootY0: number
  /** bind dagi bosh pitch (tekis nigoh deb olinadi) */
  headPitch0: number
  /** bind dagi umurtqa og'ishi */
  lean0: number
  touched: THREE.Object3D[]
  clipQ: THREE.Quaternion[]
  hasClip: boolean
  tune: typeof POSTURE
  /** qo'l preseti va uning sozlamalari (dev lineup kadrda o'zgartirishi mumkin) */
  arms: ArmPreset
  clasp: typeof CLASP
  hipYaw: number
  /** oxirgi o'lchovlar (dev/hisobot uchun), gradus */
  measured: Record<string, number>
}

// kadr ichida obyekt yaratilmasin
const _qR = new THREE.Quaternion()
const _qRi = new THREE.Quaternion()
const _qP = new THREE.Quaternion()
const _qD = new THREE.Quaternion()
const _qI = new THREE.Quaternion()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _v = new THREE.Vector3()
const _u = new THREE.Vector3()
const _b2 = new THREE.Vector3()
const AX = new THREE.Vector3(1, 0, 0)
const AY = new THREE.Vector3(0, 1, 0)
const AZ = new THREE.Vector3(0, 0, 1)

/** b - a, personaj ramkasida */
function charVec(a: THREE.Object3D, b: THREE.Object3D, out: THREE.Vector3) {
  a.getWorldPosition(_a)
  b.getWorldPosition(_b)
  return out.subVectors(_b, _a).applyQuaternion(_qRi)
}

/** suyakni personaj ramkasidagi o'q atrofida burish (bolalari bilan matritsalar yangilanadi) */
function turn(bone: THREE.Object3D | null, axisChar: THREE.Vector3, angle: number) {
  // NaN/nol o'q himoyasi: nol o'q bilan setFromAxisAngle birlik bo'lmagan kvaternion beradi (suyak cho'ziladi)
  if (!bone || !bone.parent || !(Math.abs(angle) >= 1e-5) || !(axisChar.lengthSq() > 1e-12)) return
  _qD.setFromAxisAngle(axisChar, angle)
  _qD.premultiply(_qR).multiply(_qI.copy(_qR).invert())
  bone.parent.getWorldQuaternion(_qP)
  _qD.premultiply(_qI.copy(_qP).invert()).multiply(_qP)
  bone.quaternion.premultiply(_qD)
  bone.updateMatrixWorld(true)
}

const pitchOf = (v: THREE.Vector3) => Math.atan2(v.y, Math.hypot(v.x, v.z))

/** Klonlangan (bind pozadagi) ildizdan rig yasaydi. Klip o'ynashidan OLDIN chaqirilsin. */
export function makePostureRig(root: THREE.Object3D, role: string): PostureRig {
  const by = new Map<string, THREE.Object3D>()
  root.traverse((o) => by.set(o.name.toLowerCase(), o))
  const g = (n: string) => by.get(n.toLowerCase()) ?? null
  const side = (s: 'Left' | 'Right', sign: 1 | -1): Side => ({ sign, clav: g(s + 'Shoulder'), arm: g(s + 'Arm'), fore: g(s + 'ForeArm'), hand: g(s + 'Hand'), palm: null })
  const rig: PostureRig = {
    root,
    hips: g('Hips'),
    spine: ['Spine02', 'Spine01', 'Spine'].map(g).filter((o): o is THREE.Object3D => !!o),
    neck: g('neck'),
    head: g('Head'),
    headfront: g('headfront'),
    sides: [side('Left', 1), side('Right', -1)],
    headPitch0: 0,
    lean0: 0,
    touched: [],
    clipQ: [],
    hasClip: false,
    tune: { ...POSTURE, ...(ROLE_POSTURE[role] ?? {}) } as typeof POSTURE,
    arms: ROLE_PRESET[role]?.arms ?? 'side',
    clasp: { ...CLASP, ...(ROLE_PRESET[role]?.clasp ?? {}) },
    hipYaw: ROLE_PRESET[role]?.hipYaw ?? 0,
    legs: (['Left', 'Right'] as const).map((sd) => ({ up: g(sd + 'UpLeg'), leg: g(sd + 'Leg'), foot: g(sd + 'Foot'), knee0: 0 })),
    rootY0: root.position.y,
    measured: { lean: 0, headPitch: 0, abdL: 0, abdR: 0 },
  }
  rig.touched = [
    rig.hips,
    ...rig.spine,
    rig.neck,
    rig.head,
    ...rig.sides.flatMap((s) => [s.clav, s.arm, s.fore, s.hand]),
    ...rig.legs.flatMap((l) => [l.up, l.leg, l.foot]),
  ].filter((o): o is THREE.Object3D => !!o)
  rig.clipQ = rig.touched.map(() => new THREE.Quaternion())
  // bind: tekis nigoh
  root.updateMatrixWorld(true)
  root.getWorldQuaternion(_qR)
  _qRi.copy(_qR).invert()
  if (rig.head && rig.headfront) rig.headPitch0 = pitchOf(charVec(rig.head, rig.headfront, _v))
  const top = rig.neck ?? rig.spine[rig.spine.length - 1]
  if (rig.spine.length && top) rig.lean0 = Math.atan2(charVec(rig.spine[0], top, _v).z, _v.y) / DEG
  for (const s of rig.sides) if (s.hand) s.palm = detectPalm(root, s.hand, s.sign > 0)
  for (const l of rig.legs) l.knee0 = kneeBend(l)
  return rig
}

/**
 * Kaft ramkasini qo'l mesh geometriyasidan aniqlash (bir marta, klonda). Barmoqlar yo'nalishi — qo'lga bog'langan
 * cho'qqilar markazi; kaft tekisligi — shu o'qqa perpendikulyar kesimdagi eng katta yoyilish (bosh barmoq↔jimjiloq);
 * normal ishorasi — BOSH BARMOQ tomonidan (o'ng qo'lda bosh barmoq = f×n, chapda n×f; bosh barmoq proksimal qismda
 * bir tomonga chiqib turadi). Tekshiruv: 5 modelning hammasida bind A-pozada kaftlar tanaga qaragan chiqdi.
 * (Barmoq bukilishi bo'yicha ishora ishonchsiz — 3 modelda teskari chiqdi.)
 */
function detectPalm(root: THREE.Object3D, hand: THREE.Object3D, isLeft: boolean): PalmFrame | null {
  hand.updateWorldMatrix(true, false)
  const inv = new THREE.Matrix4().copy(hand.matrixWorld).invert()
  const pts: number[] = []
  const v = new THREE.Vector3()
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh || !m.skeleton) return
    const bi = m.skeleton.bones.indexOf(hand as THREE.Bone)
    if (bi < 0) return
    const si = m.geometry.getAttribute('skinIndex')
    const sw = m.geometry.getAttribute('skinWeight')
    const count = m.geometry.getAttribute('position')?.count ?? 0
    if (!si || !sw) return
    m.updateWorldMatrix(true, false)
    for (let i = 0; i < count; i++) {
      let best = -1
      let bw = -1
      for (let k = 0; k < 4; k++) {
        const wk = sw.getComponent(i, k)
        if (wk > bw) {
          bw = wk
          best = si.getComponent(i, k)
        }
      }
      if (best !== bi || bw < 0.6) continue
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(inv)
      pts.push(v.x, v.y, v.z)
    }
  })
  const n = pts.length / 3
  if (n < 60) return null
  const c = new THREE.Vector3()
  for (let i = 0; i < pts.length; i += 3) c.add(v.set(pts[i], pts[i + 1], pts[i + 2]))
  c.divideScalar(n)
  const f = c.clone().normalize()
  if (!Number.isFinite(f.x) || f.lengthSq() < 0.5) return null
  const e1 = new THREE.Vector3(1, 0, 0)
  if (Math.abs(e1.dot(f)) > 0.9) e1.set(0, 0, 1)
  orthoTo(e1, f)
  const e2 = new THREE.Vector3().crossVectors(f, e1)
  let sxx = 0
  let syy = 0
  let sxy = 0
  let dmin = Infinity
  let dmax = -Infinity
  for (let i = 0; i < pts.length; i += 3) {
    v.set(pts[i] - c.x, pts[i + 1] - c.y, pts[i + 2] - c.z)
    const x = v.dot(e1)
    const y = v.dot(e2)
    sxx += x * x
    syy += y * y
    sxy += x * y
    const d = pts[i] * f.x + pts[i + 1] * f.y + pts[i + 2] * f.z
    dmin = Math.min(dmin, d)
    dmax = Math.max(dmax, d)
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const wide = e1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e2, Math.sin(ang))
  const nrm = new THREE.Vector3().crossVectors(f, wide).normalize()
  // bosh barmoq tomoni: proksimal yarmi uchlariga nisbatan qayerga siljigan
  const thumb = isLeft ? new THREE.Vector3().crossVectors(nrm, f) : new THREE.Vector3().crossVectors(f, nrm)
  let prox = 0
  let np = 0
  let far = 0
  let nf = 0
  const span = dmax - dmin
  for (let i = 0; i < pts.length; i += 3) {
    const d = pts[i] * f.x + pts[i + 1] * f.y + pts[i + 2] * f.z
    const t = (pts[i] - c.x) * thumb.x + (pts[i + 1] - c.y) * thumb.y + (pts[i + 2] - c.z) * thumb.z
    if (d < dmin + 0.5 * span) {
      prox += t
      np++
    } else if (d > dmin + 0.75 * span) {
      far += t
      nf++
    }
  }
  if (!np || !nf) return null
  if (prox / np - far / nf < 0) nrm.negate()
  return { f, n: orthoTo(nrm, f) }
}

/** Tizza bukilishi (gradus, oldinga musbat): son va boldirning sagittal og'ishlari farqi */
function kneeBend(l: Leg) {
  if (!l.up || !l.leg || !l.foot) return 0
  charVec(l.up, l.leg, _a2)
  charVec(l.leg, l.foot, _b3)
  return (Math.atan2(_a2.z, -_a2.y) - Math.atan2(_b3.z, -_b3.y)) / DEG
}
const _a2 = new THREE.Vector3()
const _b3 = new THREE.Vector3()
const _ank = new THREE.Vector3()

function ankleY(rig: PostureRig) {
  let y = 0
  let n = 0
  for (const l of rig.legs)
    if (l.foot) {
      l.foot.getWorldPosition(_ank)
      y += _ank.y
      n++
    }
  return n ? y / n : 0
}

function fixKnees(rig: PostureRig) {
  const T = rig.tune
  rig.root.position.y = rig.rootY0
  rig.root.updateMatrixWorld(true)
  const before = ankleY(rig)
  let any = false
  for (const l of rig.legs) {
    if (!l.up || !l.leg || !l.foot) continue
    const fix = THREE.MathUtils.clamp(kneeBend(l) - l.knee0 - T.kneeTarget, 0, T.kneeFixMax) * DEG
    if (fix < 1e-4) continue
    // son orqaga (X musbat — pastga qaragan suyakni orqaga), boldir oldinga, tovon — taglik polga parallel qolsin
    turn(l.up, AX, fix * 0.5)
    turn(l.leg, AX, -fix)
    turn(l.foot, AX, fix * 0.5)
    any = true
  }
  if (!any) return
  const drop = before - ankleY(rig)
  if (Math.abs(drop) > 1e-5) {
    rig.root.position.y = rig.rootY0 + drop
    rig.root.updateMatrixWorld(true)
  }
}

/** mixer.update DAN OLDIN: o'tgan kadrdagi tuzatishlarni olib tashlash (klip pozasini tiklash) */
export function restorePosture(rig: PostureRig) {
  if (!rig.hasClip) return
  const { touched, clipQ } = rig
  for (let i = 0; i < touched.length; i++) touched[i].quaternion.copy(clipQ[i])
}

/** mixer.update DAN KEYIN: klip pozasini saqlab, qomat tuzatishlarini qo'llash */
export function applyPosture(rig: PostureRig) {
  const T = rig.tune
  for (let i = 0; i < rig.touched.length; i++) rig.clipQ[i].copy(rig.touched[i].quaternion)
  rig.hasClip = true
  const { root } = rig
  root.updateMatrixWorld(true)
  root.getWorldQuaternion(_qR)
  _qRi.copy(_qR).invert()

  // 0) Son yaw (rolga xos, 2–3°): tos bir oz buriladi, ko'krak ~60% qaytadi — hamma bir xil "manekendek" turmasin
  if (rig.hips && rig.hipYaw) {
    turn(rig.hips, AY, rig.hipYaw * DEG)
    const back = (-rig.hipYaw * 0.6 * DEG) / Math.max(1, rig.spine.length)
    for (const b of rig.spine) turn(b, AY, back)
  }

  // 0b) Tos oldinga (ixtiyoriy) — sonlar teskari, oyoqlar joyida
  if (rig.hips && T.hipPitch) {
    turn(rig.hips, AX, T.hipPitch * DEG)
    for (const l of rig.legs) turn(l.up, AX, -T.hipPitch * DEG)
  }
  // 0c) Tizza: klip tizzani bukkan bo'lsa (masalan guvoh idle_a) to'g'rilash; oyoq polda qolishi uchun ildiz ko'tariladi
  fixKnees(rig)

  // 1) Umurtqa: oldinga og'ishni tikka tortish (X o'qi atrofida manfiy = orqaga/ko'krak yuqoriga)
  const top = rig.neck ?? rig.spine[rig.spine.length - 1]
  if (rig.spine.length && top) {
    const lean = Math.atan2(charVec(rig.spine[0], top, _v).z, _v.y) / DEG
    rig.measured.lean = lean - rig.lean0
    const fix = THREE.MathUtils.clamp(rig.lean0 + T.leanTarget - lean, T.leanFixMin, T.leanFixMax) * T.leanGain
    const per = (fix * DEG) / rig.spine.length
    for (const b of rig.spine) turn(b, AX, per)
  }

  // 2) O'mrov: orqaga (Y) va pastga (Z)
  for (const s of rig.sides) {
    turn(s.clav, AY, s.sign * T.clavBack * DEG)
    turn(s.clav, AZ, -s.sign * T.clavDown * DEG)
  }

  // 3) Bo'yin/bosh: nigoh tekis (bind pitch + headUp). Pitch yuqoriga = X atrofida manfiy
  if (rig.head && rig.headfront) {
    const p = pitchOf(charVec(rig.head, rig.headfront, _v))
    rig.measured.headPitch = (p - rig.headPitch0) / DEG
    const want = rig.headPitch0 + T.headUp * DEG
    const fix = THREE.MathUtils.clamp((want - p) / DEG, T.headFixMin, T.headFixMax) * T.headGain * DEG
    turn(rig.neck, AX, -fix * T.neckShare)
    turn(rig.head, AX, -fix * (1 - T.neckShare))
  }

  // 4) Qo'llar
  for (const s of rig.sides) {
    if (!s.arm || !s.fore) continue
    // 4a) yelka: tanaga yaqin (faqat kamaytirish). Chap (+X) qo'lni pastga = Z atrofida manfiy
    charVec(s.arm, s.fore, _v)
    const abd = Math.atan2(s.sign * _v.x, -_v.y) / DEG
    if (s.sign > 0) rig.measured.abdL = abd
    else rig.measured.abdR = abd
    if (s.hand) charVec(s.fore, s.hand, _b2)
    rig.measured[s.sign > 0 ? 'foreL' : 'foreR'] = Math.atan2(s.sign * _b2.x, -_b2.y) / DEG
    const drop = THREE.MathUtils.clamp(abd - T.armAbdTarget, 0, T.armAbdFixMax)
    turn(s.arm, AZ, -s.sign * drop * DEG)
    if (!s.hand) continue
    // 4b) tirsak: oldinga yengil bukilish (sagittal). Qo'lni oldinga = X atrofida manfiy
    charVec(s.arm, s.fore, _u)
    charVec(s.fore, s.hand, _v)
    const bend = (Math.atan2(_v.z, -_v.y) - Math.atan2(_u.z, -_u.y)) / DEG
    const add = THREE.MathUtils.clamp(T.elbowBend - bend, 0, T.elbowFixMax)
    turn(s.fore, AX, -add * DEG)
    // 4b') bilak "qanoti": ichkariga (frontal), faqat kamaytirish
    charVec(s.fore, s.hand, _v)
    const foreAbd = Math.atan2(s.sign * _v.x, -_v.y) / DEG
    const inward = THREE.MathUtils.clamp(foreAbd - T.foreAbdTarget, 0, T.foreAbdFixMax)
    turn(s.fore, AZ, -s.sign * inward * DEG)
    // 4c) kaft sonlarga. Kaft ramkasi aniqlangan bo'lsa — aniq orientatsiya (barmoqlar bilak davomida, biroz ichkariga
    // va oldinga; kaft songa, biroz orqaga). Aks holda eski usul: bilak o'qi atrofida jadvaldagi burchak.
    if (s.palm && rig.arms === 'side') {
      charVec(s.fore, s.hand, _fT).normalize()
      _fT.x += -s.sign * T.sideFingerIn
      _fT.z += T.sideFingerFwd
      _fT.normalize()
      orthoTo(_nT.set(-s.sign, 0, -T.sidePalmBack), _fT)
      orientHand(s, _fT, _nT, T.palmForeShare)
      continue
    }
    charVec(s.hand, s.fore, _u).normalize()
    const tw = -s.sign * (s.sign > 0 ? T.palmTwistL : T.palmTwistR) * DEG
    turn(s.fore, _u, tw * T.palmForeShare)
    charVec(s.hand, s.fore, _u).normalize()
    turn(s.hand, _u, tw * (1 - T.palmForeShare))
  }

  // 5) "Qo'llar oldinda birlashgan" preseti (umumiy qomat kafti songa qaragan holatdan kalibrlanadi)
  if (rig.arms === 'clasp') applyClasp(rig)
}

// ---------- clasp yordamchilari ----------
const _rootP = new THREE.Vector3()
const _S = new THREE.Vector3()
const _E = new THREE.Vector3()
const _W = new THREE.Vector3()
const _uW = new THREE.Vector3()
const _v0 = new THREE.Vector3()
const _w0 = new THREE.Vector3()
const _f = new THREE.Vector3()
const _fBest = new THREE.Vector3()
const _cur = new THREE.Vector3()
const _ax = new THREE.Vector3()
const _f0 = new THREE.Vector3()
const _n0 = new THREE.Vector3()
const _fT = new THREE.Vector3()
const _nT = new THREE.Vector3()
const _qH = new THREE.Quaternion()
const _qF = new THREE.Quaternion()
const _qB = new THREE.Quaternion()
const _qT = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _x3 = new THREE.Vector3()

/** suyak ildizdan personaj ramkasidagi nuqta */
function charPos(o: THREE.Object3D, out: THREE.Vector3) {
  o.getWorldPosition(out)
  return out.sub(_rootP).applyQuaternion(_qRi)
}
/** suyakning personaj ramkasidagi kvaternioni */
function charQuat(o: THREE.Object3D, out: THREE.Quaternion) {
  o.getWorldQuaternion(out)
  return out.premultiply(_qRi)
}
/** suyakka personaj ramkasidagi orientatsiyani berish (bolalari yangilanadi) */
function setCharQuat(o: THREE.Object3D, q: THREE.Quaternion) {
  if (!o.parent) return
  o.parent.getWorldQuaternion(_qP)
  o.quaternion.copy(_qP).invert().multiply(_qR).multiply(q)
  o.updateMatrixWorld(true)
}
/** cur (birlik) yo'nalishni want (birlik) ga eng qisqa burilish bilan */
function aim(bone: THREE.Object3D, cur: THREE.Vector3, want: THREE.Vector3) {
  _ax.crossVectors(cur, want)
  const s = _ax.length()
  if (s < 1e-6) return
  turn(bone, _ax.divideScalar(s), Math.atan2(s, cur.dot(want)))
}
/** ortonormal bazis (f, n, f×n) dan kvaternion */
function basisQuat(f: THREE.Vector3, n: THREE.Vector3, out: THREE.Quaternion) {
  _x3.crossVectors(f, n)
  _m.makeBasis(f, n, _x3)
  return out.setFromRotationMatrix(_m)
}
/** n ni f ga perpendikulyar qilib normallash */
function orthoTo(n: THREE.Vector3, f: THREE.Vector3) {
  return n.addScaledVector(f, -n.dot(f)).normalize()
}

/** Kaftni personaj ramkasidagi nishonga: barmoqlar fT, kaft normali nT (ikkalasi birlik, o'zaro perpendikulyar) */
function orientHand(s: Side, fT: THREE.Vector3, nT: THREE.Vector3, twistShare: number) {
  if (!s.palm) return
  // q · fL = fT, q · nL = nT  =>  q = B(fT, nT) · B(fL, nL)⁻¹
  basisQuat(fT, nT, _qT)
  basisQuat(s.palm.f, s.palm.n, _qB)
  _qT.multiply(_qB.invert())
  applyHandQuat(s, _qT, twistShare)
}

/** Kaftga personaj ramkasidagi orientatsiya; bilak o'qi atrofidagi burilishning bir qismi bilakka o'tadi (bo'g'im o'ralmasin) */
function applyHandQuat(s: Side, qHand: THREE.Quaternion, twistShare: number) {
  if (!s.fore || !s.hand) return
  charQuat(s.fore, _qF)
  _qB.copy(_qF).invert().multiply(qHand) // bilakka nisbatan kaft
  const twist = 2 * Math.atan2(_qB.y, _qB.w)
  const tw = Math.atan2(Math.sin(twist), Math.cos(twist)) * twistShare
  if (Math.abs(tw) > 1e-4) {
    s.fore.quaternion.multiply(_qB.setFromAxisAngle(AY, tw))
    s.fore.updateMatrixWorld(true)
  }
  setCharQuat(s.hand, qHand)
}

function applyClasp(rig: PostureRig) {
  const C = rig.clasp
  rig.root.getWorldPosition(_rootP)
  const [L, R] = rig.sides
  if (!L.arm || !R.arm) return
  // o'rta chiziq — ikki yelka bo'g'imi o'rtasi
  const midX = (charPos(L.arm, _S).x + charPos(R.arm, _E).x) / 2
  for (const s of rig.sides) {
    if (!s.arm || !s.fore || !s.hand) continue
    charPos(s.arm, _S)
    charPos(s.fore, _E)
    charPos(s.hand, _W)
    const a = _E.distanceTo(_S)
    const b = _W.distanceTo(_E)
    if (a < 1e-4 || b < 1e-4) continue

    // kalibrlash: umumiy qomatda kaft songa qaragan (normal -sign·X), barmoqlar bilak davomida
    _f0.subVectors(_W, _E).normalize()
    orthoTo(_n0.set(-s.sign, 0, 0), _f0)
    charQuat(s.hand, _qH)

    // 1) yuqori qo'l yo'nalishi (pastga, biroz yonga va oldinga)
    const flex = (C.flex + (s.sign < 0 ? C.rightFlexAdd : 0)) * DEG
    const abd = C.abd * DEG
    _uW.set(s.sign * Math.sin(abd) * Math.cos(flex), -Math.cos(abd) * Math.cos(flex), Math.sin(flex)).normalize()
    // 2) bilak: tirsakda `elbow` gradus bukilgan, sagittal tekislikdan ichkariga theta (yelka ichki burilishi)
    _v0.set(0, 0, 1).addScaledVector(_uW, -_uW.z).normalize()
    _w0.crossVectors(_uW, _v0).normalize()
    if (_w0.x * -s.sign < 0) _w0.negate()
    const bend = C.elbow * DEG
    const wantX = midX + s.sign * C.wristX
    let best = 0
    let bestErr = Infinity
    for (let th = 0; th <= C.innerMax; th += 2) {
      const t = th * DEG
      _f.copy(_v0).multiplyScalar(Math.cos(t)).addScaledVector(_w0, Math.sin(t)).multiplyScalar(Math.sin(bend)).addScaledVector(_uW, Math.cos(bend))
      const err = Math.abs(_S.x + a * _uW.x + b * _f.x - wantX)
      if (err < bestErr) {
        bestErr = err
        best = t
        _fBest.copy(_f)
      }
    }

    // yuqori qo'lni nishonga, so'ng o'z o'qi atrofida ichkariga (tirsak bukilish tekisligi bilak bilan birga buriladi)
    _cur.subVectors(_E, _S).normalize()
    aim(s.arm, _cur, _uW)
    turn(s.arm, _uW, s.sign * best)
    // bilakni nishonga
    charPos(s.fore, _E)
    charPos(s.hand, _W)
    _cur.subVectors(_W, _E).normalize()
    aim(s.fore, _cur, _fBest)

    // 3) kaft: barmoqlar ichkariga-pastga, kaft tanaga
    _fT.set(-s.sign * C.fingerIn, -C.fingerDown, C.fingerFwd).normalize()
    _fT.lerp(_fBest, 1 - C.wristFollow).normalize()
    orthoTo(_nT.set(0, C.palmUp, -1), _fT)
    if (s.palm) orientHand(s, _fT, _nT, C.twistToFore)
    else {
      // zaxira: umumiy qomatdagi kaft songa qaragan deb kalibrlash
      basisQuat(_fT, _nT, _qT)
      basisQuat(_f0, _n0, _qB)
      _qT.multiply(_qB.invert()).multiply(_qH)
      applyHandQuat(s, _qT, C.twistToFore)
    }
    rig.measured[s.sign > 0 ? 'innerL' : 'innerR'] = best / DEG
  }
}

/** Nigoh: yaw/pitch (radian, personaj ramkasida) ni umurtqa/bo'yin/bosh orasida bo'lish. Qomatdan KEYIN chaqirilsin. */
export function applyLook(rig: PostureRig, yaw: number, pitch: number, shares: readonly [number, number, number]) {
  if (Math.abs(yaw) < 1e-5 && Math.abs(pitch) < 1e-5) return
  rig.root.getWorldQuaternion(_qR)
  _qRi.copy(_qR).invert()
  // kadr ichida massiv yaratilmasin: 0 — umurtqa (yuqori), 1 — bo'yin, 2 — bosh
  for (let i = 0; i < 3; i++) {
    const b = i === 0 ? (rig.spine[rig.spine.length - 1] ?? null) : i === 1 ? rig.neck : rig.head
    if (!b) continue
    // ichki: pitch (yuqoriga = X atrofida manfiy), tashqi: yaw
    turn(b, AX, -pitch * shares[i])
    turn(b, AY, yaw * shares[i])
  }
}

/** Boshdan nishonga yaw/pitch (radian, personaj ramkasida) */
export function lookAngles(rig: PostureRig, target: THREE.Vector3, out: { yaw: number; pitch: number }) {
  if (!rig.head) return out
  rig.root.getWorldQuaternion(_qR)
  _qRi.copy(_qR).invert()
  rig.head.getWorldPosition(_a)
  _v.subVectors(target, _a).applyQuaternion(_qRi)
  out.yaw = Math.atan2(_v.x, _v.z)
  out.pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z))
  return out
}

/**
 * Kiyimdagi mis rangli "tirnalish" chiziqlari. Sabab (tekshirildi): Meshy atlasi yuzlab mayda UV orollaridan iborat va
 * orollar orasida PADDING YO'Q (bo'shliq qora). Mipmap darajalarida qo'shni orol ranglari (teri, qora bo'shliq)
 * chok bo'ylab aralashib ketadi -> to'q kiyimda ingichka mis/oq chiziqlar. Isbot: dev lineup da mipmap o'chirilganda
 * chiziqlar butunlay yo'qoldi; metalness=0 va roughness pastki chegarasi yordam bermadi.
 * Runtime yechim: personaj teksturalarida mipmap yo'q (LinearFilter). To'g'ri yechim — GLB teksturalarini chok
 * kengaytirish (dilation/padding) bilan qayta eksport qilish; shunda mipmap qaytariladi.
 * Metalness baribir 0 (Meshy BakedMaterial yog'och/matoni metalldek qilmasin).
 */
export function fixClothMaterial(mat: THREE.MeshStandardMaterial, dropRoughnessMap = false) {
  mat.metalness = 0
  mat.metalnessMap = null
  if (dropRoughnessMap) {
    mat.roughnessMap = null
    mat.roughness = 0.8
  }
  for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'aoMap'] as const) {
    const t = mat[k]
    // tekstura useGLTF keshida umumiy — bir marta o'zgartiriladi
    if (!t || t.userData.introNoMip) continue
    t.userData.introNoMip = true
    t.generateMipmaps = false
    t.minFilter = THREE.LinearFilter
    t.needsUpdate = true
  }
  mat.needsUpdate = true
}

/** Joriy pozani o'lchash (o'zgartirmaydi) — dev tekshiruvi uchun, gradus */
export function measurePosture(rig: PostureRig) {
  rig.root.updateMatrixWorld(true)
  rig.root.getWorldQuaternion(_qR)
  _qRi.copy(_qR).invert()
  const out: Record<string, number> = {}
  const top = rig.neck ?? rig.spine[rig.spine.length - 1]
  if (rig.spine.length && top) out.lean = Math.atan2(charVec(rig.spine[0], top, _v).z, _v.y) / DEG - rig.lean0
  if (rig.head && rig.headfront) out.headPitch = (pitchOf(charVec(rig.head, rig.headfront, _v)) - rig.headPitch0) / DEG
  for (const s of rig.sides) {
    if (!s.arm || !s.fore || !s.hand) continue
    const k = s.sign > 0 ? 'L' : 'R'
    charVec(s.arm, s.fore, _u)
    out['abd' + k] = Math.atan2(s.sign * _u.x, -_u.y) / DEG
    charVec(s.fore, s.hand, _v)
    out['elbow' + k] = (Math.atan2(_v.z, -_v.y) - Math.atan2(_u.z, -_u.y)) / DEG
    out['fore' + k] = Math.atan2(s.sign * _v.x, -_v.y) / DEG
    // yuqori qo'lning oldinga og'ishi va tirsakning haqiqiy (3D) bukilishi
    out['flex' + k] = Math.atan2(_u.z, -_u.y) / DEG
    out['elb3' + k] = _u.angleTo(_v) / DEG
  }
  return out
}
