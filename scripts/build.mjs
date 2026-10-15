import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("dist-electron/ocr", { recursive: true });
for (const code of ["rus", "eng"])
  copyFileSync(
    `node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`,
    `dist-electron/ocr/${code}.traineddata.gz`,
  );
await build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/main.cjs",
  external: ["electron", "pdfjs-dist/*"],
  target: "node24",
});
await build({
  entryPoints: ["electron/stock-pdf.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/stock-pdf.cjs",
  external: ["pdfjs-dist/*", "tesseract.js", "@tesseract.js-data/*"],
  target: "node24",
});
await build({
  entryPoints: ["electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
  external: ["electron"],
  target: "node24",
});
