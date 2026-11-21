// Barcha 3D asset yo'llari shu yerda. Yangi model kelsa — faqat shu faylni o'zgartiring.
// Yo'l `null` bo'lsa yoki fayl yuklanmasa (404, buzilgan fayl), sahna avtomatik placeholder ga qaytadi
// (ErrorBoundary + Suspense). Runtime da fayl mavjudligi oldindan tekshirilmaydi.
// Mualliflar: public/models/CREDITS.md (ilovada "Mualliflar" oynasi shu faylni ko'rsatadi).

import type { PresetsType } from '@react-three/drei/helpers/environment-assets'
import type { SpeakerId, Vec3 } from './layout'

export interface CourtModelConfig {
  /** Masalan '/models/court.glb'. null — kod bilan yig'ilgan zal */
  url: string | null
  scale: number
  position: Vec3
  rotationY: number
}

export interface CharacterModelConfig {
  url: string
  /** Model shu balandlikka (metr) avtomatik masshtablanadi */
  height: number
  /** Palitra teksturasidagi ranglarni almashtirish: { '7e7d5e': '1b1b22' } (sudya mantiyasi uchun) */
  recolor?: Record<string, string>
  /** Yashiriladigan qismlar (GLB primitiv tartib raqami), masalan sudyaning shlyapasi */
  hideParts?: number[]
}

export interface PropConfig {
  url: string
  position: Vec3
  rotationY?: number
  /** Qaysi o'q bo'yicha o'lcham beriladi va necha metr */
  fit: { axis: 'x' | 'y' | 'z'; size: number }
}

export interface TextureSet {
  map: string
  normalMap?: string
}

/** Draco siqilgan .glb uchun dekoder (lokal, internetsiz). Meshopt dekoderi drei ichida bor. */
export const DRACO_PATH = '/draco/'

export const CREDITS_URL = '/models/CREDITS.md'

const M = '/models'
// Quaternius GLB nusxalarida teri rangi deyarli qora (1f1f1f) — tabiiy rangga almashtiriladi
const SKIN = { '1f1f1f': 'c8916f' }
const T = `${M}/textures`
const F = `${M}/furniture`

export const ASSETS = {
  /** To'liq zal modeli. Kelganda: url: '/models/court.glb' va scale/position ni moslang */
  court: {
    url: null,
    scale: 1,
    position: [0, 0, 0],
    rotationY: 0,
  } as CourtModelConfig,

  /** HDRI yorug'lik muhiti. Yuklanmasa — envPreset (CDN), u ham bo'lmasa — lokal Lightformer muhit */
  hdri: '/hdri/small_empty_room_3_1k.hdr' as string | null,
  envPreset: 'apartment' as PresetsType | null,

  /** Kod bilan yig'ilgan zal teksturalari (Poly Haven, CC0). null — oddiy rang */
  textures: {
    floor: { map: `${T}/wood_floor_deck_diff_1k.jpg`, normalMap: `${T}/wood_floor_deck_nor_gl_1k.jpg` },
    wood: { map: `${T}/dark_wood_diff_1k.jpg`, normalMap: `${T}/dark_wood_nor_gl_1k.jpg` },
    wall: { map: `${T}/beige_wall_001_diff_1k.jpg`, normalMap: `${T}/beige_wall_001_nor_gl_1k.jpg` },
  } as { floor: TextureSet; wood: TextureSet; wall: TextureSet } | null,

  /** Personaj modellari (Quaternius, CC0, meshopt). null — kapsula + bosh placeholder */
  characters: {
    judge: {
      url: `${M}/characters/OldClassy_Male.glb`,
      height: 1.78,
      // shim va kamzul -> qora mantiya, shlyapa yashiriladi (6-qism: Hat)
      recolor: { ...SKIN, '7e7d5e': '17171c', '8f5c36': '1d1d23' },
      hideParts: [6],
    },
    prosecutor: { url: `${M}/characters/Suit_Male.glb`, height: 1.8, recolor: SKIN },
    witness: { url: `${M}/characters/Casual_Male.glb`, height: 1.76, recolor: SKIN },
    clerk: { url: `${M}/characters/Suit_Female.glb`, height: 1.68, recolor: { ...SKIN, '1f1f1f': 'd9a383' } },
    defendant: { url: `${M}/characters/Casual2_Female.glb`, height: 1.68, recolor: { '1f1f1f': 'b98263' } },
  } as Record<SpeakerId, CharacterModelConfig | null>,

  /** Mebel va bezak (Quaternius, CC0). Har biri alohida yuklanadi, xatoda shunchaki ko'rinmaydi */
  props: [
    // raislik qiluvchi orqasidagi ustunlar
    { url: `${F}/Column_SquareBig.glb`, position: [-3.95, 0, -7.55], fit: { axis: 'y', size: 4.6 } },
    { url: `${F}/Column_SquareBig.glb`, position: [3.95, 0, -7.55], fit: { axis: 'y', size: 4.6 } },
    // qandillar
    { url: `${F}/Light_Chandelier.glb`, position: [0, 3.55, -2.4], fit: { axis: 'y', size: 1.05 } },
    { url: `${F}/Light_Chandelier.glb`, position: [0, 3.55, 4.4], fit: { axis: 'y', size: 1.05 } },
    // kotib orqasidagi javon, eshik, deraza, gilam, gul
    { url: `${F}/Shelf_Large.glb`, position: [-6.6, 0, -5.9], rotationY: Math.PI / 2, fit: { axis: 'y', size: 2.2 } },
    { url: `${F}/Door_Double.glb`, position: [6.95, 0, -3.6], rotationY: -Math.PI / 2, fit: { axis: 'y', size: 2.8 } },
    { url: `${F}/Window_Large1.glb`, position: [-6.95, 1.0, 1.6], rotationY: Math.PI / 2, fit: { axis: 'y', size: 2.4 } },
    { url: `${F}/Window_Large1.glb`, position: [-6.95, 1.0, 5.4], rotationY: Math.PI / 2, fit: { axis: 'y', size: 2.4 } },
    { url: `${F}/Carpet_1.glb`, position: [0, 0.006, 1.6], rotationY: Math.PI / 2, fit: { axis: 'x', size: 3.2 } },
    { url: `${F}/Houseplant_2.glb`, position: [-6.3, 0, -7.3], fit: { axis: 'y', size: 1.3 } },
    { url: `${F}/Houseplant_2.glb`, position: [6.3, 0, -7.3], fit: { axis: 'y', size: 1.3 } },
  ] as PropConfig[],

  /** Stollar yonidagi stullar (layout.ts dagi o'rinlarga mos). Yuklanmasa — kod bilan chizilgan stul */
  chairs: {
    url: `${F}/Chair_1.glb`,
    judgeUrl: `${F}/Chair_2.glb`,
    height: 1.0,
    judgeHeight: 1.35,
  },
}
