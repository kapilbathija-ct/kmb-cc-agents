import Anthropic from '@anthropic-ai/sdk';
import configUtils from '../utils/config.util.js';

// Anthropic's native remote-MCP connector (beta) lets the Messages API call
// a remote MCP server's tools directly - no client-side MCP loop needed here.
const MCP_BETA_HEADER = 'mcp-client-2025-11-20';

let anthropicClient;

export function getAnthropicClient() {
  if (!anthropicClient) {
    const config = configUtils.readConfiguration();
    anthropicClient = new Anthropic({
      apiKey: config.anthropicApiKey,
      defaultHeaders: { 'anthropic-beta': MCP_BETA_HEADER },
    });
  }
  return anthropicClient;
}
