// Firebase configuration for real-time auction sync
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';

// Firebase configuration - Your actual CCL Auctions project
const firebaseConfig = {
  apiKey: "AIzaSyDOsVtsR-8SN3pYZwfVkbLnKb6t1P_yQTk",
  authDomain: "cclauctions.firebaseapp.com",
  databaseURL: "https://cclauctions-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cclauctions",
  storageBucket: "cclauctions.firebasestorage.app",
  messagingSenderId: "743003530250",
  appId: "1:743003530250:web:f7b0c13837204d3233abf3"
};

// Initialize Firebase
let app: ReturnType<typeof initializeApp> | undefined;
let database: ReturnType<typeof getDatabase> | undefined;

try {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
  console.log('✅ Firebase initialized successfully');
  console.log('Database URL:', firebaseConfig.databaseURL);
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  alert('Firebase connection failed. Cross-device sync will not work. Check console for details.');
}

export function generateAuctionId(): string {
  // Generate a short, readable auction ID (6 characters)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, I, 1
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export function getAuctionIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('auction');
}

export function setAuctionIdInUrl(auctionId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('auction', auctionId);
  window.history.replaceState({}, '', url.toString());
}

// Helper to check if a photo is a URL (keep it) or base64 (strip it)
function isPhotoUrl(photo: unknown): boolean {
  if (typeof photo !== 'string') return false;
  return photo.startsWith('http://') || photo.startsWith('https://') || photo.startsWith('/');
}

// Helper function to strip ONLY base64 photos from state to reduce Firebase data size
// URL photos are tiny (~100 bytes) and should be KEPT for cross-device resume
// Base64 photos are huge (~600KB each) and must be stripped
function stripPhotosFromState(state: unknown): unknown {
  if (typeof state !== 'object' || state === null) return state;
  
  const stateCopy = { ...state } as Record<string, unknown>;
  
  // Helper to conditionally strip photo (keep URLs, strip base64)
  const stripBase64Photo = (player: Record<string, unknown>): Record<string, unknown> => {
    if (isPhotoUrl(player.photo)) {
      // Keep URL photos - they're tiny and needed for cross-device resume
      return player;
    } else {
      // Strip base64 photos - they're huge
      const copy = { ...player };
      delete copy.photo;
      return copy;
    }
  };
  
  // KEEP currentPlayer photo (audience view needs it)
  // But if it's base64, we might need to handle it separately
  
  // Process soldPlayers array - strip base64, keep URLs
  if (Array.isArray(stateCopy.soldPlayers)) {
    stateCopy.soldPlayers = stateCopy.soldPlayers.map((p: unknown) => {
      if (typeof p === 'object' && p !== null) {
        return stripBase64Photo(p as Record<string, unknown>);
      }
      return p;
    });
  }
  
  // Process players array - strip base64, keep URLs
  if (Array.isArray(stateCopy.players)) {
    stateCopy.players = stateCopy.players.map((p: unknown) => {
      if (typeof p === 'object' && p !== null) {
        return stripBase64Photo(p as Record<string, unknown>);
      }
      return p;
    });
  }
  
  // Process teamRosterData - strip base64, keep URLs
  if (stateCopy.teamRosterData && typeof stateCopy.teamRosterData === 'object') {
    const rosterCopy = { ...stateCopy.teamRosterData } as Record<string, unknown>;
    for (const teamName of Object.keys(rosterCopy)) {
      const teamData = rosterCopy[teamName];
      if (teamData && typeof teamData === 'object' && Array.isArray((teamData as any).players)) {
        const teamDataCopy = { ...teamData } as Record<string, unknown>;
        teamDataCopy.players = ((teamData as any).players as unknown[]).map((p: unknown) => {
          if (typeof p === 'object' && p !== null) {
            return stripBase64Photo(p as Record<string, unknown>);
          }
          return p;
        });
        rosterCopy[teamName] = teamDataCopy;
      }
    }
    stateCopy.teamRosterData = rosterCopy;
  }
  
  // Also handle currentPlayer - keep URL, strip base64
  if (stateCopy.currentPlayer && typeof stateCopy.currentPlayer === 'object') {
    stateCopy.currentPlayer = stripBase64Photo(stateCopy.currentPlayer as Record<string, unknown>);
  }
  
  return stateCopy;
}

