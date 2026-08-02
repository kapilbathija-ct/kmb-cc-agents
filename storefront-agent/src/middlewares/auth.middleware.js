import { timingSafeEqual } from 'crypto';
import configUtils from '../utils/config.util.js';
import CustomError from '../errors/custom.error.js';
import { HTTP_STATUS_UNAUTHORIZED } from '../constants/http.status.constants.js';

/**
 * Validates a shared-secret bearer token from the calling application (the
 * storefront's post-login BFF - never the browser directly). This is a
 * plain inbound webhook, not a commercetools API Extension, so there is no
 * platform-issued auth to rely on here.
 */
function isValidToken(authHeader, inboundApiToken) {
  const expected = Buffer.from(`Bearer ${inboundApiToken}`);
  const actual = Buffer.from(authHeader || '');
  // timingSafeEqual throws on length mismatch, so guard that separately -
  // this leaks only the length of the header, not its content, and avoids a
  // short-circuiting `!==` comparison that leaks how many leading characters
  // of a guess were correct.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const verifyInboundAuth = (request, response, next) => {
  const { inboundApiToken } = configUtils.readConfiguration();
  const authHeader = request.headers['authorization'];

  if (!isValidToken(authHeader, inboundApiToken)) {
    return response
      .status(HTTP_STATUS_UNAUTHORIZED)
      .send(
        new CustomError(
          HTTP_STATUS_UNAUTHORIZED,
          'Unauthorized: missing or invalid Authorization header.'
        )
      );
  }

  return next();
};
