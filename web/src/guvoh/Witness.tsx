// Meshy guvohi. Asos — FAQAT Meshy kliplari (idle_a/idle_b, think, talk_both/talk_right), og'irlik bilan aralashtiriladi.
// Ustidan 3 ta kichik, alohida o'chiriladigan qatlam (pose.json "layers", URL ?layers=look,shake,mouth | none):
//  - look:  nigoh — bo'yin 40% / bosh 60%, ±40° yaw / ±15° pitch (pose.json), mixer.update DAN KEYIN, qo'shimcha (additive).
//  - shake: "yo'q" — bosh chayqash, ±12° yaw, 3 tebranish, nigoh ustiga.
//  - mouth: iyak deformatsiyasi (mouth.ts). O'chiq bo'lsa material umuman patch qilinmaydi.
// Qo'llar uchun IK yo'q; son va umurtqa (Hips, Spine*) faqat klipdan.
// Qo'l/yelka yumshatish (arms.ts, pose.json "arms"): talk kliplaridan keskin ko'tarilish oraliqlari kesiladi
// (faqat tinch qismi ping-pong loop), timeScale 0.85, so'ng har kadr UpperArm ko'tarilishi cheklanadi, bilak
// burilishi kamaytiriladi va tirsakka taqsimlanadi, Shoulder ning keskin harakati yarmiga tushadi. ?arms=raw — asl kliplar.
//
// Burilish suyak o'qlariga bog'liq emas: personaj ramkasidagi (yaw — yuqori o'q, pitch — o'ng o'q) burilish
// ota suyak fazosiga o'tkaziladi va suyakning lokal kvaternioniga chapdan ko'paytiriladi:
//   local' = (P⁻¹ · R · Q · R⁻¹ · P) · local,  P — ota suyakning dunyo kvaternioni, R — personaj ildizi, Q — delta.
//
// Tekshirish uchun URL: ?clip=talk_both (bitta klip, og'irlik 1), ?at=1.2 (klipni shu soniyada to'xtatish),
// ?testyaw=20 (boshga qat'iy +20° yaw — o'q to'g'riligini ko'rish), ?view=side|front|close (Scene.tsx).
// ?arms=raw — asl Meshy kliplari (kesilmagan, timeScale 1, talkWeight arms.raw.talkWeight, suyak tuzatishsiz);
// ?cut=0 — yumshatilgan rejimda kesishni o'chirish (?at asl klip vaqtini aynan bir kadrda solishtirish uchun).
//
// Qadd (posture.ts, pose.json "posture"): guvoh tik va ishonch bilan tursin. Tartib har kadr:
//   klip pozasini tiklash → mixer.update → qadd (umurtqa/o'mrov/bosh/tizza) → arms.ts clamp → qadd qo'llari
//   (yuqori qo'l, tirsak, bilak, kaft songa) → nigoh/chayqash → og'iz.
// Kuch: idle 1; talk kliplarida body/arms pose.json qiymatlarigacha yumshaydi; think da qo'l tuzatishi 0 (qo'l boshga).
// ?posture=0 — qaddsiz (oldin/keyin solishtirish).
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { director, now, type WitnessPhase } from './director'
import { makeSide, softenArm, type ArmSide, type ArmsConfig } from './arms'
import { PLACEMENT } from './characters/cast'
import { patchMouth, type MouthRig } from './mouth'
import { applyPostureArms, applyPostureBody, makePostureRig, measurePosture, restorePosture } from './posture'
import pose from './pose.json'

/** Raislik qiluvchi boshi — guvoh dam olganda va javob berganda shu tomonga qaraydi (pose.json look chegarasi) */
const JUDGE_LOOK = PLACEMENT.judge.head

export const witnessUrl = (mobile: boolean) => (mobile ? '/models/meshy/guvoh-mobile.glb' : '/models/meshy/guvoh.glb')

export type ClipName = 'idle_a' | 'idle_b' | 'think' | 'talk_both' | 'talk_right'
const CLIPS: ClipName[] = ['idle_a', 'idle_b', 'think', 'talk_both', 'talk_right']

