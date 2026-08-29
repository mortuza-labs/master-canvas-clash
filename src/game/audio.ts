let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export type SfxName = "hit" | "paddle" | "break" | "power" | "lose" | "win" | "click";

const RECIPES: Record<SfxName, { f: number; to: number; d: number; type: OscillatorType; g: number }> = {
  hit: { f: 420, to: 300, d: 0.06, type: "square", g: 0.05 },
  paddle: { f: 260, to: 380, d: 0.08, type: "triangle", g: 0.07 },
  break: { f: 640, to: 220, d: 0.12, type: "sawtooth", g: 0.05 },
  power: { f: 520, to: 1040, d: 0.22, type: "sine", g: 0.09 },
  lose: { f: 300, to: 80, d: 0.45, type: "sawtooth", g: 0.09 },
  win: { f: 440, to: 1200, d: 0.5, type: "triangle", g: 0.09 },
  click: { f: 700, to: 900, d: 0.05, type: "sine", g: 0.05 },
};

export const audio = {
  sfxOn: true,
  musicOn: true,
  play(name: SfxName) {
    if (!this.sfxOn) return;
    const c = ac();
    if (!c) return;
    const r = RECIPES[name];
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = r.type;
    o.frequency.setValueAtTime(r.f, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, r.to), c.currentTime + r.d);
    g.gain.setValueAtTime(r.g, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + r.d);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + r.d + 0.02);
  },
  _music: null as { stop: () => void } | null,
  startMusic() {
    if (!this.musicOn || this._music) return;
    const c = ac();
    if (!c) return;
    const master = c.createGain();
    master.gain.value = 0.045;
    master.connect(c.destination);
    const notes = [110, 146.83, 164.81, 196, 164.81, 146.83];
    let i = 0;
    const step = () => {
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = notes[i % notes.length]!;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.75);
      const o2 = c.createOscillator();
      const g2 = c.createGain();
      o2.type = "triangle";
      o2.frequency.value = notes[(i + 2) % notes.length]! * 2;
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(0.35, t + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o2.connect(g2).connect(master);
      o2.start(t);
      o2.stop(t + 0.45);
      i++;
    };
    step();
    const id = window.setInterval(step, 800);
    this._music = {
      stop: () => {
        window.clearInterval(id);
        master.disconnect();
      },
    };
  },
  stopMusic() {
    this._music?.stop();
    this._music = null;
  },
};
