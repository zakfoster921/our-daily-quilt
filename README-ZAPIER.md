# Instagram Quilt Generator for Zapier

This server generates Instagram-ready images from your Our Daily Quilt app and provides a webhook endpoint for Zapier automation.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

The server will run on port 3000 by default.

### 3. Test the Endpoints

**Health Check:**
```bash
curl http://localhost:3000/api/health
```

**Test App Connection:**
```bash
curl http://localhost:3000/api/test
```

**Generate Instagram Image:**
```bash
curl -X POST http://localhost:3000/api/generate-instagram \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Zapier Configuration

### Webhook Setup
- **URL**: `https://your-server.com/api/generate-instagram`
- **Method**: POST
- **Headers**: `Content-Type: application/json`
- **Body**: `{}` (empty for today's quilt) or `{"date": "2025-08-24"}` for specific date

### Response Format
```json
{
  "success": true,
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABDgA...",
  "caption": "The present is theirs; the future, for which I really worked, is mine. — Nikola Tesla",
  "date": "2025-08-24",
  "blockCount": 35,
  "timestamp": "2025-08-24T23:58:00.000Z"
}
```

### Instagram Action Setup
- **Image**: Use the `image` field from the webhook response
- **Caption**: Use the `caption` field from the webhook response

## Deployment

### Option 1: Heroku
1. Create a new Heroku app
2. Set buildpack: `heroku buildpacks:set --index 1 heroku/nodejs`
3. Add Puppeteer buildpack: `heroku buildpacks:add --index 2 https://github.com/heroku/heroku-buildpack-google-chrome`
4. Deploy: `git push heroku main`

### Option 2: Railway
1. Connect your GitHub repo
2. Railway will auto-detect Node.js
3. Deploy automatically

### Option 3: DigitalOcean App Platform
1. Connect your GitHub repo
2. Select Node.js environment
3. Deploy

## Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (production/development)

## Troubleshooting

### Common Issues
1. **Puppeteer timeout**: Increase timeout in server.js
2. **App not loading**: Check if https://www.zakfoster.com/odq2.html is accessible
3. **Memory issues**: Add `--max-old-space-size=2048` to Node.js args

### Logs
Check server logs for detailed error messages:
```bash
npm start
```

## Security Notes
- This server has no authentication - consider adding API keys for production
- The server loads your live quilt app - ensure it's always accessible
- Consider rate limiting for production use
