import { audio } from "./audio";
import { BRICK_COLORS, COLS, LEVELS, endlessGrid, type Grid } from "./levels";
import type { Mode } from "./storage";

type Ball = { x: number; y: number; vx: number; vy: number; r: number; power: number };
type Brick = { x: number; y: number; w: number; h: number; hits: number; max: number; alive: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number };
export type PowerKind = "expand" | "multi" | "slow" | "life" | "power";
type Drop = { x: number; y: number; vy: number; kind: PowerKind };

export type HudState = {
  score: number;
  lives: number;
  level: number;
  combo: number;
  active: { kind: PowerKind; left: number }[];
};

export type EngineEvents = {
  onHud: (h: HudState) => void;
  onGameOver: (score: number, level: number) => void;
  onLevelClear: (level: number, lostLife: boolean) => void;
  onAchievement: (id: string) => void;
  onPowerCollected: () => void;
};

export const POWER_META: Record<PowerKind, { label: string; short: string; color: string }> = {
  expand: { label: "Expand Paddle", short: "EXP", color: "oklch(0.8 0.16 190)" },
  multi: { label: "Multi Ball", short: "x3", color: "oklch(0.78 0.19 300)" },
  slow: { label: "Slow Motion", short: "SLO", color: "oklch(0.85 0.14 120)" },
  life: { label: "Extra Life", short: "+1", color: "oklch(0.75 0.2 20)" },
  power: { label: "Powerful Ball", short: "PWR", color: "oklch(0.86 0.17 90)" },
};

const POWER_DURATION = 9000;

export class MasterGame {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ev: EngineEvents;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  mode: Mode = "classic";
  level = 1;
  score = 0;
  lives = 3;
  running = false;
  paused = false;
  over = false;

  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private parts: Particle[] = [];
  private drops: Drop[] = [];
  private paddle = { x: 0, w: 120, h: 14 };
  private targetX = 0;
  private launched = false;
  private combo = 0;
  private comboTimer = 0;
  private lostLifeThisLevel = false;
  private shake = 0;
  private timers: Partial<Record<PowerKind, number>> = {};
  private powerCount: number;
  private highestLevel = 1;
  private t = 0;

  constructor(canvas: HTMLCanvasElement, ev: EngineEvents, powerCount = 0) {
    this.cv = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("canvas 2d unavailable");
    this.ctx = c;
    this.ev = ev;
    this.powerCount = powerCount;
    this.resize();
  }

  /* ---------- setup ---------- */

  resize = () => {
    const rect = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paddle.w = Math.max(80, this.w * 0.18);
    this.paddle.h = Math.max(10, this.h * 0.018);
    this.paddle.x = Math.min(Math.max(this.paddle.x || this.w / 2, 0), this.w);
    this.targetX = this.paddle.x;
    this.layoutBricks();
  };

  start(mode: Mode, level: number) {
    this.mode = mode;
    this.level = level;
    this.score = 0;
    this.lives = mode === "challenge" ? 1 : 3;
    this.over = false;
    this.paused = false;
    this.highestLevel = level;
    this.loadLevel(level);
    this.running = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    this.emit();
  }

  private baseSpeed() {
    const base = this.mode === "challenge" ? 0.62 : this.mode === "endless" ? 0.5 : 0.46;
    return (base + Math.min(this.level, 20) * 0.022) * (this.h / 700) * 1.05;
  }

  private grid(level: number): Grid {
    if (this.mode === "classic" || this.mode === "challenge") {
      return LEVELS[(level - 1) % LEVELS.length]!;
    }
    return endlessGrid(level);
  }

  private currentGrid: Grid = [];

  private loadLevel(level: number) {
    this.currentGrid = this.grid(level).map((r) => [...r]);
    this.lostLifeThisLevel = false;
    this.timers = {};
    this.drops = [];
    this.parts = [];
    this.combo = 0;
    this.layoutBricks();
    this.resetBall();
    this.emit();
  }

