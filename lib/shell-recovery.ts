export function matchingShellUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('kaikei-recover', '1');
  return url.href;
}
// Runs before the app module. Retry a broken boot at most once per five minutes,
// using a network document; never clear IndexedDB, recovery records or queues.
export const bootRecoveryScript = `(() => {
  let ready = false;
  addEventListener('kaikei-ready', () => { ready = true; });
  const recover = () => {
    if (ready || !navigator.onLine) return;
    try {
      const key = 'kaikei-shell-recovery-at';
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 300000 || new URL(location.href).searchParams.has('kaikei-recover')) return;
      sessionStorage.setItem(key, String(Date.now()));
      const url = new URL(location.href); url.searchParams.set('kaikei-recover', '1');
      location.replace(url.href);
    } catch { /* The next manual reload still retains all ledger storage. */ }
  };
  addEventListener('error', event => {
    const path = event.target && (event.target.src || event.target.href) || event.filename || '';
    if (path.includes('/_next/static/')) recover();
  }, true);
  addEventListener('unhandledrejection', event => {
    if (/dynamically imported module|module script|Loading chunk|Failed to fetch module/i.test(String(event.reason))) recover();
  });
})();`;
