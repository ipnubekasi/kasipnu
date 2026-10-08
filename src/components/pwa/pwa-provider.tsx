"use client";

import * as React from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type PwaState = {
  /** Peramban menawarkan pemasangan langsung (Chrome, Edge, Android). */
  canInstall: boolean;
  /** iPhone atau iPad: pemasangan lewat menu Bagikan di Safari. */
  isIos: boolean;
  /** Sudah dibuka dari layar utama. */
  isStandalone: boolean;
  /** Ada versi baru aplikasi yang siap dimuat. */
  updateReady: boolean;
  install: () => Promise<void>;
  applyUpdate: () => void;
};

const PwaContext = React.createContext<PwaState>({
  canInstall: false, isIos: false, isStandalone: false, updateReady: false,
  install: async () => {}, applyUpdate: () => {},
});

export const usePwa = () => React.useContext(PwaContext);

/** Ciri perangkat dibaca sekali di peramban; di server nilainya "none". */
function readPlatform(): string {
  const ua = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return `${ios ? "ios" : "other"}|${standalone ? "standalone" : "browser"}`;
}
const subscribeNone = () => () => {};

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = React.useState<InstallEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);
  const platform = React.useSyncExternalStore(subscribeNone, readPlatform, () => "none");
  const isIos = platform.startsWith("ios");
  const isStandalone = installed || platform.endsWith("standalone");

  React.useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    let reloaded = false;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      }).catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const value = React.useMemo<PwaState>(() => ({
    canInstall: Boolean(promptEvent) && !isStandalone,
    isIos,
    isStandalone,
    updateReady: Boolean(waiting),
    install: async () => {
      if (!promptEvent) return;
      await promptEvent.prompt();
      await promptEvent.userChoice.catch(() => null);
      setPromptEvent(null);
    },
    applyUpdate: () => waiting?.postMessage("SKIP_WAITING"),
  }), [promptEvent, isIos, isStandalone, waiting]);

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}
