import { logger } from '../utils/logger.utils.js';

// The Managed MCP Server's own docs are explicit that in API Client auth
// mode (what this agent uses), per-caller authorization is NOT enforced by
// the platform - "you are responsible for filtering the appropriate tools
// for your users." Anthropic's native MCP connector executes tool calls
// server-side, so we can't intercept a call before it runs - this module
// instead inspects the mcp_tool_use/mcp_tool_result blocks already present
// in the completed response and flags any cart write that didn't land on
// the authenticated customer's own cart.
const CART_WRITE_TOOLS = ['create_carts', 'update_carts'];

function extractResultObject(resultBlock) {
  if (!resultBlock || resultBlock.is_error) {
    return null;
  }

  const textParts = (resultBlock.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text);

  if (textParts.length === 0) {
    return null;
  }

  try {
    return JSON.parse(textParts.join(''));
  } catch {
    // Non-JSON tool output - can't verify, caller should treat as unverifiable.
    return null;
  }
}

function extractCustomerId(obj) {
  if (!obj || typeof obj !== 'object') return undefined;
  return obj.customerId ?? obj.cart?.customerId ?? obj.body?.customerId;
}

// This storefront runs guest chat by design (see the "guest chat is fine
// for now" decision) - the overwhelming majority of carts created here are
// anonymous, keyed by anonymousId, not customerId. A commercetools Cart
// created for an anonymous identity legitimately has no customerId at all
// (it's a real Customer-resource reference, not applicable to a guest), so
// checking only customerId made every single guest add-to-cart look like an
// "unverifiable-result" and get blocked - confirmed live 2026-08-03, a
// guest saying "yes" to add an item to their own cart was rejected with
// the generic "something went wrong" fallback. identityId itself is either
// a real customerId (signed in) or an anonymous UUID (guest, see
// app/api/chat/route.ts's ANON_COOKIE) - check whichever field the result
// actually carries.
function extractAnonymousId(obj) {
  if (!obj || typeof obj !== 'object') return undefined;
  return obj.anonymousId ?? obj.cart?.anonymousId ?? obj.body?.anonymousId;
}

/**
 * Scans a completed Anthropic response for cart-write tool calls and
 * confirms each one actually landed on the authenticated customer's own
 * cart. Fails closed: a write whose outcome can't be verified (missing or
 * unparseable tool result) is treated as a violation, not waved through.
 *
 * Returns { violations, suspiciousAttempts } - violations are confirmed or
 * unverifiable writes (block the reply); suspiciousAttempts are write calls
 * whose *input* named a different customerId but didn't (as far as we can
 * tell) succeed - logged for visibility, not blocking on their own.
 */
export function findUnauthorizedCartWrites(contentBlocks, identityId) {
  const blocks = contentBlocks || [];
  const toolUseBlocks = blocks.filter(
    (block) => block.type === 'mcp_tool_use' && CART_WRITE_TOOLS.includes(block.name)
  );

  const violations = [];
  const suspiciousAttempts = [];

  for (const toolUse of toolUseBlocks) {
    const inputCustomerId = extractCustomerId(toolUse.input);
    if (inputCustomerId && inputCustomerId !== identityId) {
      suspiciousAttempts.push({
        toolUseId: toolUse.id,
        tool: toolUse.name,
        inputCustomerId,
      });
    }

    const resultBlock = blocks.find(
      (block) => block.type === 'mcp_tool_result' && block.tool_use_id === toolUse.id
    );
    const result = extractResultObject(resultBlock);
    const outputCustomerId = extractCustomerId(result);
    const outputAnonymousId = extractAnonymousId(result);

    if (!outputCustomerId && !outputAnonymousId) {
      violations.push({
        toolUseId: toolUse.id,
        tool: toolUse.name,
        reason: 'unverifiable-result',
      });
      continue;
    }

    const ownedByIdentity = outputCustomerId === identityId || outputAnonymousId === identityId;
    if (!ownedByIdentity) {
      violations.push({
        toolUseId: toolUse.id,
        tool: toolUse.name,
        reason: 'customer-mismatch',
        outputCustomerId,
        outputAnonymousId,
      });
    }
  }

  if (suspiciousAttempts.length > 0) {
    logger.warn('storefront-agent: suspicious cross-customer tool input detected', {
      identityId,
      suspiciousAttempts,
    });
  }

  return { violations, suspiciousAttempts };
}
