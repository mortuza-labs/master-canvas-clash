/**
 * Guarded service-worker registration: offline play in the published app,
 * never inside dev or the Lovable preview iframe.
 */
export function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev") ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (refused) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs
        .filter((r) => (r.active?.scriptURL ?? "").endsWith("/sw.js"))
        .forEach((r) => void r.unregister());
    });
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
