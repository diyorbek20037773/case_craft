import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './proto.css'
import { ProtoApp } from './ProtoApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProtoApp />
  </StrictMode>,
)
