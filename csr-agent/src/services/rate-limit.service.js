import { memoryIncr, memoryTtlSeconds } from '../clients/memory-store.client.js';
import configUtils from '../utils/config.util.js';

const KEY_PREFIX = 'csr-agent:ratelimit';

/**
 * Fixed-window rate limit keyed on the caller's source IP (not identity -
 * identity is used for conversation context instead, see conversation.service.js).
 * Returns { allowed, remaining, resetSeconds }.
 */
export async function checkRateLimit(ip) {
  const config = configUtils.readConfiguration();
  const key = `${KEY_PREFIX}:${ip}`;

  const count = memoryIncr(key, config.rateLimitWindowSeconds);
  const ttl = memoryTtlSeconds(key);

  return {
    allowed: count <= config.rateLimitMaxRequests,
    remaining: Math.max(0, config.rateLimitMaxRequests - count),
    resetSeconds: ttl > 0 ? ttl : config.rateLimitWindowSeconds,
  };
}
