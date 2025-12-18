# Firebase Setup for Cross-Device Auction Sync

Your app is now configured to use Firebase Realtime Database for cross-device synchronization. Follow these steps to enable it:

## Step 1: Create Firebase Project (5 minutes)

1. Go to https://console.firebase.google.com/
2. Click "Add project" or "Create a project"
3. Enter project name: `CCL-Auction` (or any name you prefer)
4. Disable Google Analytics (optional, not needed)
5. Click "Create project"

## Step 2: Enable Realtime Database

1. In your Firebase project, click "Realtime Database" in the left sidebar
2. Click "Create Database"
3. Choose location: **United States** (or closest to you)
4. Start in **Test mode** (allows read/write without authentication)
5. Click "Enable"

## Step 3: Get Your Firebase Config

1. Click the gear icon (⚙️) next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps" section
4. Click the **</>** (Web) icon
5. Register app name: `Auction App`
6. Click "Register app"
7. **Copy the firebaseConfig object** - it looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

## Step 4: Update Your App Config

1. Open `src/firebase.ts` in VS Code
2. Find lines 6-14 (the firebaseConfig object)
3. **Replace the entire firebaseConfig with your copied config**
4. Save the file

## Step 5: Set Database Rules (Important!)

1. Go back to Firebase Console → Realtime Database
2. Click "Rules" tab
3. Replace the rules with:

```json
{
  "rules": {
    "auctions": {
      "$auctionId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

4. Click "Publish"

⚠️ **Note**: These rules allow anyone with the auction ID to read/write. For production, you may want to add authentication.

## Step 6: Rebuild and Deploy

```powershell
npm run build
```

Then upload the `dist` folder to Netlify.

## How It Works Now

✅ **Cross-Device Sync**: Any device with the auction link sees real-time updates
✅ **Instant Updates**: Changes appear within 1-2 seconds on all devices
✅ **No Polling**: Uses WebSocket connection for real-time push notifications
✅ **Offline Fallback**: localStorage used if Firebase is unavailable

## Testing

1. Start auction on your computer
2. Copy the audience view link from the top bar
3. Open link on your phone/another computer
4. Make changes in the auction - they'll appear instantly on all devices!

## Free Tier Limits

Firebase free tier includes:
- 1 GB stored data
- 10 GB/month downloaded data
- 100 simultaneous connections

This is more than enough for multiple auctions with hundreds of viewers!

## Troubleshooting

**If audience view shows "No data":**
1. Check browser console for errors (F12)
2. Verify databaseURL is correct in firebase.ts
3. Ensure Database Rules are published
4. Check if auction ID in URL matches

**If real-time updates don't work:**
1. Make sure you're using HTTPS (required by Firebase)
2. Check browser allows WebSocket connections
3. Verify firebase/database package is installed: `npm list firebase`

## Need Help?

Firebase errors will appear in browser console (F12 → Console tab). Share those for debugging!
