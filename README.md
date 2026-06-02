# Alaric Training Adaptive PWA

This folder contains the installable Progressive Web App version of Alaric's adaptive summer baseball training app.

## Files
- `index.html` — the full training app
- `manifest.json` — app name, icon, colors, and install settings
- `service-worker.js` — offline caching
- `icons/` — home-screen app icons

## How to install on Android
1. Upload the contents of this folder to an HTTPS host such as GitHub Pages, Netlify, or Vercel.
2. Open the hosted `index.html` link in Chrome on the phone.
3. Tap the three-dot menu.
4. Tap **Add to Home screen** or **Install app**.
5. Open it from the new home-screen icon.

Important: For the PWA install prompt to work reliably, it should be served from HTTPS. Opening the HTML directly from the phone's file storage may still display the app, but it usually will not install like a true PWA.
