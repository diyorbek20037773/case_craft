// Tezkor diagnostika: GLB ning faqat JSON qismini o'qiydi (geometriya/teksturani yuklamaydi).
// node probe.mjs <glb | papka>  -> har fayl: kliplar, suyaklar soni, mesh/uchburchak taxmini
import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const isMain = basename(process.argv[1] ?? '') === 'probe.mjs'
const target = process.argv[2]
if (isMain && !target) {
  console.error('node probe.mjs <glb|papka>')
  process.exit(1)
}
const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (extname(p).toLowerCase() === '.glb') files.push(p)
  }
}
if (isMain) statSync(target).isDirectory() ? walk(target) : files.push(target)

export function readGlbJson(file) {
  const fd = openSync(file, 'r')
  const head = Buffer.alloc(20)
  readSync(fd, head, 0, 20, 0)
  const len = head.readUInt32LE(12)
  const buf = Buffer.alloc(len)
  readSync(fd, buf, 0, len, 20)
  closeSync(fd)
  return JSON.parse(buf.toString('utf8'))
}

for (const f of files) {
  const j = readGlbJson(f)
  const anims = (j.animations ?? []).map((a) => {
    const dur = Math.max(...a.samplers.map((s) => j.accessors[s.input].max?.[0] ?? 0))
    return `${a.name}(${dur.toFixed(2)}s)`
  })
  let tris = 0
  for (const m of j.meshes ?? []) for (const p of m.primitives) tris += (p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3
  const skin = j.skins?.[0]
  console.log(`== ${basename(f)} (${(statSync(f).size / 1048576).toFixed(1)} MB)`)
  console.log(`   kliplar: ${anims.join(', ') || '-'}`)
  console.log(`   suyaklar: ${skin ? skin.joints.length : 0}; uchburchak: ${tris}; teksturalar: ${(j.images ?? []).length}`)
}
