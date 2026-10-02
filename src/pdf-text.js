export function extractPdfPageText(items) {
  const textItems = items.filter((item) => item.str?.length);
  if (textItems.length === 0) return '';

  let text = '';
  let previousItem = null;

  for (const item of textItems) {
    if (previousItem) {
      const previousY = previousItem.transform?.[5];
      const currentY = item.transform?.[5];
      const previousHeight = previousItem.height || 0;
      const currentHeight = item.height || 0;
      const rowTolerance = Math.max(2, Math.min(previousHeight, currentHeight) * 0.45);
      const startsNewLine = Number.isFinite(previousY)
        && Number.isFinite(currentY)
        && Math.abs(currentY - previousY) > rowTolerance;
      text += startsNewLine ? '\n' : ' ';
    }

    text += item.str;
    if (item.hasEOL) text += '\n';
    previousItem = item;
  }

  return text
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}