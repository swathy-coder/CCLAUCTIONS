// Local persistent storage utility using IndexedDB for photos and localStorage for small data

// ============= IndexedDB for Photo Storage =============
// Photos are too large for localStorage (5MB limit) and Firebase (16MB limit)
// IndexedDB has ~50GB limit, perfect for storing base64 photos

const DB_NAME = 'AuctionPhotoDB';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('❌ IndexedDB open error:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        console.log('✅ IndexedDB photo store created');
      }
    };
  });
  
  return dbPromise;
}

// Save all player photos to IndexedDB
export async function savePhotosToIndexedDB(auctionId: string, players: Array<{ id: number | string; photo?: string }>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    const store = tx.objectStore(PHOTO_STORE);
    
    // Save each player's photo with a composite key
    let savedCount = 0;
    for (const player of players) {
      if (player.photo) {
        const key = `${auctionId}_${player.id}`;
        store.put({ id: key, auctionId, playerId: player.id, photo: player.photo });
        savedCount++;
      }
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    console.log(`💾 Saved ${savedCount} photos to IndexedDB for auction ${auctionId}`);
  } catch (error) {
    console.error('❌ Failed to save photos to IndexedDB:', error);
  }
}

// Load all player photos from IndexedDB for an auction
export async function loadPhotosFromIndexedDB(auctionId: string): Promise<Map<string | number, string>> {
  const photoMap = new Map<string | number, string>();
  
  try {
    const db = await openDB();
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const store = tx.objectStore(PHOTO_STORE);
    
    const allPhotos = await new Promise<any[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    // Filter photos for this auction and build map
    for (const entry of allPhotos) {
      if (entry.auctionId === auctionId && entry.photo) {
        photoMap.set(entry.playerId, entry.photo);
      }
    }
    
    console.log(`📷 Loaded ${photoMap.size} photos from IndexedDB for auction ${auctionId}`);
  } catch (error) {
    console.error('❌ Failed to load photos from IndexedDB:', error);
  }
  
  return photoMap;
}

// Clear photos for a specific auction
export async function clearPhotosFromIndexedDB(auctionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    const store = tx.objectStore(PHOTO_STORE);
    
    const allPhotos = await new Promise<any[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    // Delete photos for this auction
    for (const entry of allPhotos) {
      if (entry.auctionId === auctionId) {
        store.delete(entry.id);
      }
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    console.log(`🗑️ Cleared photos from IndexedDB for auction ${auctionId}`);
  } catch (error) {
    console.error('❌ Failed to clear photos from IndexedDB:', error);
  }
}

// ============= localStorage for small data =============

export function saveState(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadState(key: string) {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}

export function clearState(key: string) {
  localStorage.removeItem(key);
}