// Simple polling-based sync using localStorage with auction ID prefix (only for lightweight data)
export function saveAuctionState(auctionId: string, state: unknown) {
  const key = `auction_${auctionId}`;
  const stateWithTimestamp = {
    ...(typeof state === 'object' && state !== null ? state : {}),
    timestamp: Date.now(),
  };
  
  try {
    // Strip photos to save space in localStorage
    const lightweightState = stripPhotosFromState(stateWithTimestamp);
    localStorage.setItem(key, JSON.stringify(lightweightState));
  } catch (error) {
    // If localStorage is full, silently fail and rely on Firebase
    console.warn('⚠️ localStorage quota exceeded, relying on Firebase:', error);
    
    // Try to clear old auction data to free up space
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith('auction_') && k !== key) {
          localStorage.removeItem(k);
        }
      });
      // Retry saving after cleanup
      const lightweightState = stripPhotosFromState(stateWithTimestamp);
      localStorage.setItem(key, JSON.stringify(lightweightState));
    } catch {
      // If still fails, just continue without localStorage
      console.warn('⚠️ Could not save to localStorage even after cleanup');
    }
  }
}

export function loadAuctionState(auctionId: string): unknown | null {
  const key = `auction_${auctionId}`;
  const data = localStorage.getItem(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Remove all undefined values from an object (Firebase doesn't allow undefined)
function removeUndefinedValues(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return null; // Convert undefined to null (Firebase accepts null)
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedValues(item));
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedValues(value);
      }
      // If value is undefined, we simply don't include it in the cleaned object
    }
    return cleaned;
  }
  return obj;
}

