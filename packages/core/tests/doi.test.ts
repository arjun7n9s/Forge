import { describe, expect, it } from 'vitest';
import { DOI_REGEX, normalizeDoi } from '../src/doi.js';

describe('DOI normalization', () => {
  it.each([
    ['10.1038/NATURE14539', '10.1038/nature14539'],
    ['doi: 10.1016/J.IJANTIMICAG.2020.105949', '10.1016/j.ijantimicag.2020.105949'],
    ['https://doi.org/10.1038/NATURE04533', '10.1038/nature04533'],

  ])('canonicalizes %s', (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });

  it.each(['10.123/short', 'prefix 10.1234/abc', '10.1234/', 'https://doi.org/nope', 'http://dx.doi.org/10.1000/ABC', '10.1234/abc whitespace'])('rejects invalid or partial DOI %s', (input) => {
    expect(normalizeDoi(input)).toBeNull();
    expect(DOI_REGEX.test(input)).toBe(false);
  });

  it('matches only a complete bare canonical DOI', () => {
    expect(DOI_REGEX.test('10.1234/ABC-._;()/:XYZ')).toBe(true);
  });
});
