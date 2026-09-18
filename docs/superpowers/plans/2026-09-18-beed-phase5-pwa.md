# BEEd Exam Prep Platform — Phase 5 Implementation Plan: PWA, Offline Caching, Android Packaging Prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app an installable Android-friendly PWA with a basic offline app shell — manifest, generated icons, a hand-written service worker with network-first navigation caching, and an offline fallback page.

**Architecture:** `app/manifest.ts` (Next.js's built-in manifest route) + generated PNG icons + `public/sw.js` (opportunistic runtime caching, no build-hash precache list) + a client component that registers it + `app/offline/page.tsx` as the fallback.

**Tech Stack:** `sharp` (new, devDependency only, used by a one-off icon-generation script) — no other new packages.

**Spec:** `docs/superpowers/specs/2026-09-18-beed-phase5-pwa-design.md`

## Global Constraints

- The service worker never caches `/api/*`, `/auth/*`, or non-GET requests.
- No hand-written list of Next.js's content-hashed `/_next/static/` filenames anywhere — those are cached opportunistically at runtime, not precached by name.
- Service workers don't activate reliably against `next dev`'s HMR websocket — Task 8's verification uses `npm run build && npm run start`, not `npm run dev`.
- Do not run `git commit` unless the user explicitly asks.

---

## File Structure

```
scripts/generate-icons.mjs              # NEW: one-off sharp script, produces public/icons/*.png
public/icons/icon-192.png                  # NEW: generated
public/icons/icon-512.png                    # NEW: generated
public/icons/icon-maskable-512.png             # NEW: generated
app/manifest.ts                                  # NEW: Next.js manifest route
components/pwa/ServiceWorkerRegister.tsx           # NEW: registers the SW on mount
public/sw.js                                         # NEW: hand-written service worker
app/offline/page.tsx                                   # NEW: offline fallback page
app/layout.tsx                                           # MODIFIED: viewport, icons metadata, mount registrar
next.config.ts                                             # MODIFIED: no-cache headers for /sw.js
```

---

### Task 1: Generate Icons

**Files:**
- Create: `scripts/generate-icons.mjs`
- Modify: `package.json` (via `npm install`)

**Interfaces:**
- Produces: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` — consumed by `app/manifest.ts` (Task 2), `public/sw.js`'s precache list (Task 4), and `app/layout.tsx`'s icons metadata (Task 6).

- [ ] **Step 1: Install sharp as a devDependency**

```bash
npm install --save-dev sharp
```

- [ ] **Step 2: Write the icon generation script**

Create `scripts/generate-icons.mjs`:

```js
import sharp from "sharp";
import { mkdirSync } from "fs";
import path from "path";

const outDir = path.join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

function iconSvg(size, fontSize, yRatio) {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#171717"/>
  <text x="${size / 2}" y="${size * yRatio}" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle">B</text>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, fontSize: 108, yRatio: 0.67 },
  { file: "icon-512.png", size: 512, fontSize: 290, yRatio: 0.67 },
  { file: "icon-maskable-512.png", size: 512, fontSize: 180, yRatio: 0.6 },
];

for (const t of targets) {
  const svg = iconSvg(t.size, t.fontSize, t.yRatio);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, t.file));
  console.log(`Generated public/icons/${t.file}`);
}
```

- [ ] **Step 3: Run it**

```bash
node scripts/generate-icons.mjs
```

Expected: three files created under `public/icons/`.

- [ ] **Step 4: Visually verify**

Read each generated PNG. Expected: a dark (near-black) square with a white "B" roughly centered. If the glyph looks noticeably off-center (too high/low), adjust that target's `yRatio` in the script (raise `yRatio` to move the glyph down, lower it to move up) and re-run Step 3 until it looks right. For the maskable icon specifically, confirm the glyph stays well within the inner ~80% of the canvas (Android's adaptive-icon mask crops toward the edges) — the smaller `fontSize`/`yRatio` in the script already targets this, but confirm visually.

---

### Task 2: Manifest

**Files:**
- Create: `app/manifest.ts`

**Interfaces:**
- Consumes: icon files from Task 1 (referenced by path, no import needed — these are static `public/` assets)
- Produces: `/manifest.webmanifest`, auto-linked by Next.js in every page's `<head>`.

- [ ] **Step 1: Write the manifest route**

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BEEd Review",
    short_name: "BEEd Review",
    description: "Find and study legally accessible BEEd/LET resources.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 3: Service Worker Registration Component

**Files:**
- Create: `components/pwa/ServiceWorkerRegister.tsx`

**Interfaces:**
- Produces: `ServiceWorkerRegister()` (renders nothing) — consumed by `app/layout.tsx` (Task 6).

- [ ] **Step 1: Write the component**

Create `components/pwa/ServiceWorkerRegister.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 4: Service Worker

**Files:**
- Create: `public/sw.js`

**Interfaces:**
- Consumes: `STABLE_PATHS` includes the icon files from Task 1 and `/offline` from Task 5 (write this task's file first; Task 5's page doesn't need to exist yet for the SW file itself to be valid JS, but the precached fallback won't resolve correctly until Task 5 exists — that's fine, complete both before Task 8's verification).

- [ ] **Step 1: Write the service worker**

Create `public/sw.js`:

```js
const CACHE_NAME = "beed-review-v1";
const STABLE_PATHS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STABLE_PATHS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put(request, response.clone()));
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offlineFallback = await caches.match("/offline");
          if (!offlineFallback) return Response.error();
          const body = await offlineFallback.text();
          return new Response(body, {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    })()
  );
});
```

