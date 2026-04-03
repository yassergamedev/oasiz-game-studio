/**
 * Audio from suika/assets/sfx — stem = filename without extension (lowercase).
 * Repo clips: ball_bounce, bg_music, bright_pop, celebration, juicy_pop, tense, ui_click
 */

const sfxModules = import.meta.glob("../assets/sfx/**/*.{mp3,wav,ogg,m4a,opus}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

/** stem -> bundled URL */
function buildStemMap(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const path of Object.keys(sfxModules)) {
    const base = path.split("/").pop() ?? path;
    const stem = base.replace(/\.[^.]+$/i, "").toLowerCase().replace(/\s+/g, "_");
    m[stem] = sfxModules[path];
  }
  return m;
}

const STEM_ALIASES: Record<string, string[]> = {
  merge: ["juicy_pop", "celebration", "bright_pop", "merge", "merge_success", "combine", "pop", "match"],
  drop: ["bright_pop", "juicy_pop", "drop", "release", "whoosh", "spawn"],
  bounce: ["ball_bounce", "bounce", "land", "impact", "hit", "collision", "tap"],
  bounce_heavy: ["ball_bounce", "bounce_heavy", "impact_hard", "thunk", "heavy_hit"],
  ui: ["ui_click", "ui", "ui_tap", "tap", "button", "click"],
  game_over: ["tense", "game_over", "fail", "lose", "defeat"],
  bgm: ["bg_music", "bgm", "music", "background", "loop"],
};

function resolveUrl(stems: Record<string, string>, aliasKey: keyof typeof STEM_ALIASES): string | null {
  for (const stem of STEM_ALIASES[aliasKey]) {
    if (stems[stem]) return stems[stem];
  }
  return null;
}

function linearShaperCurve(sampleCount: number): Float32Array {
  const c = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const x = (i * 2) / (sampleCount - 1) - 1;
    c[i] = x;
  }
  return c;
}

/** Soft saturation — higher k = harsher */
function distortedShaperCurve(sampleCount: number, k: number): Float32Array {
  const c = new Float32Array(sampleCount);
  const th = Math.tanh(k);
  for (let i = 0; i < sampleCount; i++) {
    const x = (i * 2) / (sampleCount - 1) - 1;
    c[i] = th > 1e-6 ? Math.tanh(k * x) / th : x;
  }
  return c;
}

export interface SuikaAudioController {
  playMerge(): void;
  playDrop(): void;
  playBounce(heavy: boolean): void;
  playUi(): void;
  playGameOver(): void;
  applySettings(music: boolean, fx: boolean): void;
  setGameplayActive(active: boolean): void;
  enterGameOverMusic(): void;
  exitGameOverMusic(): void;
}

export function createSuikaAudio(): SuikaAudioController {
  const stems = buildStemMap();
  const keys = Object.keys(stems);
  if (keys.length > 0) {
    console.log("[createSuikaAudio]", keys.length + " clip(s):", keys.sort().join(", "));
  } else {
    console.log("[createSuikaAudio]", "no files in assets/sfx (add mp3/wav/ogg/m4a/opus)");
  }

  let musicOn = true;
  let fxOn = true;
  let gameplayActive = false;
  let gameOverMusicMode = false;

  const bgmUrl = resolveUrl(stems, "bgm");
  const bgm = bgmUrl ? new Audio(bgmUrl) : null;
  if (bgm) {
    bgm.loop = true;
    bgm.volume = 0.38;
  }

  let ac: AudioContext | null = null;
  let mediaSrc: MediaElementAudioSourceNode | null = null;
  let lowpass: BiquadFilterNode | null = null;
  let shaper: WaveShaperNode | null = null;

  function ensureBgmGraph(): void {
    if (!bgm || ac) return;
    const ctx = new AudioContext();
    ac = ctx;
    mediaSrc = ctx.createMediaElementSource(bgm);
    lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 16000;
    lowpass.Q.value = 0.85;
    shaper = ctx.createWaveShaper();
    shaper.curve = new Float32Array(linearShaperCurve(2048));
    shaper.oversample = "2x";
    mediaSrc.connect(lowpass);
    lowpass.connect(shaper);
    shaper.connect(ctx.destination);
    console.log("[createSuikaAudio]", "bgm Web Audio graph ready");
  }

  function applyBgmWarp(on: boolean): void {
    if (!bgm) return;
    ensureBgmGraph();
    if (!ac || !lowpass || !shaper) return;
    void ac.resume().catch(() => {});
    const t = ac.currentTime;
    if (on) {
      bgm.playbackRate = 0.34;
      lowpass.frequency.cancelScheduledValues(t);
      lowpass.frequency.setValueAtTime(Math.min(lowpass.frequency.value, 9000), t);
      lowpass.frequency.exponentialRampToValueAtTime(420, t + 1.4);
      shaper.curve = new Float32Array(distortedShaperCurve(2048, 6.2));
    } else {
      bgm.playbackRate = 1;
      lowpass.frequency.cancelScheduledValues(t);
      lowpass.frequency.setValueAtTime(Math.max(lowpass.frequency.value, 400), t);
      lowpass.frequency.exponentialRampToValueAtTime(16000, t + 0.45);
      shaper.curve = new Float32Array(linearShaperCurve(2048));
    }
  }

  function playOneShot(aliasKey: keyof typeof STEM_ALIASES, volume: number): void {
    if (!fxOn) return;
    const url = resolveUrl(stems, aliasKey);
    if (!url) return;
    const a = new Audio(url);
    a.volume = volume;
    void a.play().catch(() => {});
  }

  function syncBgm(): void {
    if (!bgm) return;
    const shouldPlay = musicOn && (gameplayActive || gameOverMusicMode);
    if (shouldPlay) {
      ensureBgmGraph();
      if (ac) void ac.resume().catch(() => {});
      void bgm.play().catch(() => {});
    } else {
      bgm.pause();
    }
  }

  return {
    playMerge(): void {
      playOneShot("merge", 0.88);
    },
    playDrop(): void {
      playOneShot("drop", 0.82);
    },
    playBounce(heavy: boolean): void {
      if (!fxOn) return;
      let url = heavy ? resolveUrl(stems, "bounce_heavy") : null;
      if (!url) url = resolveUrl(stems, "bounce");
      if (!url) return;
      const a = new Audio(url);
      a.volume = heavy ? 0.78 : 0.55;
      void a.play().catch(() => {});
    },
    playUi(): void {
      playOneShot("ui", 0.65);
    },
    playGameOver(): void {
      playOneShot("game_over", 0.72);
    },
    applySettings(music: boolean, fx: boolean): void {
      musicOn = music;
      fxOn = fx;
      syncBgm();
    },
    setGameplayActive(active: boolean): void {
      gameplayActive = active;
      syncBgm();
    },
    enterGameOverMusic(): void {
      if (!bgm) return;
      gameOverMusicMode = true;
      applyBgmWarp(true);
      syncBgm();
      console.log("[enterGameOverMusic]", "warped bgm");
    },
    exitGameOverMusic(): void {
      if (!bgm) return;
      gameOverMusicMode = false;
      applyBgmWarp(false);
      syncBgm();
      console.log("[exitGameOverMusic]", "normal bgm");
    },
  };
}
