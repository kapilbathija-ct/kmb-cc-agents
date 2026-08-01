// In-memory replacement for the Redis-backed store used in the initial
// design. Fine for a single-instance prototype proving the agent pattern
// works; state resets on restart/redeploy and won't be shared across
// instances if this app is ever scaled horizontally - swap this module for
// a real Redis/Upstash client (see git history) before that matters.
const store = new Map();

function isExpired(entry) {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

export function memoryGet(key) {
  const entry = store.get(key);
  if (!entry || isExpired(entry)) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function memorySet(key, value, ttlSeconds) {
  store.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export function memoryIncr(key, ttlSeconds) {
  const existing = store.get(key);
  if (!existing || isExpired(existing)) {
    store.set(key, { value: 1, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
    return 1;
  }
  existing.value += 1;
  return existing.value;
}

export function memoryTtlSeconds(key) {
  const entry = store.get(key);
  if (!entry || entry.expiresAt === null) return 0;
  return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
}
