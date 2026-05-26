# Notion -> Firestore Quote Sync

## Required env vars

- `NOTION_TOKEN` - Notion integration token
- `NOTION_DATABASE_ID` - Notion quotes database id
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Firebase service account JSON (stringified)

Optional:

- `FIREBASE_PROJECT_ID` - only needed for application default auth
- `FIRESTORE_QUOTES_COLLECTION` - defaults to `quotes`
- `FIRESTORE_DAILY_QUOTES_COLLECTION` - defaults to `dailyQuoteUsage`

## Local setup

Create a `.env` in project root from the template:

```bash
cp .env.example .env
```

Then fill in real values in `.env`.

## Run

Dry run:

```bash
npm run sync:quotes:dry
```

Write to Firestore (default: **next 7 app-days** from `--start`, not the full catalog):

```bash
npm run sync:quotes
```

Full catalog (slower; also deletes Firestore quotes removed from Notion):

```bash
npm run sync:quotes:full
```

Window flags (used by GitHub Actions and manual server sync):

```bash
node scripts/sync-notion-to-firestore.cjs --start=opening --window=7
node scripts/sync-notion-to-firestore.cjs --start=2026-05-26 --window=7
```

`--start` accepts `today`, `tomorrow`, `opening` (quilt day at 07:00 UTC), or `YYYY-MM-DD`.

Windowed sync also pulls **approved + no `date_scheduled`** rows (the scheduling pool) so nightly auto-scheduling still sees new approvals.

## Notion column mapping

- `quote_text` -> `text`
- `author` -> `author`
- `reflection_prompt` -> `reflectionPrompt`
- `community_prompt` -> `communityPrompt` and `community_prompt`
- `small_act` -> `smallAct` and `small_act`
- `what_if` -> `whatIf` and `what_if`
- `mood` -> `mood`
- `blessing` -> `blessing`
- `notification_title` -> `notificationTitle`
- `notification_text` -> `notificationText`
- `notification_enabled` -> `notificationEnabled`
- `active` -> `active`
- `sort_order` -> `sortOrder`
- `theme` -> `theme`

Rows missing `quote_text` or `author` are skipped.

## Usage sync (Firestore -> Notion)

Add these Notion properties:

- `times_used` (Number)
- `last_used_date` (Date)

Dry run:

```bash
npm run sync:usage:dry
```

Write usage back to Notion (same 7-day window by default):

```bash
npm run sync:usage
```

Full catalog:

```bash
npm run sync:usage:full
```

How it works:

- Reads Notion-sourced docs from Firestore `quotes` (`source: "notion"`).
- Reads daily quote docs by date id pattern (`YYYY-MM-DD`) from Firestore.
- Matches by normalized `text + author`.
- Writes count + most recent date to Notion.
