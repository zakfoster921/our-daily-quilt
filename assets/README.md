# Assets

Production images/fonts used by `our-daily-beta.html`, `styles/our-daily-beta.css`, and `lib/` are **tracked in git** and deployed via Docker.

**Untracked files here** are usually lab exports or experiments (library pocket renders, tape masks, etc.). Commit them when production or a script depends on them — see the paperclip fix (`color-card-paperclip.png`).

Generate library pocket empty PNG:

```bash
node scripts/render-library-pocket-empty.cjs
```

(requires `assets/library-pocket-source.png` and Playwright locally)
