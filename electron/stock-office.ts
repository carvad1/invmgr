import { unzipSync, strFromU8 } from "fflate";
import { load } from "cheerio";
import type { StockDocument } from "../src/domain/stock-web";

/** Read text only: no macros, embedded objects, external relationships or formulas execute. */
export function readOfficeDocument(
  bytes: Uint8Array,
): Pick<StockDocument, "pages" | "pageCount" | "truncated"> {
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      const wanted =
        /^(?:word\/document\.xml|xl\/sharedStrings\.xml|xl\/worksheets\/sheet[1-4]\.xml)$/.test(
          file.name,
        );
      if (!wanted) return false;
      expanded += file.originalSize;
      if (file.originalSize > 3_000_000 || expanded > 8_000_000)
        throw new Error("Слишком большой XML внутри документа");
      return true;
    },
  });
  let text = "";
  if (files["word/document.xml"]) {
    const $ = load(strFromU8(files["word/document.xml"]), { xmlMode: true });
    text = $("w\\:p")
      .map((_, p) =>
        $(p)
          .find("w\\:t")
          .map((_, t) => $(t).text())
          .get()
          .join(""),
      )
      .get()
      .join("\n");
  } else {
    const strings = files["xl/sharedStrings.xml"]
      ? (() => {
          const $ = load(strFromU8(files["xl/sharedStrings.xml"]), {
            xmlMode: true,
          });
          return $("si")
            .map((_, s) =>
              $(s)
                .find("t")
                .map((_, t) => $(t).text())
                .get()
                .join(""),
            )
            .get();
        })()
      : [];
    for (const [name, data] of Object.entries(files))
      if (name.startsWith("xl/worksheets/")) {
        const $ = load(strFromU8(data), { xmlMode: true });
        text +=
          `${name}\n` +
          $("row")
            .map((_, r) =>
              $(r)
                .find("c")
                .map((_, c) => {
                  const type = $(c).attr("t"),
                    value = $(c).find("v").text();
                  return type === "s"
                    ? (strings[Number(value)] ?? "")
                    : type === "inlineStr"
                      ? $(c).find("t").text()
                      : value;
                })
                .get()
                .join("\t"),
            )
            .get()
            .join("\n") +
          "\n";
      }
  }
  if (!text.trim()) throw new Error("Не найден текст DOCX/XLSX");
  // Office text has no reliable page boundaries. pageCount=0 is deliberately not a page estimate.
  const chunks = text.slice(0, 60000).match(/[\s\S]{1,12000}/g) ?? [];
  return {
    pages: chunks.map((text, n) => ({ page: n + 1, text })),
    pageCount: 0,
    truncated: text.length > 60000,
  };
}
