import {
  optional,
  standardString,
  standardUrl,
  standardNaturalNumber,
} from './helpers.validators.js';

const envValidators = [
  standardString(
    ['anthropicApiKey'],
    {
      code: 'InvalidAnthropicApiKey',
      message: 'ANTHROPIC_API_KEY should be a valid Anthropic API key.',
      referencedBy: 'environmentVariables',
    },
    { min: 20, max: 200 }
  ),

  optional(standardString)(
    ['anthropicModel'],
    {
      code: 'InvalidAnthropicModel',
      message: 'ANTHROPIC_MODEL should be a valid model id string.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: 100 }
  ),

  standardUrl(['mcpServerUrl'], {
    code: 'InvalidMcpServerUrl',
    message: 'MCP_SERVER_URL should be a valid URL to a Managed MCP Server.',
    referencedBy: 'environmentVariables',
  }),

  standardString(
    ['mcpClientId'],
    {
      code: 'InvalidMcpClientId',
      message: 'MCP_CLIENT_ID should be a valid commercetools API Client id.',
      referencedBy: 'environmentVariables',
    },
    { min: 10, max: 40 }
  ),

  standardString(
    ['mcpClientSecret'],
    {
      code: 'InvalidMcpClientSecret',
      message: 'MCP_CLIENT_SECRET should be a valid API Client secret.',
      referencedBy: 'environmentVariables',
    },
    { min: 10, max: 60 }
  ),

  standardString(
    ['mcpScope'],
    {
      code: 'InvalidMcpScope',
      message: 'MCP_SCOPE should be a non-empty OAuth scope string.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: 200 }
  ),

  standardUrl(['ctpAuthUrl'], {
    code: 'InvalidCtpAuthUrl',
    message: 'CTP_AUTH_URL should be a valid commercetools OAuth endpoint URL.',
    referencedBy: 'environmentVariables',
  }),

  standardString(
    ['inboundApiToken'],
    {
      code: 'InvalidInboundApiToken',
      message:
        'INBOUND_API_TOKEN should be a strong shared secret (min 16 characters) required from callers of this service.',
      referencedBy: 'environmentVariables',
    },
    { min: 16, max: 128 }
  ),

  optional(standardString)(
    ['langfuseSecretKey'],
    {
      code: 'InvalidLangfuseSecretKey',
      message: 'LANGFUSE_SECRET_KEY should be a valid Langfuse secret key.',
      referencedBy: 'environmentVariables',
    },
    { min: 5, max: 200 }
  ),

  optional(standardString)(
    ['langfusePublicKey'],
    {
      code: 'InvalidLangfusePublicKey',
      message: 'LANGFUSE_PUBLIC_KEY should be a valid Langfuse public key.',
      referencedBy: 'environmentVariables',
    },
    { min: 5, max: 200 }
  ),

  optional(standardUrl)(['langfuseBaseUrl'], {
    code: 'InvalidLangfuseBaseUrl',
    message: 'LANGFUSE_BASE_URL should be a valid URL.',
    referencedBy: 'environmentVariables',
  }),

  optional(standardNaturalNumber)(['contextTtlSeconds'], {
    code: 'InvalidContextTtlSeconds',
    message: 'CONTEXT_TTL_SECONDS should be a natural number.',
    referencedBy: 'environmentVariables',
  }),

  optional(standardNaturalNumber)(['rateLimitMaxRequests'], {
    code: 'InvalidRateLimitMaxRequests',
    message: 'RATE_LIMIT_MAX_REQUESTS should be a natural number.',
    referencedBy: 'environmentVariables',
  }),

  optional(standardNaturalNumber)(['rateLimitWindowSeconds'], {
    code: 'InvalidRateLimitWindowSeconds',
    message: 'RATE_LIMIT_WINDOW_SECONDS should be a natural number.',
    referencedBy: 'environmentVariables',
  }),
];

export default envValidators;
