import { manifestUrls } from './content.js';

export async function prepareOffline(manifest) {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
  try {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const urls = manifestUrls(manifest);
    const checks = await Promise.all(urls.map(async (url) => Boolean(await caches.match(new URL(url, location.origin).href))));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}
