// Realistik guvoh (Microsoft Rocketbox, MIT): klip + prosedural nigoh/bosh + lab harakati.
// Suyaklar: Bip01 (GLTFLoader nomlardagi bo'sh joyni "_" ga almashtiradi: "Bip01_Head").
// Nigoh usuli o'qlarga bog'liq emas: kerakli burilish personaj ramkasida hisoblanib, suyakka dunyo-delta sifatida qo'shiladi.
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { director, now, type MouthLevels } from './director'
import { JUDGE_LOOK } from './pano'

export const WITNESS_URL = '/models/realistic/witness.glb'

const MORPHS = [
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'browInnerUp',
  'browDownLeft',
  'browDownRight',
  'eyeWideLeft',
  'eyeWideRight',
  'mouthPressLeft',
  'mouthPressRight',
  'jawOpen',
  'viseme_aa',
  'viseme_O',
  'viseme_E',
  'viseme_SS',
  'viseme_PP',
  'mouthClose',
] as const
type MorphName = (typeof MORPHS)[number]

const norm = (s: string) => s.replace(/[\s_]/g, '').toLowerCase()
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

interface WitnessProps {
  position: THREE.Vector3
  rotationY: number
  /** Topilgan/topilmagan suyak va morphlar haqida xabar (hisobot uchun) */
  onReport?: (info: { missingBones: string[]; morphMeshes: number; missingMorphs: string[] }) => void
}

