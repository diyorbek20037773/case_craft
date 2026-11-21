// 3D asset buzilgan / yuklanmasa — zaxira ko'rsatish. `label` (URL) o'zgarsa xato holati tozalanadi
// (key ishlatilmaydi — aks holda mobil<->to'liq almashganda Suspense qayta yaratilib, fallback miltillaydi).
import { Component, type ReactNode } from 'react'

type Props = { fallback: ReactNode; label: string; children: ReactNode }

export class ModelBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('[intro] 3D asset yuklanmadi, zaxira ko‘rsatiladi:', this.props.label, err)
  }
  componentDidUpdate(prev: Props) {
    if (prev.label !== this.props.label && this.state.failed) this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
