"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // next dev's chunk URLs under /_next/static/ aren't truly immutable the
    // way a production build's content-hashed files are - the same path can
    // serve different content after a dev server restart. The service
    // worker caches those cache-first, so registering it in dev causes it
    // to serve stale JS indefinitely. Only register in production.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
