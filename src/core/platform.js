/**
 * What the current host can do. Views gate on a capability, never on a browser name, and a control the
 * host cannot support is not shown at all (the same rule as the HLS Law App's platform layer).
 */

export const isStandalone = () =>
  (typeof navigator !== 'undefined' && navigator.standalone === true) ||
  (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches);

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function can(feature) {
  switch (feature) {
    case 'share-files': {
      try {
        const f = new File(['x'], 'x.json', { type: 'application/json' });
        return !!(navigator.canShare && navigator.canShare({ files: [f] }));
      } catch (e) {
        return false;
      }
    }
    case 'service-worker': return 'serviceWorker' in navigator;
    case 'persist': return !!(navigator.storage && navigator.storage.persist);
    case 'clipboard': return !!(navigator.clipboard && navigator.clipboard.writeText);
    default: return false;
  }
}

/** Hand a JSON file to the person: the iOS share sheet when available, a download otherwise. */
export async function deliverFile(name, text) {
  const file = new File([text], name, { type: 'application/json' });
  if (can('share-files')) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

/** Read a chosen file as text. */
export const readFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

/** A hash of a PIN. A convenience lock to keep a curious student out of the answer keys, not security. */
export async function hashPin(pin, salt = 'hls-mentor') {
  const data = new TextEncoder().encode(salt + ':' + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
