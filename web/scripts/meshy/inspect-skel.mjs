// Diagnostika: Meshy GLB larning skeleti va kliplarini solishtirish (yozmaydi).
// node inspect-skel.mjs <papka|glb> [<papka|glb> ...]
//   Birinchi topilgan skinli fayl — asos (masalan guvoh). Meshopt-siqilgan public fayllarni ham o'qiydi.
//   Skinsiz fayllar (jihozlar) o'tkazib yuboriladi.
//   node inspect-skel.mjs ../../public/models/meshy/guvoh.glb ../../public/models/meshy
// Oxirida XULOSA: suyak nomlari/tartibi/ierarxiyasi, qo'l zanjirida bola suyak +Y o'qida yotishi (arms.ts shunga tayanadi),
// qo'l suyaklarining dam olish (rest) burilishi asosdan qancha farq qilishi (gradus) va suyak uzunligi nisbati.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { readdirSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

const inputs = process.argv.slice(2)
if (!inputs.length) {
  console.error('node inspect-skel.mjs <papka|glb> [...]')
  process.exit(1)
}
const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (extname(p).toLowerCase() === '.glb' && !files.includes(p)) files.push(p)
  }
}
for (const i of inputs) statSync(i).isDirectory() ? walk(i) : files.includes(i) || files.push(i)

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const f3 = (a) => a.map((x) => x.toFixed(3)).join(',')
const qAngle = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180) / Math.PI
const ARM = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']
let base = null
const summary = []
for (const f of files) {
  if (/-mobile\.glb$/i.test(f)) continue // mobil variant skeleti asosiysi bilan bir xil
  const doc = await io.read(f)
  const r = doc.getRoot()
  const skin = r.listSkins()[0]
  if (!skin) continue
  const joints = skin.listJoints()
  const ibm = skin.getInverseBindMatrices()?.getArray()
  const parentOf = new Map()
  for (const n of r.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n)
  console.log('\n==', basename(f), 'anims:', r.listAnimations().map((a) => a.getName()).join('|'), 'nodes:', r.listNodes().length)
  let p = joints[0]
  const chain = []
  while (p) {
    chain.push(`${p.getName()}[t ${f3(p.getTranslation())} r ${f3(p.getRotation())} s ${f3(p.getScale())}]`)
    p = parentOf.get(p)
  }
  console.log(' hips chain:', chain.join(' <- '))
  const sig = joints.map((j, i) => ({
    n: j.getName(),
    parent: parentOf.get(j)?.getName() ?? null,
    t: j.getTranslation(),
    r: j.getRotation(),
    len: Math.hypot(...j.getTranslation()),
    ibm: ibm ? Array.from(ibm.slice(i * 16, i * 16 + 16)) : null,
  }))
  // arms.ts: suyak o'qi +Y — qo'l zanjirida bola suyak translation i deyarli +Y bo'ylab bo'lishi kerak
  const yAxisOk = ARM.every((name) => {
    const child = joints.find((j) => parentOf.get(j)?.getName() === name)
    if (!child) return true
    const t = child.getTranslation()
    return t[1] / (Math.hypot(...t) || 1) > 0.98
  })
  const row = { file: basename(f), joints: sig.length, yAxisOk }
  if (!base) {
    base = sig
    row.base = true
  } else {
    let maxT = 0, maxR = 0, maxI = 0
    const missing = []
    for (const a of sig) {
      const b = base.find((x) => x.n === a.n)
      if (!b) {
        missing.push(a.n)
        continue
      }
      maxT = Math.max(maxT, ...a.t.map((x, k) => Math.abs(x - b.t[k])))
      maxR = Math.max(maxR, ...a.r.map((x, k) => Math.abs(x - b.r[k])))
      if (a.ibm && b.ibm) maxI = Math.max(maxI, ...a.ibm.map((x, k) => Math.abs(x - b.ibm[k])))
    }
    const orderSame = sig.length === base.length && sig.every((s, i) => s.n === base[i].n)
    const parentsSame = sig.every((s) => base.find((x) => x.n === s.n)?.parent === s.parent || s === sig[0])
    const armRestDeg = Object.fromEntries(
      ARM.map((n) => {
        const a = sig.find((x) => x.n === n)
        const b = base.find((x) => x.n === n)
        return [n, a && b ? +qAngle(a.r, b.r).toFixed(1) : null]
      }),
    )
    const lenRatio = sig.filter((s) => base.find((x) => x.n === s.n)?.len > 1e-4).map((s) => s.len / base.find((x) => x.n === s.n).len)
    Object.assign(row, {
      orderSame,
      parentsSame,
      missing,
      maxdT: +maxT.toFixed(4),
      maxdR: +maxR.toFixed(4),
      maxdIBM: +maxI.toFixed(4),
      armRestDeg,
      boneLenRatio: [+Math.min(...lenRatio).toFixed(3), +Math.max(...lenRatio).toFixed(3)],
    })
    console.log(` vs asos: maxdT ${row.maxdT} maxdR ${row.maxdR} maxdIBM ${row.maxdIBM} tartib bir xil: ${orderSame} ierarxiya bir xil: ${parentsSame}`)
  }
  summary.push(row)
  for (const a of r.listAnimations()) {
    const out = []
    for (const ch of a.listChannels()) {
      const n = ch.getTargetNode().getName()
      if (!['Hips', 'Spine02', 'Head', 'neck', 'LeftArm'].includes(n)) continue
      const arr = ch.getSampler().getOutput().getArray()
      const k = ch.getTargetPath() === 'rotation' ? 4 : 3
      out.push(`${n}.${ch.getTargetPath()[0]} f0=${f3(Array.from(arr.slice(0, k)))}`)
    }
    console.log(' ', a.getName(), out.join(' | '))
  }
}
console.log('\n===== XULOSA (asos: ' + (summary[0]?.file ?? '-') + ') =====')
for (const s of summary) console.log(JSON.stringify(s))
