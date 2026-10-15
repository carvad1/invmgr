import { parentPort, workerData } from "node:worker_threads";
import { readOfficeDocument } from "./stock-office";
import { join } from "node:path";
import type { Worker as OcrWorker } from "tesseract.js";
// A separate process thread bounds CPU/memory work on untrusted financial PDFs.
async function run() {
  const data = new Uint8Array(workerData);
  if (data[0] === 0x50 && data[1] === 0x4b) {
    parentPort!.postMessage(readOfficeDocument(data));
    return;
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let ocrWorker: OcrWorker | undefined;
  let output: unknown;
  try {
    const doc = await task.promise;
    const pages: { page: number; text: string; ocrConfidence?: number }[] = [];
    let total = 0,
      truncated = doc.numPages > 12,
      ocr = false,
      scannedPages = 0;
    for (let n = 1; n <= Math.min(doc.numPages, 12); n++) {
      const page = await doc.getPage(n),
        content = await page.getTextContent();
      let full = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .trim();
      let ocrConfidence: number | undefined;
      if (full.replace(/\s/g, "").length < 40) {
        if (scannedPages < 3) {
          scannedPages++;
          if (!ocrWorker) {
            const { createWorker, PSM } = await import("tesseract.js");
            ocrWorker = await createWorker("rus+eng", 1, {
              langPath: join(__dirname, "ocr"),
              gzip: true,
              cacheMethod: "none",
            });
            await ocrWorker.setParameters({
              tessedit_pageseg_mode: PSM.AUTO,
              preserve_interword_spaces: "1",
            });
          }
          const original = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(
              3,
              2400 / Math.max(original.width, original.height),
            ),
          });
          const factory = doc.canvasFactory as {
            create: (w: number, h: number) => any;
            destroy: (canvas: any) => void;
          };
          const canvas = factory.create(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
          try {
            await page.render({
              canvas: canvas.canvas,
              canvasContext: canvas.context,
              viewport,
            }).promise;
            const { data: result } = await ocrWorker.recognize(
              canvas.canvas.toBuffer("image/png"),
            );
            full = result.text.trim();
            if (full.replace(/\s/g, "").length > 40) {
              ocrConfidence = Math.max(0, Math.min(100, result.confidence));
              ocr = true;
            }
          } finally {
            factory.destroy(canvas);
          }
        } else truncated = true;
      }
      const text = full.slice(0, 12000);
      truncated ||= full.length > 12000;
      total += text.length;
      pages.push({
        page: n,
        text,
        ...(ocrConfidence === undefined ? {} : { ocrConfidence }),
      });
      page.cleanup();
      if (total > 65000) {
        truncated = true;
        break;
      }
    }
    output = { pages, pageCount: doc.numPages, truncated, ocr };
  } finally {
    await ocrWorker?.terminate();
    await task.destroy();
  }
  parentPort!.postMessage(output);
}
run().catch(() =>
  parentPort!.postMessage({ error: "Не удалось извлечь текст PDF" }),
);
