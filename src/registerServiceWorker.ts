// Register the service worker for offline support
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/src/service-worker.ts').then(
        (registration) => {
          console.log('ServiceWorker registration successful:', registration);
        },
        (err) => {
          console.log('ServiceWorker registration failed:', err);
        }
      );
    });
  }
}