**Deviation from the original draft above, made during execution:** the initial version used fire-and-forget `caches.open(...).then(cache => cache.put(...))` calls without `event.waitUntil()`. Testing surfaced a real bug from this: the browser can terminate an idle service worker before a non-extended promise finishes, so cache writes were intermittently lost. Fixed by wrapping every `cache.put()` in `event.waitUntil()`. The offline-fallback branch also reconstructs a fresh `Response` (via `.text()` + a plain `Content-Type` header) instead of returning the cached `/offline` response object directly, to avoid Response-identity issues when serving one URL's cached response for a different URL's navigation request.

- [ ] **Step 2: Check lint doesn't choke on it**

Run: `npm run lint`
Expected: succeeds. `public/sw.js` uses service-worker-only globals (`self`, `caches`) that plain ESLint doesn't know about by default — if lint errors on this file specifically (undefined globals), check whether this project's `eslint.config.mjs` already excludes `public/` from linting (likely, since Next.js's default config typically doesn't lint static assets). If it doesn't and errors appear, add an `ignores` entry for `public/sw.js` in `eslint.config.mjs` rather than adding eslint-env comments — a static asset file shouldn't need app-code lint rules applied to it at all.

---

### Task 5: Offline Fallback Page

**Files:**
- Create: `app/offline/page.tsx`

**Interfaces:** none (standalone page, no props, no data fetching)

- [ ] **Step 1: Write the page**

Create `app/offline/page.tsx`:

```tsx
"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-neutral-500">
        Some features need an internet connection — search, AI research, the tutor, and quiz
        generation won&apos;t work until you&apos;re back online. Pages you&apos;ve already
        visited may still be available.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
      >
        Try again
      </button>
    </div>
  );
}
```

This lives at the root `app/offline/` (not inside the `(app)` route group), so it renders without the bottom nav / side nav — appropriate for a full-page fallback where tapping into other nav items would likely also fail offline. It also isn't in `proxy.ts`'s `PROTECTED_PREFIXES`, so it's reachable regardless of auth state.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 6: Root Layout Integration

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `ServiceWorkerRegister` (Task 3)

- [ ] **Step 1: Add viewport, icons metadata, and mount the registrar**

Edit `app/layout.tsx` — add the `Viewport` import and `viewport` export, extend `metadata` with `icons`, import `ServiceWorkerRegister`, and render it in the body:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BEEd Review",
  description: "Find and study legally accessible BEEd/LET resources.",
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#171717",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-neutral-900">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
```

(The exact existing `RootLayout` function signature/JSX structure may differ slightly in whitespace from prior phases' edits — match against the file as it currently stands rather than assuming this is a byte-exact diff; the substantive changes are the two new imports, the `icons` field on `metadata`, the new `viewport` export, and rendering `<ServiceWorkerRegister />` inside `<body>`.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 7: No-Cache Headers for the Service Worker

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add the headers() function**

Edit `next.config.ts` to add a `headers` async function to the config object (keep the existing `turbopack.root` setting):

```ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

---

### Task 8: Manual End-to-End Verification

**Files:** none (verification only)

Service workers need a production build to activate reliably — use `npm run build && npm run start`, not `npm run dev`, for all of this task.

- [ ] **Step 1: Start a production server**

```bash
npm run build
npm run start
```

Expected: builds successfully, server starts (default port 3000).

- [ ] **Step 2: Verify the manifest is served correctly**

```bash
curl -s http://localhost:3000/manifest.webmanifest
```

Expected: valid JSON matching Task 2's manifest — `name`, `icons` array with 3 entries, `display: "standalone"`.

- [ ] **Step 3: Verify service worker registration (Playwright)**

Using the playwright-skill, navigate to `http://localhost:3000/login` (a page reachable without auth), wait briefly, then:

```js
const registration = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? { scope: reg.scope, active: !!reg.active } : null;
});
console.log('SW registration:', registration);
```

Expected: `{ scope: 'http://localhost:3000/', active: true }` (may need a short wait/retry for `active` to become true right after first registration).

- [ ] **Step 4: Verify offline behavior for a visited page**

Sign in (use the same test-user-creation approach as Phases 1-4 via the Supabase Admin API), visit `/library` while online (so the SW caches it via the network-first path), then use Playwright's `context.setOffline(true)`, reload `/library`. Expected: the page still renders (served from the SW cache) rather than showing a browser error page.

- [ ] **Step 5: Verify offline fallback for an unvisited page**

While still offline (from Step 4), navigate to a path never visited this session (e.g. `/subjects/some-never-visited-slug`). Expected: lands on the offline fallback content ("You're offline...") rather than a browser network-error page.

- [ ] **Step 6: Clean up**

Set the browser context back online, delete the test user via the Supabase Admin API (same as prior phases), stop the production server (`npm run start`'s process).

---

## Post-Plan Notes

- The service worker's cache-name versioning (`beed-review-v1`) is manual — bump the suffix and the `activate` handler's cleanup will purge the old cache on the next deploy where a breaking caching-strategy change is made. Not automated; fine for this phase's scope.
- Real Android packaging (Bubblewrap/TWA, or a native wrapper) needs a signing key and a Play Console listing — genuinely out of this repo's scope until Stage 3 of the roadmap. When that time comes: the manifest already has everything Bubblewrap needs (`id`, `scope`, `start_url`, `display: standalone`, a maskable icon); the remaining step is generating `.well-known/assetlinks.json` from the real APK's signing certificate fingerprint, which can only happen after that key exists.