  private layoutBricks() {
    if (!this.currentGrid.length) {
      this.bricks = [];
      return;
    }
    const pad = this.w * 0.025;
    const top = this.h * 0.12;
    const gap = Math.max(3, this.w * 0.005);
    const bw = (this.w - pad * 2 - gap * (COLS - 1)) / COLS;
    const bh = Math.max(16, Math.min(this.h * 0.038, bw * 0.55));
    const prev = this.bricks;
    this.bricks = [];
    let i = 0;
    this.currentGrid.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (!cell) return;
        const old = prev[i];
        this.bricks.push({
          x: pad + c * (bw + gap),
          y: top + r * (bh + gap),
          w: bw,
          h: bh,
          hits: old && prev.length === this.countCells() ? old.hits : cell,
          max: cell,
          alive: old && prev.length === this.countCells() ? old.alive : true,
        });
        i++;
      });
    });
  }

  private countCells() {
    return this.currentGrid.reduce((a, r) => a + r.filter(Boolean).length, 0);
  }

  private resetBall() {
    this.launched = false;
    this.paddle.x = this.w / 2;
    this.targetX = this.w / 2;
    const r = Math.max(6, this.w * 0.011);
    const s = this.baseSpeed();
    this.balls = [
      { x: this.w / 2, y: this.h - this.h * 0.09 - r, vx: s * 0.5, vy: -s, r, power: 0 },
    ];
  }

  /* ---------- input ---------- */

  pointerAt(clientX: number) {
    const rect = this.cv.getBoundingClientRect();
    this.targetX = clientX - rect.left;
  }

  launch() {
    if (!this.launched) this.launched = true;
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) {
      this.last = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private emit() {
    this.ev.onHud({
      score: Math.round(this.score),
      lives: this.lives,
      level: this.level,
      combo: this.combo,
      active: (Object.keys(this.timers) as PowerKind[])
        .filter((k) => (this.timers[k] ?? 0) > 0)
        .map((k) => ({ kind: k, left: this.timers[k] ?? 0 })),
    });
  }

  /* ---------- loop ---------- */

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(now - this.last, 34);
    this.last = now;
    if (!this.paused && !this.over) this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.t += dt;
    const slow = (this.timers.slow ?? 0) > 0 ? 0.55 : 1;

    for (const k of Object.keys(this.timers) as PowerKind[]) {
      if ((this.timers[k] ?? 0) > 0) {
        this.timers[k] = Math.max(0, (this.timers[k] ?? 0) - dt);
      }
    }

    // paddle
    const pw = this.paddleWidth();
    this.paddle.x += (this.targetX - this.paddle.x) * Math.min(1, dt * 0.028);
    this.paddle.x = Math.max(pw / 2, Math.min(this.w - pw / 2, this.paddle.x));
    const py = this.paddleY();

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (!this.launched) {
      const b = this.balls[0];
      if (b) {
        b.x = this.paddle.x;
        b.y = py - this.paddle.h / 2 - b.r - 2;
      }
    }

    const step = dt * slow;
    for (const b of this.balls) {
      if (!this.launched) break;
      b.x += b.vx * step;
      b.y += b.vy * step;

      if (b.x - b.r < 0) {
        b.x = b.r;
        b.vx = Math.abs(b.vx);
        audio.play("hit");
      }
      if (b.x + b.r > this.w) {
        b.x = this.w - b.r;
        b.vx = -Math.abs(b.vx);
        audio.play("hit");
      }
      if (b.y - b.r < 0) {
        b.y = b.r;
        b.vy = Math.abs(b.vy);
        audio.play("hit");
      }

      // paddle collision
      if (
        b.vy > 0 &&
        b.y + b.r >= py - this.paddle.h / 2 &&
        b.y - b.r <= py + this.paddle.h &&
        b.x >= this.paddle.x - pw / 2 - b.r &&
        b.x <= this.paddle.x + pw / 2 + b.r
      ) {
        const rel = (b.x - this.paddle.x) / (pw / 2);
        const speed = Math.hypot(b.vx, b.vy);
        const angle = rel * 1.05;
        b.vx = Math.sin(angle) * speed;
        b.vy = -Math.abs(Math.cos(angle) * speed);
        b.y = py - this.paddle.h / 2 - b.r - 1;
        this.combo = 0;
        audio.play("paddle");
        this.burst(b.x, py, 8, "oklch(0.8 0.16 190)");
      }

      // brick collisions
      for (const br of this.bricks) {
        if (!br.alive) continue;
        if (b.x + b.r < br.x || b.x - b.r > br.x + br.w || b.y + b.r < br.y || b.y - b.r > br.y + br.h)
          continue;
        const overlapX = Math.min(b.x + b.r - br.x, br.x + br.w - (b.x - b.r));
        const overlapY = Math.min(b.y + b.r - br.y, br.y + br.h - (b.y - b.r));
        const powerful = (this.timers.power ?? 0) > 0;
        if (!powerful) {
          if (overlapX < overlapY) b.vx = -b.vx;
          else b.vy = -b.vy;
        }
        this.hitBrick(br, b);
        break;
      }
    }

    // lost balls
    const alive = this.balls.filter((b) => b.y - b.r < this.h + 40);
    if (alive.length !== this.balls.length) this.balls = alive;
    if (this.launched && this.balls.length === 0) this.loseLife();

    // drops
    for (const d of this.drops) d.y += d.vy * dt;
    this.drops = this.drops.filter((d) => {
      if (d.y > this.h + 30) return false;
      if (
        d.y > py - 22 &&
        d.y < py + 30 &&
        d.x > this.paddle.x - pw / 2 - 16 &&
        d.x < this.paddle.x + pw / 2 + 16
      ) {
        this.collect(d.kind);
        return false;
      }
      return true;
    });

    // particles
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.0016 * dt;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.02);

    // level clear
    if (this.bricks.every((b) => !b.alive || b.max === 4)) this.clearLevel();
  }

  private paddleWidth() {
    return this.paddle.w * ((this.timers.expand ?? 0) > 0 ? 1.65 : 1);
  }

  private paddleY() {
    const isMobile = this.w <= 640 || this.h > this.w;
    return this.h - this.h * (isMobile ? 0.2 : 0.075);
  }


  private hitBrick(br: Brick, b: Ball) {
    if (br.max === 4) {
      audio.play("hit");
      this.burst(b.x, b.y, 6, BRICK_COLORS[4]!);
      return;
    }
    const powerful = (this.timers.power ?? 0) > 0;
    br.hits -= powerful ? 3 : 1;
    this.shake = Math.min(8, this.shake + 2);
    if (br.hits > 0) {
      audio.play("hit");
      this.burst(b.x, b.y, 6, BRICK_COLORS[Math.min(br.hits, 3)]!);
      this.score += 5;
    } else {
      br.alive = false;
      audio.play("break");
      this.combo = Math.min(this.combo + 1, 12);
      this.comboTimer = 1600;
      this.score += (30 + br.max * 20) * (1 + this.combo * 0.15);
      this.burst(br.x + br.w / 2, br.y + br.h / 2, 18, BRICK_COLORS[Math.min(br.max, 3)]!);
      this.ev.onAchievement("first-blood");
      if (this.score >= 5000) this.ev.onAchievement("score-5000");
      if (this.mode === "endless" && this.score >= 1000) this.ev.onAchievement("endless-1000");
      if (Math.random() < 0.13) this.spawnDrop(br.x + br.w / 2, br.y + br.h / 2);
      // speed up gradually
      for (const bl of this.balls) {
        const s = Math.hypot(bl.vx, bl.vy);
        const max = this.baseSpeed() * 1.6;
        if (s < max) {
          const f = 1.004;
          bl.vx *= f;
          bl.vy *= f;
        }
      }
    }
    this.emit();
  }

  private spawnDrop(x: number, y: number) {
    const kinds: PowerKind[] = ["expand", "multi", "slow", "power", "expand", "multi", "life"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)]!;
    this.drops.push({ x, y, vy: 0.22 * (this.h / 700), kind });
  }

  private collect(kind: PowerKind) {
    audio.play("power");
    this.powerCount++;
    this.ev.onPowerCollected();
    if (this.powerCount >= 25) this.ev.onAchievement("power-hungry");
    if (kind === "life") {
      this.lives++;
    } else if (kind === "multi") {
      const src = this.balls[0];
      if (src) {
        for (let i = 0; i < 2; i++) {
          const a = (i === 0 ? -0.5 : 0.5) + Math.random() * 0.2;
          const s = Math.hypot(src.vx, src.vy);
          this.balls.push({
            x: src.x,
            y: src.y,
            vx: Math.sin(a) * s,
            vy: -Math.abs(Math.cos(a) * s),
            r: src.r,
            power: 0,
          });
        }
      }
    } else {
      this.timers[kind] = POWER_DURATION;
    }
    this.burst(this.paddle.x, this.paddleY(), 20, POWER_META[kind].color);
    this.emit();
  }

  private loseLife() {
    this.lives--;
    this.lostLifeThisLevel = true;
    this.shake = 8;
    audio.play("lose");
    this.timers = {};
    if (this.lives <= 0) {
      this.over = true;
      this.running = true;
      this.ev.onGameOver(Math.round(this.score), this.highestLevel);
    } else {
      this.resetBall();
    }
    this.emit();
  }

  private clearLevel() {
    audio.play("win");
    this.score += 250 + this.level * 50;
    if (!this.lostLifeThisLevel) this.ev.onAchievement("no-loss");
    if (this.mode === "challenge") this.ev.onAchievement("challenge-win");
    this.ev.onLevelClear(this.level, this.lostLifeThisLevel);
  }

  nextLevel() {
    this.level++;
    this.highestLevel = Math.max(this.highestLevel, this.level);
    if (this.level >= 5) this.ev.onAchievement("level-5");
    if (this.level >= 10) this.ev.onAchievement("level-10");
    this.loadLevel(this.level);
  }

  private burst(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.05 + Math.random() * 0.25;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 320 + Math.random() * 320,
        max: 640,
        c: color,
        s: 1 + Math.random() * 2.5,
      });
    }
  }

  /* ---------- render ---------- */

  private draw() {
    const g = this.ctx;
    const w = this.w;
    const h = this.h;
    g.save();
    if (this.shake > 0) {
      g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    g.clearRect(-20, -20, w + 40, h + 40);

    // background
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#080b14");
    bg.addColorStop(0.5, "#0b1020");
    bg.addColorStop(1, "#060810");
    g.fillStyle = bg;
    g.fillRect(-20, -20, w + 40, h + 40);

    // grid lines
    g.save();
    g.globalAlpha = 0.06;
    g.strokeStyle = "#7ee8ff";
    g.lineWidth = 1;
    const gs = Math.max(40, w / 16);
    for (let x = 0; x < w; x += gs) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y < h; y += gs) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.restore();

    // bricks
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const color = BRICK_COLORS[Math.min(b.hits, 4)] || BRICK_COLORS[1]!;
      g.save();
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.fillStyle = color;
      g.globalAlpha = b.max === 4 ? 0.75 : 0.92;
      this.roundRect(b.x, b.y, b.w, b.h, 4);
      g.fill();
      g.restore();
      g.save();
      g.globalAlpha = 0.28;
      g.fillStyle = "#ffffff";
      this.roundRect(b.x + 2, b.y + 2, b.w - 4, b.h * 0.32, 3);
      g.fill();
      g.restore();
    }

    // particles
    for (const p of this.parts) {
      g.save();
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.c;
      g.shadowColor = p.c;
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // drops
    for (const d of this.drops) {
      const meta = POWER_META[d.kind];
      g.save();
      g.translate(d.x, d.y);
      g.rotate(Math.sin(this.t / 300 + d.x) * 0.2);
      g.shadowColor = meta.color;
      g.shadowBlur = 16;
      g.fillStyle = meta.color;
      g.globalAlpha = 0.9;
      this.roundRect(-16, -11, 32, 22, 6);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = "#05070f";
      g.font = "bold 11px ui-sans-serif, system-ui";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(meta.short, 0, 1);
      g.restore();
    }

    // paddle
    const pw = this.paddleWidth();
    const py = this.paddleY();
    g.save();
    const pg = g.createLinearGradient(this.paddle.x - pw / 2, 0, this.paddle.x + pw / 2, 0);
    pg.addColorStop(0, "oklch(0.75 0.17 200)");
    pg.addColorStop(0.5, "oklch(0.9 0.12 190)");
    pg.addColorStop(1, "oklch(0.7 0.19 300)");
    g.fillStyle = pg;
    g.shadowColor = "oklch(0.8 0.16 200)";
    g.shadowBlur = 22;
    this.roundRect(this.paddle.x - pw / 2, py - this.paddle.h / 2, pw, this.paddle.h, this.paddle.h / 2);
    g.fill();
    g.restore();

    // balls
    for (const b of this.balls) {
      const powerful = (this.timers.power ?? 0) > 0;
      const c = powerful ? "oklch(0.86 0.17 90)" : "oklch(0.95 0.05 200)";
      g.save();
      g.shadowColor = c;
      g.shadowBlur = 26;
      g.fillStyle = c;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    if (!this.launched && !this.over) {
      g.save();
      g.globalAlpha = 0.55 + Math.sin(this.t / 300) * 0.25;
      g.fillStyle = "#dff6ff";
      g.font = `600 ${Math.max(12, this.w * 0.028)}px ui-sans-serif, system-ui`;
      g.textAlign = "center";
      g.fillText("TAP / CLICK TO LAUNCH", this.w / 2, this.h * 0.62);
      g.restore();
    }

    g.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const g = this.ctx;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}
