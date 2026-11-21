// Kamera: holat (phase/selected) -> kadr. Kadr o'zgarganda joriy holatdan yangi kadrga eased tween
// (title->select 1,2 s, tanlov 0,8 s, launch 1,4 s ease-in). Tween tugagach kadrni bevosita kuzatadi
// (titulda kadrning o'zi sekin suzadi). prefers-reduced-motion: suzish yo'q, o'tishlar ~0,3 s.
//
// Kadrlar (1440×900 da tekshirilgan raqamlar, ekran % — yuqoridan):
//  title/mode — kamera balandroq (3,2 m) va pastga qaraydi: stol usti 43–46%, supa zinasi ~58% — stol butunlay
//               CASECRAFT yozuvi ortida/ustida, shior (60–67%) va Boshlash'dan kesib o'tmaydi; gerb ramkasi 20–26%
//               (UI emblema ortida); pastda (62–100%) gilam va yaltiroq pol.
//               Dolly 2 m (avval 2,6 m) va dolly paytida target pasayadi — stol kadrda "o'smaydi".
//  lobby      — bosh balandligidan markaziy kadr: himoyachi markazda, prokuror/guvoh ~33/67%, boshlar ~33%,
//               oyoqlar ~71% (Paket C panellari ikki chetda, markaz bo'sh).
//  case       — himoyachi chap chetda (ish papkasi markazni egallaydi), qo'shni prokuror kadrdan tashqarida.
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RoleId } from '../config'
import { getState } from '../state'
import { BENCH_POS, groupHalfWidth, isPortrait, STEP_FORWARD, type Slot } from './layout'
import { advanceLaunch, isWidePhase, live, reducedMotion } from './live'

type Shot = { pos: THREE.Vector3; target: THREE.Vector3; fov: number }

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
const DEG = Math.PI / 180

/**
 * Launch ("Sud kelmoqda, hamma o'rnidan tursin!"): guruh ustidan/orqasidan yoritilgan sudya stoli tomon sekin dolly —
 * 2,4 s ease-in-out, ~1,5 m. Figuralar shu paytda boshini va tanasini stol tomon buradi (Characters/gaze).
 * LaunchOverlay bilan mos: letterbox 0,3 s, subtitr 0,6–2,1 s, emblema 2,4 s, qora parda 2,9 s, o'tish 3,3 s.
 * Reduced-motion: dolly yo'q (boshlang'ich nuqtada turadi).
 */
const LAUNCH_SEC = 2.4
const LAUNCH_BLEND = 0.8
const L_FROM = { pos: new THREE.Vector3(0, 2.55, 4.6), target: new THREE.Vector3(0, 1.25, -3.0) }
const L_TO = { pos: new THREE.Vector3(0, 2.3, 3.12), target: new THREE.Vector3(0, 1.4, -3.3) }

/**
 * Sub'ektni kadrga joylash: markazi `c`, balandligi `h` kadr balandligining `fill` qismini egallaydi,
 * ekranda NDC (sx, sy) nuqtasida turadi. `dir` — sub'ektdan kameraga (XZ), `lift` — kamera biroz yuqoridan.
 */
const _right = new THREE.Vector3()
function frame(out: Shot, c: THREE.Vector3, h: number, fill: number, fov: number, aspect: number, sx: number, sy: number, dir: THREE.Vector3, lift: number) {
  const t = Math.tan((fov * DEG) / 2)
  const d = h / (2 * t * fill)
  const halfH = d * t
  const halfW = halfH * aspect
  const right = _right.set(dir.z, 0, -dir.x) // kameraning o'ng tomoni (kadr ichida obyekt yaratilmaydi)
  out.target.copy(c).addScaledVector(right, -sx * halfW)
  out.target.y -= sy * halfH
  out.pos.copy(c).addScaledVector(dir, d)
  out.pos.y += lift
  out.target.y += lift * 0.35
  out.fov = fov
  return out
}

