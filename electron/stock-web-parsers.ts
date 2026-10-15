import { load } from "cheerio";
import type { Instrument } from "../src/domain/types";
import type { StockDocument, StockWeb } from "../src/domain/stock-web";

export const BELARUSBANK_DIVIDENDS =
  "https://belarusbank.by/o-banke/investoram-actioneram/vypuski-aktsiy-i-dividendy/";
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const number = (s: string) => {
  const v = s.replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v))
    ? Number(v)
    : null;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown, max = 1500) =>
  typeof v === "string" ? clean(v).slice(0, max) : "";
export function classifyDocument(title: string): StockDocument["kind"] {
  if (/дивиденд/i.test(title)) return "dividend";
  if (/отч[её]т|баланс|аудитор|деятельности|финансов|МСФО/i.test(title))
    return "report";
  if (
    /собрани|акционер|реестр|реорганизац|существен|сделк|банкрот/i.test(title)
  )
    return "event";
  return "other";
}
export function parseEpfrDocuments(data: unknown, unp: string, msfo = false) {
  const root = obj(data);
  if (!Array.isArray(root.content))
    throw new Error("Изменился формат списка документов ЕПФР");
  return root.content.flatMap((value) => {
    const r = obj(value),
      organization = obj(r.organization),
      holder = obj(r.holder);
    // Depositaries may publish on an issuer's behalf. holder is the subject; organization is the publisher.
    const subjectUnp = holder.unp ?? organization.unp;
    if (
      String(subjectUnp) !== unp ||
      !Number.isSafeInteger(r.id) ||
      Number(r.id) <= 0
    )
      return [];
    const title = str(r.name);
    if (!title) return [];
    const doc: StockDocument = {
      id: `${msfo ? "msfo-" : ""}${r.id}`,
      title,
      url: `https://epfr.gov.by/portal/${msfo ? "msfo-file" : "file"}/${r.id}/content`,
      uploadedAt: str(r.uploadDate, 30),
      reportingDate: str(r.realUploadDate, 30),
      kind: classifyDocument(title),
      state: "unread",
      pages: [],
      pageCount: 0,
      truncated: false,
    };
    return [doc];
  });
}
export function parseEpfrIdentity(
  data: unknown,
  unp: string,
): StockWeb["identity"] {
  const rows = obj(data).content;
  if (!Array.isArray(rows)) throw new Error("Изменился формат поиска ЕПФР");
  const exact = rows
    .map(obj)
    .filter(
      (r) =>
        String(r.unp) === unp && Number.isSafeInteger(r.id) && Number(r.id) > 0,
    );
  if (exact.length !== 1) return null;
  return { unp, id: Number(exact[0].id), name: str(exact[0].title, 1000) };
}

export function belarusbankClass(i: Instrument) {
  const identities = [
    i.ticker,
    ...(i.stockAnalysis?.market?.details ?? [])
      .filter((d) => ["ISIN", "Госрегистрация"].includes(d.label))
      .map((d) => d.value),
  ];
  const classes = [
    {
      label: "Обыкновенные · выпуск 16",
      isin: "BYC000000035",
      reg: "5-200-01-15420",
      column: 2,
      sharesColumn: 1,
      name: /^Беларусбанк\s+А16$/i,
    },
    {
      label: "Привилегированные 1 типа · выпуск 17",
      isin: "BYC000000043",
      reg: "5-200-11-15430",
      column: 3,
      sharesColumn: 3,
      name: /^Беларусбанк\s+Ап17$/i,
    },
    {
      label: "Привилегированные 2 типа · выпуск 18",
      isin: "BYC000000175",
      reg: "5-200-11-15950",
      column: 4,
      sharesColumn: 4,
      name: /^Беларусбанк\s+Ап18$/i,
    },
  ];
  const matches = classes.filter((c) =>
    identities.some((id) => id === c.isin || id === c.reg),
  );
  if (matches.length > 1) return null;
  if (matches.length === 1) return matches[0];
  // Name fallback only for a known exact issue, never for a generic bank name.
  return classes.find((c) => c.name.test(i.name)) ?? null;
}
export function parseBelarusbankDividends(
  html: string,
  i: Instrument,
  year = new Date().getFullYear(),
) {
  const c = belarusbankClass(i);
  if (!c)
    throw new Error(
      "Не определён выпуск Беларусбанка: нужны ISIN или номер госрегистрации. Выплаты разных типов акций не смешаны.",
    );
  const $ = load(html);
  const table = $("table").filter(
    (_, t) =>
      /Год выплаты/.test($(t).text()) && /По итогам года/.test($(t).text()),
  );
  if (table.length !== 1) throw new Error("Таблица дивидендов не распознана");
  const header = table
    .find("tr")
    .first()
    .find("th,td")
    .map((_, c) => clean($(c).text()))
    .get();
  const types = table
    .find("tr")
    .filter((_, r) => /1-го типа/.test($(r).text()))
    .find("th,td")
    .map((_, c) => clean($(c).text()))
    .get();
  if (
    header[0] !== "Год выплаты" ||
    header[1] !== "По итогам года" ||
    !/^Простые/.test(header[2] ?? "") ||
    types.indexOf("2-го типа") !== types.indexOf("1-го типа") + 1
  )
    throw new Error("Изменился порядок колонок дивидендов");
  const dividends: StockWeb["dividends"] = [];
  table.find("tr").each((_, r) => {
    const cells = $(r)
      .find("th,td")
      .map((_, c) => clean($(c).text()))
      .get();
    if (
      cells.length !== 5 ||
      !/^20\d{2}$/.test(cells[0]) ||
      !/^20\d{2}$/.test(cells[1])
    )
      return;
    const paymentYear = Number(cells[0]),
      earningsYear = Number(cells[1]),
      amount = number(cells[c.column]);
    // Before 2017 payments are in old BYR; the source does not provide normalized BYN values.
    if (
      paymentYear < 2017 ||
      paymentYear > year ||
      earningsYear !== paymentYear - 1 ||
      amount === null ||
      amount > 1e6
    )
      return;
    dividends.push({
      paymentYear,
      earningsYear,
      amount,
      currency: "BYN",
      shareClass: c.label,
      source: BELARUSBANK_DIVIDENDS,
    });
  });
  if (
    !dividends.length ||
    new Set(dividends.map((d) => d.earningsYear)).size !== dividends.length
  )
    throw new Error("Не удалось однозначно прочитать выплаты");
  let shareInfo: StockWeb["shareInfo"] = null;
  const shareTable = $("table").filter((_, t) => $(t).text().includes(c.reg));
  if (shareTable.length === 1) {
    const issueRow = shareTable
      .find("tr")
      .filter((_, r) => $(r).text().includes(c.reg));
    const issueCells = issueRow
      .find("th,td")
      .map((_, cell) => clean($(cell).text()))
      .get();
    const expectedIndex = c.sharesColumn === 1 ? 0 : c.sharesColumn - 2;
    if (issueCells[expectedIndex]?.includes(c.reg))
      shareTable.find("tr").each((_, r) => {
        const cells = $(r)
          .find("th,td")
          .map((_, c) => clean($(c).text()))
          .get();
        if (cells.length !== 5 || !/^\d{2}\.\d{2}\.\d{4}$/.test(cells[0]))
          return;
        const shares = number(cells[c.sharesColumn]);
        const asOf = cells[0].split(".").reverse().join("-");
        if (
          shares &&
          Number.isSafeInteger(shares) &&
          asOf <= new Date().toISOString().slice(0, 10) &&
          (!shareInfo || asOf > shareInfo.asOf)
        )
          shareInfo = {
            shareClass: c.label,
            shares,
            asOf,
            source: BELARUSBANK_DIVIDENDS,
          };
      });
  }
  return {
    dividends: dividends
      .sort((a, b) => b.earningsYear - a.earningsYear)
      .slice(0, 50),
    shareInfo,
  };
}

