import { memoryGet, memorySet } from '../clients/memory-store.client.js';
import configUtils from '../utils/config.util.js';

const KEY_PREFIX = 'storefront-agent:context';

// Conversation context is keyed by the authenticated customer's id, not by
// IP - IP is only used for rate limiting (see rate-limit.service.js). This
// keeps context tied to who the shopper actually is, which matters since
// this agent runs post-login.
function buildKey(customerId, sessionId) {
  return `${KEY_PREFIX}:${customerId}:${sessionId}`;
}

export async function getConversationHistory(customerId, sessionId) {
  const history = memoryGet(buildKey(customerId, sessionId));
  return Array.isArray(history) ? history : [];
}

export async function saveConversationHistory(customerId, sessionId, messages) {
  const config = configUtils.readConfiguration();
  memorySet(buildKey(customerId, sessionId), messages, config.contextTtlSeconds);
}
