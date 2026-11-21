// ⚠️ DEV-ONLY. Ilova bu faylni import QILMAYDI va u build'ga kirmaydi.
// RoleSlides ni alohida ko‘rish uchun: dev serverda istalgan sahifani oching va konsolda
//   await import('/src/intro/ui/slides/__mount.ts')            // sudya
//   window.__rsShow('guvoh')                                    // boshqa rol
// URL da ?rs=himoyachi bo‘lsa — shu rol bilan ochiladi.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { RoleSlides } from './RoleSlides'
import type { SlideRole } from './slidesData'

const host = document.createElement('div')
host.id = 'rs-dev-mount'
document.body.appendChild(host)
const root = createRoot(host)

export function show(role: SlideRole) {
  root.render(
    createElement(RoleSlides, {
      role,
      open: true,
      onClose: () => root.render(null),
      onChooseRole: () => {
        console.info('[RoleSlides dev] onChooseRole')
        root.render(null)
      },
    }),
  )
}

;(window as unknown as { __rsShow: typeof show }).__rsShow = show
show((new URLSearchParams(location.search).get('rs') as SlideRole | null) ?? 'sudya')
