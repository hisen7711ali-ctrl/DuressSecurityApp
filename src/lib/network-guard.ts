function isAllowed(url: string): boolean {
  try {
    const parsed = new URL(url, typeof location === "undefined" ? "http://local" : location.href);
    if (typeof location !== "undefined" && parsed.origin === location.origin) return true;
    const host = parsed.hostname;
    return host === "grok.com" || host.endsWith(".grok.com");
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    __duressOfflineGuard?: boolean;
  }
}

/** Block app-level network. Platform grok.com + same-origin stay allowed. */
export function installNetworkGuard() {
  if (typeof window === "undefined") return;
  if (window.__duressOfflineGuard) return;
  window.__duressOfflineGuard = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isAllowed(url)) {
      return Promise.reject(new TypeError("blocked: app is offline-only"));
    }
    return origFetch(input, init);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    if (!isAllowed(String(url))) {
      throw new Error("blocked: app is offline-only");
    }
    return origOpen.call(this, method, url, async ?? true, username, password);
  };
}
