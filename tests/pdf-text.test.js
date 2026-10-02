import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPdfPageText } from '../src/pdf-text.js';

test('keeps short selectable PDF text instead of treating the page as a scan', () => {
  assert.equal(extractPdfPageText([{ str: 's5.' }]), 's5.');
});

test('preserves line breaks from PDF text items', () => {
  const items = [
    { str: 'Điều 1', transform: [1, 0, 0, 1, 10, 100], height: 10 },
    { str: 'Bên A', transform: [1, 0, 0, 1, 10, 80], height: 10 }
  ];

  assert.equal(extractPdfPageText(items), 'Điều 1\nBên A');
});
