function isAllowed(url: string): boolean {
  try {
    const parsed = new URL(url, typeof location === "undefined" ? "http://local" : location.href);
    // The Capacitor WebView is allowed to load only its own bundled/local origin.
    // No remote hostname is permitted, including the development platform host.
    return typeof location !== "undefined" && parsed.origin === location.origin;
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    __duressOfflineGuard?: boolean;
  }
}

/** Strict app-level network guard: bundled/same-origin resources only. */
export function installNetworkGuard() {
  if (typeof window === "undefined") return;
  if (window.__duressOfflineGuard) return;
  window.__duressOfflineGuard = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isAllowed(url)) {
      return Promise.reject(new TypeError("blocked: Duress Security is offline-only"));
    }
    return origFetch(input, init);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    if (!isAllowed(String(url))) {
      throw new Error("blocked: Duress Security is offline-only");
    }
    return origOpen.call(this, method, url, async ?? true, username, password);
  };
}
