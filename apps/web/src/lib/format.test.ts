import { describe, expect, it } from 'vitest';
import { num, ordinal, shortName, titleCase } from './format';

describe('format', () => {
  it('num trims trailing zeros and keeps at most 2 decimals', () => {
    expect(num(20)).toBe('20');
    expect(num(83.75)).toBe('83.75');
    expect(num(66.666)).toBe('66.67');
    expect(num(null)).toBe('');
  });

  it('shortName uses a middle initial', () => {
    expect(shortName({ lastName: 'Reyes', firstName: 'Ana', middleName: 'de la Cruz' })).toBe('Reyes, Ana D.');
    expect(shortName({ lastName: 'Reyes', firstName: 'Ana', middleName: null })).toBe('Reyes, Ana');
  });

  it('ordinal and titleCase', () => {
    expect([1, 2, 3, 4].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th']);
    expect(titleCase('TRANSFERRED_OUT')).toBe('Transferred Out');
  });
});
