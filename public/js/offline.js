import { manifestUrls } from './content.js';

export async function prepareOffline(manifest) {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller && registration.active) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    const urls = manifestUrls(manifest);
    const checks = await Promise.all(urls.map(async (url) => Boolean(await caches.match(new URL(url, location.origin).href))));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}
