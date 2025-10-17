/**
 * Service Worker Module
 * Handles PWA service worker registration, updates, and notifications
 */

/**
 * Registers the service worker and sets up update notifications
 */
export function initializeServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register("./serviceworker.js")
        .then(registration => {
          // Check for updates periodically (every hour)
          setInterval(() => {
            registration.update();
          }, 3600000);
          
          // Listen for new service worker waiting to activate
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showUpdateNotification();
                }
              });
            }
          });
        })
        .catch(() => {
          // ServiceWorker registration failed - app will work without offline support
        });
    });
  }
}

/**
 * Shows update notification to user when new version is available
 */
function showUpdateNotification() {
  const notification = document.createElement('div');
  notification.id = 'update-notification';
  notification.innerHTML = `
    <div style="position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.9); color: white; padding: 15px 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 10004; max-width: 90%; text-align: center; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);">
      <div style="font-weight: bold; margin-bottom: 8px;">🎉 Nieuwe versie beschikbaar!</div>
      <button onclick="window.updateApp()" style="margin: 5px; padding: 8px 16px; background: linear-gradient(45deg, #f09819 0%, #ff8c00 100%); border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: bold;">Updaten</button>
      <button onclick="window.dismissUpdate()" style="margin: 5px; padding: 8px 16px; background: rgba(255,255,255,0.2); border: none; border-radius: 8px; color: white; cursor: pointer;">Later</button>
    </div>
  `;
  document.body.appendChild(notification);
}

/**
 * Updates app to new version
 */
export function updateApp() {
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.remove();
  }
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      }
    });
  }
}

/**
 * Dismisses update notification
 */
export function dismissUpdate() {
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }
}

// Make functions available globally for inline onclick handlers
window.updateApp = updateApp;
window.dismissUpdate = dismissUpdate;
