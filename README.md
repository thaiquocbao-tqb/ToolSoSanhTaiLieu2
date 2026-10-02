# Offline Contract Checker

The app processes files in the browser on this computer. It uses Tesseract OCR with Vietnamese language data for images and scanned PDF pages, and extracts selectable PDF text directly.

## First-time setup

This setup needs internet access once to install npm packages and download the Tesseract worker, WASM files, and Vietnamese language data:

```powershell
npm install
npm run prepare:offline
```

## Run offline

After setup, disconnect from the internet if desired, then run:

```powershell
npm run offline
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`. Do not open `index.html` directly as a `file://` URL; browser workers require a local HTTP server.

Images and PDFs are processed locally. The app does not upload document contents. OCR may still misread unclear print, so the extracted text can be edited before updating the comparison.
