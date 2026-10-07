import { expect, it } from 'vitest';
import { copyNameAllocator } from './copyNames';

it('numbers original and copied sources together, preserving the original numeric name', () => {
  const next = copyNameAllocator([
    'Kynämuoto 122',
    'Kynämuoto 122 (kopio #1)',
    'Kynämuoto 122 (kopio #4)',
  ]);
  expect(next('Kynämuoto 122')).toBe('Kynämuoto 122 (kopio #5)');
  expect(next('Kynämuoto 122 (kopio #1)')).toBe('Kynämuoto 122 (kopio #6)');
  expect(next('Kynämuoto 122 (kopio #6)')).toBe('Kynämuoto 122 (kopio #7)');
  expect(next('Kynämuoto 123')).toBe('Kynämuoto 123 (kopio #1)');
});

it('cleans legacy suffix chains on new copies and reserves each name within a batch', () => {
  const names = ['Ovi', 'Ovi kopio', 'Ovi kopio kopio', 'Ovi kopio kopio kopio'];
  const next = copyNameAllocator(names);
  expect(next(names[3])).toBe('Ovi (kopio #4)');
  expect(next(names[1])).toBe('Ovi (kopio #5)');
  expect(next('Ovi (kopio #5) kopio')).toBe('Ovi (kopio #6)');
  expect(names[3]).toBe('Ovi kopio kopio kopio');
});

it('keeps long copy names valid across double-digit numbering and reloaded projects', () => {
  const name = 'a'.repeat(120);
  const next = copyNameAllocator([name]);
  const copies = Array.from({ length: 12 }, () => next(name));
  expect(copies.every((n) => n.length <= 120)).toBe(true);
  expect(new Set(copies).size).toBe(12);
  expect(copyNameAllocator([name, ...copies])(copies[0])).toBe(`${'a'.repeat(100)} (kopio #13)`);
});
