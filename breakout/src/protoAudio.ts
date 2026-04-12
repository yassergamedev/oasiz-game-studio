/**
 * SFX: sampled break / powerup / victory plus Web Audio beeps (including synthesized brick chip).
 */

import breakUrl from "../assets/break.wav";
import powerupUrl from "../assets/powerup.wav";
import victoryUrl from "../assets/victory.wav";

let ac: AudioContext | null = null;

/** Extra gain on all SFX. */
const SFX_LOUDNESS = 1.58;
/** Sample buffers play slightly quieter than raw files tend to peak. */
const SAMPLE_GAIN = 0.72;

type SampleKey = "break" | "powerup" | "victory";

const SAMPLE_URLS: Record<SampleKey, string> = {
  break: breakUrl,
  powerup: powerupUrl,
  victory: victoryUrl,
};

const sampleBuffers: Partial<Record<SampleKey, AudioBuffer>> = {};
const sampleLoadFailed = new Set<SampleKey>();
let sampleLoadPromise: Promise<void> | null = null;

function ctx(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ac) ac = new AudioContext();
  return ac;
}

async function loadSampleBuffers(): Promise<void> {
  const c = ctx();
  if (!c) return;
  for (const key of Object.keys(SAMPLE_URLS) as SampleKey[]) {
    if (sampleBuffers[key] !== undefined || sampleLoadFailed.has(key)) continue;
    try {
      const res = await fetch(SAMPLE_URLS[key]);
      if (!res.ok) throw new Error(String(res.status));
      const ab = await res.arrayBuffer();
      const copy = ab.byteLength ? ab.slice(0) : ab;
      sampleBuffers[key] = await c.decodeAudioData(copy);
    } catch {
      sampleLoadFailed.add(key);
      console.log("[loadSampleBuffers]", "sample load failed", key);
    }
  }
}

function playSample(key: SampleKey, fallback: () => void): void {
  const buf = sampleBuffers[key];
  if (!buf) {
    fallback();
    return;
  }
  const c = ctx();
  if (!c) {
    fallback();
    return;
  }
  void c.resume().catch(() => {});
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = SAMPLE_GAIN * SFX_LOUDNESS;
  src.connect(g);
  g.connect(c.destination);
  const t0 = c.currentTime;
  src.start(t0);
  src.stop(t0 + buf.duration + 0.02);
  src.onended = (): void => {
    src.disconnect();
    g.disconnect();
  };
}

/** Call after a user gesture so iOS/Safari allows playback. */
export function resumeAudioContext(): void {
  const c = ctx();
  void c?.resume().catch(() => {});
  if (!sampleLoadPromise) {
    sampleLoadPromise = loadSampleBuffers().catch(() => {});
  }
  void sampleLoadPromise;
}

function beep(freq: number, durMs: number, gain = 0.08, type: OscillatorType = "square"): void {
  const c = ctx();
  if (!c) return;
  void c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain * SFX_LOUDNESS;
  o.connect(g);
  g.connect(c.destination);
  const t0 = c.currentTime;
  o.start(t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000);
  o.stop(t0 + durMs / 1000 + 0.02);
  o.onended = (): void => {
    o.disconnect();
    g.disconnect();
  };
}

function brickBreakBeep(): void {
  beep(440, 35, 0.07, "square");
  window.setTimeout(() => beep(660, 25, 0.05, "square"), 30);
}

/** Ceramic tick when a brick loses HP but does not break (synthesized). */
function brickChipTone(): void {
  const c = ctx();
  if (!c) return;
  void c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  const t0 = c.currentTime;
  const dur = 0.045;
  o.frequency.setValueAtTime(1960, t0);
  o.frequency.exponentialRampToValueAtTime(520, t0 + dur);
  g.gain.setValueAtTime(0.095 * SFX_LOUDNESS, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur + 0.012);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
  o.onended = (): void => {
    o.disconnect();
    g.disconnect();
  };
}

function powerCollectBeep(): void {
  beep(523, 60, 0.08, "triangle");
  window.setTimeout(() => beep(784, 80, 0.07, "triangle"), 50);
}

function versusWinBeep(): void {
  beep(659, 90, 0.09, "triangle");
  window.setTimeout(() => beep(784, 100, 0.085, "triangle"), 100);
  window.setTimeout(() => beep(988, 160, 0.09, "square"), 210);
}

export const ProtoAudio = {
  paddleHit(): void {
    beep(220, 45, 0.06, "triangle");
  },
  brickBreak(): void {
    playSample("break", brickBreakBeep);
  },
  /** Mid/big brick chipped but not destroyed. */
  brickChip(): void {
    brickChipTone();
  },
  wallBounce(): void {
    beep(180, 20, 0.04, "sine");
  },
  powerCollect(): void {
    playSample("powerup", powerCollectBeep);
  },
  loseLife(): void {
    beep(120, 200, 0.1, "sawtooth");
  },
  levelClear(): void {
    beep(392, 80, 0.07, "square");
    window.setTimeout(() => beep(523, 80, 0.07, "square"), 90);
    window.setTimeout(() => beep(659, 120, 0.08, "square"), 180);
  },
  gameWin(): void {
    beep(523, 100, 0.08, "triangle");
    window.setTimeout(() => beep(659, 100, 0.08, "triangle"), 110);
    window.setTimeout(() => beep(784, 180, 0.09, "triangle"), 220);
  },
  versusWin(): void {
    playSample("victory", versusWinBeep);
  },
  superReverse(): void {
    beep(220, 60, 0.1, "sawtooth");
    window.setTimeout(() => beep(880, 80, 0.09, "square"), 70);
    window.setTimeout(() => beep(330, 100, 0.1, "triangle"), 160);
  },
  superConvert(): void {
    beep(392, 55, 0.08, "square");
    window.setTimeout(() => beep(523, 55, 0.08, "square"), 60);
    window.setTimeout(() => beep(659, 120, 0.095, "triangle"), 120);
  },
};
