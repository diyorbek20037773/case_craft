// DEV-ONLY: headless brauzerda page.evaluate(() => import('/src/intro/scene/dev/__mountLineup.ts')) bilan yuklanadi.
// Ilova bu faylni import qilmaydi. Rejim: window.__lineupMode = 'full' | 'faces' (import dan oldin), standart 'full'.
// window.__lineupFix = true — intro dagi qomat + material tuzatishi; __lineupDropRough = true — roughnessMap ham olib tashlanadi.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { LINEUP, Lineup } from './lineup'

const w = window as unknown as { __lineupMode?: 'full' | 'faces'; __lineupReady?: boolean }
const mode = w.__lineupMode === 'faces' ? 'faces' : 'full'
w.__lineupReady = false

// intro sahnasi GPU ni band qilmasin
const app = document.getElementById('root')
if (app) app.style.display = 'none'

const host = document.createElement('div')
host.id = 'lineup-host'
host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#7c7c7c'
document.body.appendChild(host)

const labels = document.createElement('div')
if (mode === 'faces') {
  // bosh-yelka rejimida yorliqlar har plitka ostida (DOM)
  labels.style.cssText = 'position:fixed;left:0;right:0;bottom:16%;display:flex;z-index:2147483001;pointer-events:none'
  labels.innerHTML = LINEUP.map(
    (r) => `<div style="flex:1;text-align:center"><span style="font:600 20px system-ui,sans-serif;color:#111;background:rgba(255,255,255,.75);padding:2px 10px;border-radius:6px">${r}</span></div>`,
  ).join('')
  document.body.appendChild(labels)
}

createRoot(host).render(createElement(Lineup, { mode }))
export {}
