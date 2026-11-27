import { manifestUrls } from './content.js';

export async function prepareOffline(manifest, selectedStory = null) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const dataSaver = Boolean(connection?.saveData) || connection?.effectiveType === '2g';
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.register((() => { const url = new URL('../sw.js', import.meta.url); if (dataSaver) url.searchParams.set('saulatSaveData', '1'); return url; })(), { scope: new URL('../', import.meta.url).pathname });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller && registration.active) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    if (dataSaver && selectedStory && registration.active) registration.active.postMessage({ type: 'SAULAT_PRECACHE_STORY', story: selectedStory });
    const urls = dataSaver ? manifestUrls({ stories: selectedStory ? [selectedStory] : [] }) : manifestUrls(manifest);
    const checks = await Promise.all(urls.map(async (url) => Boolean(await caches.match(url))));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}
