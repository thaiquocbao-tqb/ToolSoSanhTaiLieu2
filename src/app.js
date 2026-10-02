import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { buildDiff, renderParts, wordCount } from './diff.js';
import { extractPdfPageText } from './pdf-text.js';
import { normalizeOcrText } from './ocr-preprocess.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_IMAGE_SIDE = 4_000;

const elements = {
  imageInput: document.querySelector('#imageInput'),
  pdfInput: document.querySelector('#pdfInput'),
  imageDrop: document.querySelector('#imageDrop'),
  pdfDrop: document.querySelector('#pdfDrop'),
  imageInfo: document.querySelector('#imageInfo'),
  pdfInfo: document.querySelector('#pdfInfo'),
  compareButton: document.querySelector('#compareButton'),
  progressWrap: document.querySelector('#progressWrap'),
  progressText: document.querySelector('#progressText'),
  progressPercent: document.querySelector('#progressPercent'),
  progressBar: document.querySelector('#progressBar'),
  errorMessage: document.querySelector('#errorMessage'),
  results: document.querySelector('#results'),
  resultMeta: document.querySelector('#resultMeta'),
  imageText: document.querySelector('#imageText'),
  pdfText: document.querySelector('#pdfText'),
  imageWordCount: document.querySelector('#imageWordCount'),
  pdfWordCount: document.querySelector('#pdfWordCount'),
  removedStat: document.querySelector('#removedStat'),
  addedStat: document.querySelector('#addedStat'),
  matchBanner: document.querySelector('#matchBanner'),
  recompareButton: document.querySelector('#recompareButton')
};

const selectedFiles = { image: null, pdf: null };
let tesseractPromise;
let imagePreviewUrl = null;
let isProcessing = false;

function localAssetUrl(path) {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href;
}

function createTesseractWorker() {
  return createWorker('vie', 1, {
    workerPath: localAssetUrl('tesseract/worker.min.js'),
    corePath: localAssetUrl('tesseract/core'),
    langPath: localAssetUrl('tessdata'),
    gzip: true
  });
}

