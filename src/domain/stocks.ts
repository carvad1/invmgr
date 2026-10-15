import {
  currencies,
  emptyInstrument,
  today,
  type Instrument,
  type Quote,
} from "./types";
import {
  emptyStockAnalysis,
  stockAnalysisSchema,
  type StockAnalysis,
  type StockMarket,
  type StockReport,
  type StockValuation,
} from "./stock-schema";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, max = 1000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const positive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1e12 ? v : null;
const id = (v: unknown) =>
  typeof v === "number" || typeof v === "string" ? String(v).slice(0, 100) : "";
export interface ImportedStock {
  name: string;
  market: StockMarket;
}

/** Only explicit equity products are accepted. API quantity/nominal are not shares outstanding/price. */
export function parseTerminalStocks(raw: string): ImportedStock[] {
  if (raw.length > 2_000_000)
    throw new Error("Ответ слишком большой (максимум 2 МБ)");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Вставьте JSON ответа, без HTTP-заголовков");
  }
  const root = obj(data);
  const list = Array.isArray(data)
    ? data
    : Array.isArray(root.results)
      ? root.results
      : [root];
  const result = new Map<string, ImportedStock>();
  for (const value of list) {
    const row = obj(value),
      nested = obj(row.definition);
    const d = Object.keys(nested).length ? nested : row;
    if (!["stock", "share", "equity"].includes(text(d.product))) continue;
    if (!currencies.includes(d.currency as never)) continue;
    const currency = d.currency as StockMarket["currency"];
    const symbol =
      text(d.security_symbol, 100) ||
      text(d.state_security_id, 100) ||
      id(d.id);
    if (!symbol) continue;
    const session = text(row.trading_session_id, 100);
    // REPO is financing, not a normal purchase. Unknown currency conversions are not inferred.
    const spot =
      !/REPO/i.test(session) &&
      (!row.settl_currency || row.settl_currency === currency);
    const issuer = obj(d.issuer);
    const key = `${text(d.exchange, 100) || "Aigenis"}:${symbol}:${currency}`;
    const market: StockMarket = {
      key,
      definitionId: id(d.id),
      securityIds:
        spot && Object.keys(nested).length && row.id !== undefined
          ? [id(row.id)]
          : [],
      ticker: symbol,
      issuer: text(issuer.full_name),
      exchange: text(d.exchange, 100),
      session,
      currency,
      ask: spot ? (positive(row.best_offer) ?? positive(d.best_offer)) : null,
      bid: spot ? (positive(row.best_bid) ?? positive(d.best_bid)) : null,
      last: positive(d.last_deal_price),
      lastDate: "",
      capturedAt: new Date().toISOString(),
      rating:
        text(obj(d.rating_level).level_name, 300) ||
        text(obj(issuer.rating_level).level_name, 300),
      warning: text(obj(issuer.issuer_group_data).message, 5000),
      lot: positive(row.round_lot),
      details: (
        [
          ["ISIN", row.isin],
          ["CFI", row.cfi],
          ["FISN", row.fisn],
          ["Символ режима торгов", row.symbol],
          ["Госрегистрация", d.state_security_id],
          ["Номинал (не цена)", d.nominal],
          ["Шаг цены", d.min_price_increment],
          ["УНП эмитента", d.issuer_unp],
          ["Код страны эмитента", d.issuer_country],
          ["Доступна физлицам", d.available_for_individuals],
          ["Доступна юрлицам", d.available_for_legal_entities],
          ["Валюта расчётов", row.settl_currency],
          ["Валюта соглашения", row.agreement_currency],
          ["Код статуса торгов", row.trading_status],
          ["Время обновления статуса", row.trading_status_updated_at],
          ["Период неактивности", row.inactivity_period],
        ] as [string, unknown][]
      ).flatMap(([label, value]) => {
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        )
          return [];
        const s =
          typeof value === "boolean"
            ? value
              ? "Да"
              : "Нет"
            : String(value).trim();
        return s ? [{ label, value: s.slice(0, 1000) }] : [];
      }),
    };
    const item = {
      name:
        text(row.name_of_security, 200) || text(d.parent_symbol, 200) || symbol,
      market,
    };
    const old = result.get(key);
    const securityIds = [
      ...new Set([
        ...(old?.market.securityIds ?? []),
        ...(market.securityIds ?? []),
      ]),
    ];
    if (
      !old ||
      (market.ask !== null && old.market.ask === null) ||
      (session === "NDA" &&
        old.market.session !== "NDA" &&
        (market.ask !== null || old.market.ask === null))
    )
      result.set(key, item);
    result.get(key)!.market.securityIds = securityIds;
  }
  if (!result.size)
    throw new Error(
      "Акции не найдены. Нужен ответ security_definition с product: stock, share или equity. Пришлите обезличенный пример, если формат другой.",
    );
  if (result.size > 100) throw new Error("Вставляйте до 100 акций за один раз");
  return [...result.values()];
}
export function importedStockInstrument(
  row: ImportedStock,
  old?: Instrument,
): Instrument {
  const base = old ?? {
    ...emptyInstrument(),
    kind: "stock" as const,
    provider: "Aigenis",
    frequency: 0 as const,
  };
  return {
    ...base,
    name: row.name,
    ticker: row.market.ticker,
    currency: row.market.currency,
    sourceUrl: base.sourceUrl || "https://web.aigenis.by/",
    stockAnalysis: {
      ...(base.stockAnalysis ?? emptyStockAnalysis()),
      market: {
        ...row.market,
        securityIds: [
          ...new Set([
            ...(base.stockAnalysis?.market?.definitionId ===
            row.market.definitionId
              ? (base.stockAnalysis.market.securityIds ?? [])
              : []),
            ...(row.market.securityIds ?? []),
          ]),
        ],
      },
    },
  };
}
export function stockPrice(i: Instrument, quotes: Quote[] = []) {
  const m = i.stockAnalysis?.market;
  if (m && m.currency === i.currency) {
    if (m.ask !== null)
      return {
        value: m.ask,
        label: "Предложение из снимка Aigenis",
        date: "",
        indicative: false,
      };
    if (m.last !== null)
      return {
        value: m.last,
        label: "Последняя сделка · ориентир",
        date: m.lastDate,
        indicative: true,
      };
  }
  const q = quotes
    .filter((q) => q.instrumentId === i.id && q.date <= today())
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    value: q?.price ?? null,
    label: q ? "Сохранённая котировка · ориентир" : "Цена отсутствует",
    date: q?.date ?? "",
    indicative: true,
  };
}
export function latestStockReport(i: Instrument): StockReport | null {
  const reports = i.stockAnalysis?.reports
    .filter((r) => r.currency === i.currency && r.date <= today())
    .sort((a, b) => b.date.localeCompare(a.date));
  if (reports?.length) return reports[0];
  // Legacy annual fields are displayed in the asset editor, not silently treated as a verified 12-month report.
  return null;
}
const ratio = (a: number | null, b: number | null) =>
  a !== null && b !== null && b > 0 ? a / b : null;
