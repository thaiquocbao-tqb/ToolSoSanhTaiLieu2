const TOKEN_PATTERN = /\s+|[\p{L}\p{M}\p{N}_]+|[^\s]/gu;
const MAX_DIFF_CELLS = 1_800_000;

function tokenize(text) {
  return text.match(TOKEN_PATTERN) || [];
}

function normalizeToken(token) {
  if (/^\s+$/u.test(token)) return ' ';
  return token.normalize('NFC').toLocaleLowerCase('vi');
}

function countTokens(tokens) {
  return tokens.reduce((count, token) => count + (/^\s+$/u.test(token) ? 0 : 1), 0);
}

function appendPart(parts, type, text) {
  const previous = parts.at(-1);
  if (previous?.type === type) previous.text += text;
  else parts.push({ type, text });
}

function fallbackDiff(leftText, rightText) {
  const leftNormalized = normalizeToken(leftText.replace(/\s+/gu, ' '));
  const rightNormalized = normalizeToken(rightText.replace(/\s+/gu, ' '));
  if (leftNormalized === rightNormalized) {
    return {
      left: [{ type: 'same', text: leftText }],
      right: [{ type: 'same', text: rightText }],
      removed: 0,
      added: 0
    };
  }

  return {
    left: [{ type: 'removed', text: leftText }],
    right: [{ type: 'added', text: rightText }],
    removed: countTokens(tokenize(leftText)),
    added: countTokens(tokenize(rightText))
  };
}

export function buildDiff(leftText, rightText) {
  const left = tokenize(leftText);
  const right = tokenize(rightText);
  if (left.length * right.length > MAX_DIFF_CELLS) return fallbackDiff(leftText, rightText);

  const width = right.length + 1;
  const table = new Uint32Array((left.length + 1) * width);

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const index = leftIndex * width + rightIndex;
      table[index] = normalizeToken(left[leftIndex]) === normalizeToken(right[rightIndex])
        ? table[(leftIndex + 1) * width + rightIndex + 1] + 1
        : Math.max(
          table[(leftIndex + 1) * width + rightIndex],
          table[leftIndex * width + rightIndex + 1]
        );
    }
  }

  const leftParts = [];
  const rightParts = [];
  let removed = 0;
  let added = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (normalizeToken(left[leftIndex]) === normalizeToken(right[rightIndex])) {
      appendPart(leftParts, 'same', left[leftIndex]);
      appendPart(rightParts, 'same', right[rightIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      table[(leftIndex + 1) * width + rightIndex]
      >= table[leftIndex * width + rightIndex + 1]
    ) {
      appendPart(leftParts, 'removed', left[leftIndex]);
      removed += /^\s+$/u.test(left[leftIndex]) ? 0 : 1;
      leftIndex += 1;
    } else {
      appendPart(rightParts, 'added', right[rightIndex]);
      added += /^\s+$/u.test(right[rightIndex]) ? 0 : 1;
      rightIndex += 1;
    }
  }

  while (leftIndex < left.length) {
    appendPart(leftParts, 'removed', left[leftIndex]);
    removed += /^\s+$/u.test(left[leftIndex]) ? 0 : 1;
    leftIndex += 1;
  }
  while (rightIndex < right.length) {
    appendPart(rightParts, 'added', right[rightIndex]);
    added += /^\s+$/u.test(right[rightIndex]) ? 0 : 1;
    rightIndex += 1;
  }

  return { left: leftParts, right: rightParts, removed, added };
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function renderParts(parts) {
  return parts.map(({ type, text }) => type === 'same'
    ? escapeHtml(text)
    : `<mark class="${type}">${escapeHtml(text)}</mark>`).join('');
}

export function wordCount(text) {
  return (text.match(/[\p{L}\p{M}\p{N}_]+/gu) || []).length;
}
