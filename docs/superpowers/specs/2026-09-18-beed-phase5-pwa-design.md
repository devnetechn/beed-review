# BEEd Exam Prep Platform — Phase 5 Design: PWA, Offline Caching, Android Packaging Prep

Status: Approved
Date: 2026-09-18

## Context

Phases 1-4 shipped the full functional product: discovery, library, AI
research, summarization, tutor, and a scored quiz engine. This is the
last phase from the original roadmap: making the site installable as a
Progressive Web App on Android, giving it a basic offline app shell,
and preparing it for the eventual native Android packaging step
(Stage 3 of the long-term product — outside this Next.js codebase).

## Decisions Made Without a Separate Chat Round (flagged for visibility)

1. **No `next-pwa` or Workbox.** Both are common shortcuts, but
   `next-pwa` has a history of lagging behind new Next.js major
   versions, and this project is on a very new one (Next.js 16 with
   Turbopack/webpack dual builds already causing enough friction in
   earlier phases). A hand-written service worker is a bit more code
   but has no version-compatibility risk and is fully under our
   control.
2. **No build-time precache manifest of hashed asset filenames.**
   Next.js's `/_next/static/` filenames are content-hashed and change
   every build. A hand-written list of exact filenames would go stale
   the moment the app is rebuilt. Instead: static assets are cached
   *opportunistically* (cache-first, populated the first time each is
   fetched — safe because a given hash's content never changes), and
   only a small set of *stable* paths (`/`, `/offline`, the manifest,
   icons) are precached at install time.
3. **Navigation caching is network-first with a cache fallback, not
   cache-first.** Users should always see fresh data when online; the
   cache only kicks in when the network request fails. This also means
   the Library page's cached HTML (with saved resources baked into the
   server-rendered markup) becomes exactly the "cached study content"
   offline support the original brief asked for — no separate
   IndexedDB sync layer needed for this phase.
4. **`/api/*`, `/auth/*`, and non-GET requests are never cached.**
   Caching a search result or a save/unsave response would risk
   showing stale or wrong data. The service worker passes these
   through untouched.
5. **Icons are generated, not designed.** There's no design asset
   pipeline in this project. I'll generate simple, on-brand (black/
   white, matching the existing minimalist UI) icons programmatically
   from an inline SVG via a one-off script using `sharp` (added as a
   devDependency, not a runtime dependency).
6. **"Android packaging preparation" means manifest correctness, not
   an actual APK.** Producing a real Android package (via Bubblewrap/
   TWA or a WebView wrapper) needs a signing key and happens outside
   this codebase, in Stage 3 of your roadmap. This phase makes sure
   `manifest.webmanifest` has everything that tooling will need
   (`id`, `scope`, `start_url`, `display: standalone`, maskable icon,
   theme/background colors) and documents the next steps rather than
   fabricating a fake `assetlinks.json`.
7. **iOS gets minimal, not full, PWA support.** The brief says
   "Android-friendly PWA" specifically. I'll add the cheap iOS niceties
   (apple-touch-icon) but won't build iOS-specific install-prompt UX.

## Goals (Phase 5)

- `app/manifest.ts` (Next.js's built-in manifest route convention) —
  auto-served at `/manifest.webmanifest` with the correct `<link>` tag
  injected automatically.
- Generated icons: 192×192, 512×512 (`purpose: "any"`), and a 512×512
  maskable variant, via a `sharp`-based script.
- `public/sw.js`: hand-written service worker with the caching
  strategy above.
- A client component that registers the service worker on mount,
  mounted once in the root layout.
- `app/offline/page.tsx`: a minimal fallback page shown when a
  navigation fails offline and nothing cached matches.
- `viewport` export in `app/layout.tsx` for `themeColor`.
- `next.config.ts` headers so `/sw.js` is never cached by the browser
  itself (so updates roll out promptly).

## Non-Goals (Phase 5)

- No actual Android APK/AAB — that's Stage 3, outside this repo.
- No offline support for AI research, tutor chat, or quiz generation —
  these need OpenAI/web access by nature (the brief explicitly says
  so).
- No IndexedDB-based structured offline data sync for saved
  resources/notes — the network-first HTML caching covers the "cached
  study content" bar for this phase; true structured sync is a future
  enhancement if it turns out to matter.
- No push notifications, background sync, or other advanced service
  worker features.
- No changes to existing mobile-responsive UI — it's already
  mobile-first since Phase 1; this phase just makes it installable.

## Architecture

### Manifest

`app/manifest.ts` exports a `MetadataRoute.Manifest`:

```
name, short_name, description, id: "/", start_url: "/",
scope: "/", display: "standalone", orientation: "portrait",
background_color, theme_color,
icons: [192 any, 512 any, 512 maskable]
```

Next.js serves this at `/manifest.webmanifest` and auto-injects the
`<link rel="manifest">` tag — no manual head markup needed.

### Icons

`scripts/generate-icons.mjs` (run manually, output committed to
`public/icons/`, not regenerated on every build): renders a simple
inline SVG (dark square, white "B" glyph, matching the app's black/
white minimalist look) via `sharp` to three PNGs. The maskable variant
gets extra padding so Android's adaptive-icon mask doesn't clip the
glyph.

### Service Worker

`public/sw.js`, registered by a small client component:

```
install:
  - cache a small STABLE set of paths: "/", "/offline",
    "/manifest.webmanifest", icon files, "/favicon.ico"

fetch:
  - if method !== GET, or url starts with /api/ or /auth/: pass through
    (no caching, no offline fallback — these need live network by
    nature)
  - if request is a navigation (mode: "navigate"):
      network-first → on success, clone + cache the response
                     → on failure, try cache match → else /offline
  - else (static assets, /_next/static/, icons, etc.):
      cache-first → on cache miss, fetch, clone + cache, return

activate:
  - delete any caches from a previous cache-name version (simple
    versioned cache name, bump manually on breaking SW changes)
```

### Registration

`components/pwa/ServiceWorkerRegister.tsx` (`"use client"`, renders
nothing): in a `useEffect`, feature-detects `"serviceWorker" in
navigator` and registers `/sw.js`. Mounted once in `app/layout.tsx`
(root, not the `(app)` group, so it's active on auth pages too).

### Offline Fallback

`app/offline/page.tsx`: static, no data fetching, just a friendly
"You're offline — some features need an internet connection" message
with a manual retry button (`location.reload()`).

## Error Handling

- Service worker registration failures are caught and logged to the
  console, never surfaced as a user-facing error — a PWA that fails to
  install as an app should still work as a normal website.
- If `sharp` isn't installed when someone runs the icon script later,
  npm's own "module not found" error is sufficient — no custom
  handling needed for a one-off dev script.

## Testing (Phase 5)

Manual verification via `npm run build && npm run start` (service
workers generally don't activate reliably against `next dev`'s HMR
websocket noise, so this phase is verified against a production
build): confirm `/manifest.webmanifest` is served with correct JSON,
confirm the service worker registers and reaches `activated` state,
run a Lighthouse PWA audit and check the installability checks pass,
then use a headless browser's offline emulation to confirm a
previously-visited page (including Library) still renders offline and
an unvisited one falls back to `/offline`. No automated test
framework, consistent with every prior phase.

## Explicitly Deferred

- Real Android APK/AAB generation (Stage 3, outside this repo).
- IndexedDB-based offline data sync.
- Push notifications, background sync.
- iOS-specific install UX.