export function CameraRig({ slots }: { slots: Record<RoleId, Slot> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const portrait = isPortrait(size.width, size.height)
  const aspect = size.width / Math.max(1, size.height)

  const tmp = useMemo(
    () => ({
      want: { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 } as Shot,
      c: new THREE.Vector3(),
      dir: new THREE.Vector3(),
    }),
    [],
  )
  const st = useRef({
    /** joriy kadr kaliti qismlari (har kadr satr yasalmasin) */
    shot: '',
    focus: null as RoleId | null,
    portrait: false,
    /** "qo'l" tebranishi amplitudasi: launch'da 0 ga so'nadi (sakrash bo'lmasin) */
    sway: 1,
    t0: 0,
    dur: 1,
    ease: easeInOut,
    from: { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 } as Shot,
    cur: { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 } as Shot,
    init: false,
  })

  useFrame((_, rawDt) => {
    const s = getState()
    const dt = Math.min(rawDt, 0.1)
    advanceLaunch(s.phase, dt)
    // sahna soati (live.time): R3F soati frameloop almashganda 0 ga qaytadi — tween manfiy u bilan sakramasin
    const t = live.time
    const w = tmp.want
    const focus: RoleId | null = s.phase === 'case' || s.phase === 'launch' ? 'himoyachi' : s.phase === 'select' ? s.selected : null
    const lobbyShot = s.phase === 'lobby' && !portrait

    // ---------- 1) kerakli kadr ----------
    if (lobbyShot) {
      // bosh balandligidan, guruh markazi ekran markazida (ikki chetdagi panellar orasida)
      w.pos.set(0, 1.55, 8.4)
      w.target.set(0, 0.95, 0.2)
      w.fov = 32
    } else if (isWidePhase(s.phase)) {
      // zal kirishidan sudya stoli tomon juda sekin dolly (40 s borib-qaytish)
      const k = reducedMotion ? 0 : 0.5 - 0.5 * Math.cos((t / 40) * Math.PI * 2)
      const sway = reducedMotion ? 0 : Math.sin(t * 0.07) * 0.25
      if (portrait) {
        // telefon: personajlar CASECRAFT va shior orasida (avvalgi kadr, tekshirilgan)
        w.pos.set(sway, 2.15 - 0.25 * k, 11.0 - 2.6 * k)
        w.target.set(0, 1.65, -3.2)
        w.fov = 66
      } else {
        w.pos.set(sway, 3.2 - 0.2 * k, 11.0 - 2.0 * k)
        w.target.set(0, 0.8 - 0.25 * k, -3.2)
        w.fov = 44
      }
    } else if (s.phase === 'launch') {
      // guruh ustidan sudya stoli tomon sekin dolly (launch soati bo'yicha)
      const u = reducedMotion ? 0 : easeInOut(Math.min(1, Math.max(0, live.launchT) / LAUNCH_SEC))
      w.pos.lerpVectors(L_FROM.pos, L_TO.pos, u).setX(BENCH_POS.x)
      w.target.lerpVectors(L_FROM.target, L_TO.target, u).setX(BENCH_POS.x)
      if (portrait) {
        w.pos.z += 1.2
        w.pos.y += 0.25
      }
      w.fov = portrait ? 58 : 40
    } else if (focus) {
      const sl = slots[focus]
      tmp.c.copy(sl.pos).addScaledVector(sl.forward, STEP_FORWARD)
      tmp.c.y = 0.95
      tmp.dir.copy(sl.forward)
      const push = s.phase === 'case' ? 1.12 : 1
      if (portrait) frame(w, tmp.c, 1.9, 0.46 * push, 46, aspect, 0, 0.44, tmp.dir, 0.25)
      else if (s.phase === 'case')
        // ish papkasi ekran markazini egallaydi: himoyachi chap chetda ko'rinib tursin, prokuror (1,25 m chapda)
        // kadrdan butunlay chiqsin — chetda yarim kesilgan figura qolmasin (T-08). Tor ekranda kamroq siljiydi.
        frame(w, tmp.c, 1.9, 0.64 * push, 30, aspect, aspect >= 1.3 ? -0.8 : -0.55, 0.12, tmp.dir, 0.3)
      else frame(w, tmp.c, 1.9, 0.64 * push, 30, aspect, -0.36, 0.12, tmp.dir, 0.3)
    } else {
      // butun guruh
      const fov = portrait ? 58 : 36
      const tn = Math.tan((fov * DEG) / 2)
      const hw = groupHalfWidth(portrait)
      const dW = hw / (tn * aspect)
      const dH = 2.0 / (2 * tn * 0.62)
      const d = Math.max(dW, dH)
      const halfH = d * tn
      tmp.c.set(0, 0.95, 0.1)
      w.pos.set(0, 0.95 + 0.55, tmp.c.z + d)
      // telefonda guruh yuqoriroq (pastda panel)
      w.target.set(0, 0.95 + 0.2 - (portrait ? 0.3 : 0.06) * halfH, tmp.c.z)
      w.fov = fov
    }

    // ---------- 2) kadr almashdimi -> tween ----------
    const shot = lobbyShot ? 'lobby' : isWidePhase(s.phase) ? 'wide' : s.phase
    const S = st.current
    if (!S.init) {
      S.cur.pos.copy(w.pos)
      S.cur.target.copy(w.target)
      S.cur.fov = w.fov
      S.shot = shot
      S.focus = focus
      S.portrait = portrait
      S.init = true
      S.t0 = -1e9
    } else if (shot !== S.shot || focus !== S.focus || portrait !== S.portrait) {
      const prevPhase = S.shot
      const nextPhase = shot
      S.shot = shot
      S.focus = focus
      S.portrait = portrait
      S.from.pos.copy(S.cur.pos)
      S.from.target.copy(S.cur.target)
      S.from.fov = S.cur.fov
      S.t0 = t
      if (s.phase === 'launch') {
        S.dur = reducedMotion ? 0.6 : LAUNCH_BLEND
        S.ease = easeInOut
      } else {
        S.dur = reducedMotion ? 0.3 : (prevPhase === 'wide') !== (nextPhase === 'wide') ? 1.2 : 0.8
        S.ease = easeInOut
      }
    }
    // launch: o'tish launch soati bo'yicha (DEV sekin kadr bilan ham mos)
    const u = s.phase === 'launch' && !reducedMotion ? Math.min(1, Math.max(0, live.launchT) / S.dur) : THREE.MathUtils.clamp((t - S.t0) / S.dur, 0, 1)
    if (u < 1) {
      const e = S.ease(u)
      S.cur.pos.lerpVectors(S.from.pos, w.pos, e)
      S.cur.target.lerpVectors(S.from.target, w.target, e)
      S.cur.fov = THREE.MathUtils.lerp(S.from.fov, w.fov, e)
    } else {
      S.cur.pos.copy(w.pos)
      S.cur.target.copy(w.target)
      S.cur.fov = w.fov
    }

    // ---------- 3) yengil "qo'l" tebranishi (select/case) ----------
    camera.position.copy(S.cur.pos)
    S.sway = THREE.MathUtils.damp(S.sway, s.phase === 'launch' ? 0 : 1, 4, dt)
    if (!reducedMotion && S.sway > 1e-3) {
      camera.position.x += Math.sin(t * 0.23) * 0.02 * S.sway
      camera.position.y += Math.sin(t * 0.19 + 1.3) * 0.012 * S.sway
    }
    camera.lookAt(S.cur.target)
    if (Math.abs(camera.fov - S.cur.fov) > 1e-3) {
      camera.fov = S.cur.fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}
