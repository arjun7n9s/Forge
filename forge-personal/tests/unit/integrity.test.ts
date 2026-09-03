import { describe, expect, it } from 'vitest';
import { integrityPresentation, shouldWarnOnSave } from '@/lib/domain/integrity';

describe('integrity visual contract', () => {
  it.each([
    ['retracted', 'danger', 'line-through', true],
    ['eoc', 'caution', 'dotted', false],
    ['ok', 'safe', 'none', false],
    ['unknown', 'neutral', 'none', false],
  ] as const)('maps %s to locked treatment', (status, tone, decoration, warns) => {
    expect(integrityPresentation(status)).toMatchObject({ tone, decoration });
    expect(shouldWarnOnSave(status)).toBe(warns);
  });
});
