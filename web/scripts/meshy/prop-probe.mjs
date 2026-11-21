// Jihoz diagnostikasi (yozmaydi): o'lcham, hajm markazi va qaysi tomonga ko'proq sirt qaragani.
// node prop-probe.mjs <glb> [<glb> ...]   (meshopt-siqilgan public fayllarni ham o'qiydi)
// "old tomoni" taxmini: ±X / ±Z yo'nalishlariga qaragan uchburchak yuzalari yig'indisi (yuz bilan tortilgan normal).
// Meshy odatda oldni +Z ga qaratadi; bu raqamlar faqat yordamchi — yakuniy qaror vizual tekshiruvda.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'
import { statSync } from 'node:fs'
import { basename } from 'node:path'

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

export async function probeProp(file) {
  const doc = await io.read(file)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  const b = getBounds(scene)
  const dims = [0, 1, 2].map((i) => b.max[i] - b.min[i])
  const area = { '+X': 0, '-X': 0, '+Y': 0, '-Y': 0, '+Z': 0, '-Z': 0 }
  const centroid = [0, 0, 0]
  const profileZ = new Array(8).fill(0)
  const profileX = new Array(8).fill(0)
  let total = 0
  let tris = 0
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    const tf = (v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r])
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION')
      const idx = p.getIndices()
      const n = idx ? idx.getCount() : pos.getCount()
      const a = [0, 0, 0], bb = [0, 0, 0], c = [0, 0, 0]
      for (let i = 0; i < n; i += 3) {
        pos.getElement(idx ? idx.getScalar(i) : i, a)
        pos.getElement(idx ? idx.getScalar(i + 1) : i + 1, bb)
        pos.getElement(idx ? idx.getScalar(i + 2) : i + 2, c)
        const A = tf(a), B = tf(bb), C = tf(c)
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
        const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]
        const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        const s = Math.hypot(...cr) / 2
        if (!s) continue
        tris++
        total += s
        for (let k = 0; k < 3; k++) centroid[k] += ((A[k] + B[k] + C[k]) / 3) * s
        // yopiq meshda yuza har doim muvozanatda — shuning uchun uchburchak SONI (detal zichligi) olinadi:
        // Meshy rasmdan generatsiya qilganda old tomonda detal ko'proq bo'ladi
        const ax = ['X', 'Y', 'Z']
        const k = [0, 1, 2].reduce((best, i) => (Math.abs(cr[i]) > Math.abs(cr[best]) ? i : best), 0)
        area[(cr[k] >= 0 ? '+' : '-') + ax[k]] += 1
        // yon profil: Z bo'ylab 8 bo'lak, har birida eng baland nuqta
        const zc = (A[2] + B[2] + C[2]) / 3
        const bin = Math.min(7, Math.max(0, Math.floor(((zc - b.min[2]) / (dims[2] || 1)) * 8)))
        profileZ[bin] = Math.max(profileZ[bin], Math.max(A[1], B[1], C[1]) - b.min[1])
        const xc = (A[0] + B[0] + C[0]) / 3
        const xb = Math.min(7, Math.max(0, Math.floor(((xc - b.min[0]) / (dims[0] || 1)) * 8)))
        profileX[xb] = Math.max(profileX[xb], Math.max(A[1], B[1], C[1]) - b.min[1])
      }
    }
  }
  for (let k = 0; k < 3; k++) centroid[k] = centroid[k] / total
  // markaz siljishi (o'lchamga nisbatan): massa qaysi tomonda
  const offset = [0, 1, 2].map((k) => (centroid[k] - (b.min[k] + b.max[k]) / 2) / (dims[k] || 1))
  const horiz = ['+X', '-X', '+Z', '-Z'].sort((x, y) => area[y] - area[x])
  return {
    file: basename(file),
    mb: +(statSync(file).size / 1048576).toFixed(2),
    triangles: tris,
    sizeMeters: dims.map((x) => +x.toFixed(3)),
    min: b.min.map((x) => +x.toFixed(3)),
    max: b.max.map((x) => +x.toFixed(3)),
    trianglesFacing: Object.fromEntries(Object.entries(area).map(([k, v]) => [k, +(v / tris).toFixed(3)])),
    centroidOffset: { x: +offset[0].toFixed(3), y: +offset[1].toFixed(3), z: +offset[2].toFixed(3) },
    mostDetailFacing: horiz[0],
    // -Z dan +Z gacha / -X dan +X gacha har bo'lakdagi eng baland nuqta (metr)
    profileZ: profileZ.map((x) => +x.toFixed(2)),
    profileX: profileX.map((x) => +x.toFixed(2)),
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'prop-probe.mjs') {
  for (const f of process.argv.slice(2)) console.log(JSON.stringify(await probeProp(f)))
}
