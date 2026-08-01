import CustomError from '../errors/custom.error.js';
import envValidators from '../validators/env-var.validators.js';
import { getValidateMessages } from '../validators/helpers.validators.js';
import { HTTP_STATUS_SERVER_ERROR } from '../constants/http.status.constants.js';

function readConfiguration() {
  const envVars = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    mcpServerUrl: process.env.MCP_SERVER_URL,
    mcpClientId: process.env.MCP_CLIENT_ID,
    mcpClientSecret: process.env.MCP_CLIENT_SECRET,
    mcpScope: process.env.MCP_SCOPE,
    ctpAuthUrl: process.env.CTP_AUTH_URL,
    inboundApiToken: process.env.INBOUND_API_TOKEN,
    upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL,
    upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
    langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
    langfuseBaseUrl: process.env.LANGFUSE_BASE_URL,
    contextTtlSeconds: Number(process.env.CONTEXT_TTL_SECONDS) || 1800,
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,
    rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
  };

  const validationErrors = getValidateMessages(envValidators, envVars);

  if (validationErrors.length) {
    throw new CustomError(
      HTTP_STATUS_SERVER_ERROR,
      'Invalid Environment Variables please check your .env file',
      validationErrors
    );
  }

  return envVars;
}

export default {
  readConfiguration,
};
