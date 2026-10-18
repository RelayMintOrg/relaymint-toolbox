/**
 * A fixed-window rate limiter keyed by client address.
 *
 * In memory, so the limit is per server instance. That is the honest scope of
 * it: on a platform that runs several instances the effective ceiling is the
 * limit times the instance count. It still does its job, which is to make
 * hammering the route from one address expensive for the visitor and cheap for
 * the site. A shared store is the upgrade if a site needs a hard global cap.
 */

export interface RateLimiter {
  /** Records a hit for `key` and says whether it is within the limit. */
  hit(key: string): { allowed: boolean; retryAfterSeconds: number };
}

interface Options {
  max: number;
  windowMs: number;
  /** Upper bound on tracked addresses, so the map itself cannot be used to exhaust memory. */
  maxKeys?: number;
  now?: () => number;
}

export function createRateLimiter({ max, windowMs, maxKeys = 5000, now = Date.now }: Options): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  function sweep(at: number): void {
    for (const [key, entry] of windows) {
      if (at - entry.start >= windowMs) windows.delete(key);
    }
    // Still full of live windows: drop the oldest, which are closest to expiring.
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next();
      if (oldest.done) break;
      windows.delete(oldest.value);
    }
  }

  return {
    hit(key) {
      const at = now();
      let entry = windows.get(key);
      if (entry && at - entry.start >= windowMs) {
        windows.delete(key);
        entry = undefined;
      }
      if (!entry) {
        if (windows.size >= maxKeys) sweep(at);
        entry = { start: at, count: 0 };
        windows.set(key, entry);
      }
      entry.count += 1;
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.start + windowMs - at) / 1000));
      return { allowed: entry.count <= max, retryAfterSeconds };
    },
  };
}
