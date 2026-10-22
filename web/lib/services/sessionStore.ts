import type { Session } from "./types";

const KEY = "flypool.session";

/*
 * The session lives in localStorage so it survives reloads and works when the API is on another domain.
 * Access tokens are short-lived (15 min) and refresh tokens rotate on every use with reuse detection,
 * which limits what a stolen copy can do. If you serve web and API from one site, moving the refresh
 * token to an httpOnly cookie is the next hardening step.
 */
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore: private mode or blocked storage */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
