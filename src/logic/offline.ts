// Offline/online event handling
export function onOffline(callback: () => void) {
  window.addEventListener('offline', callback);
}

export function onOnline(callback: () => void) {
  window.addEventListener('online', callback);
}
