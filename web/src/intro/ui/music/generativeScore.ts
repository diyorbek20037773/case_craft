// Generativ fon musiqasi (WebAudio sintez, fayl/tarmoq yo‘q).
// Sokin, tantanali "orkestr + yumshoq elektron": torli pad, past violonchel-dron, siyrak selesta notalari.
// D eol (modal minor), ~64 BPM, akkord har 8–12 s da almashadi. Seed’li tasodif — har safar bir xil "kompozitsiya".

/** Qatlamlar ko‘paytuvchisi (0..1): drone — violonchel-dron, pad — torli pad */
export type ScoreLayers = { drone?: number; pad?: number }

export type Score = {
  stop(fadeSec?: number): void
  setIntensity(x: number): void
  /** Partiturani yupqalashtirish/qaytarish, masalan case: { drone: 0, pad: 0.9 } (sekin, ~1.5 s) */
  setLayers(l: ScoreLayers): void
}

export type ScoreOptions = {
  /** Kompozitsiya seed’i (standart: doimiy) */
  seed?: number
  /** Boshlang‘ich intensivlik 0..1 */
  intensity?: number
  /** Boshlang‘ich qatlamlar (standart: hammasi 1) */
  layers?: ScoreLayers
  /** Sekin kompyuter (quality==='low'): chorus yo‘q, reverb 1.8 s */
  lite?: boolean
  /** Faqat test uchun (OfflineAudioContext): shuncha soniyani darhol rejalashtirish */
  prescheduleSec?: number
}

const BPM = 64
const BEAT = 60 / BPM
const LOOKAHEAD = 0.7 // s — setInterval(200 ms) dan katta zaxira
const TICK_MS = 200
const FADE_IN = 4
// chiqish RMS ≈ −24 dBFS, peak ≈ 0.28 (intensity 1). Hisob: music/README.md "Daraja" bo‘limi.
const MASTER_LEVEL = 0.42
const PAD_LEVEL = 0.045
const DRONE_LEVEL = 0.075
const BELL_LEVEL = 0.3
const MAX_BELLS = 4 // pad 4 + dron 1 + qo‘ng‘iroq 4 = 9 ovoz

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Chord = { bass: number; pad: [number, number, number, number]; next: [number, number][] }

// D eol + bitta dorian rang (G/D). pad — 4 ovoz, pastdan yuqoriga.
const CHORDS: Chord[] = [
  /* 0 Dm(add9) */ { bass: 38, pad: [53, 57, 62, 64], next: [[1, 3], [3, 2], [4, 2], [5, 1], [2, 1]] },
  /* 1 Bbmaj7   */ { bass: 34, pad: [53, 57, 58, 62], next: [[2, 2], [3, 3], [4, 2], [0, 1]] },
  /* 2 F(add9)  */ { bass: 41, pad: [53, 57, 60, 67], next: [[3, 3], [1, 2], [0, 2]] },
  /* 3 Csus2    */ { bass: 36, pad: [55, 60, 62, 64], next: [[0, 3], [6, 2], [2, 2], [1, 1]] },
  /* 4 Gm7      */ { bass: 43, pad: [55, 58, 62, 65], next: [[0, 2], [1, 2], [6, 2]] },
  /* 5 G6/D     */ { bass: 38, pad: [55, 59, 62, 64], next: [[0, 4]] },
  /* 6 Am7      */ { bass: 45, pad: [55, 60, 64, 69], next: [[0, 2], [1, 3], [2, 1]] },
]

const AEOLIAN_PCS = [2, 4, 5, 7, 9, 10, 0]
const MEL_LO = 67
const MEL_HI = 86

const RHYTHMS: number[][] = [
  [2, 1, 1],
  [1, 1, 2],
  [3, 1],
  [2, 2],
  [1.5, 0.5, 2],
  [1, 2],
  [2, 1, 1, 2],
]

type Note = { time: number; midi: number; vel: number; pan: number }

