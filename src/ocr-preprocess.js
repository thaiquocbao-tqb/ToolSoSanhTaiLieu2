function hasMeaningfulText(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;

  const lettersAndDigits = trimmed.match(/[\p{L}\p{M}\p{N}]/gu) ?? [];
  if (lettersAndDigits.length === 0) return false;

  const punctuationOnlyRatio = trimmed.replace(/[\p{L}\p{M}\p{N}\s]/gu, '').length / trimmed.length;
  if (punctuationOnlyRatio > 0.35 && lettersAndDigits.length < 4) return false;

  const pureNoise = /^[\s\W_]+$/u.test(trimmed);
  if (pureNoise) return false;

  return !/^[^\p{L}\p{M}\p{N}]+$/u.test(trimmed);
}

export function normalizeOcrText(rawText = '') {
  const lineBlocks = rawText
    .replace(/\r/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\uFFFD/g, ' ')
    .replace(/[ \t]+/gu, ' ')
    .split(/\n+/u)
    .map((line) => line.replace(/[ \t]+/gu, ' ').trim())
    .filter((line) => hasMeaningfulText(line))
    .map((line) => line
      .replace(/([A-Za-zÀ-ỹ0-9])\n(?=[A-Za-zÀ-ỹ0-9])/gu, '$1 ')
      .replace(/([0-9])\s*\/\s*([0-9])/gu, '$1 / $2')
      .replace(/([0-9])\s*-\s*([0-9])/gu, '$1 - $2'))
    .join('\n');

  return lineBlocks
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/[ \t]+(?=\n)/gu, '')
    .replace(/(?<=\n)[ \t]+/gu, '')
    .replace(/[ \t]+$/gu, '')
    .trim();
}

export function prepareCanvasForOcr(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return canvas;

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;

  let minGray = 255;
  let maxGray = 0;
  let sumGray = 0;
  let pixelCount = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const gray = 0.299 * red + 0.587 * green + 0.114 * blue;

    minGray = Math.min(minGray, gray);
    maxGray = Math.max(maxGray, gray);
    sumGray += gray;
    pixelCount += 1;
  }

  const averageBrightness = sumGray / pixelCount;
  const range = maxGray - minGray || 1;
  const threshold = averageBrightness > 180
    ? Math.max(160, Math.min(215, averageBrightness * 0.82))
    : Math.max(110, Math.min(170, averageBrightness * 1.1));

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
    const normalized = (gray - minGray) / range;
    const contrastAdjusted = Math.max(0, Math.min(255, (normalized - 0.5) * 2.25 * 255 + 128));
    const cleanGray = Math.max(0, Math.min(255, contrastAdjusted + (averageBrightness > 180 ? 8 : -8)));
    const binarized = cleanGray > threshold ? 255 : 0;

    data[index] = binarized;
    data[index + 1] = binarized;
    data[index + 2] = binarized;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}
