/** Adds a scheme if missing: http for local hosts, https otherwise. */
export function normaliseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return (isLocalHost(value.split(/[/:]/)[0]) ? 'http://' : 'https://') + value;
}

function isLocalHost(host: string): boolean {
  return /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])$/i.test(host) || host.endsWith('.local') || host.endsWith('.localhost');
}

/**
 * A local URL serves whatever code is running now, so a version saved
 * against it drifts. Hosted preview URLs are usually per-deploy and stable.
 */
export function isLiveUrl(url: string): boolean {
  try {
    return isLocalHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** True for hand-saved versions on a local URL: what they show may have moved on. */
export function isDrifting(version: { url: string; source?: string }): boolean {
  return (version.source ?? 'manual') === 'manual' && isLiveUrl(version.url);
}

export function isValidUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function timeAgo(ts: number): string {
  const seconds = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), 'day');
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
