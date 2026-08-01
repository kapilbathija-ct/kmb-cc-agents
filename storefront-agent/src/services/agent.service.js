import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getAnthropicClient } from '../clients/anthropic.client.js';
import { getMcpAccessToken } from '../clients/mcp-auth.client.js';
import { getLangfuseClient } from '../clients/langfuse.client.js';
import configUtils from '../utils/config.util.js';
import { logger } from '../utils/logger.utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(
  path.resolve(__dirname, '../prompts/system-prompt.md'),
  'utf-8'
);

const MCP_SERVER_NAME = 'commercetools';
// Keep the transcript sent to Anthropic bounded - conversation.service.js
// persists the full history in Redis, but only the most recent turns are
// replayed as context on each call.
const MAX_HISTORY_MESSAGES = 20;

export async function runAgentTurn({ identityId, sessionId, userMessage, history }) {
  const config = configUtils.readConfiguration();
  const anthropic = getAnthropicClient();
  const langfuse = getLangfuseClient();
  const mcpToken = await getMcpAccessToken();

  const trace = langfuse.trace({
    name: 'storefront-agent-turn',
    userId: identityId,
    sessionId,
    input: userMessage,
  });

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const messages = [...trimmedHistory, { role: 'user', content: userMessage }];

  const generation = trace.generation({
    name: 'anthropic-messages-mcp',
    model: config.anthropicModel,
    input: messages,
  });

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
      mcp_servers: [
        {
          type: 'url',
          url: config.mcpServerUrl,
          name: MCP_SERVER_NAME,
          authorization_token: mcpToken,
        },
      ],
      tools: [{ type: 'mcp_toolset', mcp_server_name: MCP_SERVER_NAME }],
    });

    generation.end({ output: response.content });

    const replyText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const updatedHistory = [
      ...messages,
      { role: 'assistant', content: response.content },
    ];

    trace.update({ output: replyText });
    await langfuse.flushAsync();

    return { replyText, updatedHistory };
  } catch (error) {
    generation.end({ level: 'ERROR', statusMessage: error.message });
    trace.update({ output: `error: ${error.message}` });
    await langfuse.flushAsync();
    logger.error(error);
    throw error;
  }
}
