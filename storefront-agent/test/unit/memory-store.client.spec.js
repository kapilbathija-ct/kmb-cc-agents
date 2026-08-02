import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  memoryGet,
  memorySet,
  memoryIncr,
  sweepExpiredEntries,
  _sizeForTest,
} from '../../src/clients/memory-store.client.js';

describe('memory-store.client', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('memoryGet lazily evicts an expired entry on access', () => {
    memorySet('lazy-key', 'v', 1);
    jest.advanceTimersByTime(1001);

    expect(memoryGet('lazy-key')).toBeUndefined();
  });

  it('sweepExpiredEntries removes an expired entry even if it is never accessed again (regression: no proactive eviction)', () => {
    const sizeBefore = _sizeForTest();
    memorySet('abandoned-key', 'v', 1);
    expect(_sizeForTest()).toBe(sizeBefore + 1);

    jest.advanceTimersByTime(1001);
    sweepExpiredEntries();

    expect(_sizeForTest()).toBe(sizeBefore);
  });

  it('sweepExpiredEntries does not remove a still-valid entry', () => {
    memorySet('valid-key', 'v', 100);
    sweepExpiredEntries();

    expect(memoryGet('valid-key')).toBe('v');
  });

  it('memoryIncr still counts correctly for a key sweeping has already reclaimed', () => {
    memoryIncr('counter-key', 1);
    jest.advanceTimersByTime(1001);
    sweepExpiredEntries();

    expect(memoryIncr('counter-key', 1)).toBe(1);
  });
});
