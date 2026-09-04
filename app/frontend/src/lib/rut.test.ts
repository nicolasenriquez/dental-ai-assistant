import { describe, expect, it } from 'vitest';
import { formatRutInput, formatRutInputWithSelection } from './rut';

describe('formatRutInput', () => {
  it('formats complete raw RUT', () => {
    expect(formatRutInput('123456785')).toBe('12.345.678-5');
  });

  it('formats lowercase K', () => {
    expect(formatRutInput('7618285k')).toBe('7.618.285-K');
  });

  it('keeps partial input readable', () => {
    expect(formatRutInput('1234')).toBe('1.234');
    expect(formatRutInput('12345678')).toBe('12.345.678');
  });

  it('preserves invalid DV instead of changing it', () => {
    expect(formatRutInput('19123456K')).toBe('19.123.456-K');
  });

  it('reformats pasted formatted input', () => {
    expect(formatRutInput('12.345.678-5')).toBe('12.345.678-5');
  });

  it('supports an explicitly typed separator', () => {
    expect(formatRutInput('12345678-5')).toBe('12.345.678-5');
  });

  it('separates numeric DV on blur for seven-digit body', () => {
    expect(formatRutInput('12345675', true)).toBe('1.234.567-5');
  });

  it('keeps a selection in the middle of a formatted RUT', () => {
    expect(formatRutInputWithSelection('12.123.456-K', 3, 6)).toEqual({
      value: '12.123.456-K',
      selectionStart: 3,
      selectionEnd: 6,
    });
  });

  it('keeps the caret after replacing selected digits', () => {
    const afterDelete = formatRutInputWithSelection('12..456-K', 3, 3);
    expect(afterDelete).toEqual({
      value: '12.456-K',
      selectionStart: 2,
      selectionEnd: 2,
    });

    expect(formatRutInputWithSelection('12789.456-K', 5, 5)).toEqual({
      value: '12.789.456-K',
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  it('translates the caret when point grouping changes', () => {
    expect(formatRutInputWithSelection('1234', 4, 4)).toEqual({
      value: '1.234',
      selectionStart: 5,
      selectionEnd: 5,
    });
  });

  it('clamps selection indexes to the available value lengths', () => {
    expect(formatRutInputWithSelection('1234', -2, 99)).toEqual({
      value: '1.234',
      selectionStart: 0,
      selectionEnd: 5,
    });
  });

  it('preserves caret positions at the start, end, and around the hyphen', () => {
    expect(formatRutInputWithSelection('92.345.678-5', 1, 1).selectionStart).toBe(1);
    expect(formatRutInputWithSelection('12.345.678-K', 12, 12).selectionStart).toBe(
      12,
    );
    expect(formatRutInputWithSelection('12.345.678-7', 10, 10).selectionStart).toBe(
      10,
    );
    expect(formatRutInputWithSelection('12.345.678-7', 11, 11).selectionStart).toBe(
      11,
    );
  });

  it('preserves formatted pastes and lowercase K at the end', () => {
    expect(formatRutInputWithSelection('12.345.678-5', 12, 12)).toEqual({
      value: '12.345.678-5',
      selectionStart: 12,
      selectionEnd: 12,
    });
    expect(formatRutInputWithSelection('7618285k', 8, 8)).toEqual({
      value: '7.618.285-K',
      selectionStart: 11,
      selectionEnd: 11,
    });
  });
});
