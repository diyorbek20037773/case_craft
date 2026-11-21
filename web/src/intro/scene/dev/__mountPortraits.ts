// DEV-ONLY: headless brauzerda page.evaluate(() => import('/src/intro/scene/dev/__mountPortraits.ts')) bilan yuklanadi.
// Ilova bu faylni import qilmaydi. 900x1200 kanvas chap-yuqorida; window.__portrait.show('<rol>') bilan almashtiriladi,
// tayyor bo'lsa window.__portraitReady === '<rol>'.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Portraits } from './portraits'

const app = document.getElementById('root')
if (app) app.style.display = 'none'

const host = document.createElement('div')
host.id = 'portrait-host'
host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:1200px;z-index:2147483000;background:#0b1020'
document.body.appendChild(host)

createRoot(host).render(createElement(Portraits, { initial: 'sudya' }))
export {}