export function parseOfficialLinks(html: string, page: string) {
  const $ = load(html);
  $("script,style,header,footer,nav").remove();
  const links = $("a[href]")
    .map((_, a) => {
      let url = "";
      try {
        url = new URL($(a).attr("href")!, page).href;
      } catch {
        return null;
      }
      const title = clean($(a).text()).slice(0, 1500);
      return title && /\.(pdf|xlsx?|docx?)(?:$|\?)/i.test(url)
        ? { url, title }
        : null;
    })
    .get()
    .filter(Boolean);
  return links.slice(0, 20);
}

/** A published decision is not a confirmed payment, nor automatically a full annual dividend. */
export function parseDividendAnnouncements(
  documents: StockDocument[],
  i: Instrument,
) {
  if (i.currency !== "BYN") return [];
  const cfi =
    i.stockAnalysis?.market?.details.find((d) => d.label === "CFI")?.value ??
    "";
  const registration =
    i.stockAnalysis?.market?.details.find((d) => d.label === "Госрегистрация")
      ?.value ?? "";
  const ordinary =
    /^ES/.test(cfi) ||
    (!!i.stockAnalysis?.market && /\sА\s*\d+$/i.test(i.name)) ||
    /^Приорбанк\s+А\s*12$/i.test(i.name) ||
    registration === "5-200-01-15610";
  if (!ordinary || /^EP/.test(cfi)) return [];
  const announcements: NonNullable<StockWeb["announcements"]> = [];
  for (const doc of documents.filter(
    (d) => d.kind === "dividend" && d.state === "text" && !d.ocr,
  )) {
    const text = doc.pages
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " ");
    if (
      /российск|\b(?:RUB|USD|EUR|BYR)\b/i.test(text) ||
      doc.uploadedAt.slice(0, 4) < "2017"
    )
      continue;
    // Only an explicit amount per ordinary share in BYN. Percentages and total payout sums do not match.
    if (
      !/на одну (?:простую\s*\(обыкновенную\)\s+)?акцию/i.test(text) ||
      !/белорусск|рубл/i.test(text)
    )
      continue;
    const matches = [
      ...text.matchAll(
        /(?:по простым\s*\(обыкновенным\)\s+акциям\s*[-–—:]\s*|на одну простую\s*\(обыкновенную\)\s+акцию\s+в сумме\s+)(\d+(?:[.,]\d+)?)\s+(?:белорусских\s+)?рубл\w*/gi,
      ),
    ];
    if (matches.length !== 1) continue;
    const amount = Number(matches[0][1].replace(",", "."));
    if (!Number.isFinite(amount) || amount > 1e6) continue;
    const years = [
      ...new Set(
        [...text.matchAll(/дивиденд(?:ы|ов)\s+за\s+(20\d{2})\s+год/gi)].map(
          (m) => Number(m[1]),
        ),
      ),
    ];
    const earningsYear = years.length === 1 ? years[0] : null;
    announcements.push({
      amount,
      currency: "BYN",
      shareClass: "Обыкновенные акции",
      earningsYear,
      source: doc.url,
      quote: matches[0][0],
      publishedAt: doc.uploadedAt,
    });
  }
  return announcements.slice(0, 20);
}
