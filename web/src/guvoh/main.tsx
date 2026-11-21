import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './guvoh.css'
import { GuvohApp } from './GuvohApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GuvohApp />
  </StrictMode>,
)
