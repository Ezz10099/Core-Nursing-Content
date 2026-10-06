# Core Nursing web app - Step 2

This directory is an unpublished browser entry point that reuses the same signed Core Nursing runtime used by Android. It is intentionally separate from the existing Android download page while the web app is still being validated.

## What Step 2 adds

- `index.html` + `boot.js` load the shared `runtime/runtime-manifest.json` instead of maintaining a second copy of the app UI/content.
- The loader verifies the official ECDSA P-256/SHA-256 manifest signature, downloads the content-addressed runtime objects, and verifies each file's SHA-256 hash before starting the app.
- `browser-platform.js` supplies the small browser equivalent of the Android bridge so **Check for updates** works on the web. A newer signed runtime causes a reload into the new shared runtime; signed study-content updates are passed to the existing Core Nursing sync receiver.
- Existing browser `localStorage` persistence is kept. Reading progress, bookmarks, quiz attempts and saved synced content therefore survive normal reloads and runtime updates on the same origin.
- The existing app backup UI remains the source of truth: browser export uses the JSON download fallback and browser restore uses the file picker/FileReader path. No web-only backup format was introduced.

## Deliberately not included yet

Step 3 will add offline caching/service-worker support and Home Screen installation. Step 4 will cover iPhone/Safari validation and publication. This step does not modify the Android APK, Android runtime files, or the current public download page.

## Validation for this step

Run:

```bash
node --check web/boot.js
node --check web/browser-platform.js
python scripts/validate_runtime.py
```

The browser entry point must be served over HTTPS (or localhost) so Web Crypto and fetch are available. Full browser/device testing is still required before publication.
