// Umumiy o'tirgan personaj (sudya, prokuror, kotib, sudlanuvchi). Asos — faqat Meshy kliplari: sit_idle va sit_talk.
// Gapirganda (SpeakerContext === rol) sit_talk og'irligi 0,6 gacha ko'tariladi (0,5 s crossfade), qolgani sit_idle —
// yelka nuqsoni shu aralashmada kamayadi. Ustidan:
//  - qo'l yumshatish (arms.ts) — chegaralar personajning O'Z sit_idle pozasidan (A-poza/bind dan emas): o'tirgan odamning
//    qo'li tizzada/stolda tinch turadi, faqat sit_talk dagi keskin ko'tarilish/bukilish yumshatiladi;
//  - nigoh (additive, ±25° yaw / ±12° pitch): gapirayotganga, talaba gapirganda — himoyachiga (kameraga).
// Tartib (oldingi tajriba, Witness.tsx): o'tgan kadrdagi klip pozasini tiklash → mixer.update → qo'llar → nigoh.
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useContext, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { softenArm, type ArmSide, type ArmsConfig } from '../arms'
import { director, now } from '../director'
import { SpeakerContext, type Speaker } from '../session'
import { turnBone } from './bones'
import { headOf, PLACEMENT, SEATED_ARMS, type CastSpec } from './cast'
import { court } from './court'
import { applySeatedPosture, SEATED_POSTURE, type PostureSide, type SeatedPostureConfig } from './seatedPosture'

export const characterUrl = (model: string, mobile: boolean) => `/models/meshy/${model}${mobile ? '-mobile' : ''}.glb`

/** sit_talk og'irligi (qolgani sit_idle) — yelka nuqsoni sababli 1 emas */
export const TALK_WEIGHT = 0.6
const FADE = 0.5
const DEG = Math.PI / 180
const LOOK_YAW = 25 * DEG
const LOOK_PITCH = 12 * DEG

/**
 * Klipning [t0, t1] oralig'ini 30 fps da qayta namunalaydi (t1 > uzunlik bo'lsa boshiga o'raladi — klip halqasimon).
 * Interpolyant bilan: GLB dagi 2 kalitli treklar ham saqlanadi (Witness.tsx cutClip bilan bir xil sabab).
 */
function rangeClip(clip: THREE.AnimationClip, t0: number, t1: number, fps = 30) {
  const n = Math.max(2, Math.round((t1 - t0) * fps) + 1)
  const D = clip.duration
  const tracks = clip.tracks.map((tr) => {
    const size = tr.getValueSize()
    const interp = (tr as unknown as { createInterpolant: () => THREE.Interpolant }).createInterpolant()
    const times = new Float32Array(n)
    const values = new Float32Array(n * size)
    for (let i = 0; i < n; i++) {
      const t = t0 + ((t1 - t0) * i) / (n - 1)
      times[i] = t - t0
      values.set(interp.evaluate(t % D) as Float32Array, i * size)
    }
    const Track = tr.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack
    return new Track(tr.name, times, values)
  })
  return new THREE.AnimationClip(`${clip.name}_cut`, t1 - t0, tracks)
}

interface Props {
  spec: CastSpec
  mobile: boolean
  debug: boolean
}