const DEG = Math.PI / 180
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function readOptions() {
  const q = new URLSearchParams(window.location.search)
  const l = q.get('layers')
  const list = l === null ? (pose.layers as string[]) : l.split(',')
  const clip = q.get('clip')
  const at = q.get('at')
  return {
    look: list.includes('look'),
    shake: list.includes('shake'),
    mouth: list.includes('mouth'),
    faceTint: q.get('face') !== '0',
    testYaw: Number(q.get('testyaw') ?? 0) * DEG,
    testPitch: Number(q.get('testpitch') ?? 0) * DEG,
    clip: CLIPS.includes(clip as ClipName) ? (clip as ClipName) : null,
    at: at === null ? null : Number(at),
    armsRaw: q.get('arms') === 'raw',
    cut: q.get('cut') !== '0',
    posture: q.get('posture') !== '0',
  }
}
const OPT = readOptions()
const ARMS = pose.arms as ArmsConfig & {
  raw: { talkWeight: number }
  talkTimeScale: number
  cut: Partial<Record<ClipName, [number, number]>>
}
/** Yumshatilgan rejimda: kesilgan klip oralig'i (asl klip soniyalari) */
const POSTURE_CFG = pose.posture as { talkBody: number; talkArms: number; thinkBody: number; thinkArms: number }
const cutRange = (n: ClipName) => (!OPT.armsRaw && OPT.cut ? (ARMS.cut[n] ?? null) : null)

/**
 * Klipning [t0, t1] oralig'ini 30 fps da qayta namunalab yangi klip yasaydi (vaqt 0 dan boshlanadi).
 * AnimationUtils.subclip o'rniga: GLB dagi ba'zi treklarda faqat 2 ta kalit bor (Spine.r, *UpLeg.t) — subclip ularni
 * oraliqda kalit yo'q deb tashlab yuboradi va suyak klipsiz qoladi; interpolyant bilan namunalash har trekni saqlaydi.
 */
function cutClip(clip: THREE.AnimationClip, t0: number, t1: number, fps = 30) {
  const n = Math.max(2, Math.round((t1 - t0) * fps) + 1)
  const tracks = clip.tracks.map((tr) => {
    const size = tr.getValueSize()
    // createInterpolant runtime da bor (setInterpolation o'rnatadi), @types/three da e'lon qilinmagan
    const interp = (tr as unknown as { createInterpolant: () => THREE.Interpolant }).createInterpolant()
    const times = new Float32Array(n)
    const values = new Float32Array(n * size)
    for (let i = 0; i < n; i++) {
      const t = t0 + ((t1 - t0) * i) / (n - 1)
      times[i] = t - t0
      values.set(interp.evaluate(t) as Float32Array, i * size)
    }
    const Track = tr.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack
    return new Track(tr.name, times, values)
  })
  return new THREE.AnimationClip(clip.name, t1 - t0, tracks)
}

interface WitnessProps {
  mobile: boolean
  position: THREE.Vector3
  rotationY: number
  debug: boolean
}

// kadr ichida obyekt yaratilmasin
const _p = new THREE.Quaternion()
const _d = new THREE.Quaternion()
const _pi = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

/** Suyakni personaj ramkasidagi (yaw, pitch) qadar burish; qRoot — personaj ildizining dunyo kvaternioni */
function turnBone(bone: THREE.Object3D, yaw: number, pitch: number, qRoot: THREE.Quaternion) {
  if (!bone.parent || (yaw === 0 && pitch === 0)) return
  _e.set(pitch, yaw, 0, 'YXZ')
  _d.setFromEuler(_e)
  // personaj ramkasi -> dunyo
  _d.premultiply(qRoot).multiply(_p.copy(qRoot).invert())
  // dunyo -> ota suyak fazosi
  bone.parent.getWorldQuaternion(_p)
  _d.premultiply(_pi.copy(_p).invert()).multiply(_p)
  bone.quaternion.premultiply(_d)
  bone.updateMatrixWorld(true)
}