// Save auction state to Firebase Realtime Database
export async function saveAuctionStateOnline(auctionId: string, state: unknown): Promise<void> {
  console.log(`📤 [saveAuctionStateOnline] Called with auctionId: ${auctionId}`);
  console.log(`   State keys:`, Object.keys(state as any).join(', '));
  console.log(`   Current player:`, (state as any)?.currentPlayer?.name);
  console.log(`   Team balances count:`, (state as any)?.teamBalances?.length);
  console.log(`   Auction log entries:`, (state as any)?.auctionLog?.length);
  
  if (!database) {
    console.error('❌❌❌ CRITICAL: Firebase database NOT initialized!');
    alert('Firebase not initialized! Changes will NOT sync to other devices. Please refresh the page.');
    // Try localStorage as last resort
    try {
      saveAuctionState(auctionId, state);
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
    return;
  }
  
  try {
    // Save to Firebase Realtime Database (primary storage)
    const auctionRef = ref(database, `auctions/${auctionId}`);
    const stateData = typeof state === 'object' && state !== null ? state : {};
    
    // Strip photos before saving to Firebase to reduce data size
    const lightweightState = stripPhotosFromState(stateData) as Record<string, unknown>;
    
    // CRITICAL: Remove all undefined values - Firebase rejects undefined!
    const sanitizedState = removeUndefinedValues(lightweightState) as Record<string, unknown>;
    
    console.log(`📝 [Firebase] Saving to path: auctions/${auctionId}`);
    console.log(`📝 [Firebase] Data size: ~${JSON.stringify(sanitizedState).length} bytes`);
    
    await set(auctionRef, {
      ...(typeof sanitizedState === 'object' && sanitizedState !== null ? sanitizedState : {}),
      lastUpdated: Date.now(),
    });
    console.log('✅✅✅ [Firebase] SAVE COMPLETE for:', auctionId, '| Log entries:', (sanitizedState as any).auctionLog?.length || 0);
    console.log(`✅ [Firebase] Last updated player:`, (sanitizedState as any).currentPlayer?.name || 'N/A');
    
    
    // Also save to localStorage as backup (non-blocking, ignore errors)
    try {
      saveAuctionState(auctionId, state);
    } catch {
      // Silently fail localStorage - Firebase is our primary storage
      console.warn('⚠️ localStorage backup failed (quota exceeded), using Firebase only');
    }
  } catch (error) {
    console.error('❌ Failed to save auction state to Firebase:', error);
    
    // Check for specific error types
    const errorMsg = String(error);
    if (errorMsg.includes('PERMISSION_DENIED')) {
      console.error('🔐 Firebase Permission Denied - Check database rules');
      alert('Firebase permission error. Please check Firebase database rules (should allow read/write in /auctions)');
    } else if (errorMsg.includes('NETWORK_ERROR')) {
      console.error('🌐 Firebase Network Error - Check internet connection');
    }
    
    // Try localStorage as fallback
    try {
      saveAuctionState(auctionId, state);
      console.log('✅ Saved to localStorage as Firebase fallback');
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }
}

// Load auction state from Firebase Realtime Database
export async function loadAuctionStateOnline(auctionId: string): Promise<unknown | null> {
  if (!database) {
    console.warn('Firebase not initialized, using localStorage only');
    return loadAuctionState(auctionId);
  }
  
  try {
    // Fetch from Firebase (primary source)
    return new Promise((resolve) => {
      const auctionRef = ref(database, `auctions/${auctionId}`);
      onValue(auctionRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          console.log('✅ Loaded from Firebase:', auctionId, '| Log entries:', data.auctionLog?.length || 0);
          // Try to save to localStorage for offline access (ignore errors)
          try {
            saveAuctionState(auctionId, data);
          } catch {
            // Silently fail - Firebase is primary
          }
          resolve(data);
        } else {
          console.log('⚠️ No data in Firebase for:', auctionId, '- trying localStorage');
          // Fallback to localStorage if Firebase has no data
          resolve(loadAuctionState(auctionId));
        }
      }, (error) => {
        console.error('❌ Failed to load from Firebase:', error);
        const errorMsg = String(error);
        if (errorMsg.includes('PERMISSION_DENIED')) {
          console.error('🔐 Firebase Permission Denied - Check database rules');
        }
        // Fallback to localStorage on error
        resolve(loadAuctionState(auctionId));
      }, { onlyOnce: true });
    });
  } catch (error) {
    console.error('Failed to load auction state online:', error);
    return loadAuctionState(auctionId);
  }
}

// Subscribe to real-time updates from Firebase
export function subscribeToAuctionUpdates(
  auctionId: string,
  callback: (state: unknown) => void
): () => void {
  console.log(`📡 [subscribeToAuctionUpdates] Setting up subscription for auctionId: ${auctionId}`);
  
  if (!database) {
    console.warn('Firebase not initialized, real-time updates unavailable');
    return () => {};
  }
  
  const auctionRef = ref(database, `auctions/${auctionId}`);
  console.log(`📡 [Firebase] Listening to path: auctions/${auctionId}`);
  
  let callbackCount = 0;
  const unsubscribe = onValue(auctionRef, (snapshot) => {
    callbackCount++;
    const data = snapshot.val();
    console.log(`📡 [Firebase Subscription] FIRED #${callbackCount}:`, {
      auctionId,
      hasData: !!data,
      logEntries: data?.auctionLog?.length || 0,
      currentPlayer: data?.currentPlayer?.name,
      timestamp: new Date().toLocaleTimeString()
    });
    if (data) {
      console.log(`📡 [Firebase Subscription] Calling callback with data. Last entry:`, data.auctionLog?.[data.auctionLog?.length - 1]);
      callback(data);
    } else {
      console.log(`⚠️ [Firebase Subscription] Snapshot is empty for ${auctionId}`);
    }
  }, (error) => {
    console.error(`❌ [Firebase Subscription] Error for ${auctionId}:`, error);
  });
  
  return unsubscribe;
}

