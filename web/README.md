# Core Nursing web app - Step 3

This branch extends Step 2 with offline browser support and Home Screen installation while continuing to reuse the same signed Core Nursing runtime used by Android.

## What Step 3 adds

- A scoped service worker in web/sw.js precaches the tiny web loader and keeps verified runtime/update files available after an online visit.
- Immutable content-addressed runtime objects use cache-first loading; signed runtime/content manifests use network-first loading with an offline fallback.
- The loader still verifies the official ECDSA P-256/SHA-256 runtime signature and every runtime object's SHA-256 hash before launching the app, including when files are served from the offline cache.
- manifest.webmanifest plus mobile web-app metadata make the browser build installable from supported browsers as a Home Screen/standalone app.
- The same-origin browser storage from Step 2 continues to preserve reading progress, bookmarks, quiz attempts and synced content across reloads and runtime updates.
- Existing JSON backup/export and restore remain unchanged.

## First-use/offline behavior

The first visit must be online so the web loader, current runtime and update files can be cached. After that, reopening the same web origin can start from the cached verified runtime when the network is unavailable. When connectivity returns, Check for updates prefers the network and falls back to the last verified cached release only if the network request fails.

## Still deliberately separate

The Android APK, Android live-update engine and current public Android download page are unchanged. iPhone/Safari device validation and publication remain Step 4.

## Validation

Serve the repository over HTTPS (or localhost), open web/, allow one successful online load, then reload while offline. Also verify that the browser offers Add to Home Screen / Install App and that a Home Screen launch uses standalone display.

Syntax/runtime checks: node --check web/boot.js, node --check web/browser-platform.js, node --check web/sw.js, and python scripts/validate_runtime.py.
