import { load } from "cheerio";
import { createHash } from "node:crypto";
import type { CatalogItem, Currency, Research } from "../src/domain/types";
import { blankResearch } from "../src/domain/research";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const num = (s: string) => {
  const m = s
    .replace(/\s/g, "")
    .replace(",", ".")
    .match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const date = (s: string) => {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return "";
  const d = `${m[3]}-${m[2]}-${m[1]}`;
  return !Number.isNaN(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d
    ? d
    : "";
};
const id = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 24);
export function publishedRating(
  text: string,
  sourceUrl: string,
): Research["rating"] {
  if (!/кредитн|репутаци|reputation/i.test(text)) return undefined;
  const match = text.match(
    /(?:рейтинг(?:ом)?(?:\s+деловой\s+репутации|\s+компании)?|репутация\s+компании)\s*[:—-]?\s*((?:by\.)?[A-DА-Г]{1,3}[+-]?(?:\s+reputation)?)/i,
  );
  if (!match) return undefined;
  return {
    value: match[1],
    kind: /репутаци|reputation/i.test(text) ? "reputation" : "credit",
    agency: "",
    date: "",
    sourceUrl,
  };
}
function frequency(s: string) {
  return /ежемесячно|раз в месяц/i.test(s)
    ? 12
    : /квартал/i.test(s)
      ? 4
      : /полугод|6 месяцев/i.test(s)
        ? 2
        : /ежегод|раз в год/i.test(s)
          ? 1
          : 0;
}

export function parseFinstoreIssue(
  html: string,
  sourceUrl: string,
  fetchedAt = new Date().toISOString(),
): CatalogItem[] {
  const $ = load(html);
  const name = clean($("h1.smart__title").text());
  const terms = new Map<string, string>();
  $(".token-information__it").each((_, el) => {
    const spans = $(el).children("span");
    terms.set(clean(spans.eq(0).text()), clean(spans.eq(1).text()));
  });
  const currency = terms.get("Валюта") as Currency;
  if (!name || !["BYN", "USD", "EUR", "RUB"].includes(currency)) return [];
  const rate = num($(".smart-percent").first().text());
  const price = num(terms.get("Стоимость") ?? "");
  const range = terms.get("Период обращения") ?? "";
  const dates = range.match(/\d{2}\.\d{2}\.\d{4}/g) ?? [];
  const research = blankResearch(
    new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? "",
    name,
    fetchedAt,
  );
  research.rateKnown = rate !== null;
  research.nominalKnown = price !== null;
  research.caveats = [
    "Стоимость размещения использована как номинал для сценария. Сверьте её с White Paper.",
    "Точный график сумм выплат и финансовая отчётность автоматически не извлечены.",
  ];
  research.maturityText = range;
  $(".smart .white-paper[href]").each((_, el) => {
    const url = new URL($(el).attr("href")!, sourceUrl);
    if (url.protocol === "https:" && url.hostname === "finstore.by")
      research.documents.push({ title: "White Paper выпуска", url: url.href });
  });
  // Related offers are isolated: never borrow another issuer's rating or guarantee.
  $(".tokens-grid__el").each((_, el) => {
    const card = $(el);
    const matches = card
      .find("a[href]")
      .toArray()
      .some(
        (a) =>
          new URL($(a).attr("href")!, sourceUrl).pathname.replace(/\/$/, "") ===
          new URL(sourceUrl).pathname.replace(/\/$/, ""),
      );
    if (!matches) return;
    const status = clean(card.find(".tokens-el__status").text());
    research.rating = publishedRating(status, sourceUrl);
    if (/обеспеч|поручительств|банковск.+гаранти/i.test(status))
      research.security = status;
  });
  return [
    {
      id: id(`finstore:${sourceUrl}:${currency}`),
      provider: "Finstore",
      name,
      kind: "token",
      currency,
      price,
      nominal: price,
      rate,
      frequency: frequency(terms.get("Периодичность выплат") ?? ""),
      termMonths: num(terms.get("Срок") ?? ""),
      maturity: dates[1] ? date(dates[1]) : "",
      sourceUrl,
      fetchedAt,
      details: [
        terms.get("Периодичность выплат"),
        terms.get("Досрочное погашение")
          ? `Досрочное погашение по карточке: ${terms.get("Досрочное погашение")}. Условия уточните в White Paper.`
          : "",
      ]
        .filter(Boolean)
        .join(". "),
      priceLabel: "Стоимость размещения",
      priceDate: "",
      research,
    },
  ];
}

export function parseAigenisBonds(
  html: string,
  fetchedAt = new Date().toISOString(),
): CatalogItem[] {
  const $ = load(html);
  const items: CatalogItem[] = [];
  $(".wp-block-aigenis-bounds").each((_, el) => {
    const card = $(el);
    const issue = card.attr("data-code") ?? "";
    const reg = card.attr("data-reg") ?? "";
    const faceText = clean(
      card
        .find("h5")
        .filter((_, e) => clean($(e).text()) === "Номинал")
        .first()
        .next()
        .text(),
    );
    const currency = faceText.match(/BYN|USD|EUR|RUB/)?.[0] as Currency;
    const nominal = num(faceText);
    if (!issue || !reg || !currency || !nominal) return;
    const schedule = clean(
      card
        .find("h4")
        .filter((_, e) => clean($(e).text()) === "График выплаты")
        .first()
        .next()
        .text(),
    );
    const rateMatch = schedule.match(/([\d.,]+)\s*%\s*годовых/i);
    const rate = rateMatch ? num(rateMatch[1]) : null;
    const text = clean(card.find(".bounds-footer").text());
    const linkedCurrency = card.attr("data-curency") ?? currency;
    const indexed =
      /переменн|индексир|влияющ|золот|серебр|платин/i.test(text + schedule) ||
      linkedCurrency !== currency;
    const research = blankResearch(reg, "ЗАО «Айгенис»", fetchedAt);
    research.nominalKnown = true;
    research.rateKnown = rate !== null;
    research.rateModel = indexed ? "indexed" : "unknown";
    research.maturityText = card.attr("data-vterm") ?? "";
    research.caveats = [
      "На сайте указан номинал. Для доходности по вашей покупке нужна полная цена с НКД и комиссией.",
      "Месяц погашения не заменяет точную дату из проспекта. Даты купонов не подтверждают дату возврата номинала.",
    ];
    if (indexed)
      research.caveats.unshift(
        `Индексируемый или переменный доход (${linkedCurrency}); номинал и расчётная валюта — ${currency}. Простой прогноз отключён: нужна формула из проспекта.`,
      );
    const yearHtml = card.find(".bounds-years").html() ?? "";
    for (const m of yearHtml.matchAll(/(20\d{2})\s*<sub>\(([^)]+)\)<\/sub>/g)) {
      for (const d of m[2].matchAll(/(\d{2})\.(\d{2})/g)) {
        const iso = date(`${d[1]}.${d[2]}.${m[1]}`);
        if (iso) research.paymentDates.push(iso);
      }
    }
    research.paymentDates = [...new Set(research.paymentDates)].sort();
    card.find(".bounds-footer a[href]").each((_, a) => {
      const url = new URL($(a).attr("href")!, "https://aigenis.by");
      if (
        url.hostname === "aigenis.by" &&
        url.protocol === "https:" &&
        /\.pdf$/i.test(url.pathname)
      )
        research.documents.push({ title: clean($(a).text()), url: url.href });
    });
    items.push({
      id: id(`aigenis:${reg}`),
      provider: "Aigenis",
      name: `Айгенис · ${issue}`,
      kind: "bond",
      currency,
      price: nominal,
      nominal,
      rate,
      frequency: frequency(schedule),
      termMonths: null,
      maturity: "",
      sourceUrl: `https://aigenis.by/bonds/#${encodeURIComponent(reg)}`,
      fetchedAt,
      details: `${schedule}. Погашение: ${research.maturityText}. ${indexed ? `Индексация: ${linkedCurrency}.` : ""}`,
      priceLabel: "Номинал, не рыночная цена",
      priceDate: "",
      research,
    });
  });
  return items;
}
