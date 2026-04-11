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
  /** Combo 1 = normal speed; 2+ = same clip forward with rising playbackRate (pitch + speed). */
  playMerge(comboStep?: number): void;
  playDrop(): void;
  playBounce(heavy: boolean): void;
  playUi(): void;
  playGameOver(): void;
  applySettings(music: boolean, fx: boolean): void;
  setGameplayActive(active: boolean): void;
  enterGameOverMusic(): void;
  exitGameOverMusic(): void;
  /** After app background: resume Web Audio + HTMLAudioElement so BGM/SFX work again. */
  resumeAfterBackground(): void;
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
  const BGM_VOLUME_NORMAL = 0.38;
  const BGM_VOLUME_GAME_OVER = 0.22;

  const bgmUrl = resolveUrl(stems, "bgm");
  const bgm = bgmUrl ? new Audio(bgmUrl) : null;
  if (bgm) {
    bgm.loop = true;
    bgm.volume = BGM_VOLUME_NORMAL;
  }

  let ac: AudioContext | null = null;
  let mediaSrc: MediaElementAudioSourceNode | null = null;
  let lowpass: BiquadFilterNode | null = null;
  let shaper: WaveShaperNode | null = null;

  /** One-shots only — BGM uses `ac` above, separate context keeps routing simple. */
  let sfxAc: AudioContext | null = null;
  let sfxLowpass: BiquadFilterNode | null = null;
  let sfxBusGain: GainNode | null = null;
  const sfxBufferByStem = new Map<string, AudioBuffer>();
  const sfxDecodeByStem = new Map<string, Promise<AudioBuffer | null>>();

  /** Extra attenuation on SFX vs previous HTMLAudio-only levels (BGM unchanged). */
  const SFX_CLIP_SCALE = 0.4;
  const SFX_LOWPASS_HZ = 3200;

  let mergeForwardBuf: AudioBuffer | null = null;
  let mergeBuffersPromise: Promise<boolean> | null = null;

  function ensureMergeBuffersLoaded(): Promise<boolean> {
    if (mergeForwardBuf) return Promise.resolve(true);
    if (mergeBuffersPromise) return mergeBuffersPromise;
    const url = resolveUrl(stems, "merge");
    if (!url) return Promise.resolve(false);
    mergeBuffersPromise = (async (): Promise<boolean> => {
      try {
        ensureSfxGraph();
        if (!sfxAc) return false;
        const res = await fetch(url);
        const raw = await res.arrayBuffer();
        mergeForwardBuf = await sfxAc.decodeAudioData(raw.slice(0));
        console.log("[createSuikaAudio]", "merge clip decoded");
        return true;
      } catch {
        mergeBuffersPromise = null;
        return false;
      }
    })();
    return mergeBuffersPromise;
  }

  function ensureSfxGraph(): void {
    if (sfxAc) return;
    const ctx = new AudioContext();
    sfxAc = ctx;
    sfxLowpass = ctx.createBiquadFilter();
    sfxLowpass.type = "lowpass";
    sfxLowpass.frequency.value = SFX_LOWPASS_HZ;
    sfxLowpass.Q.value = 0.71;
    sfxBusGain = ctx.createGain();
    sfxBusGain.gain.value = 0.88;
    sfxLowpass.connect(sfxBusGain);
    sfxBusGain.connect(ctx.destination);
    console.log("[createSuikaAudio]", "sfx lowpass bus ready");
  }

  function playSfxUrl(url: string, linearVolume: number): void {
    if (!fxOn) return;
    ensureSfxGraph();
    if (!sfxAc || !sfxLowpass) return;
    void sfxAc.resume().catch(() => {});
    const a = new Audio(url);
    const src = sfxAc.createMediaElementSource(a);
    const clipGain = sfxAc.createGain();
    clipGain.gain.value = Math.max(0, Math.min(1, linearVolume * SFX_CLIP_SCALE));
    src.connect(clipGain);
    clipGain.connect(sfxLowpass);
    const cleanup = (): void => {
      src.disconnect();
      clipGain.disconnect();
      a.removeAttribute("src");
      a.load();
    };
    a.addEventListener("ended", cleanup, { once: true });
    a.addEventListener("error", cleanup, { once: true });
    void a.play().catch(() => {
      cleanup();
    });
  }
  function stemForAlias(aliasKey: keyof typeof STEM_ALIASES): string | null {
    for (const stem of STEM_ALIASES[aliasKey]) {
      if (stems[stem]) return stem;
    }
    return null;
  }
  function ensureSfxBuffer(stem: string): Promise<AudioBuffer | null> {
    const existing = sfxBufferByStem.get(stem);
    if (existing) return Promise.resolve(existing);
    const pending = sfxDecodeByStem.get(stem);
    if (pending) return pending;
    const url = stems[stem];
    if (!url) return Promise.resolve(null);
    const task = (async (): Promise<AudioBuffer | null> => {
      try {
        ensureSfxGraph();
        if (!sfxAc) return null;
        const res = await fetch(url);
        const raw = await res.arrayBuffer();
        const decoded = await sfxAc.decodeAudioData(raw.slice(0));
        sfxBufferByStem.set(stem, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        sfxDecodeByStem.delete(stem);
      }
    })();
    sfxDecodeByStem.set(stem, task);
    return task;
  }
  function playSfxStemBuffered(stem: string, linearVolume: number): void {
    if (!fxOn) return;
    void (async (): Promise<void> => {
      const buf = await ensureSfxBuffer(stem);
      if (!buf || !sfxAc || !sfxLowpass) {
        const url = stems[stem];
        if (url) playSfxUrl(url, linearVolume);
        return;
      }
      void sfxAc.resume().catch(() => {});
      const src = sfxAc.createBufferSource();
      src.buffer = buf;
      const clipGain = sfxAc.createGain();
      clipGain.gain.value = Math.max(0, Math.min(1, linearVolume * SFX_CLIP_SCALE));
      src.connect(clipGain);
      clipGain.connect(sfxLowpass);
      src.onended = (): void => {
        src.disconnect();
        clipGain.disconnect();
      };
      src.start(0);
    })();
  }

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
      bgm.volume = BGM_VOLUME_GAME_OVER;
      bgm.playbackRate = 0.34;
      lowpass.frequency.cancelScheduledValues(t);
      lowpass.frequency.setValueAtTime(Math.min(lowpass.frequency.value, 9000), t);
      lowpass.frequency.exponentialRampToValueAtTime(420, t + 1.4);
      shaper.curve = new Float32Array(distortedShaperCurve(2048, 6.2));
    } else {
      bgm.volume = BGM_VOLUME_NORMAL;
      bgm.playbackRate = 1;
      lowpass.frequency.cancelScheduledValues(t);
      lowpass.frequency.setValueAtTime(Math.max(lowpass.frequency.value, 400), t);
      lowpass.frequency.exponentialRampToValueAtTime(16000, t + 0.45);
      shaper.curve = new Float32Array(linearShaperCurve(2048));
    }
  }

  function playOneShot(aliasKey: keyof typeof STEM_ALIASES, volume: number): void {
    const stem = stemForAlias(aliasKey);
    if (!stem) return;
    playSfxStemBuffered(stem, volume);
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

  function playMergeBuffered(comboStep: number): void {
    void (async (): Promise<void> => {
      if (!fxOn) return;
      const ok = await ensureMergeBuffersLoaded();
      if (!ok || !mergeForwardBuf || !sfxAc || !sfxLowpass) {
        playOneShot("merge", 0.88);
        return;
      }
      void sfxAc.resume().catch(() => {});
      const st = Math.min(14, Math.max(1, Math.floor(comboStep)));
      const rate =
        st <= 1 ? 1 : Math.min(1.48, 1.1 + (st - 2) * 0.11);
      const src = sfxAc.createBufferSource();
      src.buffer = mergeForwardBuf;
      src.playbackRate.value = rate;
      const clipGain = sfxAc.createGain();
      clipGain.gain.value = Math.max(0, Math.min(1, 0.88 * SFX_CLIP_SCALE));
      src.connect(clipGain);
      clipGain.connect(sfxLowpass);
      src.onended = (): void => {
        src.disconnect();
        clipGain.disconnect();
      };
      src.start(0);
    })();
  }

  return {
    playMerge(comboStep = 1): void {
      playMergeBuffered(comboStep);
    },
    playDrop(): void {
      playOneShot("drop", 0.82);
    },
    playBounce(heavy: boolean): void {
      let url = heavy ? resolveUrl(stems, "bounce_heavy") : null;
      if (!url) url = resolveUrl(stems, "bounce");
      if (!url) return;
      playSfxUrl(url, heavy ? 0.78 : 0.55);
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
      if (active && gameOverMusicMode) {
        gameOverMusicMode = false;
        applyBgmWarp(false);
      }
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
      gameOverMusicMode = false;
      if (!bgm) return;
      applyBgmWarp(false);
      syncBgm();
      console.log("[exitGameOverMusic]", "normal bgm");
    },
    resumeAfterBackground(): void {
      if (ac && ac.state === "suspended") {
        void ac.resume().catch(() => {});
      }
      if (sfxAc && sfxAc.state === "suspended") {
        void sfxAc.resume().catch(() => {});
      }
      syncBgm();
      console.log("[resumeAfterBackground]", "audio sync");
    },
  };
}
