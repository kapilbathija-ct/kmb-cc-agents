import { checkRateLimit } from '../services/rate-limit.service.js';
import CustomError from '../errors/custom.error.js';
import { HTTP_STATUS_TOO_MANY_REQUESTS } from '../constants/http.status.constants.js';
import { logger } from '../utils/logger.utils.js';

// Connect apps sit behind commercetools' own proxy, so the real client IP
// arrives via X-Forwarded-For (first entry) rather than the socket address.
// Not yet verified against a live Connect deployment - re-check this header
// name once the first real request lands in the deployed service's logs.
function extractClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.socket.remoteAddress || 'unknown';
}

export const rateLimitMiddleware = async (request, response, next) => {
  const ip = extractClientIp(request);
  request.clientIp = ip;

  try {
    const result = await checkRateLimit(ip);
    response.set('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      return response
        .status(HTTP_STATUS_TOO_MANY_REQUESTS)
        .set('Retry-After', String(result.resetSeconds))
        .send(
          new CustomError(
            HTTP_STATUS_TOO_MANY_REQUESTS,
            'Too many requests - please slow down.'
          )
        );
    }

    return next();
  } catch (error) {
    // Fail open on rate-limiter errors rather than blocking real traffic -
    // logged for visibility.
    logger.error(error);
    return next();
  }
};
