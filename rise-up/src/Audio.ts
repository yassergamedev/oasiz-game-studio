import { oasiz } from "@oasiz/sdk";

export interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private fxGain: GainNode | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicPlaying = false;
  settings: Settings;

  constructor() {
    this.settings = this.loadSettings();
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.12;
      this.musicGain.connect(this.ctx.destination);
      this.fxGain = this.ctx.createGain();
      this.fxGain.gain.value = 0.3;
      this.fxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  startMusic(): void {
    if (!this.settings.music || this.musicPlaying) return;
    const ctx = this.ensureContext();
    this.stopMusic();

    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
    const noteLen = 0.8;
    const totalLen = notes.length * noteLen;

    const scheduleLoop = () => {
      if (!this.musicPlaying || !this.settings.music) return;

      const now = ctx.currentTime;
      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = notes[i];

        const env = ctx.createGain();
        env.gain.value = 0;
        env.gain.setValueAtTime(0, now + i * noteLen);
        env.gain.linearRampToValueAtTime(0.15, now + i * noteLen + 0.05);
        env.gain.linearRampToValueAtTime(0, now + (i + 1) * noteLen - 0.05);

        osc.connect(env);
        env.connect(this.musicGain!);

        osc.start(now + i * noteLen);
        osc.stop(now + (i + 1) * noteLen);
        this.musicOscillators.push(osc);
      }

      setTimeout(scheduleLoop, totalLen * 1000);
    };

    this.musicPlaying = true;
    scheduleLoop();
  }

  stopMusic(): void {
    this.musicPlaying = false;
    for (const osc of this.musicOscillators) {
      try { osc.stop(); } catch {}
    }
    this.musicOscillators = [];
  }

  playDeflect(): void {
    if (!this.settings.fx) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 400 + Math.random() * 200;

    const env = ctx.createGain();
    env.gain.value = 0.25;
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(env);
    env.connect(this.fxGain!);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);

    this.haptic("medium");
  }

  playPop(): void {
    if (!this.settings.fx) return;
    const ctx = this.ensureContext();

    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    noise.buffer = buffer;

    const env = ctx.createGain();
    env.gain.value = 0.4;
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 2;

    noise.connect(filter);
    filter.connect(env);
    env.connect(this.fxGain!);
    noise.start();

    this.haptic("heavy");
  }

  playGameOver(): void {
    if (!this.settings.fx) return;
    const ctx = this.ensureContext();

    const notes = [392, 349, 330, 262];
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = notes[i];

      const env = ctx.createGain();
      env.gain.value = 0;
      const t = ctx.currentTime + i * 0.15;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.2, t + 0.03);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      osc.connect(env);
      env.connect(this.fxGain!);
      osc.start(t);
      osc.stop(t + 0.15);
    }

    this.haptic("error");
  }

  playClick(): void {
    if (!this.settings.fx) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 600;

    const env = ctx.createGain();
    env.gain.value = 0.15;
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(env);
    env.connect(this.fxGain!);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);

    this.haptic("light");
  }

  haptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (!this.settings.haptics) return;
    oasiz.triggerHaptic(type);
  }

  loadSettings(): Settings {
    try {
      const saved = localStorage.getItem("riseup-settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { music: true, fx: true, haptics: true };
  }

  saveSettings(): void {
    localStorage.setItem("riseup-settings", JSON.stringify(this.settings));
  }
}
