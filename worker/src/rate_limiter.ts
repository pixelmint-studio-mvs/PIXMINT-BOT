/**
 * PIXMINT BOT - In-Memory Sliding-Window Rate Limiter
 *
 * ARCHITECTURAL SEMANTICS:
 * - This rate limiter provides isolate-local (process-local) best-effort rate limiting.
 * - In Cloudflare Workers, state is held in isolate memory and is not globally shared
 *   across distributed edge data centers or durable across isolate cold starts/restarts.
 * - For global multi-region distributed synchronization, a centralized store (such as
 *   Cloudflare KV, Durable Objects, or Cloudflare Rate Limiting API) would be required.
 * - Memory is strictly bounded: inactive buckets and expired timestamps are evicted to prevent memory leaks.
 */

interface RateLimitBucket {
  timestamps: number[];
}

const userBuckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 10000;

/**
 * Periodically prunes inactive buckets to prevent isolate memory leaks.
 */
function pruneStaleBuckets(now: number, windowMs: number): void {
  if (userBuckets.size <= MAX_BUCKETS) return;

  for (const [key, bucket] of userBuckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);
    if (bucket.timestamps.length === 0) {
      userBuckets.delete(key);
    }
  }
}

/**
 * Enforces a sliding-window rate limit per key (UID or Client IP).
 * Bounded strictly by limitPerMinute.
 */
export function checkRateLimit(
  key: string,
  limitPerMinute: number = 30
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const safeLimit = Math.max(1, limitPerMinute || 30);

  // Evict stale buckets if memory threshold reached
  pruneStaleBuckets(now, windowMs);

  let bucket = userBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    userBuckets.set(key, bucket);
  }

  // Prune timestamps outside the 60-second window
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= safeLimit) {
    const oldest = bucket.timestamps[0] || now;
    const resetMs = Math.max(1000, windowMs - (now - oldest));
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, safeLimit - bucket.timestamps.length),
    resetMs: windowMs,
  };
}

/**
 * Resets all rate limit buckets (useful for test isolation).
 */
export function resetRateLimits(): void {
  userBuckets.clear();
}

