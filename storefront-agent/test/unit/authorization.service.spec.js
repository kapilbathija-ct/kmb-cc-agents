import { describe, it, expect } from '@jest/globals';
import { findUnauthorizedCartWrites } from '../../src/services/authorization.service.js';

const IDENTITY = 'customer-123';

function mcpToolUse(id, name, input) {
  return { type: 'mcp_tool_use', id, name, input };
}

function mcpToolResult(toolUseId, resultObject, { isError = false } = {}) {
  return {
    type: 'mcp_tool_result',
    tool_use_id: toolUseId,
    is_error: isError,
    content: [{ type: 'text', text: JSON.stringify(resultObject) }],
  };
}

describe('findUnauthorizedCartWrites', () => {
  it('finds no violations when a cart write resolves to the caller\'s own customerId', () => {
    const content = [
      mcpToolUse('t1', 'update_carts', { id: 'cart-1', actions: [] }),
      mcpToolResult('t1', { id: 'cart-1', customerId: IDENTITY }),
    ];

    const { violations } = findUnauthorizedCartWrites(content, IDENTITY);
    expect(violations).toHaveLength(0);
  });

  it('flags a confirmed violation when the resulting cart belongs to someone else', () => {
    const content = [
      mcpToolUse('t1', 'update_carts', { id: 'cart-1', actions: [] }),
      mcpToolResult('t1', { id: 'cart-1', customerId: 'someone-else' }),
    ];

    const { violations } = findUnauthorizedCartWrites(content, IDENTITY);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('customer-mismatch');
  });

  it('fails closed when the tool result cannot be parsed or verified', () => {
    const content = [
      mcpToolUse('t1', 'create_carts', { body: {} }),
      { type: 'mcp_tool_result', tool_use_id: 't1', is_error: false, content: [] },
    ];

    const { violations } = findUnauthorizedCartWrites(content, IDENTITY);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('unverifiable-result');
  });

  it('does not flag non-write tools like read_carts', () => {
    const content = [
      mcpToolUse('t1', 'read_carts', { id: 'cart-1' }),
      mcpToolResult('t1', { id: 'cart-1', customerId: 'someone-else' }),
    ];

    const { violations } = findUnauthorizedCartWrites(content, IDENTITY);
    expect(violations).toHaveLength(0);
  });

  it('records a suspicious attempt when the input names a different customer but the call errors out', () => {
    const content = [
      mcpToolUse('t1', 'update_carts', { id: 'cart-1', customerId: 'someone-else' }),
      mcpToolResult('t1', { message: 'not found' }, { isError: true }),
    ];

    const { suspiciousAttempts, violations } = findUnauthorizedCartWrites(content, IDENTITY);
    expect(suspiciousAttempts).toHaveLength(1);
    // The call itself errored (is_error), so extractResultObject returns null -
    // that's still unverifiable and correctly fails closed as a violation too.
    expect(violations).toHaveLength(1);
  });
});
