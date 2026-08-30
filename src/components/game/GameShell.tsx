import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Award,
  Heart,
  Home,
  Lock,
  Music,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { audio } from "@/game/audio";
import { MasterGame, POWER_META, type HudState, type PowerKind } from "@/game/engine";
import { LEVELS } from "@/game/levels";
import { ACHIEVEMENTS, loadSave, saveSave, type Mode, type Save } from "@/game/storage";
import { ArcadeButton, Panel, Stat } from "./ui";

type Screen = "home" | "modes" | "levels" | "achievements" | "playing" | "paused" | "cleared" | "over";

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: "classic", name: "Classic", desc: "12 crafted levels, 3 lives, rising speed." },
  { id: "endless", name: "Endless", desc: "Procedural waves that never stop." },
  { id: "challenge", name: "Challenge", desc: "One life. Faster ball. No mercy." },
];

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<MasterGame | null>(null);

  const [screen, setScreen] = useState<Screen>("home");
  const [save, setSave] = useState<Save>(() => loadSave());
  const [mode, setMode] = useState<Mode>("classic");
  const [hud, setHud] = useState<HudState>({ score: 0, lives: 3, level: 1, combo: 0, active: [] });
  const [result, setResult] = useState({ score: 0, level: 1 });
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const saveRef = useRef(save);
  saveRef.current = save;

  const persist = useCallback((updater: (s: Save) => Save) => {
    setSave((prev) => {
      const next = updater(prev);
      saveSave(next);
      return next;
    });
  }, []);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const unlockAchievement = useCallback(
    (id: string) => {
      if (saveRef.current.achievements.includes(id)) return;
      const meta = ACHIEVEMENTS.find((a) => a.id === id);
      if (!meta) return;
      persist((s) => ({ ...s, achievements: [...s.achievements, id] }));
      toast(`Achievement — ${meta.name}`);
    },
    [persist, toast],
  );

  /* ---------- engine lifecycle ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new MasterGame(
      canvas,
      {
        onHud: setHud,
        onGameOver: (score, level) => {
          setResult({ score, level });
          persist((s) => ({
            ...s,
            high: { ...s.high, [game.mode]: Math.max(s.high[game.mode], score) },
          }));
          setScreen("over");
        },
        onLevelClear: (level) => {
          persist((s) => ({
            ...s,
            unlocked: game.mode === "classic" ? Math.min(Math.max(s.unlocked, level + 1), LEVELS.length) : s.unlocked,
            high: { ...s.high, [game.mode]: Math.max(s.high[game.mode], Math.round(game.score)) },
          }));
          setResult({ score: Math.round(game.score), level });
          setScreen("cleared");
        },
        onAchievement: unlockAchievement,
        onPowerCollected: () => persist((s) => ({ ...s, powerups: s.powerups + 1 })),
      },
      saveRef.current.powerups,
    );
    gameRef.current = game;
    const onResize = () => game.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      game.destroy();
      gameRef.current = null;
    };
  }, [persist, unlockAchievement]);

  /* ---------- audio settings ---------- */
  useEffect(() => {
    audio.sfxOn = save.sfx;
    audio.musicOn = save.music;
    if (!save.music) audio.stopMusic();
  }, [save.sfx, save.music]);

  /* ---------- input ---------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const playing = screen === "playing";
    const move = (e: PointerEvent) => {
      if (!playing) return;
      gameRef.current?.pointerAt(e.clientX);
    };
    const down = (e: PointerEvent) => {
      if (!playing) return;
      gameRef.current?.pointerAt(e.clientX);
      gameRef.current?.launch();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        if (screen === "playing") pause();
        else if (screen === "paused") resume();
      }
      if (e.key === " " && screen === "playing") {
        e.preventDefault();
        gameRef.current?.launch();
      }
      if (screen === "playing" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const g = gameRef.current;
        if (!g) return;
        const rect = el.getBoundingClientRect();
        const delta = e.key === "ArrowLeft" ? -rect.width * 0.08 : rect.width * 0.08;
        g.pointerAt(rect.left + (g as unknown as { paddle: { x: number } }).paddle.x + delta);
      }
    };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const goFullscreen = async () => {
    const el = wrapRef.current;
    if (!el || document.fullscreenElement) return;
    try {
      await el.requestFullscreen?.({ navigationUI: "hide" });
    } catch {
      /* unsupported — keep in-page fullscreen layout */
    }
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* noop */
      }
    }
  };

  const startGame = async (m: Mode, level: number) => {
    setMode(m);
    await goFullscreen();
    if (save.music) audio.startMusic();
    requestAnimationFrame(() => {
      gameRef.current?.resize();
      gameRef.current?.start(m, level);
      setScreen("playing");
    });
  };

  const pause = () => {
    gameRef.current?.setPaused(true);
    setScreen("paused");
  };
  const resume = () => {
    gameRef.current?.setPaused(false);
    setScreen("playing");
  };
  const goHome = () => {
    gameRef.current?.destroy();
    audio.stopMusic();
    void exitFullscreen();
    setScreen("home");
  };

  const nextLevel = () => {
    gameRef.current?.nextLevel();
    setScreen("playing");
  };

  const inGame = screen === "playing" || screen === "paused" || screen === "cleared" || screen === "over";

  return (
    <div
      ref={wrapRef}
      className="relative h-[100dvh] w-full touch-none overflow-hidden bg-background select-none"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="scanlines pointer-events-none absolute inset-0 opacity-60" />

      {inGame && <Hud hud={hud} mode={mode} onPause={pause} paused={screen !== "playing"} />}

      {screen === "home" && (
        <Overlay>
          <HomeScreen
            save={save}
            onPlay={() => setScreen("modes")}
            onLevels={() => setScreen("levels")}
            onAchievements={() => setScreen("achievements")}
            onToggleSfx={() => persist((s) => ({ ...s, sfx: !s.sfx }))}
            onToggleMusic={() => persist((s) => ({ ...s, music: !s.music }))}
          />
        </Overlay>
      )}

      {screen === "modes" && (
        <Overlay>
          <Panel className="w-full max-w-lg">
            <BackRow title="Select Mode" onBack={() => setScreen("home")} />
            <div className="mt-5 space-y-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => void startGame(m.id, 1)}
                  className="group w-full rounded-xl border border-border/70 bg-secondary/30 p-4 text-left transition-all hover:border-primary/70 hover:bg-secondary/60 hover:shadow-[0_0_28px_oklch(0.85_0.16_195/22%)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-bold uppercase tracking-widest text-primary">
                      {m.name}
                    </span>
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Best {save.high[m.id]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
                </button>
              ))}
            </div>
          </Panel>
        </Overlay>
      )}

      {screen === "levels" && (
        <Overlay>
          <Panel className="w-full max-w-lg">
            <BackRow title="Classic Levels" onBack={() => setScreen("home")} />
            <div className="mt-5 grid grid-cols-4 gap-3 sm:grid-cols-6">
              {LEVELS.map((_, i) => {
                const lvl = i + 1;
                const locked = lvl > save.unlocked;
                return (
                  <button
                    key={lvl}
                    disabled={locked}
                    onClick={() => void startGame("classic", lvl)}
                    className="flex aspect-square items-center justify-center rounded-xl border border-border/70 bg-secondary/40 font-display text-lg font-bold text-primary transition-all enabled:hover:border-primary enabled:hover:shadow-[0_0_22px_oklch(0.85_0.16_195/30%)] disabled:text-muted-foreground/50"
                  >
                    {locked ? <Lock className="h-4 w-4" /> : lvl}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Clear a level to unlock the next
            </p>
          </Panel>
        </Overlay>
      )}

      {screen === "achievements" && (
        <Overlay>
          <Panel className="max-h-[80dvh] w-full max-w-lg overflow-y-auto">
            <BackRow title="Achievements" onBack={() => setScreen("home")} />
            <div className="mt-5 space-y-2">
              {ACHIEVEMENTS.map((a) => {
                const got = save.achievements.includes(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      got ? "border-primary/50 bg-primary/10" : "border-border/60 bg-secondary/20 opacity-60"
                    }`}
                  >
                    <Trophy className={`h-5 w-5 ${got ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <div className="font-display text-sm font-bold uppercase tracking-wider">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </Overlay>
      )}

      {screen === "paused" && (
        <Overlay>
          <Panel className="w-full max-w-sm text-center">
            <h2 className="font-display text-3xl font-black uppercase tracking-[0.3em] text-primary text-glow">
              Paused
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Stat label="Score" value={hud.score} />
              <Stat label="Level" value={hud.level} />
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <ArcadeButton variant="primary" onClick={resume}>
                <Play className="h-4 w-4" /> Resume
              </ArcadeButton>
              <div className="grid grid-cols-2 gap-3">
                <ArcadeButton onClick={() => void startGame(mode, mode === "classic" ? hud.level : 1)}>
                  <RotateCcw className="h-4 w-4" /> Restart
                </ArcadeButton>
                <ArcadeButton onClick={goHome}>
                  <Home className="h-4 w-4" /> Home
                </ArcadeButton>
              </div>
              <div className="flex justify-center gap-3 pt-1">
                <Toggle
                  on={save.sfx}
                  label="SFX"
                  icon={save.sfx ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  onClick={() => persist((s) => ({ ...s, sfx: !s.sfx }))}
                />
                <Toggle
                  on={save.music}
                  label="Music"
                  icon={<Music className="h-4 w-4" />}
                  onClick={() =>
                    persist((s) => {
                      const music = !s.music;
                      audio.musicOn = music;
                      if (music) audio.startMusic();
                      else audio.stopMusic();
                      return { ...s, music };
                    })
                  }
                />
              </div>
            </div>
          </Panel>
        </Overlay>
      )}

      {screen === "cleared" && (
        <Overlay>
          <Panel className="w-full max-w-sm text-center">
            <h2 className="font-display text-2xl font-black uppercase tracking-[0.28em] text-primary text-glow">
              Level {result.level} Clear
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Stat label="Score" value={result.score} />
              <Stat label="Lives" value={hud.lives} />
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <ArcadeButton variant="primary" onClick={nextLevel}>
                <Play className="h-4 w-4" /> Next Level
              </ArcadeButton>
              <ArcadeButton onClick={goHome}>
                <Home className="h-4 w-4" /> Home
              </ArcadeButton>
            </div>
          </Panel>
        </Overlay>
      )}

      {screen === "over" && (
        <Overlay>
          <Panel className="w-full max-w-sm text-center">
            <h2 className="font-display text-3xl font-black uppercase tracking-[0.28em] text-destructive">
              Game Over
            </h2>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <Stat label="Score" value={result.score} />
              <Stat label="Best" value={save.high[mode]} />
              <Stat label="Level" value={result.level} />
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <ArcadeButton variant="primary" onClick={() => void startGame(mode, 1)}>
                <RotateCcw className="h-4 w-4" /> Play Again
              </ArcadeButton>
              <ArcadeButton onClick={goHome}>
                <Home className="h-4 w-4" /> Home
              </ArcadeButton>
            </div>
          </Panel>
        </Overlay>
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass animate-in-up rounded-full px-5 py-2 font-display text-xs uppercase tracking-[0.2em] text-primary"
          >
            <Award className="mr-2 inline h-3.5 w-3.5" />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
      {children}
    </div>
  );
}

function BackRow({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="rounded-lg border border-border/70 p-2 text-muted-foreground transition-colors hover:text-primary"
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h2 className="font-display text-lg font-bold uppercase tracking-[0.24em] text-primary">{title}</h2>
    </div>
  );
}

function Toggle({
  on,
  label,
  icon,
  onClick,
}: {
  on: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-all ${
        on
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 bg-secondary/30 text-muted-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function HomeScreen({
  save,
  onPlay,
  onLevels,
  onAchievements,
  onToggleSfx,
  onToggleMusic,
}: {
  save: Save;
  onPlay: () => void;
  onLevels: () => void;
  onAchievements: () => void;
  onToggleSfx: () => void;
  onToggleMusic: () => void;
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center px-4 text-center">
      <div className="animate-float w-full max-w-full">
        <h1 className="animate-logo w-full max-w-full whitespace-nowrap text-center font-display font-black uppercase tracking-[0.18em] text-primary [font-size:clamp(2.25rem,13vw,4.5rem)]">
          MASTER
        </h1>
      </div>
      <p className="mt-3 font-display text-[11px] uppercase tracking-[0.42em] text-muted-foreground">
        Break. Conquer. Master.
      </p>

      <div className="mt-9 flex w-full flex-col gap-3">
        <ArcadeButton variant="primary" className="py-4 text-base" onClick={onPlay}>
          <Play className="h-5 w-5" /> Start Game
        </ArcadeButton>
        <div className="grid grid-cols-2 gap-3">
          <ArcadeButton onClick={onLevels}>Levels</ArcadeButton>
          <ArcadeButton onClick={onAchievements}>
            <Trophy className="h-4 w-4" /> Awards
          </ArcadeButton>
        </div>
      </div>

      <div className="mt-8 grid w-full grid-cols-3 gap-2">
        <Stat label="Classic" value={save.high.classic} />
        <Stat label="Endless" value={save.high.endless} />
        <Stat label="Challenge" value={save.high.challenge} />
      </div>

      <div className="mt-6 flex gap-3">
        <Toggle
          on={save.sfx}
          label="SFX"
          icon={save.sfx ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          onClick={onToggleSfx}
        />
        <Toggle on={save.music} label="Music" icon={<Music className="h-4 w-4" />} onClick={onToggleMusic} />
      </div>

      <p className="mt-8 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
        Designed by @Mortuza797
      </p>
    </div>
  );
}

function Hud({
  hud,
  mode,
  onPause,
  paused,
}: {
  hud: HudState;
  mode: Mode;
  onPause: () => void;
  paused: boolean;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3 sm:p-5">
        <div className="glass rounded-xl px-4 py-2">
          <div className="font-display text-lg font-bold text-primary text-glow sm:text-xl">{hud.score}</div>
          <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
            {mode} · Lv {hud.level}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="glass flex items-center gap-1 rounded-xl px-3 py-2">
            {Array.from({ length: Math.min(hud.lives, 6) }).map((_, i) => (
              <Heart key={i} className="h-3.5 w-3.5 fill-destructive text-destructive" />
            ))}
          </div>
          <button
            onClick={onPause}
            disabled={paused}
            className="glass pointer-events-auto rounded-xl p-2.5 text-primary transition-colors hover:bg-primary/15 disabled:opacity-40"
            aria-label="Pause"
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center gap-2">
        {hud.active.map((a) => (
          <PowerChip key={a.kind} kind={a.kind} left={a.left} />
        ))}
      </div>
    </>
  );
}

function PowerChip({ kind, left }: { kind: PowerKind; left: number }) {
  const meta = POWER_META[kind];
  return (
    <div className="glass rounded-full px-3 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-primary">
      {meta.label} · {Math.ceil(left / 1000)}s
    </div>
  );
}
