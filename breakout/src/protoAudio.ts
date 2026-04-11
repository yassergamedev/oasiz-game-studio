/**
 * Minimal Web Audio beeps (no external SFX assets).
 * Slightly louder with a low-pass for a muffled / behind-glass feel vs music.
 */

let ac: AudioContext | null = null;

/** Extra gain on all SFX; highs are rolled off so this stays listenable. */
const SFX_LOUDNESS = 1.58;
/** Muffled / softer treble on arcade bleeps. */
const SFX_LOWPASS_HZ = 1680;

function ctx(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ac) ac = new AudioContext();
  return ac;
}

/** Call after a user gesture so iOS/Safari allows playback. */
export function resumeAudioContext(): void {
  const c = ctx();
  void c?.resume().catch(() => {});
}

function beep(freq: number, durMs: number, gain = 0.08, type: OscillatorType = "square"): void {
  const c = ctx();
  if (!c) return;
  void c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = SFX_LOWPASS_HZ;
  lp.Q.value = 0.7;
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain * SFX_LOUDNESS;
  o.connect(g);
  g.connect(lp);
  lp.connect(c.destination);
  const t0 = c.currentTime;
  o.start(t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000);
  o.stop(t0 + durMs / 1000 + 0.02);
  o.onended = (): void => {
    o.disconnect();
    g.disconnect();
    lp.disconnect();
  };
}

export const ProtoAudio = {
  paddleHit(): void {
    beep(220, 45, 0.06, "triangle");
  },
  brickBreak(): void {
    beep(440, 35, 0.07, "square");
    window.setTimeout(() => beep(660, 25, 0.05, "square"), 30);
  },
  /** Mid/big brick chipped but not destroyed. */
  brickChip(): void {
    beep(520, 22, 0.05, "triangle");
  },
  wallBounce(): void {
    beep(180, 20, 0.04, "sine");
  },
  powerCollect(): void {
    beep(523, 60, 0.08, "triangle");
    window.setTimeout(() => beep(784, 80, 0.07, "triangle"), 50);
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
    beep(659, 90, 0.09, "triangle");
    window.setTimeout(() => beep(784, 100, 0.085, "triangle"), 100);
    window.setTimeout(() => beep(988, 160, 0.09, "square"), 210);
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
