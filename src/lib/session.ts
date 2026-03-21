const PREFIX = 'lenslore_';

export function saveToSession<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {}
}

export function loadFromSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(PREFIX));
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}
