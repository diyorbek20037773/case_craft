// DEV-ONLY: brauzerda alohida ko‘rish uchun (ilovada ishlatilmaydi). Konsolda:
//   import('/src/intro/ui/case/__mount.tsx').then(m => m.mount())
import { createRoot, type Root } from 'react-dom/client'
import { CaseBook } from './CaseBook'

let root: Root | null = null

export function mount() {
  let host = document.getElementById('cb-preview')
  if (!host) {
    host = document.createElement('div')
    host.id = 'cb-preview'
    host.style.cssText = 'position:fixed;inset:0;z-index:30;background:rgb(8 17 31 / 0.55)'
    document.body.appendChild(host)
  }
  root?.unmount()
  root = createRoot(host)
  root.render(<CaseBook onStart={() => console.info('[casebook] start')} onBack={() => console.info('[casebook] back')} />)
}
