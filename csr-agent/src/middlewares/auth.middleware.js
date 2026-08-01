import configUtils from '../utils/config.util.js';
import CustomError from '../errors/custom.error.js';
import { HTTP_STATUS_UNAUTHORIZED } from '../constants/http.status.constants.js';

/**
 * Validates a shared-secret bearer token from the calling application (the
 * Merchant Center custom app/view's own backend - never the CSR's browser
 * directly). This is a plain inbound webhook, not a commercetools API
 * Extension, so there is no platform-issued auth to rely on here.
 */
export const verifyInboundAuth = (request, response, next) => {
  const { inboundApiToken } = configUtils.readConfiguration();
  const authHeader = request.headers['authorization'];

  if (authHeader !== `Bearer ${inboundApiToken}`) {
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
