# Assets

Production images/fonts used by `our-daily-beta.html`, `styles/our-daily-beta.css`, and `lib/` are **tracked in git** and deployed via Docker.

**Lab / design PNGs** (also tracked): `library-pocket-source.png`, `library-pocket-empty.png`, tape mask/strip variants, `chalk-squiggle.png`, `welcome-how-highlighter.png`, `odq-footer-wordmark.png`, `reflection-patch-star.png`. Used by labs under `archive/html/` and local render scripts — not referenced by production CSS unless promoted deliberately.

Generate library pocket empty PNG:

```bash
node scripts/render-library-pocket-empty.cjs
```

(requires `assets/library-pocket-source.png` and Playwright locally)
