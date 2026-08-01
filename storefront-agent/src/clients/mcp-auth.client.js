import configUtils from '../utils/config.util.js';
import CustomError from '../errors/custom.error.js';
import { HTTP_STATUS_SERVER_ERROR } from '../constants/http.status.constants.js';
import { logger } from '../utils/logger.utils.js';

// commercetools OAuth access tokens for MCP-scoped clients can live up to
// 30 days, but this client always fetches its own short-lived token and
// refreshes it proactively - that avoids ever depending on a long-lived
// token embedded in deploy-time config going stale mid-project.
let cachedToken = null;
let cachedTokenExpiresAt = 0;
const REFRESH_MARGIN_SECONDS = 60;

async function fetchNewToken() {
  const config = configUtils.readConfiguration();
  const basicAuth = Buffer.from(
    `${config.mcpClientId}:${config.mcpClientSecret}`
  ).toString('base64');

  const response = await fetch(`${config.ctpAuthUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: config.mcpScope,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new CustomError(
      HTTP_STATUS_SERVER_ERROR,
      `Failed to obtain MCP OAuth token (status ${response.status}): ${body}`
    );
  }

  const data = await response.json();
  return data;
}

export async function getMcpAccessToken() {
  const nowSeconds = Date.now() / 1000;

  if (cachedToken && nowSeconds < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const data = await fetchNewToken();
  cachedToken = data.access_token;
  cachedTokenExpiresAt =
    nowSeconds + data.expires_in - REFRESH_MARGIN_SECONDS;

  logger.info('Refreshed MCP OAuth access token');
  return cachedToken;
}
