import { describe, expect, it } from 'vitest';
import { inferTaskModelProfile } from './flow-step-model.js';

describe('inferTaskModelProfile', () => {
  it('returns null for blank step models', () => {
    expect(inferTaskModelProfile('')).toBeNull();
    expect(inferTaskModelProfile('   ')).toBeNull();
    expect(inferTaskModelProfile(null)).toBeNull();
  });
});
