# Daily quilt reset on Railway Cron

GitHub Actions `schedule` for daily reset is **disabled** (unreliable 2–5+ hour delays). Production reset runs from a **second Railway service** in the same project.

## One-time setup

1. In the Railway project, **New → GitHub Repo** (same repo as production) → name e.g. `daily-reset-cron`.
2. **Settings → Config-as-code** → path: `railway.daily-reset.json`  
   (or set manually: **Cron Schedule** `17 7 * * *`, **Start Command** `node scripts/trigger-daily-reset.cjs`).
3. **Variables** (same as production):
   - `RESET_TOKEN`
   - `RESET_URL` = `https://our-daily-quilt-production.up.railway.app/api/daily-reset`  
     (or rely on `RAILWAY_PUBLIC_DOMAIN` on the cron service)
4. Do **not** assign a public domain to the cron service; it only needs outbound HTTPS.
5. Disable the scheduled run on GitHub: `.github/workflows/daily-reset.yml` is `workflow_dispatch` only. Keep it for emergency manual runs.

## Schedule

- **`17 7 * * *`** — 07:17 UTC (off the `:00` queue spike; still matches app-day `getAppDateKey()` after 07:00 UTC).
- Railway cron is UTC; expect **~1–2 minute** jitter, not hours.

## Local smoke

```bash
RESET_URL=https://our-daily-quilt-production.up.railway.app/api/daily-reset \
RESET_TOKEN=your-token \
npm run cron:daily-reset
```

## Server guard

If reset runs late and `quilts/{today}` already has more than one block, the API **archives yesterday** but **does not clear today**. Response includes `clearedToday: false`, `skippedClearReason: "active_quilt"`. Use admin `force: true` only to intentionally wipe a live quilt.
