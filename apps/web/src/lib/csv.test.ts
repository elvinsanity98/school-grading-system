import { describe, expect, it } from 'vitest';
import { learnersFromCsv, parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('reads plain rows and skips blank lines', () => {
    expect(parseCsv('a,b,c\r\n1,2,3\r\n\r\n4,5,6\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quotes, commas and line breaks inside quotes', () => {
    expect(parseCsv('name,address\n"Dela Cruz, Juan","Brgy. ""Uno""\nTown"')).toEqual([
      ['name', 'address'],
      ['Dela Cruz, Juan', 'Brgy. "Uno"\nTown'],
    ]);
  });

  it('detects semicolon and tab separated exports (Excel in some locales)', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseCsv('a\tb\tc\n1\t2\t3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('drops the byte order mark Excel adds', () => {
    expect(parseCsv('﻿LRN,Name\n1,A')[0]).toEqual(['LRN', 'Name']);
  });
});

describe('toCsv', () => {
  it('quotes only when needed and round-trips', () => {
    const rows = [['LRN', 'Name'], ['1', 'Dela Cruz, Juan'], ['2', 'He said "hi"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
    expect(toCsv([['a', 'b']])).toBe('a,b');
  });
});

describe('toCsv formula safety', () => {
  it('defuses cells that Excel would run as formulas, but leaves numbers alone', () => {
    expect(toCsv([['=HYPERLINK("http://evil")', '+1', '-2', '@x', 12, -3]])).toBe(`"'=HYPERLINK(""http://evil"")",'+1,'-2,'@x,12,-3`);
  });
});

describe('learnersFromCsv', () => {
  it('maps common column names', () => {
    const { rows, missing } = learnersFromCsv(
      parseCsv('LRN,Last Name,First Name,Middle Name,Sex,Birthdate,Guardian,Contact No\n123456789012,Reyes,Ana,Lopez,F,2009-04-15,Maria Reyes,0917'),
    );
    expect(missing).toEqual([]);
    expect(rows[0]).toMatchObject({ lrn: '123456789012', lastName: 'Reyes', firstName: 'Ana', middleName: 'Lopez', sex: 'F', birthDate: '2009-04-15', guardianName: 'Maria Reyes', guardianContact: '0917' });
  });

  it('accepts other headings people use', () => {
    const { rows, missing } = learnersFromCsv(parseCsv('Learner Reference Number,Surname,Given Name,Gender,Date of Birth\n1,X,Y,Male,2009-01-01'));
    expect(missing).toEqual([]);
    expect(rows[0]).toMatchObject({ lrn: '1', lastName: 'X', firstName: 'Y', sex: 'Male', birthDate: '2009-01-01' });
  });

  it('reports which required columns are missing', () => {
    expect(learnersFromCsv(parseCsv('LRN,Last Name\n1,X')).missing).toEqual(['firstName', 'sex', 'birthDate']);
    expect(learnersFromCsv([]).missing).toHaveLength(5);
  });
});
