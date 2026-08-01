import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const REQUIRED_ENV = {
  ANTHROPIC_API_KEY: 'sk-ant-test-key-1234567890',
  MCP_SERVER_URL: 'https://mcp.us-central1.gcp.commercetools.com/projects/test/test-server',
  MCP_CLIENT_ID: 'test-client-id-1234',
  MCP_CLIENT_SECRET: 'test-client-secret-1234',
  MCP_SCOPE: 'mcp:test:test-server',
  CTP_AUTH_URL: 'https://auth.us-central1.gcp.commercetools.com',
  INBOUND_API_TOKEN: 'a-strong-shared-secret-token',
};

describe('verifyInboundAuth', () => {
  const originalEnv = { ...process.env };
  let verifyInboundAuth;

  beforeEach(async () => {
    Object.assign(process.env, REQUIRED_ENV);
    ({ verifyInboundAuth } = await import('../../src/middlewares/auth.middleware.js'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function mockResponse() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  }

  it('calls next() when the bearer token matches', () => {
    const req = { headers: { authorization: `Bearer ${REQUIRED_ENV.INBOUND_API_TOKEN}` } };
    const res = mockResponse();
    const next = jest.fn();

    verifyInboundAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header with 401', () => {
    const req = { headers: {} };
    const res = mockResponse();
    const next = jest.fn();

    verifyInboundAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a wrong token with 401', () => {
    const req = { headers: { authorization: 'Bearer wrong-token' } };
    const res = mockResponse();
    const next = jest.fn();

    verifyInboundAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
