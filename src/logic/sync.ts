// Sync data when online
export function syncData(syncFn: () => Promise<void>) {
  window.addEventListener('online', () => {
    syncFn();
  });
}
