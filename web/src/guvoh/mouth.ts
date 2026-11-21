// Og'iz: Meshy modelida yuz blendshape'i ham, jag' suyagi ham yo'q. Shuning uchun brauzerda vertex shader orqali
// "jag'" yasaymiz: og'iz chizig'idan pastdagi, iyak markazi atrofidagi ellipsoid ichidagi verteks larni jag' bo'g'imi
// o'qi (X) atrofida kichik burchakka buramiz (pastga + biroz orqaga). Deformatsiya skinningdan OLDIN, bind-pozada
// bajariladi — shuning uchun iyak Head suyagi bilan birga harakatlanadi. Lablar orasidagi cho'zilgan yupqa tasma
// fragment shaderda to'q rangga bo'yaladi (og'iz ichi illyuziyasi), lekin amplituda kichik — "qora tuynuk" chiqmasin.
//
// Keyingi qadam (Blender bilan, hozir o'rnatilmagan): boshga jawOpen/viseme shape key lar (yoki Jaw suyagi + vazn)
// qo'shib eksport qilish; shunda bu patch o'rniga oddiy morphTargetInfluences ishlatiladi (proto/Witness.tsx dagidek).
import * as THREE from 'three'
import face from './face.json'

export type FaceConfig = typeof face

export interface MouthRig {
  /** 0..1 — og'iz ochilishi (har kadrda yoziladi) */
  open: { value: number }
  /** ?debug=1 — sohani ko'rsatish */
  debug: { value: number }
  config: FaceConfig
  /** barcha uniformlar (debug: brauzer konsolidan sozlash) */
  uniforms: Record<string, { value: unknown }>
}

/**
 * Materialni patch qiladi. attrToChar: atribut fazosi (meshopt kvantlangan) -> personaj bind fazosi (metr).
 * headBind: Head suyagining bind-pozitsiyasi personaj fazosida.
 */
export function patchMouth(material: THREE.MeshStandardMaterial, attrToChar: THREE.Matrix4, headBind: THREE.Vector3, config: FaceConfig = face): MouthRig {
  // MUHIM: three.js onBeforeCompile ni faqat birinchi kompilyatsiyada chaqiradi (dastur keshda bo'lsa qayta chaqirmaydi).
  // Shuning uchun material bir marta patch qilinadi; qayta chaqirilsa — o'sha uniformlar qaytariladi.
  const existing = material.userData.mouthRig as MouthRig | undefined
  if (existing) return existing
  const h = headBind
  const rel = (v: number[]) => new THREE.Vector3(v[0] + h.x, v[1] + h.y, v[2] + h.z)
  const uniforms = {
    uOpen: { value: 0 },
    uDebug: { value: 0 },
    uAttrToChar: { value: attrToChar.clone() },
    uCharToAttr: { value: attrToChar.clone().invert() },
    uChin: { value: rel(config.chin) },
    uRad: { value: new THREE.Vector3(...config.radius) },
    uHinge: { value: rel(config.hinge) },
    uMouthY: { value: config.mouthY + h.y },
    uHalfW: { value: config.mouthHalfWidth },
    uMaxAngle: { value: config.maxAngle },
    uBack: { value: config.back },
    uLipBand: { value: config.lipBand },
    uLipW: { value: config.lipWeight },
    uSeamGap: { value: config.seamGap },
    uSeamDark: { value: config.seamDarken },
    uFrontZ: { value: config.frontZ + h.z },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uOpen; uniform mat4 uAttrToChar; uniform mat4 uCharToAttr;
uniform vec3 uChin; uniform vec3 uRad; uniform vec3 uHinge;
uniform float uMouthY; uniform float uMaxAngle; uniform float uBack;
uniform float uLipBand; uniform float uLipW; uniform float uSeamGap; uniform float uFrontZ;
varying vec3 vCharPos; varying float vJawW;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  vec3 pc = (uAttrToChar * vec4(transformed, 1.0)).xyz;
  vCharPos = pc;
  vec3 q = (pc - uChin) / uRad;
  float w = 1.0 - smoothstep(0.55, 1.0, length(q));
  float below = uMouthY - pc.y;
  // og'iz chizig'ida 0 -> seamGap pastda 1 (lablar orasidagi cho'zilish shu tasmada)
  w *= smoothstep(-0.0005, uSeamGap, below);
  // pastki lab — yengil, iyak — to'liq
  w *= mix(uLipW, 1.0, smoothstep(uSeamGap, uSeamGap + uLipBand, below));
  // faqat yuzning old qismi (bo'yin/ensa qimirlamasin)
  w *= smoothstep(uFrontZ - 0.03, uFrontZ, pc.z);
  vJawW = w;
  float a = uOpen * uMaxAngle * w;
  if (a > 0.0) {
    vec2 r = pc.yz - uHinge.yz;
    float c = cos(a), s = sin(a);
    pc.yz = uHinge.yz + vec2(r.x * c - r.y * s, r.x * s + r.y * c);
    pc.z -= uBack * uOpen * w;
    transformed = (uCharToAttr * vec4(pc, 1.0)).xyz;
  }
}`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uOpen; uniform float uDebug; uniform vec3 uChin;
uniform float uMouthY; uniform float uHalfW; uniform float uSeamGap; uniform float uSeamDark; uniform float uFrontZ;
varying vec3 vCharPos; varying float vJawW;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
{
  float dx = abs(vCharPos.x - uChin.x) / uHalfW;
  float lens = 1.0 - smoothstep(0.55, 1.0, dx);
  // tasma bind-fazoda: [mouthY - seamGap*(1-dx^2), mouthY]
  float depth = uSeamGap * (1.0 - dx * dx);
  float yIn = uMouthY - vCharPos.y;
  float band = smoothstep(-0.0004, 0.0004, yIn) * (1.0 - smoothstep(depth * 0.6, depth, yIn));
  float front = step(uFrontZ, vCharPos.z);
  float m = lens * band * front * smoothstep(0.08, 0.5, uOpen) * uSeamDark;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.025, 0.025), m);
  if (uDebug > 0.5) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.1, 0.1), vJawW * 0.6);
    float line = (1.0 - smoothstep(0.0, 0.0007, abs(vCharPos.y - uMouthY))) * (1.0 - step(1.3, dx)) * front;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 1.0, 0.2), line);
  }
}`,
      )
  }
  material.customProgramCacheKey = () => 'guvoh-mouth-v1'
  material.needsUpdate = true
  const rig: MouthRig = { open: uniforms.uOpen, debug: uniforms.uDebug, config, uniforms }
  material.userData.mouthRig = rig
  return rig
}
