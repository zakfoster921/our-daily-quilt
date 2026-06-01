# Our Daily Quilt

Daily collaborative quilt app: portal → quote → color → shared quilt. Web (Railway), Firebase backend, Notion quote sync, Capacitor iOS shell, and GitHub Actions for nightly Instagram assets.

**Production:** https://our-daily-quilt-production.up.railway.app/our-daily-beta.html

## Architecture (short)

| Layer | What |
|-------|------|
| **Client shell** | `our-daily-beta.html` — markup, bootstrap scripts, Firebase init, prototype merge |
| **Styles** | `styles/our-daily-beta.css` |
| **App logic** | `lib/simplified-quilt-app-*.js` (portal, quilt, share, admin, mood, quote UI, nav, shell) |
| **Services** | `lib/*-service.js`, `lib/utils-*.js`, `lib/layout-b-compose.js`, clipping widgets |
| **Config** | `lib/app-config.js` (`CONFIG`) |
| **API** | `server.js` (Node 20 on Railway) — quotes, IG generation, Notion sync hooks, reflection archive |
| **Data** | Firestore (`quilts`, `instagram-images`, …), Firebase Storage |
| **Automation** | `.github/workflows/` — daily reset, nightly IG **images**, Notion sync, speaker cutouts, etc. |

The monolith HTML was split in Phase 8: class methods and Layout B canvas helpers live in `lib/`; CSS is external. The HTML module only defines `SimplifiedQuiltAppV2`’s constructor plus init wiring.

## Local development

```bash
npm install
npm start                    # server.js on :3000
npm run test:ci              # syntax, deps, extracted-global smoke
```

Static preview (no API):

```bash
npx serve -l 3456 .
# open http://localhost:3456/our-daily-beta.html
```

Firebase-backed flows need env/credentials locally (see `server.js` and scripts). Production uses Railway env vars.

## iOS / Capacitor

```bash
npm run build:www            # copies our-daily-beta.html → www/index.html, lib/, styles/, assets/
```

Then open `ios/App` in Xcode. Native shell loads the same `lib/` and `styles/` tree as web.

## Instagram & Zapier

Two different video paths (see `.cursor/rules/instagram-zapier-reels.mdc`):

1. **App reel** — user/browser records → `reel.webm` → transcode → **`reel.mp4`** (animated).
2. **Nightly “static” reel** — optional; single frame loop (`reel-nightly.mp4`). **Scheduled automation posts images only** (`classic.png`, `layout-b.png`, story) via `nightly-instagram-snapshot.yml` → `npm run nightly:ig-images`. Zapier should wait for `readyForInstagram` on `instagram-images/{dateKey}`.

## Repo layout notes

- **Production entry:** `our-daily-beta.html`, `index.html` (redirect), `privacy.html`, `support.html`
- **Labs / mockups:** `*-lab.html`, `color-picker-*.html` — local design tools; excluded from Docker (`.dockerignore`), not deployed
- **Legacy HTML:** older `our-daily-*.html` copies in repo root — not production; kept for reference until Phase 9 cleanup

## Deployment

Railway builds from `Dockerfile`: `server.js`, `our-daily-beta.html`, `lib/`, `styles/`, `assets/`, `scripts/`. Push to `main` to deploy.

Health check: `GET /api/health`
