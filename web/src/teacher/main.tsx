import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './teacher.css'
import { TeacherApp } from './TeacherApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TeacherApp />
  </StrictMode>,
)
