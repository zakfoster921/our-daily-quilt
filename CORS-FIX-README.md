# Firebase Storage CORS Fix

## Problem
You're experiencing CORS errors when trying to load background images from Firebase Storage:
```
Access to image at 'https://firebasestorage.googleapis.com/...' from origin 'https://zakfoster921.github.io' has been blocked by CORS policy
```

## Root Cause
Firebase Storage needs to be configured to allow cross-origin requests from your domain. By default, it only allows requests from the same origin.

## Solution Options

### Option 1: Configure Firebase Storage CORS (Recommended)

1. **Install Google Cloud SDK** (if not already installed):
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate with Google Cloud**:
   ```bash
   gcloud auth login
   gcloud config set project our-daily
   ```

3. **Run the CORS setup script**:
   ```bash
   cd /Users/zakfoster/Desktop/our-daily-improved
   ./setup-firebase-cors.sh
   ```

4. **Verify the configuration**:
   ```bash
   gsutil cors get gs://our-daily.firebasestorage.app
   ```

### Option 2: Manual CORS Configuration

If the script doesn't work, you can manually configure CORS:

1. **Create the CORS configuration file** (already done):
   ```json
   [
     {
       "origin": ["https://zakfoster921.github.io", "http://localhost:3000"],
       "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
       "maxAgeSeconds": 3600,
       "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
     }
   ]
   ```

2. **Apply the configuration**:
   ```bash
   gsutil cors set firebase-storage-cors.json gs://our-daily.firebasestorage.app
   ```

### Option 3: Firebase Console (Alternative)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `our-daily`
3. Go to Storage → Rules
4. Add CORS headers to your storage rules (advanced)

## Code Improvements Made

The code has been updated with better CORS handling:

1. **Multiple CORS strategies**: Tries `anonymous`, `use-credentials`, and `null` in sequence
2. **Proxy fallback**: Uses a CORS proxy if all strategies fail
3. **Better error handling**: More informative error messages and fallback mechanisms

## Testing

After applying the CORS configuration:

1. **Wait 5-10 minutes** for changes to propagate
2. **Clear browser cache** and reload the page
3. **Check browser console** for CORS-related messages
4. **Test image loading** by selecting a reveal image

## Troubleshooting

### Still getting CORS errors?
- Verify the CORS configuration was applied: `gsutil cors get gs://our-daily.firebasestorage.app`
- Check that your domain is in the allowed origins list
- Try clearing browser cache and cookies
- Test in an incognito/private browser window

### gsutil not found?
- Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
- Or use Firebase CLI: `firebase init` then configure storage

### Authentication issues?
- Run `gcloud auth login` to authenticate
- Ensure you have the correct project selected: `gcloud config set project our-daily`

## Notes

- CORS changes can take 5-10 minutes to propagate
- The configuration allows your GitHub Pages domain and common localhost ports
- The code now has fallback mechanisms to handle CORS issues gracefully
- Consider using Firebase Hosting instead of GitHub Pages for better integration