async function getTesseractWorker() {
  if (!tesseractPromise) tesseractPromise = createTesseractWorker();
  try {
    return await tesseractPromise;
  } catch (error) {
    tesseractPromise = null;
    throw error;
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setProgress(message, percent) {
  elements.progressWrap.hidden = false;
  elements.progressText.textContent = message;
  elements.progressPercent.textContent = `${Math.round(percent)}%`;
  elements.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.hidden = false;
}

function clearError() {
  elements.errorMessage.textContent = '';
  elements.errorMessage.hidden = true;
}

function updateActionState() {
  elements.compareButton.disabled = isProcessing || !selectedFiles.image || !selectedFiles.pdf;
}

function renderFileInfo(type, file) {
  const info = elements[`${type}Info`];
  const dropzone = elements[`${type}Drop`];
  info.replaceChildren();
  info.classList.add('visible');
  dropzone.classList.add('has-file');

  if (type === 'image') {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl = URL.createObjectURL(file);
    const preview = document.createElement('img');
    preview.className = 'file-preview';
    preview.alt = `Xem trước ${file.name}`;
    preview.src = imagePreviewUrl;
    info.append(preview);
    return;
  }

  const badge = document.createElement('span');
  badge.className = 'file-badge';
  badge.textContent = 'PDF';
  const details = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'file-label';
  name.textContent = file.name;
  const size = document.createElement('span');
  size.textContent = formatFileSize(file.size);
  details.append(name, document.createElement('br'), size);
  info.append(badge, details);
}

function setFile(type, file) {
  clearError();
  if (file.size > MAX_FILE_SIZE) {
    showError('Tệp vượt quá giới hạn 50 MB.');
    return;
  }

  const validImage = /^image\/(png|jpeg|webp|bmp)$/u.test(file.type);
  const validPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (type === 'image' && !validImage) {
    showError('Chọn ảnh PNG, JPG, WEBP hoặc BMP.');
    return;
  }
  if (type === 'pdf' && !validPdf) {
    showError('Tệp thứ hai phải là PDF.');
    return;
  }

  selectedFiles[type] = file;
  renderFileInfo(type, file);
  elements.results.hidden = true;
  elements.recompareButton.hidden = true;
  updateActionState();
}

function bindFileInput(type) {
  const input = elements[`${type}Input`];
  const dropzone = elements[`${type}Drop`];
  input.addEventListener('change', () => {
    if (input.files?.[0]) setFile(type, input.files[0]);
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    if (event.dataTransfer?.files?.[0]) setFile(type, event.dataTransfer.files[0]);
  });
}

async function createOcrCanvas(source) {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(
      2.4,
      MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height),
      Math.sqrt(MAX_IMAGE_PIXELS / (bitmap.width * bitmap.height))
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Không tạo được vùng xử lý ảnh.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function recognizeText(source, status, percent) {
  setProgress(status, percent);
  const worker = await getTesseractWorker();
  const canvas = await createOcrCanvas(source);
  const { data } = await worker.recognize(canvas);
  return normalizeOcrText(data.text);
}

async function extractPdf(file) {
  const task = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  const pdf = await task.promise;
  const pages = [];
  let scannedPages = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setProgress(`Đọc PDF · trang ${pageNumber}/${pdf.numPages}`, 55 + (pageNumber - 1) / pdf.numPages * 40);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = extractPdfPageText(content.items);

      if (pageText) {
        pages.push(pageText);
        page.cleanup();
        continue;
      }

      scannedPages += 1;
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error(`Không thể dựng trang PDF ${pageNumber}.`);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push(await recognizeText(canvas, `OCR trang scan ${pageNumber}/${pdf.numPages}`, 55 + pageNumber / pdf.numPages * 40));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return { text: pages.join('\n\n').trim(), pageCount: pdf.numPages, scannedPages };
}

function renderDiff(imageText, pdfText) {
  const diff = buildDiff(imageText, pdfText);
  elements.imageText.innerHTML = renderParts(diff.left);
  elements.pdfText.innerHTML = renderParts(diff.right);
  elements.imageWordCount.textContent = `${wordCount(imageText)} từ`;
  elements.pdfWordCount.textContent = `${wordCount(pdfText)} từ`;
  elements.removedStat.textContent = `− ${diff.removed} khác biệt`;
  elements.addedStat.textContent = `+ ${diff.added} khác biệt`;
  elements.matchBanner.hidden = diff.removed > 0 || diff.added > 0;
  return diff;
}

function renderResult(imageText, pdfResult) {
  renderDiff(imageText, pdfResult.text);
  elements.resultMeta.textContent = `${pdfResult.pageCount} trang PDF${pdfResult.scannedPages ? ` · OCR ${pdfResult.scannedPages} trang scan` : ' · trích text trực tiếp'} · Tesseract OCR tiếng Việt`;
  elements.results.hidden = false;
  elements.recompareButton.hidden = true;
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function compareDocuments() {
  if (isProcessing || !selectedFiles.image || !selectedFiles.pdf) return;
  isProcessing = true;
  clearError();
  elements.results.hidden = true;
  updateActionState();

  try {
    setProgress('Khởi tạo OCR tiếng Việt offline...', 3);
    const imageText = await recognizeText(selectedFiles.image, 'OCR toàn bộ ảnh hợp đồng...', 12);
    if (!imageText) throw new Error('Không nhận diện được chữ trong ảnh. Hãy thử ảnh rõ và thẳng hơn.');

    setProgress('Đọc nội dung PDF...', 53);
    const pdfResult = await extractPdf(selectedFiles.pdf);
    if (!pdfResult.text) throw new Error('Không tìm thấy chữ trong PDF.');

    setProgress('So sánh văn bản...', 98);
    renderResult(imageText, pdfResult);
    setProgress('Đã hoàn tất.', 100);
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Có lỗi khi xử lý tài liệu.');
  } finally {
    isProcessing = false;
    updateActionState();
  }
}

function updateEditedComparison() {
  const imageText = elements.imageText.innerText.trim();
  const pdfText = elements.pdfText.innerText.trim();
  renderDiff(imageText, pdfText);
  elements.recompareButton.hidden = true;
}

bindFileInput('image');
bindFileInput('pdf');
elements.compareButton.addEventListener('click', compareDocuments);
elements.recompareButton.addEventListener('click', updateEditedComparison);
for (const editor of [elements.imageText, elements.pdfText]) {
  editor.addEventListener('input', () => {
    elements.recompareButton.hidden = false;
  });
}
