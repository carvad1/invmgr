import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { emptyInstrument, type Instrument } from "../src/domain/types";
import { importStockResponses } from "../src/domain/stock-import";
import {
  emptyStockAnalysis,
  stockAnalysisSchema,
} from "../src/domain/stock-schema";
import {
  stockIssuerUnp,
  stockWebDue,
  webDividendYield,
  type StockDocument,
} from "../src/domain/stock-web";
import {
  BELARUSBANK_DIVIDENDS,
  parseBelarusbankDividends,
  parseEpfrDocuments,
  parseEpfrIdentity,
  parseDividendAnnouncements,
} from "../electron/stock-web-parsers";
import {
  downloadStockSource,
  safeStockSourceUrl,
  StockWebCollector,
  type WebGet,
} from "../electron/stock-web";
import { readOfficeDocument } from "../electron/stock-office";
const file = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const json = (name: string) => JSON.parse(file(name));
const stock = () =>
  importStockResponses(file("aigenis-equity-card.json"), []).instruments[0];
const body = (s: string) => ({
  bytes: new TextEncoder().encode(s),
  contentType: "application/json",
});
const empty = { content: [], totalPages: 0 };
const clock = () => new Date("2026-09-26T12:00:00Z");
const doc = (overrides: Partial<StockDocument> = {}): StockDocument => ({
  id: "137593",
  title: "Дивиденды",
  url: "https://epfr.gov.by/portal/file/137593/content",
  kind: "dividend",
  uploadedAt: "2026-04-02 13:26",
  reportingDate: "2026-04-02 00:00",
  pages: [],
  pageCount: 0,
  truncated: false,
  state: "unread",
  ...overrides,
});
const fetcher = (offline = false) =>
  vi.fn<WebGet>(async (url) => {
    if (offline) throw new Error("Нет сети");
    if (url === BELARUSBANK_DIVIDENDS)
      return body(file("belarusbank-dividends.html"));
    if (url.includes("?search=100325912"))
      return body(file("epfr-belarusbank-identity.json"));
    if (url.includes("/portal/file/"))
      return { ...body("%PDF-sample"), contentType: "application/pdf" };
    if (url.includes("/files?search="))
      return body(file("epfr-belarusbank-dividends.json"));
    if (url.includes("info-ao")) return body("<html></html>");
    return body(JSON.stringify(empty));
  });
