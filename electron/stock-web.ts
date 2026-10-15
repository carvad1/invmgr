import { Worker } from "node:worker_threads";
import { join } from "node:path";
import type { Instrument } from "../src/domain/types";
import {
  stockIssuerUnp,
  stockWebSchema,
  type StockDocument,
  type StockWeb,
} from "../src/domain/stock-web";
import {
  BELARUSBANK_DIVIDENDS,
  parseBelarusbankDividends,
  parseDividendAnnouncements,
  parseEpfrDocuments,
  parseEpfrIdentity,
  parseOfficialLinks,
  belarusbankClass,
} from "./stock-web-parsers";

const EPFR = "https://epfr.gov.by";
const MAX_BYTES = 8_000_000;
export function safeStockSourceUrl(value: string) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      value.length > 2000
    )
      return false;
    if (u.hostname === "store.asb.by")
      return (
        (!u.port || u.port === "9000") && u.pathname.startsWith("/upload/")
      );
    if (u.port) return false;
    if (u.hostname === "epfr.gov.by")
      return /^\/(?:portal\/(?:organizations(?:\/|$)|(?:msfo-)?file\/\d+\/content$)|organizations(?:\/\d+)?\/?$|$)/.test(
        u.pathname,
      );
    if (u.hostname === "belarusbank.by")
      return u.pathname.startsWith("/o-banke/");
    return false;
  } catch {
    return false;
  }
}
export type WebResponse = { bytes: Uint8Array; contentType: string };
export type WebGet = (url: string) => Promise<WebResponse>;
export type PdfRead = (
  bytes: Uint8Array,
) => Promise<Pick<StockDocument, "pages" | "pageCount" | "truncated" | "ocr">>;

// Public GET only. Credentials and renderer-provided request headers are never accepted.
export const downloadStockSource: WebGet = async (url) => {
  if (!safeStockSourceUrl(url))
    throw new Error("Источник не поддерживается автоматическим загрузчиком");
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent": "InvestManager/0.6 public-research",
      Accept: "application/json,application/pdf,text/html,text/plain",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Источник вернул HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Пустой ответ источника");
  try {
    if (Number(response.headers.get("content-length")) > MAX_BYTES)
      throw new Error("Документ превышает 8 МБ");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) throw new Error("Документ превышает 8 МБ");
      chunks.push(value);
    }
    return {
      bytes: Buffer.concat(chunks),
      contentType: response.headers.get("content-type") ?? "",
    };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};
export const readStockPdf: PdfRead = (bytes) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, "stock-pdf.cjs"), {
      workerData: bytes,
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 384 },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (error?: Error, value?: Awaited<ReturnType<PdfRead>>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(
      () => finish(new Error("Извлечение текста заняло больше 60 секунд")),
      60000,
    );
    worker.once("message", (result) =>
      result.error
        ? finish(new Error(result.error))
        : finish(undefined, result),
    );
    worker.once("error", () => finish(new Error("Не удалось прочитать PDF")));
    worker.once("exit", () => {
      if (!settled) finish(new Error("Чтение PDF завершилось без результата"));
    });
  });

