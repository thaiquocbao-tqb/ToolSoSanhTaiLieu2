import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiff, renderParts, wordCount } from '../src/diff.js';

test('normalizes case and canonically equivalent Vietnamese text', () => {
  const source = 'Tiếng Việt';
  const diff = buildDiff(source, source.normalize('NFD'));

  assert.equal(diff.removed, 0);
  assert.equal(diff.added, 0);
});

test('detects punctuation-only differences', () => {
  const diff = buildDiff('Xin chào, bạn.', 'Xin chào bạn.');

  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 0);
  assert.match(renderParts(diff.left), /<mark class="removed">,<\/mark>/);
});

test('keeps visually similar OCR characters distinct', () => {
  const diff = buildDiff('s5', '5');

  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 1);
  assert.match(renderParts(diff.left), /<mark class="removed">s5<\/mark>/);
});

test('escapes OCR text before inserting markup', () => {
  const diff = buildDiff('<script>', '<style>');
  const rendered = renderParts(diff.left);

  assert.equal(rendered.includes('<script>'), false);
  assert.match(rendered, /&lt;|&gt;/);
});

test('counts Vietnamese words without counting punctuation', () => {
  assert.equal(wordCount('Xin chào, Việt Nam!'), 4);
});
