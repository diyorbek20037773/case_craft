// Skinli personajning bind-pozadagi AABB si (metr). process.mjs va manifest.mjs ishlatadi.
/** column-major 4x4 ko'paytma */
function mul4(a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
/** Skinli personajning bind-pozadagi AABB si (metr) */
export function skinnedBounds(root) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const skin = node.getSkin()
    let m = node.getWorldMatrix()
    if (skin) {
      const ibm = skin.getInverseBindMatrices()?.getArray()
      const j0 = skin.listJoints()[0]
      m = ibm ? mul4(j0.getWorldMatrix(), Array.from(ibm.slice(0, 16))) : j0.getWorldMatrix()
    }
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION')
      const v = [0, 0, 0]
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v)
        for (let r = 0; r < 3; r++) {
          const w = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]
          if (w < min[r]) min[r] = w
          if (w > max[r]) max[r] = w
        }
      }
    }
  }
  return { min, max }
}