const diff = (a: number | null, b: number | null) =>
  a !== null && b !== null ? a - b : null;
export function stockMetrics(report: StockReport | null, price: number | null) {
  const r = report;
  const eps = r?.eps ?? ratio(r?.netIncome ?? null, r?.shares ?? null);
  const bv = r?.bookValue ?? ratio(r?.equity ?? null, r?.shares ?? null);
  const cap = price !== null && r?.shares ? price * r.shares : null;
  const netDebt = diff(r?.debt ?? null, r?.cash ?? null);
  const ev = cap !== null && netDebt !== null ? cap + netDebt : null;
  const fcf = diff(r?.operatingCashFlow ?? null, r?.capex ?? null);
  return {
    eps,
    cap,
    netDebt,
    ev,
    fcf,
    pe: ratio(price, eps),
    pb: ratio(price, bv),
    evEbitda: ev !== null && ev > 0 ? ratio(ev, r?.ebitda ?? null) : null,
    dividendYield: ratio(r?.dividend ?? null, price),
    payout: ratio(r?.dividend ?? null, eps),
    roe: ratio(r?.netIncome ?? null, r?.equity ?? null),
    margin: ratio(r?.netIncome ?? null, r?.revenue ?? null),
    debtEquity: ratio(r?.debt ?? null, r?.equity ?? null),
    netDebtEbitda: ratio(netDebt, r?.ebitda ?? null),
    cashConversion: ratio(r?.operatingCashFlow ?? null, r?.netIncome ?? null),
    earningsYield: ratio(eps, price),
    fcfYield: ratio(fcf, cap),
  };
}
export function stockQuality(r: StockReport | null, previous?: StockReport) {
  const m = stockMetrics(r, null);
  const annualGap =
    r && previous
      ? (Date.parse(r.date) - Date.parse(previous.date)) / 86400000
      : 0;
  const comparable =
    annualGap >= 350 && annualGap <= 380 && previous?.currency === r?.currency;
  const growth =
    comparable && r && previous
      ? ratio(diff(r.revenue, previous.revenue), previous.revenue)
      : null;
  return [
    {
      label: "Рентабельность капитала",
      value: m.roe,
      pass: m.roe === null ? null : m.roe >= 0.15,
      rule: "ROE ≥ 15%. Прибыль за 12 месяцев / капитал на конец периода; приближённый показатель.",
    },
    {
      label: "Долговая нагрузка",
      value: m.debtEquity,
      pass: m.debtEquity === null ? null : m.debtEquity <= 1,
      rule: "Долг / собственный капитал ≤ 1. Для банков этот порог неприменим.",
    },
    {
      label: "Прибыль подтверждена деньгами",
      value: m.cashConversion,
      pass: m.cashConversion === null ? null : m.cashConversion >= 1,
      rule: "Операционный денежный поток / положительная чистая прибыль ≥ 1.",
    },
    {
      label: "Поток после инвестиций",
      value: m.fcf,
      pass: m.fcf === null ? null : m.fcf > 0,
      rule: "Операционный денежный поток − капитальные затраты > 0. Это не автоматически FCFE.",
    },
    {
      label: "Рост бизнеса",
      value: growth,
      pass: growth === null ? null : growth > 0,
      rule: "Рост выручки по двум сопоставимым 12-месячным отчётам с разницей в год.",
    },
  ];
}
/** Two-stage equity valuation, per share: discount FCFE/dividends at cost of equity (not WACC). */
export function equityValue(v: StockValuation) {
  if (
    !v.cashFlow ||
    !Number.isFinite(v.cashFlow) ||
    v.cashFlow <= 0 ||
    ![v.growth, v.discount, v.terminalGrowth, v.years].every(Number.isFinite) ||
    v.discount <= v.terminalGrowth ||
    v.discount <= 0 ||
    v.terminalGrowth <= -100 ||
    v.growth <= -100 ||
    !Number.isInteger(v.years) ||
    v.years < 1 ||
    v.years > 10
  )
    return null;
  const g = v.growth / 100,
    r = v.discount / 100,
    t = v.terminalGrowth / 100;
  const flows = Array.from({ length: v.years }, (_, n) => ({
    year: n + 1,
    flow: v.cashFlow! * (1 + g) ** (n + 1),
  }));
  const presentFlows = flows.reduce(
    (s, f) => s + f.flow / (1 + r) ** f.year,
    0,
  );
  const terminal =
    (flows.at(-1)!.flow * (1 + t)) / (r - t) / (1 + r) ** v.years;
  const value = presentFlows + terminal;
  return Number.isFinite(value) && value > 0
    ? { value, terminalShare: terminal / value, flows }
    : null;
}
export function impliedGrowth(v: StockValuation, price: number | null) {
  if (!price || !equityValue(v)) return null;
  let low = -90,
    high = 100;
  const at = (growth: number) => equityValue({ ...v, growth })?.value ?? NaN;
  if (price < at(low) || price > at(high)) return null;
  for (let n = 0; n < 80; n++) {
    const mid = (low + high) / 2;
    if (at(mid) < price) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
export function stockTechnicals(history: StockAnalysis["history"]) {
  const rows = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const prices = rows.map((r) => r.close);
  const sma = (n: number) =>
    prices.length < n ? null : prices.slice(-n).reduce((a, b) => a + b, 0) / n;
  let peak = 0,
    drawdown = 0,
    gain = 0,
    loss = 0,
    rsi: number | null = null;
  prices.forEach((p, n) => {
    peak = Math.max(peak, p);
    drawdown = Math.min(drawdown, p / peak - 1);
    if (!n) return;
    const delta = p - prices[n - 1];
    if (n <= 14) {
      gain += Math.max(delta, 0) / 14;
      loss += Math.max(-delta, 0) / 14;
    } else {
      gain = (gain * 13 + Math.max(delta, 0)) / 14;
      loss = (loss * 13 + Math.max(-delta, 0)) / 14;
    }
    if (n >= 14)
      rsi =
        gain === 0 && loss === 0
          ? 50
          : loss === 0
            ? 100
            : 100 - 100 / (1 + gain / loss);
  });
  return {
    sma50: sma(50),
    sma200: sma(200),
    rsi,
    drawdown: prices.length >= 2 ? drawdown : null,
    change: prices.length >= 2 ? prices.at(-1)! / prices[0] - 1 : null,
    first: rows[0]?.date ?? "",
    last: rows.at(-1)?.date ?? "",
  };
}
export function parseStockHistory(raw: string): StockAnalysis["history"] {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length > 5001) throw new Error("Максимум 5000 котировок");
  const rows = lines.flatMap((line, n) => {
    if (n === 0 && /^date[,;\t]/i.test(line)) return [];
    const [date, value, ...rest] = line.trim().split(/[,;\t]/);
    if (rest.length || !date || !value)
      throw new Error(`Строка ${n + 1}: нужен формат YYYY-MM-DD;123.45`);
    return [{ date: date.trim(), close: Number(value.trim()) }];
  });
  if (!rows.length) throw new Error("Добавьте хотя бы одну котировку");
  return stockAnalysisSchema.shape.history
    .parse(rows)
    .sort((a, b) => a.date.localeCompare(b.date));
}
