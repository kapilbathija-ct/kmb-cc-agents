import { getRedisClient } from '../clients/redis.client.js';
import { getMcpAccessToken } from '../clients/mcp-auth.client.js';
import { getAnthropicClient } from '../clients/anthropic.client.js';
import configUtils from '../utils/config.util.js';

const HEALTH_CHECK_KEY = 'csr-agent:post-deploy-check';

async function checkRedis() {
  const redis = getRedisClient();
  await redis.set(HEALTH_CHECK_KEY, 'ok', { ex: 30 });
  const value = await redis.get(HEALTH_CHECK_KEY);
  if (value !== 'ok') {
    throw new Error('Redis health check failed: unexpected read-back value.');
  }
}

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
  await checkRedis();
  process.stdout.write('Redis connectivity: OK\n');

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
