import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOcrText } from '../src/ocr-preprocess.js';

test('normalizes noisy OCR text while preserving Vietnamese and numbers', () => {
  const raw = 'HỢP ĐỒNG    \nSỐ  123   / 2026\n    -  TÊN   CÔNG TY  ';
  const result = normalizeOcrText(raw);

  assert.match(result, /HỢP ĐỒNG/);
  assert.match(result, /SỐ/);
  assert.ok(result.includes('123 / 2026'));
  assert.ok(!result.includes('  '));
  assert.ok(result.includes('TÊN CÔNG TY'));
});

test('drops isolated OCR noise lines that inflate mismatch errors', () => {
  const raw = '###\nHỢP ĐỒNG\n!!!\nSỐ 123 / 2026\n&&\nBÊN A';
  const result = normalizeOcrText(raw);

  assert.match(result, /HỢP ĐỒNG/);
  assert.match(result, /SỐ 123 \/ 2026/);
  assert.match(result, /BÊN A/);
  assert.ok(!result.includes('###'));
  assert.ok(!result.includes('!!!'));
  assert.ok(!result.includes('&&'));
});

test('preserves Vietnamese precomposed and combining diacritics', () => {
  const text = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nViệt Nam';

  assert.equal(normalizeOcrText(text), text);
});
