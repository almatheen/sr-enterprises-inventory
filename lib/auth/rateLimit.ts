/** Minimal in-memory login throttle (per process). Use a shared store if you run multiple instances. */
const hits = new Map<string, { n: number; t: number }>();
const WINDOW = 15 * 60 * 1000;
const MAX = 8;

export function tooManyAttempts(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.t > WINDOW) return false;
  return h.n >= MAX;
}
export function recordFailure(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.t > WINDOW) hits.set(key, { n: 1, t: now });
  else h.n++;
}
export function clearFailures(key: string) {
  hits.delete(key);
}
