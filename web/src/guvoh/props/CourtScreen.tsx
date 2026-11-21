// Devordagi EKRAN (Meshy ekran.glb) + canvas tekstura: CaseCraft, ish raqami, joriy bosqich (session -> Scene prop)
// va kim gapirayotgani (SpeakerContext). Dalil rasmi (public/court/ekran-dalil-1.webp) hozircha yo'q — faqat matn.
import { useGLTF } from '@react-three/drei'
import { useContext, useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SCREEN } from '../layout'
import { SPEAKER_LABEL, SpeakerContext, type Speaker } from '../session'
import { propUrl } from './Instanced'

const W = 1024
const H = 576
/** Displey paneli (model 1,6 x 0,934 m) ichidagi yorug' maydon */
const PANEL = { w: 1.47, h: 0.83, y: 0.475, z: 0.052 }

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur)
      cur = w
    } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

function draw(ctx: CanvasRenderingContext2D, stage: string, speaker: Speaker | null) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#0a1626')
  g.addColorStop(1, '#152a44')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // yuqori chiziq
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, 0, W, 96)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fcd58a'
  ctx.font = '700 54px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  ctx.fillText('CaseCraft', 44, 50)
  ctx.font = '500 24px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'right'
  ctx.fillText('SUD MAJLISI · JONLI', W - 44, 50)
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(W - 44 - ctx.measureText('SUD MAJLISI · JONLI').width - 22, 50, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.textAlign = 'left'

  ctx.fillStyle = '#ffffff'
  ctx.font = '600 40px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  ctx.fillText("O'quv ishi № 1-001/2026", 44, 152)
  ctx.fillStyle = 'rgba(255,255,255,0.68)'
  ctx.font = '400 28px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  ctx.fillText("Jinoyat kodeksi 169-modda · to'qima o'quv ishi", 44, 198)

  ctx.fillStyle = 'rgba(252,213,138,0.35)'
  ctx.fillRect(44, 236, W - 88, 2)

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '500 24px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  ctx.fillText('BOSQICH', 44, 276)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 46px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  const lines = wrap(ctx, stage || 'Majlis boshlanishini kutmoqda', W - 88).slice(0, 2)
  lines.forEach((l, i) => ctx.fillText(l, 44, 330 + i * 56))

  // pastki qator: kim gapirmoqda
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(0, H - 92, W, 92)
  ctx.font = '600 32px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  ctx.fillStyle = speaker ? '#fcd58a' : 'rgba(255,255,255,0.55)'
  ctx.fillText(speaker ? `So'zda: ${SPEAKER_LABEL[speaker]}` : 'Tinglanmoqda', 44, H - 46)
  ctx.textAlign = 'right'
  ctx.font = '400 22px system-ui, "Segoe UI", Roboto, Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText('AI o‘quv simulyatsiyasi — real sud qarori emas', W - 44, H - 46)
  ctx.textAlign = 'left'
}

export function CourtScreen({ mobile, stageName }: { mobile: boolean; stageName: string }) {
  const gltf = useGLTF(propUrl('ekran', mobile), false, true)
  const speaker = useContext(SpeakerContext)
  const obj = useMemo(() => {
    const c = gltf.scene.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = false
        m.receiveShadow = true
        const mat = m.material as THREE.MeshStandardMaterial
        mat.metalness = Math.min(mat.metalness, 0.4)
      }
    })
    return c
  }, [gltf.scene])

  const { canvas, tex } = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return { canvas: cv, tex: t }
  }, [])
  useLayoutEffect(() => () => tex.dispose(), [tex])

  useEffect(() => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    draw(ctx, stageName, speaker)
    tex.needsUpdate = true
  }, [canvas, tex, stageName, speaker])

  return (
    <group position={[SCREEN.x, SCREEN.y, SCREEN.z]}>
      <primitive object={obj} />
      <mesh position={[0, PANEL.y, PANEL.z]}>
        <planeGeometry args={[PANEL.w, PANEL.h]} />
        {/* o'zi yorug' displey (yorug'likka bog'liq emas), bloom uchun biroz yorqin */}
        <meshBasicMaterial map={tex} color={[0.95, 0.95, 0.95]} />
      </mesh>
    </group>
  )
}
