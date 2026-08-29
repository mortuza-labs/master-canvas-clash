export type Mode = "classic" | "endless" | "challenge";

export type Achievement = { id: string; name: string; desc: string };

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-blood", name: "First Blood", desc: "Break your first brick" },
  { id: "level-5", name: "Rising Master", desc: "Reach level 5" },
  { id: "level-10", name: "Grand Master", desc: "Reach level 10" },
  { id: "score-5000", name: "High Roller", desc: "Score 5,000 points in one run" },
  { id: "no-loss", name: "Untouchable", desc: "Clear a level without losing a life" },
  { id: "power-hungry", name: "Power Hungry", desc: "Collect 25 power-ups" },
  { id: "endless-1000", name: "Endless Runner", desc: "Score 1,000 in Endless mode" },
  { id: "challenge-win", name: "Challenger", desc: "Clear a Challenge level" },
];

type Save = {
  high: Record<Mode, number>;
  unlocked: number;
  achievements: string[];
  powerups: number;
  sfx: boolean;
  music: boolean;
};

const KEY = "master-game-v1";

const DEFAULT: Save = {
  high: { classic: 0, endless: 0, challenge: 0 },
  unlocked: 1,
  achievements: [],
  powerups: 0,
  sfx: true,
  music: true,
};

export function loadSave(): Save {
  if (typeof window === "undefined") return { ...DEFAULT, high: { ...DEFAULT.high } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, high: { ...DEFAULT.high } };
    const parsed = JSON.parse(raw) as Partial<Save>;
    return {
      ...DEFAULT,
      ...parsed,
      high: { ...DEFAULT.high, ...(parsed.high ?? {}) },
      achievements: parsed.achievements ?? [],
    };
  } catch {
    return { ...DEFAULT, high: { ...DEFAULT.high } };
  }
}

export function saveSave(s: Save) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export type { Save };
