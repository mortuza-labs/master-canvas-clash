import { createFileRoute } from "@tanstack/react-router";
import { GameShell } from "@/components/game/GameShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MASTER — Break. Conquer. Master." },
      {
        name: "description",
        content:
          "MASTER is a premium offline arcade brick-breaker: smooth physics, power-ups, three game modes, achievements and installable PWA play.",
      },
      { property: "og:title", content: "MASTER — Break. Conquer. Master." },
      {
        property: "og:description",
        content:
          "Premium arcade brick-breaker with Classic, Endless and Challenge modes. Plays fully offline, installable on mobile and desktop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#080b14" },
    ],
  }),
  component: Index,
});

function Index() {
  return <GameShell />;
}