function makeImpulse(ctx: BaseAudioContext, seconds: number, seed: number) {
  const rng = mulberry32(seed)
  const sr = ctx.sampleRate
  const len = Math.floor(sr * seconds)
  const pre = Math.floor(sr * 0.018)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let y = 0
    let peak = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr
      const x = rng() * 2 - 1
      // vaqt o‘tgani sari quyuqroq dum (one-pole lowpass koeffitsienti kamayadi)
      const a = 0.85 * Math.exp(-t * 1.6) + 0.08
      y += a * (x - y)
      const env = Math.exp((-t * 6.9) / seconds) * Math.min(1, t / 0.006)
      d[i] = y * env
      if (Math.abs(d[i]) > peak) peak = Math.abs(d[i])
    }
    if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak * 6
  }
  return buf
}

type PadVoice = { oscs: OscillatorNode[]; gain: GainNode; midi: number; level: number; cur: number }

export function startScore(ctx: BaseAudioContext, out: AudioNode, opts: ScoreOptions = {}): Score {
  const rng = mulberry32(opts.seed ?? 0xca5ec0de)
  const persistentOsc: OscillatorNode[] = []
  const nodes: AudioNode[] = []
  const track = <T extends AudioNode>(n: T): T => {
    nodes.push(n)
    return n
  }
  const osc = (type: OscillatorType, freq: number, detune = 0) => {
    const o = track(ctx.createOscillator())
    o.type = type
    o.frequency.value = freq
    o.detune.value = detune
    persistentOsc.push(o)
    return o
  }
  const gainNode = (v: number) => {
    const g = track(ctx.createGain())
    g.gain.value = v
    return g
  }

  const t0 = ctx.currentTime + 0.06
  let intensity = Math.min(1, Math.max(0, opts.intensity ?? 0))
  const lite = opts.lite === true
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

  // ---- master: mix → kompressor → master gain → fade → out
  const mix = gainNode(1)
  const comp = track(ctx.createDynamicsCompressor())
  comp.threshold.value = -20
  comp.knee.value = 10
  comp.ratio.value = 3
  comp.attack.value = 0.05
  comp.release.value = 0.5
  const master = gainNode(MASTER_LEVEL)
  const fade = gainNode(0)
  fade.gain.setValueAtTime(0, t0)
  fade.gain.linearRampToValueAtTime(1, t0 + FADE_IN)
  mix.connect(comp).connect(master).connect(fade).connect(out)

  // ---- reverb (generatsiya qilingan impuls ~3 s)
  const verbIn = gainNode(1)
  const verbHp = track(ctx.createBiquadFilter())
  verbHp.type = 'highpass'
  verbHp.frequency.value = 160
  const verb = track(ctx.createConvolver())
  verb.buffer = makeImpulse(ctx, lite ? 1.8 : 3.0, 0x5eed)
  const verbOut = gainNode(0.9)
  verbIn.connect(verbHp).connect(verb).connect(verbOut).connect(mix)

  // ---- torli pad: 4 ovoz × (saw + triangle, detune) → lowpass (sekin LFO) → chorus
  const padBus = gainNode(1)
  const padLp = track(ctx.createBiquadFilter())
  padLp.type = 'lowpass'
  padLp.Q.value = 0.6
  padLp.frequency.value = 760 + 260 * intensity
  const filtLfo = osc('sine', 0.045)
  const filtDepth = gainNode(320)
  filtLfo.connect(filtDepth).connect(padLp.frequency)
  padBus.connect(padLp)
  // qatlam ko‘paytuvchisi (setLayers) — dry, chorus va reverb yuborishdan oldin
  const padLayer = gainNode(clamp01(opts.layers?.pad ?? 1))
  padLp.connect(padLayer)

  const padDry = gainNode(lite ? 0.85 : 0.75)
  padLayer.connect(padDry).connect(mix)
  const chorusSides: [number, number, number, number][] = [
    [0.013, 0.11, 0.0022, -0.65],
    [0.019, 0.163, 0.0027, 0.65],
  ]
  for (const [base, rate, depth, panV] of lite ? [] : chorusSides) {
    const dl = track(ctx.createDelay(0.05))
    dl.delayTime.value = base
    const lfo = osc('sine', rate)
    const lfoG = gainNode(depth)
    lfo.connect(lfoG).connect(dl.delayTime)
    const pan = track(ctx.createStereoPanner())
    pan.pan.value = panV
    const g = gainNode(0.45)
    padLayer.connect(dl).connect(g).connect(pan).connect(mix)
  }
  const padSend = gainNode(0.55)
  padLayer.connect(padSend).connect(verbIn)

  const voiceWeights = [1, 0.9, 0.8, 0.62]
  const first = CHORDS[0]
  const pad: PadVoice[] = first.pad.map((m, i) => {
    const g = gainNode(0)
    const jitter = (rng() - 0.5) * 4
    const a = osc('sawtooth', midiHz(m), -7 + jitter)
    const b = osc('triangle', midiHz(m), 7 + jitter)
    a.connect(g)
    b.connect(g)
    g.connect(padBus)
    return { oscs: [a, b], gain: g, midi: m, level: PAD_LEVEL * voiceWeights[i], cur: 0 }
  })

  // ---- violonchel-dron: saw (lowpass) + sine, yengil vibrato
  const droneG = gainNode(0)
  const droneLp = track(ctx.createBiquadFilter())
  droneLp.type = 'lowpass'
  droneLp.frequency.value = 340
  droneLp.Q.value = 0.9
  const droneSaw = osc('sawtooth', midiHz(first.bass))
  const droneSine = osc('sine', midiHz(first.bass), 3)
  const vib = osc('sine', 4.6)
  const vibG = gainNode(4) // cents
  vib.connect(vibG)
  vibG.connect(droneSaw.detune)
  vibG.connect(droneSine.detune)
  droneSaw.connect(droneLp)
  droneSine.connect(droneLp)
  const droneLayer = gainNode(clamp01(opts.layers?.drone ?? 1))
  droneLp.connect(droneG).connect(droneLayer).connect(mix)
  const droneSend = gainNode(0.3)
  droneLayer.connect(droneSend).connect(verbIn)
  const drone = { midi: first.bass, cur: 0 }

  // ---- melodik qatlam (setIntensity bilan boshqariladi)
  const melBus = gainNode(intensity)
  const melDry = gainNode(0.8)
  const melSend = gainNode(0.8)
  melBus.connect(melDry).connect(mix)
  melBus.connect(melSend).connect(verbIn)

  for (const o of persistentOsc) o.start(t0)

  // ---------- rejalashtirish ----------
  let stopped = false
  let timer: ReturnType<typeof setInterval> | 0 = 0
  let chordIdx = 0
  let nextChordAt = t0
  let isFirst = true
  let lastMel = 74
  const melodyQ: Note[] = []
  const activeBells = new Set<{ stopAll(): void }>()

  const pickNext = (c: Chord) => {
    const total = c.next.reduce((s, [, w]) => s + w, 0)
    let r = rng() * total
    for (const [idx, w] of c.next) {
      r -= w
      if (r <= 0) return idx
    }
    return c.next[0][0]
  }

  const scaleFor = (c: Chord) => {
    const pcs = c.pad.some((m) => m % 12 === 11) ? AEOLIAN_PCS.map((p) => (p === 10 ? 11 : p)) : AEOLIAN_PCS
    const notes: number[] = []
    for (let m = MEL_LO; m <= MEL_HI; m++) if (pcs.includes(m % 12)) notes.push(m)
    const chordPcs = new Set([...c.pad.map((m) => m % 12), c.bass % 12])
    return { notes, tones: notes.filter((m) => chordPcs.has(m % 12)) }
  }

  const nearest = (list: number[], m: number) =>
    list.reduce((best, x) => (Math.abs(x - m) < Math.abs(best - m) ? x : best), list[0])

  function planPhrase(c: Chord, startTime: number) {
    const { notes, tones } = scaleFor(c)
    const rhythm = RHYTHMS[Math.floor(rng() * RHYTHMS.length)]
    let m = nearest(tones, lastMel + (rng() < 0.5 ? -2 : 2))
    let t = startTime
    for (let k = 0; k < rhythm.length; k++) {
      const isLast = k === rhythm.length - 1
      if (k > 0) {
        let idx = notes.indexOf(m)
        if (idx < 0) idx = notes.indexOf(nearest(notes, m))
        const steps = [-2, -1, -1, 1, 1, 2]
        let step = steps[Math.floor(rng() * steps.length)]
        if (m > 80 && step > 0 && rng() < 0.7) step = -step
        if (m < 71 && step < 0 && rng() < 0.7) step = -step
        idx = Math.min(notes.length - 1, Math.max(0, idx + step))
        m = notes[idx]
        if (isLast) m = nearest(tones, m)
      }
      const vel = (k === 0 ? 0.95 : isLast ? 0.62 : 0.78) * (0.85 + rng() * 0.15)
      const pan = Math.max(-0.6, Math.min(0.6, ((m - 77) / 14) * 0.5 + (rng() - 0.5) * 0.3))
      melodyQ.push({ time: t, midi: m, vel, pan })
      t += rhythm[k] * BEAT
    }
    lastMel = m
    return t
  }

  function scheduleChord(T: number) {
    const c = CHORDS[chordIdx]
    const beats = 9 + Math.floor(rng() * 5) // 9..13 zarb ≈ 8.4–12.2 s
    const dur = beats * BEAT
    const breathEnd = T + dur - 1.4

    pad.forEach((v, i) => {
      const g = v.gain.gain
      const target = c.pad[i]
      const t = T + (isFirst ? 0 : rng() * 1.1)
      if (isFirst) {
        g.setValueAtTime(0, t)
        g.linearRampToValueAtTime(v.level, t + 3.5)
      } else if (target !== v.midi) {
        g.setValueAtTime(v.cur, t)
        g.linearRampToValueAtTime(v.level * 0.1, t + 1.5)
        for (const o of v.oscs) {
          o.frequency.setValueAtTime(midiHz(v.midi), t + 1.3)
          o.frequency.exponentialRampToValueAtTime(midiHz(target), t + 1.75)
        }
        g.linearRampToValueAtTime(v.level, t + 4)
      } else {
        g.setValueAtTime(v.cur, t)
        g.linearRampToValueAtTime(v.level, t + 3)
      }
      const b = v.level * (0.72 + rng() * 0.28)
      g.linearRampToValueAtTime(b, breathEnd)
      v.cur = b
      v.midi = target
    })

    const dg = droneG.gain
    if (isFirst) {
      dg.setValueAtTime(0, T)
      dg.linearRampToValueAtTime(DRONE_LEVEL, T + 4)
    } else if (c.bass !== drone.midi) {
      dg.setValueAtTime(drone.cur, T)
      dg.linearRampToValueAtTime(DRONE_LEVEL * 0.05, T + 1.6)
      for (const o of [droneSaw, droneSine]) {
        o.frequency.setValueAtTime(midiHz(drone.midi), T + 1.5)
        o.frequency.exponentialRampToValueAtTime(midiHz(c.bass), T + 1.8)
      }
      dg.linearRampToValueAtTime(DRONE_LEVEL, T + 4.2)
    } else {
      dg.setValueAtTime(drone.cur, T)
      dg.linearRampToValueAtTime(DRONE_LEVEL, T + 3)
    }
    const db = DRONE_LEVEL * (0.75 + rng() * 0.25)
    dg.linearRampToValueAtTime(db, breathEnd)
    drone.cur = db
    drone.midi = c.bass

    // melodiya: har doim rejalashtiriladi (determinizm uchun), lekin faqat intensivlik > 0 bo‘lsa chalinadi
    if (!isFirst && rng() < 0.78) {
      const start = T + (1 + Math.floor(rng() * 3)) * BEAT
      const end = planPhrase(c, start)
      if (beats >= 11 && rng() < 0.4) planPhrase(c, end + 2 * BEAT)
    }

    isFirst = false
    nextChordAt = T + dur
    chordIdx = pickNext(c)
  }

  function playBell(n: Note) {
    if (activeBells.size >= MAX_BELLS) return
    const f = midiHz(n.midi)
    const t = n.time
    const decay = 3.6 - ((n.midi - MEL_LO) / (MEL_HI - MEL_LO)) * 1.2
    const car = ctx.createOscillator()
    car.frequency.value = f
    const mod = ctx.createOscillator()
    mod.frequency.value = f + 0.4
    const modG = ctx.createGain()
    modG.gain.setValueAtTime(f * 1.6, t)
    modG.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.35)
    modG.gain.exponentialRampToValueAtTime(f * 0.02, t + decay)
    const env = ctx.createGain()
    const peak = BELL_LEVEL * n.vel
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.018)
    env.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.5)
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    const pan = ctx.createStereoPanner()
    pan.pan.value = n.pan
    mod.connect(modG).connect(car.frequency)
    car.connect(env).connect(pan).connect(melBus)
    const handle = {
      stopAll() {
        try {
          car.stop()
          mod.stop()
        } catch {
          /* allaqachon to‘xtagan */
        }
      },
    }
    activeBells.add(handle)
    car.onended = () => {
      activeBells.delete(handle)
      for (const x of [car, mod, modG, env, pan]) x.disconnect()
    }
    car.start(t)
    mod.start(t)
    car.stop(t + decay + 0.05)
    mod.stop(t + decay + 0.05)
  }

  function tick(ahead = LOOKAHEAD) {
    if (stopped) return
    const now = ctx.currentTime
    const horizon = now + ahead
    if (nextChordAt < now) {
      // sahifa yashirin bo‘lgan bo‘lsa — vaqtni qayta tiklash
      nextChordAt = now + 0.05
      melodyQ.length = 0
    }
    while (nextChordAt < horizon) scheduleChord(nextChordAt)
    while (melodyQ.length && melodyQ[0].time < horizon) {
      const n = melodyQ.shift() as Note
      if (n.time >= now - 0.02 && intensity > 0.04) playBell(n)
    }
  }

  const hasDoc = typeof document !== 'undefined'
  const startTimer = () => {
    if (!timer && !stopped) timer = setInterval(() => tick(), TICK_MS)
  }
  const stopTimer = () => {
    if (timer) clearInterval(timer)
    timer = 0
  }
  const onVisibility = () => {
    if (document.hidden) stopTimer()
    else {
      tick()
      startTimer()
    }
  }

  tick(Math.max(LOOKAHEAD, opts.prescheduleSec ?? 0))
  if (hasDoc) {
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) startTimer()
  } else startTimer()

  return {
    setIntensity(x: number) {
      if (stopped) return
      intensity = Math.min(1, Math.max(0, x))
      const now = ctx.currentTime
      melBus.gain.cancelScheduledValues(now)
      melBus.gain.setTargetAtTime(intensity, now, 1.2)
      padLp.frequency.cancelScheduledValues(now)
      padLp.frequency.setTargetAtTime(760 + 260 * intensity, now, 2)
    },
    setLayers(l: ScoreLayers) {
      if (stopped) return
      const now = ctx.currentTime
      const ramp = (p: AudioParam, v: number | undefined) => {
        if (v === undefined) return
        p.cancelScheduledValues(now)
        p.setValueAtTime(p.value, now)
        p.setTargetAtTime(clamp01(v), now, 0.5) // ~1.5 s da 95%
      }
      ramp(droneLayer.gain, l.drone)
      ramp(padLayer.gain, l.pad)
    },
    stop(fadeSec = 2) {
      if (stopped) return
      stopped = true
      stopTimer()
      if (hasDoc) document.removeEventListener('visibilitychange', onVisibility)
      const now = ctx.currentTime
      const f = Math.max(0.05, fadeSec)
      const g = fade.gain
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now)
      else {
        g.cancelScheduledValues(now)
        g.setValueAtTime(g.value, now)
      }
      g.linearRampToValueAtTime(0, now + f)
      melodyQ.length = 0
      const cleanup = () => {
        for (const b of activeBells) b.stopAll()
        activeBells.clear()
        for (const o of persistentOsc) {
          try {
            o.stop()
          } catch {
            /* allaqachon to‘xtagan */
          }
        }
        for (const n of nodes) n.disconnect()
        nodes.length = 0
        persistentOsc.length = 0
      }
      setTimeout(cleanup, (f + 0.25) * 1000)
    },
  }
}
