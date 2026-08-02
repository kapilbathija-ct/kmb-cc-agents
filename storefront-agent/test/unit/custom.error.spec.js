import { describe, it, expect } from '@jest/globals';
import CustomError from '../../src/errors/custom.error.js';

describe('CustomError', () => {
  it('serializes statusCode, message, and errors into JSON (regression: Error.message defaults to non-enumerable)', () => {
    const error = new CustomError(401, 'Unauthorized: bad token', ['detail-1']);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      statusCode: 401,
      message: 'Unauthorized: bad token',
      errors: ['detail-1'],
    });
  });

  it('serializes message even when no errors array is provided', () => {
    const error = new CustomError(429, 'Too many requests - please slow down.');

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      statusCode: 429,
      message: 'Too many requests - please slow down.',
    });
  });

  it('exposes message as an own enumerable property', () => {
    const error = new CustomError(500, 'boom');

    expect(Object.keys(error)).toContain('message');
  });
});
