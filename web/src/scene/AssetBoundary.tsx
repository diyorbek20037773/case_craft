import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'

interface BoundaryProps {
  fallback: ReactNode
  /** Konsolga yoziladigan nom (qaysi asset yiqildi) */
  name?: string
  children: ReactNode
}

interface BoundaryState {
  failed: boolean
}

/** Asset yuklanmasa (404, buzilgan fayl, tarmoq) — fallback ni ko'rsatadi, ilova yiqilmaydi. */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn(`[scene] ${this.props.name ?? 'asset'} yuklanmadi, placeholder ishlatiladi:`, error.message)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Yuklanish paytida ham, xatoda ham bir xil fallback. */
export function AssetBoundary({ fallback, name, children }: BoundaryProps) {
  return (
    <ErrorBoundary fallback={fallback} name={name}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  )
}