export function Witness({ mobile, position, rotationY, debug }: WitnessProps) {
  const gltf = useGLTF(witnessUrl(mobile), false, true)
  const camera = useThree((s) => s.camera)
  const root = useRef<THREE.Group>(null)

  const rig = useMemo(() => {
    const scene = gltf.scene
    // qadd rig'i — bind pozada (keshdagi sahna avval bind ga qaytariladi), klip o'ynashidan OLDIN
    const posture = makePostureRig(scene)
    const meshes: THREE.SkinnedMesh[] = []
    const byName = new Map<string, THREE.Object3D>()
    scene.traverse((o) => {
      byName.set(o.name.toLowerCase(), o)
      const m = o as THREE.SkinnedMesh
      if (m.isSkinnedMesh || (o as THREE.Mesh).isMesh) {
        // Bind-pozadagi bounding sphere bo'yicha kesilib, qo'l/bosh "yo'qolmasin"
        m.frustumCulled = false
        m.castShadow = true
        m.receiveShadow = true
        const mat = m.material as THREE.MeshStandardMaterial
        if (mat && mat.isMeshStandardMaterial) {
          // Meshy image-to-3D chok joylarida teskari yuzlar bo'ladi
          mat.side = THREE.DoubleSide
          // metallic xaritasi teriga "metall" yaltiroq beradi
          mat.metalness = Math.min(mat.metalness, 0.15)
          mat.envMapIntensity = 0.9
        }
        if (m.isSkinnedMesh) meshes.push(m)
      }
    })
    const bone = (n: string) => byName.get(n.toLowerCase()) ?? null
    const bones = { head: bone('Head'), neck: bone('neck') }
    const arms: ArmSide[] = [makeSide(bone, 'Left'), makeSide(bone, 'Right')]

    let mouth: MouthRig | null = null
    const mesh = meshes[0]
    if (OPT.mouth && mesh && bones.head) {
      // Bind pozasi: atribut fazosi -> personaj fazosi = Head.world(rest) * boneInverse(Head)
      scene.updateMatrixWorld(true)
      const sceneInv = scene.matrixWorld.clone().invert()
      const idx = mesh.skeleton.bones.indexOf(bones.head as THREE.Bone)
      if (idx >= 0) {
        const headRel = sceneInv.clone().multiply(bones.head.matrixWorld)
        const attrToChar = headRel.clone().multiply(mesh.skeleton.boneInverses[idx])
        const headBind = new THREE.Vector3().setFromMatrixPosition(headRel)
        mouth = patchMouth(mesh.material as THREE.MeshStandardMaterial, attrToChar, headBind)
      }
    }
    /** mixer.update dan oldin klip pozasiga qaytariladigan suyaklar (qo'shimcha burilish to'planmasin) */
    const touched: THREE.Object3D[] = [bones.neck, bones.head]
      .concat(arms.flatMap((a) => [a.shoulder, a.arm, a.fore, a.hand]))
      .filter((o): o is THREE.Object3D => !!o)
    return { scene, bones, arms, touched, mouth, posture, meshes: meshes.length }
  }, [gltf.scene])

  const mixer = useMemo(() => new THREE.AnimationMixer(rig.scene), [rig.scene])
  const actions = useMemo(() => {
    const out = {} as Record<ClipName, THREE.AnimationAction | null>
    for (const n of CLIPS) {
      const clip = gltf.animations.find((c) => c.name === n)
      if (!clip) {
        out[n] = null
        continue
      }
      const range = cutRange(n)
      const a = mixer.clipAction(range ? cutClip(clip, range[0], Math.min(range[1], clip.duration)) : clip)
      // kesilgan bo'lak boshi va oxiri bir xil emas — ping-pong sakrashsiz aylanadi
      if (range) a.setLoop(THREE.LoopPingPong, Infinity)
      if (!OPT.armsRaw && n.startsWith('talk')) a.timeScale = ARMS.talkTimeScale
      // idle tebranishi sokinroq (intro qaddi bilan bir xil)
      if (OPT.posture && n.startsWith('idle')) a.timeScale = rig.posture.tune.idleTimeScale
      out[n] = a
    }
    return out
  }, [gltf.animations, mixer, rig])

  const st = useRef({
    w: { idle_a: 1, idle_b: 0, think: 0, talk_both: 0, talk_right: 0 } as Record<ClipName, number>,
    idleTarget: 0,
    idleNext: now() + 6,
    yaw: 0,
    pitch: 0,
    open: 0,
    wanderNext: 0,
    wander: new THREE.Vector3(),
    lastPhase: 'idle' as WitnessPhase,
    /** neck/Head ning SOF klip pozasi (qo'shimcha burilishdan oldin) */
    /** rig.touched suyaklarining SOF klip pozasi (shu tartibda) */
    clipQ: [] as THREE.Quaternion[],
    hasClip: false,
    fpsAcc: 0,
    fpsN: 0,
  })

  useEffect(() => {
    const missing = CLIPS.filter((n) => !actions[n])
    if (missing.length) console.warn('[guvoh] klip topilmadi:', missing.join(', '))
    if (!rig.bones.head || !rig.bones.neck) console.warn('[guvoh] Head/neck suyagi topilmadi')
    for (const n of CLIPS) {
      const a = actions[n]
      if (!a) continue
      a.reset().play()
      a.setEffectiveWeight(0)
    }
    if (OPT.clip) {
      actions[OPT.clip]?.setEffectiveWeight(1)
      if (OPT.at !== null) {
        for (const n of CLIPS) actions[n]?.setEffectiveTimeScale(0)
        const a = actions[OPT.clip]
        const range = cutRange(OPT.clip)
        // ?at — asl klip soniyasi; kesilgan klipda shu vaqtga mos joy (oraliqdan tashqarida — chetiga)
        if (a) a.time = range ? THREE.MathUtils.clamp(OPT.at - range[0], 0, range[1] - range[0]) : OPT.at
      }
    } else actions.idle_a?.setEffectiveWeight(1)
    mixer.update(0)
    // mixer.update(0) suyaklarga yangi klip pozasini yozdi — useFrame dagi saqlangan "klip pozasi" eskirdi; uni qayta
    // tiklash shu pozani o'chirib yuboradi (?at bilan to'xtatilgan klipda personaj bind-pozada qotib qolardi)
    st.current.hasClip = false
    rig.posture.hasClip = false
    if (debug)
      Object.assign(window, {
        __guvoh: { actions, mouth: rig.mouth, mixer, scene: rig.scene, posture: rig.posture, measure: () => measurePosture(rig.posture) },
      })
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer, rig, debug])

  const tmp = useMemo(() => ({ v1: new THREE.Vector3(), v2: new THREE.Vector3(), target: new THREE.Vector3(), qRoot: new THREE.Quaternion(), qInv: new THREE.Quaternion() }), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = st.current
    const t = now()
    const phase: WitnessPhase = director.phase

    s.fpsAcc += rawDt
    s.fpsN++
    if (s.fpsAcc > 0.5) {
      director.fps = Math.round(s.fpsN / s.fpsAcc)
      s.fpsAcc = 0
      s.fpsN = 0
    }

    // ---------- 1) klip og'irliklari ----------
    if (!OPT.clip) {
      if (t > s.idleNext) {
        s.idleTarget = 1 - s.idleTarget
        s.idleNext = t + 6 + Math.random() * 4
      }
      // yangi holatga kirganda klipni boshidan boshlash (think/talk)
      if (phase !== s.lastPhase) {
        if (phase === 'think') actions.think?.reset().play()
        if (phase === 'answer') actions[director.talkClip]?.reset().play()
        s.lastPhase = phase
      }
      const talk = phase === 'answer' ? (OPT.armsRaw ? ARMS.raw.talkWeight : pose.talkWeight) : 0
      const think = phase === 'think' ? pose.thinkWeight : 0
      const rest = 1 - talk - think
      const want: Record<ClipName, number> = {
        idle_a: rest * (1 - s.idleTarget),
        idle_b: rest * s.idleTarget,
        think,
        talk_both: director.talkClip === 'talk_both' ? talk : 0,
        talk_right: director.talkClip === 'talk_right' ? talk : 0,
      }
      // fade soniyasida ~95% yetib boradi; javobga o'tishda uzunroq (think da qo'l boshda — keskin tushmasin)
      const lambda = 3 / (phase === 'answer' ? pose.fadeAnswer : pose.fade)
      let sum = 0
      for (const n of CLIPS) {
        s.w[n] = THREE.MathUtils.damp(s.w[n], want[n], n.startsWith('idle') && phase === 'idle' ? 1.2 : lambda, dt)
        sum += s.w[n]
      }
      // yig'indi doim 1 — mixer "asl poza" bilan aralashtirmasin
      for (const n of CLIPS) actions[n]?.setEffectiveWeight(sum > 0 ? s.w[n] / sum : 0)
    }
    const { head, neck } = rig.bones
    // MUHIM: three.js PropertyMixer suyakka faqat qiymat O'ZGARGANDA yozadi (klip to'xtaganda yoki resample qilingan
    // tekis bo'laklarda yozmaydi). Shuning uchun o'tgan kadrdagi qo'shimcha burilish olib tashlanadi — aks holda u
    // har kadrda to'planib, bosh orqaga "qayrilib" ketadi (oldingi versiyadagi xato).
    // Xuddi shu sabab qo'l suyaklariga ham tegishli (arms.ts tuzatishi).
    if (s.hasClip) rig.touched.forEach((o, i) => o.quaternion.copy(s.clipQ[i]))
    restorePosture(rig.posture)
    mixer.update(dt)

    rig.touched.forEach((o, i) => (s.clipQ[i] ??= new THREE.Quaternion()).copy(o.quaternion))
    s.hasClip = true

    // klip ulushlari: think (qo'l boshga) va talk (imo-ishora) — clamp va qadd kuchi shularga qarab
    let thinkShare = 0
    let talkK = 0
    if (OPT.clip) {
      thinkShare = OPT.clip === 'think' ? 1 : 0
      talkK = OPT.clip.startsWith('talk') ? 1 : 0
    } else {
      let sum = 0
      for (const n of CLIPS) sum += s.w[n]
      if (sum > 0) {
        thinkShare = s.w.think / sum
        talkK = clamp01((s.w.talk_both + s.w.talk_right) / sum / Math.max(0.01, pose.talkWeight))
      }
    }

    // ---------- 1a) qadd: umurtqa, o'mrov, bosh, tizza (klip pozasi ustidan, additive) ----------
    const lerp = THREE.MathUtils.lerp
    const bodyGain = OPT.posture ? lerp(1, POSTURE_CFG.talkBody, talkK) * lerp(1, POSTURE_CFG.thinkBody, thinkShare) : 0
    applyPostureBody(rig.posture, bodyGain)

    // ---------- 1b) qo'l/yelka yumshatish (klip pozasi ustidan, ota suyak fazosida) ----------
    if (!OPT.armsRaw) {
      // think klipida qo'l iyakka ko'tariladi — UpperArm chegarasi uning og'irligi qadar bo'shatiladi
      const k = 1 - thinkShare
      for (const side of rig.arms) softenArm(side, ARMS, dt, k)
    }

    // ---------- 1c) qadd qo'llari: yuqori qo'l tanaga, tirsak, bilak, kaft songa (clamp dan keyin) ----------
    if (OPT.posture) applyPostureArms(rig.posture, lerp(1, POSTURE_CFG.talkArms, talkK) * lerp(1, POSTURE_CFG.thinkArms, thinkShare))

    const g = root.current
    if (!g || !head || !neck) return
    g.updateMatrixWorld(true)
    g.getWorldQuaternion(tmp.qRoot)
    tmp.qInv.copy(tmp.qRoot).invert()

    // ---------- 2) nigoh (additive, klip pozasi ustidan) ----------
    let yaw = 0
    let pitch = 0
    if (OPT.look) {
      if (t > s.wanderNext) {
        s.wanderNext = t + 2 + Math.random() * 2.5
        // nigohning mayda "suzishi" — burchak sifatida (yaw, pitch), nishon tanlovini o'zgartirmaydi
        s.wander.set((Math.random() - 0.5) * 8 * DEG, (Math.random() - 0.5) * 4 * DEG, 0)
      }
      // Guvoh sud tarkibiga yuzlangan (layout.ts): tinglaganda — savol bergan himoyachiga (kameraga, ±yawDeg gacha),
      // javobda va dam olganda — sudyaga; o'ylaganda — oldinga-pastga
      const target = tmp.target
      let speed = 2
      let wanderK = 1
      if (phase === 'listen') {
        camera.getWorldPosition(target)
        target.y -= 0.05
        wanderK = 0.15
        speed = 4
      } else {
        target.copy(JUDGE_LOOK)
        if (phase === 'answer') wanderK = 0.6
        speed = phase === 'answer' ? 2.5 : phase === 'return' ? 2.4 : 1.6
      }
      head.getWorldPosition(tmp.v1)
      tmp.v2.copy(target).sub(tmp.v1).applyQuaternion(tmp.qInv)
      const Y = pose.look.yawDeg * DEG
      const P = pose.look.pitchDeg * DEG
      let wantYaw = THREE.MathUtils.clamp(Math.atan2(tmp.v2.x, tmp.v2.z) + s.wander.x * wanderK, -Y, Y)
      let wantPitch = THREE.MathUtils.clamp(Math.atan2(-tmp.v2.y, Math.hypot(tmp.v2.x, tmp.v2.z)) + s.wander.y * wanderK, -P, P)
      if (phase === 'think') {
        // think klipi bilan birga: biroz chapga-pastga (personaj ramkasida, nishonsiz)
        wantYaw = 10 * DEG
        wantPitch = 12 * DEG
        speed = 2.2
      }
      s.yaw = THREE.MathUtils.damp(s.yaw, wantYaw, speed, dt)
      s.pitch = THREE.MathUtils.damp(s.pitch, wantPitch, speed, dt)
      yaw = s.yaw
      pitch = s.pitch
    }

    // ---------- 3) "yo'q" — bosh chayqash (nigoh ustiga) ----------
    if (OPT.shake && director.shakeAt !== null) {
      const k = t - director.shakeAt
      const dur = pose.shake.dur
      if (k >= 0 && k <= dur) {
        const env = Math.sin((k / dur) * Math.PI) // silliq kirish/chiqish
        yaw += Math.sin((k / dur) * Math.PI * 2 * pose.shake.cycles) * pose.shake.deg * DEG * env
      }
    }

    yaw += OPT.testYaw
    pitch += OPT.testPitch
    if (yaw !== 0 || pitch !== 0) {
      // bo'yin avval (ota), keyin bosh — bosh bo'yinning yangi holatidan hisoblanadi
      turnBone(neck, yaw * pose.look.neck, pitch * pose.look.neck, tmp.qRoot)
      turnBone(head, yaw * pose.look.head, pitch * pose.look.head, tmp.qRoot)
    }

    // ---------- 4) og'iz ----------
    if (rig.mouth) {
      let want = 0
      if (director.debugOpen !== null) want = director.debugOpen
      else if (phase === 'answer') {
        const lv = director.mouth()
        if (lv) {
          const vowel = clamp01((lv.low - 0.3) * 2.5)
          want = clamp01(lv.vol * 1.25) * (0.55 + 0.45 * vowel)
        }
      }
      s.open = THREE.MathUtils.damp(s.open, want, want > s.open ? 30 : 14, dt)
      rig.mouth.open.value = s.open
      rig.mouth.debug.value = debug && OPT.faceTint ? 1 : 0
    }
  })

  return (
    <group ref={root} position={position} rotation-y={rotationY}>
      <primitive object={rig.scene} />
    </group>
  )
}
