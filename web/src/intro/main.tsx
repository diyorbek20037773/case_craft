import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './intro.css'
import { IntroApp } from './IntroApp'
import { RootBoundary } from './ui/SceneBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary>
      <IntroApp />
    </RootBoundary>
  </StrictMode>,
)
