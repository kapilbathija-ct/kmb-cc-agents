import { getRedisClient } from '../clients/redis.client.js';
import configUtils from '../utils/config.util.js';

const KEY_PREFIX = 'csr-agent:context';

// Conversation context is keyed by the authenticated CSR's own employee/user
// id (from the Merchant Center custom app/view session), not by IP or by any
// customer/order the conversation happens to be discussing - IP is only used
// for rate limiting (see rate-limit.service.js).
function buildKey(agentId, sessionId) {
  return `${KEY_PREFIX}:${agentId}:${sessionId}`;
}

export async function getConversationHistory(agentId, sessionId) {
  const redis = getRedisClient();
  const history = await redis.get(buildKey(agentId, sessionId));
  return Array.isArray(history) ? history : [];
}

export async function saveConversationHistory(agentId, sessionId, messages) {
  const config = configUtils.readConfiguration();
  const redis = getRedisClient();
  await redis.set(buildKey(agentId, sessionId), messages, {
    ex: config.contextTtlSeconds,
  });
}
