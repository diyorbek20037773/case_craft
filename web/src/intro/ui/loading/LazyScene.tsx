// Og‘ir 3D qism (three, R3F, drei, postprocessing) — IntroApp buni React.lazy bilan yuklaydi,
// shuning uchun logo va "Boshlash" 3D kutubxonalarini kutmasdan chiqadi.
import { useProgress } from '@react-three/drei'
import { useEffect } from 'react'
import { IntroCanvas } from '../../scene/IntroCanvas'
import { setSceneProgress } from './progressStore'

function ProgressReporter() {
  const active = useProgress((s) => s.active)
  const progress = useProgress((s) => s.progress)
  const total = useProgress((s) => s.total)

  // Sahna o‘chsa (SceneBoundary xatoni ushlasa, butun daraxt unmount bo‘ladi) — chizig‘ni yashiramiz
  useEffect(() => {
    setSceneProgress({ mounted: true, gone: false })
    return () => setSceneProgress({ gone: true })
  }, [])

  useEffect(() => {
    setSceneProgress({ active, progress: Number.isFinite(progress) ? progress : 0, total })
  }, [active, progress, total])

  return null
}

export default function LazyScene() {
  return (
    <div className="ld-scene-in absolute inset-0">
      <ProgressReporter />
      <IntroCanvas />
    </div>
  )
}