export function Character({ spec, mobile, debug }: Props) {
  const gltf = useGLTF(characterUrl(spec.model, mobile || !spec.hq), false, true)
  const camera = useThree((s) => s.camera)
  const speaker = useContext(SpeakerContext)
  const speakerRef = useRef<Speaker | null>(speaker)
  useEffect(() => {
    speakerRef.current = speaker
  }, [speaker])
  const root = useRef<THREE.Group>(null)
  const place = PLACEMENT[spec.role]
  const cfg = useMemo<ArmsConfig>(() => ({ ...SEATED_ARMS, ...spec.arms }), [spec.arms])
  const posture = useMemo<SeatedPostureConfig>(() => ({ ...SEATED_POSTURE, ...spec.posture }), [spec.posture])

  const rig = useMemo(() => {
    const scene = gltf.scene
    const byName = new Map<string, THREE.Object3D>()
    scene.traverse((o) => {
      byName.set(o.name.toLowerCase(), o)
      const m = o as THREE.SkinnedMesh
      if (m.isSkinnedMesh || (o as THREE.Mesh).isMesh) {
        // bind-pozadagi bounding sphere o'tirgan pozaga mos emas — kesilib qolmasin
        m.frustumCulled = false
        m.castShadow = true
        m.receiveShadow = true
        const mat = m.material as THREE.MeshStandardMaterial
        if (mat && mat.isMeshStandardMaterial) {
          mat.side = THREE.DoubleSide
          mat.metalness = Math.min(mat.metalness, 0.15)
          mat.envMapIntensity = 0.9
        }
      }
    })
    const bone = (n: string) => byName.get(n.toLowerCase()) ?? null
    const bones = { head: bone('Head'), neck: bone('neck') }
    const sideBones = (side: 'Left' | 'Right') => ({
      shoulder: bone(side + 'Shoulder'),
      arm: bone(side + 'Arm'),
      fore: bone(side + 'ForeArm'),
      hand: bone(side + 'Hand'),
    })
    const sides = [sideBones('Left'), sideBones('Right')]
    const touched = [bones.neck, bones.head, ...sides.flatMap((s) => [s.shoulder, s.arm, s.fore, s.hand])].filter(
      (o): o is THREE.Object3D => !!o,
    )
    const posture: PostureSide[] = sides.flatMap((s, i) =>
      s.shoulder && s.arm && s.fore ? [{ sign: i === 0 ? 1 : -1, shoulder: s.shoulder, arm: s.arm, fore: s.fore } as PostureSide] : [],
    )
    return { scene, bones, sides, touched, posture }
  }, [gltf.scene])

  const mixer = useMemo(() => new THREE.AnimationMixer(rig.scene), [rig.scene])
  const actions = useMemo(() => {
    const find = (n: string) => gltf.animations.find((c) => c.name === n)
    const idle = find('sit_idle')
    const talk = find('sit_talk')
    let idleAction: THREE.AnimationAction | null = null
    if (idle) {
      const [a, b] = spec.idleRange
      idleAction = mixer.clipAction(rangeClip(idle, a, b))
      idleAction.setLoop(THREE.LoopPingPong, Infinity)
    }
    return { idle: idleAction, talk: talk ? mixer.clipAction(talk) : null }
  }, [gltf.animations, mixer, spec.idleRange])

  const st = useRef({
    wTalk: 0,
    yaw: 0,
    pitch: 0,
    wander: new THREE.Vector2(),
    wanderNext: 0,
    clipQ: [] as THREE.Quaternion[],
    hasClip: false,
    arms: null as ArmSide[] | null,
  })

  useEffect(() => {
    const { idle, talk } = actions
    if (!idle || !talk) console.warn(`[${spec.role}] sit_idle/sit_talk klipi topilmadi`)
    if (!rig.bones.head || !rig.bones.neck) console.warn(`[${spec.role}] Head/neck suyagi topilmadi`)
    // har kim o'z fazasida nafas olsin (bir vaqtda "tebranmasin")
    idle?.reset().play()
    talk?.reset().play()
    if (idle) idle.time = Math.random() * idle.getClip().duration
    if (talk) talk.time = Math.random() * talk.getClip().duration
    talk?.setEffectiveWeight(0)
    idle?.setEffectiveWeight(1)
    mixer.update(0)
    // O'tirgan pozadagi chegara sferasi (bind A-poza emas) — kadrdan tashqaridagi personaj chizilmaydi (ham soya o'tishida)
    rig.scene.updateMatrixWorld(true)
    rig.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (!m.isSkinnedMesh) return
      m.computeBoundingSphere()
      if (m.boundingSphere) {
        m.boundingSphere.radius *= 1.3
        m.frustumCulled = true
      }
    })
    // Qo'l chegaralari uchun "rest" — shu personajning sit_idle pozasi (bind A-poza emas)
    st.current.arms = rig.sides.map((s) => {
      const q = (o: THREE.Object3D | null) => (o ? o.quaternion.clone() : new THREE.Quaternion())
      return {
        ...s,
        rest: { shoulder: q(s.shoulder), arm: q(s.arm), fore: q(s.fore), hand: q(s.hand) },
        shoulderSlow: new THREE.Quaternion(),
        hasSlow: false,
      }
    })
    st.current.hasClip = false
    if (debug) {
      const w = window as unknown as { __cast?: Record<string, unknown> }
      w.__cast = { ...(w.__cast ?? {}), [spec.role]: { scene: rig.scene, mixer, actions, root: root.current } }
    }
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer, rig, spec.role, debug])

  const tmp = useMemo(
    () => ({ v1: new THREE.Vector3(), v2: new THREE.Vector3(), target: new THREE.Vector3(), qRoot: new THREE.Quaternion(), qInv: new THREE.Quaternion() }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = st.current
    const t = now()
    const who = speakerRef.current
    const speaking = who === spec.role
    const { idle, talk } = actions

    // ---------- 1) klip og'irliklari (crossfade ~0,5 s) ----------
    s.wTalk = THREE.MathUtils.damp(s.wTalk, speaking ? TALK_WEIGHT : 0, 3 / FADE, dt)
    idle?.setEffectiveWeight(1 - s.wTalk)
    talk?.setEffectiveWeight(s.wTalk)

    // o'tgan kadrdagi qo'shimcha burilishlar olib tashlanadi (PropertyMixer faqat o'zgarganda yozadi — to'planmasin)
    if (s.hasClip) rig.touched.forEach((o, i) => o.quaternion.copy(s.clipQ[i]))
    mixer.update(dt)
    rig.touched.forEach((o, i) => (s.clipQ[i] ??= new THREE.Quaternion()).copy(o.quaternion))
    s.hasClip = true

    // ---------- 2) qo'l/yelka yumshatish (sit_idle pozasiga nisbatan) ----------
    if (s.arms) for (const side of s.arms) softenArm(side, cfg, dt, 1)

    const g = root.current
    const { head, neck } = rig.bones
    if (!g || !head || !neck) return
    g.updateMatrixWorld(true)
    g.getWorldQuaternion(tmp.qRoot)
    tmp.qInv.copy(tmp.qRoot).invert()

    // ---------- 2b) yelka qaddi: klipdagi osilgan o'mrovni ko'tarish, tirsakni tanaga yaqinlashtirish ----------
    applySeatedPosture(rig.posture, posture, tmp.qRoot)

    // ---------- 3) nigoh ----------
    const phase = director.phase
    const target = tmp.target
    let wanderK = 1
    if (who && who !== spec.role) {
      target.copy(headOf(who))
      wanderK = 0.25
    } else if (speaking || phase === 'listen' || phase === 'think') {
      // gapirganda va talaba gapirganda — himoyachiga (kamera)
      camera.getWorldPosition(target)
      target.y -= 0.1
      wanderK = speaking ? 0.7 : 0.25
    } else {
      // tinch holatda — guvohga (zal markazi), sudlanuvchi — sudyaga
      target.copy(spec.role === 'defendant' ? headOf('judge') : headOf('witness'))
    }
    if (t > s.wanderNext) {
      s.wanderNext = t + 2.5 + Math.random() * 3
      s.wander.set((Math.random() - 0.5) * 10 * DEG, (Math.random() - 0.5) * 5 * DEG)
    }
    head.getWorldPosition(tmp.v1)
    tmp.v2.copy(target).sub(tmp.v1).applyQuaternion(tmp.qInv)
    const wantYaw = THREE.MathUtils.clamp(Math.atan2(tmp.v2.x, tmp.v2.z) + s.wander.x * wanderK, -LOOK_YAW, LOOK_YAW)
    let wantPitch = THREE.MathUtils.clamp(Math.atan2(-tmp.v2.y, Math.hypot(tmp.v2.x, tmp.v2.z)) + s.wander.y * wanderK, -LOOK_PITCH, LOOK_PITCH)
    // gapirganda boshning yengil "urg'u" tebranishi
    if (s.wTalk > 0.05) wantPitch += Math.sin(t * 3.3) * 2.2 * DEG * (s.wTalk / TALK_WEIGHT)
    s.yaw = THREE.MathUtils.damp(s.yaw, wantYaw, 2.6, dt)
    s.pitch = THREE.MathUtils.damp(s.pitch, wantPitch, 2.6, dt)
    turnBone(neck, s.yaw * 0.4, s.pitch * 0.4, tmp.qRoot)
    turnBone(head, s.yaw * 0.6, s.pitch * 0.6, tmp.qRoot)
    // kamera nishoni: Head suyagining haqiqiy joyi (PLACEMENT.head — faqat taxmin)
    head.getWorldPosition((court.heads[spec.role] ??= new THREE.Vector3()))
  })

  return (
    <group ref={root} name={`cast-${spec.role}`} position={place.root} rotation-y={place.rotY}>
      <primitive object={rig.scene} />
    </group>
  )
}
