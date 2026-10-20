// In-memory token bucket per client IP. Good enough for a single Node
// process; behind multiple instances, move this to Redis or the edge.

export function createRateLimiter({ capacity = 10, refillPerMinute = 10, now = () => Date.now() } = {}) {
  const buckets = new Map();
  const refillPerMs = refillPerMinute / 60_000;

  return {
    take(key) {
      const t = now();
      const bucket = buckets.get(key) || { tokens: capacity, updated: t };
      bucket.tokens = Math.min(capacity, bucket.tokens + (t - bucket.updated) * refillPerMs);
      bucket.updated = t;
      if (bucket.tokens < 1) {
        buckets.set(key, bucket);
        return { allowed: false, retryAfterSeconds: Math.ceil((1 - bucket.tokens) / refillPerMs / 1000) };
      }
      bucket.tokens -= 1;
      buckets.set(key, bucket);
      if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value); // bound memory
      return { allowed: true };
    },
  };
}