export class StockWebCollector {
  private cache = new Map<
    string,
    { at: number; value: Promise<WebResponse> }
  >();
  private pdfCache = new Map<string, Promise<StockDocument>>();
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(
    private fetcher: WebGet = downloadStockSource,
    private pdf: PdfRead = readStockPdf,
    private now = () => new Date(),
  ) {}
  private async get(url: string): Promise<WebResponse> {
    if (!safeStockSourceUrl(url))
      throw new Error("Неподдерживаемый адрес документа");
    const cached = this.cache.get(url);
    if (cached && this.now().getTime() - cached.at < 5 * 60000)
      return cached.value;
    const value = (async () => {
      if (this.active >= 2) await new Promise<void>((r) => this.queue.push(r));
      else this.active++;
      try {
        return await this.fetcher(url);
      } finally {
        const next = this.queue.shift();
        if (next) next();
        else this.active--;
      }
    })();
    this.cache.set(url, { at: this.now().getTime(), value });
    if (this.cache.size > 100)
      this.cache.delete(this.cache.keys().next().value!);
    void value.catch(() => {
      if (this.cache.get(url)?.value === value) this.cache.delete(url);
    });
    return value;
  }
  private async json(url: string): Promise<unknown> {
    const r = await this.get(url);
    try {
      return JSON.parse(new TextDecoder().decode(r.bytes));
    } catch {
      throw new Error("Источник вернул данные неизвестного формата");
    }
  }
  async readDocument(doc: StockDocument): Promise<StockDocument> {
    const key = `${doc.url}|${doc.uploadedAt}`;
    const existing = this.pdfCache.get(key);
    if (existing) return { ...doc, ...(await existing) };
    const pending = this.extractDocument(doc);
    this.pdfCache.set(key, pending);
    if (this.pdfCache.size > 80)
      this.pdfCache.delete(this.pdfCache.keys().next().value!);
    const read = await pending;
    if (read.state === "error") this.pdfCache.delete(key);
    return read;
  }
  private async extractDocument(doc: StockDocument): Promise<StockDocument> {
    try {
      let response = await this.get(doc.url);
      // EPFR REMOTE_URL records contain a URL, not the document itself.
      if (
        /text\/plain/.test(response.contentType) &&
        response.bytes.length < 2048
      ) {
        const link = new TextDecoder().decode(response.bytes).trim();
        if (/^https:\/\//.test(link)) {
          if (!safeStockSourceUrl(link))
            return { ...doc, state: "unsupported" };
          response = await this.get(link);
        }
      }
      if (
        new TextDecoder().decode(response.bytes.slice(0, 5)) !== "%PDF-" &&
        !(response.bytes[0] === 0x50 && response.bytes[1] === 0x4b)
      )
        return { ...doc, state: "unsupported" };
      const result = await this.pdf(response.bytes);
      return {
        ...doc,
        ...result,
        state: result.pages.some((p) => p.text.replace(/\s/g, "").length > 40)
          ? "text"
          : "scan",
      };
    } catch {
      return { ...doc, state: "error" };
    }
  }
  async collect(i: Instrument): Promise<StockWeb> {
    const checkedAt = this.now().toISOString(),
      unp = stockIssuerUnp(i);
    const old =
      i.stockAnalysis?.web?.identity?.unp === unp
        ? i.stockAnalysis.web
        : undefined;
    const result: StockWeb = {
      checkedAt,
      status: "ok",
      identity: old?.identity ?? null,
      sources: [],
      documents: old?.documents ?? [],
      dividends: old?.dividends ?? [],
      shareInfo: old?.shareInfo ?? null,
      issues: [],
    };
    if (
      unp === "100325912" &&
      old?.dividends.length &&
      belarusbankClass(i)?.label !== old.dividends[0].shareClass
    ) {
      result.dividends = [];
      result.shareInfo = null;
    }
    if (!unp)
      return {
        ...result,
        status: "unresolved",
        issues: [
          "Не найден УНП эмитента. Вставьте карточку Aigenis с issuer_unp или укажите УНП в настройке источника.",
        ],
      };
    const source = async <T>(
      name: string,
      url: string,
      run: () => Promise<T>,
    ): Promise<T | undefined> => {
      try {
        const value = await run();
        result.sources.push({
          name,
          url,
          checkedAt,
          ok: true,
          message: "Получено",
        });
        return value;
      } catch (e) {
        result.sources.push({
          name,
          url,
          checkedAt,
          ok: false,
          message: (e instanceof Error
            ? e.message
            : "Источник недоступен"
          ).slice(0, 500),
        });
        return undefined;
      }
    };
    const identity = await source(
      "ЕПФР · эмитент",
      `${EPFR}/organizations`,
      async () =>
        parseEpfrIdentity(
          await this.json(`${EPFR}/portal/organizations?search=${unp}`),
          unp,
        ),
    );
    if (identity) result.identity = identity;
    if (identity === null) {
      result.identity = null;
      result.documents = [];
      result.dividends = [];
      result.shareInfo = null;
      result.issues.push(
        "На ЕПФР нет однозначного совпадения по УНП. Чужие документы не подставлены.",
      );
    }
    const tasks: Promise<unknown>[] = [];
    if (result.identity) {
      const base = `${EPFR}/portal/organizations/${result.identity.id}`;
      const suffix = "sortField=realUploadDate&sortDir=desc";
      const listing = [
        { name: "Последние раскрытия", path: `files?${suffix}` },
        {
          name: "Периодическая отчётность",
          path: `files?information=1&${suffix}`,
        },
        {
          name: "Предыдущая отчётность",
          path: `files?information=1&pageNo=1&${suffix}`,
        },
        {
          name: "Дивиденды",
          path: `files?search=${encodeURIComponent("дивиденд")}&${suffix}`,
        },
        { name: "МСФО", path: "msfo_files", msfo: true },
      ];
      const found: StockDocument[] = [];
      tasks.push(
        Promise.all(
          listing.map((item) =>
            source(
              `ЕПФР · ${item.name}`,
              `${EPFR}/organizations/${result.identity!.id}`,
              async () => {
                found.push(
                  ...parseEpfrDocuments(
                    await this.json(`${base}/${item.path}`),
                    unp,
                    item.msfo,
                  ),
                );
              },
            ),
          ),
        ).then(() => {
          const byId = new Map(result.documents.map((d) => [d.id, d]));
          for (const doc of found) {
            const prior = byId.get(doc.id);
            // Keep previously extracted pages only when the publication metadata is unchanged.
            byId.set(
              doc.id,
              prior &&
                prior.uploadedAt === doc.uploadedAt &&
                prior.title === doc.title
                ? prior
                : doc,
            );
          }
          result.documents = [...byId.values()]
            .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
            .slice(0, 80);
        }),
      );
    }
    if (unp === "100325912")
      tasks.push(
        source("Беларусбанк · выплаты", BELARUSBANK_DIVIDENDS, async () => {
          const { bytes } = await this.get(BELARUSBANK_DIVIDENDS);
          const parsed = parseBelarusbankDividends(
            new TextDecoder().decode(bytes),
            i,
            this.now().getFullYear(),
          );
          result.dividends = parsed.dividends;
          result.shareInfo = parsed.shareInfo;
        }),
      );
    await Promise.all(tasks);
    // Also discover downloadable financial statements directly from the issuer's official archive.
    if (unp === "100325912") {
      const url =
        "https://belarusbank.by/o-banke/financial-reports/otchetnost-natsionalnye-standarty/finotchetnost-natsstandarty/info-ao/";
      await source("Беларусбанк · финансовый архив", url, async () => {
        const { bytes } = await this.get(url);
        for (const link of parseOfficialLinks(
          new TextDecoder().decode(bytes),
          url,
        )) {
          if (
            !safeStockSourceUrl(link.url) ||
            result.documents.some((d) => d.url === link.url)
          )
            continue;
          result.documents.push({
            id: `bank-${result.documents.filter((d) => d.id.startsWith("bank-")).length}`,
            title: link.title,
            url: link.url,
            uploadedAt: "",
            reportingDate: "",
            kind: "report",
            state: "unread",
            pages: [],
            pageCount: 0,
            truncated: false,
          });
        }
      });
    }
    const readable = result.documents.filter(
      (d) => d.state === "unread" || d.state === "error",
    );
    const firstReports: StockDocument[] = [];
    for (const pattern of [/бухгалтерский баланс/i, /прибылях и убытках/i]) {
      const match = readable.find(
        (d) => d.kind === "report" && pattern.test(d.title),
      );
      if (match) firstReports.push(match);
    }
    for (const d of readable.filter((d) => d.kind === "report")) {
      if (firstReports.length >= 2) break;
      if (!firstReports.some((r) => r.id === d.id)) firstReports.push(d);
    }
    const annualInformation = readable.find((d) =>
      /акционерн.*обществ.*деятельност/i.test(d.title),
    );
    if (
      annualInformation &&
      !firstReports.some((d) => d.id === annualInformation.id)
    )
      firstReports.push(annualInformation);
    const notes = readable.find(
      (d) => d.kind === "report" && /примечания к бухгалтерской/i.test(d.title),
    );
    if (notes && !firstReports.some((d) => d.id === notes.id))
      firstReports.push(notes);
    const firstDividends = readable
      .filter((d) => d.kind === "dividend")
      .slice(0, 2);
    // Read at most six new documents: balance, income, annual disclosure, notes and two dividend decisions.
    for (const doc of [...firstReports, ...firstDividends]) {
      const read = await this.readDocument(doc);
      result.documents[result.documents.findIndex((d) => d.id === doc.id)] =
        read;
    }
    result.documents = result.documents.slice(0, 80);
    result.announcements = parseDividendAnnouncements(result.documents, i);
    if (result.documents.some((d) => d.ocr))
      result.issues.push(
        "Для сканов выполнено локальное OCR. Распознанные числа нужно сверить с оригиналом, они не участвуют в автоматических расчётах.",
      );
    if (result.documents.some((d) => d.state === "scan"))
      result.issues.push(
        "Из некоторых сканов не удалось получить текст. Их можно просмотреть в оригинале.",
      );
    if (result.documents.some((d) => d.state === "error"))
      result.issues.push(
        "Часть документов не удалось прочитать. Ссылки сохранены, загрузку можно повторить.",
      );
    if (!result.dividends.length)
      result.issues.push(
        "Автоматически подтверждённой выплаты для этого выпуска пока нет. Найденные решения о дивидендах доступны в документах.",
      );
    if (!result.documents.some((d) => d.kind === "report"))
      result.issues.push(
        "Финансовая отчётность не найдена в проверенных разделах. Это не означает, что у компании нет отчётности.",
      );
    const successful = result.sources.filter((s) => s.ok).length;
    result.status = !successful
      ? "error"
      : result.sources.some((s) => !s.ok) ||
          result.documents.some((d) => d.state === "error")
        ? "partial"
        : result.identity || result.dividends.length
          ? "ok"
          : "unresolved";
    return stockWebSchema.parse(result);
  }
}
