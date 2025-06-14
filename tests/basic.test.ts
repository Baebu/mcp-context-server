import { describe, test, expect } from '@jest/globals';

describe('Basic Tests', () => {
  test('should pass basic test', () => {
    expect(true).toBe(true);
  });

  test('should validate environment', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });

  test('should have node version >= 18', () => {
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0]);
    expect(major).toBeGreaterThanOrEqual(18);
  });
});
