import { getMcpAccessToken } from '../clients/mcp-auth.client.js';
import { getAnthropicClient } from '../clients/anthropic.client.js';
import configUtils from '../utils/config.util.js';

async function checkMcpAuth() {
  const token = await getMcpAccessToken();
  if (!token) {
    throw new Error('Could not obtain an MCP OAuth access token.');
  }
}

async function checkAnthropic() {
  const config = configUtils.readConfiguration();
  const anthropic = getAnthropicClient();
  await anthropic.messages.create({
    model: config.anthropicModel,
    max_tokens: 8,
    messages: [{ role: 'user', content: 'ping' }],
  });
}

async function postDeploy() {
  await checkMcpAuth();
  process.stdout.write('MCP OAuth token fetch: OK\n');

  await checkAnthropic();
  process.stdout.write('Anthropic API key: OK\n');
}

async function run() {
  try {
    await postDeploy();
  } catch (error) {
    process.stderr.write(`Post-deploy dependency check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

run();
