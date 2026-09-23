import { load } from "cheerio";
import { createHash } from "node:crypto";
import type { CatalogItem, Currency, FxRate } from "../src/domain/types";
import { Store } from "./store";
import { today } from "../src/domain/types";
import { shiftDate } from "../src/domain/deposit";
import { blankResearch } from "../src/domain/research";
import {
  parseAigenisBonds,
  parseFinstoreIssue,
  publishedRating,
} from "./research-source";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const number = (s: string) => {
  const m = s
    .replace(/\s/g, "")
    .replace(",", ".")
    .match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const stableId = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 24);
const isoDate = (s: string) => {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
export const safeSourceUrl = (url: string) => {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        "finstore.by",
        "app.finstore.by",
        "aigenis.by",
        "web.aigenis.by",
        "www.nbrb.by",
        "api.nbrb.by",
      ].includes(u.hostname)
    );
  } catch {
    return false;
  }
};
export async function download(url: string) {
  if (!safeSourceUrl(url)) throw new Error("Источник не разрешён");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    redirect: "error",
    headers: {
      "User-Agent": "InvestManager/0.1 (personal portfolio research)",
      Accept: "text/html,application/json",
    },
  });
  if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3_000_000) throw new Error("Ответ источника слишком большой");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function parseFinstore(
  html: string,
  fetchedAt = new Date().toISOString(),
): CatalogItem[] {
  const $ = load(html);
  const items: CatalogItem[] = [];
  $(".tokens-grid__el").each((_, el) => {
    const card = $(el);
    const text = clean(card.text());
    const name = clean(card.find(".tokens-el__title-text").first().text());
    const priceMatch = text.match(/Цена\s*([\d., ]+)\s*(BYN|USD|EUR|RUB)/);
    const link = card
      .find("a")
      .filter((_, a) => $(a).text().includes("Подробнее"))
      .attr("href");
    if (!name || !priceMatch || !link) return;
    const url = new URL(link, "https://finstore.by").href;
    if (!safeSourceUrl(url)) return;
    const status = clean(card.find(".tokens-el__status").text());
    const research = blankResearch(
      new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "",
      name,
      fetchedAt,
    );
    research.rateKnown = number(card.find(".tokens-el__rate").text()) !== null;
    research.nominalKnown = true;
    research.rating = publishedRating(status, url);
    if (/обеспеч|поручительств|банковск.+гаранти/i.test(status))
      research.security = status;
    research.caveats = [
      "Стоимость размещения использована как номинал; сверьте White Paper.",
    ];
    items.push({
      id: stableId(`finstore:${url}:${priceMatch[2]}`),
      provider: "Finstore",
      name,
      kind: "token",
      currency: priceMatch[2] as Currency,
      price: number(priceMatch[1]),
      rate: number(card.find(".tokens-el__rate").text()),
      termMonths: number(text.match(/Срок\s*(\d+)/)?.[1] ?? ""),
      maturity: "",
      sourceUrl: url,
      fetchedAt,
      details:
        clean(card.find(".tokens-el__status").text()) ||
        "Условия выпуска и отчётность проверьте в карточке эмитента. Срок выпуска не равен оставшемуся сроку.",
      priceLabel: "Цена размещения",
      priceDate: "",
      research,
    });
  });
  return [...new Map(items.map((i) => [i.id, i])).values()];
}
export function parseAigenis(
  html: string,
  fetchedAt = new Date().toISOString(),
): CatalogItem[] {
  const $ = load(html);
  const items: CatalogItem[] = [];
  $(".paper-card").each((_, el) => {
    const card = $(el);
    const name = clean(card.find("h4").text());
    const first = clean(card.find(".base-price-currency").first().text());
    const currency = first.match(/BYN|USD|EUR|RUB/)?.[0] as
      Currency | undefined;
    if (!name || !currency) return;
    const marketLabel = card
      .find(".base-price-header")
      .filter((_, x) => $(x).text().includes("Рыночная стоимость"))
      .first();
    const rateLabel = card
      .find(".base-price-header")
      .filter((_, x) => $(x).text().includes("Ставка дохода"))
      .first();
    const stock = card.hasClass("wp-block-aigenis-slide-stocks");
    const maturity = isoDate(card.find(".bounds-date").first().text());
    items.push({
      id: stableId(`aigenis:${name}`),
      provider: "Aigenis",
      name,
      kind: stock ? "stock" : "bond",
      currency,
      price: number(marketLabel.length ? marketLabel.next().text() : first),
      rate: rateLabel.length ? number(rateLabel.next().text()) : null,
      termMonths: null,
      maturity,
      sourceUrl: "https://aigenis.by/",
      fetchedAt,
      details: clean(
        card
          .find(".body p,.footer p")
          .map((_, el) => clean($(el).text()))
          .get()
          .join(" "),
      ),
      priceLabel: marketLabel.length
        ? "Рыночная цена с сайта"
        : "Номинал, не рыночная цена",
      priceDate: stock ? isoDate(card.find(".footer").text()) : "",
    });
  });
  return [...new Map(items.map((i) => [i.id, i])).values()];
}
export function parseNbrb(raw: string): FxRate[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Неожиданный формат НБРБ");
  const rates = data
    .filter((r) => ["USD", "EUR", "RUB"].includes(r.Cur_Abbreviation))
    .map((r) => {
      if (
        typeof r.Cur_OfficialRate !== "number" ||
        typeof r.Cur_Scale !== "number" ||
        r.Cur_OfficialRate <= 0 ||
        r.Cur_Scale <= 0 ||
        typeof r.Date !== "string"
      )
        throw new Error("Некорректные значения НБРБ");
      return {
        currency: r.Cur_Abbreviation as Currency,
        date: r.Date.slice(0, 10),
        rate: r.Cur_OfficialRate / r.Cur_Scale,
        source: "НБРБ · официальный курс",
      };
    });
  if (rates.length !== 3) throw new Error("НБРБ не вернул все валюты");
  return rates;
}
export async function inspectSource(
  url: string,
  fetcher = download,
): Promise<CatalogItem[]> {
  if (typeof url !== "string" || url.length > 2000 || !safeSourceUrl(url))
    throw new Error(
      "Вставьте https-ссылку на открытый выпуск Finstore или Aigenis.",
    );
  const u = new URL(url);
  let parser: (html: string) => CatalogItem[];
  if (
    u.hostname === "finstore.by" &&
    /^\/kupit-tokeny\/\d+\/?$/.test(u.pathname)
  ) {
    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace(/\/$/, "");
    parser = (html) => parseFinstoreIssue(html, u.href);
  } else if (
    u.hostname === "finstore.by" &&
    /^\/kupit-tokeny\/?$/.test(u.pathname)
  )
    parser = parseFinstore;
  else if (u.hostname === "aigenis.by" && /^\/bonds\/?$/.test(u.pathname))
    parser = parseAigenisBonds;
  else if (u.hostname === "aigenis.by" && u.pathname === "/")
    parser = parseAigenis;
  else
    throw new Error(
      "Поддерживаются открытые страницы finstore.by/kupit-tokeny/… и aigenis.by/bonds/. Выпуск из личного кабинета добавьте вручную.",
    );
  const selectedIssue = u.hash ? decodeURIComponent(u.hash.slice(1)) : "";
  u.hash = "";
  const items = parser(await fetcher(u.href));
  if (!items.length)
    throw new Error(
      "Условия не распознаны. Возможно, страница изменилась или недоступна. Данные не были заменены.",
    );
  if (selectedIssue && items.some((i) => i.research?.issueId === selectedIssue))
    return items.filter((i) => i.research?.issueId === selectedIssue);
  return items;
}
export function parseRefinancing(raw: string) {
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("НБРБ не вернул историю ставки");
  const rates = rows
    .map((row) => {
      if (
        !row ||
        typeof row.Date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(row.Date) ||
        !Number.isFinite(Date.parse(row.Date)) ||
        new Date(row.Date.slice(0, 10)).toISOString().slice(0, 10) !==
          row.Date.slice(0, 10) ||
        typeof row.Value !== "number" ||
        !Number.isFinite(row.Value) ||
        row.Value < 0 ||
        row.Value > 1000
      )
        throw new Error("Некорректная история ставки НБРБ");
      return { date: row.Date.slice(0, 10), rate: row.Value as number };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(rates.map((r) => r.date)).size !== rates.length)
    throw new Error("Повторяющиеся даты ставок НБРБ");
  return rates;
}
export async function syncDepositRates(
  store: Store,
  force = false,
  fetcher = download,
) {
  const date = today();
  const needed = store
    .load()
    .instruments.some(
      (i) =>
        i.kind === "deposit" &&
        i.autoAccrual !== false &&
        i.depositRate &&
        (force || i.depositRate.checkedOn !== date),
    );
  if (!needed) return;
  // Retry failed requests at most once an hour, while preserving the cached history.
  const last = store
    .load()
    .syncRuns.find((s) => s.provider === "НБРБ · ставка вклада");
  if (
    !force &&
    last?.status === "error" &&
    Date.now() - Date.parse(last.date) < 3600000
  )
    return;
  try {
    const rates = parseRefinancing(
      await fetcher("https://api.nbrb.by/refinancingrate"),
    );
    const state = store.load();
    for (const i of state.instruments) {
      if (i.kind !== "deposit" || i.autoAccrual === false || !i.depositRate)
        continue;
      const terms = i.depositRate;
      const first =
        state.operations
          .filter((o) => o.instrumentId === i.id && o.kind === "buy")
          .map((o) => o.date)
          .sort()[0] ?? date;
      const fullHistory = rates
        .filter((r) => r.date <= date)
        .map((r) => ({
          date: shiftDate(r.date, terms.lagDays),
          rate: Math.max(
            terms.floor,
            Number((r.rate + terms.spread).toFixed(8)),
          ),
        }));
      const initial = fullHistory.filter((r) => r.date <= first).at(-1);
      if (!initial)
        throw new Error("В истории НБРБ нет ставки на дату открытия вклада");
      const history = [initial, ...fullHistory.filter((r) => r.date > first)];
      const current = history.filter((r) => r.date <= date).at(-1)!;
      store.saveInstrument({
        ...i,
        annualRate: current.rate,
        depositRate: { ...terms, history, checkedOn: date },
      });
    }
    store.log({
      provider: "НБРБ · ставка вклада",
      date: new Date().toISOString(),
      status: "ok",
      message:
        "История ставок обновлена; проценты пересчитываются по датам изменений",
    });
  } catch (e) {
    store.log({
      provider: "НБРБ · ставка вклада",
      date: new Date().toISOString(),
      status: "error",
      message: e instanceof Error ? e.message : "Не удалось проверить ставку",
    });
  }
}
export async function syncSources(store: Store) {
  await Promise.allSettled(
    [
      {
        name: "Finstore",
        run: async () => {
          const items = parseFinstore(
            await download("https://finstore.by/kupit-tokeny/"),
          );
          store.saveCatalog("Finstore", items);
          return `${items.length} предложений из открытого каталога`;
        },
      },
      {
        name: "Aigenis",
        run: async () => {
          const [home, bonds] = await Promise.all([
            download("https://aigenis.by/"),
            download("https://aigenis.by/bonds/"),
          ]);
          const items = [...parseAigenis(home), ...parseAigenisBonds(bonds)];
          store.saveCatalog("Aigenis", items);
          return `${items.length} инструментов с открытой страницы`;
        },
      },
      {
        name: "НБРБ",
        run: async () => {
          const rates = parseNbrb(
            await download("https://api.nbrb.by/exrates/rates?periodicity=0"),
          );
          rates.forEach((r) => store.saveFx(r));
          return "Курсы USD, EUR, RUB обновлены";
        },
      },
    ].map(async (source) => {
      try {
        const message = await source.run();
        store.log({
          provider: source.name,
          date: new Date().toISOString(),
          status: "ok",
          message,
        });
      } catch (e) {
        store.log({
          provider: source.name,
          date: new Date().toISOString(),
          status: "error",
          message: e instanceof Error ? e.message : "Источник недоступен",
        });
      }
    }),
  );
  await syncDepositRates(store, true);
  return store.load();
}
