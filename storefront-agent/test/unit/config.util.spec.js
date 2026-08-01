import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import configUtils from '../../src/utils/config.util.js';

const REQUIRED_ENV = {
  ANTHROPIC_API_KEY: 'sk-ant-test-key-1234567890',
  MCP_SERVER_URL: 'https://mcp.us-central1.gcp.commercetools.com/projects/test/test-server',
  MCP_CLIENT_ID: 'test-client-id-1234',
  MCP_CLIENT_SECRET: 'test-client-secret-1234',
  MCP_SCOPE: 'mcp:test:test-server',
  CTP_AUTH_URL: 'https://auth.us-central1.gcp.commercetools.com',
  INBOUND_API_TOKEN: 'a-strong-shared-secret-token',
};

describe('config.util', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reads a valid configuration without throwing', () => {
    expect(() => configUtils.readConfiguration()).not.toThrow();
  });

  it('defaults contextTtlSeconds, rate limit values, and model when unset', () => {
    delete process.env.CONTEXT_TTL_SECONDS;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    delete process.env.ANTHROPIC_MODEL;

    const config = configUtils.readConfiguration();

    expect(config.contextTtlSeconds).toBe(1800);
    expect(config.rateLimitMaxRequests).toBe(20);
    expect(config.rateLimitWindowSeconds).toBe(60);
    expect(config.anthropicModel).toBe('claude-sonnet-5');
  });

  it('throws when a required secret is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => configUtils.readConfiguration()).toThrow(
      /Invalid Environment Variables/
    );
  });

  it('throws when INBOUND_API_TOKEN is too short', () => {
    process.env.INBOUND_API_TOKEN = 'short';
    expect(() => configUtils.readConfiguration()).toThrow(
      /Invalid Environment Variables/
    );
  });
});