export function Witness({ position, rotationY, onReport }: WitnessProps) {
  const gltf = useGLTF(WITNESS_URL, false, true)
  const camera = useThree((s) => s.camera)
  const root = useRef<THREE.Group>(null)

  const rig = useMemo(() => {
    const scene = gltf.scene
    const byName = new Map<string, THREE.Object3D>()
    const morphMeshes: THREE.Mesh[] = []
    scene.traverse((o) => {
      byName.set(norm(o.name), o)
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.frustumCulled = false
        mesh.castShadow = true
        mesh.receiveShadow = false
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 1
        // soch/qosh qirralari MSAA bilan silliq chiqsin
        if (mat && mat.alphaTest > 0) mat.alphaToCoverage = true
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) morphMeshes.push(mesh)
      }
    })
    const bone = (n: string) => byName.get(norm(n)) ?? null
    const bones = {
      hips: bone('Bip01'),
      spine2: bone('Bip01 Spine2'),
      neck: bone('Bip01 Neck'),
      head: bone('Bip01 Head'),
      eyeL: bone('Bip01 LEye'),
      eyeR: bone('Bip01 REye'),
    }
    // Har bir morph uchun [mesh, indeks] juftlari (3 ta SkinnedMesh — tana, bosh, soch/ko'z)
    const morph = {} as Record<MorphName, [THREE.Mesh, number][]>
    for (const name of MORPHS) {
      morph[name] = []
      for (const m of morphMeshes) {
        const i = m.morphTargetDictionary![name]
        if (i !== undefined) morph[name].push([m, i])
      }
    }
    return { scene, bones, morph, morphMeshes }
  }, [gltf.scene])

  const mixer = useMemo(() => new THREE.AnimationMixer(rig.scene), [rig.scene])
  const actions = useMemo(() => {
    const get = (n: string) => {
      const clip = gltf.animations.find((c) => c.name === n)
      return clip ? mixer.clipAction(clip) : null
    }
    return { idle: get('Idle'), talk: get('Talk') }
  }, [gltf.animations, mixer])

  // Model qaysi tomonga qaraganini ko'z/bosh suyaklaridan aniqlab, +Z ga to'g'rilash
  const inner = useRef<THREE.Group>(null)
  const restHips = useRef(new THREE.Vector3())
  useEffect(() => {
    actions.idle?.reset().play()
    mixer.update(0)
    rig.scene.updateMatrixWorld(true)
    const { head, eyeL, eyeR, hips } = rig.bones
    if (hips) restHips.current.copy(hips.position)
    if (head && eyeL && eyeR && inner.current) {
      const h = head.getWorldPosition(new THREE.Vector3())
      const e = eyeL.getWorldPosition(new THREE.Vector3()).add(eyeR.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5)
      const f = e.sub(h)
      if (Math.hypot(f.x, f.z) > 1e-4) inner.current.rotation.y = -Math.atan2(f.x, f.z)
    }
    const missingBones = Object.entries(rig.bones)
      .filter(([, b]) => !b)
      .map(([k]) => k)
    const missingMorphs = MORPHS.filter((n) => rig.morph[n].length === 0)
    onReport?.({ missingBones, morphMeshes: rig.morphMeshes.length, missingMorphs })
    if (missingBones.length || missingMorphs.length) console.warn('[proto] topilmadi:', { missingBones, missingMorphs })
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer, rig, onReport])

  // --- holat o'zgaruvchilari (kadrlar orasida) ---
  const st = useRef({
    yaw: 0,
    pitch: 0,
    eyeYaw: 0,
    eyePitch: 0,
    talking: false,
    talkW: 0,
    blinkNext: now() + 2,
    blinkT: -1,
    wanderNext: 0,
    wander: new THREE.Vector3(),
    lastVoice: -10,
    m: Object.fromEntries(MORPHS.map((n) => [n, 0])) as Record<MorphName, number>,
  })

  const tmp = useMemo(
    () => ({
      v1: new THREE.Vector3(),
      v2: new THREE.Vector3(),
      q1: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      qRoot: new THREE.Quaternion(),
      qRootInv: new THREE.Quaternion(),
      e: new THREE.Euler(0, 0, 0, 'YXZ'),
      m: new THREE.Matrix4(),
      target: new THREE.Vector3(),
    }),
    [],
  )

  /** Suyakni personaj ramkasidagi (yaw, pitch) qadar dunyo-delta bilan burish */
  const turn = (bone: THREE.Object3D | null, yaw: number, pitch: number) => {
    if (!bone || !bone.parent) return
    tmp.e.set(pitch, yaw, 0, 'YXZ')
    tmp.q1.setFromEuler(tmp.e)
    // dunyo delta: qRoot * q * qRoot^-1
    tmp.q1.premultiply(tmp.qRoot).multiply(tmp.qRootInv)
    bone.parent.getWorldQuaternion(tmp.q2)
    // lokal: parent^-1 * delta * parent * local
    const parentInv = tmp.q2.clone().invert()
    const d = parentInv.multiply(tmp.q1).multiply(tmp.q2)
    bone.quaternion.premultiply(d)
    bone.updateMatrixWorld(true)
  }

  const setMorph = (name: MorphName, value: number) => {
    for (const [mesh, i] of rig.morph[name]) mesh.morphTargetInfluences![i] = value
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = st.current
    const t = now()
    const phase = director.phase

    // 1) Klip: javob paytida Talk (60% — imo-ishora minbar chegarasidan chiqib ketmasin), qolganda Idle
    const talkTarget = phase === 'answer' ? 0.6 : 0
    s.talkW = THREE.MathUtils.damp(s.talkW, talkTarget, 3.5, dt)
    if (actions.idle && actions.talk) {
      if (s.talkW > 0.01 && !s.talking) {
        s.talking = true
        actions.talk.reset().play()
      } else if (s.talkW <= 0.01 && s.talking && talkTarget === 0) {
        s.talking = false
        actions.talk.stop()
      }
      actions.talk.setEffectiveWeight(s.talking ? s.talkW : 0)
      actions.idle.setEffectiveWeight(1 - (s.talking ? s.talkW : 0))
    }
    mixer.update(dt)
    const hips = rig.bones.hips
    if (hips) {
      // Klip personajni joyidan siljitib yubormasin (minbar ortida qolsin)
      hips.position.x = THREE.MathUtils.clamp(hips.position.x, restHips.current.x - 0.03, restHips.current.x + 0.03)
      hips.position.z = THREE.MathUtils.clamp(hips.position.z, restHips.current.z - 0.03, restHips.current.z + 0.03)
    }
    const g = root.current
    if (!g || !inner.current) return
    g.updateMatrixWorld(true)
    inner.current.getWorldQuaternion(tmp.qRoot)
    tmp.qRootInv.copy(tmp.qRoot).invert()

    // 2) Nigoh nishoni
    if (t > s.wanderNext) {
      s.wanderNext = t + 2 + Math.random() * 2.5
      s.wander.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.25, 0)
    }
    const target = tmp.target
    let speed = 4
    if (phase === 'listen' || phase === 'answer') {
      camera.getWorldPosition(target)
      target.y -= 0.03
      if (phase === 'answer') target.addScaledVector(s.wander, 0.15)
      speed = phase === 'listen' ? 5 : 4
    } else if (phase === 'think') {
      // pastga va yon tomonga (eslash)
      inner.current.localToWorld(target.set(0.55, 0.85, 1.1))
      speed = 3.5
    } else {
      target.copy(JUDGE_LOOK).add(s.wander)
      speed = phase === 'return' ? 2.6 : 2
    }

    const head = rig.bones.head
    let wantYaw = 0
    let wantPitch = 0
    if (head) {
      head.getWorldPosition(tmp.v1)
      tmp.v2.copy(target).sub(tmp.v1).applyQuaternion(tmp.qRootInv)
      wantYaw = Math.atan2(tmp.v2.x, tmp.v2.z)
      wantPitch = Math.atan2(-tmp.v2.y, Math.hypot(tmp.v2.x, tmp.v2.z))
    }
    const yawC = THREE.MathUtils.clamp(wantYaw, -1.0, 1.0)
    const pitchC = THREE.MathUtils.clamp(wantPitch, -0.3, 0.42)
    s.yaw = THREE.MathUtils.damp(s.yaw, yawC, speed, dt)
    s.pitch = THREE.MathUtils.damp(s.pitch, pitchC, speed, dt)
    // Ko'zlar boshdan oldin yetadi (sakkada), qoldiq burchak bilan
    s.eyeYaw = THREE.MathUtils.damp(s.eyeYaw, THREE.MathUtils.clamp(wantYaw - s.yaw, -0.35, 0.35), 16, dt)
    s.eyePitch = THREE.MathUtils.damp(s.eyePitch, THREE.MathUtils.clamp(wantPitch - s.pitch, -0.2, 0.25), 16, dt)

    // Bosh chayqash ("yo'q"): 2,5 marta silliq tebranish, so'nib boradi
    let shake = 0
    if (director.shakeAt !== null) {
      const k = t - director.shakeAt
      const dur = 1.15
      if (k >= 0 && k <= dur) {
        const env = THREE.MathUtils.smoothstep(k, 0, 0.12) * (1 - k / dur) ** 1.3
        shake = Math.sin(k * Math.PI * 2 * 2.4) * 0.3 * env
      }
    }

    // Burilishni umurtqa, bo'yin va boshga bo'lib berish
    turn(rig.bones.spine2, s.yaw * 0.15, s.pitch * 0.1)
    turn(rig.bones.neck, s.yaw * 0.35 + shake * 0.35, s.pitch * 0.35)
    turn(head, s.yaw * 0.5 + shake * 0.65, s.pitch * 0.55)
    turn(rig.bones.eyeL, s.eyeYaw - shake * 0.4, s.eyePitch)
    turn(rig.bones.eyeR, s.eyeYaw - shake * 0.4, s.eyePitch)

    // 3) Yuz: pirpiratish, holat ifodasi, lab
    if (s.blinkT < 0 && t > s.blinkNext) s.blinkT = 0
    let blink = 0
    if (s.blinkT >= 0) {
      s.blinkT += dt
      const b = s.blinkT
      blink = b < 0.07 ? b / 0.07 : b < 0.17 ? 1 - (b - 0.07) / 0.1 : 0
      if (b >= 0.17) {
        s.blinkT = -1
        // ba'zan ketma-ket ikki marta
        s.blinkNext = t + (Math.random() < 0.15 ? 0.25 : 3 + Math.random() * 2)
      }
    }
    // pastga qaraganda qovoq biroz tushadi
    const lidDown = clamp01(s.pitch * 0.6 + s.eyePitch * 0.8)

    const want: Partial<Record<MorphName, number>> = {
      eyeBlinkLeft: Math.max(blink, lidDown * 0.35),
      eyeBlinkRight: Math.max(blink, lidDown * 0.35),
      eyeLookDownLeft: phase === 'think' ? 0.45 : 0,
      eyeLookDownRight: phase === 'think' ? 0.45 : 0,
      browInnerUp: phase === 'think' ? 0.4 : phase === 'listen' ? 0.22 : 0.05,
      eyeWideLeft: phase === 'listen' ? 0.18 : 0,
      eyeWideRight: phase === 'listen' ? 0.18 : 0,
      mouthPressLeft: phase === 'think' ? 0.35 : 0,
      mouthPressRight: phase === 'think' ? 0.35 : 0,
      browDownLeft: shake !== 0 ? 0.3 : 0,
      browDownRight: shake !== 0 ? 0.3 : 0,
    }

    const lv: MouthLevels | null = phase === 'answer' ? director.mouth() : null
    if (lv) {
      const vol = lv.vol
      if (vol > 0.08) s.lastVoice = t
      const o = clamp01((lv.low - 0.5) * 3)
      const e = clamp01((lv.mid + lv.high - 0.5) * 2.5)
      const ss = clamp01((lv.high - 0.28) * 3) * clamp01(vol * 6)
      const closing = vol < 0.05 && t - s.lastVoice < 0.18 ? 1 : 0
      want.jawOpen = vol * 0.3
      want.viseme_aa = vol * clamp01(1 - 0.7 * o - 0.5 * e) * 0.6
      want.viseme_O = vol * o * 0.55
      want.viseme_E = vol * e * 0.65
      want.viseme_SS = ss * 0.45
      want.viseme_PP = closing * 0.5
      want.mouthClose = closing * 0.25
    }

    for (const name of MORPHS) {
      const target = want[name] ?? 0
      const cur = s.m[name]
      const isMouth = name === 'jawOpen' || name.startsWith('viseme') || name === 'mouthClose'
      const lambda = name.startsWith('eyeBlink') ? 60 : isMouth ? (target > cur ? 32 : 16) : 6
      s.m[name] = THREE.MathUtils.damp(cur, target, lambda, dt)
      setMorph(name, s.m[name])
    }
  })

  return (
    <group ref={root} position={position} rotation-y={rotationY}>
      <group ref={inner}>
        <primitive object={rig.scene} />
      </group>
    </group>
  )
}

useGLTF.preload(WITNESS_URL, false, true)
