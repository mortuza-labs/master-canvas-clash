import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { audio } from "@/game/audio";

type Variant = "primary" | "ghost" | "outline";

export function ArcadeButton({
  variant = "outline",
  className,
  onClick,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        audio.play("click");
        onClick?.(e);
      }}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-xl px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.18em] transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        variant === "primary" &&
          "neon-surface hover:brightness-110 hover:shadow-[0_0_36px_oklch(0.85_0.16_195/60%)]",
        variant === "outline" &&
          "glass text-foreground hover:border-primary/60 hover:text-primary hover:shadow-[0_0_22px_oklch(0.85_0.16_195/25%)]",
        variant === "ghost" && "text-muted-foreground hover:text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("glass animate-in-up rounded-2xl p-6 shadow-2xl sm:p-8", className)}>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 text-center">
      <div className="font-display text-xl font-bold text-primary text-glow sm:text-2xl">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
    </div>
  );
}
