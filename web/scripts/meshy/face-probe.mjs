#!/usr/bin/env node
// Bosh geometriyasidan og'iz/iyak sozlamasi uchun boshlang'ich qiymatlarni taxmin qiladi (src/guvoh/face.json ga).
// Ishlatish: node face-probe.mjs <asl yoki tayyor .glb>
// Koordinatalar: mesh bind-pozasi (metr, +Y yuqori, +Z oldinga), Head suyagi bind-pozitsiyasiga nisbatan.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
const root = doc.getRoot()
const skin = root.listSkins()[0]
const joints = skin.listJoints()
const hi = joints.findIndex((j) => /^head$/i.test(j.getName()))
const ibm = skin.getInverseBindMatrices().getArray()
const m = Array.from(ibm.slice(hi * 16, hi * 16 + 16))
// Head bind-dunyo pozitsiyasi = inverse(IBM).translation
const s2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2]
const head = [0, 1, 2].map((c) => -(m[c * 4] * m[12] + m[c * 4 + 1] * m[13] + m[c * 4 + 2] * m[14]) / s2)
const prim = root.listMeshes()[0].listPrimitives()[0]
const P = prim.getAttribute('POSITION')
const J = prim.getAttribute('JOINTS_0')
const W = prim.getAttribute('WEIGHTS_0')
const v = [], j = [], w = []
const pts = []
for (let i = 0; i < P.getCount(); i++) {
  P.getElement(i, v); J.getElement(i, j); W.getElement(i, w)
  let hw = 0
  for (let k = 0; k < 4; k++) if (j[k] === hi) hw += w[k]
  pts.push([v[0], v[1], v[2], hw])
}
const headPts = pts.filter((p) => p[3] > 0.3)
const ys = headPts.map((p) => p[1])
const yMin = Math.min(...ys), yMax = Math.max(...ys)
console.log('Head bind pos', head.map((x) => +x.toFixed(4)), 'head verts', headPts.length, 'y', yMin.toFixed(3), '..', yMax.toFixed(3))
// Old profil: |x| < 1 sm bo'lgan verteks larning eng oldingi z si, y bo'yicha 3 mm qadam
console.log(' y(rel head)   zFront(rel)   headW')
for (let y = yMax; y > yMin - 0.08; y -= 0.003) {
  let best = null
  for (const p of pts) if (Math.abs(p[0]) < 0.01 && Math.abs(p[1] - y) < 0.0015 && (!best || p[2] > best[2])) best = p
  if (best) console.log((y - head[1]).toFixed(3).padStart(8), (best[2] - head[2]).toFixed(4).padStart(12), best[3].toFixed(2).padStart(8))
}
