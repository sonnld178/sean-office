# SeanOffice

Office tools by **Son Nguyen** — clean spreadsheets, batch Word docs, and edit PDFs in the browser.

## Use online (no install)

**Open the app:** [https://sean-office.vercel.app](https://sean-office.vercel.app)

Copy that link into your browser — no download, no account. Works on desktop and phone.

**Author:** [Son Nguyen](https://seandev.info) · [@sonnld178](https://github.com/sonnld178)  
**License:** [AGPL-3.0](LICENSE) · [Source code](https://github.com/sonnld178/sean-office)

## Features

### Sheets (`/sheets`)
Upload CSV/XLSX → data preview → toolbar:
- **Map** — column mapping, transforms (trim, email, phone, date)
- **Review** — dedupe, validation
- **Export** — CSV, XLSX, mapping JSON

### Word (`/word`)
Upload `.docx` → content preview → toolbar:
- **Fill** — `{{placeholder}}` template + data sheet → batch ZIP
- **Clean** — remove comments, accept revisions, strip metadata
- **Extract** — tables to Excel

### PDF (`/pdf`)
Upload PDF → page preview → toolbar:
- **Watermark / Sign** — drag, rotate, resize, WYSIWYG Save
- **Merge · Split · Pages · Compress · Extract** — utility tools in the right panel

### HR CV (`/workflows/hr-cv`)
Keyword filtering, review table, export — includes demo CVs.

### General
- **Local mode** (default): all processing in-browser
- **Server mode**: sidebar toggle — upload API stub

## Run locally

Node.js 18+

```bash
git clone https://github.com/sonnld178/sean-office.git
cd sean-office
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

If the dev server breaks after a production build:

```bash
npm run dev:clean
```

## Stack

Next.js 15 · Tailwind v4 · shadcn/ui · pdf-lib · pdfjs · mammoth · xlsx