const pdf = vi.fn(async () => ({
  pages: [
    {
      page: 1,
      text: "Официальное решение о выплате дивидендов по акциям банка за 2025 год.",
    },
  ],
  pageCount: 1,
  truncated: false,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("Официальные данные акций", () => {
  it("берёт только точное совпадение УНП и не выводит сотрудника из данных портала", () => {
    expect(
      parseEpfrIdentity(json("epfr-belarusbank-identity.json"), "100325912")
        ?.id,
    ).toBe(2668);
    expect(
      parseEpfrIdentity(json("epfr-belarusbank-identity.json"), "100220190"),
    ).toBeNull();
    const input = json("epfr-belarusbank-dividends.json");
    input.content[0].user = { password: "secret", email: "do-not-save" };
    input.content.push({
      ...input.content[0],
      id: 123,
      organization: { unp: "100220190" },
    });
    const docs = parseEpfrDocuments(input, "100325912");
    expect(docs).toHaveLength(4);
    expect(JSON.stringify(docs)).not.toMatch(/secret|do-not-save/);
    expect(docs[0].uploadedAt).toBe("2026-04-02 13:26");
    expect(docs[0].reportingDate).toBe("2026-04-02 00:00");
    const intermediary = {
      content: [
        {
          ...input.content[0],
          organization: { unp: "100302205" },
          holder: { unp: "100325912" },
        },
      ],
    };
    expect(parseEpfrDocuments(intermediary, "100325912")).toHaveLength(1);
    expect(parseEpfrDocuments(intermediary, "100302205")).toHaveLength(0);
  });
  it("различает три класса акций и старые рубли", () => {
    const pref = stock();
    const r = parseBelarusbankDividends(
      file("belarusbank-dividends.html"),
      pref,
      2026,
    );
    expect(r.dividends).toHaveLength(10);
    expect(r.dividends[0].amount).toBe(0.06);
    expect(r.dividends.every((d) => d.paymentYear >= 2017)).toBe(true);
    expect(r.shareInfo).toMatchObject({ shares: 1982372, asOf: "2024-02-19" });
    const i = {
      ...pref,
      stockAnalysis: {
        ...pref.stockAnalysis!,
        web: {
          checkedAt: clock().toISOString(),
          status: "ok" as const,
          identity: null,
          sources: [],
          documents: [],
          issues: [],
          ...r,
        },
      },
    };
    expect(webDividendYield(i, 2)).toBeCloseTo(0.03);
    expect(webDividendYield(i, null)).toBeNull();
    const ordinary = {
      ...emptyInstrument(),
      kind: "stock" as const,
      name: "Беларусбанк А16",
    };
    expect(
      parseBelarusbankDividends(
        file("belarusbank-dividends.html"),
        ordinary,
        2026,
      ).dividends[0].amount,
    ).toBe(0.009033);
    expect(
      parseBelarusbankDividends(
        file("belarusbank-dividends.html"),
        { ...ordinary, name: "Беларусбанк Ап18" },
        2026,
      ).dividends[0].amount,
    ).toBe(0.0117);
    expect(() =>
      parseBelarusbankDividends(
        file("belarusbank-dividends.html"),
        { ...ordinary, name: "Беларусбанк" },
        2026,
      ),
    ).toThrow(/выпуск/);
  });
  it("отклоняет неоднозначный выпуск и изменённые заголовки", () => {
    const i = stock();
    i.stockAnalysis!.market!.details.push({
      label: "ISIN",
      value: "BYC000000035",
    });
    expect(() =>
      parseBelarusbankDividends(file("belarusbank-dividends.html"), i, 2026),
    ).toThrow();
    expect(() =>
      parseBelarusbankDividends(
        file("belarusbank-dividends.html").replace(
          "Год выплаты",
          "Другая таблица",
        ),
        stock(),
        2026,
      ),
    ).toThrow();
  });
  it("не принимает чужие домены, локальные адреса и учётные данные в ссылке", () => {
    for (const url of [
      "https://epfr.gov.by/portal/organizations?search=100325912",
      BELARUSBANK_DIVIDENDS,
      "https://store.asb.by:9000/upload/report.pdf",
    ])
      expect(safeStockSourceUrl(url)).toBe(true);
    for (const url of [
      "http://epfr.gov.by/",
      "https://epfr.gov.by.attacker.test/",
      "https://127.0.0.1/",
      "https://user:password@epfr.gov.by/",
      "file:///C:/secret",
      "https://epfr.gov.by:8888/",
      "https://epfr.gov.by/portal/auth/signin",
      "https://store.asb.by:9000/admin",
    ])
      expect(safeStockSourceUrl(url)).toBe(false);
  });
  it("скачивает без cookies, без редиректов; ограничивает размер ответа", async () => {
    const f = vi.fn(
      async () =>
        new Response("ok", { headers: { "content-type": "text/plain" } }),
    );
    vi.stubGlobal("fetch", f);
    await downloadStockSource(BELARUSBANK_DIVIDENDS);
    expect(f).toHaveBeenCalledWith(
      BELARUSBANK_DIVIDENDS,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("x", { headers: { "content-length": "9000000" } }),
      ),
    );
    await expect(downloadStockSource(BELARUSBANK_DIVIDENDS)).rejects.toThrow(
      /8 МБ/,
    );
  });
  it("полный сбор, повторное использование запросов и сохранение при отсутствии сети", async () => {
    const get = fetcher(),
      c = new StockWebCollector(get, pdf, clock),
      i = stock();
    const web = await c.collect(i);
    expect(web.status).toBe("ok");
    expect(web.identity?.unp).toBe("100325912");
    expect(web.dividends[0].amount).toBe(0.06);
    expect(web.documents.filter((d) => d.state === "text")).toHaveLength(2);
    const initial = get.mock.calls.length;
    const next = await c.collect(i);
    expect(get.mock.calls).toHaveLength(initial);
    expect(next.dividends).toEqual(web.dividends);
    const offline = await new StockWebCollector(
      fetcher(true),
      pdf,
      clock,
    ).collect({ ...i, stockAnalysis: { ...i.stockAnalysis!, web } });
    expect(offline.status).toBe("error");
    expect(offline.dividends).toEqual(web.dividends);
    expect(offline.documents.filter((d) => d.state === "text")).toHaveLength(2);
    expect(
      stockAnalysisSchema.parse({ ...i.stockAnalysis, web: offline }).web
        ?.identity?.unp,
    ).toBe("100325912");
  });
  it("не тянет сеть для отсутствующего УНП и не переносит данные другого эмитента", async () => {
    const get = fetcher();
    const c = new StockWebCollector(get, pdf, clock);
    const web = await c.collect({
      ...emptyInstrument(),
      kind: "stock",
      name: "Учебная акция",
    });
    expect(web.status).toBe("unresolved");
    expect(get).not.toHaveBeenCalled();
    expect(
      stockIssuerUnp({ ...emptyInstrument(), name: "Приорбанк А12" }),
    ).toBe("100220190");
    const old = await c.collect(stock());
    const changed = await c.collect({
      ...stock(),
      stockAnalysis: {
        ...stock().stockAnalysis!,
        issuerUnp: "100999999",
        web: old,
      },
    });
    expect(changed.dividends).toHaveLength(0);
    expect(changed.identity).toBeNull();
  });
  it("распознаёт скан, неизвестный формат, внешнюю ссылку и сбой чтения", async () => {
    expect(
      (
        await new StockWebCollector(fetcher(), async () => ({
          pages: [{ page: 1, text: "" }],
          pageCount: 1,
          truncated: false,
        })).readDocument(doc())
      ).state,
    ).toBe("scan");
    expect(
      (
        await new StockWebCollector(
          async () => body("<html>Login</html>"),
          pdf,
        ).readDocument(doc())
      ).state,
    ).toBe("unsupported");
    const f = vi.fn(async () => ({
      ...body("https://127.0.0.1/private"),
      contentType: "text/plain",
    }));
    expect(
      (await new StockWebCollector(f, pdf).readDocument(doc())).state,
    ).toBe("unsupported");
    expect(f).toHaveBeenCalledTimes(1);
    expect(
      (
        await new StockWebCollector(fetcher(), async () => {
          throw new Error("PDF broken");
        }).readDocument(doc())
      ).state,
    ).toBe("error");
  });
  it("обновляет не чаще суток, ошибки повторяет через 30 минут", async () => {
    const i = stock();
    const web = await new StockWebCollector(fetcher(), pdf, clock).collect(i);
    i.stockAnalysis!.web = web;
    expect(stockWebDue(i, clock().getTime() + 3600000)).toBe(false);
    expect(stockWebDue(i, clock().getTime() + 86400000)).toBe(true);
    i.stockAnalysis!.web.status = "error";
    expect(stockWebDue(i, clock().getTime() + 1800000)).toBe(true);
  });
  it("читает DOCX и XLSX как текст, без запуска формул и вложений", () => {
    const word = zipSync({
      "word/document.xml": strToU8(
        '<w:document xmlns:w="word"><w:p><w:r><w:t>Чистая прибыль</w:t></w:r></w:p><w:p><w:r><w:t>15000 тыс. BYN</w:t></w:r></w:p></w:document>',
      ),
      "word/embeddings/evil.exe": strToU8("not executed"),
    });
    expect(readOfficeDocument(word)).toMatchObject({
      pageCount: 0,
      pages: [{ page: 1, text: "Чистая прибыль\n15000 тыс. BYN" }],
    });
    const excel = zipSync({
      "xl/sharedStrings.xml": strToU8("<sst><si><t>Капитал</t></si></sst>"),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><row><c t="s"><v>0</v></c><c><f>WEBSERVICE("http://bad/")</f><v>2500</v></c></row></worksheet>',
      ),
    });
    const text = readOfficeDocument(excel).pages[0].text;
    expect(text).toContain("Капитал\t2500");
    expect(text).not.toContain("WEBSERVICE");
  });
  it("решения о дивидендах не смешиваются с подтверждёнными годичными выплатами", () => {
    const i: Instrument = {
      ...emptyInstrument(),
      kind: "stock",
      name: "Приорбанк А12",
    };
    const docs = [
      doc({
        state: "text",
        pages: [
          {
            page: 1,
            text: "Дивиденды за 2025 год. Дивиденды, начисленные на одну акцию: по привилегированным акциям – 2,3 рублей по простым (обыкновенным) акциям - 1,535 рублей",
          },
        ],
      }),
    ];
    const result = parseDividendAnnouncements(docs, i);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ amount: 1.535, earningsYear: 2025 });
    expect(
      parseDividendAnnouncements(docs, { ...i, name: "Приорбанк Ап9" }),
    ).toHaveLength(0);
    const ambiguous = [
      doc({
        state: "text",
        pages: [
          {
            page: 1,
            text:
              docs[0].pages[0].text +
              " по простым (обыкновенным) акциям - 3,04 рублей",
          },
        ],
      }),
    ];
    expect(parseDividendAnnouncements(ambiguous, i)).toHaveLength(0);
  });
});
